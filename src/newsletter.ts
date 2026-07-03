import { config } from './config'

export type SubscribeResult = { ok: true } | { ok: false; message: string }

export type SubscribeInput = {
  email: string
  favoriteMaker?: string
}

export function validateEmail(email: string): SubscribeResult {
  const normalized = email.trim()
  if (!normalized) return { ok: false, message: 'メールアドレスを入力してください。' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { ok: false, message: '正しいメールアドレスを入力してください。' }
  }
  return { ok: true }
}

// 配信ポリシー（実装時の仕様）:
// - 送信タイミング: 対象商品の実売価格が前回から変動（値上げ・値下げとも）またはクーポン発生時のみ
// - 対象: ランキング上位3社 ＋ 登録者の「よく買うメーカー」
// - 頻度: 1日1通に集約。変動がない日は送らない
export async function subscribeToNewsletter(input: SubscribeInput): Promise<SubscribeResult> {
  const result = validateEmail(input.email)
  if (!result.ok) return result

  // Brevo未接続の間は、登録できたと誤解させないよう正直に「準備中」を返す。
  if (!config.brevoFormAction) {
    return { ok: false, message: 'メール配信は現在準備中です。開始までもうしばらくお待ちください。' }
  }

  try {
    // Brevoの購読フォームへ直接POST（静的サイトのためAPIキーは使わない）。
    // no-corsのためレスポンスは読めない。バリデーション済みなので成功扱いにする。
    await fetch(config.brevoFormAction, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        EMAIL: input.email.trim(),
        FAVORITE_MAKER: input.favoriteMaker?.trim() ?? '',
      }),
    })
    return { ok: true }
  } catch {
    return { ok: false, message: '登録に失敗しました。時間をおいてもう一度お試しください。' }
  }
}
