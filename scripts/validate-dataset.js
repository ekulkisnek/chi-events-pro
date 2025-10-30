import { readFileSync } from 'node:fs'
import * as chrono from 'chrono-node'

function load(path) {
  const j = JSON.parse(readFileSync(path, 'utf8'))
  return Array.isArray(j) ? j : (j.events || [])
}

function isValid(e) {
  const titleOk = e.title && e.title.length > 3
  const linkOk = e.event_url && /^https?:\/\//.test(e.event_url)
  const placeOk = e.location && e.location.length > 3
  const descOk = e.description && e.description.length > 10
  const dateOk = (() => { try { return !!chrono.parseDate(String(e.date_info || '')) } catch { return false } })()
  return titleOk && linkOk && placeOk && descOk && dateOk
}

function main() {
  const file = process.argv[2]
  if (!file) { console.error('usage: node validate-dataset.js <file.json>'); process.exit(1) }
  const events = load(file)
  const total = events.length
  let valid = 0
  let missingTime = 0
  let missingPlace = 0
  let missingDesc = 0
  for (const e of events) {
    if (!e.time_start) missingTime++
    if (!e.location) missingPlace++
    if (!e.description) missingDesc++
    if (isValid(e)) valid++
  }
  const pctValid = total ? Math.round((valid / total) * 100) : 0
  console.log(JSON.stringify({ file, total, valid, pctValid, missingTime, missingPlace, missingDesc }, null, 2))
  if (pctValid < 60) process.exitCode = 1
}

main()

