#!/usr/bin/env node
/**
 * First run.
 *
 *   npm run setup
 *
 * Checks the toolchain, installs dependencies, and walks through the keys.
 * Everything it asks for is optional: KOVAI runs with no keys at all against
 * local models, so the script never blocks on an answer and never treats an
 * empty line as a mistake.
 *
 * It has no dependencies of its own, on purpose — it has to be able to run
 * before `npm install` has ever succeeded.
 *
 * Run again any time to change a key. Existing values are kept unless you
 * type a new one, and the file keeps its comments, so this is safe to re-run
 * over a .env.local you have edited by hand.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stdin, stdout } from 'node:process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENV = join(ROOT, '.env.local')
const TEMPLATE = join(ROOT, '.env.example')

const NODE_MINIMUM = 20

const bold = (t) => `\x1b[1m${t}\x1b[0m`
const dim = (t) => `\x1b[2m${t}\x1b[0m`
const green = (t) => `\x1b[32m${t}\x1b[0m`
const yellow = (t) => `\x1b[33m${t}\x1b[0m`
const red = (t) => `\x1b[31m${t}\x1b[0m`

// A cancelled setup is an ordinary outcome, not a crash.
process.on('SIGINT', () => {
  console.log(`\n\n  Cancelled. Nothing was changed beyond what had already been saved.\n`)
  process.exit(130)
})

const assumeYes = process.argv.includes('--yes') || process.argv.includes('-y')
const interactive = !assumeYes && stdin.isTTY

/**
 * The keys worth asking for.
 *
 * Each says what it buys and where to get it, because "OPENROUTER_API_KEY" on
 * its own tells someone nothing about whether they need one.
 */
const PROVIDERS = [
  {
    name: 'OpenRouter',
    buys: 'Cloud chat, vision and reasoning — hundreds of models behind one key.',
    where: 'https://openrouter.ai/keys',
    note: 'It has a free tier, and KOVAI can filter to free models only.',
    fields: [{ key: 'OPENROUTER_API_KEY', prompt: 'OpenRouter API key' }],
  },
  {
    name: 'Higgsfield',
    buys: 'Image and video generation.',
    where: 'https://higgsfield.ai',
    note: 'Issued as a pair, usually shown together as "id:secret".',
    fields: [
      { key: 'HF_API_KEY_ID', prompt: 'Higgsfield key id' },
      { key: 'HF_API_KEY_SECRET', prompt: 'Higgsfield key secret' },
    ],
  },
  {
    name: 'KIE',
    buys: 'A second source for image and video generation.',
    where: 'https://kie.ai',
    fields: [{ key: 'KIE_API_KEY', prompt: 'KIE API key' }],
  },
]

/* ── env file ─────────────────────────────────────────────── */

/**
 * Reads the values out of a dotenv file.
 *
 * Deliberately simple: `KEY=value`, no interpolation, no multi-line. That is
 * all this project writes, and a parser that understands more would quietly
 * accept files the app itself cannot read.
 */
function readEnv(path) {
  if (!existsSync(path)) return {}
  const values = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (match) values[match[1]] = match[2].trim()
  }
  return values
}

/**
 * Writes values back through the template, so comments survive.
 *
 * The template is the source of structure; this only ever substitutes the
 * right-hand side. A key the template does not mention is appended at the end
 * rather than dropped.
 */
function writeEnv(values) {
  const template = existsSync(TEMPLATE) ? readFileSync(TEMPLATE, 'utf8') : ''
  const seen = new Set()

  const body = template
    .split('\n')
    .map((line) => {
      const match = /^\s*([A-Z0-9_]+)\s*=/.exec(line)
      if (!match) return line
      const key = match[1]
      seen.add(key)
      return `${key}=${values[key] ?? ''}`
    })
    .join('\n')

  const extra = Object.entries(values)
    .filter(([key, value]) => !seen.has(key) && value)
    .map(([key, value]) => `${key}=${value}`)

  writeFileSync(ENV, extra.length ? `${body}\n${extra.join('\n')}\n` : body, { mode: 0o600 })
}

/* ── checks ───────────────────────────────────────────────── */

function checkNode() {
  const major = Number(process.versions.node.split('.')[0])
  if (major >= NODE_MINIMUM) {
    console.log(`  ${green('●')} Node ${process.versions.node}`)
    return true
  }
  console.log(`  ${red('●')} Node ${process.versions.node} — KOVAI needs ${NODE_MINIMUM} or newer.`)
  console.log(`    ${dim('https://nodejs.org  ·  or: nvm install 20')}`)
  return false
}

function installDependencies() {
  if (existsSync(join(ROOT, 'node_modules', 'next'))) {
    console.log(`  ${green('●')} Dependencies already installed`)
    return true
  }
  console.log(`  ${yellow('●')} Installing dependencies — this takes a minute or two…\n`)
  const result = spawnSync('npm', ['install'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) {
    console.log(`\n  ${red('●')} npm install failed. The output above says why.`)
    return false
  }
  console.log(`\n  ${green('●')} Dependencies installed`)
  return true
}

function reportModels() {
  const dir = join(ROOT, 'models')
  mkdirSync(dir, { recursive: true })
  const weights = readdirSync(dir).filter((f) => f.endsWith('.gguf'))
  if (weights.length) {
    console.log(`  ${green('●')} ${weights.length} local model${weights.length === 1 ? '' : 's'} in models/`)
  } else {
    console.log(`  ${dim('○')} No local models yet ${dim('— drop a .gguf into models/ and it is picked up')}`)
  }
}

/* ── run ──────────────────────────────────────────────────── */

console.log(`\n${bold('KOVAI setup')}\n`)

console.log(bold('Toolchain'))
if (!checkNode()) process.exit(1)
if (!installDependencies()) process.exit(1)
reportModels()

const values = { ...readEnv(TEMPLATE), ...readEnv(ENV) }

if (!interactive) {
  writeEnv(values)
  console.log(`\n${bold('Keys')}`)
  console.log(`  ${dim('○')} Skipped — ${existsSync(ENV) ? '.env.local left as it is' : 'wrote an empty .env.local'}.`)
  console.log(`  ${dim('Add keys later with `npm run setup`, or edit .env.local directly.')}`)
} else {
  console.log(`\n${bold('Keys')}`)
  console.log(dim('  All optional. Press Enter to skip one, or to keep what is already there.'))
  console.log(dim('  With no keys at all, KOVAI still runs everything local.\n'))

  const rl = createInterface({ input: stdin, output: stdout })

  // Whatever has been typed is written even if the run is cut short. Someone
  // who gets three keys in and hits Ctrl-C should not have to type them again,
  // and should certainly not be shown a stack trace for it.
  let aborted = false
  try {
    outer: for (const provider of PROVIDERS) {
      const configured = provider.fields.every((f) => values[f.key])
      console.log(`${bold(provider.name)} ${configured ? green('· configured') : ''}`)
      console.log(dim(`  ${provider.buys}`))
      console.log(dim(`  ${provider.where}${provider.note ? `  ·  ${provider.note}` : ''}`))

      for (const field of provider.fields) {
        const current = values[field.key]
        let answer
        try {
          answer = await rl.question(`  ${field.prompt} ${dim(`[${current ? 'keep' : 'skip'}]`)}: `)
        } catch {
          // Ctrl-D closes the stream; Ctrl-C aborts the question. Both mean
          // "stop asking", not "throw away the answers".
          aborted = true
          break outer
        }
        const trimmed = answer.trim()
        if (trimmed) values[field.key] = trimmed
      }
      console.log()
    }
  } finally {
    rl.close()
  }

  writeEnv(values)
  if (aborted) console.log(`\n${dim('  Stopped early — what you entered is saved. Run `npm run setup` to finish.')}`)
}

console.log(`\n${bold('Configured')}`)
for (const provider of PROVIDERS) {
  const state = provider.fields.every((f) => values[f.key])
    ? green('ready')
    : provider.fields.some((f) => values[f.key])
      ? yellow('partly set')
      : dim('not set')
  console.log(`  ${provider.name.padEnd(12)} ${state}`)
}
console.log(`  ${'Local models'.padEnd(12)} ${green('always available')} ${dim('— no key needed')}`)

console.log(`\n${bold('Next')}`)
console.log(`  ${bold('npm run dev')}   ${dim('→ http://localhost:3000')}`)
console.log(`  ${dim('npm run doctor  → check what is running')}\n`)
console.log(dim('Your keys are in .env.local. It is git-ignored and never leaves this machine.\n'))
