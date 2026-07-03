import { decodeHtml, detectSizeGramsFromText, genericParser, yenFromUnknown, type StoreParser } from './generic'

function stripTags(html: string) {
  return decodeHtml(html.replace(/<[^>]*>/g, '\n')).replace(/\s+/g, ' ').trim()
}

function extractNormalPurchaseBlock(html: string) {
  const normalIndex = html.indexOf('通常購入')
  if (normalIndex < 0) return null
  const endCandidates = [
    html.indexOf('カートに入れる', normalIndex + 1),
    html.indexOf('商品説明', normalIndex + 1),
  ].filter((index) => index > normalIndex)
  const endIndex = endCandidates.length > 0 ? Math.min(...endCandidates) : normalIndex + 2500
  return stripTags(html.slice(normalIndex, endIndex))
}

function detectSku(html: string) {
  const text = stripTags(html)
  return text.match(/商品コード\s+([a-zA-Z0-9_-]+)/)?.[1] ?? null
}

function detectFlavor(name: string | null) {
  return name?.match(/[【〖]([^】〗]+?味)[^】〗]*[】〗]/)?.[1] ?? null
}

export const xplosionParser: StoreParser = {
  name: 'xplosion',
  parse(context) {
    const fallback = genericParser.parse(context)
    const block = extractNormalPurchaseBlock(context.html)
    if (!block) return fallback

    const prices = [...block.matchAll(/[¥￥]\s*([0-9][0-9,]*)/g)]
      .map((match) => yenFromUnknown(match[1]))
      .filter((price): price is number => price !== null && price > 0)

    const uniquePrices = [...new Set(prices)]
    const regularPriceYen = uniquePrices.length > 0 ? Math.max(...uniquePrices) : null
    const salePriceYen = uniquePrices.length > 1 ? Math.min(...uniquePrices) : null
    const detectedSku = detectSku(context.html)
    const detectedSizeGrams = detectSizeGramsFromText(`${fallback.name ?? ''} ${block}`)

    return {
      ...fallback,
      price: regularPriceYen !== null || salePriceYen !== null ? {
        displayedPriceYen: null,
        regularPriceYen,
        salePriceYen,
        priceEvidence: 'xplosion normal purchase block',
      } : fallback.price,
      inStock: /カートに入れる|通常購入する/.test(context.html) && !/SOLD OUT|売り切れ/.test(block),
      detectedSizeGrams,
      detectedFlavor: detectFlavor(fallback.name),
      detectedSku,
    }
  },
}
