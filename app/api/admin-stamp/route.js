import {
  adminDB,
  createTiming,
  currentStore,
  requireAdmin,
  reply,
  intParam,
  textParam,
  readJson,
  errorReply,
  InputError,
} from '@/lib/admin-server'
import { syncStampCardImage } from '@/lib/card-images/stamp'

export const dynamic = 'force-dynamic'

// 通常スタンプカード（/admin/stamp、/admin/stamp/customers、/admin/stamp/manage）
const STAMP_PROGRAM_CODE = 'stamp_regular'
const STAMP_MAX_COUNT = 12
const CARD_COLUMNS = '*'

// スタンプは有効な店舗だけを対象にする（従来どおり）
const stampStore = (db, timing) => currentStore(db, { activeOnly: true, timing })
const userIdParam = value => intParam(value, 'user_id', { min: 1 })

async function ownUser(db, store, userId) {
  const { data, error } = await db.from('users').select('user_id').eq('user_id', userId).eq('store_id', store.store_id).maybeSingle()
  if (error) throw error
  if (!data) throw new InputError('このスタンプカードは現在使用できません')
}

async function activeCard(db, userId) {
  const { data, error } = await db.from('v_stamp_cards_current').select(CARD_COLUMNS)
    .eq('user_id', userId).eq('program_code', STAMP_PROGRAM_CODE).eq('card_status', 'active').maybeSingle()
  if (error) throw error
  if (!data) throw new InputError('このスタンプカードは現在使用できません')
  return data
}

// 画像は DB の更新の後に作る。失敗しても DB の更新は取り消さず、画像だけを作り直せるよう結果を分けて返す。
async function renderImage(userId) {
  try {
    const response = await syncStampCardImage(userId)
    const body = await response.json().catch(() => ({}))
    if (response.ok && body.ok) return { image_ok: true }
    return { image_ok: false, image_error: body.error || body.message || `画像の生成に失敗しました（${response.status}）` }
  } catch (error) {
    console.error('stamp card image failed', { userId })
    return { image_ok: false, image_error: error?.message || '画像の生成に失敗しました' }
  }
}

const views = {
  // カード番号（user_id）で検索。現在の店舗のお客様のカードだけ。
  async card(db, q, timing) {
    const userId = userIdParam(q.get('user_id'))
    const store = await stampStore(db, timing)
    await ownUser(db, store, userId)
    return { card: await timing.measure('db', activeCard(db, userId)) }
  },

  // お客様一覧（現在の店舗）と、その有効な通常スタンプカード
  async customers(db, q, timing) {
    const store = await stampStore(db, timing)
    const { data: users, error } = await timing.measure('db', db.from('users')
      .select('user_id, store_id, display_name, status, customer_note, updated_at')
      .eq('store_id', store.store_id).order('user_id', { ascending: true }))
    if (error) throw error
    const ids = (users || []).map(u => u.user_id)
    let cards = []
    if (ids.length) {
      const { data, error: cardError } = await timing.measure('cards', db.from('v_stamp_cards_current')
        .select('user_id, card_id, display_name, current_count, max_count, completed_at, card_status, program_code, updated_at')
        .in('user_id', ids).eq('program_code', STAMP_PROGRAM_CODE).eq('card_status', 'active'))
      if (cardError) throw cardError
      cards = data || []
    }
    return { store, users: users || [], cards }
  },

  // アーカイブ済みの通常スタンプカード
  async archived(db, q, timing) {
    const { data, error } = await timing.measure('db', db.rpc('list_archived_regular_customer_stamp_cards'))
    if (error) throw error
    return { data: Array.isArray(data) ? data : [] }
  },
}

const actions = {
  // 新規発行：現在の店舗にお客様を作り、通常スタンプカードを発行する
  async create_card(db) {
    const store = await stampStore(db)
    const { data: user, error } = await db.from('users')
      .insert({ store_id: store.store_id, display_name: '未登録', status: 'active', updated_at: new Date().toISOString() })
      .select('user_id').maybeSingle()
    if (error || !user) throw error || new Error('ユーザー作成に失敗しました')
    const { data: rows, error: cardError } = await db.rpc('create_stamp_card_for_user', {
      p_user_id: user.user_id,
      p_program_code: STAMP_PROGRAM_CODE,
      p_max_count: STAMP_MAX_COUNT,
      p_note: '管理画面から新規発行',
    })
    if (cardError) throw new Error(`カード発行に失敗しました: ${cardError.message}`)
    if (!rows?.length) throw new Error('カード発行結果を取得できませんでした')
    const image = await renderImage(user.user_id)
    return { card: await activeCard(db, user.user_id), ...image }
  },

  async save_name(db, body) {
    const userId = userIdParam(body.user_id)
    const name = textParam(body.name, '氏名', { optional: true, max: 100 })
    const store = await stampStore(db)
    await ownUser(db, store, userId)
    const { error } = await db.from('users')
      .update({ display_name: name ?? '未登録', updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('store_id', store.store_id)
    if (error) throw error
    const image = await renderImage(userId)
    return { card: await activeCard(db, userId), ...image }
  },

  // スタンプの +1 / -1
  async adjust(db, body) {
    const userId = userIdParam(body.user_id)
    const diff = intParam(body.diff, 'diff', { min: -1, max: 1 })
    if (diff === 0) throw new InputError('diff の値が正しくありません。')
    const store = await stampStore(db)
    await ownUser(db, store, userId)
    const card = await activeCard(db, userId)
    const { data, error } = await db.rpc('increment_stamp_card', {
      p_card_id: card.card_id,
      p_amount: diff,
      p_acted_by: 'admin_ui',
      p_reason: diff > 0 ? '管理画面からスタンプ追加' : '管理画面からスタンプ減算',
    })
    if (error || !data?.length) throw error || new Error('スタンプ更新に失敗しました')
    const image = await renderImage(userId)
    return { card: await activeCard(db, userId), ...image }
  },

  async reset(db, body) {
    const userId = userIdParam(body.user_id)
    const store = await stampStore(db)
    await ownUser(db, store, userId)
    const card = await activeCard(db, userId)
    const { data, error } = await db.rpc('reset_stamp_card', {
      p_card_id: card.card_id,
      p_acted_by: 'admin_ui',
      p_reason: '管理画面からリセット',
    })
    if (error || !data?.length) throw error || new Error('スタンプのリセットに失敗しました')
    const image = await renderImage(userId)
    return { card: await activeCard(db, userId), ...image }
  },

  // お客様一覧：表示名とお客様メモ
  async save_customer(db, body) {
    const userId = userIdParam(body.user_id)
    const store = await stampStore(db)
    await ownUser(db, store, userId)
    const { error } = await db.from('users').update({
      display_name: textParam(body.display_name, '氏名', { optional: true, max: 100 }) ?? '未登録',
      customer_note: textParam(body.customer_note, 'お客様メモ', { optional: true, max: 2000 }),
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId).eq('store_id', store.store_id)
    if (error) throw error
    return { ok: true, ...(await renderImage(userId)) }
  },

  // 通常スタンプイベントの終了（有効な通常スタンプカードのアーカイブ）
  async archive(db) {
    const { data, error } = await db.rpc('archive_active_regular_customer_stamp_cards', {
      p_acted_by: 'admin_ui',
      p_reason: '管理画面から通常スタンプイベント終了',
    })
    if (error || !data?.length) throw error || new Error('アーカイブに失敗しました')
    return { data }
  },

  // アーカイブ済みカードの復元（現在の店舗のお客様のカードだけ）
  async restore(db, body) {
    const cardId = intParam(body.card_id, 'card_id', { min: 1 })
    const store = await stampStore(db)
    const { data: card, error } = await db.from('cards').select('card_id, user_id').eq('card_id', cardId).maybeSingle()
    if (error) throw error
    if (!card) throw new InputError('対象のカードが見つかりません。')
    await ownUser(db, store, card.user_id)
    const { data, error: restoreError } = await db.rpc('restore_regular_customer_stamp_card', {
      p_card_id: cardId,
      p_acted_by: 'admin_ui',
      p_reason: '管理画面から通常スタンプカードを復元',
    })
    if (restoreError || !data?.length) throw restoreError || new Error('復元に失敗しました')
    return { data }
  },
}

export async function GET(request) {
  const denied = await requireAdmin(request)
  if (denied) return denied
  try {
    const q = new URL(request.url).searchParams
    const name = q.get('view')
    const view = Object.hasOwn(views, name) ? views[name] : null
    if (!view) throw new InputError('view の指定が正しくありません。')
    const timing = createTiming()
    const body = await view(adminDB(), q, timing)
    return reply(body, 200, timing.header())
  } catch (error) {
    return errorReply(error, 'スタンプカードの取得に失敗しました。')
  }
}

export async function POST(request) {
  const denied = await requireAdmin(request, { write: true })
  if (denied) return denied
  try {
    const body = await readJson(request)
    const action = Object.hasOwn(actions, body.action) ? actions[body.action] : null
    if (!action) throw new InputError('action の指定が正しくありません。')
    return reply(await action(adminDB(), body))
  } catch (error) {
    return errorReply(error, 'スタンプカードの保存に失敗しました。')
  }
}
