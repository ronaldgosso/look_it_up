//! Core cryptographic and error-correction primitives for
//! "Look It Up: Multi-bit LLM Watermarking via Codebook Search" (arXiv:2611.16890).
//!
//! Zero external dependencies so the same bit-exact engine compiles both to
//! multi-threaded native code (`llmw-native`) and WebAssembly (`llmw-wasm`).

pub mod bch;
pub mod codebook;
pub mod distances;
pub mod prng;
