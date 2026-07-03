import { useEffect, useState } from 'react'
import { sampleOffers } from './products'
import type { ProductOffer } from './types'

export type ProductsState = {
  offers: ProductOffer[]
  isSample: boolean
  loading: boolean
}

function isValidOffers(value: unknown): value is ProductOffer[] {
  return Array.isArray(value) && value.every((item) => (
    item
    && typeof item === 'object'
    && typeof (item as ProductOffer).offerId === 'string'
    && typeof (item as ProductOffer).maker === 'string'
  ))
}

export function useProducts(): ProductsState {
  const [state, setState] = useState<ProductsState>({ offers: [], isSample: false, loading: true })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}products.json`, { cache: 'no-cache' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data: unknown = await response.json()
        if (!isValidOffers(data) || data.length === 0) throw new Error('empty or invalid products.json')
        if (!cancelled) setState({ offers: data, isSample: false, loading: false })
      } catch {
        // 実データが未生成の環境（初回セットアップ等）ではサンプルデータで表示確認できるようにする。
        if (!cancelled) setState({ offers: sampleOffers, isSample: true, loading: false })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
