import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getParser, type ParsedProduct } from './parsers'
import type { FetchStatus, PriceHistoryEntry, ProductOffer, ProductSource } from '../src/types'

const ROOT = process.cwd()
const SOURCES_PATH = path.join(ROOT, 'productSources.json')
const OUTPUT_PATH = path.join(ROOT, 'data', 'product-offers.json')
const HISTORY_PATH = path.join(ROOT, 'data', 'price-history.json')
const TIMEOUT_MS = Number(process.env.PRICE_FETCH_TIMEOUT_MS ?? 15000)
const FETCH_DELAY_MS = Number(process.env.PRICE_FETCH_DELAY_MS ?? 1200)
const USER_AGENT = process.env.PRICE_FETCH_USER_AGENT ?? 'FitPriceProteinBot/0.1 (+manual product list; contact: owner)'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function today() {
  // 日本のユーザー向けサイトのため、日付はJST基準にする（UTCだと朝9時まで前日扱いになる）。
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function offerIdFor(source: ProductSource) {
  const productId = `${slugify(source.maker)}-${source.proteinType.toLowerCase()}-${source.sizeGrams}g-${slugify(source.productUrl)}`
  const offerId = `${productId}-${source.storeType}-${source.priority}`
  return { productId, offerId }
}

async function readPreviousOffers() {
  try {
    const offers = JSON.parse(await readFile(OUTPUT_PATH, 'utf8')) as ProductOffer[]
    return new Map(offers.map((offer) => [offer.offerId, offer]))
  } catch {
    return new Map<string, ProductOffer>()
  }
}

function previousSuccessfulPrice(previous: ProductOffer | undefined) {
  if (!previous) {
    return {
      lastSuccessfulPriceYen: null,
      lastSuccessfulCheckedAt: null,
    }
  }

  return {
    lastSuccessfulPriceYen: previous.lastSuccessfulPriceYen ?? previous.effectivePriceYen ?? null,
    lastSuccessfulCheckedAt: previous.lastSuccessfulCheckedAt ?? (previous.effectivePriceYen !== null ? previous.lastCheckedAt : null),
  }
}

function calculateStatus(parsed: ParsedProduct, errorMessage?: string): FetchStatus {
  if (errorMessage) return 'failed'
  const hasNameOrImage = Boolean(parsed.name || parsed.imageUrl)
  const hasPrice = Boolean(
    parsed.price.displayedPriceYen !== null
    || parsed.price.regularPriceYen !== null
    || parsed.price.salePriceYen !== null,
  )

  if (hasPrice && hasNameOrImage) return 'success'
  if (hasNameOrImage) return 'partial'
  return 'failed'
}

function normalizeComparable(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null
}

function validateExpectedProduct(source: ProductSource, parsed: ParsedProduct) {
  const errors: string[] = []

  if (source.expectedSizeGrams !== undefined && parsed.detectedSizeGrams !== null && source.expectedSizeGrams !== parsed.detectedSizeGrams) {
    errors.push(`expectedSizeGrams=${source.expectedSizeGrams}, detectedSizeGrams=${parsed.detectedSizeGrams}`)
  }

  if (source.expectedSku != null) {
    const expectedSku = normalizeComparable(source.expectedSku)
    const detectedSku = normalizeComparable(parsed.detectedSku)
    if (expectedSku !== detectedSku) {
      errors.push(`expectedSku=${source.expectedSku}, detectedSku=${parsed.detectedSku ?? 'null'}`)
    }
  }

  if (source.expectedFlavor != null) {
    const expectedFlavor = normalizeComparable(source.expectedFlavor)
    const detectedFlavor = normalizeComparable(parsed.detectedFlavor)
    if (detectedFlavor !== null && expectedFlavor !== detectedFlavor) {
      errors.push(`expectedFlavor=${source.expectedFlavor}, detectedFlavor=${parsed.detectedFlavor}`)
    }
  }

  return errors
}

function calculateOffer(
  source: ProductSource,
  parsed: ParsedProduct,
  previous: ProductOffer | undefined,
  fetchStatus: FetchStatus,
  errorMessage?: string,
): ProductOffer {
  const { productId, offerId } = offerIdFor(source)
  // 送料は価格・ランキングには含めない（ユーザー判断）。shippingYen/freeShippingMinYenは
  // サイト上の「送料のめやす」表の表示用データとしてのみ持ち回す。
  const shippingYen = source.shippingYen ?? 0
  const freeShippingMinYen = source.freeShippingMinYen ?? null
  const couponDiscountYen = source.couponDiscountYen ?? 0
  const regularPriceYen = parsed.price.regularPriceYen
  const salePriceYen = parsed.price.salePriceYen
  const displayedPriceYen = parsed.price.displayedPriceYen
  const basePrice = salePriceYen ?? regularPriceYen ?? displayedPriceYen
  const effectivePriceYen = basePrice === null ? null : Math.max(0, basePrice - couponDiscountYen)
  const validSize = Number.isFinite(source.sizeGrams) && source.sizeGrams > 0
  const bags = validSize ? 3000 / source.sizeGrams : 0
  const pricePer3KgYen = effectivePriceYen === null || !validSize ? null : Math.round(effectivePriceYen * bags)
  const pricePerKgYen = pricePer3KgYen === null ? null : Math.round(pricePer3KgYen / 3)
  const regularEffectivePriceYen = regularPriceYen
  const regularPricePer3KgYen = regularPriceYen === null || !validSize ? null : Math.round(regularPriceYen * bags)
  const discountAmount = regularEffectivePriceYen !== null && effectivePriceYen !== null ? Math.max(0, regularEffectivePriceYen - effectivePriceYen) : 0
  const previousSuccess = previousSuccessfulPrice(previous)
  const successPrice = fetchStatus === 'success' ? effectivePriceYen : previousSuccess.lastSuccessfulPriceYen
  const successDate = fetchStatus === 'success' ? today() : previousSuccess.lastSuccessfulCheckedAt
  // partialだった前回データの価格は別バリエーションの可能性があるため、前回比には成功時の価格だけを使う。
  const previousEffectivePriceYen = previous
    ? (previous.fetchStatus === 'success' ? previous.effectivePriceYen : previous.lastSuccessfulPriceYen)
    : null
  const priceDiffYen = effectivePriceYen !== null && previousEffectivePriceYen !== null
    ? effectivePriceYen - previousEffectivePriceYen
    : null

  return {
    productId,
    offerId,
    maker: source.maker,
    name: source.displayName ?? parsed.name ?? previous?.name ?? `${source.maker} ${source.proteinType} ${source.sizeGrams}g`,
    proteinType: source.proteinType,
    sizeGrams: source.sizeGrams,
    expectedSizeGrams: source.expectedSizeGrams,
    expectedFlavor: source.expectedFlavor,
    expectedSku: source.expectedSku,
    detectedSizeGrams: parsed.detectedSizeGrams,
    detectedFlavor: parsed.detectedFlavor,
    detectedSku: parsed.detectedSku,
    imageUrl: parsed.imageUrl ?? previous?.imageUrl ?? `./images/${source.proteinType.toLowerCase()}.svg`,
    storeName: source.storeName,
    storeType: source.storeType,
    productUrl: source.productUrl,
    affiliateUrl: source.affiliateUrl ?? null,
    regularPriceYen,
    salePriceYen,
    couponDiscountYen,
    shippingYen,
    freeShippingMinYen,
    effectivePriceYen,
    pricePerKgYen,
    pricePer3KgYen,
    regularEffectivePriceYen,
    regularPricePer3KgYen,
    previousEffectivePriceYen,
    priceDiffYen,
    hasSale: salePriceYen !== null && regularPriceYen !== null && salePriceYen < regularPriceYen,
    hasCoupon: couponDiscountYen > 0 || Boolean(source.couponLabel),
    couponLabel: source.couponLabel ?? null,
    saleLabel: salePriceYen !== null ? 'SALE' : null,
    discountRate: regularEffectivePriceYen !== null && regularEffectivePriceYen > 0 && discountAmount > 0 ? Math.round((discountAmount / regularEffectivePriceYen) * 100) : null,
    inStock: parsed.inStock,
    lastCheckedAt: today(),
    fetchStatus,
    ...(errorMessage ? { errorMessage } : {}),
    lastSuccessfulPriceYen: successPrice,
    lastSuccessfulCheckedAt: successDate,
    couponSource: source.couponSource ?? 'none',
    priceEvidence: parsed.price.priceEvidence,
    sourceType: 'scraping',
  }
}

function skippedOffer(source: ProductSource, previous: ProductOffer | undefined, reason: string): ProductOffer {
  const parsed: ParsedProduct = {
    name: previous?.name ?? null,
    imageUrl: previous?.imageUrl ?? null,
    price: {
      displayedPriceYen: null,
      regularPriceYen: null,
      salePriceYen: null,
      priceEvidence: null,
    },
    inStock: false,
    detectedSizeGrams: previous?.detectedSizeGrams ?? null,
    detectedFlavor: previous?.detectedFlavor ?? null,
    detectedSku: previous?.detectedSku ?? null,
  }

  return calculateOffer(source, parsed, previous, 'skipped', reason)
}

async function fetchHtml(url: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

async function fetchOffer(source: ProductSource, previous: ProductOffer | undefined): Promise<ProductOffer> {
  if (source.storeType !== 'official') {
    return skippedOffer(source, previous, `対象外のstoreTypeです: ${source.storeType}`)
  }

  try {
    const html = await fetchHtml(source.fetchUrl ?? source.productUrl)
    const parser = getParser(source)
    const parsed = parser.parse({ html, source })
    const validationErrors = validateExpectedProduct(source, parsed)
    const baseStatus = calculateStatus(parsed)
    const status = baseStatus === 'success' && validationErrors.length > 0 ? 'partial' : baseStatus
    const errorMessage = validationErrors.length > 0
      ? `期待した商品バリエーションと取得結果が一致しません: ${validationErrors.join('; ')}`
      : status === 'partial' ? '商品情報の一部は取得できましたが、価格を取得できませんでした' : undefined
    return calculateOffer(source, parsed, previous, status, errorMessage)
  } catch (error) {
    const parsed: ParsedProduct = {
      name: previous?.name ?? null,
      imageUrl: previous?.imageUrl ?? null,
      price: {
        displayedPriceYen: null,
        regularPriceYen: null,
        salePriceYen: null,
        priceEvidence: null,
      },
      inStock: false,
      detectedSizeGrams: previous?.detectedSizeGrams ?? null,
      detectedFlavor: previous?.detectedFlavor ?? null,
      detectedSku: previous?.detectedSku ?? null,
    }
    return calculateOffer(source, parsed, previous, 'failed', error instanceof Error ? error.message : String(error))
  }
}

async function appendPriceHistory(offers: ProductOffer[]) {
  let history: PriceHistoryEntry[] = []
  try {
    history = JSON.parse(await readFile(HISTORY_PATH, 'utf8')) as PriceHistoryEntry[]
  } catch {
    // 初回実行時は履歴なし。
  }

  const date = today()
  const successOfferIds = new Set(
    offers.filter((offer) => offer.fetchStatus === 'success').map((offer) => offer.offerId),
  )

  // 同日再実行時は当日分を最新値で置き換える。
  const kept = history.filter((entry) => !(entry.date === date && successOfferIds.has(entry.offerId)))
  const added = offers
    .filter((offer) => offer.fetchStatus === 'success')
    .map((offer): PriceHistoryEntry => ({
      date,
      offerId: offer.offerId,
      maker: offer.maker,
      effectivePriceYen: offer.effectivePriceYen,
      regularPriceYen: offer.regularPriceYen,
      salePriceYen: offer.salePriceYen,
      hasSale: offer.hasSale,
      hasCoupon: offer.hasCoupon,
    }))

  const next = [...kept, ...added]
  await writeFile(HISTORY_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  console.log(`Appended ${added.length} price history entries -> ${path.relative(ROOT, HISTORY_PATH)}`)
}

async function main() {
  const sources = JSON.parse(await readFile(SOURCES_PATH, 'utf8')) as ProductSource[]
  const previousOffers = await readPreviousOffers()
  const offers: ProductOffer[] = []

  for (const source of sources) {
    const { offerId } = offerIdFor(source)
    offers.push(await fetchOffer(source, previousOffers.get(offerId)))
    await sleep(FETCH_DELAY_MS)
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, `${JSON.stringify(offers, null, 2)}\n`, 'utf8')
  await appendPriceHistory(offers)
  console.log(`Fetched ${offers.length} offers -> ${path.relative(ROOT, OUTPUT_PATH)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
