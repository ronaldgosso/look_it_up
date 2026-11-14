//! Native multi-threaded benchmark measuring extraction latency across n, u, and metric.

use std::time::Instant;

use llmw_core::bch::BCHCodec;
use llmw_core::codebook::{ConstructionKind, DistanceMetric, PackedCodebook};

fn main() {
    let threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    let key = b"benchmark-secret-key";

    println!("{{\"threads\": {threads}, \"benchmarks\": [");
    let configs = [(12usize, 127usize), (16, 127), (16, 200), (20, 127)];
    for (idx, &(n, u)) in configs.iter().enumerate() {
        let t_build = Instant::now();
        let cb = PackedCodebook::build(key, n, u, ConstructionKind::Linear);
        let build_ms = t_build.elapsed().as_secs_f64() * 1000.0;

        let target_wm = (1u32 << (n - 1)) + 137;
        let mut noisy = cb.words[target_wm as usize].to_bits(u);
        for pos in (0..u).step_by(23) {
            noisy[pos] ^= 1;
        }

        let t_ham = Instant::now();
        let m_ham = cb.search_parallel(&noisy, DistanceMetric::Hamming, threads);
        let ham_ms = t_ham.elapsed().as_secs_f64() * 1000.0;

        let mut noisy_del = noisy.clone();
        noisy_del.remove(40);
        noisy_del.remove(15);
        let t_lev = Instant::now();
        let m_lev = cb.search_parallel(&noisy_del, DistanceMetric::Levenshtein, threads);
        let lev_ms = t_lev.elapsed().as_secs_f64() * 1000.0;

        let bch = BCHCodec::new(n, u);
        let bch_cw = bch.encode(target_wm as u64);
        let mut bch_noisy = bch_cw.clone();
        for pos in (0..u).step_by(23) {
            bch_noisy[pos] ^= 1;
        }
        let t_bch = Instant::now();
        let (bch_wm, _, _) = bch.decode(&bch_noisy);
        let bch_ms = t_bch.elapsed().as_secs_f64() * 1000.0;

        let comma = if idx + 1 < configs.len() { "," } else { "" };
        println!(
            "  {{\"n\": {n}, \"u\": {u}, \"entries\": {}, \"build_ms\": {:.3}, \"hamming_ms\": {:.3}, \"levenshtein_ms\": {:.3}, \"bch_ms\": {:.3}, \"ham_ok\": {}, \"lev_ok\": {}, \"bch_ok\": {}}}{comma}",
            1usize << n,
            build_ms,
            ham_ms,
            lev_ms,
            bch_ms,
            m_ham.watermark == target_wm,
            m_lev.watermark == target_wm,
            bch_wm == target_wm as u64
        );
    }
    println!("]}}");
}
