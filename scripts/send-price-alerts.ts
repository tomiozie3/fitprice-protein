import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ProductOffer } from '../src/types'

// 価格アラートメール送信。
// 配信ポリシー: 実売価格が前回から変動（値上げ・値下げとも）した日だけ、変動商品をまとめて1通。
// BREVO_API_KEY / BREVO_SENDER_EMAIL 未設定時は送信せず、メール内容のプレビューだけ出力する。
const ROOT = process.cwd()
const INPUT_PATH = process.env.PRODUCT_OFFERS_PATH ?? path.join(ROOT, 'data', 'product-offers.json')
const API_KEY = process.env.BREVO_API_KEY
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL
const SENDER_NAME = process.env.BREVO_SENDER_NAME ?? 'FitPrice Protein'
const SITE_URL = process.env.SITE_URL ?? 'https://tomiozie3.github.io/fitprice-protein/'
const LIST_ID = process.env.BREVO_LIST_ID ? Number(process.env.BREVO_LIST_ID) : null
// スクレイピング誤差やごく小さな改定で毎日鳴らないよう、既定は50円以上の変動のみ通知
const MIN_DIFF_YEN = Number(process.env.ALERT_MIN_DIFF_YEN ?? 50)
const API_BASE = 'https://api.brevo.com/v3'

const yen = (value: number) => value.toLocaleString('ja-JP')

function changedOffers(offers: ProductOffer[]) {
  return offers.filter((offer) => offer.fetchStatus === 'success'
    && offer.effectivePriceYen !== null
    && offer.priceDiffYen !== null
    && Math.abs(offer.priceDiffYen) >= MIN_DIFF_YEN)
}

function buildSubject(changed: ProductOffer[]) {
  const drops = changed.filter((offer) => (offer.priceDiffYen ?? 0) < 0)
  const lead = (drops[0] ?? changed[0])!
  const kind = drops.length > 0 ? '値下げ' : '価格変動'
  const rest = changed.length > 1 ? ` ほか${changed.length - 1}件` : ''
  return `【${kind}】${lead.maker} ${lead.name} ¥${yen(lead.previousEffectivePriceYen!)}→¥${yen(lead.effectivePriceYen!)}${rest}`
}

function buildHtml(changed: ProductOffer[]) {
  const rows = changed.map((offer) => {
    const diff = offer.priceDiffYen!
    const down = diff < 0
    const color = down ? '#1d7a46' : '#b13a2e'
    const arrow = down ? '▼' : '▲'
    return `<tr>
      <td style="padding:10px 8px;border-bottom:1px solid #e5eae5;font-size:14px;">
        <b>${offer.maker}</b> ${offer.name}<br>
        <span style="color:#6f7c75;font-size:12px;">¥${yen(offer.previousEffectivePriceYen!)} → <b style="color:${color};">¥${yen(offer.effectivePriceYen!)}</b>
        （${arrow}¥${yen(Math.abs(diff))}）</span><br>
        <a href="${offer.productUrl}" style="font-size:12px;color:#0b6846;">公式ストアで見る</a>
      </td>
    </tr>`
  }).join('')

  return `<!doctype html><html><body style="font-family:sans-serif;background:#f5f7f2;margin:0;padding:24px;">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:24px;">
    <h1 style="font-size:18px;margin:0 0 4px;">プロテイン価格が動きました</h1>
    <p style="font-size:13px;color:#6f7c75;margin:0 0 16px;">昨日から実売価格が変わった商品をお知らせします。</p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <p style="margin:20px 0 0;"><a href="${SITE_URL}" style="display:inline-block;background:#0b6846;color:#fff;padding:12px 20px;border-radius:8px;font-size:14px;text-decoration:none;">最新ランキングを見る</a></p>
    <p style="font-size:11px;color:#8a958e;margin:24px 0 0;line-height:1.8;">
      配信: ${SENDER_NAME}（${SENDER_EMAIL ?? ''}）<br>
      本メールは FitPrice Protein の価格アラートに登録された方にお送りしています。<br>
      <a href="{{ unsubscribe }}" style="color:#8a958e;">配信を停止する</a>
    </p>
  </div></body></html>`
}

async function brevo(pathname: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers: {
      'api-key': API_KEY!,
      accept: 'application/json',
      'content-type': 'application/json',
      ...init?.headers,
    },
  })
  if (!response.ok) throw new Error(`Brevo API ${pathname} -> HTTP ${response.status}: ${await response.text()}`)
  return response.status === 204 ? null : response.json()
}

async function resolveListId(): Promise<number> {
  if (LIST_ID !== null) return LIST_ID
  const data = await brevo('/contacts/lists?limit=10') as { lists?: { id: number; name: string; totalSubscribers?: number }[] }
  const first = data.lists?.[0]
  if (!first) throw new Error('Brevoにリストがありません。管理画面でリストを作成してください。')
  console.log(`リスト自動選択: ${first.name} (id=${first.id})`)
  return first.id
}

async function main() {
  const offers = JSON.parse(await readFile(INPUT_PATH, 'utf8')) as ProductOffer[]
  const changed = changedOffers(offers)

  if (changed.length === 0) {
    console.log(`価格変動なし（しきい値: ±¥${MIN_DIFF_YEN}以上）。今日はメールを送りません。`)
    return
  }

  const subject = buildSubject(changed)
  const html = buildHtml(changed)

  if (!API_KEY || !SENDER_EMAIL) {
    console.log('BREVO_API_KEY / BREVO_SENDER_EMAIL 未設定のためプレビューのみ:')
    console.log('  件名:', subject)
    changed.forEach((offer) => console.log(`  - ${offer.maker} ${offer.name}: ¥${yen(offer.previousEffectivePriceYen!)} → ¥${yen(offer.effectivePriceYen!)}`))
    return
  }

  const listId = await resolveListId()
  const date = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const campaign = await brevo('/emailCampaigns', {
    method: 'POST',
    body: JSON.stringify({
      name: `price-alert-${date}`,
      subject,
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      type: 'classic',
      htmlContent: html,
      recipients: { listIds: [listId] },
    }),
  }) as { id: number }

  await brevo(`/emailCampaigns/${campaign.id}/sendNow`, { method: 'POST' })
  console.log(`価格アラート送信完了: campaign=${campaign.id}, 変動${changed.length}件, 件名「${subject}」`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
