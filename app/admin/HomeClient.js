'use client'

import { useEffect, useState } from 'react'
import { adminGet } from '@/lib/admin-api'
import s from '@/components/v2/v2.module.css'

// 店長用ホーム（/admin）。数字は /api/admin-home（読み取り専用）から取る。

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
const HALF_LABEL = { first_half: '前半', second_half: '後半' }

const money = (value) => Number(value || 0).toLocaleString()
const md = (date) => {
  const [, m, d] = String(date || '').slice(0, 10).split('-')
  return m ? `${Number(m)}/${Number(d)}` : '-'
}
const daysBetween = (from, to) =>
  Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000)
const timeJst = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }) : ''
const dateTimeJst = (iso) =>
  iso
    ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''

function greeting() {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo', hour: 'numeric', hour12: false }))
  if (h >= 4 && h < 11) return 'Good morning'
  if (h >= 11 && h < 17) return 'Good afternoon'
  return 'Good evening'
}

function Kicker({ children }) {
  return <span className={s.kicker} style={{ fontSize: 16 }}>{children}</span>
}

function Card({ kicker, title, badge, children, actions }) {
  return (
    <article className={s.card} style={{ gap: 8, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Kicker>{kicker}</Kicker>
        {badge}
      </div>
      <h3 style={{ margin: 0, fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 19, color: '#22352b' }}>{title}</h3>
      {children}
      {actions && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>{actions}</div>}
    </article>
  )
}

function Big({ value, unit }) {
  return (
    <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 24, color: '#22352b' }}>
      {value}
      {unit && <span style={{ fontSize: 14 }}> {unit}</span>}
    </span>
  )
}

function Badge({ children, kind = 'open' }) {
  const style =
    kind === 'open'
      ? { background: '#e7eee4', color: '#34503a' }
      : kind === 'warn'
        ? { background: '#f8ece7', color: '#b8573f' }
        : { background: '#f4ede0', color: '#6a4a12' }
  return <span className={s.pill} style={{ ...style, fontSize: 12, fontWeight: 700 }}>{children}</span>
}

function LinkButton({ href, children, primary }) {
  return (
    <a
      href={href}
      className={`${s.btn} ${s.btnSmall} ${primary ? s.btnPrimary : ''}`}
      style={{ textDecoration: 'none', ...(primary ? {} : { background: '#eef2ea', border: 0 }) }}
    >
      {children}
    </a>
  )
}

function Alert({ kind, children, href, label }) {
  const warn = kind === 'warn'
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 12,
        background: warn ? '#f8ece7' : kind === 'unknown' ? '#f4efe6' : '#eef2ea',
        border: `1px solid ${warn ? '#e3c2b8' : kind === 'unknown' ? '#e4dacb' : '#d5e0d1'}`,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          aria-hidden="true"
          style={{
            width: 24,
            height: 24,
            flex: '0 0 auto',
            borderRadius: 999,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            color: '#fbf6ec',
            background: warn ? '#b8573f' : kind === 'unknown' ? '#8a6f45' : '#2f4a3a',
          }}
        >
          {warn ? '！' : kind === 'unknown' ? '？' : '✓'}
        </span>
        <span style={{ fontSize: 14, color: warn ? '#8a3d2b' : '#22352b' }}>{children}</span>
      </span>
      {href && <LinkButton href={href}>{label}</LinkButton>}
    </div>
  )
}

function SectionTitle({ title, sub }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 }}>
      <h2 className={s.h2}>{title}</h2>
      {sub && <span className={s.muted}>{sub}</span>}
    </div>
  )
}

export default function HomeClient() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setData(await adminGet('/api/admin-home'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ホームの情報を取得できませんでした')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }

  const header = (
    <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span className={s.kicker}>{greeting()}</span>
        <h1 className={s.title}>今日のようす</h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {data?.today && (
          <span className={s.muted} style={{ fontSize: 14 }}>
            {Number(data.today.slice(5, 7))}月{Number(data.today.slice(8, 10))}日（{WEEKDAYS[new Date(`${data.today}T00:00:00Z`).getUTCDay()]}）の営業日 ・ 朝4時で切り替え
          </span>
        )}
        <button type="button" className={`${s.btn} ${s.btnSmall}`} onClick={load} disabled={loading}>
          {loading ? '読み込み中...' : '最新にする'}
        </button>
      </div>
    </header>
  )

  if (!data) {
    return (
      <>
        {header}
        {error ? (
          <div className={s.warnBox} role="alert" style={{ background: '#f8ece7', color: '#b8573f', fontSize: 14 }}>
            {error}
          </div>
        ) : (
          <div className={s.card}><p className={s.muted}>読み込み中です...</p></div>
        )}
      </>
    )
  }

  const { payroll, ranch, staff, hunting, events, image_refresh: refresh } = data
  const current = payroll?.current
  const unlocked = payroll?.unlocked_past || []
  const forgotten = staff?.forgotten_sessions || []

  // 画像の自動更新：最新の実行の結果
  let refreshAlert
  if (!refresh) {
    refreshAlert = <Alert kind="unknown">画像の自動更新の結果を確認できませんでした（GitHub に接続できないか、回数の上限です）。</Alert>
  } else if (refresh.status !== 'completed') {
    refreshAlert = <Alert kind="ok">画像の自動更新を実行中です（{dateTimeJst(refresh.started_at)} に開始）。</Alert>
  } else if (refresh.conclusion === 'success') {
    refreshAlert = <Alert kind="ok">直近の画像の自動更新は成功しました（{dateTimeJst(refresh.started_at)} に開始、{timeJst(refresh.updated_at)} に完了）。</Alert>
  } else {
    refreshAlert = (
      <Alert kind="warn">
        直近の画像の自動更新が成功していません（{dateTimeJst(refresh.started_at)} ・ 結果：{refresh.conclusion || '不明'}）。
      </Alert>
    )
  }

  return (
    <>
      {header}

      {error && (
        <div className={s.warnBox} role="alert" style={{ background: '#f8ece7', color: '#b8573f', fontSize: 14 }}>
          {error}（前に取得した内容を表示しています）
        </div>
      )}

      <section className={s.card} aria-label="確認が必要なこと" style={{ gap: 10 }}>
        <SectionTitle title="確認が必要なこと" sub="問題がなければ緑の✓だけになります" />
        {/* 退勤が押されていない勤務記録は、1件ずつ名前で出す（2026-11-25） */}
        {forgotten.map((f) => (
          <Alert key={`${f.staff_code}-${f.work_date}`} kind="warn">
            退勤が押されていません：{md(f.work_date)} {f.name || f.staff_code}
          </Alert>
        ))}
        {unlocked.length > 0 && (
          <Alert kind="warn" href="/admin/staff/payroll" label="給与計算を開く">
            支払日を過ぎた給与期間が {unlocked.length}件 確定されていません（
            {unlocked.map((p) => `${p.target_month}月${HALF_LABEL[p.half_type] || ''}`).join('・')}）
          </Alert>
        )}
        {forgotten.length === 0 && unlocked.length === 0 && <Alert kind="ok">勤務記録と給与の確定に、気になる点はありません。</Alert>}
        {refreshAlert}
      </section>

      <section aria-label="スタッフ・お金" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SectionTitle title="スタッフ・お金" />
        <div style={grid}>
          <Card
            kicker="Payroll"
            title="給与計算"
            actions={<LinkButton href="/admin/staff/payroll" primary>給与計算を開く</LinkButton>}
          >
            {current ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Big value={`${current.target_month}月${HALF_LABEL[current.half_type] || ''}`} />
                  <Badge kind={['locked', 'paid', 'closed'].includes(current.status) ? 'event' : 'open'}>
                    {['locked', 'paid', 'closed'].includes(current.status) ? '確定済み' : '編集中'}
                  </Badge>
                </div>
                <span className={s.muted}>
                  {md(current.period_start)}〜{md(current.period_end)} ・{' '}
                  {daysBetween(data.today, current.payday) > 0
                    ? `支払日まで あと ${daysBetween(data.today, current.payday)}日`
                    : '今日が支払日です'}
                </span>
              </>
            ) : (
              <span className={s.muted}>今日を含む給与期間はまだ作られていません。</span>
            )}
          </Card>

          <Card
            kicker="Ranch"
            title="牧場"
            actions={<LinkButton href="/admin/staff/ranch" primary>今日の記録を付ける</LinkButton>}
          >
            <Big value={money(ranch?.total_profit_amount)} />
            <span className={s.muted}>
              今月の牧場利益 ・ お世話 {ranch?.care_count ?? 0}回
            </span>
          </Card>

          <Card
            kicker="Staff"
            title="従業員"
            actions={
              <>
                <LinkButton href="/admin/staff">従業員一覧</LinkButton>
                <LinkButton href="/admin/staff/card">カード操作</LinkButton>
              </>
            }
          >
            <Big value={staff?.working?.length ?? 0} unit="人が出勤中" />
            <span className={s.muted}>
              {staff?.working?.length
                ? staff.working.map((w) => w.name).join(' ・ ')
                : 'いま出勤中の人はいません'}
              {' '}／ 今日の出勤 {staff?.today_attendance ?? 0}回
            </span>
          </Card>
        </div>
      </section>

      <section aria-label="開催中" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SectionTitle title="開催中" sub="開催中のものだけが並びます" />
        <div style={grid}>
          <Card
            kicker="Hunting"
            title="ハンティング"
            badge={<Badge>受付中</Badge>}
            actions={<LinkButton href="/admin/hunters" primary>ハンティングを開く</LinkButton>}
          >
            <Big value={hunting?.today_count ?? 0} unit="件" />
            <span className={s.muted}>
              今日の買取 {money(hunting?.today_amount)} ・ 画像の反映待ち {hunting?.pending_images ?? 0}枚
            </span>
          </Card>

          {(events || []).map((event) => {
            const left = event.ends_on ? daysBetween(data.today, event.ends_on) : null
            return (
              <Card
                key={event.id}
                kicker="Event"
                title={event.name}
                badge={<Badge kind="event">{md(event.starts_on)}〜{md(event.ends_on)}</Badge>}
                actions={<LinkButton href="/admin/events" primary>イベントを開く</LinkButton>}
              >
                <Big value={event.issued} unit="枚 発行" />
                <span className={s.muted}>
                  {left === null ? '終了日なし' : left > 0 ? `終了まで あと ${left}日` : left === 0 ? '今日が最終日です' : '終了日を過ぎています'}
                </span>
              </Card>
            )
          })}
        </div>
      </section>
    </>
  )
}
