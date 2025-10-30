# Chicago Events Aggregator

A unified Chicago events aggregator that scrapes events from multiple sources, consolidates and deduplicates them, geocodes locations, and displays them on an interactive map.

## Features

- **Multi-source scraping**: Uses universal extractor to scrape events from multiple Chicago event sources (see `sources/seeds.txt`)
- **Consolidation & deduplication**: Merges events from different sources and removes duplicates
- **Geocoding**: Automatically geocodes event locations using OpenStreetMap Nominatim
- **Interactive map**: Next.js site with Leaflet map displaying events with filtering and search
- **Automated daily updates**: GitHub Actions workflow runs nightly to refresh event data

## Data Pipeline

1. **Scrape**: `npm run scrape` - Scrapes events from URLs in `sources/seeds.txt` using universal extractor (JSON-LD, microdata, iCal)
2. **Consolidate**: `npm run consolidate` - Filters, normalizes, and deduplicates events
3. **Geocode**: `npm run geocode` - Adds latitude/longitude coordinates to events
4. **Generate**: `npm run generate:data` - Runs all three steps in sequence

## Commands

```bash
npm install
npm run generate:data  # scrape + consolidate + geocode into public/data/events.json
npm run dev           # Start Next.js dev server
npm run build         # Build for production
npm run validate:dataset public/data/events.json  # Validate event data quality
```

## CI/CD

- `.github/workflows/pipeline.yml` - Runs on push to main branch
- `.github/workflows/nightly.yml` - Runs daily at 6 AM UTC
- Both workflows scrape, consolidate, geocode, commit updated data, and deploy to Vercel
- Requires repo secret `VERCEL_TOKEN` for deployment

## Project Structure

- `sources/seeds.txt` - List of URLs to scrape events from
- `scripts/` - Data processing scripts (scrape, consolidate, geocode, validate)
- `public/data/events.json` - Final consolidated and geocoded events (gitignored, generated)
- `app/map/page.tsx` - Interactive map interface
- `app/page.tsx` - Home page

## Adding New Event Sources

Add URLs to `sources/seeds.txt` (one per line). The universal extractor will attempt to find events using:
- JSON-LD structured data (`@type: Event`)
- Microdata (`itemtype*="Event"`)
- iCal files (`.ics` links)
