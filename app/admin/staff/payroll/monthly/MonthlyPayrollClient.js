'use client'

import s from '@/components/v2/v2.module.css'

import { useEffect, useMemo, useState } from 'react'
import { adminGet } from '@/lib/admin-api'

export default function MonthlyPayrollClient() {
  const now = new Date()

  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [store, setStore] = useState(null)
  const [targetYear, setTargetYear] = useState(now.getFullYear())
  const [targetMonth, setTargetMonth] = useState(now.getMonth() + 1)

  const [periods, setPeriods] = useState([])
  const [runItems, setRunItems] = useState([])
  const [summaries, setSummaries] = useState([])
  const [inputs, setInputs] = useState([])

  const firstPeriod = useMemo(() => {
    return periods.find((period) => isFirstHalf(period.half_type)) || null
  }, [periods])

  const secondPeriod = useMemo(() => {
    return periods.find((period) => isSecondHalf(period.half_type)) || null
  }, [periods])

  const firstSummary = useMemo(() => {
    if (!firstPeriod) return null
    return summaries.find(
      (summary) => Number(summary.payroll_period_id) === Number(firstPeriod.payroll_period_id)
    )
  }, [firstPeriod, summaries])

  const secondSummary = useMemo(() => {
    if (!secondPeriod) return null
    return summaries.find(
      (summary) => Number(summary.payroll_period_id) === Number(secondPeriod.payroll_period_id)
    )
  }, [secondPeriod, summaries])

  const firstInput = useMemo(() => {
    if (!firstPeriod) return null
    return inputs.find(
      (input) => Number(input.payroll_period_id) === Number(firstPeriod.payroll_period_id)
    )
  }, [firstPeriod, inputs])

  const secondInput = useMemo(() => {
    if (!secondPeriod) return null
    return inputs.find(
      (input) => Number(input.payroll_period_id) === Number(secondPeriod.payroll_period_id)
    )
  }, [secondPeriod, inputs])

  const staffRows = useMemo(() => {
    const rowsByKey = {}

    runItems.forEach((item) => {
      const key = item.staff_code || String(item.user_id)

      if (!rowsByKey[key]) {
        rowsByKey[key] = {
          staff_code: item.staff_code,
          display_name: item.display_name,
          user_id: item.user_id,
          first: null,
          second: null,
        }
      }

      if (firstPeriod && Number(item.payroll_period_id) === Number(firstPeriod.payroll_period_id)) {
        rowsByKey[key].first = item
      }

      if (secondPeriod && Number(item.payroll_period_id) === Number(secondPeriod.payroll_period_id)) {
        rowsByKey[key].second = item
      }
    })

    return Object.values(rowsByKey).sort((a, b) => {
      return String(a.staff_code || '').localeCompare(String(b.staff_code || ''))
    })
  }, [runItems, firstPeriod, secondPeriod])

  const monthlyTotals = useMemo(() => {
    const firstPay = Number(firstSummary?.total_pay_amount || 0)
    const secondPay = Number(secondSummary?.total_pay_amount || 0)

    const firstTransfer = Number(firstSummary?.total_transfer_amount || 0)
    const secondTransfer = Number(secondSummary?.total_transfer_amount || 0)

    const firstAttendance = runItems
      .filter((item) => firstPeriod && Number(item.payroll_period_id) === Number(firstPeriod.payroll_period_id))
      .reduce((sum, item) => sum + Number(item.attendance_count || 0), 0)

    const secondAttendance = runItems
      .filter((item) => secondPeriod && Number(item.payroll_period_id) === Number(secondPeriod.payroll_period_id))
      .reduce((sum, item) => sum + Number(item.attendance_count || 0), 0)

    const firstProfit = Number(firstSummary?.total_profit_amount || 0)
    const secondProfit = Number(secondSummary?.total_profit_amount || 0)

    return {
      totalPay: firstPay + secondPay,
      totalTransfer: firstTransfer + secondTransfer,
      totalAttendance: firstAttendance + secondAttendance,
      totalProfit: firstProfit + secondProfit,
    }
  }, [firstSummary, secondSummary, firstPeriod, secondPeriod, runItems])

  useEffect(() => {
    initialize()
  }, [])

  const initialize = async () => {
    setInitialLoading(true)
    setMessage('')

    try {
      // 店舗は月次給与の API が返す（サーバーが current_store_code から決める）。
      await fetchMonthlyPayroll(undefined, targetYear, targetMonth)
    } catch (error) {
      console.error(error)
      setMessage(`初期表示に失敗しました: ${error.message}`)
    } finally {
      setInitialLoading(false)
    }
  }

  // 第1引数（店舗ID）は互換のために残している。店舗はサーバーが決める。
  const fetchMonthlyPayroll = async (
    _storeId,
    year = targetYear,
    month = targetMonth
  ) => {
    setLoading(true)
    setMessage('月次給与一覧を取得中です...')

    try {
      const {
        store: storeData,
        periods: periodRows,
        run_items: itemRows,
        summaries: summaryRows,
        inputs: inputRows,
      } = await adminGet('/api/admin-payroll', {
        view: 'monthly',
        year: Number(year),
        month: Number(month),
      })

      if (storeData) setStore(storeData)
      const nextPeriods = periodRows || []
      setPeriods(nextPeriods)

      if (nextPeriods.length === 0) {
        setRunItems([])
        setSummaries([])
        setInputs([])
        setMessage('この年月の給与期間はまだありません。給与管理画面で給与期間を作成してください。')
        return
      }

      setRunItems(itemRows || [])
      setSummaries(deduplicateByPeriodId(summaryRows || []))
      setInputs(deduplicateByPeriodId(inputRows || []))
      setMessage(`${year}年${month}月の月次給与一覧を取得しました。`)
    } catch (error) {
      console.error(error)
      setMessage(`月次給与一覧の取得に失敗しました: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const deduplicateByPeriodId = (rows) => {
    const map = {}

    rows.forEach((row) => {
      const key = String(row.payroll_period_id)
      if (!map[key]) {
        map[key] = row
      }
    })

    return Object.values(map)
  }

  const reloadMonthlyPayroll = async () => {
    if (!store?.store_id) {
      setMessage('店舗情報が取得できていません')
      return
    }

    await fetchMonthlyPayroll(store.store_id, targetYear, targetMonth)
  }

  const logout = async () => {
    await fetch('/api/admin-logout', { method: 'POST' })
    window.location.href = '/admin/login'
  }

  const formatDate = (value) => {
    if (!value) return '-'
    return String(value).slice(0, 10)
  }

  const formatMoney = (value) => {
    if (value === null || value === undefined || value === '') return '-'
    return Number(value).toLocaleString()
  }

  const getPeriodTypeLabel = (halfType) => {
    if (isFirstHalf(halfType)) return '前半'
    if (isSecondHalf(halfType)) return '後半'
    return halfType || '-'
  }

  function isFirstHalf(halfType) {
    return ['first_half', 'first', '1', '前半'].includes(String(halfType))
  }

  function isSecondHalf(halfType) {
    return ['second_half', 'second', '2', '後半'].includes(String(halfType))
  }

  const getPeriodTitle = (period) => {
    if (!period) return '-'
    return `${getPeriodTypeLabel(period.half_type)} / ${formatDate(period.period_start)} ～ ${formatDate(period.period_end)}`
  }

  const getItemValue = (item, key) => {
    if (!item) return '-'
    return item[key] ?? '-'
  }

  const getItemMoney = (item, key) => {
    if (!item) return '-'
    return formatMoney(item[key])
  }

  // 月の切り替え（‹ ›）
  const moveMonth = async (delta) => {
    if (loading) return
    const base = new Date(Number(targetYear), Number(targetMonth) - 1 + delta, 1)
    const year = base.getFullYear()
    const month = base.getMonth() + 1
    setTargetYear(year)
    setTargetMonth(month)
    await fetchMonthlyPayroll(undefined, year, month)
  }

  const statusLabel = (period) => (period?.status === 'locked' ? '確定済み' : period ? '編集中' : '未作成')
  const amount = (summary, key) => (summary ? formatMoney(summary[key]) : '-')
  const sumOf = (key) =>
    firstSummary || secondSummary
      ? formatMoney(Number(firstSummary?.[key] || 0) + Number(secondSummary?.[key] || 0))
      : '-'

  if (initialLoading) {
    return <div className={s.card}><p className={s.muted}>読み込み中です...</p></div>
  }

  const firstColor = { background: '#eef2ea', color: '#2f4a3a' }
  const secondColor = { background: '#f4ede0', color: '#6a4a12' }
  const totalColor = { background: '#22352b', color: '#f4efe6' }
  const groupEdge = { borderLeft: '2px solid #fffdf9' }
  const cellEdge = { borderLeft: '2px solid #f4efe6' }

  return (
    <>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className={s.kicker}>Payroll</span>
          <h1 className={s.title}>給与</h1>
        </div>
        <nav className={s.tabs} aria-label="給与の画面">
          <a href="/admin/staff/payroll" className={s.tab}>給与計算</a>
          <a href="/admin/staff/payroll/monthly" className={`${s.tab} ${s.tabActive}`} aria-current="page">月次給与</a>
          <a href="/admin/staff/payroll/history" className={s.tab}>給与履歴</a>
          <a href="/admin/staff/payroll/rate-rules" className={s.tab}>単価ルール</a>
        </nav>
      </header>

      {message && !/取得しました/.test(message) && (
        <div className={s.notice} role="status">
          <span>{message}</span>
          <button type="button" className={s.noticeClose} aria-label="お知らせを閉じる" onClick={() => setMessage('')}>×</button>
        </div>
      )}

      <section className={s.card} aria-label="対象の月" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" className={s.iconBtn} aria-label="前の月" onClick={() => moveMonth(-1)} disabled={loading}>‹</button>
          <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 22, color: '#22352b', padding: '0 8px' }}>
            {targetYear}年{targetMonth}月
          </span>
          <button type="button" className={s.iconBtn} aria-label="次の月" onClick={() => moveMonth(1)} disabled={loading}>›</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 13 }}>
          {[['前半', firstPeriod], ['後半', secondPeriod]].map(([label, period]) => (
            <span key={label} className={`${s.pill} ${period?.status === 'locked' ? s.pillLocked : s.pillOpen}`} style={{ fontWeight: 500 }}>
              {label}：{statusLabel(period)}{period ? ` ・ 支払日 ${formatDate(period.payday)}` : ''}
            </span>
          ))}
          <button type="button" className={`${s.btn} ${s.btnSmall}`} onClick={reloadMonthlyPayroll} disabled={loading}>
            {loading ? '取得中...' : '再読み込み'}
          </button>
        </div>
      </section>

      <section aria-label="月の合計" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div className={s.cardDark} style={{ gap: 2, padding: '18px 20px' }}>
          <span style={{ fontSize: 13, color: '#c7d1c4' }}>月の振込合計</span>
          <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 28, color: '#e4d1a6' }}>{formatMoney(monthlyTotals.totalTransfer)}</span>
          <span style={{ fontSize: 12, color: '#c7d1c4' }}>前半 {amount(firstSummary, 'total_transfer_amount')} ＋ 後半 {amount(secondSummary, 'total_transfer_amount')}</span>
        </div>
        {[
          ['月の支給合計', formatMoney(monthlyTotals.totalPay), ''],
          ['月の経常利益', formatMoney(monthlyTotals.totalProfit), ''],
          ['月の出勤数', monthlyTotals.totalAttendance, '回'],
        ].map(([label, value, unit]) => (
          <div key={label} className={s.card} style={{ gap: 2, padding: '18px 20px' }}>
            <span style={{ fontSize: 13, color: '#6f665c' }}>{label}</span>
            <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 26, color: '#22352b' }}>
              {value}{unit && <span style={{ fontSize: 15 }}> {unit}</span>}
            </span>
          </div>
        ))}
      </section>

      <section className={s.card} aria-labelledby="monthly-staff">
        <h2 id="monthly-staff" className={s.h2}>従業員ごとの前半・後半</h2>
        {staffRows.length === 0 ? (
          <div className={s.empty}>この月の明細はまだありません。給与計算の画面で、前半・後半の明細を作ってください。</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table} style={{ minWidth: 960 }}>
              <thead>
                <tr>
                  <th scope="col" rowSpan={2} style={firstColor}>従業員</th>
                  <th scope="colgroup" colSpan={4} style={{ ...firstColor, ...groupEdge, textAlign: 'center' }}>前半</th>
                  <th scope="colgroup" colSpan={4} style={{ ...secondColor, ...groupEdge, textAlign: 'center' }}>後半</th>
                  <th scope="colgroup" colSpan={2} style={{ ...totalColor, ...groupEdge, textAlign: 'center' }}>月の合計</th>
                </tr>
                <tr style={{ fontSize: 13 }}>
                  <th scope="col" style={{ ...firstColor, ...groupEdge }}>出勤</th>
                  <th scope="col" style={firstColor}>単価</th>
                  <th scope="col" style={firstColor}>支給</th>
                  <th scope="col" style={firstColor}>振込</th>
                  <th scope="col" style={{ ...secondColor, ...groupEdge }}>出勤</th>
                  <th scope="col" style={secondColor}>単価</th>
                  <th scope="col" style={secondColor}>支給</th>
                  <th scope="col" style={secondColor}>振込</th>
                  <th scope="col" style={{ ...totalColor, ...groupEdge }}>支給</th>
                  <th scope="col" style={totalColor}>振込</th>
                </tr>
              </thead>
              <tbody>
                {staffRows.map((row) => {
                  const monthlyPay = Number(row.first?.calculated_pay_amount || 0) + Number(row.second?.calculated_pay_amount || 0)
                  const monthlyTransfer = Number(row.first?.transfer_amount || 0) + Number(row.second?.transfer_amount || 0)
                  return (
                    <tr key={`${row.staff_code}-${row.user_id}`}>
                      <th scope="row" style={{ fontWeight: 500 }}>
                        {row.display_name}
                        <span className={s.subText}>
                          {row.staff_code} ・ スタンプ 前半 {getItemValue(row.first, 'stamp_count_at_close')}／後半 {getItemValue(row.second, 'stamp_count_at_close')}
                        </span>
                      </th>
                      <td style={cellEdge}>{getItemValue(row.first, 'attendance_count')}</td>
                      <td>{getItemMoney(row.first, 'applied_unit_pay')}</td>
                      <td>{getItemMoney(row.first, 'calculated_pay_amount')}</td>
                      <td>{getItemMoney(row.first, 'transfer_amount')}</td>
                      <td style={cellEdge}>{getItemValue(row.second, 'attendance_count')}</td>
                      <td>{getItemMoney(row.second, 'applied_unit_pay')}</td>
                      <td>{getItemMoney(row.second, 'calculated_pay_amount')}</td>
                      <td>{getItemMoney(row.second, 'transfer_amount')}</td>
                      <td style={{ ...cellEdge, background: '#f6f1e6' }}>{formatMoney(monthlyPay)}</td>
                      <td className={s.colStrong}>{formatMoney(monthlyTransfer)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section className={s.card} aria-labelledby="monthly-money" style={{ flex: '999 1 520px', minWidth: 0 }}>
          <h2 id="monthly-money" className={s.h2}>お金の動き（前半・後半・月の合計）</h2>
          {[
            [
              null,
              [
                ['支給合計', 'total_pay_amount'],
                ['振込合計', 'total_transfer_amount'],
                ['調整合計', 'total_adjustment_amount'],
                ['牧場利益', 'ranch_profit_amount'],
                ['営業利益', 'store_profit_amount'],
                ['経常利益', 'total_profit_amount'],
              ],
            ],
            [
              '金庫の数字も見る（支払い前金庫額・金庫＋牧場・支払い後の金庫）',
              [
                ['支払い前金庫額', 'vault_before_amount'],
                ['金庫＋牧場', 'vault_plus_ranch_amount'],
                ['支払い後の金庫', 'vault_after_amount'],
              ],
            ],
          ].map(([summaryLabel, rows]) => {
            const table = (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th scope="col">項目</th>
                      <th scope="col">前半</th>
                      <th scope="col">後半</th>
                      <th scope="col" className={s.colStrongHead}>月の合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([label, key]) => (
                      <tr key={key}>
                        <th scope="row" style={{ fontWeight: 500 }}>{label}</th>
                        <td>{amount(firstSummary, key)}</td>
                        <td>{amount(secondSummary, key)}</td>
                        <td style={{ background: '#f6f1e6', fontWeight: 700 }}>{sumOf(key)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
            return summaryLabel ? (
              <details key={summaryLabel}>
                <summary style={{ cursor: 'pointer', fontSize: 13, color: '#6f665c', marginBottom: 8 }}>{summaryLabel}</summary>
                {table}
              </details>
            ) : (
              <div key="main">{table}</div>
            )
          })}
        </section>

        <section className={s.card} aria-labelledby="monthly-memo" style={{ flex: '1 1 300px', minWidth: 0, gap: 12 }}>
          <h2 id="monthly-memo" className={s.h2}>備考</h2>
          <div style={{ padding: '12px 14px', background: '#eef2ea', borderRadius: 12 }}>
            <span style={{ display: 'block', fontSize: 12, color: '#34503a', fontWeight: 700 }}>前半</span>
            <span style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{firstInput?.memo || firstSummary?.memo || 'なし'}</span>
          </div>
          <div style={{ padding: '12px 14px', background: '#f4ede0', borderRadius: 12 }}>
            <span style={{ display: 'block', fontSize: 12, color: '#6a4a12', fontWeight: 700 }}>後半</span>
            <span style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{secondInput?.memo || secondSummary?.memo || 'なし'}</span>
          </div>
          <a href="/admin/staff/payroll" style={{ fontSize: 14, fontWeight: 700 }}>給与計算を開く</a>
        </section>
      </div>
    </>
  )
}
