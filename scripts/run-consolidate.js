import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import * as chrono from 'chrono-node'

function run(cmd) { execSync(cmd, { stdio: 'inherit' }) }

// Run consolidation to produce master files (use validator defaults, disable fuzzy for determinism)
run('DEDUP_FUZZY=false node event-consolidator.js')

// Copy events-only into public for the site
const consolidatedEventsOnly = 'chicago_events_master_consolidated_events_only.json'
const src = join(process.cwd(), consolidatedEventsOnly)
const outDir = join(process.cwd(), 'public', 'data')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
const dest = join(outDir, 'events.json')
let raw = readFileSync(src, 'utf8')
let data = []
try {
  const parsed = JSON.parse(raw)
  data = Array.isArray(parsed) ? parsed : parsed.events || []
} catch {}

// Normalize and filter obvious non-events
const bannedTitleFragments = [
  'permit', 'application', 'foia', 'request', 'guide', 'inspection', 'framework', 'faq', 'templates', 'homepage',
  'view all news', 'press', 'program agreement', 'ordinance', 'executed', 'amendment', 'contract', 'agreement',
  'notice', 'policy', 'standards'
]

function hasPlausibleDate(ev) {
  const s = String(ev.date_info || '').toLowerCase()
  if (/(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s*[0-3]?\d/.test(s)) return true
  if (/\b20\d{2}-[01]?\d-[0-3]?\d\b/.test(s)) return true
  if (/\b[01]?\d\/[0-3]?\d(\/20\d{2})?\b/.test(s)) return true
  try { if (chrono.parseDate(String(ev.date_info || ''))) return true } catch {}
  return false
}

function deriveTimestamp(dateInfo, timeStart) {
  const now = new Date()
  const base = String(dateInfo || '') + (timeStart ? ` ${timeStart}` : '')
  let d = null
  try { d = chrono.parseDate(base, now) } catch {}
  if (!d || Math.abs(d.getFullYear() - now.getFullYear()) > 2) {
    const s = String(dateInfo || '')
    const mmdd = /\b([01]?\d)[\/-]([0-3]?\d)\b/.exec(s)
    const monthName = /(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s*([0-3]?\d)/i.exec(s)
    let m = null, day = null
    if (mmdd) { m = Number(mmdd[1]); day = Number(mmdd[2]) }
    if (monthName) {
      const map = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12}
      m = map[monthName[1].toLowerCase()] || m; day = Number(monthName[2]) || day
    }
    if (m && day) {
      const candidate = new Date(now.getFullYear(), m-1, day)
      if (candidate.getTime() < now.getTime() - 24*3600*1000) {
        candidate.setFullYear(candidate.getFullYear() + 1)
      }
      d = candidate
    }
  }
  return d ? d.toISOString() : null
}

function isTrustedChicagoSource(url) {
  try {
    const u = new URL(url)
    const h = u.hostname
    return [
      'do312.com', 'timeout.com', 'www.timeout.com', 'choosechicago.com', 'www.choosechicago.com',
      'chicago.gov', 'www.chicago.gov', 'chicagomag.com', 'www.chicagomag.com', 'blockclubchicago.org',
      'www.blockclubchicago.org', 'eventbrite.com', 'www.eventbrite.com', 'navypier.org', 'www.navypier.org'
    ].some(dom => h === dom || h.endsWith('.' + dom))
  } catch { return false }
}

const filtered = data
  .map(e => ({
    ...e,
    event_url: e.event_url || e.url || e.source_url || ''
  }))
  .map(e => {
    const hasLocation = typeof e.location === 'string' && e.location.trim().length > 3
    if (!hasLocation && isTrustedChicagoSource(e.event_url)) {
      return { ...e, location: 'Chicago' }
    }
    return e
  })
  .filter(e => {
    const title = String(e.title || '').trim()
    const desc = String(e.description || '')
    const hasUrl = typeof e.event_url === 'string' && e.event_url.startsWith('http')
    const hasLocation = typeof e.location === 'string' && e.location.trim().length > 3
    const looksLikeAnnouncement = bannedTitleFragments.some(f => title.toLowerCase().includes(f))
      || desc.includes('#cds-separator') || desc.includes('console.log(')
    const plausible = hasPlausibleDate(e) || (e.time_start && e.time_start.length >= 3)
      || (() => { try { return !!chrono.parseDate(title + ' ' + String(e.date_info || '')) } catch { return false } })()
    if (!title || !hasUrl) return false
    if (!hasLocation && !isTrustedChicagoSource(e.event_url)) return false
    if (!plausible) return false
    if (looksLikeAnnouncement) return false
    return true
  })
  // Derive a sortable timestamp
  .map(e => ({ ...e, _ts: deriveTimestamp(e.date_info, e.time_start) }))
  // Deduplicate again on (title + date_info)
  .filter((e, idx, arr) => {
    const normTitle = String(e.title).toLowerCase().trim()
    const normDate = String(e.date_info || '').toLowerCase().replace(/\s+/g, ' ').trim()
    const key = `${normTitle}|${normDate}`
    return arr.findIndex(x => `${String(x.title).toLowerCase().trim()}|${String(x.date_info || '').toLowerCase().replace(/\s+/g, ' ').trim()}` === key) === idx
  })
  // Sort by soonest first, undated last
  .sort((a,b) => {
    if (a._ts && b._ts) return a._ts.localeCompare(b._ts)
    if (a._ts) return -1
    if (b._ts) return 1
    return String(a.title).localeCompare(String(b.title))
  })

writeFileSync(dest, JSON.stringify(filtered, null, 2))
console.log(`Wrote ${dest}`)
