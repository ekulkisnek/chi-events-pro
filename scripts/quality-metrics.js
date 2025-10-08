import { readFileSync } from 'node:fs'

function load(path) {
  const j = JSON.parse(readFileSync(path, 'utf8'))
  return Array.isArray(j) ? j : (j.events || [])
}

function isValid(e) {
  const hasTitle = !!(e.title && e.title.length > 3)
  const hasUrl = !!(e.event_url && /^https?:\/\//.test(e.event_url))
  const hasPlace = !!(e.location && e.location.length > 3)
  const hasDesc = !!(e.description && e.description.length > 10)
  const hasDate = !!(e._ts || e.date_info)
  return hasTitle && hasUrl && hasPlace && hasDesc && hasDate
}

function domainOf(url) {
  try { return new URL(url).hostname } catch { return 'invalid' }
}

function main() {
  const file = process.argv[2] || 'public/data/events.json'
  const events = load(file)
  const byDomain = new Map()
  for (const e of events) {
    const d = domainOf(e.event_url || '')
    const s = byDomain.get(d) || { total: 0, valid: 0, missingDesc: 0 }
    s.total++
    if (isValid(e)) s.valid++
    if (!e.description) s.missingDesc++
    byDomain.set(d, s)
  }
  const rows = Array.from(byDomain.entries()).map(([domain, s]) => ({ domain, ...s, pctValid: s.total ? Math.round((s.valid/s.total)*100) : 0 }))
    .sort((a,b) => b.total - a.total)
  console.log(JSON.stringify({ file, total: events.length, sources: rows.slice(0, 100) }, null, 2))
}

main()

