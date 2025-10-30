import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import * as chrono from 'chrono-node'

// Read scraped events from both universal extractor and general scraper
const universalSrc = join(process.cwd(), 'public', 'data', 'events.universal.json')
const generalSrc = join(process.cwd(), 'public', 'data', 'events.general.json')
const outDir = join(process.cwd(), 'public', 'data')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
const dest = join(outDir, 'events.json')

function loadJsonFile(path) {
  if (!existsSync(path)) return []
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : (parsed.events || [])
  } catch (e) {
    console.error(`Failed to read ${path}:`, e.message)
    return []
  }
}

let data = []
const universalData = loadJsonFile(universalSrc)
const generalData = loadJsonFile(generalSrc)

console.log(`Loaded ${universalData.length} events from universal extractor`)
console.log(`Loaded ${generalData.length} events from general scraper`)

// Merge both sources
data = [...universalData, ...generalData]

// Normalize and filter obvious non-events
const bannedTitleFragments = [
  'permit', 'application', 'foia', 'request', 'guide', 'inspection', 'framework', 'faq', 'templates', 'homepage',
  'view all news', 'press', 'program agreement', 'ordinance', 'executed', 'amendment', 'contract', 'agreement',
  'notice', 'policy', 'standards', 'municipal marketing', 'city council'
]

// Clean location string - remove HTML, CSS, and other junk
function cleanLocation(loc) {
  if (!loc || typeof loc !== 'string') return ''
  let cleaned = loc
    // Remove CSS code
    .replace(/#[a-f0-9]{6,8}/gi, '')
    .replace(/[a-z-]+:\s*[^;]+;/gi, '')
    .replace(/\.cds-[a-z-]+/gi, '')
    .replace(/#cds-separator[0-9]+/gi, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, '')
    // Remove CSS selectors
    .replace(/\{[^}]+\}/g, '')
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    .trim()
  // If it's still too long or looks like code, return empty
  if (cleaned.length > 200 || cleaned.includes('font-family') || cleaned.includes('border:') || cleaned.includes('content:')) {
    return ''
  }
  return cleaned
}

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
  // Filter out events more than 1 year in the past
  if (d && d.getTime() < now.getTime() - 365*24*3600*1000) {
    return null
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
    event_url: e.event_url || e.url || e.source_url || '',
    location: cleanLocation(e.location)
  }))
  .map(e => {
    // Clean description too
    if (e.description) {
      e.description = String(e.description)
        .replace(/#cds-separator[0-9]+/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\{[^}]+\}/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 500) // Limit description length
    }
    const hasLocation = typeof e.location === 'string' && e.location.trim().length > 3
    if (!hasLocation && isTrustedChicagoSource(e.event_url)) {
      return { ...e, location: 'Chicago' }
    }
    return e
  })
  .filter(e => {
    const title = String(e.title || '').trim()
    const desc = String(e.description || '')
    const loc = String(e.location || '').trim()
    const hasUrl = typeof e.event_url === 'string' && e.event_url.startsWith('http')
    const hasLocation = loc.length > 3 && loc.length < 200 // Reasonable location length
    const looksLikeAnnouncement = bannedTitleFragments.some(f => title.toLowerCase().includes(f))
      || desc.includes('#cds-separator') || desc.includes('console.log(')
      || desc.includes('font-family') || desc.includes('border:')
      || loc.includes('font-family') || loc.includes('border:')
    const plausible = hasPlausibleDate(e) || (e.time_start && e.time_start.length >= 3)
      || (() => { try { return !!chrono.parseDate(title + ' ' + String(e.date_info || '')) } catch { return false } })()
    
    // Reject if no title, no URL, bad location, or looks like junk
    if (!title || title.length < 3) return false
    if (!hasUrl) return false
    if (!hasLocation && !isTrustedChicagoSource(e.event_url)) return false
    if (!plausible) return false
    if (looksLikeAnnouncement) return false
    // Reject if description is too short or looks like code
    if (desc.length < 10 || desc.includes('rgba(') || desc.includes('--vs-colors')) return false
    
    return true
  })
  // Derive a sortable timestamp
  .map(e => ({ ...e, _ts: deriveTimestamp(e.date_info, e.time_start) }))
  // Filter out events without valid dates or dates too far in the past
  .filter(e => {
    if (!e._ts) return false // Require valid timestamp
    const eventDate = new Date(e._ts)
    const now = new Date()
    // Only keep events from 1 year ago to 2 years in the future
    const oneYearAgo = now.getTime() - 365*24*3600*1000
    const twoYearsFuture = now.getTime() + 2*365*24*3600*1000
    return eventDate.getTime() >= oneYearAgo && eventDate.getTime() <= twoYearsFuture
  })
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
