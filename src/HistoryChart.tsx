import { useEffect, useState } from 'react'
import type { PriceHistoryEntry } from './types'

let historyCache: PriceHistoryEntry[] | null = null

// 履歴は全カード共通の1ファイルなので、初回だけ取得してモジュール内にキャッシュする。
export function usePriceHistory(): PriceHistoryEntry[] | null {
  const [entries, setEntries] = useState<PriceHistoryEntry[] | null>(historyCache)

  useEffect(() => {
    if (historyCache) return
    let cancelled = false

    fetch(`${import.meta.env.BASE_URL}price-history.json`, { cache: 'no-cache' })
      .then((response) => response.ok ? response.json() : [])
      .then((data: unknown) => {
        historyCache = Array.isArray(data) ? data as PriceHistoryEntry[] : []
        if (!cancelled) setEntries(historyCache)
      })
      .catch(() => {
        historyCache = []
        if (!cancelled) setEntries([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  return entries
}

type ChartPoint = { date: string; price: number }

function toPoints(entries: PriceHistoryEntry[], offerId: string): ChartPoint[] {
  const byDate = new Map<string, number>()
  for (const entry of entries) {
    if (entry.offerId === offerId && entry.effectivePriceYen !== null) {
      byDate.set(entry.date, entry.effectivePriceYen)
    }
  }
  return [...byDate.entries()]
    .map(([date, price]) => ({ date, price }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

const yen = new Intl.NumberFormat('ja-JP')
const shortDate = (date: string) => date.slice(5).replace('-', '/')

export function HistoryChart({ entries, offerId }: { entries: PriceHistoryEntry[] | null; offerId: string }) {
  if (entries === null) {
    return <p className="history-empty">価格履歴を読み込んでいます…</p>
  }

  const points = toPoints(entries, offerId)
  if (points.length === 0) {
    return <p className="history-empty">この商品の価格履歴はまだありません。毎日自動で記録され、ここに推移が表示されていきます。</p>
  }

  const prices = points.map((point) => point.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const last = points[points.length - 1]

  const W = 640
  const H = 150
  const PAD_X = 14
  const PAD_TOP = 26
  const PAD_BOTTOM = 24
  const span = max - min
  const yFor = (price: number) => span === 0
    ? PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) / 2
    : PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * (1 - (price - min) / span)
  const xFor = (index: number) => points.length === 1
    ? W / 2
    : PAD_X + (W - PAD_X * 2) * (index / (points.length - 1))

  const coords = points.map((point, index) => ({ x: xFor(index), y: yFor(point.price), ...point }))
  const labelled = new Set<number>([0, points.length - 1, prices.indexOf(min), prices.indexOf(max)])

  return <div className="history-chart">
    <p className="history-summary">
      直近 <b>¥{yen.format(last.price)}</b>
      <span>期間最安 ¥{yen.format(min)} ／ 期間最高 ¥{yen.format(max)}（{points.length}日分）</span>
    </p>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`価格推移グラフ: ${points.map((p) => `${shortDate(p.date)} ${yen.format(p.price)}円`).join('、')}`}>
      {span > 0 && <line className="grid-line" x1={PAD_X} x2={W - PAD_X} y1={yFor(min)} y2={yFor(min)} />}
      {coords.length > 1 && (
        <polyline className="price-line" points={coords.map((c) => `${c.x},${c.y}`).join(' ')} />
      )}
      {coords.map((c, index) => <g key={c.date}>
        <circle className={index === coords.length - 1 ? 'dot dot-last' : 'dot'} cx={c.x} cy={c.y} r={index === coords.length - 1 ? 5 : 3.5} />
        {labelled.has(index) && (
          <text className="dot-label" x={c.x} y={c.y - 10} textAnchor={index === 0 ? 'start' : index === coords.length - 1 ? 'end' : 'middle'}>
            ¥{yen.format(c.price)}
          </text>
        )}
      </g>)}
      <text className="axis-label" x={PAD_X} y={H - 6} textAnchor="start">{shortDate(points[0].date)}</text>
      {points.length > 1 && (
        <text className="axis-label" x={W - PAD_X} y={H - 6} textAnchor="end">{shortDate(last.date)}</text>
      )}
    </svg>
    {points.length < 5 && <p className="history-note">データは毎日1回自動で増えていきます。</p>}
  </div>
}
