//! Linear and RNG codebooks, multi-threaded nearest-neighbor search, and spread stats.
//!
//! Bit-exact mirror of `src/llmw_codebook/codebook.py` stored in bit-packed
//! `BitWord256` words for 4x lower memory and hardware popcount/Myers speed.

use crate::distances::{BitWord256, MyersPattern};
use crate::prng::{sha256_seed64, SplitMix64};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DistanceMetric {
    Hamming,
    Levenshtein,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConstructionKind {
    Linear,
    Rng,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CodebookGeometry {
    pub histogram: Vec<u32>,
    pub min_from_w: u32,
    pub max_from_w: u32,
    pub mean_from_w: f64,
    pub nn_min: u32,
    pub nn_max: u32,
    pub nn_zero_spread: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CodebookMatch {
    pub watermark: u32,
    pub distance: u32,
    pub second_best_distance: Option<u32>,
    pub codeword: Vec<u8>,
}

/// Derive generator matrix `G` (row-major `n x u` bits) and offset `r` (`u` bits).
pub fn derive_linear_params(secret_key: &[u8], n: usize, u: usize) -> (Vec<u8>, Vec<u8>) {
    assert!(n >= 1 && u > n, "Require 1 <= n < u, got n={n}, u={u}");
    let mut g_in = Vec::with_capacity(secret_key.len() + 8);
    g_in.extend_from_slice(secret_key);
    g_in.extend_from_slice(b"linear-G");

    let mut r_in = Vec::with_capacity(secret_key.len() + 8);
    r_in.extend_from_slice(secret_key);
    r_in.extend_from_slice(b"linear-r");

    let seed_g = sha256_seed64(&g_in);
    let seed_r = sha256_seed64(&r_in);

    let g_mat = SplitMix64::new(seed_g).next_bits(n * u);
    let r_vec = SplitMix64::new(seed_r).next_bits(u);
    (g_mat, r_vec)
}

/// Binary entropy H_2(p).
pub fn binary_entropy(p: f64) -> f64 {
    if p <= 0.0 || p >= 1.0 {
        return 0.0;
    }
    -p * p.log2() - (1.0 - p) * (1.0 - p).log2()
}

/// Gilbert-Varshamov minimum distance d_GV satisfying H_2(d/u) <= 1 - n/u.
pub fn gilbert_varshamov_distance(n: usize, u: usize) -> usize {
    if n >= u {
        return 1;
    }
    let target_rate = 1.0 - (n as f64) / (u as f64);
    let mut best_d = 1;
    for d in 1..=(u / 2) {
        if binary_entropy((d as f64) / (u as f64)) <= target_rate {
            best_d = d;
        } else {
            break;
        }
    }
    best_d
}

/// Bit-packed codebook storing 2^n codewords up to length u <= 256.
pub struct PackedCodebook {
    pub n: usize,
    pub u: usize,
    pub construction: ConstructionKind,
    pub words: Vec<BitWord256>,
    pub ones_counts: Vec<u16>,
    g_packed: Vec<BitWord256>,
    r_packed: BitWord256,
}

impl PackedCodebook {
    pub fn build(secret_key: &[u8], n: usize, u: usize, construction: ConstructionKind) -> Self {
        assert!(n >= 1 && n <= 24, "Supported n in 1..=24, got {n}");
        assert!(u > n && u <= 256, "Supported n < u <= 256, got u={u}");
        let count = 1usize << n;
        let mut words = Vec::with_capacity(count);
        let mut ones_counts = Vec::with_capacity(count);

        match construction {
            ConstructionKind::Linear => {
                let (g_bits, r_bits) = derive_linear_params(secret_key, n, u);
                let g_packed: Vec<BitWord256> =
                    (0..n).map(|row| BitWord256::from_bits(&g_bits[row * u..(row + 1) * u])).collect();
                let r_packed = BitWord256::from_bits(&r_bits);

                for w in 0..count {
                    let mut acc = r_packed;
                    for bit in 0..n {
                        if ((w >> (n - 1 - bit)) & 1) != 0 {
                            acc = acc.xor(g_packed[bit]);
                        }
                    }
                    ones_counts.push(acc.popcount() as u16);
                    words.push(acc);
                }

                Self {
                    n,
                    u,
                    construction,
                    words,
                    ones_counts,
                    g_packed,
                    r_packed,
                }
            }
            ConstructionKind::Rng => {
                for w in 0..count {
                    let s = w.to_string();
                    let mut buf = Vec::with_capacity(secret_key.len() + s.len());
                    buf.extend_from_slice(secret_key);
                    buf.extend_from_slice(s.as_bytes());
                    let seed_i = sha256_seed64(&buf);
                    let bits = SplitMix64::new(seed_i).next_bits(u);
                    let packed = BitWord256::from_bits(&bits);
                    ones_counts.push(packed.popcount() as u16);
                    words.push(packed);
                }
                Self {
                    n,
                    u,
                    construction,
                    words,
                    ones_counts,
                    g_packed: Vec::new(),
                    r_packed: BitWord256::default(),
                }
            }
        }
    }

    /// Encode a single watermark without reading the materialized table.
    pub fn encode_linear(secret_key: &[u8], n: usize, u: usize, watermark: u32) -> Vec<u8> {
        let (g_bits, r_bits) = derive_linear_params(secret_key, n, u);
        let mut out = r_bits;
        for bit in 0..n {
            if ((watermark >> (n - 1 - bit)) & 1) != 0 {
                let row = &g_bits[bit * u..(bit + 1) * u];
                for pos in 0..u {
                    out[pos] ^= row[pos];
                }
            }
        }
        out
    }

    /// Single-threaded nearest-neighbor search (safe for WASM & small codebooks).
    pub fn search(&self, candidate: &[u8], metric: DistanceMetric) -> CodebookMatch {
        self.search_slice(0, self.words.len(), candidate, metric)
    }

    fn search_slice(
        &self,
        start: usize,
        end: usize,
        candidate: &[u8],
        metric: DistanceMetric,
    ) -> CodebookMatch {
        let cand_packed = BitWord256::from_bits(candidate);
        match metric {
            DistanceMetric::Hamming => {
                assert_eq!(candidate.len(), self.u, "Hamming requires candidate len == u");
                let mut best_idx = start;
                let mut best_dist = u32::MAX;
                let mut second_dist = u32::MAX;
                for idx in start..end {
                    let d = cand_packed.hamming(self.words[idx]);
                    if d < best_dist {
                        second_dist = best_dist;
                        best_dist = d;
                        best_idx = idx;
                    } else if d < second_dist {
                        second_dist = d;
                    }
                }
                CodebookMatch {
                    watermark: best_idx as u32,
                    distance: best_dist,
                    second_best_distance: if end - start > 1 { Some(second_dist) } else { None },
                    codeword: self.words[best_idx].to_bits(self.u),
                }
            }
            DistanceMetric::Levenshtein => {
                let pattern = MyersPattern::new(candidate);
                let cand_len = candidate.len() as i32;
                let cand_ones = candidate.iter().filter(|&&b| (b & 1) != 0).count() as i32;
                let cand_zeros = cand_len - cand_ones;
                let u_i32 = self.u as i32;

                let mut best_idx = start;
                let mut best_dist = u32::MAX;
                let mut second_dist = u32::MAX;

                // Seed upper bound from first element + Hamming-closest guess if equal length.
                for idx in start..end {
                    let row_ones = self.ones_counts[idx] as i32;
                    let row_zeros = u_i32 - row_ones;
                    let lb = (row_ones - cand_ones).abs().max((row_zeros - cand_zeros).abs()) as u32;
                    if lb > second_dist {
                        continue;
                    }
                    let d = pattern.distance_packed(self.words[idx], self.u);
                    if d < best_dist {
                        second_dist = best_dist;
                        best_dist = d;
                        best_idx = idx;
                    } else if d < second_dist {
                        second_dist = d;
                    }
                }
                CodebookMatch {
                    watermark: best_idx as u32,
                    distance: best_dist,
                    second_best_distance: if end - start > 1 { Some(second_dist) } else { None },
                    codeword: self.words[best_idx].to_bits(self.u),
                }
            }
        }
    }

    /// Multi-threaded exact nearest-neighbor search using `std::thread::scope`.
    pub fn search_parallel(
        &self,
        candidate: &[u8],
        metric: DistanceMetric,
        num_threads: usize,
    ) -> CodebookMatch {
        let total = self.words.len();
        let threads = num_threads.max(1).min(total.max(1));
        if threads == 1 || total < 4096 {
            return self.search(candidate, metric);
        }

        let chunk = (total + threads - 1) / threads;
        let partial: Vec<CodebookMatch> = std::thread::scope(|s| {
            let mut handles = Vec::with_capacity(threads);
            for t in 0..threads {
                let start = t * chunk;
                if start >= total {
                    break;
                }
                let end = (start + chunk).min(total);
                handles.push(s.spawn(move || self.search_slice(start, end, candidate, metric)));
            }
            handles.into_iter().map(|h| h.join().unwrap()).collect()
        });

        // Merge top-2 across chunks preserving tie-breaking by lowest watermark ID.
        let mut best_idx = 0usize;
        let mut best_dist = u32::MAX;
        let mut second_dist: Option<u32> = None;

        for m in &partial {
            let candidates = [
                Some((m.watermark as usize, m.distance)),
                m.second_best_distance.map(|d| (usize::MAX, d)),
            ];
            for item in candidates.into_iter().flatten() {
                let (idx, d) = item;
                if idx != usize::MAX && (d < best_dist || (d == best_dist && idx < best_idx)) {
                    if best_dist != u32::MAX {
                        second_dist = Some(second_dist.map_or(best_dist, |sd| sd.min(best_dist)));
                    }
                    best_dist = d;
                    best_idx = idx;
                } else {
                    second_dist = Some(second_dist.map_or(d, |sd| sd.min(d)));
                }
            }
        }

        CodebookMatch {
            watermark: best_idx as u32,
            distance: best_dist,
            second_best_distance: second_dist,
            codeword: self.words[best_idx].to_bits(self.u),
        }
    }

    pub fn exact_linear_d_min(&self) -> u32 {
        assert_eq!(self.construction, ConstructionKind::Linear);
        (1..self.words.len())
            .map(|w| self.words[w].xor(self.r_packed).popcount())
            .min()
            .unwrap_or(0)
    }

    /// Compute Hamming distance histogram from `watermark` and nearest-neighbor spread stats.
    pub fn distance_geometry(&self, watermark: u32, spread_samples: usize) -> CodebookGeometry {
        let count = self.words.len();
        let target_idx = (watermark as usize) % count;
        let target_word = self.words[target_idx];
        let mut histogram = vec![0u32; self.u + 1];

        let mut min_from_w = u32::MAX;
        let mut max_from_w = 0u32;
        let mut sum_from_w: u64 = 0;

        for (j, word) in self.words.iter().enumerate() {
            if j == target_idx {
                continue;
            }
            let d = target_word.hamming(*word);
            if (d as usize) <= self.u {
                histogram[d as usize] += 1;
            }
            if d < min_from_w {
                min_from_w = d;
            }
            if d > max_from_w {
                max_from_w = d;
            }
            sum_from_w += d as u64;
        }

        let others = (count - 1).max(1) as f64;
        let mean_from_w = (sum_from_w as f64) / others;

        let mut nn_min = u32::MAX;
        let mut nn_max = 0u32;
        if self.construction == ConstructionKind::Linear {
            let d_min = self.exact_linear_d_min();
            nn_min = d_min;
            nn_max = d_min;
        } else {
            let samples = count.min(spread_samples.max(1));
            for s in 0..samples {
                let i = (s * count) / samples;
                let wi = self.words[i];
                let mut local_nn = u32::MAX;
                for (j, wj) in self.words.iter().enumerate() {
                    if i == j {
                        continue;
                    }
                    let d = wi.hamming(*wj);
                    if d < local_nn {
                        local_nn = d;
                    }
                }
                if local_nn < nn_min {
                    nn_min = local_nn;
                }
                if local_nn > nn_max {
                    nn_max = local_nn;
                }
            }
        }

        CodebookGeometry {
            histogram,
            min_from_w: if min_from_w == u32::MAX { 0 } else { min_from_w },
            max_from_w,
            mean_from_w,
            nn_min: if nn_min == u32::MAX { 0 } else { nn_min },
            nn_max,
            nn_zero_spread: nn_min == nn_max,
        }
    }

    pub fn g_packed(&self) -> &[BitWord256] {
        &self.g_packed
    }
}
