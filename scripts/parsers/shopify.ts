import { detectSizeGramsFromText, emptyPrice, normalizeSku, type ParsedProduct, type StoreParser } from './generic'

// Shopifyストア用パーサー。fetchUrlに商品の .js エンドポイント
// （例: https://shop.example.jp/products/handle.js）を指定して使う。
// レスポンスは全バリアントの価格・SKU・在庫を含むJSONで、HTMLより堅牢。
type ShopifyVariant = {
  id: number
  title: string
  sku: string | null
  price: number
  compare_at_price: number | null
  available: boolean
  featured_image?: { src?: string } | null
}

type ShopifyProduct = {
  title: string
  variants: ShopifyVariant[]
  featured_image?: string | null
  images?: string[]
}

// Shopifyの金額は最小通貨単位の100倍表現（JPYでも 598000 = ¥5,980）。
const toYen = (minor: number | null | undefined) => minor == null ? null : Math.round(minor / 100)

const normalizeImage = (url: string | null | undefined) => {
  if (!url) return null
  return url.startsWith('//') ? `https:${url}` : url
}

export const shopifyParser: StoreParser = {
  name: 'shopify',
  parse({ html, source }): ParsedProduct {
    let data: ShopifyProduct
    try {
      data = JSON.parse(html) as ShopifyProduct
    } catch {
      return {
        name: null,
        imageUrl: null,
        price: emptyPrice(),
        inStock: false,
        detectedSizeGrams: null,
        detectedFlavor: null,
        detectedSku: null,
      }
    }

    const expected = normalizeSku(source.expectedSku)
    const variant = (expected
      ? data.variants.find((item) => normalizeSku(item.sku) === expected)
      : undefined) ?? data.variants[0]

    const price = toYen(variant?.price)
    const compareAt = toYen(variant?.compare_at_price)
    const hasSale = compareAt !== null && price !== null && price < compareAt

    return {
      name: variant ? `${data.title} ${variant.title}`.trim() : data.title ?? null,
      imageUrl: normalizeImage(variant?.featured_image?.src ?? data.featured_image ?? data.images?.[0]),
      price: {
        displayedPriceYen: hasSale ? null : price,
        regularPriceYen: hasSale ? compareAt : null,
        salePriceYen: hasSale ? price : null,
        priceEvidence: variant ? `shopify product js sku=${variant.sku ?? variant.id}` : null,
      },
      inStock: Boolean(variant?.available),
      detectedSizeGrams: detectSizeGramsFromText(`${variant?.title ?? ''} ${data.title ?? ''}`),
      detectedFlavor: variant?.title.split('/')[0]?.trim() || null,
      detectedSku: variant?.sku ?? (variant ? String(variant.id) : null),
    }
  },
}
