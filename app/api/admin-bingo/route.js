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
import { syncBingoCardImage } from '@/lib/card-images/bingo'

export const dynamic = 'force-dynamic'

// 通常ビンゴカード（/admin/bingo、/admin/bingo/customers、/admin/bingo/manage）
const BINGO_PROGRAM_CODE = 'bingo_regular'

const bingoStore = (db, timing) => currentStore(db, { activeOnly: true, timing })
const userIdParam = value => intParam(value, 'user_id', { min: 1 })
const numberParam = value => intParam(value, '番号', { min: 1, max: 999 })

async function ownUser(db, store, userId) {
  const { data, error } = await db.from('users').select('user_id').eq('user_id', userId).eq('store_id', store.store_id).maybeSingle()
  if (error) throw error
  if (!data) throw new InputError('ビンゴカードが見つかりません')
}

async function programId(db) {
  const { data, error } = await db.from('card_programs').select('program_id').eq('code', BINGO_PROGRAM_CODE).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('ビンゴ program の取得に失敗しました')
  return data.program_id
}

// 有効なビンゴカードとマス。無い場合は、アーカイブ済みかどうかで案内を分ける（従来どおり）。
async function activeCard(db, userId) {
  const { data: card, error } = await db.from('v_bingo_cards_current').select('*')
    .eq('user_id', userId).eq('program_code', BINGO_PROGRAM_CODE).eq('card_status', 'active').maybeSingle()
  if (error) throw error
  if (!card) {
    const { data: archived } = await db.from('cards')
      .select('card_id, status, card_types!inner(code), card_programs!inner(code)')
      .eq('user_id', userId).eq('status', 'archived').eq('card_types.code', 'bingo').eq('card_programs.code', BINGO_PROGRAM_CODE).limit(1)
    throw new InputError(archived?.length ? 'このビンゴカードは現在使用できません' : 'ビンゴカードが見つかりません')
  }
  const { data: cells, error: cellError } = await db.from('bingo_card_cells').select('*')
    .eq('card_id', card.card_id).order('cell_index', { ascending: true })
  if (cellError || !cells) throw cellError || new Error('ビンゴマスの取得に失敗しました')
  return { card, cells }
}

// 画像は DB の更新の後に作る。失敗しても DB の更新は取り消さず、画像だけを作り直せるよう結果を分けて返す。
async function renderImage(userId) {
  try {
    const response = await syncBingoCardImage(userId)
    const body = await response.json().catch(() => ({}))
    if (response.ok && body.ok) return { image_ok: true }
    return { image_ok: false, image_error: body.error || body.message || `画像の生成に失敗しました（${response.status}）` }
  } catch (error) {
    console.error('bingo card image failed', { userId })
    return { image_ok: false, image_error: error?.message || '画像の生成に失敗しました' }
  }
}

const views = {
  async mappings(db, q, timing) {
    const id = await programId(db)
    const { data, error } = await timing.measure('db', db.from('bingo_product_mappings').select('*')
      .eq('program_id', id).eq('is_active', true)
      .order('display_order', { ascending: true }).order('bingo_number', { ascending: true }).order('product_name', { ascending: true }))
    if (error) throw error
    return { mappings: data || [] }
  },

  async card(db, q, timing) {
    const userId = userIdParam(q.get('user_id'))
    const store = await bingoStore(db, timing)
    await ownUser(db, store, userId)
    return await timing.measure('db', activeCard(db, userId))
  },

  async customers(db, q, timing) {
    const store = await bingoStore(db, timing)
    const { data: users, error } = await timing.measure('db', db.from('users')
      .select('user_id, store_id, display_name, status, customer_note, updated_at')
      .eq('store_id', store.store_id).order('user_id', { ascending: true }))
    if (error) throw error
    const ids = (users || []).map(u => u.user_id)
    let cards = []
    if (ids.length) {
      const { data, error: cardError } = await timing.measure('cards', db.from('v_bingo_cards_current').select('*')
        .in('user_id', ids).eq('program_code', BINGO_PROGRAM_CODE).eq('card_status', 'active'))
      if (cardError) throw cardError
      cards = data || []
    }
    return { store, users: users || [], cards }
  },

  async archived(db, q, timing) {
    const { data, error } = await timing.measure('db', db.rpc('list_archived_regular_bingo_cards'))
    if (error) throw error
    return { data: Array.isArray(data) ? data : [] }
  },
}

const actions = {
  async create_card(db) {
    const store = await bingoStore(db)
    const { data: user, error } = await db.from('users')
      .insert({ store_id: store.store_id, display_name: '未登録', status: 'active', updated_at: new Date().toISOString() })
      .select('user_id').maybeSingle()
    if (error || !user) throw error || new Error('ビンゴカード発行に失敗しました')
    const { data: rows, error: cardError } = await db.rpc('create_bingo_card_for_user', {
      p_user_id: user.user_id,
      p_program_code: BINGO_PROGRAM_CODE,
      p_grid_size: 5,
      p_has_free_center: false,
      p_note: '管理画面からビンゴ新規発行',
    })
    if (cardError || !rows?.length) throw new Error('ビンゴカード本体の作成に失敗しました')
    const image = await renderImage(user.user_id)
    return { user_id: user.user_id, ...(await activeCard(db, user.user_id)), ...image }
  },

  async save_name(db, body) {
    const userId = userIdParam(body.user_id)
    const name = textParam(body.name, '氏名', { optional: true, max: 100 })
    const store = await bingoStore(db)
    await ownUser(db, store, userId)
    const { error } = await db.from('users')
      .update({ display_name: name ?? '未登録', updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('store_id', store.store_id)
    if (error) throw error
    const image = await renderImage(userId)
    return { ...(await activeCard(db, userId)), ...image }
  },

  // 番号を開く（商品名つき）／閉じる
  async mark(db, body) {
    const userId = userIdParam(body.user_id)
    const number = numberParam(body.number)
    const productName = textParam(body.product_name, '商品名', { optional: true, max: 100 })
    const store = await bingoStore(db)
    await ownUser(db, store, userId)
    const { card } = await activeCard(db, userId)
    const { data, error } = await db.rpc('mark_bingo_number', {
      p_card_id: card.card_id,
      p_number: number,
      p_product_name: productName,
      p_acted_by: 'admin_ui',
      p_note: '管理画面から番号開放',
    })
    if (error || !data?.length) throw error || new Error('番号の開放に失敗しました')
    const image = await renderImage(userId)
    return { result: data[0], ...(await activeCard(db, userId)), ...image }
  },

  async unmark(db, body) {
    const userId = userIdParam(body.user_id)
    const number = numberParam(body.number)
    const store = await bingoStore(db)
    await ownUser(db, store, userId)
    const { card } = await activeCard(db, userId)
    const { data, error } = await db.rpc('unmark_bingo_number', {
      p_card_id: card.card_id,
      p_number: number,
      p_acted_by: 'admin_ui',
      p_note: 'ビンゴカード管理画面から番号を閉じる',
    })
    if (error || !data?.length) throw error || new Error('番号を閉じる処理に失敗しました')
    const image = await renderImage(userId)
    return { result: data[0], ...(await activeCard(db, userId)), ...image }
  },

  async save_mapping(db, body) {
    const name = textParam(body.product_name, '商品名', { max: 100 })
    const number = numberParam(body.bingo_number)
    const imagePath = textParam(body.image_path, '画像パス', { optional: true, max: 500 })
    const id = await programId(db)
    const { error } = await db.from('bingo_product_mappings').upsert({
      program_id: id,
      product_name: name,
      bingo_number: number,
      image_path: imagePath,
      image_fit: 'contain',
      is_active: true,
      display_order: number,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'program_id,product_name' })
    if (error) throw error
    return { ok: true }
  },

  async delete_mapping(db, body) {
    const mappingId = intParam(body.mapping_id, 'mapping_id', { min: 1 })
    const id = await programId(db)
    const { data, error } = await db.from('bingo_product_mappings').delete()
      .eq('mapping_id', mappingId).eq('program_id', id).select('mapping_id')
    if (error) throw error
    if (!data?.length) throw new InputError('対象の商品番号マッピングが見つかりません。')
    return { ok: true }
  },

  async save_customer(db, body) {
    const userId = userIdParam(body.user_id)
    const store = await bingoStore(db)
    await ownUser(db, store, userId)
    const { error } = await db.from('users').update({
      display_name: textParam(body.display_name, '氏名', { optional: true, max: 100 }) ?? '未登録',
      customer_note: textParam(body.customer_note, 'お客様メモ', { optional: true, max: 2000 }),
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId).eq('store_id', store.store_id)
    if (error) throw error
    return { ok: true, ...(await renderImage(userId)) }
  },

  async reset_all(db) {
    const { data, error } = await db.rpc('reset_regular_bingo_cards', {
      p_acted_by: 'admin_ui',
      p_note: 'ビンゴ管理画面から通常ビンゴカード一括リセット',
    })
    if (error || !data?.length) throw error || new Error('通常ビンゴカードのリセットに失敗しました')
    return { data }
  },

  async archive(db) {
    const { data, error } = await db.rpc('archive_active_regular_bingo_cards', {
      p_acted_by: 'admin_ui',
      p_note: '管理画面から通常ビンゴイベント終了',
    })
    if (error || !data?.length) throw error || new Error('アーカイブに失敗しました')
    return { data }
  },

  // アーカイブ済みカードの復元（現在の店舗のお客様のカードだけ）。画像の失敗は復元の失敗にしない（従来どおり）。
  async restore(db, body) {
    const cardId = intParam(body.card_id, 'card_id', { min: 1 })
    const store = await bingoStore(db)
    const { data: card, error } = await db.from('cards').select('card_id, user_id').eq('card_id', cardId).maybeSingle()
    if (error) throw error
    if (!card) throw new InputError('対象のカードが見つかりません。')
    await ownUser(db, store, card.user_id)
    const { data, error: restoreError } = await db.rpc('restore_regular_bingo_card', {
      p_card_id: cardId,
      p_acted_by: 'admin_ui',
      p_note: '管理画面から通常ビンゴカードを復元',
    })
    if (restoreError || !data?.length) throw restoreError || new Error('復元に失敗しました')
    const image = await renderImage(data[0].user_id)
    return { data, ...image }
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
    return errorReply(error, 'ビンゴカードの取得に失敗しました。')
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
    return errorReply(error, 'ビンゴカードの保存に失敗しました。')
  }
}
