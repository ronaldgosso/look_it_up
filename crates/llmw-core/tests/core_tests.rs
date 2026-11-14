use llmw_core::bch::BCHCodec;
use llmw_core::codebook::{
    gilbert_varshamov_distance, ConstructionKind, DistanceMetric, PackedCodebook,
};
use llmw_core::distances::{hamming_distance, levenshtein_distance, levenshtein_dp, MyersPattern};
use llmw_core::prng::{derive_token_seed, sha256, split_vocabulary, SplitMix64};

#[test]
fn sha256_matches_nist_test_vector() {
    let digest = sha256(b"abc");
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    assert_eq!(
        hex,
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
}

#[test]
fn myers_matches_dp_across_small_medium_and_boundary_lengths() {
    let mut rng = SplitMix64::new(0x1234_5678_9ABC_DEF0);
    for &(m, n) in &[
        (0, 5),
        (5, 0),
        (1, 1),
        (63, 64),
        (64, 63),
        (127, 127),
        (127, 118),
        (128, 128),
        (129, 131),
        (192, 187),
        (200, 194),
        (256, 250),
    ] {
        let a = rng.next_bits(m);
        let b = rng.next_bits(n);
        assert_eq!(
            levenshtein_distance(&a, &b),
            levenshtein_dp(&a, &b),
            "mismatch at ({m}, {n})"
        );
        if m > 0 && m <= 256 && n <= 256 {
            let pat = MyersPattern::new(&a);
            assert_eq!(pat.distance_slice(&b), levenshtein_dp(&a, &b));
        }
    }
}

#[test]
fn parallel_search_matches_single_threaded_and_zero_hamming_spread() {
    let cb = PackedCodebook::build(b"rust-phase2-key", 13, 127, ConstructionKind::Linear);
    let d_min = cb.exact_linear_d_min();
    assert!(d_min >= 30);

    // Every entry in a linear codebook has identical Hamming nearest-neighbor distance.
    for w in [0u32, 1, 17, 513, 4095, 8191] {
        let cw = PackedCodebook::encode_linear(b"rust-phase2-key", 13, 127, w);
        assert_eq!(cw, cb.words[w as usize].to_bits(127));
        let m = cb.search(&cw, DistanceMetric::Hamming);
        assert_eq!(m.watermark, w);
        assert_eq!(m.distance, 0);
        assert_eq!(m.second_best_distance, Some(d_min));
    }

    // Corrupt a codeword with deletion + bit flips and verify parallel vs sequential search.
    let mut cand = cb.words[2749].to_bits(127);
    for idx in [5usize, 18, 42, 77, 101] {
        cand[idx] ^= 1;
    }
    cand.remove(90);
    cand.remove(30);
    cand.remove(10);

    let seq = cb.search(&cand, DistanceMetric::Levenshtein);
    let par = cb.search_parallel(&cand, DistanceMetric::Levenshtein, 4);
    assert_eq!(seq, par);
    assert_eq!(par.watermark, 2749);
}

#[test]
fn bch_table_v_parameters_and_full_error_correction() {
    let bch127 = BCHCodec::new(24, 127);
    assert_eq!(bch127.params.native_length, 127);
    assert_eq!(bch127.params.message_capacity, 29);
    assert_eq!(bch127.params.correction_capability, 21);

    let bch200 = BCHCodec::new(32, 200);
    assert_eq!(bch200.params.native_length, 255);
    assert_eq!(bch200.params.message_capacity, 87);
    assert_eq!(bch200.params.shortening_bits, 55);
    assert_eq!(bch200.params.correction_capability, 26);

    let wm = 0xDEAD_BEEFu64;
    let cw = bch200.encode(wm);
    let mut noisy = cw.clone();
    for pos in 0..26 {
        noisy[pos * 7] ^= 1;
    }
    let (decoded, flips, reconstructed) = bch200.decode(&noisy);
    assert_eq!(decoded, wm);
    assert_eq!(flips, 26);
    assert_eq!(reconstructed, cw);
}

#[test]
fn gv_bound_and_vocab_split_sanity() {
    let d127 = gilbert_varshamov_distance(24, 127);
    let d200 = gilbert_varshamov_distance(24, 200);
    assert!((31..=33).contains(&d127));
    assert!((59..=61).contains(&d200));

    let seed0 = derive_token_seed(b"key", None);
    let split = split_vocabulary(1024, seed0);
    let ones: usize = split.iter().map(|&b| b as usize).sum();
    assert_eq!(ones, 512);
    assert_eq!(hamming_distance(&[0, 1, 1], &[1, 1, 0]), 2);

    // Distance geometry confirms zero nearest-neighbor spread for Linear vs positive spread for RNG.
    let lin = PackedCodebook::build(b"spread-check", 8, 127, ConstructionKind::Linear);
    let lin_geom = lin.distance_geometry(42, 256);
    assert!(lin_geom.nn_zero_spread);
    assert_eq!(lin_geom.nn_min, lin_geom.nn_max);
    assert_eq!(lin_geom.histogram.iter().sum::<u32>(), 255);

    let rng_cb = PackedCodebook::build(b"spread-check", 8, 127, ConstructionKind::Rng);
    let rng_geom = rng_cb.distance_geometry(42, 256);
    assert!(!rng_geom.nn_zero_spread);
    assert!(rng_geom.nn_min < rng_geom.nn_max);
}
