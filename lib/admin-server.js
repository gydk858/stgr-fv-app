// Server-only helpers for the admin APIs (/api/admin-*). These use the service role key,
// so they must never be imported from a 'use client' component.
import { eventDB } from './event-server'
import { isEventAdmin, sameOrigin } from './event-access'

export const adminDB = eventDB

export const reply = (body, status = 200, extraHeaders = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...extraHeaders } })

// Records how long each DB round trip takes and exposes it as a Server-Timing header
// (visible in the browser's network panel; contains only names and milliseconds).
export function createTiming() {
  const started = performance.now()
  const entries = []
  return {
    async measure(name, work) {
      const t = performance.now()
      try {
        return await work
      } finally {
        entries.push(`${name};dur=${(performance.now() - t).toFixed(1)}`)
      }
    },
    header() {
      return { 'Server-Timing': [...entries, `total;dur=${(performance.now() - started).toFixed(1)}`].join(', ') }
    },
  }
}

// Returns an error Response when the request may not proceed, or null when it may.
// proxy.js already requires the admin session for /api/admin-*; this is the second check.
export async function requireAdmin(request, { write = false } = {}) {
  if (!(await isEventAdmin())) return reply({ error: '管理ログインをやり直してください。' }, 401)
  if (write && !sameOrigin(request)) return reply({ error: '操作元を確認できません。' }, 403)
  return null
}

// The store selected by app_settings.current_store_code. Some screens only accept an active
// store and others do not, so the caller chooses (matching each screen's current behavior).
// The setting and the (small) stores table are read in parallel, so this costs one round trip
// instead of two. Nothing is cached: a change of current_store_code applies to the next request.
export async function currentStore(db, { activeOnly = true, timing } = {}) {
  const run = (name, work) => (timing ? timing.measure(name, work) : work)
  const [settingResult, storesResult] = await run('store', Promise.all([
    db.from('app_settings').select('setting_value').eq('setting_key', 'current_store_code').maybeSingle(),
    db.from('stores').select('store_id, store_code, store_name, status'),
  ]))
  const { data: setting, error } = settingResult
  if (error) throw error
  if (!setting?.setting_value) throw new Error('current_store_code が設定されていません。')
  if (storesResult.error) throw storesResult.error

  const store = (storesResult.data || []).find(s =>
    s.store_code === setting.setting_value && (!activeOnly || s.status === 'active'))
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

// YYYY-MM-DD (or null when optional and empty).
export function dateParam(value, name, { optional = false } = {}) {
  if (optional && (value === null || value === undefined || value === '')) return null
  const s = String(value ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw new InputError(`${name} の値が正しくありません。`)
  }
  return s
}

// Trimmed text with a length limit; empty becomes null when optional.
export function textParam(value, name, { optional = false, max = 1000 } = {}) {
  const s = typeof value === 'string' ? value.trim() : ''
  if (!s) {
    if (optional) return null
    throw new InputError(`${name} を入力してください。`)
  }
  if (s.length > max) throw new InputError(`${name} が長すぎます。`)
  return s
}

// Parses the JSON body of a POST and returns { action, ...fields }.
export async function readJson(request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('送信内容が正しくありません。')
  return body
}

// Converts thrown errors into the reply shape the screens expect.
export function errorReply(error, fallback = '処理に失敗しました。') {
  if (error instanceof InputError) return reply({ error: error.message }, 400)
  console.error('admin api failed', { code: error?.code || 'unknown' })
  return reply({ error: error?.message || fallback }, 500)
}
