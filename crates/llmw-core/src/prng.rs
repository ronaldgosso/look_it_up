//! FIPS 180-4 SHA-256, SplitMix64 PRNG, and deterministic V0/V1 vocabulary splitting.
//!
//! Bit-exact mirror of `src/llmw_codebook/_prng.py`.

const K256: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const H0: [u32; 8] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

#[inline]
fn sha256_compress(state: &mut [u32; 8], block: &[u8; 64]) {
    let mut w = [0u32; 64];
    for i in 0..16 {
        let j = i * 4;
        w[i] = u32::from_be_bytes([block[j], block[j + 1], block[j + 2], block[j + 3]]);
    }
    for i in 16..64 {
        let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
        let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
    }

    let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = *state;
    for i in 0..64 {
        let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
        let ch = (e & f) ^ ((!e) & g);
        let temp1 = h.wrapping_add(s1).wrapping_add(ch).wrapping_add(K256[i]).wrapping_add(w[i]);
        let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
        let maj = (a & b) ^ (a & c) ^ (b & c);
        let temp2 = s0.wrapping_add(maj);

        h = g;
        g = f;
        f = e;
        e = d.wrapping_add(temp1);
        d = c;
        c = b;
        b = a;
        a = temp1.wrapping_add(temp2);
    }

    state[0] = state[0].wrapping_add(a);
    state[1] = state[1].wrapping_add(b);
    state[2] = state[2].wrapping_add(c);
    state[3] = state[3].wrapping_add(d);
    state[4] = state[4].wrapping_add(e);
    state[5] = state[5].wrapping_add(f);
    state[6] = state[6].wrapping_add(g);
    state[7] = state[7].wrapping_add(h);
}

/// Compute SHA-256 digest of `data`.
pub fn sha256(data: &[u8]) -> [u8; 32] {
    let mut state = H0;
    let mut chunks = data.chunks_exact(64);
    for block in &mut chunks {
        let arr: &[u8; 64] = block.try_into().unwrap();
        sha256_compress(&mut state, arr);
    }

    let rem = chunks.remainder();
    let mut pad = [0u8; 128];
    pad[..rem.len()].copy_from_slice(rem);
    pad[rem.len()] = 0x80;
    let total_bits = (data.len() as u64) * 8;

    let pad_len = if rem.len() < 56 { 64 } else { 128 };
    pad[pad_len - 8..pad_len].copy_from_slice(&total_bits.to_be_bytes());
    sha256_compress(&mut state, pad[..64].try_into().unwrap());
    if pad_len == 128 {
        sha256_compress(&mut state, pad[64..128].try_into().unwrap());
    }

    let mut out = [0u8; 32];
    for (i, word) in state.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&word.to_be_bytes());
    }
    out
}

/// Return the first 64 bits of SHA-256(payload) as a big-endian `u64`.
#[inline]
pub fn sha256_seed64(payload: &[u8]) -> u64 {
    let digest = sha256(payload);
    u64::from_be_bytes([
        digest[0], digest[1], digest[2], digest[3], digest[4], digest[5], digest[6], digest[7],
    ])
}

/// Compute the Algorithm 2 / Algorithm 3 per-step partition seed.
pub fn derive_token_seed(secret_key: &[u8], prev_token_id: Option<u32>) -> u64 {
    match prev_token_id {
        None => sha256_seed64(secret_key),
        Some(prev) => {
            let prefix = format!("{prev}:");
            let mut buf = Vec::with_capacity(prefix.len() + secret_key.len());
            buf.extend_from_slice(prefix.as_bytes());
            buf.extend_from_slice(secret_key);
            sha256_seed64(&buf)
        }
    }
}

/// Fast, cross-platform 64-bit SplitMix64 PRNG matching `_prng.py`.
#[derive(Clone, Debug)]
pub struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    #[inline]
    pub fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    #[inline]
    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    pub fn next_bits(&mut self, count: usize) -> Vec<u8> {
        let mut out = Vec::with_capacity(count);
        let mut idx = 0;
        while idx < count {
            let word = self.next_u64();
            let take = (count - idx).min(64);
            for shift in 0..take {
                out.push(((word >> (63 - shift)) & 1) as u8);
            }
            idx += take;
        }
        out
    }

    #[inline]
    pub fn randbelow(&mut self, upper: usize) -> usize {
        if upper <= 1 {
            return 0;
        }
        let u = upper as u128;
        let space = 1u128 << 64;
        let limit = space - (space % u);
        loop {
            let val = self.next_u64() as u128;
            if val < limit {
                return (val % u) as usize;
            }
        }
    }
}

/// Deterministically partition `[0, vocab_size)` into balanced V0 (`false`) and V1 (`true`).
pub fn split_vocabulary(vocab_size: usize, seed: u64) -> Vec<u8> {
    assert!(vocab_size >= 2, "vocab_size must be at least 2");
    let mut rng = SplitMix64::new(seed);
    let mut perm: Vec<usize> = (0..vocab_size).collect();
    for i in (1..vocab_size).rev() {
        let j = rng.randbelow(i + 1);
        perm.swap(i, j);
    }
    let half = vocab_size / 2;
    let mut is_v1 = vec![0u8; vocab_size];
    for &idx in &perm[half..] {
        is_v1[idx] = 1;
    }
    is_v1
}
