#!/usr/bin/env node
/**
 * npm run doctor — what is running, and what can it see?
 *
 * Local inference has several moving parts, and when one of them is down the
 * symptom is always the same: "local models aren't working". This prints the
 * state of each part in one place so the answer takes seconds, not guesswork.
 */

const PORT = process.env.KOVAI_RUNTIME_PORT || '8756'
const RUNTIME = `http://127.0.0.1:${PORT}`

const dim = (t) => `\x1b[2m${t}\x1b[0m`
const green = (t) => `\x1b[32m${t}\x1b[0m`
const red = (t) => `\x1b[31m${t}\x1b[0m`
const yellow = (t) => `\x1b[33m${t}\x1b[0m`

async function get(url, ms = 3000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms) })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

console.log(`\n${dim('KOVAI')} diagnostics\n`)

const health = await get(`${RUNTIME}/health`)
const app = await fetch('http://localhost:3000', { signal: AbortSignal.timeout(3000) })
  .then((r) => r.status)
  .catch(() => null)
const ollama = await get('http://127.0.0.1:11434/api/version')

console.log(`  ${health ? green('●') : red('●')} Local runtime   ${health ? `${RUNTIME}` : red(`not running on :${PORT}`)}`)
console.log(`  ${app ? green('●') : yellow('●')} Web app         ${app ? 'http://localhost:3000' : dim('not running')}`)
console.log(`  ${ollama ? green('●') : dim('○')} Ollama          ${ollama ? `:11434 (${ollama.version})` : dim('not running — only needed for ollama models')}`)

if (!health) {
  console.log(`\n  ${yellow('The runtime is down, so no local model can load.')}`)
  console.log(`  Start everything with:  ${dim('npm run dev')}`)
  console.log(`  Startup output:         ${dim('.kovai/runtime.log')}\n`)
  process.exit(1)
}

const system = await get(`${RUNTIME}/system`)
const catalogue = await get(`${RUNTIME}/models`)

if (system) {
  console.log(`\n  ${dim('Models folder')}  ${system.models_dir ?? red('not configured')}`)
  console.log(`  ${dim('GGUF files')}     ${system.gguf_count}`)
  console.log(`  ${dim('Runs them with')} ${system.llama_server ?? red('no llama-server found')}`)
  console.log(`  ${dim('Memory')}         ${(system.ram_available / 1e9).toFixed(1)} GB free of ${(system.ram_total / 1e9).toFixed(1)} GB`)
}

const models = catalogue?.models ?? []
console.log(`\n  ${dim('Models visible to KOVAI')}`)
if (!models.length) {
  console.log(`    ${red('none')} — drop a .gguf into models/, or run: ollama pull llama3.2`)
} else {
  for (const m of models) {
    const flag = m.registered === false ? red('unusable') : m.loaded ? green('loaded') : dim('ready')
    const star = m.default ? ' ← default' : ''
    console.log(`    ${flag.padEnd(18)} ${m.id}${dim(star)}`)
    if (m.reason) console.log(`      ${yellow(m.reason)}`)
  }
}

console.log(
  `\n  ${dim('If the interface disagrees with this list, its saved selection is stale:')}` +
    `\n  ${dim("open the browser console and run  localStorage.clear()  then reload.")}\n`,
)
