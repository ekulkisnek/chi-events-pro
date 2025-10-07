'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
dayjs.extend(relativeTime)
import { useRef } from 'react'

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false }) as any
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false }) as any
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false }) as any
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false }) as any

type Ev = {
  id: string
  title: string
  category?: string
  location?: string
  event_url?: string
  latitude?: number
  longitude?: number
  date_info?: string
  time_start?: string
  price?: string
  description?: string
  _ts?: string
}

export default function MapPage() {
  const [events, setEvents] = useState<Ev[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [when, setWhen] = useState<'all'|'today'|'week'|'weekend'>('all')

  useEffect(() => {
    ;(async () => {
      const ts = Date.now()
      const localUrl = `/data/events.v4.json?v=${ts}`
      const rawUrl = `https://raw.githubusercontent.com/ekulkisnek/chi-events-pro/main/public/data/events.v4.json?${ts}`
      try {
        const res = await fetch(localUrl, { cache: 'no-store' })
        const data = await res.json()
        const arr = Array.isArray(data) ? data : (data?.events || [])
        if (arr.length > 0) { setEvents(arr); return }
        // Fallback if empty
        const res2 = await fetch(rawUrl, { cache: 'no-store' })
        const data2 = await res2.json()
        setEvents(Array.isArray(data2) ? data2 : (data2?.events || []))
      } catch {
        try {
          const res2 = await fetch(rawUrl, { cache: 'no-store' })
          const data2 = await res2.json()
          setEvents(Array.isArray(data2) ? data2 : (data2?.events || []))
        } catch {
          setEvents([])
        }
      }
    })()
  }, [])

  const center = useMemo<[number, number]>(() => [41.8781, -87.6298], [])

  const cats = useMemo(() => Array.from(new Set(events.map(e => e.category).filter(Boolean) as string[])).sort(), [events])

  function withinWhen(e: Ev): boolean {
    const now = dayjs()
    const d = e._ts ? dayjs(e._ts) : (e.date_info ? dayjs(e.date_info) : null)
    if (!d || !d.isValid()) return when === 'all'
    if (when === 'today') return d.isSame(now, 'day')
    if (when === 'week') return d.isBefore(now.add(7, 'day')) && d.isAfter(now.subtract(1, 'day'))
    if (when === 'weekend') return [6,0].includes(d.day())
    return true
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const list = events.filter(e => {
      const okCat = !category || e.category === category
      const okText = !q || [e.title, e.location, e.date_info, e.time_start].filter(Boolean).join(' ').toLowerCase().includes(q)
      return okCat && okText && withinWhen(e)
    })
    // Sort soonest first (if date present)
    return list.sort((a,b) => {
      const ad = a._ts ? dayjs(a._ts) : (a.date_info ? dayjs(a.date_info) : null)
      const bd = b._ts ? dayjs(b._ts) : (b.date_info ? dayjs(b.date_info) : null)
      if (ad && bd) return ad.valueOf() - bd.valueOf()
      if (ad) return -1
      if (bd) return 1
      return String(a.title).localeCompare(String(b.title))
    })
  }, [events, search, category])

  // Ensure Leaflet default marker icons load (works even when CSS bundling rewrites asset paths)
  useEffect(() => {
    if (typeof window === 'undefined') return
    ;(async () => {
      const L = await import('leaflet')
      const icon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
      })
      L.Marker.prototype.options.icon = icon
    })()
  }, [])

  return (
    <div className="container grid gap-4">
      <div className="toolbar">
        <div className="col">
          <div className="h1">Chicago Events Map</div>
          <div className="muted">{filtered.length} events</div>
        </div>
        <input className="input" placeholder="Search title, venue, time…" value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="select" value={category} onChange={e=>setCategory(e.target.value)}>
          <option value="">All categories</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="select" value={when} onChange={e=>setWhen(e.target.value as any)}>
          <option value="all">Any time</option>
          <option value="today">Today</option>
          <option value="week">Next 7 days</option>
          <option value="weekend">This weekend</option>
        </select>
      </div>

      <div className="grid grid-3">
        <div className="panel p-0 overflow-hidden">
          <MapContainer center={center} zoom={12} scrollWheelZoom={true} className="leaflet-container">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
            {filtered.filter(e => typeof e.latitude === 'number' && typeof e.longitude === 'number').map(e => (
              <Marker key={e.id} position={[e.latitude as number, e.longitude as number]}>
                <Popup>
                  <div className="col">
                    <div className="title">{e.title}</div>
                    <div className="row">
                      {e.date_info && <span className="time-badge">{e.date_info}{e.time_start ? ` · ${e.time_start}` : ''}</span>}
                      {e.category && <span className="category-badge">{e.category}</span>}
                    </div>
                    {e.location && <div className="muted">{e.location}</div>}
                    {e.event_url && <a className="btn btn-primary" href={e.event_url} target="_blank">View details</a>}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
        <div className="panel-2 list">
          {filtered.map(e => (
            <div key={e.id} className="list-item">
              <div className="row" style={{justifyContent:'space-between'}}>
                <div className="col" style={{flex:1}}>
                  <div className="title">{e.title}</div>
                  <div className="row">
                    {(e._ts || e.date_info) && (
                      <span className="time-badge">
                        {(e.date_info || '').trim()}{e.time_start ? ` · ${e.time_start}` : ''}
                        {(() => { const d = e._ts ? dayjs(e._ts) : (e.date_info ? dayjs(e.date_info) : null); return d && d.isValid() ? ` · in ${dayjs().to(d, true)}` : '' })()}
                      </span>
                    )}
                    {e.category && <span className="category-badge">{e.category}</span>}
                    {e.price && <span className={`time-badge ${e.price.toLowerCase().includes('free') ? 'free' : 'paid'}`}>{e.price}</span>}
                  </div>
                  {e.location && <div className="muted">{e.location}</div>}
                  {e.description && <div className="muted" style={{fontSize:12, maxWidth: "70ch", overflow: 'hidden', textOverflow: 'ellipsis'}}>{e.description}</div>}
                </div>
                {e.event_url && <a className="btn btn-outline" href={e.event_url} target="_blank">Open</a>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="list-item muted">No matching events</div>}
        </div>
      </div>
    </div>
  )
}
