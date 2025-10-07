import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { load as cheerioLoad } from 'cheerio'
import * as chrono from 'chrono-node'
import ical from 'node-ical'

function toArray(x) { return Array.isArray(x) ? x : (x ? [x] : []) }

function normalizeEvent(e) {
  const title = String(e.title || e.name || '').trim()
  const dateInfo = e.date_info || e.startDate || e.start || e.date || ''
  const timeStart = e.time_start || e.startTime || ''
  const location = e.location?.name || e.location?.address || e.venue || e.place || e.location || ''
  const description = String(e.description || '').trim()
  const eventUrl = e.event_url || e.url || e.link || ''
  const category = e.category || e.type || ''
  const price = e.price || ''
  return { title, date_info: dateInfo, time_start: timeStart, location, description, event_url: eventUrl, category, price }
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

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'chi-events-universal/1.0' } })
  if (!res.ok) throw new Error(`fetch failed ${res.status}`)
  return await res.text()
}

function parseJsonLd($, baseUrl) {
  const out = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text())
      const graphs = toArray(json['@graph'] || json)
      for (const node of graphs) {
        const type = node['@type'] || node.type
        if (!type) continue
        const types = toArray(type)
        if (types.includes('Event')) {
          const ev = {
            title: node.name,
            description: node.description,
            date_info: node.startDate,
            time_start: node.startTime,
            location: typeof node.location === 'string' ? node.location : (node.location?.name || node.location?.address?.streetAddress || ''),
            event_url: node.url || baseUrl,
            category: toArray(node.eventAttendanceMode || node.eventStatus || []).join(', '),
            price: node.offers?.price ? String(node.offers.price) : ''
          }
          out.push(normalizeEvent(ev))
        }
      }
    } catch {}
  })
  return out
}

function parseMicrodata($, baseUrl) {
  const out = []
  $('[itemtype*="Event"]').each((_, el) => {
    const root = $(el)
    const get = (sel) => root.find(sel).attr('content') || root.find(sel).text() || ''
    const ev = {
      title: get('[itemprop="name"]'),
      description: get('[itemprop="description"]'),
      date_info: get('[itemprop="startDate"]'),
      time_start: '',
      location: get('[itemprop="location"] [itemprop="name"], [itemprop="location"]'),
      event_url: get('[itemprop="url"]') || baseUrl,
      category: get('[itemprop="eventType"]')
    }
    out.push(normalizeEvent(ev))
  })
  return out
}

async function parseIcsLinks($, baseUrl) {
  const out = []
  const links = new Set()
  $('a[href$=".ics"], link[href$=".ics"]').each((_, el) => {
    const href = $(el).attr('href')
    try {
      const u = new URL(href, baseUrl)
      links.add(u.toString())
    } catch {}
  })
  for (const href of links) {
    try {
      const res = await fetch(href)
      if (!res.ok) continue
      const text = await res.text()
      const comps = ical.parseICS(text)
      for (const k of Object.keys(comps)) {
        const c = comps[k]
        if (c.type !== 'VEVENT') continue
        const ev = {
          title: c.summary,
          description: c.description || '',
          date_info: c.start?.toISOString?.() || '',
          time_start: '',
          location: c.location || '',
          event_url: c.url || baseUrl,
          category: ''
        }
        out.push(normalizeEvent(ev))
      }
    } catch {}
  }
  return out
}

function isLikelyEvent(e) {
  const titleOk = e.title && e.title.length > 3
  const hasLink = e.event_url && /^https?:\/\//.test(e.event_url)
  const hasPlace = e.location && e.location.length > 3
  const hasDesc = e.description && e.description.length > 10
  const plausibleDate = (() => { try { return !!chrono.parseDate(String(e.date_info || '')) } catch { return false } })()
  return titleOk && hasLink && hasPlace && hasDesc && plausibleDate
}

async function main() {
  const args = process.argv.slice(2)
  const seedsIdx = args.indexOf('--seeds')
  const outIdx = args.indexOf('--out')
  const seedsPath = seedsIdx >= 0 ? args[seedsIdx + 1] : null
  const outPath = outIdx >= 0 ? args[outIdx + 1] : join(process.cwd(), 'public', 'data', 'events.universal.json')
  if (!seedsPath) throw new Error('--seeds required')
  const seeds = readFileSync(seedsPath, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  const results = []
  for (const url of seeds) {
    try {
      const html = await fetchText(url)
      const $ = cheerioLoad(html)
      const fromJsonLd = await parseJsonLd($, url)
      const fromMicro = parseMicrodata($, url)
      const fromIcs = await parseIcsLinks($, url)
      for (const e of [...fromJsonLd, ...fromMicro, ...fromIcs]) {
        if (isLikelyEvent(e)) results.push({ ...e, _ts: deriveTimestamp(e.date_info, e.time_start), source: 'universal_extraction', source_url: url, scraped_at: new Date().toISOString(), extraction_method: 'universal' })
      }
    } catch (e) {
      // ignore per-seed failures
    }
  }
  // dedupe by title+date
  const out = results.filter((e, idx, arr) => {
    const key = `${String(e.title).toLowerCase().trim()}|${String(e.date_info || '').toLowerCase().trim()}`
    return arr.findIndex(x => `${String(x.title).toLowerCase().trim()}|${String(x.date_info || '').toLowerCase().trim()}` === key) === idx
  })
  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(`Universal extracted ${out.length} events -> ${outPath}`)
}

main()
