import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { load as cheerioLoad } from 'cheerio'
import * as chrono from 'chrono-node'

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
  // Filter out events more than 1 year in the past
  if (d && d.getTime() < now.getTime() - 365*24*3600*1000) {
    return null
  }
  return d ? d.toISOString() : null
}

async function fetchText(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { 
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': url.split('/').slice(0, 3).join('/')
        } 
      })
      if (!res.ok) throw new Error(`fetch failed ${res.status}`)
      return await res.text()
    } catch (e) {
      if (i === retries) {
        console.error(`Failed to fetch ${url} after ${retries + 1} attempts:`, e.message)
        return null
      }
      await new Promise(r => setTimeout(r, 1000 * (i + 1))) // Exponential backoff
    }
  }
  return null
}

// Enhanced date extraction using chrono-node
function extractDateFromText(text) {
  if (!text) return null
  const now = new Date()
  try {
    const parsed = chrono.parseDate(text, now)
    if (parsed) {
      // Check if date is reasonable
      const oneYearAgo = now.getTime() - 365*24*3600*1000
      const twoYearsFuture = now.getTime() + 2*365*24*3600*1000
      if (parsed.getTime() >= oneYearAgo && parsed.getTime() <= twoYearsFuture) {
        return parsed.toISOString().split('T')[0] // Return YYYY-MM-DD format
      }
    }
  } catch {}
  
  // Fallback to regex patterns
  const patterns = [
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})/i,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
    /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i,
    /(today|tomorrow|this\s+(?:week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i,
    /(next\s+(?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      try {
        const parsed = chrono.parseDate(match[0], now)
        if (parsed) return parsed.toISOString().split('T')[0]
      } catch {}
      return match[0] // Return raw match if parsing fails
    }
  }
  return null
}

// Enhanced time extraction
function extractTimeFromText(text) {
  if (!text) return ''
  const timePatterns = [
    /\b(\d{1,2}):(\d{2})\s*(am|pm)\b/i,
    /\b(\d{1,2})\s*(am|pm)\b/i,
    /\b(\d{1,2}):(\d{2})\b/,
    /\b(at|@)\s*(\d{1,2}):?(\d{2})?\s*(am|pm)?\b/i
  ]
  
  for (const pattern of timePatterns) {
    const match = text.match(pattern)
    if (match) {
      let time = match[0].replace(/^(at|@)\s*/i, '').trim()
      return time.substring(0, 20)
    }
  }
  return ''
}

// Enhanced location extraction
function extractLocationFromText(text) {
  if (!text) return ''
  
  // Look for common location patterns
  const patterns = [
    /(?:at|@|location:)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Park|Theater|Theatre|Center|Centre|Hall|Arena|Stadium|Museum|Zoo|Pier|Beach|Plaza|Square|Library|University|College|School|Church|Temple|Mosque|Synagogue)))/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Park|Theater|Theatre|Center|Centre|Hall|Arena|Stadium|Museum|Zoo|Pier|Beach|Plaza|Square|Library|University|College|School|Church|Temple|Mosque|Synagogue)))/,
    /(?:venue|location):\s*([^,\n]{3,100})/i,
    /@\s*([A-Z][a-zA-Z\s]{2,50})/,
    /\b(\d{3,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road))\b/i
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const loc = match[1].trim()
      if (loc.length > 3 && loc.length < 200) {
        return loc
      }
    }
  }
  return ''
}

// Extract events from common HTML patterns
function extractFromHtmlPatterns($, baseUrl) {
  const events = []
  const seen = new Set()
  
  // Expanded event container selectors
  const eventSelectors = [
    '[class*="event"]', '[class*="Event"]', '[id*="event"]', '[id*="Event"]',
    '[class*="card"]', '[class*="item"]', '[class*="listing"]', '[class*="post"]',
    '[class*="entry"]', '[class*="program"]', '[class*="activity"]',
    'article', 'section[class*="event"]', 'div[class*="event"]',
    'li[class*="event"]', 'tr[class*="event"]', // List items and table rows
    '[data-event-id]', '[data-event]', '[data-event-url]', // Data attributes
    '[class*="calendar"]', '[class*="Calendar"]'
  ]
  
  for (const selector of eventSelectors) {
    $(selector).each((_, el) => {
      const $el = $(el)
      const text = $el.text()
      
      // Skip if too small or too large (likely not an event card)
      if (text.length < 15 || text.length > 3000) return
      
      // Extract date using enhanced function
      const dateInfo = extractDateFromText(text)
      if (!dateInfo) return
      
      // Extract title (check multiple sources)
      const title = $el.find('h1, h2, h3, h4, h5, h6').first().text().trim() ||
                    $el.find('a').first().text().trim() ||
                    $el.find('strong, b, .title, [class*="title"]').first().text().trim() ||
                    $el.attr('title') ||
                    $el.attr('data-title') ||
                    text.split('\n')[0].trim().substring(0, 150)
      
      if (!title || title.length < 3 || title.length > 200) return
      
      // Extract link (check multiple sources)
      const link = $el.find('a').first().attr('href') ||
                   $el.attr('href') ||
                   $el.attr('data-url') ||
                   $el.attr('data-event-url')
      let eventUrl = link ? new URL(link, baseUrl).toString() : baseUrl
      
      // Extract location using enhanced function
      const location = extractLocationFromText(text) ||
                      $el.find('[class*="location"], [class*="venue"], [class*="address"]').first().text().trim() ||
                      $el.find('address').first().text().trim()
      
      // Extract time
      const timeStart = extractTimeFromText(text) ||
                       $el.find('[class*="time"]').first().text().trim().substring(0, 20)
      
      // Extract description
      const desc = $el.find('p, .description, [class*="desc"]').first().text().trim() || 
                   text.split('\n').slice(1, 4).join(' ').trim().substring(0, 500)
      
      // Extract price if available
      const priceMatch = text.match(/\$\d+(?:\.\d{2})?|free|donation|pay\s+what\s+you\s+can/i)
      const price = priceMatch ? priceMatch[0] : ''
      
      // Create unique key
      const key = `${title.toLowerCase().trim()}|${dateInfo}`
      if (seen.has(key)) return
      seen.add(key)
      
      events.push({
        title: title.substring(0, 200),
        date_info: dateInfo,
        time_start: timeStart.substring(0, 20),
        location: location.substring(0, 200),
        description: desc.substring(0, 500),
        event_url: eventUrl,
        category: '',
        price: price.substring(0, 50)
      })
    })
  }
  
  return events
}

// Extract events from tables (many sites use tables for event listings)
function extractFromTables($, baseUrl) {
  const events = []
  const seen = new Set()
  
  $('table').each((_, table) => {
    const $table = $(table)
    const rows = $table.find('tr')
    
    // Skip if too few rows (likely not an event table)
    if (rows.length < 2) return
    
    rows.each((_, row) => {
      const $row = $(row)
      const cells = $row.find('td, th')
      if (cells.length < 2) return
      
      const text = $row.text()
      const dateInfo = extractDateFromText(text)
      if (!dateInfo) return
      
      // Try to find title in cells
      let title = ''
      let location = ''
      let eventUrl = baseUrl
      
      cells.each((_, cell) => {
        const $cell = $(cell)
        const cellText = $cell.text().trim()
        
        // Title is usually in the first or largest cell
        if (!title && cellText.length > 3 && cellText.length < 200) {
          const link = $cell.find('a').first()
          if (link.length) {
            title = link.text().trim()
            const href = link.attr('href')
            if (href) eventUrl = new URL(href, baseUrl).toString()
          } else {
            title = cellText
          }
        }
        
        // Location might be in a cell
        if (!location) {
          const loc = extractLocationFromText(cellText)
          if (loc) location = loc
        }
      })
      
      if (title && title.length >= 3) {
        const key = `${title.toLowerCase().trim()}|${dateInfo}`
        if (!seen.has(key)) {
          seen.add(key)
          events.push({
            title: title.substring(0, 200),
            date_info: dateInfo,
            time_start: extractTimeFromText(text).substring(0, 20),
            location: location.substring(0, 200),
            description: text.substring(0, 500),
            event_url: eventUrl,
            category: '',
            price: ''
          })
        }
      }
    })
  })
  
  return events
}

// Extract events from list items
function extractFromListItems($, baseUrl) {
  const events = []
  const seen = new Set()
  
  $('li, [role="listitem"]').each((_, li) => {
    const $li = $(li)
    const text = $li.text()
    
    if (text.length < 20 || text.length > 1000) return
    
    const dateInfo = extractDateFromText(text)
    if (!dateInfo) return
    
    const title = $li.find('a').first().text().trim() ||
                  $li.find('strong, b').first().text().trim() ||
                  text.split('\n')[0].trim().substring(0, 150)
    
    if (!title || title.length < 3) return
    
    const link = $li.find('a').first().attr('href')
    const eventUrl = link ? new URL(link, baseUrl).toString() : baseUrl
    
    const key = `${title.toLowerCase().trim()}|${dateInfo}`
    if (seen.has(key)) return
    seen.add(key)
    
    events.push({
      title: title.substring(0, 200),
      date_info: dateInfo,
      time_start: extractTimeFromText(text).substring(0, 20),
      location: extractLocationFromText(text).substring(0, 200),
      description: text.substring(0, 500),
      event_url: eventUrl,
      category: '',
      price: ''
    })
  })
  
  return events
}

// Extract events from links that look like event pages
function extractFromEventLinks($, baseUrl) {
  const events = []
  const seen = new Set()
  
  // Expanded link patterns
  const linkPatterns = [
    'a[href*="/event"]', 'a[href*="/events/"]', 'a[href*="/calendar"]', 'a[href*="/show"]',
    'a[href*="/program"]', 'a[href*="/activity"]', 'a[href*="/happening"]',
    'a[href*="/concert"]', 'a[href*="/performance"]', 'a[href*="/exhibition"]',
    'a[href*="/workshop"]', 'a[href*="/class"]', 'a[href*="/seminar"]',
    'a[href*="/festival"]', 'a[href*="/fair"]', 'a[href*="/market"]'
  ]
  
  for (const pattern of linkPatterns) {
    $(pattern).each((_, el) => {
      const $link = $(el)
      const href = $link.attr('href')
      if (!href) return
      
      const fullUrl = new URL(href, baseUrl).toString()
      const linkText = $link.text().trim()
      const parentText = $link.parent().text()
      const grandparentText = $link.parent().parent().text()
      const contextText = parentText || grandparentText
      
      // Extract date using enhanced function
      const dateInfo = extractDateFromText(contextText)
      
      // Still include if no date but link text is substantial
      if (!dateInfo && linkText.length < 5) return
      
      const title = linkText || href.split('/').pop()?.replace(/[-_]/g, ' ') || 'Event'
      if (title.length < 3) return
      
      const key = `${title.toLowerCase()}|${dateInfo || ''}`
      if (seen.has(key)) return
      seen.add(key)
      
      events.push({
        title: title.substring(0, 200),
        date_info: dateInfo || '',
        time_start: extractTimeFromText(contextText).substring(0, 20),
        location: extractLocationFromText(contextText).substring(0, 200),
        description: contextText.substring(0, 500),
        event_url: fullUrl,
        category: '',
        price: ''
      })
    })
  }
  
  return events
}

// Follow pagination links and scrape multiple pages
async function findPaginationLinks($, baseUrl) {
  const links = new Set()
  
  // Expanded pagination patterns
  const paginationSelectors = [
    'a[href*="page"]', 'a[href*="p="]', 'a[href*="offset"]', 'a[href*="start="]',
    'a[class*="next"]', 'a[class*="pagination"]', 'a[aria-label*="next" i]',
    'a[aria-label*="Next" i]', 'a[title*="next" i]', 'a[title*="Next" i]',
    '[class*="pagination"] a', '[class*="pager"] a', '[class*="load-more"]',
    'a[href*="/page/"]', 'a[href*="?page="]', 'a[href*="&page="]'
  ]
  
  for (const selector of paginationSelectors) {
    $(selector).each((_, el) => {
      const href = $(el).attr('href')
      if (href) {
        try {
          const url = new URL(href, baseUrl).toString()
          // Filter out non-pagination URLs
          if (url !== baseUrl && 
              !links.has(url) && 
              !url.includes('#') &&
              (url.includes('page') || url.includes('offset') || url.includes('p='))) {
            links.add(url)
          }
        } catch {}
      }
    })
  }
  
  return Array.from(links).slice(0, 10) // Increased to 10 pages per source
}

// Scrape individual event detail pages for richer data
async function scrapeEventDetail(url) {
  try {
    const html = await fetchText(url)
    if (!html) return null
    
    const $ = cheerioLoad(html)
    
    // Try to extract more details from the page
    const title = $('h1').first().text().trim() || 
                  $('title').text().split('|')[0].trim() ||
                  $('meta[property="og:title"]').attr('content')
    
    const description = $('meta[name="description"]').attr('content') ||
                       $('meta[property="og:description"]').attr('content') ||
                       $('p').first().text().trim()
    
    const location = $('[class*="location"], [class*="venue"], [class*="address"]').first().text().trim() ||
                     $('address').first().text().trim()
    
    // Look for date/time info
    const dateText = $('[class*="date"], [class*="time"]').first().text().trim()
    const dateMatch = dateText.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})|(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i)
    
    if (title && title.length > 3) {
      return {
        title: title.substring(0, 200),
        date_info: dateMatch?.[0] || dateText.substring(0, 50),
        time_start: '',
        location: location.substring(0, 200),
        description: description.substring(0, 500),
        event_url: url,
        category: '',
        price: ''
      }
    }
  } catch {}
  return null
}

function isLikelyEvent(e) {
  const titleOk = e.title && e.title.length > 3 && e.title.length < 200
  const hasLink = e.event_url && /^https?:\/\//.test(e.event_url)
  const plausibleDate = (() => { 
    try { 
      const d = chrono.parseDate(String(e.date_info || ''))
      if (!d) return false
      const now = new Date()
      const oneYearAgo = now.getTime() - 365*24*3600*1000
      const twoYearsFuture = now.getTime() + 2*365*24*3600*1000
      return d.getTime() >= oneYearAgo && d.getTime() <= twoYearsFuture
    } catch { return false } 
  })()
  return titleOk && hasLink && plausibleDate
}

async function main() {
  const args = process.argv.slice(2)
  const seedsIdx = args.indexOf('--seeds')
  const outIdx = args.indexOf('--out')
  const seedsPath = seedsIdx >= 0 ? args[seedsIdx + 1] : null
  const outPath = outIdx >= 0 ? args[outIdx + 1] : join(process.cwd(), 'public', 'data', 'events.general.json')
  if (!seedsPath) throw new Error('--seeds required')
  
  const seeds = readFileSync(seedsPath, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  const results = []
  const scrapedUrls = new Set()
  
  console.log(`Scraping ${seeds.length} sources...`)
  
  for (const url of seeds) {
    try {
      console.log(`\nScraping ${url}...`)
      
      // Scrape main page
      const html = await fetchText(url)
      if (!html) continue
      
      const $ = cheerioLoad(html)
      
      // Extract from HTML patterns
      const fromPatterns = extractFromHtmlPatterns($, url)
      console.log(`  Found ${fromPatterns.length} events from HTML patterns`)
      results.push(...fromPatterns.map(e => normalizeEvent(e)))
      
      // Extract from tables
      const fromTables = extractFromTables($, url)
      console.log(`  Found ${fromTables.length} events from tables`)
      results.push(...fromTables.map(e => normalizeEvent(e)))
      
      // Extract from list items
      const fromListItems = extractFromListItems($, url)
      console.log(`  Found ${fromListItems.length} events from list items`)
      results.push(...fromListItems.map(e => normalizeEvent(e)))
      
      // Extract from event links
      const fromLinks = extractFromEventLinks($, url)
      console.log(`  Found ${fromLinks.length} potential event links`)
      
      // Scrape detail pages for more links (increased limit)
      const linksToScrape = fromLinks.slice(0, 50) // Increased to 50 detail pages per source
      for (const linkEvent of linksToScrape) {
        if (scrapedUrls.has(linkEvent.event_url)) continue
        scrapedUrls.add(linkEvent.event_url)
        
        await new Promise(r => setTimeout(r, 500)) // Rate limit
        const detail = await scrapeEventDetail(linkEvent.event_url)
        if (detail && isLikelyEvent(detail)) {
          results.push(normalizeEvent(detail))
        }
      }
      
      // Follow pagination (limited)
      const paginationLinks = await findPaginationLinks($, url)
      console.log(`  Found ${paginationLinks.length} pagination links`)
      
      for (const pageUrl of paginationLinks.slice(0, 10)) { // Increased to 10 pagination pages
        await new Promise(r => setTimeout(r, 800)) // Slightly faster rate limit
        
        const pageHtml = await fetchText(pageUrl)
        if (!pageHtml) continue
        
        const $page = cheerioLoad(pageHtml)
        const pageEvents = extractFromHtmlPatterns($page, pageUrl)
        const pageTables = extractFromTables($page, pageUrl)
        const pageListItems = extractFromListItems($page, pageUrl)
        const totalPageEvents = pageEvents.length + pageTables.length + pageListItems.length
        console.log(`    Page ${pageUrl}: Found ${totalPageEvents} events`)
        results.push(...pageEvents.map(e => normalizeEvent(e)))
        results.push(...pageTables.map(e => normalizeEvent(e)))
        results.push(...pageListItems.map(e => normalizeEvent(e)))
      }
      
    } catch (e) {
      console.error(`Error scraping ${url}:`, e.message)
    }
  }
  
  // Filter and deduplicate
  const filtered = results
    .filter(e => isLikelyEvent(e))
    .map(e => ({ 
      ...e, 
      _ts: deriveTimestamp(e.date_info, e.time_start),
      source: 'general_scraper',
      scraped_at: new Date().toISOString(),
      extraction_method: 'html_patterns'
    }))
    .filter((e, idx, arr) => {
      const key = `${String(e.title).toLowerCase().trim()}|${String(e.date_info || '').toLowerCase().trim()}`
      return arr.findIndex(x => `${String(x.title).toLowerCase().trim()}|${String(x.date_info || '').toLowerCase().trim()}` === key) === idx
    })
  
  writeFileSync(outPath, JSON.stringify(filtered, null, 2))
  console.log(`\nGeneral scraper extracted ${filtered.length} events -> ${outPath}`)
}

main()

