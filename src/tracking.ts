import { config } from './config'

export type TrackEventName =
  | 'product_click'
  | 'affiliate_click'
  | 'tab_click'
  | 'price_mode_change'
  | 'coupon_click'
  | 'price_history_open'
  | 'email_signup_click'
  | 'email_signup_complete'

export type TrackPayload = Record<string, string | number | boolean | null>

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

let analyticsEnabled = false

// main.tsxから一度だけ呼ぶ。測定ID未設定なら何もしない（consoleログのみ）。
export function initAnalytics() {
  if (!config.gaMeasurementId || analyticsEnabled) return

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${config.gaMeasurementId}`
  document.head.appendChild(script)

  window.dataLayer = window.dataLayer ?? []
  window.gtag = function gtag() {
    // GA4のスニペットはargumentsオブジェクトをそのままpushする仕様。
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', config.gaMeasurementId)
  analyticsEnabled = true
}

export function trackEvent(event: TrackEventName, payload: TrackPayload = {}) {
  if (analyticsEnabled && window.gtag) {
    window.gtag('event', event, payload)
    return
  }
  console.log('[FitPrice trackEvent]', event, { ...payload, timestamp: new Date().toISOString() })
}
