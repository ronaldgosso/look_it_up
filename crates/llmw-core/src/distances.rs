//! Hardware-accelerated Hamming distance and Myers bit-parallel Levenshtein distance.

use std::cmp::min;

/// 256-bit packed binary vector storing up to 256 bits in 4 `u64` limbs.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct BitWord256 {
    pub words: [u64; 4],
}

impl BitWord256 {
    #[inline]
    pub fn from_bits(bits: &[u8]) -> Self {
        assert!(bits.len() <= 256, "BitWord256 supports at most 256 bits");
        let mut words = [0u64; 4];
        for (i, &b) in bits.iter().enumerate() {
            if (b & 1) != 0 {
                words[i >> 6] |= 1u64 << (i & 63);
            }
        }
        Self { words }
    }

    #[inline]
    pub fn xor(self, other: Self) -> Self {
        Self {
            words: [
                self.words[0] ^ other.words[0],
                self.words[1] ^ other.words[1],
                self.words[2] ^ other.words[2],
                self.words[3] ^ other.words[3],
            ],
        }
    }

    #[inline]
    pub fn popcount(self) -> u32 {
        self.words[0].count_ones()
            + self.words[1].count_ones()
            + self.words[2].count_ones()
            + self.words[3].count_ones()
    }

    #[inline]
    pub fn hamming(self, other: Self) -> u32 {
        self.xor(other).popcount()
    }

    #[inline]
    pub fn get_bit(self, idx: usize) -> u8 {
        ((self.words[idx >> 6] >> (idx & 63)) & 1) as u8
    }

    #[inline]
    pub fn as_u128(self) -> u128 {
        (self.words[0] as u128) | ((self.words[1] as u128) << 64)
    }

    pub fn to_bits(self, len: usize) -> Vec<u8> {
        let mut out = Vec::with_capacity(len);
        for i in 0..len {
            out.push(self.get_bit(i));
        }
        out
    }
}

/// Precomputed Myers pattern masks for fast repeated distance evaluation against one candidate.
pub enum MyersPattern {
    Small128 {
        m: usize,
        peq1: u128,
        peq0: u128,
        mask_all: u128,
        high_bit: u128,
    },
    Medium256 {
        m: usize,
        num_limbs: usize,
        peq1: [u64; 4],
        peq0: [u64; 4],
        top_mask: u64,
        high_limb: usize,
        high_bit: u64,
    },
    Large {
        bits: Vec<u8>,
    },
}

impl MyersPattern {
    pub fn new(cand: &[u8]) -> Self {
        let m = cand.len();
        if m == 0 || m > 256 {
            return Self::Large { bits: cand.to_vec() };
        }
        if m <= 128 {
            let mask_all = if m == 128 { u128::MAX } else { (1u128 << m) - 1 };
            let high_bit = 1u128 << (m - 1);
            let mut peq1 = 0u128;
            for (i, &b) in cand.iter().enumerate() {
                if (b & 1) != 0 {
                    peq1 |= 1u128 << i;
                }
            }
            return Self::Small128 {
                m,
                peq1,
                peq0: mask_all ^ peq1,
                mask_all,
                high_bit,
            };
        }

        let num_limbs = (m + 63) >> 6;
        let rem = m & 63;
        let top_mask = if rem == 0 { u64::MAX } else { (1u64 << rem) - 1 };
        let packed = BitWord256::from_bits(cand);
        let mut peq0 = [0u64; 4];
        for i in 0..num_limbs {
            let m_limb = if i == num_limbs - 1 { top_mask } else { u64::MAX };
            peq0[i] = m_limb ^ packed.words[i];
        }
        Self::Medium256 {
            m,
            num_limbs,
            peq1: packed.words,
            peq0,
            top_mask,
            high_limb: num_limbs - 1,
            high_bit: 1u64 << ((m - 1) & 63),
        }
    }

    #[inline]
    pub fn distance_packed(&self, target: BitWord256, target_len: usize) -> u32 {
        match self {
            Self::Small128 {
                m,
                peq1,
                peq0,
                mask_all,
                high_bit,
            } => {
                let mut pv = *mask_all;
                let mut mv = 0u128;
                let mut score = *m as i32;
                let mut w0 = target.words[0];
                let mut w1 = target.words[1];
                let mut w2 = target.words[2];
                let mut w3 = target.words[3];

                for i in 0..target_len {
                    let bit = match i >> 6 {
                        0 => {
                            let b = w0 & 1;
                            w0 >>= 1;
                            b
                        }
                        1 => {
                            let b = w1 & 1;
                            w1 >>= 1;
                            b
                        }
                        2 => {
                            let b = w2 & 1;
                            w2 >>= 1;
                            b
                        }
                        _ => {
                            let b = w3 & 1;
                            w3 >>= 1;
                            b
                        }
                    };
                    let eq = if bit != 0 { *peq1 } else { *peq0 };
                    let xv = eq | mv;
                    let eq_pv = eq & pv;
                    let xh = (eq_pv.wrapping_add(pv) ^ pv) | eq;
                    let ph = mv | (!(xh | pv) & *mask_all);
                    let mh = pv & xh;

                    if (ph & *high_bit) != 0 {
                        score += 1;
                    } else if (mh & *high_bit) != 0 {
                        score -= 1;
                    }

                    let ph_s = ((ph << 1) | 1) & *mask_all;
                    let mh_s = (mh << 1) & *mask_all;
                    pv = mh_s | (!(xv | ph_s) & *mask_all);
                    mv = ph_s & xv;
                }
                score as u32
            }
            Self::Medium256 {
                m,
                num_limbs,
                peq1,
                peq0,
                top_mask,
                high_limb,
                high_bit,
            } => {
                let mut pv = [u64::MAX; 4];
                pv[*num_limbs - 1] = *top_mask;
                for limb in *num_limbs..4 {
                    pv[limb] = 0;
                }
                let mut mv = [0u64; 4];
                let mut score = *m as i32;

                for i in 0..target_len {
                    let bit = target.get_bit(i);
                    let eq = if bit != 0 { *peq1 } else { *peq0 };

                    let mut xv = [0u64; 4];
                    let mut xh = [0u64; 4];
                    let mut ph = [0u64; 4];
                    let mut mh = [0u64; 4];

                    let mut carry = false;
                    for l in 0..*num_limbs {
                        let m_limb = if l == *num_limbs - 1 { *top_mask } else { u64::MAX };
                        xv[l] = eq[l] | mv[l];
                        let eq_pv = eq[l] & pv[l];
                        let (s1, c1) = eq_pv.overflowing_add(pv[l]);
                        let (s2, c2) = s1.overflowing_add(carry as u64);
                        carry = c1 | c2;
                        xh[l] = (s2 ^ pv[l]) | eq[l];
                        ph[l] = mv[l] | (!(xh[l] | pv[l]) & m_limb);
                        mh[l] = pv[l] & xh[l];
                    }

                    if (ph[*high_limb] & *high_bit) != 0 {
                        score += 1;
                    } else if (mh[*high_limb] & *high_bit) != 0 {
                        score -= 1;
                    }

                    let mut ph_carry = 1u64;
                    let mut mh_carry = 0u64;
                    for l in 0..*num_limbs {
                        let m_limb = if l == *num_limbs - 1 { *top_mask } else { u64::MAX };
                        let next_ph = ph[l] >> 63;
                        let next_mh = mh[l] >> 63;
                        let ph_s = ((ph[l] << 1) | ph_carry) & m_limb;
                        let mh_s = (mh[l] << 1) | mh_carry;
                        ph_carry = next_ph;
                        mh_carry = next_mh;
                        pv[l] = mh_s | (!(xv[l] | ph_s) & m_limb);
                        mv[l] = ph_s & xv[l];
                    }
                }
                score as u32
            }
            Self::Large { bits } => levenshtein_dp(bits, &target.to_bits(target_len)),
        }
    }

    pub fn distance_slice(&self, target: &[u8]) -> u32 {
        if target.len() <= 256 && !matches!(self, Self::Large { .. }) {
            let packed = BitWord256::from_bits(target);
            self.distance_packed(packed, target.len())
        } else {
            match self {
                Self::Large { bits } => levenshtein_dp(bits, target),
                _ => {
                    // For targets longer than 256 bits, swap roles or fall back to DP.
                    if target.len() <= 256 {
                        unreachable!()
                    } else {
                        let cand = self.reconstruct_bits();
                        levenshtein_dp(&cand, target)
                    }
                }
            }
        }
    }

    fn reconstruct_bits(&self) -> Vec<u8> {
        match self {
            Self::Small128 { m, peq1, .. } => {
                (0..*m).map(|i| ((*peq1 >> i) & 1) as u8).collect()
            }
            Self::Medium256 { m, peq1, .. } => BitWord256 { words: *peq1 }.to_bits(*m),
            Self::Large { bits } => bits.clone(),
        }
    }
}

/// Exact Hamming distance between two bit slices.
pub fn hamming_distance(a: &[u8], b: &[u8]) -> u32 {
    assert_eq!(a.len(), b.len(), "Hamming length mismatch");
    a.iter().zip(b.iter()).filter(|(&x, &y)| (x & 1) != (y & 1)).count() as u32
}

/// Exact two-row DP Levenshtein distance for arbitrary slice lengths.
pub fn levenshtein_dp(a: &[u8], b: &[u8]) -> u32 {
    let m = a.len();
    let n = b.len();
    if m == 0 {
        return n as u32;
    }
    if n == 0 {
        return m as u32;
    }
    let mut prev: Vec<u32> = (0..=n as u32).collect();
    let mut curr = vec![0u32; n + 1];
    for (i, &ai) in a.iter().enumerate() {
        curr[0] = (i + 1) as u32;
        for (j, &bj) in b.iter().enumerate() {
            let cost = if (ai & 1) == (bj & 1) { 0 } else { 1 };
            curr[j + 1] = min(min(prev[j + 1] + 1, curr[j] + 1), prev[j] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[n]
}

/// Exact Levenshtein distance automatically dispatching to Myers bit-parallel path.
pub fn levenshtein_distance(a: &[u8], b: &[u8]) -> u32 {
    if a.is_empty() {
        return b.len() as u32;
    }
    if b.is_empty() {
        return a.len() as u32;
    }
    if a.len() <= b.len() && a.len() <= 256 && b.len() <= 256 {
        MyersPattern::new(a).distance_slice(b)
    } else if b.len() <= 256 && a.len() <= 256 {
        MyersPattern::new(b).distance_slice(a)
    } else {
        levenshtein_dp(a, b)
    }
}
