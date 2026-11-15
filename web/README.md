# Look It Up Web Studio

This frontend runs the watermarking studio directly in the browser with React 19, TypeScript, Vite, and Tailwind CSS v4. Every cryptographic hash, codebook search, BCH syndrome solve, and attack diff executes client-side through `public/llmw_wasm.wasm`, a `64,001`-byte binary compiled from `crates/llmw-wasm` and loaded by [llmwWasm.ts](src/wasm/llmwWasm.ts).

Language generation and adversarial attacks in standalone mode use synchronized N-gram tables and lexicons in [modelData.json](src/engine/modelData.json) plus benchmark snapshots in `public/benchmarks.json`. Whenever Rust or Python lexicons change, regenerate those static assets from the repository root with `python scripts/export_web_assets.py`.

If you want real HuggingFace tokenizers and logits instead of the built-in N-gram model, start the optional Python backend (`uvicorn llmw_codebook.api:app --port 8000`) locally. [apiClient.ts](src/engine/apiClient.ts) checks port 8000 at startup and routes embed, extract, and attack calls there when available.

## Development Commands

Run these commands from inside `web/`:

```bash
npm install
npm run test
npm run lint
npm run build
npm run dev
```
