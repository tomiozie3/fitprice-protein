# FitPrice Protein

プロテイン特化の公式ストア価格比較サービスMVPです。

初期は完全自動の商品発見は行わず、`productSources.json` で管理する公式ストアの商品URLだけを対象にします。各URLから商品名・価格・画像URL・在庫状態を取得し、Googleスプレッドシートへ書き込み、サイト用の `public/products.json` も生成します。

掲載価格・商品画像は取得時点の参考データです。購入前に公式ストアで最新情報を確認してください。

## サイトのデータ読み込み

サイト本体は実行時に `products.json`（`public/` からホスティングルートに配置されるファイル）を `fetch` して表示します。読み込みに失敗した場合（初回セットアップ時など）だけ、`src/products.ts` のサンプルデータにフォールバックし、サンプルである旨の注記を表示します。

## 価格履歴の蓄積

`prices:fetch` 実行時、取得成功した商品の価格スナップショットを `data/price-history.json` に日次で追記します（同日再実行時は当日分を置き換え）。`prices:export` は直近180日分・公開対象商品分だけを `public/price-history.json` に出力します。

価格推移グラフのUIは未実装ですが、**履歴データは初日から蓄積されます**。グラフ実装時に過去データが揃っている状態を作るための設計です。

## メール配信ポリシー（実装時の仕様）

メール送信はまだ実装していませんが、フォームとUI文言は以下のポリシー前提で作っています。

- 送信タイミング: 対象商品の実売価格が前回から変動（値上げ・値下げとも）、またはクーポン発生時のみ
- 対象: ランキング上位3社 ＋ 登録者が選んだ「よく買うメーカー」
- 頻度: 変動があった日だけ、1日1通に集約（メール地獄にしない）

「よく買うメーカー」は掲載中ブランドのプルダウン＋「その他（直接入力）」方式です。選択肢は `products.json` のメーカー一覧から自動生成されます。

## アフィリエイトリンク

`productSources.json` の各商品に `affiliateUrl` を指定すると、購入ボタンのリンク先が公式URLからアフィリエイトリンクに切り替わります（表示上の `productUrl` はそのまま）。ASP審査通過後、ここにアフィリエイトリンクを貼るだけで収益化できます。

```json
{
  "affiliateUrl": "https://px.a8.net/svt/ejp?a8mat=XXXXX"
}
```

## 起動方法

```bash
npm install
npm run dev
```

pnpmを使う場合:

```bash
pnpm install
pnpm dev
```

## ビルド

```bash
npm run build
```

pnpmを使う場合:

```bash
pnpm build
```

`dist/` が静的ビルド成果物です。Cloudflare Pages / GitHub Pages に配置できます。

## 商品URLの管理

対象商品は [productSources.json](./productSources.json) で手動管理します。

```json
{
  "maker": "Myprotein",
  "productUrl": "https://example.com/myprotein-impact-whey",
  "proteinType": "WPC",
  "sizeGrams": 2500,
  "expectedSizeGrams": 2500,
  "expectedFlavor": null,
  "expectedSku": null,
  "storeName": "Myprotein 公式ストア",
  "storeType": "official",
  "priority": 1,
  "couponDiscountYen": 0,
  "couponLabel": null,
  "couponSource": "none"
}
```

### 送料の設定

**ランキング・表示価格に送料は含めません**（分かりやすさ優先のユーザー判断）。各ストアの送料ルールは `shippingYen`（送料額）と `freeShippingMinYen`（送料無料になる注文金額）で登録し、サイト上の「送料のめやす」表に自動表示されます。

| ストア | 送料 | 無料ライン |
|---|---|---|
| X-PLOSION | 550円 | 3,000円以上 |
| VALX | 770円（ゆうパック） | 8,000円以上 |
| Myprotein | 1,800円 | 6,500円以上 |

送料ルールは変わることがあるため、ブランド追加時と半年ごとに各ストアのガイドページで確認すること。

### Shopify系ストアの追加方法（GronG等）

Shopifyのストアは商品ページURLの末尾に `.js` を付けたエンドポイント（例: `https://shop.grong.jp/products/whey-protein-standard.js`）が全バリアントの価格・SKU・在庫を含むJSONを返す。`productSources.json` で `fetchUrl` にこのURLを、`productUrl` にユーザーが開く通常の商品ページ（`?variant=`でバリアント固定）を指定し、`expectedSku` でバリアントを特定する。パーサーは `scripts/parsers/shopify.ts`（メーカー名をparsers/index.tsに登録して使い回す）。

### 検収ルール（必須）

新ブランド・新商品を追加したら、公開前に**取得した価格・セール判定・画像を実際のストア画面と突き合わせる**こと。過去に税抜価格をセール価格と誤認した事例あり（X-PLOSION、修正済み）。

### 容量バリエーションの登録ルール

メーカーは大容量ほどkg単価を安く設定するため、**各社とも「購入可能な最大容量（kg単価が最安のもの）」を必ず登録**します。1kgなどの小容量も併載してよい（大容量との単価差がそのまま見えるため）。同じ商品ページでも容量ごとに別エントリとして `productSources.json` に追加し、`expectedSku` で対象を固定します。

初期対象は公式ストアのみです。

- Myprotein
- X-PLOSION
- VALX

Amazon / Rakuten / iHerb の自動取得はまだ行いません。

クーポンはHTMLから安定取得しにくいため、初期は `productSources.json` 側で手動指定します。

`couponSource` の候補:

- `manual`
- `official_banner`
- `newsletter`
- `affiliate`
- `none`

## 商品バリエーション誤認防止

実URLでは、同じ商品ページ内で容量・味・SKUが切り替わることがあります。特にMyproteinのように、ページを開いた時点の選択中バリエーションが意図した容量と違う場合があります。

そのため `productSources.json` に期待値を指定できます。

- `expectedSizeGrams`
- `expectedFlavor`
- `expectedSku`

パーサー側は以下を返します。

- `detectedSizeGrams`
- `detectedFlavor`
- `detectedSku`

照合ルール:

- `expectedSizeGrams` と `detectedSizeGrams` が不一致なら `fetchStatus: "partial"`
- `expectedSku` と `detectedSku` が不一致なら `fetchStatus: "partial"`
- `expectedFlavor` と `detectedFlavor` が不一致なら `fetchStatus: "partial"`
- 不一致理由は `errorMessage` に記録
- `partial` の商品は `public/products.json` から除外

管理用の `data/product-offers.json` には残るため、Sheetsで確認できます。

## ProductOffer型

型は [src/types.ts](./src/types.ts) に定義しています。

重要項目:

- `regularPriceYen`: 通常価格。取得できない場合は `null`
- `salePriceYen`: セール価格。判別できない場合は `null`
- `couponDiscountYen`: 手動指定のクーポン割引額
- `effectivePriceYen`: 実売価格。価格取得失敗時は `null`
- `pricePerKgYen`: 1kg換算
- `pricePer3KgYen`: 3kg換算
- `fetchStatus`: `success` / `failed` / `partial` / `skipped`
- `errorMessage`: 取得失敗理由
- `lastCheckedAt`: 取得日。成功/失敗に関わらず必ず入ります
- `lastSuccessfulPriceYen`: 最後に取得成功した実売価格
- `lastSuccessfulCheckedAt`: 最後に取得成功した日
- `couponSource`: クーポン情報の指定元
- `priceEvidence`: 価格抽出根拠

価格が取れない商品は `effectivePriceYen` / `pricePer3KgYen` が `null` になるため、ランキングから除外できます。

## ブランド別パーサー構造

価格抽出ロジックは `scripts/parsers/` 配下に分離しています。

```txt
scripts/parsers/
  index.ts
  generic.ts
  myprotein.ts
  xplosion.ts
  valx.ts
```

[scripts/fetch-prices.ts](./scripts/fetch-prices.ts) は以下に専念します。

- HTML取得
- ブランド別パーサー選択
- 前回データとのマージ
- `data/product-offers.json` 保存

抽出段階では、取得した価格をすぐ `regularPriceYen` と断定しません。パーサーは中間型 `ExtractedPrice` を返します。

```ts
type ExtractedPrice = {
  displayedPriceYen: number | null
  regularPriceYen: number | null
  salePriceYen: number | null
  priceEvidence: string | null
}
```

通常価格・セール価格が明確に区別できる場合だけ、それぞれ `regularPriceYen` / `salePriceYen` に入れます。不明な単一表示価格は `displayedPriceYen` に入れます。

`calculateOffer()` では以下の優先順位で実売価格を計算します。

1. `salePriceYen`
2. `regularPriceYen`
3. `displayedPriceYen`

その後、送料を足し、手動指定のクーポン割引を引きます。

## 価格取得

```bash
npm run prices:fetch
```

pnpm:

```bash
pnpm prices:fetch
```

処理内容:

1. `productSources.json` を読み込み
2. 公式ストアURLのみ取得
3. JSON-LD、OGP、HTML内の価格表記から商品情報を抽出
4. `data/product-offers.json` に `ProductOffer[]` として保存

取得失敗時:

- 処理全体は止めません
- その商品の `errorMessage` に理由を入れます
- `lastCheckedAt` は必ず入ります
- 価格系フィールドは `null` になります
- 前回成功価格があれば `lastSuccessfulPriceYen` / `lastSuccessfulCheckedAt` に保持します

過剰アクセス防止のため、デフォルトで各URLの間に `1200ms` の待機を入れています。

## Googleスプレッドシート書き込み

```bash
npm run prices:sheets
```

pnpm:

```bash
pnpm prices:sheets
```

必要な環境変数は [.env.example](./.env.example) を参照してください。

```env
GOOGLE_SERVICE_ACCOUNT_JSON=...
GOOGLE_SHEETS_SPREADSHEET_ID=...
GOOGLE_SHEETS_SHEET_NAME=ProductOffers
```

### Google Sheets API設定手順

1. Google Cloudでプロジェクトを作成
2. Google Sheets APIを有効化
3. サービスアカウントを作成
4. サービスアカウントキーJSONを発行
5. 対象スプレッドシートを作成
6. サービスアカウントの `client_email` にスプレッドシートの編集権限を付与
7. `.env` またはGitHub Secretsに設定

指定したシートタブが存在しない場合は、自動で作成します。

## サイト用 products.json 生成

```bash
npm run prices:export
```

pnpm:

```bash
pnpm prices:export
```

`data/product-offers.json` から、価格取得に成功した商品だけを `public/products.json` に出力します。

価格が取れない商品、`errorMessage` がある商品は除外されます。

## 一括実行

```bash
npm run prices:sync
```

pnpm:

```bash
pnpm prices:sync
```

実行順:

1. `prices:fetch`
2. `prices:sheets`
3. `prices:export`

## GitHub Actions

[.github/workflows/price-sync.yml](./.github/workflows/price-sync.yml) で1日1回実行します。

必要なGitHub Secrets:

- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_SHEETS_SPREADSHEET_ID`

任意のGitHub Variables:

- `GOOGLE_SHEETS_SHEET_NAME`

Actionsでは以下を実行します。

1. 依存関係インストール
2. 公式ストア価格取得
3. Google Sheetsへ書き込み
4. `public/products.json` / `public/price-history.json` 生成
5. 生成ファイルを自動コミット
6. サイトをビルドしてGitHub Pagesへデプロイ

GitHub Pagesで公開する場合は、リポジトリの Settings > Pages で Source を **GitHub Actions** に設定してください。自動コミット（GITHUB_TOKEN）は他のワークフローを起動しないため、デプロイは同じワークフロー内で行います。

Cloudflare Pagesを使う場合は、上記デプロイステップは不要です（コミットを検知して自動ビルドされます）。

## Myproteinのバリエーション取得

Myproteinはページを開いた時点の選択中バリエーションが不定で、`?variation=SKU` もサーバー側レンダリングには反映されません。そのため `expectedSku` を指定した場合、パーサーはページ内JSON-LD（`@graph` 配下のProductGroup → `hasVariant`）から該当SKUのバリエーションを直接引き当てます。

この方式で以下が取得できます。

- セール価格（`offers.price`）
- 通常価格（`priceSpecification` の `StrikethroughPrice`）
- 商品名・フレーバー・容量・画像・在庫

SKUはページ内JSON-LDの `hasVariant[].sku`（数値ID）です。`expectedSku` 未指定時は従来の「現在の商品」ブロック解析にフォールバックしますが、バリエーション誤認が起きやすいため `expectedSku` の指定を推奨します。

## pnpmのbuild script承認

pnpm v11では、`esbuild` のpostinstallを明示承認する必要があります。そのため [pnpm-workspace.yaml](<C:\SUBwork\codex\FitPrice Protein\pnpm-workspace.yaml>) に以下を入れています。

```yaml
allowBuilds:
  esbuild: true
```

## 作らないもの

- 完全自動の商品発見
- Amazon / Rakuten / iHerb の自動価格取得
- ログインが必要な価格取得
- CAPTCHA回避
- 過剰アクセス
- 管理画面
- 価格推移グラフのUI（データ蓄積のみ先行実施）
