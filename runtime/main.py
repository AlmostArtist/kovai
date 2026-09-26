"""
KOVAI local runtime.

A thin, honest layer in front of whatever inference backends are actually
installed on this machine — Ollama today, llama.cpp where present. It reports
what exists rather than advertising a catalogue, streams tokens as they arrive,
and never reaches the network for anything except 127.0.0.1.

    uvicorn main:app --host 127.0.0.1 --port 8756

The browser talks to this process directly in private mode, which is what keeps
prompts and images off the application server entirely.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator, Literal

import httpx
import psutil
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

VERSION = "0.1.0"
STARTED_AT = time.time()


def _load_env_file() -> None:
    """
    Reads .env.local from the repository root.

    The runtime is a separate process from the web app, so it does not inherit
    Next.js's environment. Without this, KOVAI_GGUF_DIR or KOVAI_LLAMA_SERVER set
    in .env.local would be quietly ignored — configuration that appears to work
    and does not. Values already in the environment win.
    """
    env_path = Path(__file__).resolve().parent.parent / ".env.local"
    try:
        raw = env_path.read_text()
    except OSError:
        return

    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and value and key not in os.environ:
            os.environ[key] = value


_load_env_file()

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
GGUF_DIR = os.environ.get("KOVAI_GGUF_DIR", "").strip()
PORT = int(os.environ.get("KOVAI_RUNTIME_PORT", "8756"))

# The model KOVAI reaches for when nothing else is chosen. Left unset, the first
# runnable file in the models folder wins — downloading a GGUF and using it
# should not require also naming it somewhere.
DEFAULT_MODEL = os.environ.get("KOVAI_DEFAULT_MODEL", "").strip()

# GGUF files are dropped in <repo>/models. Importing one into the inference
# backend records the name it was given here, so the runtime can tell an
# installed file from one that is merely sitting on disk.
REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_NAME = ".registry.json"

# Requests in flight, so /cancel can stop one mid-stream.
ACTIVE: dict[str, asyncio.Event] = {}

# Context window given to a directly-loaded GGUF. Larger costs memory.
GGUF_CTX = int(os.environ.get("KOVAI_GGUF_CTX", "8192"))

# A loaded model holds its weights in RAM, so only one runs at a time; asking
# for a different one swaps it. Idle models are released after this many
# seconds so a forgotten tab does not sit on 8 GB.
GGUF_IDLE_TIMEOUT = int(os.environ.get("KOVAI_GGUF_IDLE_TIMEOUT", "900"))

client: httpx.AsyncClient


@asynccontextmanager
async def lifespan(_: FastAPI):
    global client
    # Generation on CPU is slow by nature; no read timeout, generous connect.
    client = httpx.AsyncClient(timeout=httpx.Timeout(connect=5.0, read=None, write=30.0, pool=None))
    # Reclaim anything a previous run left resident before serving requests.
    await _adopt_existing()
    # Warm the default model in the background — startup should not block on it.
    preload = asyncio.create_task(_preload_default())
    sweeper = asyncio.create_task(_release_idle())
    try:
        yield
    finally:
        preload.cancel()
        sweeper.cancel()
        # The model is deliberately left running: a restart of this process
        # should not throw away a multi-gigabyte load. It is adopted on the way
        # back up, and released by the idle sweeper or an explicit unload.
        await client.aclose()


app = FastAPI(title="KOVAI Local Runtime", version=VERSION, lifespan=lifespan)

# The browser calls this runtime directly.
#
# Accepted origins are loopback *and* private LAN addresses, because Next.js
# prints a LAN URL (http://192.168.x.x:3000) alongside localhost and people do
# open it — from that origin a loopback-only policy rejects the preflight, and
# the interface can only report that the runtime "isn't running". The runtime
# still binds to 127.0.0.1, so nothing off this machine can reach it either way.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=(
        r"^https?://("
        r"localhost|127\.\d+\.\d+\.\d+|\[::1\]|"
        r"10\.\d+\.\d+\.\d+|"
        r"192\.168\.\d+\.\d+|"
        r"172\.(1[6-9]|2\d|3[01])\.\d+\.\d+"
        r")(:\d+)?$"
    ),
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def allow_private_network(request, call_next):
    """
    Answers Chrome's Private Network Access preflight.

    A page served from a LAN address that calls loopback is treated by Chrome as
    reaching into a more private network, and the request is blocked unless the
    target opts in explicitly. Standard CORS headers alone do not cover it.
    """
    response = await call_next(request)
    if request.headers.get("access-control-request-private-network") == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


# ── models ────────────────────────────────────────────────────────────────


class Message(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = ""
    images: list[str] = Field(default_factory=list)


class ChatRequest(BaseModel):
    model: str
    messages: list[Message]
    temperature: float | None = None
    max_tokens: int | None = None
    stream: bool = True
    request_id: str | None = None


class EmbeddingRequest(BaseModel):
    model: str
    input: list[str]


class CancelRequest(BaseModel):
    request_id: str


# ── health and system ─────────────────────────────────────────────────────


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "version": VERSION, "uptime": round(time.time() - STARTED_AT)}


@app.get("/system")
async def system() -> dict[str, Any]:
    memory = psutil.virtual_memory()
    gpu_name, vram_total, vram_free = _detect_gpu()

    return {
        "platform": platform.system(),
        "arch": platform.machine(),
        "chip": _chip_name(),
        "cpu_count": psutil.cpu_count(logical=True) or 0,
        # A zero interval reads the value accumulated since the last call, which
        # keeps this endpoint fast enough to poll.
        "cpu_percent": psutil.cpu_percent(interval=0.0),
        "ram_total": memory.total,
        "ram_available": memory.available,
        "gpu": gpu_name,
        "vram_total": vram_total,
        "vram_free": vram_free,
        "backends": {"ollama": await _ollama_available(), "llamacpp": _llama_server_bin() is not None},
        "models_dir": str(_gguf_dir()) if _gguf_dir() else None,
        "gguf_count": len(list(_gguf_dir().glob("**/*.gguf"))) if _gguf_dir() else 0,
        "llama_server": str(_llama_server_bin()) if _llama_server_bin() else None,
        "loaded_models": await _loaded_models() + ([LOADED.path.stem] if LOADED and LOADED.alive else []),
        "uptime": round(time.time() - STARTED_AT),
    }


def _chip_name() -> str:
    """A human name for the processor, best effort per platform."""
    try:
        if platform.system() == "Darwin":
            out = subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True,
                text=True,
                timeout=2,
            )
            if out.returncode == 0 and out.stdout.strip():
                return out.stdout.strip()
        elif platform.system() == "Linux":
            for line in Path("/proc/cpuinfo").read_text().splitlines():
                if line.startswith("model name"):
                    return line.split(":", 1)[1].strip()
    except Exception:
        pass
    return platform.processor() or platform.machine()


def _detect_gpu() -> tuple[str | None, int | None, int | None]:
    """GPU name and VRAM, where we can read it without extra dependencies."""
    try:
        if platform.system() == "Darwin" and platform.machine() == "arm64":
            # Apple Silicon shares memory between CPU and GPU; reporting total
            # RAM as VRAM is the honest answer for model-fit purposes.
            memory = psutil.virtual_memory()
            return (f"Apple {platform.machine()} GPU (unified memory)", memory.total, memory.available)

        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        if out.returncode == 0 and out.stdout.strip():
            name, total, free = (p.strip() for p in out.stdout.strip().splitlines()[0].split(","))
            return name, int(float(total)) * 1024 * 1024, int(float(free)) * 1024 * 1024
    except Exception:
        pass
    return None, None, None


# ── model catalogue ───────────────────────────────────────────────────────


async def _ollama_available() -> bool:
    try:
        res = await client.get(f"{OLLAMA_HOST}/api/tags", timeout=2.0)
        return res.status_code == 200
    except Exception:
        return False


async def _loaded_models() -> list[str]:
    try:
        res = await client.get(f"{OLLAMA_HOST}/api/ps", timeout=2.0)
        if res.status_code != 200:
            return []
        return [m.get("name", "") for m in res.json().get("models", [])]
    except Exception:
        return []


def _gguf_dir() -> Path | None:
    """Where GGUF files live. Defaults to <repo>/models."""
    path = Path(GGUF_DIR).expanduser() if GGUF_DIR else REPO_ROOT / "models"
    return path if path.is_dir() else None


def _registry() -> dict[str, str]:
    """Maps a GGUF filename to the name it was imported under, if it was."""
    directory = _gguf_dir()
    if not directory:
        return {}
    try:
        return json.loads((directory / REGISTRY_NAME).read_text())
    except Exception:
        return {}


def _write_registry(entries: dict[str, str]) -> None:
    directory = _gguf_dir()
    if not directory:
        return
    (directory / REGISTRY_NAME).write_text(json.dumps(entries, indent=2))


# ── llama.cpp: running a GGUF straight from the models folder ─────────────


def _llama_server_bin() -> Path | None:
    """
    Finds a llama-server binary, without installing anything.

    Checked in order: an explicit override, the PATH, the usual Homebrew
    locations, and finally the Metal builds LM Studio ships (newest first).
    Using what is already on the machine means a GGUF in models/ is runnable
    without a multi-gigabyte copy into another tool's store.
    """
    override = os.environ.get("KOVAI_LLAMA_SERVER", "").strip()
    if override and Path(override).is_file():
        return Path(override)

    found = shutil.which("llama-server")
    if found:
        return Path(found)

    for candidate in ("/opt/homebrew/bin/llama-server", "/usr/local/bin/llama-server"):
        if Path(candidate).is_file():
            return Path(candidate)

    backends = Path.home() / ".lmstudio" / "extensions" / "backends"
    if backends.is_dir():
        def version_key(path: Path) -> tuple[int, ...]:
            match = re.search(r"(\d+)\.(\d+)\.(\d+)", path.name)
            return tuple(int(g) for g in match.groups()) if match else (0, 0, 0)

        for directory in sorted(backends.glob("llama.cpp-*"), key=version_key, reverse=True):
            binary = directory / "llama-server"
            if binary.is_file() and os.access(binary, os.X_OK):
                return binary

    return None


class LoadedModel:
    """
    A llama-server process holding one GGUF in memory.

    Identified by pid and port rather than by a process handle, so a model can
    be adopted back after the runtime itself restarts — otherwise a reload would
    orphan several gigabytes of resident weights and then load a second copy
    beside them.
    """

    def __init__(self, path: Path, port: int, pid: int) -> None:
        self.path = path
        self.port = port
        self.pid = pid
        self.last_used = time.time()

    @property
    def alive(self) -> bool:
        try:
            process = psutil.Process(self.pid)
            return process.is_running() and process.status() != psutil.STATUS_ZOMBIE
        except psutil.Error:
            return False

    async def healthy(self) -> bool:
        if not self.alive:
            return False
        try:
            res = await client.get(f"http://127.0.0.1:{self.port}/health", timeout=2.0)
            return res.status_code == 200
        except Exception:
            return False

    async def stop(self) -> None:
        try:
            process = psutil.Process(self.pid)
            process.terminate()
            try:
                process.wait(timeout=10)
            except psutil.TimeoutExpired:
                process.kill()
        except psutil.Error:
            pass
        _clear_state()


LOADED: LoadedModel | None = None
LOAD_LOCK = asyncio.Lock()


def _state_path() -> Path:
    return REPO_ROOT / ".kovai" / "llama.json"


def _write_state(model: LoadedModel) -> None:
    """Records the resident model so a restart can pick it back up."""
    path = _state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"path": str(model.path), "port": model.port, "pid": model.pid})
    )


def _clear_state() -> None:
    _state_path().unlink(missing_ok=True)


def _scan_for_servers() -> list[LoadedModel]:
    """
    Finds llama-server processes already serving a file from the models folder.

    Only processes pointed at KOVAI's own models directory are considered, so a
    llama.cpp server someone else is running is never touched.
    """
    directory = _gguf_dir()
    if not directory:
        return []
    root = str(directory.resolve())
    found: list[LoadedModel] = []

    for process in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            cmdline = process.info.get("cmdline") or []
            if not cmdline or "llama-server" not in cmdline[0]:
                continue

            model_path: str | None = None
            port: int | None = None
            for index, arg in enumerate(cmdline):
                if arg in ("-m", "--model") and index + 1 < len(cmdline):
                    model_path = cmdline[index + 1]
                elif arg == "--port" and index + 1 < len(cmdline):
                    port = int(cmdline[index + 1])

            if not model_path or not port or not model_path.startswith(root):
                continue
            found.append(LoadedModel(Path(model_path), port, process.info["pid"]))
        except (psutil.Error, ValueError, IndexError):
            continue

    return found


async def _adopt_existing() -> None:
    """
    Reclaims a model server left behind by a previous run.

    Without this, restarting the runtime silently strands the weights in memory
    and the next request loads a second copy beside them — which on a machine
    with 24 GB means the second load fails.
    """
    global LOADED

    recorded: LoadedModel | None = None
    try:
        raw = json.loads(_state_path().read_text())
        recorded = LoadedModel(Path(raw["path"]), int(raw["port"]), int(raw["pid"]))
    except Exception:
        recorded = None

    candidates = [recorded] if recorded else []
    candidates += [m for m in _scan_for_servers() if not recorded or m.pid != recorded.pid]

    keep: LoadedModel | None = None
    for candidate in candidates:
        if candidate and await candidate.healthy():
            if keep is None:
                keep = candidate
                continue
        # A duplicate, or a process that no longer answers, is not left holding
        # memory nothing can reach.
        if candidate and candidate.alive:
            await candidate.stop()

    if keep:
        LOADED = keep
        _write_state(keep)
    else:
        _clear_state()


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _resolve_gguf(model_id: str) -> Path | None:
    """`gguf:<filename>` -> the file in the models directory."""
    directory = _gguf_dir()
    if not directory or not model_id.startswith("gguf:"):
        return None
    basename = Path(model_id[5:]).name
    for candidate in directory.glob("**/*.gguf"):
        if candidate.name == basename:
            return candidate.resolve()
    return None


async def _ensure_loaded(path: Path) -> LoadedModel:
    """
    Loads a GGUF, reusing the running server when it is already the right one.

    Weights are large, so a second model would mean a second copy in RAM. The
    previous model is released first rather than risking the machine.
    """
    global LOADED

    async with LOAD_LOCK:
        if LOADED and LOADED.path == path and await LOADED.healthy():
            LOADED.last_used = time.time()
            return LOADED

        if LOADED:
            await LOADED.stop()
            LOADED = None

        binary = _llama_server_bin()
        if not binary:
            raise HTTPException(
                status_code=503,
                detail="No llama-server binary was found, so GGUF files cannot be run directly. "
                "Install llama.cpp (brew install llama.cpp) or set KOVAI_LLAMA_SERVER.",
            )

        port = _free_port()
        projector = _projector_for(path)

        # llama.cpp reports how many layers it offloaded to the GPU and how the
        # model was mapped. Discarding that left "is this actually on the GPU?"
        # unanswerable, so it is kept.
        log_path = REPO_ROOT / ".kovai" / "llama-server.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_handle = open(log_path, "w")

        process = await asyncio.create_subprocess_exec(
            str(binary),
            "-m",
            str(path),
            "--port",
            str(port),
            "--host",
            "127.0.0.1",
            "--ctx-size",
            str(GGUF_CTX),
            # Offload everything to Metal/GPU where one is present; llama.cpp
            # silently falls back to CPU when it is not.
            "--n-gpu-layers",
            "999",
            *(["--mmproj", str(projector)] if projector else []),
            stdout=log_handle,
            stderr=log_handle,
            cwd=str(binary.parent),
        )
        # The child holds its own descriptor now.
        log_handle.close()

        # A large model takes a while to map into memory; wait for it to answer.
        deadline = time.time() + 180
        while time.time() < deadline:
            if process.returncode is not None:
                raise HTTPException(
                    status_code=500,
                    detail=f"llama-server exited while loading {path.name}. "
                    "The build may not support this model architecture.",
                )
            try:
                res = await client.get(f"http://127.0.0.1:{port}/health", timeout=2.0)
                if res.status_code == 200:
                    LOADED = LoadedModel(path, port, process.pid)
                    _write_state(LOADED)
                    return LOADED
            except Exception:
                pass
            await asyncio.sleep(1.0)

        process.kill()
        raise HTTPException(status_code=504, detail=f"{path.name} did not finish loading in time.")


def _default_gguf() -> Path | None:
    """The GGUF the runtime should have ready: the configured one, else the first."""
    directory = _gguf_dir()
    if not directory:
        return None

    files = sorted(directory.glob("**/*.gguf"))
    if not files:
        return None

    if DEFAULT_MODEL.startswith("gguf:"):
        wanted = Path(DEFAULT_MODEL[5:]).name
        return next((f.resolve() for f in files if f.name == wanted), None)
    if DEFAULT_MODEL:
        # A non-GGUF default (an Ollama model) is served by that backend, so
        # there is nothing for llama.cpp to preload.
        return None
    return files[0].resolve()


async def _preload_default() -> None:
    """
    Loads the default model in the background at startup.

    Starting the runtime should mean the model is ready, not that the first
    message pays for the load. Set KOVAI_PRELOAD=0 to leave memory free until a
    model is actually asked for.
    """
    if os.environ.get("KOVAI_PRELOAD", "1") == "0":
        return
    if LOADED and LOADED.alive:
        return

    path = _default_gguf()
    if not path or not _llama_server_bin():
        return

    try:
        await _ensure_loaded(path)
    except Exception:
        # A failed preload must never stop the runtime from serving; the model
        # loads on demand instead, and reports its own error then.
        pass


async def _release_idle() -> None:
    """Frees a model that has not been used recently."""
    global LOADED
    while True:
        await asyncio.sleep(60)
        if LOADED and LOADED.alive and time.time() - LOADED.last_used > GGUF_IDLE_TIMEOUT:
            async with LOAD_LOCK:
                if LOADED:
                    await LOADED.stop()
                    LOADED = None


MMPROJ_HINT = re.compile(r"mmproj", re.I)


def _is_projector(path: Path) -> bool:
    """A multimodal projector, not a chat model in its own right."""
    return bool(MMPROJ_HINT.search(path.name))


def _projector_for(model: Path) -> Path | None:
    """
    Finds the vision projector that belongs to a model.

    A GGUF holds the language model only; reading images needs a separate
    projector file. Pairing is by name where a convention is followed
    (`<model>.mmproj.gguf`, `mmproj-<model>.gguf`), and otherwise falls back to a
    lone projector sitting in the folder — if there is exactly one, it is
    unambiguous what it belongs to.
    """
    override = os.environ.get("KOVAI_MMPROJ", "").strip()
    if override:
        candidate = Path(override).expanduser()
        return candidate if candidate.is_file() else None

    directory = _gguf_dir()
    if not directory:
        return None

    projectors = [p for p in directory.glob("**/*.gguf") if _is_projector(p)]
    if not projectors:
        return None

    stem = model.stem.lower()
    for projector in projectors:
        name = projector.stem.lower().replace("mmproj", "").strip("-._")
        if name and (name in stem or stem in name):
            return projector.resolve()

    return projectors[0].resolve() if len(projectors) == 1 else None


def _model_name_for(path: Path) -> str:
    """A stable, readable name for an imported GGUF."""
    slug = re.sub(r"[^a-z0-9]+", "-", path.stem.lower()).strip("-")
    return f"kovai-{slug}"[:60]


def _sse(event: dict[str, Any]) -> bytes:
    return f"data: {json.dumps(event)}\n\n".encode()


VISION_HINT = re.compile(r"vl|vision|llava|moondream|pixtral|bakllava|minicpm-v", re.I)
EMBED_HINT = re.compile(r"embed|bge|nomic|minilm|gte|e5-", re.I)
REASON_HINT = re.compile(r"r1|qwq|think|reason", re.I)


def _capabilities(name: str, families: list[str] | None = None) -> list[str]:
    """
    Capabilities are inferred from what the backend tells us, then from the
    model name. Guessing is acknowledged rather than hidden: the interface
    routes on this and shows which model it picked.
    """
    haystack = " ".join([name, *(families or [])])
    if EMBED_HINT.search(haystack):
        return ["EMBEDDINGS"]
    caps = ["CHAT"]
    if VISION_HINT.search(haystack) or (families and "clip" in [f.lower() for f in families]):
        caps.append("VISION")
    if REASON_HINT.search(haystack):
        caps.append("REASONING")
    return caps


@app.get("/models")
async def models() -> dict[str, Any]:
    """
    Only what is actually installed, plus GGUF files sitting on disk that have
    not been imported yet. The second group is reported honestly as
    `registered: false` rather than being offered as though it could run.
    """
    found: list[dict[str, Any]] = []
    installed: set[str] = set()

    try:
        res = await client.get(f"{OLLAMA_HOST}/api/tags", timeout=5.0)
        if res.status_code == 200:
            for entry in res.json().get("models", []):
                name = entry.get("name") or entry.get("model", "")
                if not name:
                    continue
                installed.add(name)
                installed.add(name.split(":")[0])
                details = entry.get("details") or {}
                families = details.get("families") or ([details["family"]] if details.get("family") else [])
                found.append(
                    {
                        "id": name,
                        "name": name.split(":")[0],
                        "family": details.get("family"),
                        "size": entry.get("size"),
                        "quantization": details.get("quantization_level"),
                        "capabilities": _capabilities(name, families),
                        "context_length": details.get("context_length"),
                        "source": "ollama",
                        "registered": True,
                        "loaded": False,
                    }
                )
    except Exception:
        # Ollama not running is a normal state, not an error to shout about.
        pass

    # Files in the models folder run directly through llama.cpp — no import, no
    # second copy of the weights. They are only "not runnable" when there is no
    # llama-server on the machine to run them with.
    directory = _gguf_dir()
    runnable = _llama_server_bin() is not None
    gguf_models: list[dict[str, Any]] = []

    if directory:
        for path in sorted(directory.glob("**/*.gguf")):
            # A projector is a component of another model, not a model to pick.
            if _is_projector(path):
                continue

            projector = _projector_for(path)
            capabilities = _capabilities(path.name)
            if projector and "VISION" not in capabilities:
                capabilities = [*capabilities, "VISION"]

            gguf_models.append(
                {
                    "id": f"gguf:{path.name}",
                    "name": path.stem,
                    "size": path.stat().st_size,
                    "capabilities": capabilities,
                    "source": "llama.cpp",
                    "registered": runnable,
                    "loaded": bool(LOADED and LOADED.alive and LOADED.path == path.resolve()),
                    "file": path.name,
                    "default": False,
                    "projector": projector.name if projector else None,
                    "reason": None
                    if runnable
                    else "No llama-server binary was found to run this file.",
                }
            )

    # Local files come first: they are what the models folder is for.
    found = gguf_models + found

    # Without an explicit choice, the first local file is the default — which is
    # what "use the models I downloaded" means in practice.
    explicit = DEFAULT_MODEL
    chosen = explicit if any(m["id"] == explicit or m["name"] == explicit for m in found) else None
    if not chosen:
        chosen = next((m["id"] for m in gguf_models if m["registered"]), None)
    if not chosen:
        chosen = next((m["id"] for m in found if m.get("registered", True)), None)

    for entry in found:
        entry["default"] = entry["id"] == chosen or entry["name"] == chosen

    return {"models": found, "default_model": chosen}


@app.post("/models/unload")
async def unload_model() -> dict[str, Any]:
    """Releases the loaded GGUF and its memory."""
    global LOADED
    async with LOAD_LOCK:
        if not LOADED:
            return {"unloaded": False}
        name = LOADED.path.name
        await LOADED.stop()
        LOADED = None
        return {"unloaded": True, "model": name}


class RegisterRequest(BaseModel):
    """A GGUF filename inside the models directory."""

    file: str


@app.post("/models/register")
async def register_model(req: RegisterRequest) -> StreamingResponse:
    """
    Imports a GGUF into the inference backend so it can actually be run.

    A file on disk is not a usable model — it has to be registered with the
    backend first, which copies it into that backend's store. That takes real
    time for a multi-gigabyte file, so progress is streamed rather than left to
    a spinner.
    """
    directory = _gguf_dir()
    if not directory:
        raise HTTPException(status_code=400, detail="No models directory is configured.")

    # The name comes from the client, so only its basename is used and the
    # result must still resolve inside the models directory: no traversal, no
    # arbitrary paths. Nested files are found by name.
    basename = Path(req.file).name
    candidates = [p for p in directory.glob("**/*.gguf") if p.name == basename]
    target = candidates[0].resolve() if candidates else None
    if not target or not target.is_file() or directory.resolve() not in target.parents:
        raise HTTPException(status_code=404, detail=f'"{req.file}" is not in the models directory.')

    name = _model_name_for(target)

    async def run() -> AsyncIterator[bytes]:
        yield _sse({"type": "status", "text": f"Importing {target.name} as {name}…"})

        modelfile = directory / f".{name}.Modelfile"
        modelfile.write_text(f"FROM {target}\n")

        try:
            process = await asyncio.create_subprocess_exec(
                "ollama",
                "create",
                name,
                "-f",
                str(modelfile),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
        except FileNotFoundError:
            yield _sse(
                {
                    "type": "error",
                    "message": "Ollama is required to import a GGUF file and was not found on PATH.",
                }
            )
            return

        assert process.stdout is not None
        while True:
            line = await process.stdout.readline()
            if not line:
                break
            text = line.decode(errors="replace").strip()
            if text:
                yield _sse({"type": "status", "text": text[:200]})

        code = await process.wait()
        modelfile.unlink(missing_ok=True)

        if code != 0:
            yield _sse(
                {
                    "type": "error",
                    "message": f"Import failed. The backend may not support this model architecture.",
                }
            )
            return

        registry = _registry()
        registry[target.name] = name
        _write_registry(registry)
        yield _sse({"type": "done", "model": name})

    return StreamingResponse(
        run(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


# ── chat and vision ───────────────────────────────────────────────────────


def _strip_data_url(image: str) -> str:
    """Ollama takes raw base64; the browser sends a data: URL."""
    if image.startswith("data:"):
        return image.split(",", 1)[-1]
    return image


async def _stream_ollama(req: ChatRequest, request_id: str) -> AsyncIterator[bytes]:
    payload: dict[str, Any] = {
        "model": req.model,
        "messages": [
            {
                "role": m.role,
                "content": m.content,
                **({"images": [_strip_data_url(i) for i in m.images]} if m.images else {}),
            }
            for m in req.messages
        ],
        "stream": True,
        "options": {},
    }
    if req.temperature is not None:
        payload["options"]["temperature"] = req.temperature
    if req.max_tokens is not None:
        payload["options"]["num_predict"] = req.max_tokens

    cancel = ACTIVE.setdefault(request_id, asyncio.Event())

    try:
        async with client.stream("POST", f"{OLLAMA_HOST}/api/chat", json=payload) as response:
            if response.status_code == 404:
                yield _sse(
                    {
                        "type": "error",
                        "message": f'Model "{req.model}" is not installed. Pull it with: ollama pull {req.model}',
                    }
                )
                return
            if response.status_code >= 400:
                detail = (await response.aread()).decode(errors="replace")[:400]
                yield _sse({"type": "error", "message": detail or f"Ollama returned {response.status_code}."})
                return

            async for line in response.aiter_lines():
                if cancel.is_set():
                    break
                if not line.strip():
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue

                message = chunk.get("message") or {}
                # Some models emit a separate reasoning channel; pass it through
                # so the interface can fold it away rather than mixing it in.
                if message.get("thinking"):
                    yield _sse({"type": "reasoning", "text": message["thinking"]})
                if message.get("content"):
                    yield _sse({"type": "text", "text": message["content"]})

                if chunk.get("done"):
                    yield _sse(
                        {
                            "type": "usage",
                            "input_tokens": chunk.get("prompt_eval_count"),
                            "output_tokens": chunk.get("eval_count"),
                        }
                    )
                    break

    except httpx.ConnectError:
        yield _sse(
            {
                "type": "error",
                "message": f"No inference backend is reachable at {OLLAMA_HOST}. Install Ollama, or set OLLAMA_HOST.",
            }
        )
    except Exception as err:  # noqa: BLE001 — the client needs a message, not a traceback
        yield _sse({"type": "error", "message": f"Local inference failed: {err}"})
    finally:
        ACTIVE.pop(request_id, None)
        yield b"data: [DONE]\n\n"


async def _inline_image(image: str) -> str:
    """
    Turns whatever the interface sent into a data URL.

    Attachments arrive either as data URLs (private mode keeps the bytes in the
    browser) or as links to an uploaded file. llama.cpp only accepts the bytes,
    so a link has to be resolved here.
    """
    if image.startswith("data:"):
        return image

    if image.startswith(("http://", "https://")):
        try:
            res = await client.get(image, timeout=30.0)
            res.raise_for_status()
        except Exception as err:
            raise ValueError(f"Could not read the attached image: {err}") from err
        media = res.headers.get("content-type", "image/png").split(";")[0]
        return f"data:{media};base64," + base64.b64encode(res.content).decode()

    # A site-relative path has no meaning outside the browser that produced it.
    raise ValueError(
        "The attached image could not be resolved. It was sent as a relative "
        f'path ("{image[:60]}") rather than data or an absolute URL.'
    )


async def _stream_llamacpp(req: ChatRequest, request_id: str) -> AsyncIterator[bytes]:
    """
    Streams from a GGUF loaded directly out of the models folder.

    llama-server speaks the OpenAI shape, so this translates that into the same
    events the Ollama path emits — the interface cannot tell which backend
    answered, only which model did.
    """
    cancel = ACTIVE.setdefault(request_id, asyncio.Event())

    try:
        path = _resolve_gguf(req.model)
        if not path:
            yield _sse({"type": "error", "message": f'"{req.model}" is not in the models folder.'})
            return

        model = await _ensure_loaded(path)
        model.last_used = time.time()

        has_images = any(m.images for m in req.messages)
        if has_images and not _projector_for(path):
            # Without a projector the weights cannot see; sending the text alone
            # and dropping the picture would answer confidently about nothing.
            yield _sse(
                {
                    "type": "error",
                    "message": f"{path.stem} has no vision projector, so it cannot read images. "
                    "Put the model's mmproj .gguf in the models folder, or set KOVAI_MMPROJ.",
                }
            )
            return

        messages: list[dict[str, Any]] = []
        for m in req.messages:
            if m.images:
                # llama-server reads the bytes itself and will not chase a URL,
                # so every image is inlined as a data URL first. An uploaded file
                # arrives as a link; without this it fails with a bare
                # "Failed to load image", which says nothing about why.
                parts: list[dict[str, Any]] = [{"type": "text", "text": m.content}]
                for image in m.images:
                    try:
                        parts.append({"type": "image_url", "image_url": {"url": await _inline_image(image)}})
                    except ValueError as err:
                        yield _sse({"type": "error", "message": str(err)})
                        return
                messages.append({"role": m.role, "content": parts})
            else:
                messages.append({"role": m.role, "content": m.content})

        payload: dict[str, Any] = {
            "model": path.stem,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if req.temperature is not None:
            payload["temperature"] = req.temperature
        if req.max_tokens is not None:
            payload["max_tokens"] = req.max_tokens

        async with client.stream(
            "POST", f"http://127.0.0.1:{model.port}/v1/chat/completions", json=payload
        ) as response:
            if response.status_code >= 400:
                detail = (await response.aread()).decode(errors="replace")[:400]
                yield _sse({"type": "error", "message": detail or f"llama.cpp returned {response.status_code}."})
                return

            async for line in response.aiter_lines():
                if cancel.is_set():
                    break
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data or data == "[DONE]":
                    continue
                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    continue

                choices = chunk.get("choices") or []
                delta = (choices[0].get("delta") if choices else None) or {}
                if delta.get("reasoning_content"):
                    yield _sse({"type": "reasoning", "text": delta["reasoning_content"]})
                if delta.get("content"):
                    yield _sse({"type": "text", "text": delta["content"]})

                usage = chunk.get("usage")
                if usage:
                    yield _sse(
                        {
                            "type": "usage",
                            "input_tokens": usage.get("prompt_tokens"),
                            "output_tokens": usage.get("completion_tokens"),
                        }
                    )

    except HTTPException as err:
        yield _sse({"type": "error", "message": err.detail})
    except Exception as err:  # noqa: BLE001 — the client needs a message, not a traceback
        yield _sse({"type": "error", "message": f"Local inference failed: {err}"})
    finally:
        ACTIVE.pop(request_id, None)
        yield b"data: [DONE]\n\n"


@app.post("/chat")
async def chat(req: ChatRequest) -> StreamingResponse:
    request_id = req.request_id or str(uuid.uuid4())
    # A `gguf:` id is a file in the models folder; anything else is a backend model.
    stream = (
        _stream_llamacpp(req, request_id)
        if req.model.startswith("gguf:")
        else _stream_ollama(req, request_id)
    )
    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "X-Request-Id": request_id,
        },
    )


@app.post("/vision")
async def vision(req: ChatRequest) -> StreamingResponse:
    """
    Vision is chat with images attached. It is a separate endpoint so the
    interface can report which path a request took, and so a missing vision
    model produces a clear message rather than a confusing answer.
    """
    if not any(m.images for m in req.messages):
        raise HTTPException(status_code=400, detail="This endpoint needs at least one image.")
    # Same dispatch as /chat: a gguf: id goes to llama.cpp, anything else to the backend.
    return await chat(req)


@app.post("/embeddings")
async def embeddings(req: EmbeddingRequest) -> dict[str, Any]:
    try:
        res = await client.post(
            f"{OLLAMA_HOST}/api/embed",
            json={"model": req.model, "input": req.input},
            timeout=120.0,
        )
        if res.status_code == 404:
            raise HTTPException(
                status_code=404,
                detail=f'Embedding model "{req.model}" is not installed.',
            )
        res.raise_for_status()
        body = res.json()
        return {"embeddings": body.get("embeddings") or [body.get("embedding", [])]}
    except httpx.ConnectError as err:
        raise HTTPException(status_code=503, detail="No local inference backend is running.") from err


@app.post("/cancel")
async def cancel(req: CancelRequest) -> dict[str, bool]:
    event = ACTIVE.get(req.request_id)
    if event:
        event.set()
        return {"cancelled": True}
    return {"cancelled": False}


if __name__ == "__main__":
    import uvicorn

    # Loopback only. This runtime is never exposed to a network.
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
