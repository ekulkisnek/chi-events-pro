import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { load as cheerioLoad } from 'cheerio'
import * as chrono from 'chrono-node'
import ical from 'node-ical'

function toArray(x) { return Array.isArray(x) ? x : (x ? [x] : []) }

function sanitizeText(value) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/#[a-z0-9_-]{5,}\b/gi, '')
    .trim()
  return text.length > 2000 ? text.slice(0, 2000) : text
}

function computeId(e) {
  const src = `${String(e.title || '').toLowerCase().trim()}|${String(e.date_info || '').toLowerCase().trim()}|${String(e.location || '').toLowerCase().trim()}`
  return createHash('md5').update(src).digest('hex').slice(0, 16)
}

function normalizeEvent(e) {
  const title = sanitizeText(e.title || e.name || '')
  const dateInfo = sanitizeText(e.date_info || e.startDate || e.start || e.date || '')
  const timeStart = sanitizeText(e.time_start || e.startTime || '')
  const rawLoc = e.location?.name || e.location?.address || e.venue || e.place || e.location || ''
  const location = sanitizeText(rawLoc)
  const description = sanitizeText(e.description || '')
  const eventUrl = String(e.event_url || e.url || e.link || '').trim()
  const category = sanitizeText(e.category || e.type || '')
  const price = sanitizeText(e.price || '')
  const base = { title, date_info: dateInfo, time_start: timeStart, location, description, event_url: eventUrl, category, price }
  return { ...base, id: computeId(base) }
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
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  const res = await fetch(url, { headers: { 'User-Agent': 'chi-events-universal/1.1' }, signal: controller.signal })
  clearTimeout(timeout)
  if (!res.ok) throw new Error(`fetch failed ${res.status}`)
  return await res.text()
}

function collectCandidateLinks($, baseUrl) {
  const out = new Set()
  const base = new URL(baseUrl)
  $('a[href]').each((_, el) => {
    const href = String($(el).attr('href') || '').trim()
    if (!href || href.startsWith('#') || href.startsWith('mailto:')) return
    let u
    try { u = new URL(href, base) } catch { return }
    if (u.hostname !== base.hostname) return
    const p = u.pathname.toLowerCase()
    const isEventy = /(event|events|show|concert|performance|festival|opennight|exhibit|exhibition|game|match|\b[eE]\b|\/e\/)/.test(p)
    if (!isEventy) return
    out.add(u.toString())
  })
  // pagination hints
  $('a[rel="next"], a:contains("Next"), a:contains("More"), a:contains("Older")').each((_, el) => {
    const href = String($(el).attr('href') || '').trim()
    try { const u = new URL(href, base); out.add(u.toString()) } catch {}
  })
  return Array.from(out)
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
  // Heuristic: prefer Chicago or IL mentions when domain not explicitly Chicago-focused
  let chicagoHint = /\b(chicago|il)\b/i.test(String(e.location))
  try {
    const h = new URL(e.event_url).hostname
    const chicagoDomains = [
      'do312.com','timeout.com','choosechicago.com','chicago.gov','navypier.org','chicagoreader.com','chicagomag.com',
      'cso.org','lyricopera.org','joffrey.org','chicagoshakes.com','auditoriumtheatre.org','harristheaterchicago.org','goodmantheatre.org','steppenwolf.org','lookingglasstheatre.org','broadwayinchicago.com','msg.com','the-chicago-theatre','unitedcenter.com','soldierfield.net','wintrustarena.com','creditunion1arena.com','metrochicago.com','thaliahallchicago.com','lh-st.com','schubas.com','subt.net','bottomlounge.com','reggieslive.com','sleeping-village.com','emptybottle.com','hideoutchicago.com','joesbar.com','parkwestchicago.com','houseofblues.com','saltshedchicago.com','rivieratheatre.com','victheatre.com','aragonballroom.org','copernicuscenter.org','secondcity.com','laughfactory.com','zanies.com','uchicago.edu','northwestern.edu','depaul.edu','uic.edu','luc.edu','colum.edu','iit.edu','artic.edu','fieldmuseum.org','lpzoo.org','msichicago.org','adlerplanetarium.org','sheddaquarium.org','chicagohistory.org','mcachicago.org','dusablemuseum.org','nationalmuseumofmexicanart.org','smartmuseum.uchicago.edu','garfieldconservatory.org','mocp.org','musicboxtheatre.com','musicboxfilm.com','chicagoathletichotel.com','chicagoartisanmarkets.com','randolphstreetmarket.com','chicagoparkdistrict.com','chipublib.org','navypier.org'
    ]
    if (chicagoDomains.some(d => h === d || h.endsWith('.'+d))) chicagoHint = true
  } catch {}
  const descOk = hasDesc || chicagoHint
  return titleOk && hasLink && hasPlace && descOk && plausibleDate && chicagoHint
}

async function main() {
  const args = process.argv.slice(2)
  const seedsIdx = args.indexOf('--seeds')
  const outIdx = args.indexOf('--out')
  const daysIdx = args.indexOf('--days')
  const crawlIdx = args.indexOf('--crawl')
  const maxIdx = args.indexOf('--max-pages')
  const seedsPath = seedsIdx >= 0 ? args[seedsIdx + 1] : null
  const outPath = outIdx >= 0 ? args[outIdx + 1] : join(process.cwd(), 'public', 'data', 'events.universal.json')
  const daysWindow = daysIdx >= 0 ? Math.max(0, Number(args[daysIdx + 1] || 0)) : 0
  const enableCrawl = crawlIdx >= 0 ? String(args[crawlIdx + 1] || 'true').toLowerCase() !== 'false' : true
  const maxPages = maxIdx >= 0 ? Math.max(1, Number(args[maxIdx + 1] || 60)) : 60
  if (!seedsPath) throw new Error('--seeds required')
  const seeds = readFileSync(seedsPath, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  const results = []
  for (const seed of seeds) {
    const queue = [seed]
    const visited = new Set()
    while (queue.length && visited.size < maxPages) {
      const url = queue.shift()
      if (!url || visited.has(url)) continue
      visited.add(url)
      try {
        const html = await fetchText(url)
        const $ = cheerioLoad(html)
        const fromJsonLd = await parseJsonLd($, url)
        const fromMicro = parseMicrodata($, url)
        const fromIcs = await parseIcsLinks($, url)
        for (const e of [...fromJsonLd, ...fromMicro, ...fromIcs]) {
          if (isLikelyEvent(e)) {
            const withTs = { ...e, _ts: deriveTimestamp(e.date_info, e.time_start) }
            const withMeta = { ...withTs, source: 'universal_extraction', source_url: url, scraped_at: new Date().toISOString(), extraction_method: 'universal' }
            const withId = withMeta.id ? withMeta : { ...withMeta, id: computeId(withMeta) }
            results.push(withId)
          }
        }
        if (enableCrawl) {
          for (const link of collectCandidateLinks($, url)) {
            if (!visited.has(link) && queue.length + visited.size < maxPages) queue.push(link)
          }
        }
      } catch {}
    }
  }
  // dedupe by title+date
  let out = results.filter((e, idx, arr) => {
    const key = `${String(e.title).toLowerCase().trim()}|${String(e.date_info || '').toLowerCase().trim()}`
    return arr.findIndex(x => `${String(x.title).toLowerCase().trim()}|${String(x.date_info || '').toLowerCase().trim()}` === key) === idx
  })
  // optional date window filter (e.g., next N days)
  if (daysWindow > 0) {
    const now = new Date()
    const max = new Date(now.getTime() + daysWindow * 24 * 3600 * 1000)
    out = out.filter(e => {
      const d = e._ts ? new Date(e._ts) : (e.date_info ? chrono.parseDate(String(e.date_info)) : null)
      if (!d || isNaN(d.getTime())) return false
      if (d < new Date(now.getTime() - 24 * 3600 * 1000)) return false
      return d <= max
    })
  }
  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(`Universal extracted ${out.length} events -> ${outPath}`)
}

main()
