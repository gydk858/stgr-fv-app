import { adminDB, createTiming, currentStore, requireAdmin, reply, errorReply } from '@/lib/admin-server'
import { HUNTER_FIELDS, hunterCrowns, hunterPrintPending } from '@/lib/hunter-server'

export const dynamic = 'force-dynamic'

// ホーム（/admin）用の読み取り専用 API。書き込みはしない。
// 店舗はサーバーが current_store_code から決める（有効な店舗のみ）。

// 営業日は朝4時（日本時間）で切り替える
function businessDay(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000 - 4 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 10)
}

// 営業日の始まり（日本時間の朝4時）を UTC の ISO 文字列で返す
function businessDayStartIso(day) {
  return new Date(`${day}T04:00:00+09:00`).toISOString()
}

const LOCKED = ['locked', 'paid', 'closed']

// 毎日 19:50 の画像の自動更新（GitHub Actions）の最新の結果。取れなければ null。
async function latestImageRefresh() {
  try {
    const res = await fetch(
      'https://api.github.com/repos/gydk858/stgr-fv-app/actions/workflows/hunter-print-refresh.yml/runs?per_page=1',
      {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'bistro-bambi-admin' },
        next: { revalidate: 600 },
        signal: AbortSignal.timeout(4000),
      }
    )
    if (!res.ok) return null
    const json = await res.json()
    const run = json?.workflow_runs?.[0]
    if (!run) return null
    return {
      status: run.status,
      conclusion: run.conclusion,
      started_at: run.run_started_at || run.created_at,
      updated_at: run.updated_at,
      event: run.event,
    }
  } catch {
    return null
  }
}

async function summary(db, timing) {
  const store = await currentStore(db, { activeOnly: true, timing })
  const storeId = store.store_id
  const today = businessDay()
  const todayStart = businessDayStartIso(today)
  const [year, month] = today.split('-').map(Number)

  const results = await timing.measure('db', Promise.all([
    db.from('employee_profiles')
      .select('user_id, staff_code, employee_name, employment_status')
      .eq('store_id', storeId),
    db.from('payroll_periods')
      .select('payroll_period_id, target_year, target_month, half_type, period_start, period_end, payday, status')
      .eq('store_id', storeId).order('period_start', { ascending: true }),
    db.rpc('get_ranch_month_summary', { p_store_id: storeId, p_target_year: year, p_target_month: month }),
    db.from('staff_attendance_events')
      .select('amount')
      .eq('store_id', storeId).eq('work_date', today),
    db.from('bambi_hunter_purchases')
      .select('amount')
      .eq('store_id', storeId).eq('status', 'confirmed').gte('created_at', todayStart),
    db.from('bambi_events')
      .select('id, name, starts_on, ends_on, status, last_card_no')
      .eq('store_id', storeId).eq('status', 'active').order('starts_on', { ascending: true }),
    db.from('bambi_hunters').select(HUNTER_FIELDS).eq('store_id', storeId),
    db.from('bambi_hunter_settings').select('version').eq('store_id', storeId).maybeSingle(),
  ]))
  for (const r of results) if (r.error) throw r.error
  const [employees, periods, ranch, attendance, purchases, events, hunters, hunterSetting] = results.map(r => r.data)

  const staffByUser = new Map((employees || []).map(e => [String(e.user_id), e]))
  const userIds = [...staffByUser.keys()].map(Number)

  // 勤務記録（店舗の従業員だけ）：今日の出勤中と、退勤が押されていない古い記録
  let openSessions = []
  if (userIds.length) {
    const { data, error } = await timing.measure('db', db.from('staff_work_sessions')
      .select('work_session_id, user_id, staff_code, work_date, clock_in_at, status')
      .eq('status', 'open').in('user_id', userIds).order('work_date', { ascending: true }))
    if (error) throw error
    openSessions = data || []
  }
  const working = openSessions
    .filter(s => s.work_date === today)
    .map(s => ({ staff_code: s.staff_code, name: staffByUser.get(String(s.user_id))?.employee_name || s.staff_code, clock_in_at: s.clock_in_at }))
  const forgotten = openSessions
    .filter(s => s.work_date < today)
    .map(s => ({ staff_code: s.staff_code, name: staffByUser.get(String(s.user_id))?.employee_name || s.staff_code, work_date: s.work_date }))

  // 給与：今日を含む前半・後半の期間と、支払日を過ぎても確定していない期間（月末ボーナスは除く）
  const regular = (periods || []).filter(p => p.half_type !== 'monthly_bonus')
  const current = regular.find(p => p.period_start <= today && today <= p.period_end) || null
  const unlockedPast = regular
    .filter(p => p.payday && p.payday < today && !LOCKED.includes(p.status))
    .map(p => ({ target_year: p.target_year, target_month: p.target_month, half_type: p.half_type, payday: p.payday }))

  // ハンティング：画像の反映待ち（管理画面と同じ判定）
  let pendingImages = 0
  if ((hunters || []).length && hunterSetting) {
    const crowns = await timing.measure('db', hunterCrowns(db, storeId))
    pendingImages = hunters.filter(card => hunterPrintPending(card, hunterSetting, crowns)).length
  }

  const ranchRow = Array.isArray(ranch) && ranch.length ? ranch[0] : null

  return {
    today,
    store: { store_name: store.store_name, store_code: store.store_code },
    payroll: { current, unlocked_past: unlockedPast },
    ranch: ranchRow
      ? {
          total_profit_amount: ranchRow.total_profit_amount,
          care_count: Number(ranchRow.first_half_care_count || 0) + Number(ranchRow.second_half_care_count || 0),
        }
      : null,
    staff: {
      active_count: (employees || []).filter(e => (e.employment_status || 'active') === 'active').length,
      working,
      today_attendance: (attendance || []).reduce((sum, a) => sum + Number(a.amount || 0), 0),
      forgotten_sessions: forgotten,
    },
    hunting: {
      today_count: (purchases || []).length,
      today_amount: (purchases || []).reduce((sum, p) => sum + Number(p.amount || 0), 0),
      pending_images: pendingImages,
    },
    events: (events || []).map(e => ({ id: e.id, name: e.name, starts_on: e.starts_on, ends_on: e.ends_on, issued: Number(e.last_card_no || 0) })),
    image_refresh: await latestImageRefresh(),
  }
}

export async function GET(request) {
  const denied = await requireAdmin(request)
  if (denied) return denied
  try {
    const timing = createTiming()
    const body = await summary(adminDB(), timing)
    return reply(body, 200, timing.header())
  } catch (error) {
    return errorReply(error, 'ホームの情報の取得に失敗しました。')
  }
}
