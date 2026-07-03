import { detectSizeGramsFromText, genericParser, type StoreParser } from './generic'

function detectSkuFromUrl(url: string) {
  try {
    return new URL(url).searchParams.get('sku')
  } catch {
    return null
  }
}

export const valxParser: StoreParser = {
  name: 'valx',
  parse(context) {
    const fallback = genericParser.parse(context)
    const detectedSku = detectSkuFromUrl(context.source.productUrl)
    const detectedSizeGrams = detectSizeGramsFromText(`${fallback.name ?? ''} ${context.source.productUrl}`)
    return {
      ...fallback,
      detectedSizeGrams: fallback.detectedSizeGrams ?? detectedSizeGrams,
      detectedFlavor: fallback.detectedFlavor,
      detectedSku,
    }
  },
}
