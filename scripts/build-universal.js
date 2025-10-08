import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

function run(cmd) {
  console.log(`$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit' })
}

function load(path) {
  try {
    const j = JSON.parse(readFileSync(path, 'utf8'))
    return Array.isArray(j) ? j : (j.events || [])
  } catch { return [] }
}

function dedupe(arr) {
  return arr.filter((e, idx, a) => {
    const key = `${String(e.title).toLowerCase().trim()}|${String(e.date_info || '').toLowerCase().trim()}|${String(e.location || '').toLowerCase().trim()}`
    return a.findIndex(x => `${String(x.title).toLowerCase().trim()}|${String(x.date_info || '').toLowerCase().trim()}|${String(x.location || '').toLowerCase().trim()}` === key) === idx
  })
}

// 1) Universal extract
run('node scripts/universal-extract.js --seeds sources/seeds.txt --out public/data/events.universal.json')

// 2) Merge with any committed datasets to boost coverage
const seeds = [
  'public/data/events.v4.json',
  'public/data/events.v3.json',
  'public/data/events.v2.json',
  'public/data/events.v1.json',
  'public/data/events.universal.json'
]
const merged = []
for (const f of seeds) {
  if (existsSync(f)) merged.push(...load(f))
}
const deduped = dedupe(merged)

// 3) Write to events.json for the site
const outDir = join(process.cwd(), 'public', 'data')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
const outFile = join(outDir, 'events.json')
writeFileSync(outFile, JSON.stringify(deduped, null, 2))
console.log(`Wrote ${outFile} (${deduped.length})`)

// 4) Geocode
run('node scripts/enrich-geocode.js')

// 5) Validate (will set non-zero exit if <60% valid)
run('node scripts/validate-dataset.js public/data/events.json')

