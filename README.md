# KOVAI

**The Creative Intelligence Workspace.**
One workspace. Every model. Zero friction.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-black.svg)](https://nodejs.org)
[![Local-first](https://img.shields.io/badge/local--first-yes-black.svg)](#privacy)

KOVAI is an operating environment for AI work rather than a chat website: local
and cloud models behind one interface, browser-style tabs that keep their state,
image generation that keeps running while you do something else, and a hard
boundary between what stays on your machine and what does not.

---

## Install

**One command. It handles the rest.**

```bash
git clone https://github.com/kishorekrazzy/kovai.git
cd kovai
./install.sh          # Windows: install.bat
```

That checks your Node version, installs dependencies, walks you through your
API keys one at a time, and offers to start the workspace. Every key it asks
for is optional — press Enter to skip. Run it again whenever you want to add
or change one.

<details>
<summary><b>No terminal? Double-click instead.</b></summary>

<br>

Download the repo as a ZIP, unzip it, then:

- **macOS** — double-click `scripts/Start KOVAI.command`
- **Windows** — double-click `install.bat`

Both set themselves up on first run. macOS may ask you to allow the file the
first time: **System Settings → Privacy & Security → Open Anyway**.

</details>

**Requirements:** [Node 20+](https://nodejs.org). Python 3.10+ only if you want
to run local models; the installer builds its own environment for that on first
launch.

### Then

```bash
npm run dev        # http://localhost:3000
```

**`npm run dev` starts everything.** It brings up the local runtime (building
its Python environment on first run), warms the default model from `models/`,
then starts the web app — and shuts all of it down on Ctrl-C. There is no second
command to remember, because local models are unusable without the runtime and
the interface cannot start it for you before it exists.

```
[kovai] Starting the local runtime…
[kovai] 4 local models · default: Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q8_K_P
[kovai] Warming the model in the background…
[kovai] Starting KOVAI on http://localhost:3000
```

---

## Your own keys

**Nothing here is required.** With no keys at all, KOVAI runs entirely on your
machine against local models. Add a key and that provider lights up; leave one
out and it shows a setup state instead of a broken button.

| Key | What it buys | Where |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Cloud chat, vision and reasoning — hundreds of models behind one key, with a free tier | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `HF_API_KEY_ID` + `HF_API_KEY_SECRET` | Image and video generation | [higgsfield.ai](https://higgsfield.ai) |
| `KIE_API_KEY` | A second source for image and video | [kie.ai](https://kie.ai) |
| *(none)* | Local GGUF models, chat, vision, notes, projects, skills, agents | — |

Add them the easy way:

```bash
npm run setup
```

…or edit `.env.local` by hand — it is created from [`.env.example`](.env.example)
and keeps its comments. **`.env.local` is git-ignored and never leaves your
machine.** Keys are read server-side only; the browser never sees them.

No database is needed either: KOVAI persists to `.kovai/data.json` until you
give it a `DATABASE_URL`.

Other entry points, when you want the pieces separately:

| | |
| --- | --- |
| `./install.sh` | Set up everything and start (first run) |
| `npm run setup` | Dependencies and keys, without starting |
| `npm run dev` | Runtime + model + interface (what you normally want) |
| `npm run dev:web` | Interface only, against a runtime you started yourself |
| `npm run runtime` | Runtime only |
| `./scripts/stop-local.sh` | Unload the model and stop the runtime |
| `npm run doctor` | What is running, and which models it can see |

---

## What is in the box

| Area | What it does |
| --- | --- |
| **Home** | One composer that routes what you type to chat, image, vision, research or a workflow — and shows you where it is going before you commit. |
| **Tabs** | Browser-style workspace tabs. Independent state, drag to reorder, double-click to rename, `⌘T` / `⌘W` / `⌘1–9`. Closing one is undoable with `⌘⇧T`. |
| **Chat** | Editorial conversation layout — no bubbles. Streaming, markdown, collapsible reasoning, provider badge on every answer. |
| **Vision** | Drop, paste or upload images and interrogate them. Local or online, stated explicitly. |
| **Create** | An image canvas with capability-driven controls, reference images, asynchronous jobs and full generation history. |
| **Assets** | Everything generated, filed automatically with its prompt, model, seed and settings. |
| **Projects** | Creative workspaces with persistent brand and creative direction the AI uses only when you switch it on. |
| **Workflows** | A node editor that chains vision → text → generation → save, executed by the same provider layer the interface uses. |
| **Models** | Installed local models read from the machine; cloud catalogues fetched live. Settings → Providers has a **free models only** switch, since OpenRouter lists hundreds of billed models. |
| **Activity Center** | Every running generation in one corner, with progress, cancel and a jump back to the tab that started it. |
| **Skills** | K Skills use the same `SKILL.md` format as Claude's Agent Skills — YAML frontmatter, progressive disclosure — so a skill written for Claude imports unchanged. Invoke one in chat with `/name`. |
| **Agents** | Companions with their own character, model and memory. They drift along the edge of the screen, can be placed (walking the prompt bar, hanging from the top, parked in a corner), and occasionally think something about what you are doing. One switch silences all of them. |
| **Control island** | A capsule fused to the right edge. Push the pointer there and it opens into live CPU / memory / GPU gauges, your companions, and the switches worth reaching quickly. `⌘J` pins it. |
| **Album** | Every generated image in one place. |
| **Customisation** | Accent, canvas colour, wallpaper, reading size and leading — plus your own imported fonts (`.woff2` / `.woff` / `.ttf` / `.otf`), applied to the interface, the reading text, or both. |
| **Command palette** | `⌘K` for actions, `⌘/` for search across projects, assets, prompts, workflows and models. |

---

## Architecture

```
Browser ──► Next.js API routes ──► provider adapters ──► Higgsfield / KIE / OpenRouter
   │
   └──────► http://127.0.0.1:8756 (FastAPI) ──► Ollama / llama.cpp
```

Two paths, chosen by where the model lives. Cloud requests always go through the
backend so credentials never reach the browser. **Local chat and vision are
streamed straight from the browser to the local runtime**, so in private mode a
prompt or an image never passes through the application server at all.

That direct call can be blocked by the browser rather than by the runtime: a page
opened on the LAN URL Next.js prints (`http://192.168.x.x:3000`) calling loopback
trips CORS and Chrome's private-network rules. The runtime therefore accepts
loopback *and* private LAN origins and answers the private-network preflight —
and if the direct call still fails, the client retries through `/api/chat`, which
reaches the same runtime on the same machine. Nothing leaves the device either
way; the fallback just adds one hop through the server process.

### Provider abstraction

No component imports a provider. Everything goes through a common interface:

```
src/lib/providers/
  types.ts          # AIProvider, ChatProvider, ImageProvider, capabilities, errors
  descriptors.ts    # client-safe provider metadata
  registry.ts       # the one place that knows which providers exist
  router.ts         # task + privacy + capability → concrete provider and model
  local/            # Ollama and llama.cpp, via the FastAPI runtime
  openrouter/       # online chat, vision and reasoning
  higgsfield/       # primary image generation
  kie/              # secondary image, edit and video generation
```

Adding a provider is a folder plus one line in `registry.ts`. The Create
workspace has no per-provider code at all: a model declares the parameters it
supports (`ParamSpec[]`) and the settings panel renders exactly those — a model
without a seed simply has no seed field.

Capabilities: `CHAT`, `VISION`, `IMAGE_GENERATION`, `IMAGE_EDITING`,
`VIDEO_GENERATION`, `EMBEDDINGS`, `TOOLS`, `REASONING`, `UPSCALE`.

### Asynchronous generation

`src/lib/jobs/manager.ts` owns generation. `POST /api/image/generate` returns a
job id immediately; the manager polls the provider with backoff, persists every
transition, files completed outputs into the asset library with full provenance,
and resumes unfinished jobs after a restart. Nothing blocks a request, so you can
switch tabs, start another generation, or reload the page while work continues.

### Privacy

`PRIVATE` mode is a boundary, not a preference:

- cloud text models are **not enumerated**, so they cannot be picked by accident;
- `/api/chat` refuses a cloud request that arrives with `privacy: PRIVATE`;
- attachments become data URLs in the browser rather than being uploaded;
- every answer and every generation carries a provider badge.

Image generation still uses the cloud, because it has to — but only when you ask
for it, and it always says which provider produced the result.

---

## Configuration

All credentials live in `.env.local` and are read only on the server. KOVAI never
sends a key to the browser, never stores one in the database, and has no form to
type one into. Settings → Providers reports what is connected and names exactly
what is missing.

```bash
OPENROUTER_API_KEY=       # chat, vision, reasoning
HF_API_KEY_ID=            # Higgsfield — image generation
HF_API_KEY_SECRET=
KIE_API_KEY=              # KIE — image, edit, video
DATABASE_URL=             # optional; omit to use the built-in file store
```

Endpoint paths for the generation providers are collected at the top of each
adapter (`ENDPOINTS`), so if a platform changes a route, that is the only place
to edit. Verify them against each provider's current documentation before going
to production.

### Postgres (optional)

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/kovai"
npx prisma generate && npx prisma db push
```

The same `KovaiStore` interface backs both stores, so nothing above the storage
layer changes. If `DATABASE_URL` is set but the Prisma client has not been
generated, KOVAI says so once and keeps running on the file store rather than
failing to boot.

---

## Local runtime

`runtime/main.py` is a FastAPI service that fronts whatever is installed:

```
GET  /health       GET  /system      GET  /models
POST /chat         POST /vision      POST /embeddings     POST /cancel
```

It binds to loopback only and accepts cross-origin requests solely from
localhost. The model list is always read from the machine — KOVAI never presents
a catalogue of models as though they were installed.

### Local models

**Drop a `.gguf` into `models/` and it runs.** No import step, no second copy of
the weights: the runtime loads the file directly with llama.cpp, on Metal where
one is available. Set `KOVAI_GGUF_DIR` to keep weights elsewhere.

KOVAI finds a `llama-server` binary in this order — `KOVAI_LLAMA_SERVER`, the
`PATH`, the usual Homebrew locations, then the Metal builds LM Studio ships. If
none of those exist, GGUF files are reported as not runnable with the reason
stated, and the Models page offers to import them into Ollama instead.

Ollama models work too and appear in the same list: `ollama pull llama3.2`, or
`ollama pull qwen2.5vl` for vision.

Because weights are large, **one GGUF is resident at a time** — asking for a
different one swaps it, and an idle model is released after
`KOVAI_GGUF_IDLE_TIMEOUT` seconds. Models → Local runtime shows what is in
memory with an **Unload** action.

The model server outlives the runtime process on purpose: restarting the runtime
should not discard a multi-gigabyte load. On startup the runtime **adopts** a
server it finds still serving a file from `models/` — recorded in
`.kovai/llama.json`, and confirmed by scanning for llama-server processes
pointed at that folder — so a reload never strands memory or loads a second copy
beside the first. Duplicates found during that sweep are stopped. Stopping the
runtime, or unloading explicitly, releases the weights.

`KOVAI_DEFAULT_MODEL` names the model the router prefers when you have not
chosen one. Left empty, the first runnable file in `models/` wins — downloading
a model should not also require naming it somewhere.

### Vision with a local GGUF

A GGUF holds the language model only — reading images needs the model's
**mmproj** (multimodal projector) file as well. Put it in `models/` and KOVAI
pairs the two automatically:

```
models/
  My-Model-Q8.gguf
  My-Model-Q8.mmproj.gguf      # or mmproj-My-Model-Q8.gguf
```

Pairing is by name, falling back to a lone projector in the folder when there is
exactly one — that case is unambiguous. `KOVAI_MMPROJ` points at a specific file
instead. A paired model is tagged as vision-capable, so the router prefers it
over a cloud model for image questions.

Attached images are always sent as bytes, never as links. An upload lives behind
a relative path on a machine that is not on the internet, so neither llama.cpp
(which reads bytes and does not follow URLs) nor a hosted provider can fetch it —
the browser inlines the image before the request goes out. A paired model reports `VISION` and works in the Vision workspace; a
model with no projector says so plainly rather than answering confidently about
an image it never saw.

Weights are gitignored: `models/*.gguf` is never committed.

**Starting it from the interface.** A web page cannot spawn a process, so:

- **Desktop (Tauri)** — the shell starts it natively (`src-tauri/src/runtime.rs`).
- **Web** — `POST /api/runtime/start` runs the start script, but only for
  requests originating on localhost, only with a fixed command, and only when
  `KOVAI_ALLOW_RUNTIME_SPAWN` is not `0`.

If neither applies, the interface says what to run instead of pretending.

**When local models seem missing.** Run `npm run doctor`. It prints whether the
runtime is up, which folder it reads, how many GGUF files are in it, which
`llama-server` will run them, and every model it can currently see — with the
default marked. If that list looks right but the interface disagrees, the
interface is holding a stale saved selection: `localStorage.clear()` in the
browser console and reload. Model ids change when a model moves between
backends, and a selection pinned to an id that no longer exists is dropped back
to **Auto** automatically, but a selection pinned to a model that still exists is
kept — because you chose it.

**When a start fails.** The spawned process is detached and has no terminal, so
everything the script prints is captured to `.kovai/runtime.log` and read back by
the interface: progress while a first run builds its virtual environment, and the
specific reason when something goes wrong — a busy port, a missing or too-old
Python, a failed dependency install. The script announces fatal problems with a
`[kovai] FAILED:` line rather than exiting quietly, so the interface reports them
in seconds instead of waiting out a timeout.

```bash
tail -f .kovai/runtime.log     # watch a start in progress
```

---

## Desktop build

```bash
npm install -g @tauri-apps/cli   # requires the Rust toolchain
npm run tauri dev
```

The web interface works standalone; the desktop shell adds native process
control for the runtime.

---

## Keyboard

| | |
| --- | --- |
| `⌘K` | Command palette |
| `⌘/` | Search everything |
| `⌘T` / `⌘W` | New tab / close tab |
| `⌘⇧T` | Reopen closed tab |
| `⌘⇧P` | New project |
| `⌘↵` | Generate |
| `⌘B` | Collapse sidebar |
| `⌘J` | Pin the control island open |
| `⌘1`–`⌘9`, `⌃Tab` | Jump between tabs |
| `Esc` | Close overlay |

---

## Project layout

```
src/
  app/                    # routes: one application surface + the API
    api/                  # chat, vision, image, runtime, projects, assets, …
  components/
    shell/                # sidebar, tabs, palette, activity, onboarding
    workspaces/           # home, chat, create, vision, projects, workflows, …
    ui/                   # primitives
  hooks/                  # useChat, useModels, useProviders, useLocalRuntime, …
  lib/
    providers/            # the abstraction layer
    jobs/                 # asynchronous generation manager
    workflows/            # execution engine
    db/                   # KovaiStore: file store + Prisma store
  store/                  # workspace tabs, settings, jobs, UI
runtime/                  # FastAPI local runtime
src-tauri/                # desktop shell
prisma/schema.prisma      # relational schema
```

---

## Conventions worth knowing

- **No fake functionality.** An unconfigured provider renders a setup state; a
  missing runtime renders a start button; a failed call renders the real error
  with the provider's own words behind a disclosure.
- **No invented numbers.** Usage shows a cost only where the provider reported
  one. Otherwise it says *Cost unavailable*. Local work is free and says so.
- **Errors are actionable.** Raw provider text never becomes the headline.
- **Tabs never reset.** Open tabs stay mounted; state lives in the workspace
  store, not in component state.

---

## Contributing

Issues and pull requests are welcome. Two things to know before you open one:

- **Never commit a key.** `.env*` is git-ignored deliberately broadly, including
  misspellings like `.env. local`, because a secrets file with a typo in the
  name is still a secrets file. `.env.example` is the one exception.
- **Never commit workspace data.** `.kovai/` holds conversations, notes,
  projects, agents and uploads — one person's, not the project's.

`npm run typecheck && npm run build` should both pass before you push.

## License

[MIT](LICENSE) — do what you like with it.

Model weights, provider APIs and the Lottie artwork in `Icons/` carry their own
licences and are not covered by this one.
