# Chicago Events Aggregator - Project Status & Paths Forward

## Current State

### ✅ What's Working

**Data Pipeline**
- **Dual Scraping System**: Two complementary scrapers work together:
  - `universal-extract.js`: Extracts structured data (JSON-LD, microdata, iCal) - gets ~198 events
  - `general-scraper.js`: Parses HTML directly for event patterns - gets ~250 events
- **Total Events**: 343 events after deduplication
- **Data Quality**: 100% validation pass rate (all events have titles, locations, descriptions, dates)
- **Geocoding**: 72 events (21%) have coordinates and display on map

**Web Application**
- Next.js 14 with TypeScript
- Interactive Leaflet map at `/map`
- Search, category filtering, time-based filtering (today, week, weekend)
- Responsive design with dark theme
- Event list sidebar with details

**CI/CD**
- GitHub Actions workflows configured
- Nightly automated scraping (6 AM UTC)
- Automatic deployment to Vercel

### 📊 Current Metrics

- **Total Events**: 343
- **Geocoded Events**: 72 (21%)
- **Event Sources**: 21 URLs in `sources/seeds.txt`
- **Data Quality**: 100% valid (per validation script)
- **Scraping Methods**: 5 different extraction techniques

### 🔧 Technical Stack

- **Frontend**: Next.js 14, React, TypeScript, Leaflet
- **Scraping**: Cheerio (HTML parsing), chrono-node (date parsing)
- **Geocoding**: OpenStreetMap Nominatim API (rate-limited, cached)
- **Deployment**: Vercel (via GitHub Actions)

---

## Current Limitations & Issues

### 1. **Low Geocoding Coverage (21%)**
- Only 72 of 343 events have coordinates
- Many events have location text but aren't geocoded
- Rate limiting (300-500 requests/day) prevents full geocoding
- Some location strings are too vague or malformed

### 2. **Event Volume Could Be Higher**
- Many sites use JavaScript-rendered content (not accessible to current scrapers)
- Some sites block scrapers (403/401 errors)
- Pagination detection could be improved
- Event detail page scraping is limited (50 per source)

### 3. **Data Quality Issues**
- Some events have incomplete information
- Location strings sometimes need cleaning
- Date formats vary widely across sources
- No category normalization (events have inconsistent categories)

### 4. **Performance & Scalability**
- Sequential scraping is slow (takes several minutes)
- No parallel processing
- Geocoding is the bottleneck (rate-limited API)
- No incremental updates (full scrape each time)

---

## Possible Paths Forward

### Path 1: **Improve Geocoding Coverage** (Quick Wins)

**Goal**: Get 70%+ events geocoded

**Approaches**:
1. **Add venue database**: Create/import Chicago venue database with pre-geocoded locations
   - Venues like "Lincoln Park Zoo", "Navy Pier", "Art Institute" can be matched by name
   - Reduces API calls, improves accuracy

2. **Better location cleaning**: Improve location string normalization
   - Handle common abbreviations (St → Street, Ave → Avenue)
   - Extract venue names from long address strings
   - Remove "Chicago, IL" suffixes before geocoding

3. **Use multiple geocoding services**: Fallback to Google Geocoding API (paid) or Mapbox
   - Nominatim has strict rate limits
   - Paid services allow batch geocoding

4. **Increase geocoding budget**: Raise MAX_LOOKUPS to 1000+ for comprehensive coverage

**Effort**: Low-Medium
**Impact**: High (more events visible on map)

---

### Path 2: **Scale Up Event Collection** (Medium Effort)

**Goal**: Get 1000+ events

**Approaches**:
1. **Add headless browser scraping**: Use Playwright/Puppeteer for JavaScript-rendered sites
   - Many modern sites load events via JavaScript
   - Can handle infinite scroll, dynamic content
   - Already in dependencies (Playwright mentioned in workflows)

2. **Expand source list**: Add more Chicago event sources
   - Facebook Events API (requires API key)
   - Eventbrite API (has official API)
   - Meetup API (requires API key)
   - Ticketmaster API (requires partnership)
   - Chicago Tribune events
   - Chicago Reader events

3. **Improve pagination**: Better detection and following of pagination
   - Currently limited to 10 pages per source
   - Could follow deeper or use infinite scroll detection

4. **Aggressive detail page scraping**: Increase from 50 to 200+ per source
   - More complete event data
   - Better location extraction

**Effort**: Medium-High
**Impact**: High (significantly more events)

---

### Path 3: **Improve Data Quality & Normalization** (Medium Effort)

**Goal**: Consistent, clean, normalized event data

**Approaches**:
1. **Category normalization**: Map various category names to standard taxonomy
   - Music, Art, Food, Sports, etc.
   - Improve filtering UX

2. **Event deduplication improvements**: Better fuzzy matching
   - Currently exact match on title+date
   - Could use Levenshtein distance or ML-based matching

3. **Data enrichment**: Add missing fields
   - Price extraction (already started)
   - Image URLs
   - Organizer information
   - Tags/keywords

4. **Date/time normalization**: Consistent date formats
   - All dates in ISO format
   - Time zones handled correctly
   - Recurring events detection

**Effort**: Medium
**Impact**: Medium-High (better UX, more reliable data)

---

### Path 4: **Performance & Infrastructure** (Medium Effort)

**Goal**: Faster scraping, incremental updates, better reliability

**Approaches**:
1. **Parallel scraping**: Process multiple sources concurrently
   - Use worker threads or Promise.all()
   - Could reduce scraping time from minutes to seconds

2. **Incremental updates**: Only scrape new/changed events
   - Track last-scraped timestamps per source
   - Skip unchanged pages
   - Reduces load on source sites

3. **Caching layer**: Cache HTML responses
   - Avoid re-scraping unchanged pages
   - Respect ETags/Last-Modified headers

4. **Database storage**: Move from JSON files to database
   - PostgreSQL or SQLite for better querying
   - Easier incremental updates
   - Better performance for large datasets

**Effort**: Medium-High
**Impact**: Medium (better scalability, faster updates)

---

### Path 5: **Advanced Features** (High Effort)

**Goal**: Premium features for power users

**Approaches**:
1. **User accounts & favorites**: Save favorite events
   - Authentication (NextAuth.js)
   - User preferences
   - Personal event lists

2. **Email/Calendar integration**: Export events to calendar
   - iCal export
   - Email reminders
   - Calendar sync

3. **Event recommendations**: ML-based suggestions
   - Based on user preferences
   - Similar events
   - Popular events in user's area

4. **Advanced filtering**: More filter options
   - Price range
   - Distance from location
   - Event type (concert, workshop, etc.)
   - Accessibility info

5. **Mobile app**: Native mobile experience
   - React Native app
   - Push notifications
   - Offline support

**Effort**: High
**Impact**: High (if user base exists)

---

### Path 6: **Monetization & Sustainability** (Business Focus)

**Goal**: Make project sustainable or profitable

**Approaches**:
1. **API access**: Provide paid API for events data
   - Rate-limited free tier
   - Paid tiers for higher volume
   - Enterprise plans

2. **Sponsored events**: Highlight paid placements
   - Maintain editorial integrity
   - Clear labeling

3. **Affiliate links**: Commission on ticket sales
   - Link to ticket vendors
   - Revenue share

4. **Premium features**: Freemium model
   - Free: Basic map, limited filters
   - Premium: Advanced filters, calendar sync, no ads

**Effort**: High
**Impact**: Depends on user base and market

---

## Recommended Immediate Next Steps

### Phase 1: Quick Wins (1-2 weeks)
1. ✅ **Improve geocoding** - Add venue database, better location cleaning
2. ✅ **Fix low-hanging quality issues** - Improve filtering, data cleaning
3. ✅ **Add more sources** - Expand `sources/seeds.txt` with 10-20 more URLs

### Phase 2: Scale Up (2-4 weeks)
1. ✅ **Add headless browser support** - Playwright for JS-rendered sites
2. ✅ **Parallel scraping** - Speed up collection process
3. ✅ **Better pagination** - Follow more pages per source

### Phase 3: Polish (1-2 weeks)
1. ✅ **Category normalization** - Consistent taxonomy
2. ✅ **Better deduplication** - Fuzzy matching
3. ✅ **Performance optimization** - Database, caching

---

## Technical Debt & Maintenance

### Current Issues to Address
- Some scrapers fail silently (403/401 errors) - need better error handling
- No monitoring/alerting for scraping failures
- Geocoding cache could be optimized (currently flat JSON file)
- No tests for scraping logic
- Hardcoded limits (pagination, detail pages) could be configurable

### Recommended Additions
- Unit tests for key scraping functions
- Integration tests for full pipeline
- Monitoring dashboard (scraping success rates, event counts)
- Error logging and alerting
- Configuration file for limits/timeouts

---

## Resource Requirements

### Current
- **Time**: ~30 min/day for full scrape (if run manually)
- **Cost**: $0 (free tier services)
- **Infrastructure**: GitHub Actions (free), Vercel (free tier)

### Scaling Estimates
- **1000+ events**: ~1 hour scrape time, ~$5-10/month (paid geocoding)
- **10,000+ events**: Requires database, ~$20-50/month infrastructure
- **API service**: Requires dedicated hosting, ~$50-200/month

---

## Conclusion

The project is in a **solid working state** with a functional data pipeline and web interface. The main opportunities are:

1. **Short-term**: Improve geocoding coverage and add more sources
2. **Medium-term**: Scale up event collection with headless browsers and APIs
3. **Long-term**: Add advanced features, consider monetization

The foundation is strong - the dual scraping system works well, data quality is good, and the web interface is functional. The path forward depends on your goals: more events, better coverage, or premium features.

