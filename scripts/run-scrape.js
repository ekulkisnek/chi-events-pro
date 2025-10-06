import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), '..', '_external', 'apify1')
const DEST = process.cwd()

function run(cmd, cwd = DEST) {
  console.log(`$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd, env: { ...process.env, RUN_SCRAPERS: 'false' } })
}

function copyIfNeeded() {
  const dirs = [
    'universal-ai-scraper',
    'blockclub-chicago-scraper',
    'chicago-park-district-scraper',
    'chicago-tribune-scraper',
    'timeout-chicago-scraper',
    'choosechicago-scraper',
    'do312-scraper',
    'chicago-gov-scraper',
    'universal-code-scraper',
    'orchestrator.js',
    'event-consolidator.js'
  ]
  for (const d of dirs) {
    const from = join(SRC, d)
    const to = join(DEST, d)
    try {
      cpSync(from, to, { recursive: true })
    } catch {}
  }
}

copyIfNeeded()
run('node orchestrator.js')
