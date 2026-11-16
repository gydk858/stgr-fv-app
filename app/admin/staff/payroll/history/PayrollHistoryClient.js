'use client'

import s from '@/components/v2/v2.module.css'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { adminGet } from '@/lib/admin-api'

export default function PayrollHistoryClient() {
  const now = new Date()
  const defaultYear = now.getFullYear()
  const defaultMonth = now.getMonth() + 1

  const tableWrapRef = useRef(null)
  const dragStateRef = useRef({
    isDragging: false,
    startX: 0,
    scrollLeft: 0,
  })

  const [isTableDragging, setIsTableDragging] = useState(false)

  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [startYear, setStartYear] = useState(defaultYear)
  const [startMonth, setStartMonth] = useState(defaultMonth)
  const [endYear, setEndYear] = useState(defaultYear)
  const [endMonth, setEndMonth] = useState(defaultMonth)
  const [includeRetired, setIncludeRetired] = useState(false)

  const [rows, setRows] = useState([])

  useEffect(() => {
    fetchHistory()
  }, [])

  const fetchHistory = async (range = {}) => {
    setLoading(true)
    setMessage(initialLoading ? '' : '給与履歴を取得中です...')

    try {
      const { data } = await adminGet('/api/admin-payroll', {
        view: 'history',
        start_year: Number(range.startYear ?? startYear),
        start_month: Number(range.startMonth ?? startMonth),
        end_year: Number(range.endYear ?? endYear),
        end_month: Number(range.endMonth ?? endMonth),
        include_retired: Boolean(includeRetired),
      })

      setRows(data || [])
      setMessage(`給与履歴を取得しました（${(data || []).length}件）`)
    } catch (error) {
      console.error(error)
      setRows([])
      setMessage(
        error instanceof Error
          ? `給与履歴の取得に失敗しました: ${error.message}`
          : '給与履歴の取得に失敗しました'
      )
    } finally {
      setLoading(false)
      setInitialLoading(false)
    }
  }

  const handleMouseDown = (event) => {
    if (!tableWrapRef.current) return

    const target = event.target

    if (
      target?.tagName === 'A' ||
      target?.tagName === 'BUTTON' ||
      target?.tagName === 'INPUT' ||
      target?.tagName === 'SELECT' ||
      target?.tagName === 'TEXTAREA'
    ) {
      return
    }

    dragStateRef.current.isDragging = true
    dragStateRef.current.startX = event.pageX - tableWrapRef.current.offsetLeft
    dragStateRef.current.scrollLeft = tableWrapRef.current.scrollLeft

    setIsTableDragging(true)
  }

  const handleMouseMove = (event) => {
    if (!dragStateRef.current.isDragging || !tableWrapRef.current) return

    event.preventDefault()

    const x = event.pageX - tableWrapRef.current.offsetLeft
    const walk = x - dragStateRef.current.startX

    tableWrapRef.current.scrollLeft = dragStateRef.current.scrollLeft - walk
  }

  const stopDragging = () => {
    dragStateRef.current.isDragging = false
    setIsTableDragging(false)
  }

  const months = useMemo(() => {
    const map = new Map()

    rows.forEach((row) => {
      const key = `${row.target_year}-${String(row.target_month).padStart(2, '0')}`

      if (!map.has(key)) {
        map.set(key, {
          key,
          targetYear: row.target_year,
          targetMonth: row.target_month,
          label: `${row.target_year}年${row.target_month}月`,
        })
      }
    })

    return Array.from(map.values()).sort((a, b) => {
      if (a.targetYear !== b.targetYear) return a.targetYear - b.targetYear
      return a.targetMonth - b.targetMonth
    })
  }, [rows])

  const employeeRows = useMemo(() => {
    const map = new Map()

    rows.forEach((row) => {
      const employeeKey = String(row.user_id)

      if (!map.has(employeeKey)) {
        map.set(employeeKey, {
          userId: row.user_id,
          staffCode: row.staff_code,
          employeeName: row.employee_name,
          employmentStatus: row.employment_status || 'active',
          resignedAt: row.resigned_at,
          employeeNote: row.employee_note,
          cells: {},
          totalAttendance: 0,
          totalCalculatedPay: 0,
          totalTransfer: 0,
          totalAdjustment: 0,
        })
      }

      const employee = map.get(employeeKey)
      const monthKey = `${row.target_year}-${String(row.target_month).padStart(2, '0')}`
      const halfKey =
        row.half_label === '前半'
          ? 'first'
          : row.half_label === '後半'
          ? 'second'
          : String(row.half_sort)

      if (!employee.cells[monthKey]) {
        employee.cells[monthKey] = {}
      }

      employee.cells[monthKey][halfKey] = row
      employee.totalAttendance += Number(row.attendance_count || 0)
      employee.totalCalculatedPay += Number(row.calculated_pay_amount || 0)
      employee.totalTransfer += Number(row.transfer_amount || 0)
      employee.totalAdjustment += Number(row.adjustment_amount || 0)
    })

    return Array.from(map.values()).sort((a, b) => {
      return String(a.staffCode || '').localeCompare(String(b.staffCode || ''), 'ja')
    })
  }, [rows])

  const monthlySummaries = useMemo(() => {
    return months.map((month) => {
      const monthRows = rows.filter(
        (row) =>
          Number(row.target_year) === Number(month.targetYear) &&
          Number(row.target_month) === Number(month.targetMonth)
      )

      const periodMap = new Map()

      monthRows.forEach((row) => {
        const periodKey = String(row.payroll_period_id)

        if (!periodMap.has(periodKey)) {
          periodMap.set(periodKey, {
            payrollPeriodId: row.payroll_period_id,
            halfLabel: row.half_label,
            halfSort: row.half_sort,
            totalPayAmount: Number(row.total_pay_amount || 0),
            totalTransferAmount: Number(row.total_transfer_amount || 0),
            totalAdjustmentAmount: Number(row.total_adjustment_amount || 0),
            previousVaultAfterAmount: Number(row.previous_vault_after_amount || 0),
            ranchProfitAmount: Number(row.ranch_profit_amount || 0),
            vaultBeforeAmount: Number(row.vault_before_amount || 0),
            extraIncomeAmount: Number(row.extra_income_amount || 0),
            vaultPlusRanchAmount: Number(row.vault_plus_ranch_amount || 0),
            vaultAfterAmount: Number(row.vault_after_amount || 0),
            storeProfitAmount: Number(row.store_profit_amount || 0),
            totalProfitAmount: Number(row.total_profit_amount || 0),
          })
        }
      })

      const periods = Array.from(periodMap.values()).sort((a, b) => a.halfSort - b.halfSort)
      const first = periods.find((period) => period.halfLabel === '前半') || null
      const second = periods.find((period) => period.halfLabel === '後半') || null

      return {
        ...month,
        periods,
        first,
        second,
        monthlyTotalPay: periods.reduce((sum, period) => sum + Number(period.totalPayAmount || 0), 0),
        monthlyTotalTransfer: periods.reduce((sum, period) => sum + Number(period.totalTransferAmount || 0), 0),
        monthlyRanchProfit: periods.reduce((sum, period) => sum + Number(period.ranchProfitAmount || 0), 0),
        monthlyExtraIncome: periods.reduce((sum, period) => sum + Number(period.extraIncomeAmount || 0), 0),
        monthlyStoreProfit: periods.reduce((sum, period) => sum + Number(period.storeProfitAmount || 0), 0),
        monthlyTotalProfit: periods.reduce((sum, period) => sum + Number(period.totalProfitAmount || 0), 0),
        lastVaultAfterAmount: periods.length > 0 ? periods[periods.length - 1].vaultAfterAmount : 0,
      }
    })
  }, [months, rows])

  const grandTotals = useMemo(() => {
    return employeeRows.reduce(
      (total, employee) => {
        total.attendance += Number(employee.totalAttendance || 0)
        total.calculatedPay += Number(employee.totalCalculatedPay || 0)
        total.transfer += Number(employee.totalTransfer || 0)
        total.adjustment += Number(employee.totalAdjustment || 0)
        return total
      },
      {
        attendance: 0,
        calculatedPay: 0,
        transfer: 0,
        adjustment: 0,
      }
    )
  }, [employeeRows])

  const storeInfo = rows.length > 0
    ? {
        storeName: rows[0].store_name,
        storeCode: rows[0].store_code,
      }
    : null

  const logout = async () => {
    await fetch('/api/admin-logout', { method: 'POST' })
    window.location.href = '/admin/login'
  }

  const formatMoney = (value) => {
    if (value === null || value === undefined || value === '') return '0'
    return Number(value).toLocaleString()
  }

  const formatDate = (value) => {
    if (!value) return '-'
    return String(value).slice(0, 10)
  }

  const getCell = (employee, monthKey, halfKey) => {
    return employee.cells?.[monthKey]?.[halfKey] || null
  }

  const getMonthSummaryCell = (summary, halfKey, field) => {
    if (halfKey === 'first') {
      return summary.first ? summary.first[field] : 0
    }

    if (halfKey === 'second') {
      return summary.second ? summary.second[field] : 0
    }

    if (halfKey === 'total') {
      if (field === 'totalPayAmount') return summary.monthlyTotalPay
      if (field === 'totalTransferAmount') return summary.monthlyTotalTransfer
      if (field === 'ranchProfitAmount') return summary.monthlyRanchProfit
      if (field === 'extraIncomeAmount') return summary.monthlyExtraIncome
      if (field === 'storeProfitAmount') return summary.monthlyStoreProfit
      if (field === 'totalProfitAmount') return summary.monthlyTotalProfit
      if (field === 'vaultAfterAmount') return summary.lastVaultAfterAmount

      return null
    }

    return 0
  }

  const summaryRows = [
    {
      key: 'totalPayAmount',
      label: '総支払額',
      field: 'totalPayAmount',
      totalMode: 'sum',
    },
    {
      key: 'totalTransferAmount',
      label: '振込額',
      field: 'totalTransferAmount',
      totalMode: 'sum',
    },
    {
      key: 'previousVaultAfterAmount',
      label: '前回支払い後金庫',
      field: 'previousVaultAfterAmount',
      totalMode: 'blank',
    },
    {
      key: 'vaultBeforeAmount',
      label: '支払い前金庫',
      field: 'vaultBeforeAmount',
      totalMode: 'blank',
    },
    {
      key: 'ranchProfitAmount',
      label: '牧場利益',
      field: 'ranchProfitAmount',
      totalMode: 'sum',
    },
    {
      key: 'extraIncomeAmount',
      label: 'その他収入',
      field: 'extraIncomeAmount',
      totalMode: 'sum',
    },
    {
      key: 'vaultAfterAmount',
      label: '支払い後金庫',
      field: 'vaultAfterAmount',
      totalMode: 'last',
    },
    {
      key: 'storeProfitAmount',
      label: '営業利益',
      field: 'storeProfitAmount',
      totalMode: 'sum',
    },
    {
      key: 'totalProfitAmount',
      label: '経常利益',
      field: 'totalProfitAmount',
      totalMode: 'sum',
    },
  ]

  const renderSummaryValue = (summary, halfKey, summaryRow) => {
    if (halfKey === 'total' && summaryRow.totalMode === 'blank') {
      return '-'
    }

    const value = getMonthSummaryCell(summary, halfKey, summaryRow.field)

    if (value === null || value === undefined) {
      return '-'
    }

    return formatMoney(value)
  }

  // ---- 新デザイン（案B）の表示用 ----
  const [expandedMonths, setExpandedMonths] = useState(() => new Set())
  const [staffView, setStaffView] = useState('month') // 'month' | 'half'
  const [showVaultDetail, setShowVaultDetail] = useState(false)

  const monthOptions = useMemo(() => {
    const list = []
    const base = new Date(defaultYear, defaultMonth - 1, 1)
    for (let i = 0; i < 36; i += 1) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
      list.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
    }
    return list.reverse()
  }, [defaultYear, defaultMonth])

  const ymValue = (year, month) => `${Number(year)}-${Number(month)}`
  const splitYm = (value) => value.split('-').map(Number)

  const shiftMonth = (count) => {
    const d = new Date(defaultYear, defaultMonth - 1 - count, 1)
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  }

  const quickRanges = [
    { key: '3', label: '直近3か月', start: shiftMonth(2) },
    { key: '6', label: '直近6か月', start: shiftMonth(5) },
    { key: 'year', label: '今年', start: { year: defaultYear, month: 1 } },
  ]

  const isQuickActive = (range) =>
    Number(startYear) === range.start.year &&
    Number(startMonth) === range.start.month &&
    Number(endYear) === defaultYear &&
    Number(endMonth) === defaultMonth

  const applyQuickRange = (range) => {
    if (loading) return
    setStartYear(range.start.year)
    setStartMonth(range.start.month)
    setEndYear(defaultYear)
    setEndMonth(defaultMonth)
    fetchHistory({
      startYear: range.start.year,
      startMonth: range.start.month,
      endYear: defaultYear,
      endMonth: defaultMonth,
    })
  }

  const halfName = (label) => (label === 'monthly_bonus' ? '月末ボーナス' : label || '-')

  // 月ごとに、どの期間（前半・後半・月末ボーナス）があるか
  const monthHalves = useMemo(() => {
    const map = new Map()
    rows.forEach((row) => {
      const monthKey = `${row.target_year}-${String(row.target_month).padStart(2, '0')}`
      const halfKey =
        row.half_label === '前半' ? 'first' : row.half_label === '後半' ? 'second' : String(row.half_sort)
      if (!map.has(monthKey)) map.set(monthKey, new Map())
      const halves = map.get(monthKey)
      if (!halves.has(halfKey)) {
        halves.set(halfKey, {
          halfKey,
          label: halfName(row.half_label),
          sort: Number(row.half_sort || 0),
          payrollPeriodId: row.payroll_period_id,
          attendance: 0,
        })
      }
      // 月末ボーナスの明細の回数は配分用なので、出勤数には入れない（月次給与の画面と合わせる）
      if (row.half_label !== 'monthly_bonus') {
        halves.get(halfKey).attendance += Number(row.attendance_count || 0)
      }
    })
    const result = {}
    map.forEach((halves, monthKey) => {
      result[monthKey] = Array.from(halves.values()).sort((a, b) => a.sort - b.sort)
    })
    return result
  }, [rows])

  const monthAttendance = (monthKey) =>
    (monthHalves[monthKey] || []).reduce((sum, half) => sum + half.attendance, 0)

  const periodAttendance = (monthKey, payrollPeriodId) =>
    (monthHalves[monthKey] || []).find((half) => String(half.payrollPeriodId) === String(payrollPeriodId))
      ?.attendance || 0

  const periodTotals = useMemo(
    () => ({
      totalPay: monthlySummaries.reduce((sum, m) => sum + Number(m.monthlyTotalPay || 0), 0),
      totalTransfer: monthlySummaries.reduce((sum, m) => sum + Number(m.monthlyTotalTransfer || 0), 0),
      ranchProfit: monthlySummaries.reduce((sum, m) => sum + Number(m.monthlyRanchProfit || 0), 0),
      extraIncome: monthlySummaries.reduce((sum, m) => sum + Number(m.monthlyExtraIncome || 0), 0),
      storeProfit: monthlySummaries.reduce((sum, m) => sum + Number(m.monthlyStoreProfit || 0), 0),
      totalProfit: monthlySummaries.reduce((sum, m) => sum + Number(m.monthlyTotalProfit || 0), 0),
    }),
    [monthlySummaries]
  )

  const monthEndVault = (summary) => {
    const regular = (summary.periods || []).filter((p) => p.halfLabel !== 'monthly_bonus')
    return regular.length > 0 ? regular[regular.length - 1].vaultAfterAmount : summary.lastVaultAfterAmount
  }

  const toggleMonth = (monthKey) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev)
      if (next.has(monthKey)) next.delete(monthKey)
      else next.add(monthKey)
      return next
    })
  }

  const money = (value) => {
    const n = Number(value || 0)
    if (n < 0) return <span style={{ color: '#b8573f' }}>−{Math.abs(n).toLocaleString()}</span>
    return n.toLocaleString()
  }

  const sumCells = (cells) =>
    cells.reduce(
      (total, cell) => {
        if (!cell) return total
        total.has = true
        if (cell.half_label !== 'monthly_bonus') total.attendance += Number(cell.attendance_count || 0)
        total.transfer += Number(cell.transfer_amount || 0)
        total.adjustment += Number(cell.adjustment_amount || 0)
        return total
      },
      { has: false, attendance: 0, transfer: 0, adjustment: 0 }
    )

  const renderStaffCell = (total, strong = false) => {
    if (!total.has || (total.transfer === 0 && total.attendance === 0 && total.adjustment === 0)) {
      return <span style={{ color: '#b9ae9f' }}>−</span>
    }
    return (
      <>
        {strong ? <strong>{money(total.transfer)}</strong> : money(total.transfer)}
        <span className={s.subText}>
          {formatMoney(total.attendance)}回
          {total.adjustment !== 0 && <span style={{ color: '#8a6f45' }}> ・ 調整あり</span>}
        </span>
      </>
    )
  }

  if (initialLoading) {
    return <div className={s.card}><p className={s.muted}>読み込み中です...</p></div>
  }

  const thRight = { textAlign: 'right' }
  const staffColumns =
    staffView === 'month'
      ? months.map((month) => ({ key: month.key, monthKey: month.key, label: `${month.targetMonth}月`, halfKey: null, title: month.label }))
      : months.flatMap((month) =>
          (monthHalves[month.key] || []).map((half) => ({
            key: `${month.key}-${half.halfKey}`,
            monthKey: month.key,
            label: `${month.targetMonth}月 ${half.label}`,
            halfKey: half.halfKey,
          }))
        )
  const stickyHead = { position: 'sticky', left: 0, zIndex: 1, background: '#eef2ea' }
  const stickyCell = { position: 'sticky', left: 0, zIndex: 1, background: '#fffdf9', fontWeight: 500 }

  return (
    <>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className={s.kicker}>Payroll</span>
          <h1 className={s.title}>給与</h1>
        </div>
        <nav className={s.tabs} aria-label="給与の画面">
          <a href="/admin/staff/payroll" className={s.tab}>給与計算</a>
          <a href="/admin/staff/payroll/monthly" className={s.tab}>月次給与</a>
          <a href="/admin/staff/payroll/history" className={`${s.tab} ${s.tabActive}`} aria-current="page">給与履歴</a>
          <a href="/admin/staff/payroll/rate-rules" className={s.tab}>単価ルール</a>
        </nav>
      </header>

      {message && !/取得しました/.test(message) && (
        <div className={s.notice} role="status">
          <span>{message}</span>
          <button type="button" className={s.noticeClose} aria-label="お知らせを閉じる" onClick={() => setMessage('')}>×</button>
        </div>
      )}

      <section className={s.card} aria-label="表示する期間" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16, padding: '18px 22px' }}>
        <label className={s.field}>
          いつから
          <select
            className={s.select}
            value={ymValue(startYear, startMonth)}
            onChange={(e) => {
              const [y, m] = splitYm(e.target.value)
              setStartYear(y)
              setStartMonth(m)
            }}
          >
            {monthOptions.map((o) => (
              <option key={ymValue(o.year, o.month)} value={ymValue(o.year, o.month)}>{o.year}年{o.month}月</option>
            ))}
          </select>
        </label>
        <span style={{ paddingBottom: 10, color: '#6f665c' }}>〜</span>
        <label className={s.field}>
          いつまで
          <select
            className={s.select}
            value={ymValue(endYear, endMonth)}
            onChange={(e) => {
              const [y, m] = splitYm(e.target.value)
              setEndYear(y)
              setEndMonth(m)
            }}
          >
            {monthOptions.map((o) => (
              <option key={ymValue(o.year, o.month)} value={ymValue(o.year, o.month)}>{o.year}年{o.month}月</option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingBottom: 2 }}>
          {quickRanges.map((range) => (
            <button
              key={range.key}
              type="button"
              className={`${s.tab} ${isQuickActive(range) ? s.tabActive : ''}`}
              aria-pressed={isQuickActive(range)}
              onClick={() => applyQuickRange(range)}
              disabled={loading}
              style={{ minHeight: 38, fontSize: 13, border: 0, cursor: 'pointer' }}
            >
              {range.label}
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, paddingBottom: 10, marginLeft: 'auto' }}>
          <input
            type="checkbox"
            checked={includeRetired}
            onChange={(e) => setIncludeRetired(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: '#2f4a3a' }}
          />
          退職した人も表示
        </label>
        <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => fetchHistory()} disabled={loading}>
          {loading ? '取得中...' : '表示する'}
        </button>
      </section>

      <section aria-label="期間の合計" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div className={s.cardDark} style={{ gap: 2, padding: '18px 20px' }}>
          <span style={{ fontSize: 13, color: '#c7d1c4' }}>期間の振込合計</span>
          <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 28, color: '#e4d1a6' }}>{formatMoney(periodTotals.totalTransfer)}</span>
          <span style={{ fontSize: 12, color: '#c7d1c4' }}>うち調整 {formatMoney(monthlySummaries.reduce((sum, m) => sum + (m.periods || []).reduce((a, p) => a + Number(p.totalAdjustmentAmount || 0), 0), 0))}</span>
        </div>
        {[
          ['期間の支給合計', formatMoney(periodTotals.totalPay)],
          ['期間の経常利益', money(periodTotals.totalProfit)],
        ].map(([label, value]) => (
          <div key={label} className={s.card} style={{ gap: 2, padding: '18px 20px' }}>
            <span style={{ fontSize: 13, color: '#6f665c' }}>{label}</span>
            <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 26, color: '#22352b' }}>{value}</span>
          </div>
        ))}
        <div className={s.card} style={{ gap: 2, padding: '18px 20px' }}>
          <span style={{ fontSize: 13, color: '#6f665c' }}>出勤数 ・ 人数</span>
          <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 26, color: '#22352b' }}>
            {formatMoney(Object.keys(monthHalves).reduce((sum, key) => sum + monthAttendance(key), 0))} <span style={{ fontSize: 15 }}>回</span> ・ {employeeRows.length} <span style={{ fontSize: 15 }}>人</span>
          </span>
          <span style={{ fontSize: 12, color: '#6f665c' }}>{includeRetired ? '退職した人を含む' : '在籍中の人のみ'}</span>
        </div>
      </section>

      <section className={s.card} aria-labelledby="history-store">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <h2 id="history-store" className={s.h2}>お店の推移（月ごと）</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6f665c' }}>
            <input type="checkbox" checked={showVaultDetail} onChange={(e) => setShowVaultDetail(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#2f4a3a' }} />
            金庫の内訳とその他収入も表示
          </label>
        </div>
        {monthlySummaries.length === 0 ? (
          <div className={s.empty}>表示できる給与履歴がありません。期間を変えて「表示する」を押してください。</div>
        ) : (
          <>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th scope="col">月</th>
                    <th scope="col" style={thRight}>出勤</th>
                    <th scope="col" style={thRight}>支給</th>
                    <th scope="col" style={thRight}>振込</th>
                    <th scope="col" style={thRight}>牧場利益</th>
                    {showVaultDetail && <th scope="col" style={thRight}>その他収入</th>}
                    <th scope="col" style={thRight}>営業利益</th>
                    <th scope="col" className={s.colStrongHead} style={thRight}>経常利益</th>
                    {showVaultDetail && <th scope="col" style={thRight}>前回支払い後の金庫</th>}
                    {showVaultDetail && <th scope="col" style={thRight}>支払い前の金庫</th>}
                    <th scope="col" style={thRight}>{showVaultDetail ? '支払い後の金庫' : '月末の金庫'}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySummaries.map((summary) => {
                    const open = expandedMonths.has(summary.key)
                    return (
                      <Fragment key={summary.key}>
                        <tr>
                          <th scope="row">
                            <button
                              type="button"
                              onClick={() => toggleMonth(summary.key)}
                              aria-expanded={open}
                              style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 700, color: '#22352b', cursor: 'pointer' }}
                            >
                              {open ? '▾' : '▸'} {summary.label}
                            </button>
                          </th>
                          <td style={thRight}>{formatMoney(monthAttendance(summary.key))}</td>
                          <td style={thRight}>{money(summary.monthlyTotalPay)}</td>
                          <td style={thRight}>{money(summary.monthlyTotalTransfer)}</td>
                          <td style={thRight}>{money(summary.monthlyRanchProfit)}</td>
                          {showVaultDetail && <td style={thRight}>{money(summary.monthlyExtraIncome)}</td>}
                          <td style={thRight}>{money(summary.monthlyStoreProfit)}</td>
                          <td className={s.colStrong} style={thRight}>{money(summary.monthlyTotalProfit)}</td>
                          {showVaultDetail && <td style={{ ...thRight, color: '#b9ae9f' }}>−</td>}
                          {showVaultDetail && <td style={{ ...thRight, color: '#b9ae9f' }}>−</td>}
                          <td style={thRight}>{money(monthEndVault(summary))}</td>
                        </tr>
                        {open &&
                          summary.periods.map((period) => (
                            <tr key={`${summary.key}-${period.payrollPeriodId}`} style={{ background: '#faf6ee', fontSize: 13, color: '#6f665c' }}>
                              <th scope="row" style={{ fontWeight: 500, paddingLeft: 34 }}>{halfName(period.halfLabel)}</th>
                              <td style={thRight}>{formatMoney(periodAttendance(summary.key, period.payrollPeriodId))}</td>
                              <td style={thRight}>{money(period.totalPayAmount)}</td>
                              <td style={thRight}>{money(period.totalTransferAmount)}</td>
                              <td style={thRight}>{money(period.ranchProfitAmount)}</td>
                              {showVaultDetail && <td style={thRight}>{money(period.extraIncomeAmount)}</td>}
                              <td style={thRight}>{money(period.storeProfitAmount)}</td>
                              <td style={thRight}>{money(period.totalProfitAmount)}</td>
                              {showVaultDetail && <td style={thRight}>{money(period.previousVaultAfterAmount)}</td>}
                              {showVaultDetail && <td style={thRight}>{money(period.vaultBeforeAmount)}</td>}
                              <td style={thRight}>{money(period.vaultAfterAmount)}</td>
                            </tr>
                          ))}
                      </Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">期間の合計</th>
                    <td style={thRight}>{formatMoney(Object.keys(monthHalves).reduce((sum, key) => sum + monthAttendance(key), 0))}</td>
                    <td style={thRight}>{money(periodTotals.totalPay)}</td>
                    <td style={thRight}>{money(periodTotals.totalTransfer)}</td>
                    <td style={thRight}>{money(periodTotals.ranchProfit)}</td>
                    {showVaultDetail && <td style={thRight}>{money(periodTotals.extraIncome)}</td>}
                    <td style={thRight}>{money(periodTotals.storeProfit)}</td>
                    <td className={s.colStrongFoot} style={thRight}>{money(periodTotals.totalProfit)}</td>
                    {showVaultDetail && <td style={{ ...thRight, color: '#b9ae9f' }}>−</td>}
                    {showVaultDetail && <td style={{ ...thRight, color: '#b9ae9f' }}>−</td>}
                    <td style={{ ...thRight, color: '#b9ae9f', fontWeight: 400 }}>−</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className={s.muted} style={{ margin: 0, fontSize: 12 }}>
              月の行を押すと、前半・後半（と月末ボーナス）の内訳が開きます。金庫は残高なので、月の行は月末（最後の期間）の値を出し、期間の合計は空けています。
            </p>
          </>
        )}
      </section>

      <section className={s.card} aria-labelledby="history-staff">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <h2 id="history-staff" className={s.h2}>従業員ごとの履歴</h2>
          <div role="group" aria-label="表の細かさ" style={{ display: 'flex', gap: 4, background: '#f4efe6', padding: 4, borderRadius: 999 }}>
            {[
              ['month', '月ごと'],
              ['half', '前半・後半ごと'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={staffView === key}
                onClick={() => setStaffView(key)}
                style={{
                  minHeight: 34,
                  padding: '0 14px',
                  border: 0,
                  borderRadius: 999,
                  fontSize: 13,
                  cursor: 'pointer',
                  background: staffView === key ? '#fffdf9' : 'transparent',
                  color: staffView === key ? '#22352b' : '#6f665c',
                  fontWeight: staffView === key ? 700 : 400,
                  boxShadow: staffView === key ? '0 1px 4px rgba(43,41,37,.12)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {employeeRows.length === 0 ? (
          <div className={s.empty}>表示できる従業員の履歴がありません。</div>
        ) : (
          <>
            <div
              ref={tableWrapRef}
              className={s.tableWrap}
              style={{ cursor: isTableDragging ? 'grabbing' : 'grab', userSelect: isTableDragging ? 'none' : undefined }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={stopDragging}
              onMouseLeave={stopDragging}
            >
              <table className={s.table} style={{ minWidth: Math.max(640, 200 + staffColumns.length * 150) }}>
                <thead>
                  <tr>
                    <th scope="col" style={stickyHead}>従業員</th>
                    {staffColumns.map((col) => (
                      <th key={col.key} scope="col" style={thRight} title={col.title}>{col.label}</th>
                    ))}
                    <th scope="col" className={s.colStrongHead} style={thRight}>期間の合計</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeRows.map((employee) => (
                    <tr key={employee.userId}>
                      <th scope="row" style={stickyCell}>
                        {employee.employeeName || '未登録'}
                        <span className={s.subText}>
                          {employee.staffCode}
                          {employee.employmentStatus === 'retired' && (
                            <span style={{ color: '#8a6f45' }}> ・ 退職{employee.resignedAt ? ` ${formatDate(employee.resignedAt)}` : ''}</span>
                          )}
                        </span>
                      </th>
                      {staffColumns.map((col) => {
                        const cells = col.halfKey
                          ? [getCell(employee, col.monthKey, col.halfKey)]
                          : Object.values(employee.cells?.[col.monthKey] || {})
                        return (
                          <td key={col.key} style={thRight}>{renderStaffCell(sumCells(cells))}</td>
                        )
                      })}
                      <td style={{ ...thRight, background: '#f6f1e6' }}>
                        {renderStaffCell(
                          {
                            has: true,
                            attendance: sumCells(Object.values(employee.cells || {}).flatMap((m) => Object.values(m))).attendance,
                            transfer: employee.totalTransfer,
                            adjustment: employee.totalAdjustment,
                          },
                          true
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={s.muted} style={{ margin: 0, fontSize: 12 }}>
              各マスは「振込（上）・出勤回数（下）」です。調整があったマスには「調整あり」と出ます。表が横に長いときは、ドラッグかスクロールで動かせます（名前の列は固定）。
            </p>
          </>
        )}
      </section>
    </>
  )
}
