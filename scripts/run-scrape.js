import { execSync } from 'node:child_process'
import { join } from 'node:path'

// Scrape events from seeds.txt using both universal extractor and general scraper
const seedsPath = join(process.cwd(), 'sources', 'seeds.txt')
const universalOut = join(process.cwd(), 'public', 'data', 'events.universal.json')
const generalOut = join(process.cwd(), 'public', 'data', 'events.general.json')

function run(cmd) {
  console.log(`$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit' })
}

console.log('Scraping events from seeds using universal extractor...')
run(`node scripts/universal-extract.js --seeds ${seedsPath} --out ${universalOut}`)

console.log('\nScraping events using general HTML scraper...')
run(`node scripts/general-scraper.js --seeds ${seedsPath} --out ${generalOut}`)

console.log('\nScraping complete!')
