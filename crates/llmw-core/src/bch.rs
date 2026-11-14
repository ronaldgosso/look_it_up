//! Binary BCH encoder/decoder over GF(2^m) with Appendix D code shortening.
//!
//! Bit-exact mirror of `src/llmw_codebook/bch.py`.

const PRIMITIVE_POLYS: [(usize, u32); 5] = [
    (4, 0b10011),
    (5, 0b100101),
    (6, 0b1000011),
    (7, 0b10001001),
    (8, 0b100011101),
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BCHParameters {
    pub watermark_bits: usize,
    pub codeword_length: usize,
    pub native_length: usize,
    pub field_degree: usize,
    pub message_capacity: usize,
    pub shortening_bits: usize,
    pub correction_capability: usize,
}

struct GF2m {
    n0: usize,
    exp: Vec<usize>,
    log: Vec<isize>,
}

impl GF2m {
    fn new(m: usize) -> Self {
        let prim = PRIMITIVE_POLYS
            .iter()
            .find(|&&(deg, _)| deg == m)
            .map(|&(_, p)| p as usize)
            .expect("Unsupported BCH field degree m");
        let size = 1usize << m;
        let n0 = size - 1;
        let mut exp = vec![0usize; 2 * n0];
        let mut log = vec![-1isize; size];
        let mut x = 1usize;
        for i in 0..n0 {
            exp[i] = x;
            exp[i + n0] = x;
            log[x] = i as isize;
            x <<= 1;
            if (x & size) != 0 {
                x ^= prim;
            }
        }
        Self { n0, exp, log }
    }

    #[inline]
    fn mul(&self, a: usize, b: usize) -> usize {
        if a == 0 || b == 0 {
            0
        } else {
            self.exp[(self.log[a] + self.log[b]) as usize]
        }
    }

    #[inline]
    fn div(&self, a: usize, b: usize) -> usize {
        assert!(b != 0, "Division by zero in GF(2^m)");
        if a == 0 {
            0
        } else {
            let diff = (self.log[a] - self.log[b]).rem_euclid(self.n0 as isize) as usize;
            self.exp[diff]
        }
    }

    #[inline]
    fn pow_alpha(&self, exp: usize) -> usize {
        self.exp[exp % self.n0]
    }
}

/// Arbitrary-degree GF(2) polynomial represented in LSB-first `u64` words.
#[derive(Clone, Debug)]
struct PolyGF2 {
    words: [u64; 4],
}

impl PolyGF2 {
    fn zero() -> Self {
        Self { words: [0; 4] }
    }

    fn one() -> Self {
        Self { words: [1, 0, 0, 0] }
    }

    fn degree(&self) -> isize {
        for l in (0..4).rev() {
            if self.words[l] != 0 {
                return (l * 64 + (63 - self.words[l].leading_zeros() as usize)) as isize;
            }
        }
        -1
    }

    #[inline]
    fn get_bit(&self, bit: usize) -> u8 {
        ((self.words[bit >> 6] >> (bit & 63)) & 1) as u8
    }

    #[inline]
    fn xor_bit(&mut self, bit: usize) {
        self.words[bit >> 6] ^= 1u64 << (bit & 63);
    }

    fn xor_shifted(&mut self, other: &Self, shift: usize) {
        let word_shift = shift >> 6;
        let bit_shift = shift & 63;
        for i in 0..4 {
            let w = other.words[i];
            if w == 0 {
                continue;
            }
            if i + word_shift < 4 {
                self.words[i + word_shift] ^= w << bit_shift;
            }
            if bit_shift != 0 && i + word_shift + 1 < 4 {
                self.words[i + word_shift + 1] ^= w >> (64 - bit_shift);
            }
        }
    }

    fn mul(&self, other: &Self) -> Self {
        let mut res = Self::zero();
        for bit in 0..256 {
            if other.get_bit(bit) != 0 {
                res.xor_shifted(self, bit);
            }
        }
        res
    }

    fn modulo(&self, divisor: &Self) -> Self {
        let mut rem = self.clone();
        let deg_div = divisor.degree();
        assert!(deg_div >= 0);
        loop {
            let deg_rem = rem.degree();
            if deg_rem < deg_div {
                break;
            }
            rem.xor_shifted(divisor, (deg_rem - deg_div) as usize);
        }
        rem
    }
}

fn minimal_poly_gf2(gf: &GF2m, root_exp: usize) -> PolyGF2 {
    let mut coset = Vec::new();
    let mut cur = root_exp % gf.n0;
    while !coset.contains(&cur) {
        coset.push(cur);
        cur = (cur * 2) % gf.n0;
    }
    let mut coeffs = vec![1usize];
    for e in coset {
        let root = gf.pow_alpha(e);
        let mut next = vec![0usize; coeffs.len() + 1];
        for (idx, &c) in coeffs.iter().enumerate() {
            next[idx] ^= gf.mul(c, root);
            next[idx + 1] ^= c;
        }
        coeffs = next;
    }
    let mut poly = PolyGF2::zero();
    for (idx, &c) in coeffs.iter().enumerate() {
        if (c & 1) != 0 {
            poly.xor_bit(idx);
        }
    }
    poly
}

fn choose_bch_spec(n: usize, u: usize) -> (usize, usize, usize) {
    let mut m = 4usize;
    while ((1usize << m) - 1) < u {
        m += 1;
    }
    assert!(m <= 8, "Codeword length u={u} exceeds max supported BCH length 255");
    let n0 = (1usize << m) - 1;
    let shortening = n0 - u;

    let mut seen = vec![false; n0];
    let mut cosets: Vec<(Vec<usize>, usize)> = Vec::new();
    for a in 1..n0 {
        if seen[a] {
            continue;
        }
        let mut elems = Vec::new();
        let mut cur = a;
        while !seen[cur] {
            seen[cur] = true;
            elems.push(cur);
            cur = (cur * 2) % n0;
        }
        let deg = elems.len();
        cosets.push((elems, deg));
    }

    let mut best_k = 0usize;
    let mut best_t = 0usize;
    for t in 1..=(n0 / 2) {
        let parity_deg: usize = cosets
            .iter()
            .filter(|(elems, _)| elems.iter().any(|&e| (1..=2 * t).contains(&e)))
            .map(|(_, deg)| *deg)
            .sum();
        let k = n0 - parity_deg;
        if k >= shortening + n {
            best_k = k;
            best_t = t;
        } else {
            break;
        }
    }
    assert!(best_t > 0, "No valid BCH code for n={n}, u={u}");
    (m, best_k, best_t)
}

pub struct BCHCodec {
    gf: GF2m,
    gen_poly: PolyGF2,
    parity_len: usize,
    pub params: BCHParameters,
}

impl BCHCodec {
    pub fn new(watermark_bits: usize, codeword_length: usize) -> Self {
        assert!(
            watermark_bits >= 1 && codeword_length > watermark_bits,
            "Require 1 <= n < u"
        );
        let (m, k, t) = choose_bch_spec(watermark_bits, codeword_length);
        let n0 = (1usize << m) - 1;
        let gf = GF2m::new(m);

        let mut gen_poly = PolyGF2::one();
        let mut covered = vec![false; n0];
        for root_exp in 1..=(2 * t) {
            if covered[root_exp] {
                continue;
            }
            let mut cur = root_exp % n0;
            while !covered[cur] {
                covered[cur] = true;
                cur = (cur * 2) % n0;
            }
            gen_poly = gen_poly.mul(&minimal_poly_gf2(&gf, root_exp));
        }

        let parity_len = gen_poly.degree() as usize;
        assert_eq!(n0 - parity_len, k);

        Self {
            gf,
            gen_poly,
            parity_len,
            params: BCHParameters {
                watermark_bits,
                codeword_length,
                native_length: n0,
                field_degree: m,
                message_capacity: k,
                shortening_bits: n0 - codeword_length,
                correction_capability: t,
            },
        }
    }

    pub fn encode(&self, watermark: u64) -> Vec<u8> {
        let mut msg = PolyGF2::zero();
        let offset = self.params.shortening_bits;
        let n = self.params.watermark_bits;
        let k = self.params.message_capacity;
        for idx in 0..n {
            if ((watermark >> (n - 1 - idx)) & 1) != 0 {
                msg.xor_bit(k - 1 - (offset + idx));
            }
        }
        let mut shifted = PolyGF2::zero();
        shifted.xor_shifted(&msg, self.parity_len);
        let rem = shifted.modulo(&self.gen_poly);
        let mut cw = shifted;
        cw.xor_shifted(&rem, 0);

        let u = self.params.codeword_length;
        (0..u).map(|pos| cw.get_bit(u - 1 - pos)).collect()
    }

    /// Returns `(watermark, bit_flips, corrected_codeword)`.
    pub fn decode(&self, received: &[u8]) -> (u64, u32, Vec<u8>) {
        let u = self.params.codeword_length;
        assert_eq!(received.len(), u, "Expected received len {u}");

        let mut recv = PolyGF2::zero();
        for (pos, &b) in received.iter().enumerate() {
            if (b & 1) != 0 {
                recv.xor_bit(u - 1 - pos);
            }
        }

        let t = self.params.correction_capability;
        let syndromes = self.compute_syndromes(&recv, 2 * t);
        if syndromes.iter().any(|&s| s != 0) {
            let err_positions = self.berlekamp_massey_chien(&syndromes, t);
            for pos in err_positions {
                recv.xor_bit(pos);
            }
        }

        let k = self.params.message_capacity;
        let n = self.params.watermark_bits;
        let start_bit = self.parity_len + k - 1 - self.params.shortening_bits;
        let mut watermark = 0u64;
        for idx in 0..n {
            watermark = (watermark << 1) | (recv.get_bit(start_bit - idx) as u64);
        }

        let reencoded = self.encode(watermark);
        let bit_flips = received
            .iter()
            .zip(reencoded.iter())
            .filter(|(&a, &b)| (a & 1) != (b & 1))
            .count() as u32;
        (watermark, bit_flips, reencoded)
    }

    fn compute_syndromes(&self, poly: &PolyGF2, count: usize) -> Vec<usize> {
        let n0 = self.params.native_length;
        let set_bits: Vec<usize> = (0..n0).filter(|&i| poly.get_bit(i) != 0).collect();
        let mut syndromes = Vec::with_capacity(count);
        for j in 1..=count {
            let mut acc = 0usize;
            for &bit_pos in &set_bits {
                acc ^= self.gf.pow_alpha(bit_pos * j);
            }
            syndromes.push(acc);
        }
        syndromes
    }

    fn berlekamp_massey_chien(&self, syndromes: &[usize], t: usize) -> Vec<usize> {
        let n0 = self.params.native_length;
        let mut c = vec![0usize; 2 * t + 1];
        let mut b = vec![0usize; 2 * t + 1];
        c[0] = 1;
        b[0] = 1;
        let mut l = 0usize;
        let mut m_shift = 1usize;
        let mut b_disc = 1usize;

        for n_step in 0..(2 * t) {
            let mut discrepancy = syndromes[n_step];
            for i in 1..=l {
                if c[i] != 0 && syndromes[n_step - i] != 0 {
                    discrepancy ^= self.gf.mul(c[i], syndromes[n_step - i]);
                }
            }
            if discrepancy == 0 {
                m_shift += 1;
            } else if 2 * l <= n_step {
                let temp = c.clone();
                let coef = self.gf.div(discrepancy, b_disc);
                for i in m_shift..=(2 * t) {
                    if b[i - m_shift] != 0 {
                        c[i] ^= self.gf.mul(coef, b[i - m_shift]);
                    }
                }
                l = n_step + 1 - l;
                b = temp;
                b_disc = discrepancy;
                m_shift = 1;
            } else {
                let coef = self.gf.div(discrepancy, b_disc);
                for i in m_shift..=(2 * t) {
                    if b[i - m_shift] != 0 {
                        c[i] ^= self.gf.mul(coef, b[i - m_shift]);
                    }
                }
                m_shift += 1;
            }
        }

        if l > t {
            return Vec::new();
        }

        let lambda = &c[..=l];
        let mut positions = Vec::new();
        for pos in 0..n0 {
            let x = self.gf.pow_alpha(n0 - pos);
            let mut val = 0usize;
            let mut x_pow = 1usize;
            for &coef in lambda {
                if coef != 0 {
                    val ^= self.gf.mul(coef, x_pow);
                }
                x_pow = self.gf.mul(x_pow, x);
            }
            if val == 0 {
                positions.push(pos);
            }
        }
        if positions.len() == l {
            positions
        } else {
            Vec::new()
        }
    }
}
