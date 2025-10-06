# Chicago Events Aggregator

- Multi-source scraping via cloned `apify1` repo (your scrapers)
- Orchestrated daily via GitHub Actions; commits updated `public/data/events.json`
- Next.js site renders a Leaflet map at `/map`

## Commands

```bash
npm install
npm run generate:data  # scrape + consolidate into public/data/events.json
npm run dev
```

## CI
- `.github/workflows/pipeline.yml` runs nightly and on push
- Requires repo secret `VERCEL_TOKEN`
- First `vercel --prod` with your token will link the project
