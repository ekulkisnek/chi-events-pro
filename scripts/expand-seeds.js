import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function expandUrl(u) {
  const out = new Set([u])
  let url
  try { url = new URL(u) } catch { return Array.from(out) }
  const host = url.hostname
  const path = url.pathname

  function pushPattern(builder, from, to) {
    for (let i = from; i <= to; i++) {
      try { out.add(builder(i)) } catch {}
    }
  }

  // Domain-specific pagination heuristics
  if (host.endsWith('do312.com') && path.includes('/events')) {
    pushPattern((i)=>`${url.origin}${path}?page=${i}`, 2, 20)
  }
  if (host.endsWith('timeout.com') && path.includes('/events')) {
    pushPattern((i)=>`${url.origin}${path}?page=${i}`, 2, 20)
  }
  if (host.endsWith('choosechicago.com') && path.includes('/events')) {
    const base = path.replace(/\/?$/, '')
    pushPattern((i)=>`${url.origin}${base}/page/${i}/`, 2, 30)
  }
  if (host.endsWith('chicagomag.com') && /things-to-do/.test(path)) {
    pushPattern((i)=>`${url.origin}${path}?_page=${i}`, 2, 20)
  }
  if (host.endsWith('chicagoparkdistrict.com') && path.includes('/events')) {
    pushPattern((i)=>`${url.origin}${path}?page=${i}`, 2, 30)
  }
  if (host.endsWith('chipublib.org') && path.includes('/events')) {
    pushPattern((i)=>`${url.origin}${path}?page=${i}`, 2, 20)
  }
  if (host.endsWith('lpzoo.org') && path.includes('/events')) {
    const base = path.replace(/\/?$/, '')
    pushPattern((i)=>`${url.origin}${base}/page/${i}/`, 2, 10)
  }
  if (host.endsWith('navypier.org') && path.includes('/events')) {
    const base = path.replace(/\/?$/, '')
    pushPattern((i)=>`${url.origin}${base}/page/${i}/`, 2, 12)
  }
  if (host.endsWith('events.uchicago.edu') || host.endsWith('uchicago.edu')) {
    pushPattern((i)=>`${url.origin}${path}?page=${i}`, 2, 20)
  }
  if (host.endsWith('planitpurple.northwestern.edu')) {
    pushPattern((i)=>`${url.origin}${path}?page=${i}`, 2, 20)
  }
  if (host.endsWith('events.depaul.edu')) {
    pushPattern((i)=>`${url.origin}${path}?page=${i}`, 2, 20)
  }
  if (host.endsWith('uic.edu') && path.includes('/events')) {
    pushPattern((i)=>`${url.origin}${path}?page=${i}`, 2, 20)
  }

  return Array.from(out)
}

function main() {
  const inPath = process.argv[2] || join(process.cwd(), 'sources', 'seeds.txt')
  const outPath = process.argv[3] || join(process.cwd(), 'sources', 'seeds.generated.txt')
  const lines = readFileSync(inPath, 'utf8').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
  const out = new Set()
  for (const line of lines) {
    for (const v of expandUrl(line)) out.add(v)
  }
  writeFileSync(outPath, Array.from(out).join('\n') + '\n')
  console.log(`Expanded seeds ${lines.length} -> ${out.size} -> ${outPath}`)
}

main()

