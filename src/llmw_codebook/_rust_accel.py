"""Optional zero-copy ctypes bridge to the compiled `llmw-native` Rust library."""

from __future__ import annotations

import ctypes
import os
import sys
from pathlib import Path

import numpy as np

_LIB_NAMES = {
    "win32": ("llmw_native.dll", "libllmw_native.dll"),
    "darwin": ("libllmw_native.dylib",),
}


def _candidate_lib_paths() -> list[Path]:
    names = _LIB_NAMES.get(sys.platform, ("libllmw_native.so",))
    repo_root = Path(__file__).resolve().parents[2]
    pkg_dir = Path(__file__).resolve().parent
    search_dirs = [
        pkg_dir,
        repo_root / "target" / "release",
        repo_root / "target" / "debug",
    ]
    env_dir = os.environ.get("LLMW_NATIVE_DIR")
    if env_dir:
        search_dirs.insert(0, Path(env_dir))

    paths: list[Path] = []
    for d in search_dirs:
        for name in names:
            paths.append(d / name)
    return paths


class _NativeLibrary:
    def __init__(self) -> None:
        self.lib: ctypes.CDLL | None = None
        self.path: Path | None = None
        self._load()

    def _load(self) -> None:
        for p in _candidate_lib_paths():
            if p.is_file():
                try:
                    lib = ctypes.CDLL(str(p))
                    self._bind(lib)
                    self.lib = lib
                    self.path = p
                    return
                except OSError:
                    continue

    def _bind(self, lib: ctypes.CDLL) -> None:
        c_u8_p = ctypes.POINTER(ctypes.c_uint8)
        c_u32_p = ctypes.POINTER(ctypes.c_uint32)
        c_u64_p = ctypes.POINTER(ctypes.c_uint64)
        c_i64_p = ctypes.POINTER(ctypes.c_int64)
        c_void_p = ctypes.c_void_p

        lib.llmw_abi_version.restype = ctypes.c_uint32
        lib.llmw_recommended_threads.restype = ctypes.c_size_t

        lib.llmw_levenshtein.argtypes = [c_u8_p, ctypes.c_size_t, c_u8_p, ctypes.c_size_t]
        lib.llmw_levenshtein.restype = ctypes.c_uint32

        lib.llmw_split_vocab.argtypes = [ctypes.c_size_t, ctypes.c_uint64, c_u8_p]
        lib.llmw_split_vocab.restype = ctypes.c_int32

        lib.llmw_codebook_new.argtypes = [
            c_u8_p,
            ctypes.c_size_t,
            ctypes.c_size_t,
            ctypes.c_size_t,
            ctypes.c_uint32,
        ]
        lib.llmw_codebook_new.restype = c_void_p

        lib.llmw_codebook_free.argtypes = [c_void_p]
        lib.llmw_codebook_free.restype = None

        lib.llmw_codebook_d_min.argtypes = [c_void_p]
        lib.llmw_codebook_d_min.restype = ctypes.c_int32

        lib.llmw_codebook_encode.argtypes = [c_void_p, ctypes.c_uint32, c_u8_p]
        lib.llmw_codebook_encode.restype = ctypes.c_int32

        lib.llmw_codebook_search.argtypes = [
            c_void_p,
            c_u8_p,
            ctypes.c_size_t,
            ctypes.c_uint32,
            ctypes.c_size_t,
            c_u32_p,
            c_u32_p,
            c_i64_p,
            c_u8_p,
        ]
        lib.llmw_codebook_search.restype = ctypes.c_int32

        lib.llmw_bch_encode.argtypes = [ctypes.c_size_t, ctypes.c_size_t, ctypes.c_uint64, c_u8_p]
        lib.llmw_bch_encode.restype = ctypes.c_int32

        lib.llmw_bch_decode.argtypes = [
            ctypes.c_size_t,
            ctypes.c_size_t,
            c_u8_p,
            c_u64_p,
            c_u32_p,
            c_u8_p,
        ]
        lib.llmw_bch_decode.restype = ctypes.c_int32


_NATIVE = _NativeLibrary()


def is_native_available() -> bool:
    """Return True if the compiled Rust `llmw_native` library is loaded."""
    return _NATIVE.lib is not None


def backend_info() -> dict[str, object]:
    """Return diagnostic metadata about active acceleration."""
    if _NATIVE.lib is None:
        return {"backend": "python-numpy", "native_path": None, "threads": 1}
    return {
        "backend": "rust-native",
        "abi_version": int(_NATIVE.lib.llmw_abi_version()),
        "native_path": str(_NATIVE.path),
        "threads": int(_NATIVE.lib.llmw_recommended_threads()),
    }


def _as_u8_ptr(arr: np.ndarray) -> tuple[np.ndarray, ctypes.POINTER(ctypes.c_uint8)]:
    contig = np.ascontiguousarray(arr, dtype=np.uint8)
    ptr = contig.ctypes.data_as(ctypes.POINTER(ctypes.c_uint8))
    return contig, ptr


def native_levenshtein(a: np.ndarray, b: np.ndarray) -> int:
    assert _NATIVE.lib is not None
    ac, ap = _as_u8_ptr(a)
    bc, bp = _as_u8_ptr(b)
    return int(_NATIVE.lib.llmw_levenshtein(ap, len(ac), bp, len(bc)))


def native_split_vocab(vocab_size: int, seed: int) -> np.ndarray:
    assert _NATIVE.lib is not None
    out = np.empty(vocab_size, dtype=np.uint8)
    _, op = _as_u8_ptr(out)
    rc = _NATIVE.lib.llmw_split_vocab(vocab_size, seed & ((1 << 64) - 1), op)
    if rc != 0:
        raise RuntimeError(f"llmw_split_vocab failed with code {rc}")
    return out.astype(bool)


def native_bch_encode(n: int, u: int, watermark: int) -> np.ndarray:
    assert _NATIVE.lib is not None
    out = np.empty(u, dtype=np.uint8)
    _, op = _as_u8_ptr(out)
    rc = _NATIVE.lib.llmw_bch_encode(n, u, watermark, op)
    if rc != 0:
        raise RuntimeError(f"llmw_bch_encode failed with code {rc}")
    return out


def native_bch_decode(n: int, u: int, received: np.ndarray) -> tuple[int, int, np.ndarray]:
    assert _NATIVE.lib is not None
    rc_arr, rp = _as_u8_ptr(received)
    if len(rc_arr) != u:
        raise ValueError(f"Expected length {u}, got {len(rc_arr)}")
    out_wm = ctypes.c_uint64(0)
    out_flips = ctypes.c_uint32(0)
    out_cw = np.empty(u, dtype=np.uint8)
    _, op = _as_u8_ptr(out_cw)
    rc = _NATIVE.lib.llmw_bch_decode(
        n, u, rp, ctypes.byref(out_wm), ctypes.byref(out_flips), op
    )
    if rc != 0:
        raise RuntimeError(f"llmw_bch_decode failed with code {rc}")
    return int(out_wm.value), int(out_flips.value), out_cw


class NativeCodebookHandle:
    """RAII wrapper owning a Rust `PackedCodebook` allocation."""

    def __init__(self, secret_key: str, n: int, u: int, construction: str) -> None:
        assert _NATIVE.lib is not None
        self._lib = _NATIVE.lib
        self.u = u
        key_bytes = secret_key.encode("utf-8")
        key_arr = np.frombuffer(key_bytes, dtype=np.uint8)
        _, kp = _as_u8_ptr(key_arr)
        kind_code = 0 if construction == "linear" else 1
        ptr = self._lib.llmw_codebook_new(kp, len(key_bytes), n, u, kind_code)
        if not ptr:
            raise RuntimeError(f"llmw_codebook_new failed for n={n}, u={u}, kind={construction}")
        self._ptr = ctypes.c_void_p(ptr)

    def __del__(self) -> None:
        ptr = getattr(self, "_ptr", None)
        lib = getattr(self, "_lib", None)
        if ptr and lib:
            lib.llmw_codebook_free(ptr)
            self._ptr = None

    def encode(self, watermark: int) -> np.ndarray:
        out = np.empty(self.u, dtype=np.uint8)
        _, op = _as_u8_ptr(out)
        rc = self._lib.llmw_codebook_encode(self._ptr, watermark, op)
        if rc != 0:
            raise RuntimeError(f"llmw_codebook_encode failed with code {rc}")
        return out

    def exact_d_min(self) -> int:
        res = int(self._lib.llmw_codebook_d_min(self._ptr))
        if res < 0:
            raise RuntimeError(f"llmw_codebook_d_min failed with code {res}")
        return res

    def search(
        self,
        candidate: np.ndarray,
        metric: str,
        threads: int = 0,
    ) -> tuple[int, int, int | None, np.ndarray]:
        cand_arr, cp = _as_u8_ptr(candidate)
        metric_code = 0 if metric == "hamming" else 1
        out_wm = ctypes.c_uint32(0)
        out_dist = ctypes.c_uint32(0)
        out_second = ctypes.c_int64(-1)
        out_cw = np.empty(self.u, dtype=np.uint8)
        _, cwp = _as_u8_ptr(out_cw)
        rc = self._lib.llmw_codebook_search(
            self._ptr,
            cp,
            len(cand_arr),
            metric_code,
            threads,
            ctypes.byref(out_wm),
            ctypes.byref(out_dist),
            ctypes.byref(out_second),
            cwp,
        )
        if rc != 0:
            raise RuntimeError(f"llmw_codebook_search failed with code {rc}")
        sec = None if out_second.value < 0 else int(out_second.value)
        return int(out_wm.value), int(out_dist.value), sec, out_cw
