//! C-ABI shared library wrapper exposing `llmw-core` to Python (`ctypes`) and other hosts.

use std::slice;

use llmw_core::bch::BCHCodec;
use llmw_core::codebook::{ConstructionKind, DistanceMetric, PackedCodebook};
use llmw_core::distances::levenshtein_distance;
use llmw_core::prng::split_vocabulary;

#[no_mangle]
pub extern "C" fn llmw_abi_version() -> u32 {
    2
}

#[no_mangle]
pub extern "C" fn llmw_recommended_threads() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
}

#[no_mangle]
pub unsafe extern "C" fn llmw_levenshtein(
    a_ptr: *const u8,
    a_len: usize,
    b_ptr: *const u8,
    b_len: usize,
) -> u32 {
    let a = if a_len == 0 {
        &[]
    } else {
        slice::from_raw_parts(a_ptr, a_len)
    };
    let b = if b_len == 0 {
        &[]
    } else {
        slice::from_raw_parts(b_ptr, b_len)
    };
    levenshtein_distance(a, b)
}

#[no_mangle]
pub unsafe extern "C" fn llmw_split_vocab(
    vocab_size: usize,
    seed: u64,
    out_mask: *mut u8,
) -> i32 {
    if out_mask.is_null() || vocab_size < 2 {
        return -1;
    }
    let mask = split_vocabulary(vocab_size, seed);
    let out = slice::from_raw_parts_mut(out_mask, vocab_size);
    out.copy_from_slice(&mask);
    0
}

#[no_mangle]
pub unsafe extern "C" fn llmw_codebook_new(
    key_ptr: *const u8,
    key_len: usize,
    n: usize,
    u: usize,
    construction: u32,
) -> *mut PackedCodebook {
    if n == 0 || n > 24 || u <= n || u > 256 {
        return std::ptr::null_mut();
    }
    let key = if key_len == 0 {
        &[]
    } else if key_ptr.is_null() {
        return std::ptr::null_mut();
    } else {
        slice::from_raw_parts(key_ptr, key_len)
    };
    let kind = match construction {
        0 => ConstructionKind::Linear,
        1 => ConstructionKind::Rng,
        _ => return std::ptr::null_mut(),
    };
    let cb = PackedCodebook::build(key, n, u, kind);
    Box::into_raw(Box::new(cb))
}

#[no_mangle]
pub unsafe extern "C" fn llmw_codebook_free(ptr: *mut PackedCodebook) {
    if !ptr.is_null() {
        drop(Box::from_raw(ptr));
    }
}

#[no_mangle]
pub unsafe extern "C" fn llmw_codebook_d_min(ptr: *const PackedCodebook) -> i32 {
    if ptr.is_null() {
        return -1;
    }
    let cb = &*ptr;
    if cb.construction != ConstructionKind::Linear {
        return -2;
    }
    cb.exact_linear_d_min() as i32
}

#[no_mangle]
pub unsafe extern "C" fn llmw_codebook_encode(
    ptr: *const PackedCodebook,
    watermark: u32,
    out_cw: *mut u8,
) -> i32 {
    if ptr.is_null() || out_cw.is_null() {
        return -1;
    }
    let cb = &*ptr;
    if (watermark as usize) >= cb.words.len() {
        return -2;
    }
    let bits = cb.words[watermark as usize].to_bits(cb.u);
    let out = slice::from_raw_parts_mut(out_cw, cb.u);
    out.copy_from_slice(&bits);
    0
}

#[no_mangle]
pub unsafe extern "C" fn llmw_codebook_search(
    ptr: *const PackedCodebook,
    cand_ptr: *const u8,
    cand_len: usize,
    metric: u32,
    threads: usize,
    out_watermark: *mut u32,
    out_distance: *mut u32,
    out_second_distance: *mut i64,
    out_cw: *mut u8,
) -> i32 {
    if ptr.is_null() || out_watermark.is_null() || out_distance.is_null() || out_second_distance.is_null() {
        return -1;
    }
    let cb = &*ptr;
    let cand = if cand_len == 0 {
        &[]
    } else if cand_ptr.is_null() {
        return -1;
    } else {
        slice::from_raw_parts(cand_ptr, cand_len)
    };
    let dist_metric = match metric {
        0 => DistanceMetric::Hamming,
        1 => DistanceMetric::Levenshtein,
        _ => return -2,
    };
    if dist_metric == DistanceMetric::Hamming && cand.len() != cb.u {
        return -3;
    }

    let n_threads = if threads == 0 {
        llmw_recommended_threads()
    } else {
        threads
    };
    let res = cb.search_parallel(cand, dist_metric, n_threads);
    *out_watermark = res.watermark;
    *out_distance = res.distance;
    *out_second_distance = res.second_best_distance.map_or(-1, |d| d as i64);
    if !out_cw.is_null() {
        let cw_slice = slice::from_raw_parts_mut(out_cw, cb.u);
        cw_slice.copy_from_slice(&res.codeword);
    }
    0
}

#[no_mangle]
pub unsafe extern "C" fn llmw_bch_encode(
    n: usize,
    u: usize,
    watermark: u64,
    out_cw: *mut u8,
) -> i32 {
    if out_cw.is_null() || n == 0 || u <= n || u > 255 {
        return -1;
    }
    let codec = BCHCodec::new(n, u);
    let cw = codec.encode(watermark);
    let out = slice::from_raw_parts_mut(out_cw, u);
    out.copy_from_slice(&cw);
    0
}

#[no_mangle]
pub unsafe extern "C" fn llmw_bch_decode(
    n: usize,
    u: usize,
    recv_ptr: *const u8,
    out_watermark: *mut u64,
    out_flips: *mut u32,
    out_cw: *mut u8,
) -> i32 {
    if recv_ptr.is_null() || out_watermark.is_null() || out_flips.is_null() || n == 0 || u <= n || u > 255 {
        return -1;
    }
    let codec = BCHCodec::new(n, u);
    let recv = slice::from_raw_parts(recv_ptr, u);
    let (wm, flips, cw) = codec.decode(recv);
    *out_watermark = wm;
    *out_flips = flips;
    if !out_cw.is_null() {
        let out = slice::from_raw_parts_mut(out_cw, u);
        out.copy_from_slice(&cw);
    }
    0
}
