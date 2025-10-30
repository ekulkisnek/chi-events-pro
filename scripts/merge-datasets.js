import { readFileSync, writeFileSync } from 'node:fs'

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

function main() {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.error('usage: node merge-datasets.js <a.json> <b.json> [more.json ...] <out.json>')
    process.exit(1)
  }
  const out = args[args.length - 1]
  const inputs = args.slice(0, -1)
  const merged = []
  for (const f of inputs) merged.push(...load(f))
  const deduped = dedupe(merged)
  writeFileSync(out, JSON.stringify(deduped, null, 2))
  console.log(`Merged ${merged.length} -> ${deduped.length} into ${out}` )
}

main()

