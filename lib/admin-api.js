// Browser helpers for calling the admin APIs (/api/admin-*) instead of Supabase directly.
// Errors are thrown as Error so each screen's existing error display keeps working.

async function handle(response) {
  if (response.status === 401) {
    window.location.href = '/admin/login'
    throw new Error('管理ログインをやり直してください。')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || `通信に失敗しました（${response.status}）`)
  return body
}

export async function adminGet(path, params = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) query.set(key, String(value))
  }
  const qs = query.toString()
  const response = await fetch(qs ? `${path}?${qs}` : path, { cache: 'no-store', credentials: 'same-origin' })
  return handle(response)
}

export async function adminPost(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return handle(response)
}
