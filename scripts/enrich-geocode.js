import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function loadJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

const eventsPath = join(process.cwd(), 'public', 'data', 'events.json')
let events = loadJson(eventsPath)
if (!events) process.exit(0)
if (!Array.isArray(events)) events = events.events || []

let venueMap = []
const venuesPath = join(process.cwd(), 'universal-code-scraper', 'chicago-venues.json')
if (existsSync(venuesPath)) {
  venueMap = loadJson(venuesPath) || []
}

const index = venueMap.map(v => ({ name: String(v.name).toLowerCase(), lat: v.coordinates?.[0], lon: v.coordinates?.[1] }))

function tryMatchLocation(text) {
  if (!text) return null
  const t = String(text).toLowerCase()
  for (const v of index) {
    if (t.includes(v.name)) return { lat: v.lat, lon: v.lon }
  }
  return null
}

// Lightweight cache
const cachePath = join(process.cwd(), 'scripts', 'geocode-cache.json')
let cache = loadJson(cachePath) || {}

async function geocodeNominatim(query) {
  const key = query.toLowerCase().trim()
  if (cache[key]) return cache[key]
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('q', `${query}, Chicago, IL`)
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ChicagoEventsAggregator/1.0 (+https://github.com/ekulkisnek/chicago-events-aggregator)' }
  })
  if (!res.ok) return null
  const json = await res.json()
  const hit = Array.isArray(json) && json[0]
  if (hit && hit.lat && hit.lon) {
    const out = { lat: Number(hit.lat), lon: Number(hit.lon) }
    cache[key] = out
    return out
  }
  return null
}

function looksLikeAddress(s) {
  const str = String(s || '')
  return /\b\d{3,5}\s+[A-Za-z][A-Za-z\.'-]*(?:\s+[A-Za-z][A-Za-z\.'-]*){0,4}\s+(St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ct|Court|Ln|Lane|Way|Pkwy|Parkway|Pl|Place)\b/i.test(str)
}

let updated = 0
let lookedUp = 0
const MAX_LOOKUPS = 80

for (const ev of events) {
  const hasLatLon = typeof ev.latitude === 'number' && typeof ev.longitude === 'number'
  if (hasLatLon) continue
  const m = tryMatchLocation(ev.location)
  if (m && typeof m.lat === 'number' && typeof m.lon === 'number') {
    ev.latitude = m.lat
    ev.longitude = m.lon
    updated++
    continue
  }
  if (lookedUp >= MAX_LOOKUPS) continue
  const q = looksLikeAddress(ev.location) ? ev.location : `${ev.location || ''}`
  if (!q || q.length < 6) continue
  // polite delay
  await new Promise(r => setTimeout(r, 1100))
  const geo = await geocodeNominatim(q)
  if (geo) {
    ev.latitude = geo.lat
    ev.longitude = geo.lon
    updated++
  }
  lookedUp++
}

writeFileSync(eventsPath, JSON.stringify(events, null, 2))
writeFileSync(cachePath, JSON.stringify(cache, null, 2))
console.log(`Geocoded ${updated} events (lookups: ${lookedUp}, cache size: ${Object.keys(cache).length})`)
