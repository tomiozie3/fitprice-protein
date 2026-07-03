import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { PriceHistoryEntry, ProductOffer } from '../src/types'

const ROOT = process.cwd()
const INPUT_PATH = process.env.PRODUCT_OFFERS_PATH ?? path.join(ROOT, 'data', 'product-offers.json')
const OUTPUT_PATH = process.env.PUBLIC_PRODUCTS_PATH ?? path.join(ROOT, 'public', 'products.json')
const HISTORY_INPUT_PATH = process.env.PRICE_HISTORY_PATH ?? path.join(ROOT, 'data', 'price-history.json')
const HISTORY_OUTPUT_PATH = process.env.PUBLIC_PRICE_HISTORY_PATH ?? path.join(ROOT, 'public', 'price-history.json')
const HISTORY_DAYS = Number(process.env.PUBLIC_PRICE_HISTORY_DAYS ?? 180)

async function exportHistory(publishedOfferIds: Set<string>) {
  let history: PriceHistoryEntry[] = []
  try {
    history = JSON.parse(await readFile(HISTORY_INPUT_PATH, 'utf8')) as PriceHistoryEntry[]
  } catch {
    return
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - HISTORY_DAYS)
  const cutoffDate = cutoff.toISOString().slice(0, 10)

  const published = history.filter((entry) => entry.date >= cutoffDate && publishedOfferIds.has(entry.offerId))
  await writeFile(HISTORY_OUTPUT_PATH, `${JSON.stringify(published, null, 2)}\n`, 'utf8')
  console.log(`Exported ${published.length}/${history.length} history entries -> ${path.relative(ROOT, HISTORY_OUTPUT_PATH)}`)
}

async function main() {
  const offers = JSON.parse(await readFile(INPUT_PATH, 'utf8')) as ProductOffer[]

  const siteOffers = offers
    .filter((offer) => offer.fetchStatus === 'success'
      && offer.effectivePriceYen !== null
      && offer.pricePer3KgYen !== null
      && offer.inStock
      && !offer.errorMessage)
    .sort((a, b) => (a.pricePer3KgYen ?? Number.POSITIVE_INFINITY) - (b.pricePer3KgYen ?? Number.POSITIVE_INFINITY))

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, `${JSON.stringify(siteOffers, null, 2)}\n`, 'utf8')
  await exportHistory(new Set(siteOffers.map((offer) => offer.offerId)))
  console.log(`Exported ${siteOffers.length}/${offers.length} offers -> ${path.relative(ROOT, OUTPUT_PATH)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
