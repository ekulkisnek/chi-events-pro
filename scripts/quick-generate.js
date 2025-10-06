import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import * as chrono from 'chrono-node'

function hasPlausibleDate(ev) {
  const s = String(ev.date_info || '').toLowerCase()
  if (/(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s*[0-3]?\d/.test(s)) return true
  if (/\b20\d{2}-[01]?\d-[0-3]?\d\b/.test(s)) return true
  if (/\b[01]?\d\/[0-3]?\d(\/20\d{2})?\b/.test(s)) return true
  return false
}

function main() {
  const src = join(process.cwd(), 'chicago_events_master_consolidated_events_only.json')
  const outDir = join(process.cwd(), 'public', 'data')
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  const dest = join(outDir, 'events.json')

  let raw = readFileSync(src, 'utf8')
  let data = []
  try {
    const parsed = JSON.parse(raw)
    data = Array.isArray(parsed) ? parsed : parsed.events || []
  } catch {}

  const bannedTitleFragments = [
    'permit','application','foia','request','guide','inspection','framework','faq','templates','homepage',
    'view all news','press','program agreement','ordinance','executed','amendment','contract','agreement',
    'notice','policy','standards'
  ]

  const filtered = data
    .map(e => ({
      ...e,
      event_url: e.event_url || e.url || e.source_url || ''
    }))
    .filter(e => {
      const title = String(e.title || '').trim()
      const desc = String(e.description || '')
      const hasUrl = typeof e.event_url === 'string' && e.event_url.startsWith('http')
      const hasLocation = typeof e.location === 'string' && e.location.length > 3
      const looksLikeAnnouncement = bannedTitleFragments.some(f => title.toLowerCase().includes(f))
        || desc.includes('#cds-separator') || desc.includes('console.log(')
      const plausible = hasPlausibleDate(e) || (e.time_start && e.time_start.length >= 3)
      if (!title || !hasUrl || !hasLocation) return false
      if (!plausible) return false
      if (looksLikeAnnouncement) return false
      return true
    })
    .map(e => {
      let ts = null
      if (e.date_info) {
        const parsed = chrono.parseDate(e.date_info + (e.time_start ? ` ${e.time_start}` : ''))
        if (parsed) ts = parsed.toISOString()
      }
      return { ...e, _ts: ts }
    })
    .filter((e, idx, arr) => {
      const key = `${String(e.title).toLowerCase()}|${String(e.date_info).toLowerCase()}`
      return arr.findIndex(x => `${String(x.title).toLowerCase()}|${String(x.date_info).toLowerCase()}` === key) === idx
    })
    .sort((a,b) => {
      if (a._ts && b._ts) return a._ts.localeCompare(b._ts)
      if (a._ts) return -1
      if (b._ts) return 1
      return String(a.title).localeCompare(String(b.title))
    })

  writeFileSync(dest, JSON.stringify(filtered, null, 2))
  console.log(`Wrote ${dest} (${filtered.length})`)
}

main()


