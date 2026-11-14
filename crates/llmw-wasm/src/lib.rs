//! Minimal WebAssembly C-ABI exports for zero-cost client-side execution in Phase 3+.

use std::slice;

use llmw_core::bch::BCHCodec;
use llmw_core::codebook::{ConstructionKind, DistanceMetric, PackedCodebook};
use llmw_core::distances::levenshtein_distance;
use llmw_core::prng::split_vocabulary;

#[no_mangle]
pub extern "C" fn wasm_alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub unsafe extern "C" fn wasm_free(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        drop(Vec::from_raw_parts(ptr, 0, len));
    }
}

#[no_mangle]
pub unsafe extern "C" fn wasm_levenshtein(
    a_ptr: *const u8,
    a_len: usize,
    b_ptr: *const u8,
    b_len: usize,
) -> u32 {
    let a = slice::from_raw_parts(a_ptr, a_len);
    let b = slice::from_raw_parts(b_ptr, b_len);
    levenshtein_distance(a, b)
}

#[no_mangle]
pub unsafe extern "C" fn wasm_split_vocab(vocab_size: usize, seed_hi: u32, seed_lo: u32, out_ptr: *mut u8) {
    let seed = ((seed_hi as u64) << 32) | (seed_lo as u64);
    let mask = split_vocabulary(vocab_size, seed);
    let out = slice::from_raw_parts_mut(out_ptr, vocab_size);
    out.copy_from_slice(&mask);
}

#[no_mangle]
pub unsafe extern "C" fn wasm_linear_encode(
    key_ptr: *const u8,
    key_len: usize,
    n: usize,
    u: usize,
    watermark: u32,
    out_ptr: *mut u8,
) {
    let key = slice::from_raw_parts(key_ptr, key_len);
    let cw = PackedCodebook::encode_linear(key, n, u, watermark);
    let out = slice::from_raw_parts_mut(out_ptr, u);
    out.copy_from_slice(&cw);
}

#[no_mangle]
pub unsafe extern "C" fn wasm_codebook_search(
    key_ptr: *const u8,
    key_len: usize,
    n: usize,
    u: usize,
    construction: u32,
    metric: u32,
    cand_ptr: *const u8,
    cand_len: usize,
    out_results: *mut u32, // [watermark, dist, second_dist_or_u32_max]
) {
    let key = slice::from_raw_parts(key_ptr, key_len);
    let cand = slice::from_raw_parts(cand_ptr, cand_len);
    let kind = if construction == 1 {
        ConstructionKind::Rng
    } else {
        ConstructionKind::Linear
    };
    let met = if metric == 0 {
        DistanceMetric::Hamming
    } else {
        DistanceMetric::Levenshtein
    };
    let cb = PackedCodebook::build(key, n, u, kind);
    let m = cb.search(cand, met);
    let res = slice::from_raw_parts_mut(out_results, 3);
    res[0] = m.watermark;
    res[1] = m.distance;
    res[2] = m.second_best_distance.unwrap_or(u32::MAX);
}

#[no_mangle]
pub unsafe extern "C" fn wasm_bch_encode(n: usize, u: usize, watermark: u32, out_ptr: *mut u8) {
    let codec = BCHCodec::new(n, u);
    let cw = codec.encode(watermark as u64);
    let out = slice::from_raw_parts_mut(out_ptr, u);
    out.copy_from_slice(&cw);
}

#[no_mangle]
pub unsafe extern "C" fn wasm_bch_decode(
    n: usize,
    u: usize,
    recv_ptr: *const u8,
    out_results: *mut u32, // [watermark_lo, watermark_hi, flips]
) {
    let codec = BCHCodec::new(n, u);
    let recv = slice::from_raw_parts(recv_ptr, u);
    let (wm, flips, _) = codec.decode(recv);
    let res = slice::from_raw_parts_mut(out_results, 3);
    res[0] = wm as u32;
    res[1] = (wm >> 32) as u32;
    res[2] = flips;
}
