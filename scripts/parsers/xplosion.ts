import { decodeHtml, detectSizeGramsFromText, genericParser, yenFromUnknown, type StoreParser } from './generic'

function stripTags(html: string) {
  return decodeHtml(html.replace(/<[^>]*>/g, '\n')).replace(/\s+/g, ' ').trim()
}

// makeshopのページは同じ価格を税込(tax-included)と税抜(tax-excluded)の2ブロックで出す。
// 税抜をセール価格と誤認しないよう、必ず税込ブロックだけを読む。
// ブロック内: item-price=販売価格、original-price=定価。両者が異なるときだけセール。
function extractTaxIncludedPrices(html: string) {
  const start = html.indexOf('normal-price tax-included')
  if (start < 0) return null
  const end = html.indexOf('tax-excluded', start)
  const segment = html.slice(start, end > start ? end : start + 1500)

  const selling = yenFromUnknown(segment.match(/makeshop-item-price:1[^>]*>\s*([0-9][0-9,]*)/)?.[1] ?? null)
  const original = yenFromUnknown(segment.match(/original-price[^>]*>\s*<span[^>]*>[¥￥]<\/span>\s*([0-9][0-9,]*)/)?.[1] ?? null)
  if (selling === null && original === null) return null
  return { selling, original }
}

function extractItemImage(html: string, productUrl: string) {
  const itemId = productUrl.match(/item\/(\w+)/)?.[1] ?? null
  const urls = [...html.matchAll(/https:\/\/makeshop-multi-images\.akamaized\.net\/[^"'\s]+\/itemimages\/[^"'\s]+\.(?:jpg|jpeg|png|webp)[^"'\s]*/gi)]
    .map((match) => match[0])
  return (itemId ? urls.find((url) => url.includes(itemId)) : undefined) ?? urls[0] ?? null
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
    const prices = extractTaxIncludedPrices(context.html)
    const imageUrl = extractItemImage(context.html, context.source.productUrl)
    const detectedSku = detectSku(context.html)
    const detectedSizeGrams = detectSizeGramsFromText(fallback.name ?? '')

    let price = fallback.price
    if (prices && prices.selling !== null) {
      const hasSale = prices.original !== null && prices.selling < prices.original
      price = {
        displayedPriceYen: null,
        regularPriceYen: hasSale ? prices.original : prices.selling,
        salePriceYen: hasSale ? prices.selling : null,
        priceEvidence: 'xplosion tax-included price block',
      }
    }

    // 「売り切れ」文言は非表示テンプレートに常時含まれるため文字列検索では判定できない。
    // 購入ボタンのclass（instock on=在庫あり / instock off=売り切れ）で判定する。
    const stockButton = context.html.match(/instock (on|off)"[^>]*>\s*(?:通常購入する|カートに入れる)/)

    return {
      ...fallback,
      imageUrl: imageUrl ?? fallback.imageUrl,
      price,
      inStock: stockButton ? stockButton[1] === 'on' : fallback.inStock,
      detectedSizeGrams,
      detectedFlavor: detectFlavor(fallback.name),
      detectedSku,
    }
  },
}
