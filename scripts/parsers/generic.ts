import type { ProductSource } from '../../src/types'

export type ExtractedPrice = {
  displayedPriceYen: number | null
  regularPriceYen: number | null
  salePriceYen: number | null
  priceEvidence: string | null
}

export type ParsedProduct = {
  name: string | null
  imageUrl: string | null
  price: ExtractedPrice
  inStock: boolean
  detectedSizeGrams: number | null
  detectedFlavor: string | null
  detectedSku: string | null
}

export type ParserContext = {
  html: string
  source: ProductSource
}

export type StoreParser = {
  name: string
  parse(context: ParserContext): ParsedProduct
}

export function emptyPrice(): ExtractedPrice {
  return {
    displayedPriceYen: null,
    regularPriceYen: null,
    salePriceYen: null,
    priceEvidence: null,
  }
}

export function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

export function yenFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value !== 'string') return null
  const normalized = value.replace(/[^\d.]/g, '')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.round(parsed) : null
}

export function absoluteUrl(url: string | null, baseUrl: string) {
  if (!url) return null
  try {
    return new URL(url, baseUrl).toString()
  } catch {
    return url
  }
}

export function findMeta(html: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return decodeHtml(match[1].trim())
  }
  return null
}

export function findTitle(html: string) {
  const ogTitle = findMeta(html, 'og:title')
  if (ogTitle) return ogTitle
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  return title ? decodeHtml(title.replace(/\s+/g, ' ').trim()) : null
}

export function detectSizeGramsFromText(text: string): number | null {
  const normalized = text.replace(/,/g, '').toLowerCase()
  const kgMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*kg\b/)
  if (kgMatch) return Math.round(Number(kgMatch[1]) * 1000)
  const gramMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*g\b/)
  if (gramMatch) return Math.round(Number(gramMatch[1]))
  return null
}

export function normalizeSku(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null
}

export function collectJsonLd(html: string): unknown[] {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  const parsed: unknown[] = []

  for (const block of blocks) {
    const raw = decodeHtml(block[1].trim())
    try {
      parsed.push(JSON.parse(raw))
    } catch {
      // Some stores emit invalid JSON-LD. Ignore and continue to HTML fallback.
    }
  }

  return parsed
}

export function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd)
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  const graph = Array.isArray(record['@graph']) ? flattenJsonLd(record['@graph']) : []
  return [record, ...graph]
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function extractJsonLdProduct(html: string, baseUrl: string): Partial<ParsedProduct> {
  const nodes = collectJsonLd(html).flatMap(flattenJsonLd)
  const product = nodes.find((node) => {
    const type = node['@type']
    return Array.isArray(type) ? type.includes('Product') : type === 'Product'
  })

  if (!product) return {}

  const offers = asArray(product.offers as Record<string, unknown> | Record<string, unknown>[] | undefined)
  const offer = offers[0] ?? {}
  const availability = String(offer.availability ?? product.availability ?? '').toLowerCase()
  const displayedPriceYen = yenFromUnknown(offer.price ?? offer.lowPrice ?? offer.highPrice)
  const imageValue = asArray(product.image as string | string[] | undefined)[0] ?? null

    return {
      name: typeof product.name === 'string' ? product.name : null,
      imageUrl: absoluteUrl(imageValue, baseUrl),
    price: {
      displayedPriceYen,
      regularPriceYen: null,
      salePriceYen: null,
      priceEvidence: displayedPriceYen === null ? null : 'json-ld offers.price',
      },
      inStock: availability ? !availability.includes('outofstock') && !availability.includes('soldout') : true,
      detectedSizeGrams: typeof product.name === 'string' ? detectSizeGramsFromText(product.name) : null,
      detectedFlavor: null,
      detectedSku: null,
    }
  }

function extractVisiblePrice(html: string): ExtractedPrice {
  const priceMatches = [...html.matchAll(/[¥￥]\s*([0-9][0-9,]*)/g)]
  const prices = priceMatches
    .map((match) => yenFromUnknown(match[1]))
    .filter((price): price is number => price !== null && price > 0)

  if (prices.length === 0) return emptyPrice()

  return {
    displayedPriceYen: Math.min(...prices),
    regularPriceYen: null,
    salePriceYen: null,
    priceEvidence: 'html visible yen price min',
  }
}

export const genericParser: StoreParser = {
  name: 'generic',
  parse({ html, source }) {
    const jsonLd = extractJsonLdProduct(html, source.productUrl)
    const fallbackPrice = extractVisiblePrice(html)
    const metaImage = findMeta(html, 'og:image')
    const title = findTitle(html)
    const stockText = html.replace(/\s+/g, '').toLowerCase()
    const looksOutOfStock = ['soldout', 'outofstock', '在庫なし', '売り切れ', '品切れ'].some((word) => stockText.includes(word.toLowerCase()))

    return {
      name: jsonLd.name ?? title,
      imageUrl: jsonLd.imageUrl ?? absoluteUrl(metaImage, source.productUrl),
      price: jsonLd.price?.displayedPriceYen !== null && jsonLd.price?.displayedPriceYen !== undefined ? jsonLd.price : fallbackPrice,
      inStock: jsonLd.inStock ?? !looksOutOfStock,
      detectedSizeGrams: jsonLd.detectedSizeGrams ?? detectSizeGramsFromText(`${jsonLd.name ?? ''} ${title ?? ''}`),
      detectedFlavor: jsonLd.detectedFlavor ?? null,
      detectedSku: jsonLd.detectedSku ?? null,
    }
  },
}
