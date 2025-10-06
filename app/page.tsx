import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen p-6">
      <h1 className="text-3xl font-bold mb-4">Chicago Events Aggregator</h1>
      <p className="mb-6">Daily-scraped, deduplicated, categorized events across Chicago.</p>
      <Link href="/map" className="text-blue-600 underline">View Map</Link>
    </main>
  )
}
