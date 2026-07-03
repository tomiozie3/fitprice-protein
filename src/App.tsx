import { FormEvent, useMemo, useState } from 'react'
import { useProducts } from './useProducts'
import { HistoryChart, usePriceHistory } from './HistoryChart'
import { subscribeToNewsletter } from './newsletter'
import { trackEvent } from './tracking'
import type { Category, ProductOffer, ProteinType } from './types'

type Tab = 'ALL' | Category
type PriceMode = 'effective' | 'regular'

const tabs: { key: Tab; label: string }[] = [
  { key: 'ALL', label: 'すべて' },
  { key: 'WPC', label: 'WPC' },
  { key: 'WPI', label: 'WPI' },
  { key: 'SOY', label: 'ソイ' },
]

const yen = new Intl.NumberFormat('ja-JP')
const categoryLabel = (category: ProteinType) => category === 'SOY' ? 'ソイ' : category
const imageFor = (offer: ProductOffer) => offer.imageUrl || `./images/${offer.proteinType.toLowerCase()}.svg`
const buyUrl = (offer: ProductOffer) => offer.affiliateUrl || offer.productUrl

// 価格は取得スクリプト側で送料ルール込みで計算済み。UIでは再計算しない。
const comparisonPrice = (offer: ProductOffer, mode: PriceMode) => (
  mode === 'effective' ? offer.effectivePriceYen : offer.regularEffectivePriceYen
)

const price3kg = (offer: ProductOffer, mode: PriceMode) => (
  mode === 'effective' ? offer.pricePer3KgYen : offer.regularPricePer3KgYen
)

const sortablePrice3kg = (offer: ProductOffer, mode: PriceMode) => price3kg(offer, mode) ?? Number.POSITIVE_INFINITY

// カード左端のアクセント色をバッジと揃えるため、セール（赤）とクーポン（オレンジ）を区別する。
const promoKind = (offer: ProductOffer, mode: PriceMode): 'sale' | 'coupon' | null => {
  if (mode !== 'effective') return null
  if (offer.hasSale) return 'sale'
  if (offer.hasCoupon) return 'coupon'
  return null
}

const sizeLabel = (grams: number) => grams >= 1000 ? `${parseFloat((grams / 1000).toFixed(1))}kg` : `${grams}g`

// 「3kg換算」が何袋ぶんの話なのかを一言で示す。
// 1袋3kg以上ならまとめ買い不要、割り切れるなら「×n袋」、それ以外は換算である旨だけ添える。
const benchmarkNote = (grams: number) => {
  if (grams >= 3000) return '1袋で3kg'
  if (grams > 0 && 3000 % grams === 0) return `${sizeLabel(grams)}袋×${3000 / grams}`
  return `${sizeLabel(grams)}袋を換算`
}

function CategoryChip({ category }: { category: ProteinType }) {
  return <span className={`chip chip-${category.toLowerCase()}`}>
    <span className="chip-icon" aria-hidden="true">
      {(category === 'WPC' || category === 'WPI') && (
        <svg viewBox="0 0 24 24"><path d="M8 2h8v3l2 2v15H6V7l2-2V2Zm2 2v2L8 8v12h8V8l-2-2V4h-4Zm0 6h4v7h-4v-7Z" /></svg>
      )}
      {category === 'SOY' && (
        <svg viewBox="0 0 24 24"><path d="M19.8 4.2C12 4 6.4 7 5.2 12.4c-.6 2.6.6 5 2.8 6.3 2.8-5.1 6.5-7.9 10.6-9.5-3.4 2.5-6.3 5.8-8.5 9.9 4.9.5 9.4-3.5 9.7-14.9Z" /></svg>
      )}
    </span>
    {categoryLabel(category)}
  </span>
}

function OfferBadges({ offer, priceMode }: { offer: ProductOffer; priceMode: PriceMode }) {
  if (priceMode !== 'effective') return null
  const showDiff = offer.priceDiffYen !== null && offer.priceDiffYen !== 0
  if (!offer.hasSale && !offer.hasCoupon && !showDiff) return null

  return <div className="offer-badges">
    {offer.hasSale && <span className="badge badge-sale">SALE</span>}
    {offer.hasCoupon && <span className="badge badge-coupon">{offer.couponLabel ?? 'クーポン'}</span>}
    {offer.discountRate !== null && offer.discountRate > 0 && <span className="badge badge-rate">{offer.discountRate}%OFF</span>}
    {showDiff && (
      <span className={`badge ${offer.priceDiffYen! < 0 ? 'badge-down' : 'badge-up'}`} title="前回確認時との実売価格差">
        前回より{offer.priceDiffYen! < 0 ? '▼' : '▲'}¥{yen.format(Math.abs(offer.priceDiffYen!))}
      </span>
    )}
  </div>
}

function OfferPrice({ offer, priceMode }: { offer: ProductOffer; priceMode: PriceMode }) {
  const price = comparisonPrice(offer, priceMode)
  const benchmark = price3kg(offer, priceMode)
  const showStrike = priceMode === 'effective' && offer.regularEffectivePriceYen !== null && price !== null && price < offer.regularEffectivePriceYen

  return <div className="offer-price">
    <div className="price-benchmark">
      <span>3kg換算<em>（{benchmarkNote(offer.sizeGrams)}）</em></span>
      <strong>{benchmark === null ? '—' : <>¥{yen.format(Math.round(benchmark))}</>}</strong>
    </div>
    <div className="price-actual">
      <span>{priceMode === 'effective' ? '実売価格' : '通常価格'}</span>
      {showStrike && <s>¥{yen.format(offer.regularEffectivePriceYen!)}</s>}
      <b>{price === null ? '—' : `¥${yen.format(price)}`}</b>
    </div>
  </div>
}

function ShippingTable({ offers }: { offers: ProductOffer[] }) {
  const rules = [...new Map(offers.map((offer) => [offer.storeName, offer])).values()]
  if (rules.length === 0) return null

  return <div className="shipping-info">
    <h3>送料のめやす</h3>
    <p>ランキングの価格に送料は含みません。各公式ストアの送料は以下のとおりです。</p>
    <table>
      <thead><tr><th>ストア</th><th>送料</th><th>送料無料になる条件</th></tr></thead>
      <tbody>
        {rules.map((offer) => <tr key={offer.storeName}>
          <td>{offer.storeName}</td>
          <td>{offer.shippingYen > 0 ? `¥${yen.format(offer.shippingYen)}` : '無料'}</td>
          <td>{offer.freeShippingMinYen !== null ? `¥${yen.format(offer.freeShippingMinYen)}以上の注文` : '—'}</td>
        </tr>)}
      </tbody>
    </table>
    <small>送料は変更される場合があります。最新の条件は各公式ストアでご確認ください。</small>
  </div>
}

export default function App() {
  const { offers, isSample, loading } = useProducts()
  const history = usePriceHistory()
  const [tab, setTab] = useState<Tab>('ALL')
  const [priceMode, setPriceMode] = useState<PriceMode>('effective')
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [makerChoice, setMakerChoice] = useState('')
  const [makerText, setMakerText] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [formOk, setFormOk] = useState(false)

  const makers = useMemo(() => [...new Set(offers.map((offer) => offer.maker))], [offers])
  const favoriteMaker = makerChoice === '__other__' ? makerText : makerChoice

  const ranked = useMemo(() => offers
    .filter((offer) => tab === 'ALL' || offer.proteinType === tab)
    .filter((offer) => comparisonPrice(offer, priceMode) !== null)
    .sort((a, b) => sortablePrice3kg(a, priceMode) - sortablePrice3kg(b, priceMode)), [offers, tab, priceMode])

  const latestCheckedAt = useMemo(() => offers.reduce((latest, offer) => offer.lastCheckedAt > latest ? offer.lastCheckedAt : latest, ''), [offers])

  const changeTab = (next: Tab) => {
    setTab(next)
    trackEvent('tab_click', { tab: next, price_mode: priceMode })
  }

  const changePriceMode = (next: PriceMode) => {
    setPriceMode(next)
    trackEvent('price_mode_change', { price_mode: next, tab })
  }

  const clickBuy = (offer: ProductOffer, rank: number) => {
    trackEvent(offer.affiliateUrl ? 'affiliate_click' : 'product_click', {
      offer_id: offer.offerId,
      maker: offer.maker,
      category: offer.proteinType,
      rank,
      tab,
      price_mode: priceMode,
      comparison_price: comparisonPrice(offer, priceMode) ?? 0,
      coupon_active: offer.hasCoupon,
      sale_active: offer.hasSale,
      link_type: offer.affiliateUrl ? 'affiliate' : 'official',
    })
  }

  const clickAlertCta = (placement: string) => {
    trackEvent('email_signup_click', { placement })
  }

  const toggleHistory = (offer: ProductOffer) => {
    const next = openHistoryId === offer.offerId ? null : offer.offerId
    setOpenHistoryId(next)
    if (next) {
      trackEvent('price_history_open', { offer_id: offer.offerId, maker: offer.maker })
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    trackEvent('email_signup_click', { placement: 'form_submit' })
    const result = await subscribeToNewsletter({ email, favoriteMaker })
    setFormOk(result.ok)
    setFormMessage(result.ok ? '登録を受け付けました。価格が動いたときにお知らせします。' : result.message)
    if (result.ok) {
      trackEvent('email_signup_complete', { favorite_maker: favoriteMaker.trim() || null })
    }
  }

  return <>
    <header className="site-header">
      <a className="brand" href="#top" aria-label="FitPrice Protein ホーム"><span>FIT</span>PRICE <em>PROTEIN</em></a>
      <div className="header-actions">
        <a className="pr-label" href="#about" title="広告掲載について">PR</a>
        <a className="header-cta" href="#newsletter" onClick={() => clickAlertCta('header')}>価格アラートに登録</a>
      </div>
    </header>

    <main id="top">
      <section className="hero">
        <div className="hero-inner">
          <h1>プロテイン<em>最安</em>ランキング</h1>
          <p className="hero-lead">3kg換算・クーポン込みで「今いちばん安い」がわかる</p>
          <p className="hero-note">
            <span className="live-dot" />
            {latestCheckedAt ? `${latestCheckedAt.replaceAll('-', '/')} 更新` : '更新日 —'}・{offers.length}商品
          </p>
        </div>
      </section>

      <section className="ranking-section" aria-labelledby="ranking-title">
        <h2 id="ranking-title" className="sr-only">価格ランキング</h2>
        <p className="promo-note">※本ページはプロモーション（アフィリエイト広告）を含みます</p>

        <div className="controls">
          <div className="mode-switch" role="group" aria-label="価格の見方">
            <button className={priceMode === 'effective' ? 'active' : ''} aria-pressed={priceMode === 'effective'} onClick={() => changePriceMode('effective')}>
              実売価格
            </button>
            <button className={priceMode === 'regular' ? 'active' : ''} aria-pressed={priceMode === 'regular'} onClick={() => changePriceMode('regular')}>
              通常価格
            </button>
          </div>
          <div className="type-tabs" role="tablist" aria-label="プロテインの種類">
            {tabs.map((item) => <button key={item.key} role="tab" aria-selected={tab === item.key}
              className={`${tab === item.key ? 'active' : ''} tab-${item.key.toLowerCase()}`} onClick={() => changeTab(item.key)}>
              <i aria-hidden="true" />{item.label}
            </button>)}
          </div>
        </div>

        <p className="mode-hint">
          {loading ? '価格データを読み込んでいます…'
            : priceMode === 'effective'
              ? 'セール・クーポンを反映した商品価格の安い順です（送料は含みません）。'
              : 'セールやクーポンを除いた定価の安い順です（送料は含みません）。'}
        </p>

        <ol className="offer-list">
          {ranked.map((offer, index) => <li key={offer.offerId}>
            <article className={`offer-card ${promoKind(offer, priceMode) ? `promoted promoted-${promoKind(offer, priceMode)}` : ''}`}>
              <div className={`offer-rank rank-${index + 1}`}>{index + 1}</div>
              <div className="offer-image">
                <img src={imageFor(offer)} alt={`${offer.name}の商品イメージ`} loading={index > 3 ? 'lazy' : 'eager'} />
                <span className={`size-tag ${offer.sizeGrams >= 3000 ? 'size-big' : ''}`}>{sizeLabel(offer.sizeGrams)}</span>
              </div>
              <div className="offer-main">
                <div className="offer-meta">
                  <CategoryChip category={offer.proteinType} />
                  <span className="offer-maker">{offer.maker}</span>
                  <button className="history-toggle" aria-expanded={openHistoryId === offer.offerId} onClick={() => toggleHistory(offer)}>
                    価格推移 {openHistoryId === offer.offerId ? '▴' : '▾'}
                  </button>
                </div>
                <h3 className="offer-name">{offer.name}</h3>
                <OfferBadges offer={offer} priceMode={priceMode} />
              </div>
              <OfferPrice offer={offer} priceMode={priceMode} />
              <div className="offer-buy">
                <a className="buy-button" href={buyUrl(offer)} target="_blank" rel="sponsored noopener" onClick={() => clickBuy(offer, index + 1)}>
                  公式ストアで見る
                </a>
                <small>{offer.lastCheckedAt.replaceAll('-', '/')} 時点</small>
              </div>
              {openHistoryId === offer.offerId && (
                <div className="history-panel">
                  <HistoryChart entries={history} offerId={offer.offerId} />
                </div>
              )}
            </article>
          </li>)}
        </ol>

        <div className="alert-banner">
          <p><b>今日の最安は、明日には変わります。</b><span>価格が動いた日だけ、メールでお知らせします。</span></p>
          <a href="#newsletter" onClick={() => clickAlertCta('ranking_banner')}>価格アラートに登録</a>
        </div>

        {isSample
          ? <p className="fine-print">※ 現在表示中の価格・商品画像はUI検証用のサンプルです。購入前に公式ストアで最新価格をご確認ください。</p>
          : <p className="fine-print">※ 掲載価格は各公式ストアの表示を毎日自動確認した時点の参考情報です。最新の価格・在庫は公式ストアでご確認ください。</p>}
      </section>

      <section className="newsletter" id="newsletter">
        <h2>価格が動いたら、すぐわかる。</h2>
        <p>ランキング上位3社と、あなたがよく買うメーカーの価格変動・クーポンをお知らせします。<br />値下げも、値上げの気配も。価格が動いた日だけ、1日1通まで。</p>
        <form onSubmit={submit} noValidate>
          <div className="input-row">
            <label className="sr-only" htmlFor="email">メールアドレス</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="メールアドレス" aria-describedby="form-message" />
            <button>無料で登録</button>
          </div>
          <div className="form-options">
            <label htmlFor="favorite-maker">よく買うメーカー（任意）</label>
            <select id="favorite-maker" value={makerChoice} onChange={(event) => setMakerChoice(event.target.value)}>
              <option value="">選択してください</option>
              {makers.map((maker) => <option key={maker} value={maker}>{maker}</option>)}
              <option value="__other__">その他（入力する）</option>
            </select>
            {makerChoice === '__other__' && (
              <input type="text" value={makerText} onChange={(event) => setMakerText(event.target.value)} placeholder="メーカー名を入力" aria-label="よく買うメーカー名" />
            )}
          </div>
          {formMessage && <p id="form-message" className={formOk ? 'form-ok' : 'form-error'}>{formMessage}</p>}
          <small>価格変動・クーポン情報と、関連する筋トレ/サプリ情報をお送りします。届いたメールの下部にある解除リンクから、いつでも1クリックで解除できます。</small>
        </form>
      </section>

      <section className="how">
        <h2>価格の見方</h2>
        <div>
          <p><b>3kg換算</b>1kg・2.5kg・3kgなど容量が違う商品を、同じものさしで比べるための金額です。ランキングはこの安い順です。</p>
          <p><b>実売価格</b>セール・クーポンを反映した商品価格です。送料は含みません。</p>
          <p><b>通常価格</b>セールやクーポンを除いた、定価ベースの金額です。</p>
        </div>
        <ShippingTable offers={offers} />
      </section>

      <section className="legal" id="about" aria-label="このサイトについて">
        <h2>このサイトについて</h2>
        <p className="about-lead">FitPrice Proteinは、プロテイン公式ストアの価格を毎日自動で確認し、3kg換算で比較できる個人運営の価格比較サイトです。掲載順位は3kg換算価格の安い順で、広告の有無は順位に影響しません。</p>
        <details>
          <summary>広告掲載・アフィリエイトについて</summary>
          <p>本サイトは、アフィリエイトプログラム（ASP経由の成果報酬型広告）を利用しています。掲載する購入リンクの一部は広告リンクであり、リンク経由の購入により当サイトが報酬を受け取る場合があります。掲載順位は3kg換算価格の安い順であり、報酬の有無は順位に影響しません。</p>
        </details>
        <details>
          <summary>免責事項</summary>
          <p>掲載価格・在庫・クーポン情報は取得時点の参考情報であり、正確性・最新性を保証しません。実際の価格・在庫・キャンペーン内容は各公式ストアでご確認ください。本サイトの情報に基づく購入・行動により生じた損害について、当サイトは一切の責任を負いません。</p>
        </details>
        <details>
          <summary>プライバシーポリシー</summary>
          <p>本サイトでは、サービス改善のためアクセス解析ツールを利用する場合があります。アクセス解析はCookie等を利用して匿名のトラフィックデータを収集しますが、個人を特定するものではありません。メール登録フォームで取得したメールアドレスは、価格変動・クーポン情報の配信目的にのみ利用し、第三者に提供しません。配信するすべてのメールには解除リンクを記載し、解除後は再登録されない限り配信を行いません。</p>
        </details>
      </section>
    </main>

    <footer>
      <a className="brand" href="#top"><span>FIT</span>PRICE <em>PROTEIN</em></a>
      <p>プロテイン特化。公式ストア中心。クーポン込みで比べる価格比較サイト。</p>
      <nav aria-label="フッターリンク"><a href="#about">このサイトについて</a></nav>
      <small>© 2026 FitPrice Protein</small>
    </footer>
  </>
}
