'use client'

import s from '@/components/v2/v2.module.css'

import { useEffect, useMemo, useState } from 'react'
import { adminGet, adminPost } from '@/lib/admin-api'

const DEFAULT_UNIT_CARE_PAY = 3000000

function getLastDay(year, month) {
  return new Date(Number(year), Number(month), 0).getDate()
}

function getDateString(year, month, day) {
  const y = Number(year)
  const m = String(Number(month)).padStart(2, '0')
  const d = String(Number(day)).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function normalizeDateString(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function getPeriodTypeLabel(halfType) {
  if (halfType === 'first_half') return '前半'
  if (halfType === 'second_half') return '後半'
  if (halfType === 'first') return '前半'
  if (halfType === 'second') return '後半'
  if (halfType === '1') return '前半'
  if (halfType === '2') return '後半'
  if (halfType === '前半') return '前半'
  if (halfType === '後半') return '後半'
  if (halfType === 'monthly_bonus') return '月末ボーナス'
  return halfType || '-'
}

export default function RanchClient() {
  const now = new Date()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [store, setStore] = useState(null)
  const [targetYear, setTargetYear] = useState(now.getFullYear())
  const [targetMonth, setTargetMonth] = useState(now.getMonth() + 1)

  const [employees, setEmployees] = useState([])
  const [unitCarePay, setUnitCarePay] = useState(String(DEFAULT_UNIT_CARE_PAY))
  const [settingMemo, setSettingMemo] = useState('')

  const [careEvents, setCareEvents] = useState([])
  const [profitEntries, setProfitEntries] = useState([])
  const [summary, setSummary] = useState(null)
  const [payrollPeriods, setPayrollPeriods] = useState([])

  const [newProfitDate, setNewProfitDate] = useState('')
  const [newProfitAmount, setNewProfitAmount] = useState('')
  // 牧場利益の「直す」中の行と、やめたときに戻す元の値
  const [editingProfitId, setEditingProfitId] = useState(null)
  const [profitBackup, setProfitBackup] = useState(null)

  useEffect(() => {
    initialize()
  }, [])

  const initialize = async () => {
    setLoading(true)
    setMessage('')

    try {
      // 店舗は /api/admin-ranch がサーバー側で決めて返す
      await loadAll(undefined, targetYear, targetMonth)
    } catch (error) {
      console.error(error)
      setMessage(
        error instanceof Error
          ? `初期表示に失敗しました: ${error.message}`
          : '初期表示に失敗しました'
      )
    } finally {
      setLoading(false)
    }
  }

  // 月の画面データ一式を /api/admin-ranch から取得する（店舗の確認はサーバー側）
  const fetchMonthData = async (year = targetYear, month = targetMonth) => {
    const data = await adminGet('/api/admin-ranch', {
      view: 'month',
      year: Number(year),
      month: Number(month),
    })
    if (data.store) setStore(data.store)
    return data
  }

  const applyEmployees = (data) => {
    setEmployees(data.employees || [])
    return data.employees || []
  }

  const applyMonthSetting = (data) => {
    const setting = data.month_setting
    if (setting) {
      setUnitCarePay(String(setting.unit_care_pay ?? DEFAULT_UNIT_CARE_PAY))
      setSettingMemo(setting.memo || '')
    } else {
      setUnitCarePay(String(DEFAULT_UNIT_CARE_PAY))
      setSettingMemo('')
    }
    return setting
  }

  const applyCareEvents = (data) => {
    const normalizedRows = (data.care_events || []).map((row) => ({
      ...row,
      care_date: normalizeDateString(row.care_date),
    }))
    setCareEvents(normalizedRows)
    return normalizedRows
  }

  const applyProfitEntries = (data) => {
    setProfitEntries(data.profit_entries || [])
    return data.profit_entries || []
  }

  const applySummary = (data) => {
    setSummary(data.summary || null)
    return data.summary || null
  }

  const applyPayrollPeriods = (data) => {
    setPayrollPeriods(data.payroll_periods || [])
    return data.payroll_periods || []
  }

  // 第1引数（店舗ID）は互換のために残している。店舗はサーバーが決める。
  const loadAll = async (_storeId, year = targetYear, month = targetMonth) => {
    const data = await fetchMonthData(year, month)
    applyEmployees(data)
    applyMonthSetting(data)
    applyCareEvents(data)
    applyProfitEntries(data)
    applySummary(data)
    applyPayrollPeriods(data)
    // 追加する日付は、表示中の月が今月なら今日、それ以外はその月の1日
    const today = new Date()
    const isThisMonth = Number(year) === today.getFullYear() && Number(month) === today.getMonth() + 1
    setNewProfitDate(getDateString(year, month, isThisMonth ? today.getDate() : 1))
  }

  // 保存後の再取得用（必要な部分だけを画面に反映する）
  const fetchEmployees = async () => applyEmployees(await fetchMonthData())
  const fetchCareEvents = async (_storeId, year, month) => applyCareEvents(await fetchMonthData(year, month))
  const fetchProfitEntries = async (_storeId, year, month) => applyProfitEntries(await fetchMonthData(year, month))
  const fetchSummary = async (_storeId, year, month) => applySummary(await fetchMonthData(year, month))
  const fetchPayrollPeriods = async (_storeId, year, month) => applyPayrollPeriods(await fetchMonthData(year, month))

  const reload = async () => {
    if (!store?.store_id) return

    setLoading(true)
    setMessage('再読み込み中です...')

    try {
      await loadAll(store.store_id, targetYear, targetMonth)
      setMessage('牧場管理データを再読み込みしました')
    } catch (error) {
      console.error(error)
      setMessage(
        error instanceof Error
          ? `再読み込みに失敗しました: ${error.message}`
          : '再読み込みに失敗しました'
      )
    } finally {
      setLoading(false)
    }
  }

  const saveMonthSetting = async () => {
    if (!store?.store_id) {
      setMessage('店舗情報が取得できていません')
      return
    }

    setSaving(true)
    setMessage('お世話単価を保存中です...')

    try {
      await adminPost('/api/admin-ranch', {
        action: 'save_setting',
        year: Number(targetYear),
        month: Number(targetMonth),
        unit_care_pay: toAmountNumber(unitCarePay),
        memo: settingMemo.trim() === '' ? null : settingMemo.trim(),
      })

      await loadAll(store.store_id, targetYear, targetMonth)
      setMessage('お世話単価を保存しました')
    } catch (error) {
      console.error(error)
      setMessage(
        error instanceof Error
          ? `お世話単価の保存に失敗しました: ${error.message}`
          : 'お世話単価の保存に失敗しました'
      )
    } finally {
      setSaving(false)
    }
  }

  const careMap = useMemo(() => {
    const map = {}

    careEvents.forEach((event) => {
      const normalizedDate = normalizeDateString(event.care_date)
      map[`${event.user_id}_${normalizedDate}`] = Number(event.care_count || 0)
    })

    return map
  }, [careEvents])

  const visibleEmployees = useMemo(() => {
    return employees.filter((employee) => employee.ranch_visible !== false)
  }, [employees])

  const hiddenEmployees = useMemo(() => {
    return employees.filter((employee) => employee.ranch_visible === false)
  }, [employees])

  const firstHalfDays = useMemo(() => {
    return Array.from({ length: 15 }, (_, index) => index + 1)
  }, [])

  const secondHalfDays = useMemo(() => {
    const lastDay = getLastDay(targetYear, targetMonth)
    return Array.from({ length: lastDay - 15 }, (_, index) => index + 16)
  }, [targetYear, targetMonth])

  const getCareCount = (userId, dateString) => {
    const normalizedDate = normalizeDateString(dateString)
    return careMap[`${userId}_${normalizedDate}`] || 0
  }

  const getEmployeeHalfCount = (employee, days) => {
    return days.reduce((sum, day) => {
      const dateString = getDateString(targetYear, targetMonth, day)
      return sum + getCareCount(employee.user_id, dateString)
    }, 0)
  }

  const toggleCare = async (employee, dateString) => {
    if (!store?.store_id) return

    const normalizedDate = normalizeDateString(dateString)
    const currentCount = getCareCount(employee.user_id, normalizedDate)
    const nextCount = currentCount > 0 ? 0 : 1

    const targetYearNumber = Number(normalizedDate.slice(0, 4))
    const targetMonthNumber = Number(normalizedDate.slice(5, 7))

    const previousEvents = careEvents

    setSaving(true)
    setMessage(`${employee.staff_code} / ${formatDateShort(normalizedDate)} を更新中です...`)

    try {
      setCareEvents((prev) => {
        const filtered = prev.filter((event) => {
          return !(
            Number(event.store_id) === Number(store.store_id) &&
            Number(event.user_id) === Number(employee.user_id) &&
            normalizeDateString(event.care_date) === normalizedDate
          )
        })

        if (nextCount <= 0) {
          return filtered
        }

        return [
          ...filtered,
          {
            ranch_care_event_id: `temp_${employee.user_id}_${normalizedDate}`,
            store_id: Number(store.store_id),
            user_id: Number(employee.user_id),
            target_year: targetYearNumber,
            target_month: targetMonthNumber,
            care_date: normalizedDate,
            care_count: nextCount,
            note: null,
            acted_by: 'admin_ranch_ui',
          },
        ]
      })

      // 現在の店舗の在籍中の従業員かは、サーバーが確認してから保存・削除する
      await adminPost('/api/admin-ranch', {
        action: 'set_care',
        user_id: Number(employee.user_id),
        care_date: normalizedDate,
        on: nextCount > 0,
      })

      const nextEvents = await fetchCareEvents(
        store.store_id,
        targetYear,
        targetMonth
      )

      setCareEvents(nextEvents)
      await fetchSummary(store.store_id, targetYear, targetMonth)

      setMessage(`${employee.staff_code} / ${formatDateShort(normalizedDate)} を更新しました`)
    } catch (error) {
      console.error(error)
      setCareEvents(previousEvents)
      setMessage(
        error instanceof Error
          ? `お世話記録の更新に失敗しました: ${error.message}`
          : 'お世話記録の更新に失敗しました'
      )
    } finally {
      setSaving(false)
    }
  }

  const toggleRanchVisible = async (employee) => {
    const nextVisible = employee.ranch_visible === false

    setSaving(true)
    setMessage(`${employee.staff_code} の表示設定を更新中です...`)

    try {
      await adminPost('/api/admin-ranch', {
        action: 'set_visible',
        user_id: Number(employee.user_id),
        visible: nextVisible,
      })

      await fetchEmployees(store.store_id)

      setMessage(
        nextVisible
          ? `${employee.staff_code} を牧場管理に表示しました`
          : `${employee.staff_code} を牧場管理で非表示にしました`
      )
    } catch (error) {
      console.error(error)
      setMessage(
        error instanceof Error
          ? `表示設定の更新に失敗しました: ${error.message}`
          : '表示設定の更新に失敗しました'
      )
    } finally {
      setSaving(false)
    }
  }

  const addProfitEntry = async () => {
    if (!store?.store_id) {
      setMessage('店舗情報が取得できていません')
      return
    }

    if (!newProfitDate) {
      setMessage('利益日付を入力してください')
      return
    }

    setSaving(true)
    setMessage('牧場利益を追加中です...')

    try {
      await adminPost('/api/admin-ranch', {
        action: 'add_profit',
        profit_date: newProfitDate,
        profit_amount: toAmountNumber(newProfitAmount),
      })

      setNewProfitAmount('')

      await fetchProfitEntries(store.store_id, targetYear, targetMonth)
      await fetchSummary(store.store_id, targetYear, targetMonth)

      setMessage('牧場利益を追加しました')
    } catch (error) {
      console.error(error)
      setMessage(
        error instanceof Error
          ? `牧場利益の追加に失敗しました: ${error.message}`
          : '牧場利益の追加に失敗しました'
      )
    } finally {
      setSaving(false)
    }
  }

  const updateProfitEntry = async (entry, field, value) => {
    const nextEntry = {
      ...entry,
      [field]: value,
    }

    setProfitEntries((prev) =>
      prev.map((item) =>
        item.ranch_profit_entry_id === entry.ranch_profit_entry_id
          ? nextEntry
          : item
      )
    )
  }

  const saveProfitEntry = async (entry) => {
    setSaving(true)
    setMessage('牧場利益を保存中です...')

    try {
      await adminPost('/api/admin-ranch', {
        action: 'update_profit',
        ranch_profit_entry_id: Number(entry.ranch_profit_entry_id),
        profit_date: normalizeDateString(entry.profit_date),
        profit_amount: toAmountNumber(entry.profit_amount),
      })

      await fetchProfitEntries(store.store_id, targetYear, targetMonth)
      await fetchSummary(store.store_id, targetYear, targetMonth)

      setMessage('牧場利益を保存しました')
    } catch (error) {
      console.error(error)
      setMessage(
        error instanceof Error
          ? `牧場利益の保存に失敗しました: ${error.message}`
          : '牧場利益の保存に失敗しました'
      )
    } finally {
      setSaving(false)
    }
  }

  const deleteProfitEntry = async (entry) => {
    const ok = window.confirm(
      [
        'この牧場利益入力を削除しますか？',
        '',
        `日付: ${formatDateShort(entry.profit_date)}`,
        `金額: ${formatMoney(entry.profit_amount)}`,
      ].join('\n')
    )

    if (!ok) return

    setSaving(true)
    setMessage('牧場利益を削除中です...')

    try {
      await adminPost('/api/admin-ranch', {
        action: 'delete_profit',
        ranch_profit_entry_id: Number(entry.ranch_profit_entry_id),
      })

      await fetchProfitEntries(store.store_id, targetYear, targetMonth)
      await fetchSummary(store.store_id, targetYear, targetMonth)

      setMessage('牧場利益を削除しました')
    } catch (error) {
      console.error(error)
      setMessage(
        error instanceof Error
          ? `牧場利益の削除に失敗しました: ${error.message}`
          : '牧場利益の削除に失敗しました'
      )
    } finally {
      setSaving(false)
    }
  }

  const applyToPayroll = async (period) => {
    const ok = window.confirm(
      [
        'この給与期間へ牧場利益を反映しますか？',
        '',
        `${getPeriodTypeLabel(period.half_type)}: ${formatDate(period.period_start)} ～ ${formatDate(period.period_end)}`,
        '',
        'この期間内の牧場利益入力を合計し、給与管理の牧場利益に保存します。',
      ].join('\n')
    )

    if (!ok) return

    setSaving(true)
    setMessage('給与管理へ牧場利益を反映中です...')

    try {
      // 現在の店舗の給与期間かは、サーバーが確認してから反映する
      const { data } = await adminPost('/api/admin-ranch', {
        action: 'apply_payroll',
        payroll_period_id: Number(period.payroll_period_id),
      })

      const result = Array.isArray(data) && data.length > 0 ? data[0] : null

      await fetchPayrollPeriods(store.store_id, targetYear, targetMonth)

      setMessage(
        result
          ? `給与管理へ反映しました（牧場利益 ${formatMoney(result.ranch_profit_amount)}）`
          : '給与管理へ反映しました'
      )
    } catch (error) {
      console.error(error)
      setMessage(
        error instanceof Error
          ? `給与管理への反映に失敗しました: ${error.message}`
          : '給与管理への反映に失敗しました'
      )
    } finally {
      setSaving(false)
    }
  }

  const firstHalfProfitEntries = profitEntries.filter((entry) => {
    const day = Number(normalizeDateString(entry.profit_date).slice(8, 10))
    return day >= 1 && day <= 15
  })

  const secondHalfProfitEntries = profitEntries.filter((entry) => {
    const day = Number(normalizeDateString(entry.profit_date).slice(8, 10))
    return day >= 16
  })

  const logout = async () => {
    await fetch('/api/admin-logout', { method: 'POST' })
    window.location.href = '/admin/login'
  }

  const handleAmountInput = (setter) => (event) => {
    setter(
      String(event.target.value || '')
        .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
        .replace(/,/g, '')
        .replace(/[^\d-]/g, '')
    )
  }

  const toAmountNumber = (value) => {
    const normalized = String(value ?? '')
      .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
      .replace(/,/g, '')
      .replace(/[^\d-]/g, '')

    if (normalized === '' || normalized === '-') return 0
    return Number(normalized)
  }

  const formatMoney = (value) => {
    if (value === null || value === undefined || value === '') return '0'
    return Number(value).toLocaleString()
  }

  const formatDate = (value) => {
    if (!value) return '-'
    return normalizeDateString(value)
  }

  const formatDateShort = (value) => {
    if (!value) return '-'
    const text = normalizeDateString(value)
    return `${Number(text.slice(5, 7))}/${Number(text.slice(8, 10))}`
  }

  // ---- 新デザイン（案B）の表示用 ----
  const todayString = (() => {
    const d = new Date()
    return getDateString(d.getFullYear(), d.getMonth() + 1, d.getDate())
  })()

  const allDays = [...firstHalfDays, ...secondHalfDays]
  const weekdayNames = ['日', '月', '火', '水', '木', '金', '土']

  // 月の切り替え（‹ ›）
  const moveMonth = async (delta) => {
    if (saving) return
    const base = new Date(Number(targetYear), Number(targetMonth) - 1 + delta, 1)
    const year = base.getFullYear()
    const month = base.getMonth() + 1
    setSaving(true)
    setMessage('')
    setEditingProfitId(null)
    try {
      setTargetYear(year)
      setTargetMonth(month)
      await loadAll(undefined, year, month)
    } catch (error) {
      console.error(error)
      setMessage(error instanceof Error ? `読み込みに失敗しました: ${error.message}` : '読み込みに失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 牧場利益の「直す」
  const startEditProfit = (entry) => {
    setEditingProfitId(entry.ranch_profit_entry_id)
    setProfitBackup(entry)
  }

  const cancelEditProfit = () => {
    if (profitBackup) {
      setProfitEntries((prev) =>
        prev.map((item) => (item.ranch_profit_entry_id === profitBackup.ranch_profit_entry_id ? profitBackup : item))
      )
    }
    setEditingProfitId(null)
    setProfitBackup(null)
  }

  const finishEditProfit = async (entry) => {
    await saveProfitEntry(entry)
    setEditingProfitId(null)
    setProfitBackup(null)
  }

  const showAmount = (value) => {
    const text = String(value ?? '')
    if (text === '' || text === '-') return text
    const n = Number(text)
    return Number.isFinite(n) ? n.toLocaleString() : text
  }

  const sumProfit = (entries) => entries.reduce((sum, entry) => sum + Number(entry.profit_amount || 0), 0)

  const profitInRange = (start, end) => {
    const from = normalizeDateString(start)
    const to = normalizeDateString(end)
    return profitEntries
      .filter((entry) => {
        const d = normalizeDateString(entry.profit_date)
        return d >= from && d <= to
      })
      .reduce((sum, entry) => sum + Number(entry.profit_amount || 0), 0)
  }

  const unitPayNumber = toAmountNumber(unitCarePay)

  if (loading) {
    return <div className={s.card}><p className={s.muted}>読み込み中です...</p></div>
  }

  const isError = /失敗|入力してください|取得できていません/.test(message)
  const kpiValue = { fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 26, color: '#22352b' }
  const halfEdge = { borderLeft: '3px solid #dcc79e' }

  const renderProfitList = (label, color, entries) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontWeight: 700, color }}>{label}</span>
        <span className={s.muted}>
          {entries.length}件 ・ 合計 <strong style={{ color: '#22352b', fontSize: 15 }}>{formatMoney(sumProfit(entries))}</strong>
        </span>
      </div>
      {entries.length === 0 ? (
        <div className={s.empty} style={{ padding: '14px 12px' }}>入力はまだありません。</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <tbody>
              {entries.map((entry) => {
                const editing = editingProfitId === entry.ranch_profit_entry_id
                return (
                  <tr key={entry.ranch_profit_entry_id}>
                    <td style={{ width: editing ? 170 : 90 }}>
                      {editing ? (
                        <input
                          type="date"
                          className={s.input}
                          value={normalizeDateString(entry.profit_date)}
                          onChange={(e) => updateProfitEntry(entry, 'profit_date', e.target.value)}
                          aria-label="日付"
                        />
                      ) : (
                        formatDateShort(entry.profit_date)
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {editing ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          className={s.input}
                          value={showAmount(entry.profit_amount)}
                          onChange={(e) => {
                            const value = e.target.value
                              .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
                              .replace(/,/g, '')
                              .replace(/[^\d-]/g, '')
                            updateProfitEntry(entry, 'profit_amount', value)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') finishEditProfit(entry)
                          }}
                          style={{ textAlign: 'right' }}
                          aria-label="金額"
                        />
                      ) : (
                        formatMoney(entry.profit_amount)
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', width: 1 }}>
                      {editing ? (
                        <>
                          <button type="button" className={`${s.btn} ${s.btnSmall} ${s.btnPrimary}`} onClick={() => finishEditProfit(entry)} disabled={saving}>保存</button>{' '}
                          <button type="button" className={`${s.btn} ${s.btnSmall}`} onClick={cancelEditProfit} disabled={saving}>やめる</button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={`${s.btn} ${s.btnSmall}`}
                            onClick={() => startEditProfit(entry)}
                            disabled={saving || (editingProfitId !== null && !editing)}
                            style={{ background: '#eef2ea', border: 0 }}
                          >
                            直す
                          </button>{' '}
                          <button
                            type="button"
                            className={`${s.btn} ${s.btnSmall}`}
                            onClick={() => deleteProfitEntry(entry)}
                            disabled={saving}
                            style={{ background: 'transparent', color: '#b8573f', border: '1px solid #e3c2b8' }}
                          >
                            削除
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  return (
    <>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className={s.kicker}>Ranch</span>
          <h1 className={s.title}>牧場</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" className={s.iconBtn} aria-label="前の月" onClick={() => moveMonth(-1)} disabled={saving}>‹</button>
          <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 22, color: '#22352b', padding: '0 8px' }}>
            {targetYear}年{targetMonth}月
          </span>
          <button type="button" className={s.iconBtn} aria-label="次の月" onClick={() => moveMonth(1)} disabled={saving}>›</button>
          <button type="button" className={`${s.btn} ${s.btnSmall}`} onClick={reload} disabled={saving} style={{ marginLeft: 6 }}>
            再読み込み
          </button>
        </div>
      </header>

      {message && (
        <div
          className={isError ? s.warnBox : s.notice}
          role={isError ? 'alert' : 'status'}
          style={isError ? { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#f8ece7', color: '#b8573f', fontSize: 14 } : undefined}
        >
          <span>{message}</span>
          <button type="button" className={s.noticeClose} aria-label="お知らせを閉じる" onClick={() => setMessage('')}>×</button>
        </div>
      )}

      <section aria-label="この月のまとめ" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div className={s.cardDark} style={{ gap: 2, padding: '18px 20px' }}>
          <span style={{ fontSize: 13, color: '#c7d1c4' }}>この月の牧場利益</span>
          <span style={{ ...kpiValue, fontSize: 28, color: '#e4d1a6' }}>{formatMoney(summary?.total_profit_amount ?? 0)}</span>
          <span style={{ fontSize: 12, color: '#c7d1c4' }}>
            前半 {formatMoney(summary?.first_half_profit_amount ?? 0)} ＋ 後半 {formatMoney(summary?.second_half_profit_amount ?? 0)}
          </span>
        </div>
        <div className={s.card} style={{ gap: 2, padding: '18px 20px' }}>
          <span className={s.muted}>お世話の回数</span>
          <span style={kpiValue}>
            {formatMoney(Number(summary?.first_half_care_count ?? 0) + Number(summary?.second_half_care_count ?? 0))} <span style={{ fontSize: 15 }}>回</span>
          </span>
          <span className={s.muted} style={{ fontSize: 12 }}>
            前半 {formatMoney(summary?.first_half_care_count ?? 0)}回 ・ 後半 {formatMoney(summary?.second_half_care_count ?? 0)}回
          </span>
        </div>
        <div className={s.card} style={{ gap: 2, padding: '18px 20px' }}>
          <span className={s.muted}>お世話の報酬</span>
          <span style={kpiValue}>{formatMoney(summary?.total_care_pay ?? 0)}</span>
          <span className={s.muted} style={{ fontSize: 12 }}>
            前半 {formatMoney(summary?.first_half_care_pay ?? 0)} ・ 後半 {formatMoney(summary?.second_half_care_pay ?? 0)}
          </span>
        </div>
        <div className={s.card} style={{ gap: 2, padding: '18px 20px' }}>
          <span className={s.muted}>お世話1回の単価</span>
          <span style={kpiValue}>{formatMoney(summary?.unit_care_pay ?? unitCarePay)}</span>
          <a href="#ranch-setting" style={{ fontSize: 12 }}>単価を変える</a>
        </div>
      </section>

      <section className={s.card} aria-labelledby="ranch-care">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <h2 id="ranch-care" className={s.h2}>お世話チェック</h2>
          <span className={s.muted}>マスを押すと記録・取り消し（1マス＝1回）。砂金色の線から右が後半です</span>
        </div>

        {visibleEmployees.length === 0 ? (
          <div className={s.empty}>表に出す人がいません。下の「表に出す人を選ぶ」から選んでください。</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table} style={{ fontSize: 14 }}>
              <thead>
                <tr>
                  <th scope="col" style={{ position: 'sticky', left: 0, zIndex: 1, background: '#eef2ea' }}>従業員</th>
                  {allDays.map((day) => {
                    const dateString = getDateString(targetYear, targetMonth, day)
                    const weekday = new Date(Number(targetYear), Number(targetMonth) - 1, day).getDay()
                    const isToday = dateString === todayString
                    return (
                      <th
                        key={day}
                        scope="col"
                        style={{
                          padding: '6px 0',
                          minWidth: 30,
                          textAlign: 'center',
                          fontWeight: 500,
                          fontSize: 12,
                          ...(day === 16 ? halfEdge : {}),
                          ...(weekday === 0 || weekday === 6 ? { color: '#8a6f45' } : {}),
                          ...(isToday ? { background: '#dcc79e', color: '#22352b', fontWeight: 700 } : {}),
                        }}
                      >
                        {day}
                        <span style={{ display: 'block', fontSize: 10, color: isToday ? '#22352b' : '#6f665c' }}>{weekdayNames[weekday]}</span>
                      </th>
                    )
                  })}
                  <th scope="col" style={{ fontSize: 12, whiteSpace: 'nowrap', textAlign: 'right' }}>前半／後半</th>
                  <th scope="col" className={s.colStrongHead} style={{ fontSize: 12, textAlign: 'right' }}>報酬</th>
                </tr>
              </thead>
              <tbody>
                {visibleEmployees.map((employee) => {
                  const firstCount = getEmployeeHalfCount(employee, firstHalfDays)
                  const secondCount = getEmployeeHalfCount(employee, secondHalfDays)
                  return (
                    <tr key={employee.user_id}>
                      <th scope="row" style={{ position: 'sticky', left: 0, zIndex: 1, background: '#fffdf9', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {employee.employee_name || '未登録'}
                        <span className={s.subText}>
                          {employee.staff_code}
                          {employee.staff_grade ? ` ・ ${employee.staff_grade}` : ''}
                        </span>
                      </th>
                      {allDays.map((day) => {
                        const dateString = getDateString(targetYear, targetMonth, day)
                        const checked = getCareCount(employee.user_id, dateString) > 0
                        return (
                          <td key={day} style={{ padding: '4px 2px', textAlign: 'center', ...(day === 16 ? halfEdge : {}) }}>
                            <button
                              type="button"
                              aria-pressed={checked}
                              aria-label={`${employee.employee_name || employee.staff_code} ${targetMonth}月${day}日`}
                              disabled={saving}
                              onClick={() => toggleCare(employee, dateString)}
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: 8,
                                fontSize: 13,
                                cursor: saving ? 'wait' : 'pointer',
                                ...(checked
                                  ? { background: '#2f4a3a', color: '#fbf6ec', border: 0 }
                                  : { background: '#faf6ee', border: '1px solid #d8ccb6', color: '#2f4a3a' }),
                              }}
                            >
                              {checked ? '✓' : ''}
                            </button>
                          </td>
                        )
                      })}
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontSize: 13 }}>{firstCount}回／{secondCount}回</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap', background: '#f6f1e6', fontWeight: 700 }}>
                        {formatMoney((firstCount + secondCount) * unitPayNumber)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: '#6f665c' }}>
            表に出す人を選ぶ（いま{visibleEmployees.length}人 ・ 出していない人 {hiddenEmployees.length}人）
          </summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {employees.map((employee) => {
              const visible = employee.ranch_visible !== false
              return (
                <button
                  key={employee.user_id}
                  type="button"
                  aria-pressed={visible}
                  disabled={saving}
                  onClick={() => toggleRanchVisible(employee)}
                  style={{
                    minHeight: 34,
                    padding: '0 12px',
                    borderRadius: 999,
                    fontSize: 13,
                    cursor: 'pointer',
                    ...(visible
                      ? { background: '#2f4a3a', color: '#fbf6ec', border: 0 }
                      : { background: '#faf6ee', color: '#6f665c', border: '1px solid #d8ccb6' }),
                  }}
                >
                  {visible ? '✓ ' : ''}
                  {employee.employee_name || employee.staff_code}
                </button>
              )
            })}
          </div>
          <p className={s.muted} style={{ margin: '8px 0 0', fontSize: 12 }}>
            押すと表に出す・出さないが切り替わります。出さなくしても、過去のお世話記録は消えません。
          </p>
        </details>
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section className={s.card} aria-labelledby="ranch-profit" style={{ flex: '999 1 520px', minWidth: 0 }}>
          <h2 id="ranch-profit" className={s.h2}>牧場利益の入力</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10, padding: 14, background: '#f4efe6', borderRadius: 12 }}>
            <label className={s.field} style={{ fontSize: 13 }}>
              日付
              <input type="date" className={s.input} value={newProfitDate} onChange={(e) => setNewProfitDate(e.target.value)} style={{ background: '#fffdf9' }} />
            </label>
            <label className={s.field} style={{ fontSize: 13, flex: '1 1 180px' }}>
              金額
              <input
                type="text"
                inputMode="numeric"
                className={s.input}
                value={showAmount(newProfitAmount)}
                onChange={handleAmountInput(setNewProfitAmount)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !saving) addProfitEntry()
                }}
                placeholder="例：15,496,047"
                style={{ background: '#fffdf9', textAlign: 'right' }}
              />
            </label>
            <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={addProfitEntry} disabled={saving}>
              追加する
            </button>
            <span className={s.muted} style={{ flexBasis: '100%', fontSize: 12 }}>
              金額を打ってEnterでも追加できます（全角の数字も使えます）
            </span>
          </div>
          {renderProfitList('前半（1〜15日）', '#2f4a3a', firstHalfProfitEntries)}
          {renderProfitList('後半（16日〜月末）', '#6a4a12', secondHalfProfitEntries)}
        </section>

        <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section className={s.card} aria-labelledby="ranch-apply">
            <h2 id="ranch-apply" className={s.h2}>給与へ反映</h2>
            <span className={s.muted}>期間内の牧場利益の合計を、給与計算の「牧場利益」に入れます</span>
            {payrollPeriods.length === 0 ? (
              <div className={s.empty}>この月の給与期間がまだありません。先に給与計算の画面で期間を作ってください。</div>
            ) : (
              [...payrollPeriods]
                .sort((a, b) => {
                  const order = (p) => ({ 前半: 0, 後半: 1 })[getPeriodTypeLabel(p.half_type)] ?? 2
                  return order(a) - order(b)
                })
                .map((period) => {
                const isLocked = ['locked', 'paid', 'closed'].includes(period.status)
                return (
                  <div
                    key={period.payroll_period_id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', background: '#faf6ee', border: '1px solid #efe7da', borderRadius: 12 }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 700 }}>
                        {getPeriodTypeLabel(period.half_type)}{' '}
                        <span style={{ fontWeight: 400, fontSize: 12, color: '#6f665c' }}>
                          {formatDateShort(period.period_start)}〜{formatDateShort(period.period_end)} ・ {isLocked ? '確定済み' : '編集中'}
                        </span>
                      </span>
                      <span className={s.muted}>
                        反映する額 <strong style={{ color: '#22352b' }}>{formatMoney(profitInRange(period.period_start, period.period_end))}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`${s.btn} ${isLocked ? '' : s.btnPrimary}`}
                      onClick={() => applyToPayroll(period)}
                      disabled={saving || isLocked}
                    >
                      {isLocked ? '確定済み' : '反映する'}
                    </button>
                  </div>
                )
              })
            )}
          </section>

          <section id="ranch-setting" className={s.card} aria-labelledby="ranch-unit">
            <h2 id="ranch-unit" className={s.h2}>この月のお世話単価</h2>
            <label className={s.field}>
              1回あたり
              <input
                type="text"
                inputMode="numeric"
                className={s.input}
                value={showAmount(unitCarePay)}
                onChange={handleAmountInput(setUnitCarePay)}
                style={{ textAlign: 'right' }}
              />
            </label>
            <label className={s.field}>
              メモ
              <input type="text" className={s.input} value={settingMemo} onChange={(e) => setSettingMemo(e.target.value)} placeholder="単価を変えた理由など" />
            </label>
            <button type="button" className={s.btn} onClick={saveMonthSetting} disabled={saving} style={{ fontWeight: 700 }}>
              単価を保存
            </button>
          </section>
        </div>
      </div>
    </>
  )
}
