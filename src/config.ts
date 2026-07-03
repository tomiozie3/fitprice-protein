// 外部サービスの接続設定。IDを入れてビルド・デプロイすると有効化される。
// 秘密情報（APIキー等）はここに書かないこと。ここに書いた値はすべて公開サイトに含まれる。
export const config = {
  // Google Analytics 4 の測定ID（例: 'G-XXXXXXXXXX'）。空なら計測せずconsole出力のみ。
  gaMeasurementId: 'G-MW7F6QX5JN',

  // Brevo（メール配信）の購読フォームURL。空ならフォームは「準備中」表示。
  // Brevo管理画面 > Marketing > Forms でフォームを作成し、ShareのリンクURLを貼る。
  brevoFormAction: 'https://6b82addc.sibforms.com/serve/MUIFAKDQsaQ436J3FzYBcSosIrpn0cPj2cUq5XilE4xZolYevlepSsLtNhQVjHEUX-lYNeQcGGmv49lze0qdWtU3RiXPtoMTPcHsfO1EYJT2nK3yHLgIMtBWLr3dRQx4vkBbuw1g-EgOcyzxdi8C_Qblx1-QxV4CbAgTQm6tsaOAwhtfaxcGAq718RhiL7zDawfcIOe7Nq5cLm_-nQ==',
}
