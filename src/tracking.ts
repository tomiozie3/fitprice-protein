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

export function trackEvent(event: TrackEventName, payload: TrackPayload = {}) {
  console.log('[FitPrice trackEvent]', event, { ...payload, timestamp: new Date().toISOString() })
  // Next phase: replace with GA4 gtag('event', event, payload) or fetch('/api/track').
}
