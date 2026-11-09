"""Downloads what the local pipeline needs into the repo folder (tools/, models/): python -m shorts.setup"""
from __future__ import annotations

import io
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
GH = "https://github.com"
HF = "https://huggingface.co"
LLAMA = "b12210"
SD = "master-1068-fc350be"


@dataclass(frozen=True)
class Item:
    name: str
    check: str                 # file that proves it is installed (relative to the repo)
    urls: tuple[str, ...]
    unzip_to: str | None = None
    size: int | None = None    # expected bytes, to catch interrupted downloads


ITEMS = [
    Item("llama.cpp (CUDA 12.4)", "tools/llama/llama-server.exe",
         (f"{GH}/ggml-org/llama.cpp/releases/download/{LLAMA}/llama-{LLAMA}-bin-win-cuda-12.4-x64.zip",
          f"{GH}/ggml-org/llama.cpp/releases/download/{LLAMA}/cudart-llama-bin-win-cuda-12.4-x64.zip"), "tools/llama"),
    Item("stable-diffusion.cpp (CUDA 12)", "tools/sd/sd-cli.exe",
         (f"{GH}/leejet/stable-diffusion.cpp/releases/download/{SD}/sd-{SD}-bin-win-cuda12-x64.zip",
          f"{GH}/leejet/stable-diffusion.cpp/releases/download/{SD}/cudart-sd-bin-win-cu12-x64.zip"), "tools/sd"),
    Item("Qwen3-8B Q4_K_M", "models/Qwen3-8B-Q4_K_M.gguf",
         (f"{HF}/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf",), size=5027783488),
    Item("DreamShaper XL Turbo v2.1", "models/DreamShaperXL_Turbo_v2_1.safetensors",
         (f"{HF}/Lykon/dreamshaper-xl-v2-turbo/resolve/main/DreamShaperXL_Turbo_v2_1.safetensors",), size=6939220250),
    Item("SDXL VAE fp16-fix", "models/sdxl.vae.safetensors",
         (f"{HF}/madebyollin/sdxl-vae-fp16-fix/resolve/main/sdxl.vae.safetensors",), size=334641162),
]


def missing(root: Path = ROOT, items: list[Item] = ITEMS) -> list[Item]:
    out = []
    for i in items:
        p = root / i.check
        if not p.exists() or (i.size and p.stat().st_size != i.size):
            out.append(i)
    return out


def _download(url: str, dst: Path) -> None:
    """resumable: a partial file continues where it stopped"""
    dst.parent.mkdir(parents=True, exist_ok=True)
    have = dst.stat().st_size if dst.exists() else 0
    headers = {"Range": f"bytes={have}-"} if have else {}
    with httpx.stream("GET", url, headers=headers, follow_redirects=True, timeout=60) as r:
        if r.status_code == 416:
            return
        r.raise_for_status()
        mode = "ab" if r.status_code == 206 else "wb"
        with dst.open(mode) as f:
            for chunk in r.iter_bytes(1 << 20):
                f.write(chunk)


def install(item: Item, root: Path = ROOT) -> None:
    for url in item.urls:
        print(f"  {url.rsplit('/', 1)[-1]}", flush=True)
        if item.unzip_to:
            data = httpx.get(url, follow_redirects=True, timeout=600).raise_for_status().content
            zipfile.ZipFile(io.BytesIO(data)).extractall(root / item.unzip_to)
        else:
            _download(url, root / item.check)


def main() -> int:
    todo = missing()
    if not todo:
        print("Modelli e strumenti locali già presenti.")
        return 0
    for item in todo:
        print(f"Scarico {item.name}…", flush=True)
        install(item)
    left = missing()
    if left:
        print("Download incompleti: " + ", ".join(i.name for i in left))
        return 1
    print("Pronto.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
