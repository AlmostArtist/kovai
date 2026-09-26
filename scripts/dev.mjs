#!/usr/bin/env node
/**
 * One command for the whole workspace.
 *
 *   npm run dev
 *
 * Brings up the local runtime (creating its Python environment on first run),
 * waits for it to answer, warms the default model from models/, then starts the
 * web app. Ctrl-C shuts the lot down.
 *
 * `npm run dev` has to be the command that works, because it is the command
 * people type. Starting the interface without the runtime leaves local models
 * unreachable for no reason the user can see.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = process.env.KOVAI_RUNTIME_PORT || '8756'
const RUNTIME = `http://127.0.0.1:${PORT}`
const isWindows = process.platform === 'win32'

const dim = (text) => `\x1b[2m${text}\x1b[0m`
const say = (text) => console.log(`${dim('[kovai]')} ${text}`)

const children = []
let shuttingDown = false

async function probe(url, timeoutMs = 1500) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch {
    return false
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Starts the runtime unless something is already answering on its port. */
async function startRuntime() {
  if (await probe(`${RUNTIME}/health`)) {
    say('Local runtime already running')
    return
  }

  say('Starting the local runtime…')
  if (!existsSync(join(ROOT, 'runtime', '.venv'))) {
    say(dim('First run: building the Python environment. This takes a few minutes.'))
  }

  const script = join(ROOT, 'scripts', isWindows ? 'start-local.bat' : 'start-local.sh')
  const child = spawn(isWindows ? 'cmd.exe' : '/bin/bash', isWindows ? ['/c', script] : [script], {
    cwd: ROOT,
    env: { ...process.env, KOVAI_RUNTIME_ONLY: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)

  // The script's own messages are worth seeing; uvicorn's request log is not.
  const relay = (chunk) => {
    for (const line of String(chunk).split('\n')) {
      const text = line.trim()
      if (!text || text.startsWith('INFO:')) continue
      console.log(text.includes('[kovai]') ? text : `${dim('[runtime]')} ${text}`)
    }
  }
  child.stdout.on('data', relay)
  child.stderr.on('data', relay)

  // First launch installs dependencies, so wait generously.
  const deadline = Date.now() + 6 * 60_000
  while (Date.now() < deadline) {
    if (await probe(`${RUNTIME}/health`)) return
    if (child.exitCode !== null) {
      throw new Error('The runtime stopped during startup. See the output above.')
    }
    await sleep(1000)
  }
  throw new Error(`The runtime did not answer on :${PORT} within six minutes.`)
}

/** Reports what the runtime has ready, so the first message is not a surprise. */
async function reportModels() {
  try {
    const res = await fetch(`${RUNTIME}/models`, { signal: AbortSignal.timeout(5000) })
    const body = await res.json()
    const models = body.models ?? []
    const runnable = models.filter((m) => m.registered !== false)

    if (!runnable.length) {
      say('No local models found. Drop a .gguf into models/ and it will be picked up.')
      return
    }

    const fallback = runnable[0]
    const chosen = runnable.find((m) => m.id === body.default_model) ?? fallback
    say(`${runnable.length} local model${runnable.length === 1 ? '' : 's'} · default: ${chosen.name}`)

    // The runtime warms the default in the background; say so rather than
    // letting an early message look slow for no stated reason.
    if (String(chosen.id).startsWith('gguf:') && process.env.KOVAI_PRELOAD !== '0') {
      say(dim('Warming the model in the background…'))
    }
  } catch {
    /* the runtime is up; a model listing that failed is not worth stopping for */
  }
}

function startWeb() {
  say('Starting KOVAI on http://localhost:3000')
  const child = spawn('npx', ['next', 'dev'], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  })
  children.push(child)
  child.on('exit', (code) => {
    if (!shuttingDown) shutdown(code ?? 0)
  })
}

async function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  console.log()
  say('Shutting down…')

  // Release the weights before the runtime goes, so nothing is left resident.
  await fetch(`${RUNTIME}/models/unload`, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {})

  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM')
  }
  await sleep(600)
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGKILL')
  }
  process.exit(code)
}

process.on('SIGINT', () => void shutdown(0))
process.on('SIGTERM', () => void shutdown(0))

/**
 * A runtime that will not start is a reason to say so, not a reason to withhold
 * the interface. Cloud models still work without it, and the Models page can
 * start the runtime once whatever is holding the port has been dealt with.
 */
try {
  await startRuntime()
  await reportModels()
} catch (error) {
  console.error(`\n${dim('[kovai]')} ${error.message}`)
  console.error(`${dim('[kovai]')} Full startup output: .kovai/runtime.log`)
  console.error(`${dim('[kovai]')} Starting the interface anyway — local models will be unavailable.\n`)
}

startWeb()
