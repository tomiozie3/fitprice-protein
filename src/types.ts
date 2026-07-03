export type ProteinType = 'WPC' | 'WPI' | 'SOY' | 'OTHER'
export type Category = ProteinType

export type StoreType = 'official' | 'rakuten' | 'amazon' | 'other'
export type SourceType = 'manual' | 'api' | 'scraping'
export type FetchStatus = 'success' | 'failed' | 'partial' | 'skipped'
export type CouponSource = 'manual' | 'official_banner' | 'newsletter' | 'affiliate' | 'none'

export type ProductOffer = {
  productId: string
  offerId: string
  maker: string
  name: string
  proteinType: ProteinType
  sizeGrams: number
  expectedSizeGrams?: number
  expectedFlavor?: string | null
  expectedSku?: string | null
  detectedSizeGrams: number | null
  detectedFlavor: string | null
  detectedSku: string | null
  imageUrl: string
  storeName: string
  storeType: StoreType
  productUrl: string
  affiliateUrl?: string | null
  regularPriceYen: number | null
  salePriceYen: number | null
  couponDiscountYen: number
  shippingYen: number
  // この金額（税込）以上の注文で送料無料。価格計算には使わず、サイト上の送料表の表示に使う
  freeShippingMinYen: number | null
  effectivePriceYen: number | null
  pricePerKgYen: number | null
  pricePer3KgYen: number | null
  regularEffectivePriceYen: number | null
  regularPricePer3KgYen: number | null
  previousEffectivePriceYen: number | null
  priceDiffYen: number | null
  hasSale: boolean
  hasCoupon: boolean
  couponLabel: string | null
  saleLabel: string | null
  discountRate: number | null
  inStock: boolean
  lastCheckedAt: string
  fetchStatus: FetchStatus
  errorMessage?: string
  lastSuccessfulPriceYen: number | null
  lastSuccessfulCheckedAt: string | null
  couponSource: CouponSource
  priceEvidence: string | null
  sourceType: SourceType
}

export type ProductSource = {
  maker: string
  // サイト表示用の短い商品名。未指定ならスクレイピングした名前をそのまま使う。
  // ストアのtitleはSEO用の長文が多く読みづらいため、掲載時は指定を推奨。
  displayName?: string
  productUrl: string
  proteinType: ProteinType
  sizeGrams: number
  expectedSizeGrams?: number
  expectedFlavor?: string | null
  expectedSku?: string | null
  storeName: string
  storeType: StoreType
  priority: number
  shippingYen?: number
  freeShippingMinYen?: number | null
  couponDiscountYen?: number
  couponLabel?: string | null
  couponSource?: CouponSource
  affiliateUrl?: string | null
}

export type PriceHistoryEntry = {
  date: string
  offerId: string
  maker: string
  effectivePriceYen: number | null
  regularPriceYen: number | null
  salePriceYen: number | null
  hasSale: boolean
  hasCoupon: boolean
}
