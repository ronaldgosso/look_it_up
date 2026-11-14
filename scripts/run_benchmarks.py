"""Run the reproducible Phase 2 benchmark suite and write results to benchmarks/."""

from __future__ import annotations

import argparse
from pathlib import Path

from llmw_codebook.benchmarks import run_attack_and_quality_suite, write_benchmark_outputs


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Phase 2 Rust/Python watermark benchmarks")
    parser.add_argument("-n", type=int, default=12)
    parser.add_argument("-u", type=int, default=127)
    parser.add_argument("--samples-per-prompt", type=int, default=2)
    parser.add_argument("--out-dir", type=Path, default=Path("benchmarks"))
    args = parser.parse_args()

    results = run_attack_and_quality_suite(
        n=args.n,
        u=args.u,
        samples_per_prompt=args.samples_per_prompt,
    )
    json_path, md_path = write_benchmark_outputs(args.out_dir, results)
    print(f"Wrote {json_path} and {md_path}")
    print(md_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
