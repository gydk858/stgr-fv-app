// Server-only helpers for the admin APIs (/api/admin-*). These use the service role key,
// so they must never be imported from a 'use client' component.
import { eventDB } from './event-server'
import { isEventAdmin, sameOrigin } from './event-access'

export const adminDB = eventDB

export const reply = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })

// Returns an error Response when the request may not proceed, or null when it may.
// proxy.js already requires the admin session for /api/admin-*; this is the second check.
export async function requireAdmin(request, { write = false } = {}) {
  if (!(await isEventAdmin())) return reply({ error: '管理ログインをやり直してください。' }, 401)
  if (write && !sameOrigin(request)) return reply({ error: '操作元を確認できません。' }, 403)
  return null
}

// The store selected by app_settings.current_store_code. Some screens only accept an active
// store and others do not, so the caller chooses (matching each screen's current behavior).
export async function currentStore(db, { activeOnly = true } = {}) {
  const { data: setting, error } = await db
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'current_store_code')
    .maybeSingle()
  if (error) throw error
  if (!setting?.setting_value) throw new Error('current_store_code が設定されていません。')

  let query = db
    .from('stores')
    .select('store_id, store_code, store_name, status')
    .eq('store_code', setting.setting_value)
  if (activeOnly) query = query.eq('status', 'active')
  const { data: store, error: storeError } = await query.maybeSingle()
  if (storeError) throw storeError
  if (!store) {
    throw new Error(activeOnly ? `有効な店舗が見つかりません: ${setting.setting_value}` : `店舗が見つかりません: ${setting.setting_value}`)
  }
  return store
}

export class InputError extends Error {}

export function intParam(value, name, { min = -2147483648, max = 2147483647 } = {}) {
  const n = Number(value)
  if (value === null || value === undefined || value === '' || !Number.isInteger(n) || n < min || n > max) {
    throw new InputError(`${name} の値が正しくありません。`)
  }
  return n
}

export const boolParam = value => value === true || value === 'true' || value === '1'

// Converts thrown errors into the reply shape the screens expect.
export function errorReply(error, fallback = '処理に失敗しました。') {
  if (error instanceof InputError) return reply({ error: error.message }, 400)
  console.error('admin api failed', { code: error?.code || 'unknown' })
  return reply({ error: error?.message || fallback }, 500)
}
