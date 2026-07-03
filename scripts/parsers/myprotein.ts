import {
  absoluteUrl,
  collectJsonLd,
  decodeHtml,
  detectSizeGramsFromText,
  flattenJsonLd,
  genericParser,
  normalizeSku,
  yenFromUnknown,
  type ParsedProduct,
  type StoreParser,
} from './generic'

function stripTags(html: string) {
  return decodeHtml(html.replace(/<[^>]*>/g, '\n')).replace(/\s+/g, ' ').trim()
}

type JsonLdVariant = Record<string, unknown>

// MyproteinのJSON-LDは {"@graph":[{"@type":"ProductGroup","hasVariant":[...]}]} 構造。
// hasVariant配下の各Productに sku / name / image / offers(価格・在庫・取り消し線価格) が揃っている。
function collectVariants(html: string): JsonLdVariant[] {
  const nodes = collectJsonLd(html).flatMap(flattenJsonLd)
  return nodes.flatMap((node) => Array.isArray(node.hasVariant) ? node.hasVariant as JsonLdVariant[] : [])
}

function detectFlavorFromVariantName(name: string | null) {
  // 例: "Impact ホエイ アイソレート 1KG - 33食分 ミルクティー"
  const match = name?.match(/食分\s*(.+)$/)
  return match ? match[1].trim() : null
}

function parseVariant(variant: JsonLdVariant, baseUrl: string): ParsedProduct | null {
  const sku = typeof variant.sku === 'string' ? variant.sku : null
  const name = typeof variant.name === 'string' ? variant.name : null
  if (!sku) return null

  const offer = (variant.offers ?? {}) as Record<string, unknown>
  const displayedPriceYen = yenFromUnknown(offer.price)
  const specs = Array.isArray(offer.priceSpecification) ? offer.priceSpecification as Record<string, unknown>[] : []
  const strikethrough = specs.find((spec) => String(spec.priceType ?? '').includes('StrikethroughPrice'))
  const regularPriceYen = strikethrough ? yenFromUnknown(strikethrough.price) : null
  const availability = String(offer.availability ?? '').toLowerCase()
  const hasSalePrice = regularPriceYen !== null && displayedPriceYen !== null && displayedPriceYen < regularPriceYen
  const imageValue = typeof variant.image === 'string' ? variant.image : Array.isArray(variant.image) ? String(variant.image[0]) : null

  return {
    name,
    imageUrl: absoluteUrl(imageValue, baseUrl),
    price: {
      displayedPriceYen: hasSalePrice ? null : displayedPriceYen,
      regularPriceYen: hasSalePrice ? regularPriceYen : null,
      salePriceYen: hasSalePrice ? displayedPriceYen : null,
      priceEvidence: `myprotein json-ld hasVariant sku=${sku}`,
    },
    inStock: availability ? availability.includes('instock') : true,
    detectedSizeGrams: name ? detectSizeGramsFromText(name) : null,
    detectedFlavor: detectFlavorFromVariantName(name),
    detectedSku: sku,
  }
}

function extractCurrentProductBlock(html: string) {
  const occurrences: number[] = []
  let searchFrom = 0
  while (true) {
    const index = html.indexOf('現在の商品', searchFrom)
    if (index < 0) break
    occurrences.push(index)
    searchFrom = index + 1
  }

  const currentIndex = occurrences.find((index) => html.slice(index, index + 3000).includes('discounted price')) ?? -1
  if (currentIndex < 0) return null
  const endCandidates = [
    html.indexOf('この商品を選択', currentIndex + 1),
    html.indexOf('合計', currentIndex + 1),
  ].filter((index) => index > currentIndex)
  const endIndex = endCandidates.length > 0 ? Math.min(...endCandidates) : currentIndex + 4000
  return stripTags(html.slice(currentIndex, endIndex))
}

function yenAfter(label: string, text: string) {
  const match = text.match(new RegExp(`${label}\\s*[¥￥]\\s*([0-9][0-9,]*)`))
  return match ? yenFromUnknown(match[1]) : null
}

function detectFlavorFromName(name: string | undefined) {
  if (!name) return null
  const parts = name.split(' - ').map((part) => part.trim()).filter(Boolean)
  return parts.length >= 2 ? parts[parts.length - 1] : null
}

function parseCurrentBlock(context: Parameters<StoreParser['parse']>[0]): ParsedProduct {
  const fallback = genericParser.parse(context)
  const currentBlock = extractCurrentProductBlock(context.html)
  if (!currentBlock) return fallback

  const salePriceYen = yenAfter('discounted price', currentBlock)
  const regularPriceYen = yenAfter('通常価格', currentBlock)
  const nameMatch = currentBlock.match(/Impact\s+[^¥￥]+?(?=discounted price|通常価格|割引)/)
  const parsedName = nameMatch?.[0]?.replace(/^現在の商品（選択済み）\s*/u, '').trim()
  const hasPrice = salePriceYen !== null || regularPriceYen !== null
  const detectedSizeGrams = detectSizeGramsFromText(parsedName ?? currentBlock)

  return {
    ...fallback,
    name: parsedName || fallback.name,
    price: hasPrice ? {
      displayedPriceYen: null,
      regularPriceYen,
      salePriceYen,
      priceEvidence: 'myprotein current selected product block',
    } : fallback.price,
    inStock: !/Out of stock|在庫切れ|売り切れ/i.test(currentBlock),
    detectedSizeGrams,
    detectedFlavor: detectFlavorFromName(parsedName),
    detectedSku: fallback.detectedSku,
  }
}

export const myproteinParser: StoreParser = {
  name: 'myprotein',
  parse(context) {
    // expectedSku指定時はJSON-LDのhasVariantからSKU直引き。
    // ページのデフォルト表示バリエーションに依存しないため、容量・味の誤認が起きない。
    const expectedSku = normalizeSku(context.source.expectedSku)
    if (expectedSku) {
      const variants = collectVariants(context.html)
      for (const variant of variants) {
        if (normalizeSku(typeof variant.sku === 'string' ? variant.sku : null) === expectedSku) {
          const parsed = parseVariant(variant, context.source.productUrl)
          if (parsed) return parsed
        }
      }
    }

    // SKU未指定・SKU不一致時は従来の「現在の商品」ブロック解析にフォールバック。
    return parseCurrentBlock(context)
  },
}
