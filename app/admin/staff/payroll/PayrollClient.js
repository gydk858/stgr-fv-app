'use client'

import theme from '@/lib/ui-theme'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { adminGet, adminPost } from '@/lib/admin-api'

const DEFAULT_PREVIOUS_VAULT_AFTER_AMOUNT = '2019102555'
const DEFAULT_RANCH_UNIT_CARE_PAY = 3000000

const normalizeHalfType = (value) => String(value || '').trim().toLowerCase()
const isMonthlyBonusHalfType = (value) => normalizeHalfType(value) === 'monthly_bonus'

const getPayrollPeriodSortOrder = (value) => {
  const halfType = normalizeHalfType(value)
  if (halfType === 'first_half') return 1
  if (halfType === 'second_half') return 2
  if (halfType === 'monthly_bonus') return 3
  return 99
}

export default function PayrollClient() {
  const now = new Date()

  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [store, setStore] = useState(null)
  const [targetYear, setTargetYear] = useState(now.getFullYear())
  const [targetMonth, setTargetMonth] = useState(now.getMonth() + 1)

  const [periods, setPeriods] = useState([])
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [runItems, setRunItems] = useState([])
  const [itemEdits, setItemEdits] = useState({})

  const [rateRuleSets, setRateRuleSets] = useState([])
  const [selectedRateRuleSetId, setSelectedRateRuleSetId] = useState('')

  const [previousVaultAfterAmount, setPreviousVaultAfterAmount] = useState(DEFAULT_PREVIOUS_VAULT_AFTER_AMOUNT)
  const [previousVaultSourceText, setPreviousVaultSourceText] = useState('初月用の初期値を表示しています')
  const [ranchProfitAmount, setRanchProfitAmount] = useState('0')
  const [vaultBeforeAmount, setVaultBeforeAmount] = useState('0')
  const [extraIncomeAmount, setExtraIncomeAmount] = useState('0')
  const [periodMemo, setPeriodMemo] = useState('')
  const [periodSummary, setPeriodSummary] = useState(null)
  const [monthlyBonusPoolAmount, setMonthlyBonusPoolAmount] = useState('0')
  const [monthlyBonusRun, setMonthlyBonusRun] = useState(null)
  const [monthlyBonusRunItems, setMonthlyBonusRunItems] = useState([])

  const [ranchPayrollLink, setRanchPayrollLink] = useState(null)
  const [ranchCareEvents, setRanchCareEvents] = useState([])
  const [ranchUnitCarePay, setRanchUnitCarePay] = useState(DEFAULT_RANCH_UNIT_CARE_PAY)
  const [staffWorkSessions, setStaffWorkSessions] = useState([])
  const [employeeProfiles, setEmployeeProfiles] = useState([])

  const selectedPeriod = useMemo(() => {
    return periods.find((p) => String(p.payroll_period_id) === String(selectedPeriodId))
  }, [periods, selectedPeriodId])

  const isSelectedPeriodLocked = selectedPeriod?.status === 'locked'
  const isSelectedPeriodMonthlyBonus = isMonthlyBonusHalfType(selectedPeriod?.half_type)

  const selectedRateRuleSet = useMemo(() => {
    return rateRuleSets.find(
      (ruleSet) => String(ruleSet.payroll_rate_rule_set_id) === String(selectedRateRuleSetId)
    )
  }, [rateRuleSets, selectedRateRuleSetId])

  const ranchCareMap = useMemo(() => {
    const map = {}

    ranchCareEvents.forEach((event) => {
      const key = String(event.user_id)
      map[key] = (map[key] || 0) + Number(event.care_count || 0)
    })

    return map
  }, [ranchCareEvents])

  const staffWorkSessionMap = useMemo(() => {
    const map = {}

    staffWorkSessions.forEach((session) => {
      const key = String(session.user_id)

      if (!map[key]) {
        map[key] = {
          userId: session.user_id,
          staffCode: session.staff_code || '-',
          bonusEligibleMinutes: 0,
        }
      }

      if (session.staff_code && map[key].staffCode === '-') {
        map[key].staffCode = session.staff_code
      }

      map[key].bonusEligibleMinutes += Number(session.bonus_eligible_minutes || 0)
    })

    return map
  }, [staffWorkSessions])

  const employeeProfileMap = useMemo(() => {
    const map = {}

    employeeProfiles.forEach((profile) => {
      const key = String(profile.user_id)
      map[key] = {
        userId: profile.user_id,
        staffCode: profile.staff_code || '-',
        employeeName: profile.employee_name || profile.staff_code || '-',
      }
    })

    return map
  }, [employeeProfiles])

  const totalMonthlyBonusEligibleMinutesAll = useMemo(() => {
    return Object.values(staffWorkSessionMap).reduce((sum, row) => {
      return sum + Number(row.bonusEligibleMinutes || 0)
    }, 0)
  }, [staffWorkSessionMap])

  const monthlyBonusEligibleUserCount = useMemo(() => {
    return Object.values(staffWorkSessionMap).filter((row) => Number(row.bonusEligibleMinutes || 0) > 0).length
  }, [staffWorkSessionMap])


  const monthlyBonusPoolNumber = useMemo(() => {
    const normalized = String(monthlyBonusPoolAmount ?? '')
      .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
      .replace(/,/g, '')
      .replace(/[^\d-]/g, '')

    if (normalized === '' || normalized === '-') return 0
    return Number(normalized)
  }, [monthlyBonusPoolAmount])

  const monthlyBonusDistributionRows = useMemo(() => {
    if (monthlyBonusPoolNumber <= 0 || totalMonthlyBonusEligibleMinutesAll <= 0) return []

    const baseRows = Object.values(staffWorkSessionMap)
      .filter((row) => Number(row.bonusEligibleMinutes || 0) > 0)
      .map((row) => {
        const bonusEligibleMinutes = Number(row.bonusEligibleMinutes || 0)
        const rate = bonusEligibleMinutes / totalMonthlyBonusEligibleMinutesAll
        const exactBonusAmount = monthlyBonusPoolNumber * rate
        const baseBonusAmount = Math.floor(exactBonusAmount)
        const profile = employeeProfileMap[String(row.userId)] || {}

        return {
          userId: row.userId,
          staffCode: profile.staffCode || row.staffCode || '-',
          employeeName: profile.employeeName || row.staffCode || '-',
          bonusEligibleMinutes,
          rate,
          baseBonusAmount,
          remainder: exactBonusAmount - baseBonusAmount,
        }
      })

    const baseTotal = baseRows.reduce((sum, row) => sum + row.baseBonusAmount, 0)
    const remainingAmount = Math.max(0, monthlyBonusPoolNumber - baseTotal)
    const bonusAddMap = {}

    ;[...baseRows]
      .sort((a, b) => {
        if (b.remainder !== a.remainder) return b.remainder - a.remainder
        if (b.bonusEligibleMinutes !== a.bonusEligibleMinutes) return b.bonusEligibleMinutes - a.bonusEligibleMinutes
        return String(a.staffCode).localeCompare(String(b.staffCode), 'ja')
      })
      .forEach((row, index) => {
        bonusAddMap[String(row.userId)] = index < remainingAmount ? 1 : 0
      })

    return baseRows
      .map((row) => ({
        ...row,
        bonusAmount: row.baseBonusAmount + (bonusAddMap[String(row.userId)] || 0),
      }))
      .sort((a, b) => String(a.staffCode).localeCompare(String(b.staffCode), 'ja'))
  }, [employeeProfileMap, monthlyBonusPoolNumber, staffWorkSessionMap, totalMonthlyBonusEligibleMinutesAll])

  const totalMonthlyBonusPreviewAmount = useMemo(() => {
    return monthlyBonusDistributionRows.reduce((sum, row) => sum + Number(row.bonusAmount || 0), 0)
  }, [monthlyBonusDistributionRows])

  const selectedMonthlyBonusRun = useMemo(() => {
    if (!isSelectedPeriodMonthlyBonus || !selectedPeriodId || !monthlyBonusRun) return null

    if (String(monthlyBonusRun.payroll_period_id) !== String(selectedPeriodId)) return null

    return monthlyBonusRun
  }, [isSelectedPeriodMonthlyBonus, monthlyBonusRun, selectedPeriodId])

  const hasSavedMonthlyBonusRun = Boolean(selectedMonthlyBonusRun)

  const monthlyBonusVaultBeforeDisplay = useMemo(() => {
    if (!selectedMonthlyBonusRun) return null

    if (selectedMonthlyBonusRun.previous_vault_after_amount !== null && selectedMonthlyBonusRun.previous_vault_after_amount !== undefined) {
      return selectedMonthlyBonusRun.previous_vault_after_amount
    }

    if (previousVaultAfterAmount !== null && previousVaultAfterAmount !== undefined && previousVaultAfterAmount !== '') {
      return previousVaultAfterAmount
    }

    return null
  }, [previousVaultAfterAmount, selectedMonthlyBonusRun])

  const monthlyBonusVaultAfterDisplay = useMemo(() => {
    if (!selectedMonthlyBonusRun) return null

    if (selectedMonthlyBonusRun.vault_after_amount !== null && selectedMonthlyBonusRun.vault_after_amount !== undefined) {
      return selectedMonthlyBonusRun.vault_after_amount
    }

    if (monthlyBonusVaultBeforeDisplay !== null && monthlyBonusVaultBeforeDisplay !== undefined && monthlyBonusVaultBeforeDisplay !== '') {
      return toAmountNumber(monthlyBonusVaultBeforeDisplay) - toAmountNumber(selectedMonthlyBonusRun.bonus_pool_amount ?? monthlyBonusPoolNumber)
    }

    return null
  }, [monthlyBonusPoolNumber, monthlyBonusVaultBeforeDisplay, selectedMonthlyBonusRun])

  const canSaveMonthlyBonusDistribution =
    Boolean(selectedPeriodId) &&
    isSelectedPeriodMonthlyBonus &&
    !isSelectedPeriodLocked &&
    monthlyBonusPoolNumber >= 0 &&
    !loading

  const getRanchCareCount = (item) => {
    return ranchCareMap[String(item.user_id)] || 0
  }

  const getStaffBonusEligibleMinutes = (item) => {
    return staffWorkSessionMap[String(item.user_id)]?.bonusEligibleMinutes || 0
  }

  const getRanchCarePayAmount = (item) => {
    return getRanchCareCount(item) * Number(ranchUnitCarePay || 0)
  }

  const getTotalCalculatedPayAmount = (item) => {
    return Number(item.calculated_pay_amount || 0) + getRanchCarePayAmount(item)
  }

  const getTotalTransferAmount = (item) => {
    return Number(item.transfer_amount || 0) + getRanchCarePayAmount(item)
  }

  const baseTotalCalculatedPayAmount = runItems.reduce((sum, item) => sum + Number(item.calculated_pay_amount || 0), 0)
  const baseTotalTransferAmount = runItems.reduce((sum, item) => sum + Number(item.transfer_amount || 0), 0)
  const totalAdjustmentAmount = runItems.reduce((sum, item) => sum + Number(item.adjustment_amount || 0), 0)

  const totalRanchCareCount = runItems.reduce((sum, item) => sum + getRanchCareCount(item), 0)
  const totalRanchCarePayAmount = runItems.reduce((sum, item) => sum + getRanchCarePayAmount(item), 0)
  const totalStaffBonusEligibleMinutes = runItems.reduce((sum, item) => sum + getStaffBonusEligibleMinutes(item), 0)
  const totalCalculatedPayAmount = baseTotalCalculatedPayAmount + totalRanchCarePayAmount
  const totalTransferAmount = baseTotalTransferAmount + totalRanchCarePayAmount

  const canLockSelectedPeriod =
    Boolean(selectedPeriodId) &&
    !isSelectedPeriodLocked &&
    (isSelectedPeriodMonthlyBonus ? hasSavedMonthlyBonusRun : runItems.length > 0 && Boolean(periodSummary))

  const lockBlockedReason = !selectedPeriodId
    ? '給与期間を選択してください'
    : isSelectedPeriodLocked
    ? 'この給与期間はすでに確定済みです'
    : isSelectedPeriodMonthlyBonus && !hasSavedMonthlyBonusRun
    ? '先に月末ボーナスの「保存・配分作成」をしてください'
    : !isSelectedPeriodMonthlyBonus && runItems.length === 0
    ? '先に給与プレビューを生成してください'
    : !isSelectedPeriodMonthlyBonus && !periodSummary
    ? '先に金庫・牧場・備考の「入力内容を保存」をしてください'
    : ''

  useEffect(() => {
    initialize()
  }, [])

  const initialize = async () => {
    setInitialLoading(true)
    setMessage('')

    try {
      const currentStore = await fetchCurrentStore()
      setStore(currentStore)
      await fetchEmployeeProfiles()
      await fetchPayrollRateRuleSets(currentStore.store_id)
      await fetchPayrollPeriods(currentStore.store_id, targetYear, targetMonth)
    } catch (error) {
      console.error(error)
      setMessage(`初期表示に失敗しました: ${error.message}`)
    } finally {
      setInitialLoading(false)
    }
  }

  // 店舗は /api/admin-context がサーバー側で決める（給与管理は従来どおり店舗の status を問わない）
  const fetchCurrentStore = async () => {
    const { store: storeData } = await adminGet('/api/admin-context')
    return storeData
  }

  const fetchPayrollRateRuleSets = async (storeId = store?.store_id) => {
    if (!storeId) return []

    let mergedRuleSets = []
    try {
      const { rule_sets } = await adminGet('/api/admin-payroll', { view: 'payroll_context' })
      mergedRuleSets = rule_sets || []
    } catch (ruleSetError) {
      console.error(ruleSetError)
      setMessage(`単価ルールセットの取得に失敗しました: ${ruleSetError.message}`)
      return []
    }

    setRateRuleSets(mergedRuleSets)

    if (!selectedRateRuleSetId && mergedRuleSets.length > 0) {
      setSelectedRateRuleSetId(String(mergedRuleSets[0].payroll_rate_rule_set_id))
    }

    return mergedRuleSets
  }

  const fetchPayrollPeriods = async (
    storeId = store?.store_id,
    year = targetYear,
    month = targetMonth
  ) => {
    if (!storeId) {
      setMessage('店舗IDが取得できていないため、給与期間を取得できません')
      return []
    }

    let data
    try {
      ;({ periods: data } = await adminGet('/api/admin-payroll', {
        view: 'periods',
        year: Number(year),
        month: Number(month),
      }))
    } catch (error) {
      console.error(error)
      setMessage(`給与期間の取得に失敗しました: ${error.message}`)
      return []
    }

    const nextPeriods = (data || []).slice().sort((a, b) => {
      const orderDiff = getPayrollPeriodSortOrder(a.half_type) - getPayrollPeriodSortOrder(b.half_type)
      if (orderDiff !== 0) return orderDiff

      const startDiff = String(a.period_start || '').localeCompare(String(b.period_start || ''))
      if (startDiff !== 0) return startDiff

      return Number(a.payroll_period_id || 0) - Number(b.payroll_period_id || 0)
    })
    setPeriods(nextPeriods)

    if (nextPeriods.length > 0) {
      const currentStillExists = selectedPeriodId
        ? nextPeriods.some((period) => String(period.payroll_period_id) === String(selectedPeriodId))
        : false

      const nextSelectedPeriodId = currentStillExists
        ? String(selectedPeriodId)
        : String(nextPeriods[0].payroll_period_id)

      const nextSelectedPeriod = nextPeriods.find((p) => String(p.payroll_period_id) === String(nextSelectedPeriodId))

      setSelectedPeriodId(nextSelectedPeriodId)
      await fetchPayrollRunItems(nextSelectedPeriodId, nextSelectedPeriod)
      await fetchPayrollInputsAndSummary(nextSelectedPeriodId)
      await fetchRanchCareForPeriod(nextSelectedPeriod)
      await fetchStaffWorkSessionsForMonth(year, month)
      await fetchMonthlyBonusDistribution(nextSelectedPeriodId, nextSelectedPeriod)
    } else {
      setSelectedPeriodId('')
      setRunItems([])
      setItemEdits({})
      setRanchPayrollLink(null)
      setRanchCareEvents([])
      setStaffWorkSessions([])
      setMonthlyBonusRun(null)
      setMonthlyBonusRunItems([])
      setMonthlyBonusPoolAmount('0')
      resetPayrollInputsAndSummary()
    }

    return nextPeriods
  }

  const fetchPayrollRunItems = async (periodId = selectedPeriodId, periodOverride = null) => {
    if (!periodId) return []

    const targetPeriod = periodOverride || periods.find((period) => String(period.payroll_period_id) === String(periodId))

    if (isMonthlyBonusHalfType(targetPeriod?.half_type)) {
      setRunItems([])
      setItemEdits({})
      return []
    }

    let data
    try {
      ;({ run_items: data } = await adminGet('/api/admin-payroll', {
        view: 'run_items',
        payroll_period_id: Number(periodId),
      }))
    } catch (error) {
      console.error(error)
      setMessage(`給与明細の取得に失敗しました: ${error.message}`)
      return []
    }

    const nextItems = data || []
    setRunItems(nextItems)

    const nextEdits = {}
    nextItems.forEach((item) => {
      nextEdits[item.payroll_run_item_id] = {
        adjustmentAmount: String(item.adjustment_amount ?? 0),
        note: item.note || '',
      }
    })
    setItemEdits(nextEdits)

    return nextItems
  }

  const fetchRanchCareForPeriod = async (period = selectedPeriod) => {
    if (!period?.store_id || !period?.period_start || !period?.period_end) {
      setRanchCareEvents([])
      setRanchUnitCarePay(DEFAULT_RANCH_UNIT_CARE_PAY)
      return []
    }

    let data
    try {
      const ranch = await adminGet('/api/admin-payroll', {
        view: 'ranch_care',
        payroll_period_id: Number(period.payroll_period_id),
      })
      setRanchUnitCarePay(Number(ranch.unit_care_pay ?? DEFAULT_RANCH_UNIT_CARE_PAY))
      data = ranch.care_events
    } catch (error) {
      console.error(error)
      setRanchUnitCarePay(DEFAULT_RANCH_UNIT_CARE_PAY)
      setRanchCareEvents([])
      setMessage(`牧場お世話情報の取得に失敗しました: ${error.message}`)
      return []
    }

    setRanchCareEvents(data || [])
    return data || []
  }

  const applyPreviousVaultAfterAmount = (periodId, previousResult) => {
    if (!periodId) {
      setPreviousVaultAfterAmount(DEFAULT_PREVIOUS_VAULT_AFTER_AMOUNT)
      setPreviousVaultSourceText('初月用の初期値を表示しています')
      return DEFAULT_PREVIOUS_VAULT_AFTER_AMOUNT
    }

    if (previousResult?.error) {
      console.error(previousResult.error)
      setPreviousVaultAfterAmount(DEFAULT_PREVIOUS_VAULT_AFTER_AMOUNT)
      setPreviousVaultSourceText('前回給与期間を取得できなかったため、初月用の初期値を表示しています')
      return DEFAULT_PREVIOUS_VAULT_AFTER_AMOUNT
    }

    const previous = previousResult || null

    if (previous?.previous_vault_after_amount !== null && previous?.previous_vault_after_amount !== undefined) {
      const previousAmount = String(previous.previous_vault_after_amount)

      setPreviousVaultAfterAmount(previousAmount)
      setPreviousVaultSourceText(
        `前回給与期間 ${formatDate(previous.previous_period_start)} ～ ${formatDate(previous.previous_period_end)} の支払い後金額を自動表示しています`
      )

      return previousAmount
    }

    setPreviousVaultAfterAmount(DEFAULT_PREVIOUS_VAULT_AFTER_AMOUNT)
    setPreviousVaultSourceText('前回給与期間がないため、初月用の初期値を表示しています')
    return DEFAULT_PREVIOUS_VAULT_AFTER_AMOUNT
  }

  const fetchEmployeeProfiles = async () => {
    let data
    try {
      ;({ employees: data } = await adminGet('/api/admin-payroll', { view: 'payroll_context' }))
    } catch (error) {
      console.error(error)
      setEmployeeProfiles([])
      return []
    }

    const profiles = data || []
    setEmployeeProfiles(profiles)
    return profiles
  }

  const fetchStaffWorkSessionsForMonth = async (
    year = targetYear,
    month = targetMonth
  ) => {
    if (!year || !month) {
      setStaffWorkSessions([])
      return []
    }

    const monthStart = getDateString(year, month, 1)
    const monthEnd = getLastDateString(year, month)

    let data
    try {
      ;({ work_sessions: data } = await adminGet('/api/admin-payroll', {
        view: 'work_sessions',
        year: Number(year),
        month: Number(month),
      }))
    } catch (error) {
      console.error(error)
      setStaffWorkSessions([])
      setMessage(`加算時間情報の取得に失敗しました: ${error.message}`)
      return []
    }

    setStaffWorkSessions(data || [])
    return data || []
  }

  const fetchStaffWorkSessionsForPayrollPeriod = async (period = selectedPeriod) => {
    if (period?.target_year && period?.target_month) {
      return await fetchStaffWorkSessionsForMonth(period.target_year, period.target_month)
    }

    return await fetchStaffWorkSessionsForMonth(targetYear, targetMonth)
  }

  const fetchMonthlyBonusDistribution = async (
    periodId = selectedPeriodId,
    period = selectedPeriod
  ) => {
    if (!periodId || !isMonthlyBonusHalfType(period?.half_type)) {
      setMonthlyBonusRun(null)
      setMonthlyBonusRunItems([])
      if (!isMonthlyBonusHalfType(period?.half_type)) {
        setMonthlyBonusPoolAmount('0')
      }
      return null
    }

    let runData
    let itemData
    let itemErrorMessage
    try {
      const bonus = await adminGet('/api/admin-payroll', {
        view: 'monthly_bonus',
        payroll_period_id: Number(periodId),
      })
      runData = bonus.run
      itemData = bonus.items
      itemErrorMessage = bonus.items_error
    } catch (runError) {
      console.error(runError)
      setMonthlyBonusRun(null)
      setMonthlyBonusRunItems([])
      setMessage(`月末ボーナス保存情報の取得に失敗しました: ${runError.message}`)
      return null
    }

    if (!runData) {
      setMonthlyBonusRun(null)
      setMonthlyBonusRunItems([])
      setMonthlyBonusPoolAmount('0')
      return null
    }

    setMonthlyBonusRun(runData)
    setMonthlyBonusPoolAmount(String(runData.bonus_pool_amount ?? 0))
    setPeriodMemo(runData.memo || '')

    if (itemErrorMessage) {
      setMonthlyBonusRunItems([])
      setMessage(`月末ボーナス明細の取得に失敗しました: ${itemErrorMessage}`)
      return runData
    }

    setMonthlyBonusRunItems(itemData || [])
    return runData
  }

  const fetchPayrollInputsAndSummary = async (periodId = selectedPeriodId) => {
    if (!periodId) {
      resetPayrollInputsAndSummary()
      setRanchPayrollLink(null)
      return
    }

    let detail
    try {
      detail = await adminGet('/api/admin-payroll', {
        view: 'inputs_summary',
        payroll_period_id: Number(periodId),
      })
    } catch (error) {
      console.error(error)
      setMessage(`給与入力情報の取得に失敗しました: ${error.message}`)
      return
    }

    const autoPreviousVaultAfterAmount = applyPreviousVaultAfterAmount(periodId, detail.previous)
    const inputData = detail.input
    const summaryData = detail.summary
    const ranchLink = detail.ranch_link || null
    setRanchPayrollLink(ranchLink)

    setPreviousVaultAfterAmount(autoPreviousVaultAfterAmount)

    if (inputData) {
      setRanchProfitAmount(String(inputData.ranch_profit_amount ?? ranchLink?.ranch_profit_amount ?? 0))
      setVaultBeforeAmount(String(inputData.vault_before_amount ?? 0))
      setExtraIncomeAmount(String(inputData.extra_income_amount ?? 0))
      setPeriodMemo(inputData.memo || '')

      if (inputData.payroll_rate_rule_set_id) {
        setSelectedRateRuleSetId(String(inputData.payroll_rate_rule_set_id))
      }
    } else {
      setRanchProfitAmount(String(ranchLink?.ranch_profit_amount ?? 0))
      setVaultBeforeAmount('0')
      setExtraIncomeAmount('0')
      setPeriodMemo('')
    }

    setPeriodSummary(summaryData || null)
  }

  const resetPayrollInputsAndSummary = () => {
    setPreviousVaultAfterAmount(DEFAULT_PREVIOUS_VAULT_AFTER_AMOUNT)
    setPreviousVaultSourceText('初月用の初期値を表示しています')
    setRanchProfitAmount('0')
    setVaultBeforeAmount('0')
    setExtraIncomeAmount('0')
    setPeriodMemo('')
    setPeriodSummary(null)
  }

  const getDateString = (year, month, day) => {
    const y = Number(year)
    const m = String(Number(month)).padStart(2, '0')
    const d = String(Number(day)).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const getLastDateString = (year, month) => {
    const lastDay = new Date(Number(year), Number(month), 0).getDate()
    return getDateString(year, month, lastDay)
  }

  const toAmountNumber = (value) => {
    const normalized = String(value ?? '')
      .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
      .replace(/,/g, '')
      .replace(/[^\d-]/g, '')

    if (normalized === '' || normalized === '-') return 0
    return Number(normalized)
  }

  const handleAmountChange = (setter) => (event) => {
    const value = event.target.value
      .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
      .replace(/,/g, '')
      .replace(/[^\d-]/g, '')

    setter(value)
  }

  const getSelectedRateRuleSetIdForRpc = () => {
    if (!selectedRateRuleSetId) return null
    return Number(selectedRateRuleSetId)
  }

  // 牧場利益は、保存済みの値（入力がなければ牧場からの反映値）を保存する。
  // 保存済みの値と牧場からの反映値が異なる場合も、通常の保存では保存済みの値を変えない。
  // 牧場の値に更新するときは、利用者が「牧場の反映値をこの欄に入れる」を押してから保存する。
  const getRanchProfitAmountForSave = () => {
    return toAmountNumber(ranchProfitAmount)
  }

  const hasRanchProfitDifference =
    Boolean(ranchPayrollLink) &&
    ranchPayrollLink.ranch_profit_amount !== null &&
    ranchPayrollLink.ranch_profit_amount !== undefined &&
    toAmountNumber(ranchPayrollLink.ranch_profit_amount) !== toAmountNumber(ranchProfitAmount)

  const applyRanchLinkToInput = () => {
    if (!ranchPayrollLink || isSelectedPeriodLocked) return
    setRanchProfitAmount(String(ranchPayrollLink.ranch_profit_amount ?? 0))
    setMessage('牧場の反映値を欄に入れました。「入力内容を保存」を押すまで、保存済みの値は変わりません。')
  }

  const createPayrollPeriods = async () => {
    if (!store?.store_code || !store?.store_id) {
      setMessage('店舗情報が取得できていません')
      return
    }

    setLoading(true)
    setMessage('給与期間を作成中です...')

    try {
      // 支給日（15日・月末）と店舗はサーバーが決める
      await adminPost('/api/admin-payroll', {
        action: 'create_periods',
        year: Number(targetYear),
        month: Number(targetMonth),
      })

      const refreshedPeriods = await fetchPayrollPeriods(
        store.store_id,
        targetYear,
        targetMonth
      )

      setMessage(`給与期間を作成しました。${refreshedPeriods.length}件の給与期間を取得しました。`)
    } catch (error) {
      console.error(error)
      setMessage(`給与期間の作成に失敗しました: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const buildPreviewForSelectedPeriod = async () => {
    if (!selectedPeriodId) {
      setMessage('給与期間を選択してください')
      return
    }

    if (isSelectedPeriodLocked) {
      setMessage('この給与期間は確定済みのため、給与プレビューを再生成できません。修正する場合は先にロック解除してください。')
      return
    }

    if (isSelectedPeriodMonthlyBonus) {
      setMessage('月末ボーナス期間では通常給与プレビューは生成しません。次のステップで月末ボーナス計算を追加します。')
      return
    }

    if (!selectedRateRuleSetId) {
      setMessage('単価ルールを選択してください')
      return
    }

    setLoading(true)
    setMessage('履歴から給与プレビューを生成中です...')

    try {
      const selectedRuleSetId = Number(selectedRateRuleSetId)

      // 単価ルールの選択の保存と、履歴からのプレビュー生成（現在の店舗の期間・ルールかはサーバーが確認する）
      await adminPost('/api/admin-payroll', {
        action: 'build_preview',
        payroll_period_id: Number(selectedPeriodId),
        payroll_rate_rule_set_id: selectedRuleSetId,
      })

      setSelectedRateRuleSetId(String(selectedRuleSetId))

      if (isSelectedPeriodMonthlyBonus) {
        await fetchMonthlyBonusDistribution(selectedPeriodId, selectedPeriod)
      } else {
        await fetchPayrollRunItems(selectedPeriodId)
        await fetchPayrollInputsAndSummary(selectedPeriodId)
        await fetchRanchCareForPeriod(selectedPeriod)
      }
      await fetchStaffWorkSessionsForPayrollPeriod(selectedPeriod)

      setMessage('履歴から給与プレビューを生成しました。選択した単価ルールもこの給与期間に保存しました。')
    } catch (error) {
      console.error(error)
      setMessage(`給与プレビュー生成に失敗しました: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const savePayrollInputs = async () => {
    if (!selectedPeriodId) {
      setMessage('給与期間を選択してください')
      return
    }

    if (isSelectedPeriodLocked) {
      setMessage('この給与期間は確定済みのため、金庫・牧場・備考を保存できません。修正する場合は先にロック解除してください。')
      return
    }

    setLoading(true)
    setMessage('金庫・牧場・備考を保存中です...')

    try {
      await adminPost('/api/admin-payroll', {
        action: 'save_inputs',
        payroll_period_id: Number(selectedPeriodId),
        payroll_rate_rule_set_id: getSelectedRateRuleSetIdForRpc(),
        sales_amount: toAmountNumber(previousVaultAfterAmount),
        ranch_profit_amount: getRanchProfitAmountForSave(),
        vault_before_amount: toAmountNumber(vaultBeforeAmount),
        extra_income_amount: toAmountNumber(extraIncomeAmount),
        memo: periodMemo.trim() === '' ? null : periodMemo.trim(),
      })

      await fetchPayrollInputsAndSummary(selectedPeriodId)
      await fetchPayrollRunItems(selectedPeriodId)
      await fetchRanchCareForPeriod(selectedPeriod)
      await fetchStaffWorkSessionsForPayrollPeriod(selectedPeriod)

      setMessage('金庫・牧場・備考を保存しました')
    } catch (error) {
      console.error(error)
      setMessage(`保存に失敗しました: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const saveMonthlyBonusDistribution = async () => {
    if (!selectedPeriodId || !isSelectedPeriodMonthlyBonus) {
      setMessage('月末ボーナス期間を選択してください')
      return
    }

    if (isSelectedPeriodLocked) {
      setMessage('この月末ボーナス期間は確定済みのため保存できません。')
      return
    }

    if (monthlyBonusPoolNumber < 0) {
      setMessage('月末ボーナス原資は0以上で入力してください')
      return
    }

    if (monthlyBonusPoolNumber > 0 && totalMonthlyBonusEligibleMinutesAll <= 0) {
      setMessage('加算対象時間がないため、月末ボーナスを配分できません')
      return
    }

    const ok = window.confirm(
      [
        monthlyBonusPoolNumber === 0
          ? '月末ボーナスを0円で保存しますか？'
          : '月末ボーナス配分を保存しますか？',
        '',
        `月末ボーナス原資: ${formatMoney(monthlyBonusPoolNumber)}`,
        `全員の加算時間合計: ${formatWorkMinutes(totalMonthlyBonusEligibleMinutesAll)}`,
        `配分合計: ${formatMoney(totalMonthlyBonusPreviewAmount)}`,
        monthlyBonusPoolNumber === 0 ? '保存済みの配分明細は削除され、次回金庫額への影響も0円になります。' : '',
      ].filter(Boolean).join('\n')
    )

    if (!ok) return

    setLoading(true)
    setMessage('月末ボーナス配分を保存中です...')

    try {
      const { data } = await adminPost('/api/admin-payroll', {
        action: 'save_bonus',
        payroll_period_id: Number(selectedPeriodId),
        bonus_pool_amount: monthlyBonusPoolNumber,
        memo: periodMemo.trim() === '' ? null : periodMemo.trim(),
      })

      const savedRun = Array.isArray(data) && data.length > 0 ? data[0] : null

      const refreshedRun = await fetchMonthlyBonusDistribution(selectedPeriodId, selectedPeriod)

      if (!refreshedRun && savedRun) {
        setMonthlyBonusRun((prev) => ({
          ...(prev || {}),
          ...savedRun,
          memo: periodMemo.trim() === '' ? null : periodMemo.trim(),
        }))
        if (monthlyBonusPoolNumber === 0) {
          setMonthlyBonusRunItems([])
        }
      }

      await fetchStaffWorkSessionsForPayrollPeriod(selectedPeriod)

      setMessage(
        monthlyBonusPoolNumber === 0
          ? '月末ボーナスを0円で保存しました。配分明細は削除されています。'
          : `月末ボーナス配分を保存しました。配分合計: ${formatMoney(totalMonthlyBonusPreviewAmount)}`
      )
    } catch (error) {
      console.error(error)
      setMessage(`月末ボーナス配分の保存に失敗しました: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const saveRunItemAdjustment = async (item) => {
    if (isSelectedPeriodLocked || item.is_locked) {
      return
    }

    const edit = itemEdits[item.payroll_run_item_id]
    if (!edit) return

    const nextAdjustmentAmount = toAmountNumber(edit.adjustmentAmount)
    const currentAdjustmentAmount = Number(item.adjustment_amount ?? 0)

    if (nextAdjustmentAmount === currentAdjustmentAmount) {
      return
    }

    setLoading(true)
    setMessage(`${item.staff_code} の調整額を保存中です...`)

    try {
      await adminPost('/api/admin-payroll', {
        action: 'update_adjustment',
        payroll_run_item_id: Number(item.payroll_run_item_id),
        adjustment_amount: nextAdjustmentAmount,
        note: item.note || null,
      })

      if (isSelectedPeriodMonthlyBonus) {
        await fetchMonthlyBonusDistribution(selectedPeriodId, selectedPeriod)
      } else {
        await fetchPayrollRunItems(selectedPeriodId)
        await fetchPayrollInputsAndSummary(selectedPeriodId)
        await fetchRanchCareForPeriod(selectedPeriod)
      }
      await fetchStaffWorkSessionsForPayrollPeriod(selectedPeriod)

      setMessage(`${item.staff_code} の調整額を保存しました`)
    } catch (error) {
      console.error(error)
      setMessage(`調整額の保存に失敗しました: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const lockSelectedPayrollPeriod = async () => {
    if (!selectedPeriodId) {
      setMessage('給与期間を選択してください')
      return
    }

    if (isSelectedPeriodLocked) {
      setMessage('この給与期間はすでに確定済みです')
      return
    }

    if (!canLockSelectedPeriod) {
      setMessage(lockBlockedReason || 'この給与期間はまだ確定できません')
      return
    }

    const ok = window.confirm(
      [
        'この給与期間を確定しますか？',
        '',
        '確定すると以下の操作ができなくなります。',
        isSelectedPeriodMonthlyBonus ? '・月末ボーナス原資の保存' : '・給与プレビュー再生成',
        isSelectedPeriodMonthlyBonus ? '・月末ボーナス配分の再作成' : '・個別調整の保存',
        isSelectedPeriodMonthlyBonus ? '・月末ボーナス備考の保存' : '・金庫・牧場・備考の保存',
        '',
        '修正が必要な場合は、後からロック解除できます。',
      ].join('\n')
    )

    if (!ok) return

    setLoading(true)
    setMessage('給与期間を確定中です...')

    try {
      const { data } = await adminPost('/api/admin-payroll', {
        action: 'lock_period',
        payroll_period_id: Number(selectedPeriodId),
      })

      setPeriods((prev) =>
        prev.map((period) =>
          String(period.payroll_period_id) === String(selectedPeriodId)
            ? { ...period, status: 'locked' }
            : period
        )
      )

      await fetchPayrollRunItems(selectedPeriodId, selectedPeriod)
      await fetchPayrollInputsAndSummary(selectedPeriodId)
      await fetchRanchCareForPeriod(selectedPeriod)
      await fetchStaffWorkSessionsForPayrollPeriod(selectedPeriod)

      const result = Array.isArray(data) && data.length > 0 ? data[0] : null
      setMessage(
        result
          ? `給与期間を確定しました（ロック明細 ${result.locked_item_count}件）`
          : '給与期間を確定しました'
      )
    } catch (error) {
      console.error(error)
      setMessage(`給与期間の確定に失敗しました: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const unlockSelectedPayrollPeriod = async () => {
    if (!selectedPeriodId) {
      setMessage('給与期間を選択してください')
      return
    }

    if (!isSelectedPeriodLocked) {
      setMessage('この給与期間はロックされていません')
      return
    }

    const ok = window.confirm(
      [
        'この給与期間のロックを解除しますか？',
        '',
        '解除すると給与プレビュー再生成、個別調整、金庫・牧場・備考の保存が再度可能になります。',
        '支払い済み期間の場合は、操作ミスに注意してください。',
      ].join('\n')
    )

    if (!ok) return

    setLoading(true)
    setMessage('給与期間のロックを解除中です...')

    try {
      const { data } = await adminPost('/api/admin-payroll', {
        action: 'unlock_period',
        payroll_period_id: Number(selectedPeriodId),
      })

      setPeriods((prev) =>
        prev.map((period) =>
          String(period.payroll_period_id) === String(selectedPeriodId)
            ? { ...period, status: 'open' }
            : period
        )
      )

      await fetchPayrollRunItems(selectedPeriodId, selectedPeriod)
      await fetchPayrollInputsAndSummary(selectedPeriodId)
      await fetchRanchCareForPeriod(selectedPeriod)
      await fetchStaffWorkSessionsForPayrollPeriod(selectedPeriod)

      const result = Array.isArray(data) && data.length > 0 ? data[0] : null
      setMessage(
        result
          ? `給与期間のロックを解除しました（解除明細 ${result.unlocked_item_count}件）`
          : '給与期間のロックを解除しました'
      )
    } catch (error) {
      console.error(error)
      setMessage(`ロック解除に失敗しました: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const updateItemEdit = (itemId, field, value) => {
    setItemEdits((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || { adjustmentAmount: '0', note: '' }),
        [field]: value,
      },
    }))
  }

  const handlePeriodChange = async (value) => {
    const nextPeriod = periods.find((period) => String(period.payroll_period_id) === String(value))

    setSelectedPeriodId(value)
    await fetchPayrollRunItems(value, nextPeriod)
    await fetchPayrollInputsAndSummary(value)
    await fetchRanchCareForPeriod(nextPeriod)
    await fetchStaffWorkSessionsForPayrollPeriod(nextPeriod)
    await fetchMonthlyBonusDistribution(value, nextPeriod)
  }

  const reloadCurrentMonth = async () => {
    if (!store?.store_id) {
      setMessage('店舗情報が取得できていません')
      return
    }

    setLoading(true)
    setMessage('給与期間を再読み込み中です...')

    try {
      await fetchEmployeeProfiles()
      await fetchPayrollRateRuleSets(store.store_id)

      const refreshedPeriods = await fetchPayrollPeriods(
        store.store_id,
        targetYear,
        targetMonth
      )

      setMessage(`${refreshedPeriods.length}件の給与期間を取得しました。`)
    } catch (error) {
      console.error(error)
      setMessage(`再読み込みに失敗しました: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await fetch('/api/admin-logout', { method: 'POST' })
    window.location.href = '/admin/login'
  }

  const formatDate = (value) => {
    if (!value) return '-'
    return String(value).slice(0, 10)
  }

  const formatDateTime = (value) => {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 19).replace('T', ' ')
    return date.toLocaleString('ja-JP')
  }

  const formatMoney = (value) => {
    if (value === null || value === undefined || value === '') return '-'
    return Number(value).toLocaleString()
  }

  const formatWorkMinutes = (minutes) => {
    const value = Number(minutes || 0)

    if (value <= 0) return '-'

    const hours = Math.floor(value / 60)
    const mins = value % 60

    if (hours <= 0) return `${mins}分`
    if (mins <= 0) return `${hours}時間`
    return `${hours}時間${mins}分`
  }

  const formatPercent = (value) => {
    const numberValue = Number(value || 0)

    if (numberValue <= 0) return '-'

    return `${(numberValue * 100).toFixed(1)}%`
  }

  const formatRuleRange = (rule) => {
    if (rule.max_stamp_count === null || rule.max_stamp_count === undefined) {
      return `${rule.min_stamp_count}個以上`
    }
    return `${rule.min_stamp_count}〜${rule.max_stamp_count}個`
  }

  const getPeriodTypeLabel = (halfType) => {
    if (halfType === 'first_half') return '前半'
    if (halfType === 'second_half') return '後半'
    if (isMonthlyBonusHalfType(halfType)) return '月末ボーナス'
    if (halfType === 'first') return '前半'
    if (halfType === 'second') return '後半'
    if (halfType === '1') return '前半'
    if (halfType === '2') return '後半'
    if (halfType === '前半') return '前半'
    if (halfType === '後半') return '後半'
    return halfType || '-'
  }

  const getPeriodStatusLabel = (status) => {
    if (status === 'locked') return '確定済み'
    if (status === 'open') return '編集中'
    return status || '-'
  }

  const HeaderTwoLine = ({ top, bottom }) => (
    <span style={styles.headerTwoLine}>
      <span>{top}</span>
      <span>{bottom}</span>
    </span>
  )

  if (initialLoading) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.panel}>
            <p style={styles.loadingText}>読み込み中です...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <div style={styles.brandRow}>
              <div style={styles.brandMark}>🦌</div>
              <div>
                <h1 style={styles.title}>-Bistro-Bambi</h1>
                <p style={styles.subtitle}>給与管理ダッシュボード</p>
              </div>
            </div>
          </div>

          <nav style={styles.nav}>
            <Link href="/admin/staff/ranch" style={styles.navButton}>
              牧場管理
            </Link>
            <Link href="/admin/staff/payroll/history" style={styles.navButton}>
              給与履歴一覧
            </Link>
            <Link href="/admin/staff/payroll/monthly" style={styles.navButton}>
              月次一覧
            </Link>
            <Link href="/admin/staff/payroll/rate-rules" style={styles.navButton}>
              単価ルール
            </Link>
            <Link href="/admin/staff" style={styles.navButton}>
              従業員管理
            </Link>
            <Link href="/admin" style={styles.navButton}>
              管理メニュー
            </Link>
            <button onClick={logout} style={styles.navButton}>
              ログアウト
            </button>
          </nav>
        </header>

        {message && (
          <div style={styles.message}>
            {message}
          </div>
        )}

        <div style={styles.dashboard}>
          <aside style={styles.sidebar}>
            <section style={styles.panel}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionNumber}>01</span>
                <h2 style={styles.sectionTitle}>対象店舗</h2>
              </div>

              {store ? (
                <div style={styles.infoList}>
                  <div>
                    <div style={styles.infoLabel}>店舗コード</div>
                    <div style={styles.infoValue}>{store.store_code}</div>
                  </div>
                  <div>
                    <div style={styles.infoLabel}>店舗名</div>
                    <div style={styles.infoValue}>{store.store_name}</div>
                  </div>
                </div>
              ) : (
                <p style={styles.note}>店舗情報を取得できませんでした。</p>
              )}
            </section>

            <section style={styles.panel}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionNumber}>02</span>
                <h2 style={styles.sectionTitle}>対象年月</h2>
              </div>

              <div style={styles.formGridTwo}>
                <label>
                  <div style={styles.inputLabel}>年</div>
                  <input
                    type="number"
                    value={targetYear}
                    onChange={(e) => setTargetYear(e.target.value)}
                    style={styles.input}
                  />
                </label>

                <label>
                  <div style={styles.inputLabel}>月</div>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={targetMonth}
                    onChange={(e) => setTargetMonth(e.target.value)}
                    style={styles.input}
                  />
                </label>
              </div>

              <div style={styles.actionStack}>
                <button type="button" onClick={reloadCurrentMonth} disabled={loading} style={styles.secondaryButton}>
                  再読み込み
                </button>
                <button type="button" onClick={createPayrollPeriods} disabled={loading} style={styles.primaryButton}>
                  給与期間を作成
                </button>
              </div>
            </section>

            <section style={styles.panel}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionNumber}>03</span>
                <h2 style={styles.sectionTitle}>給与期間</h2>
              </div>

              {periods.length === 0 ? (
                <p style={styles.note}>この年月の給与期間はまだありません。</p>
              ) : (
                <div style={styles.periodList}>
                  {periods.map((period) => {
                    const isActive = String(selectedPeriodId) === String(period.payroll_period_id)
                    const isLocked = period.status === 'locked'

                    return (
                      <button
                        key={period.payroll_period_id}
                        type="button"
                        disabled={loading}
                        onClick={() => handlePeriodChange(String(period.payroll_period_id))}
                        style={{
                          ...styles.periodCard,
                          ...(isActive ? styles.periodCardActive : {}),
                          ...(isLocked ? styles.periodCardLocked : {}),
                        }}
                      >
                        <div style={styles.periodTitleRow}>
                          <div style={styles.periodTitle}>
                            {getPeriodTypeLabel(period.half_type)}
                          </div>
                          <span style={isLocked ? styles.lockedBadge : styles.openBadge}>
                            {getPeriodStatusLabel(period.status)}
                          </span>
                        </div>
                        <div style={styles.periodMeta}>
                          {formatDate(period.period_start)} ～ {formatDate(period.period_end)}
                          <br />
                          支払日: {formatDate(period.payday)}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

            <section style={styles.panel}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionNumber}>04</span>
                <h2 style={styles.sectionTitle}>単価ルール</h2>
              </div>

              {rateRuleSets.length === 0 ? (
                <p style={styles.note}>有効な単価ルールがありません。</p>
              ) : (
                <>
                  <select
                    value={selectedRateRuleSetId}
                    onChange={(e) => setSelectedRateRuleSetId(e.target.value)}
                    style={styles.select}
                    disabled={loading || isSelectedPeriodLocked}
                  >
                    {rateRuleSets.map((ruleSet) => (
                      <option
                        key={ruleSet.payroll_rate_rule_set_id}
                        value={String(ruleSet.payroll_rate_rule_set_id)}
                      >
                        {ruleSet.rule_name}
                      </option>
                    ))}
                  </select>

                  {selectedRateRuleSet && (
                    <div style={styles.ruleBox}>
                      <div style={styles.ruleName}>{selectedRateRuleSet.rule_name}</div>
                      <div style={styles.ruleDate}>
                        適用開始: {formatDate(selectedRateRuleSet.effective_from)}
                        {selectedRateRuleSet.effective_to
                          ? ` / 適用終了: ${formatDate(selectedRateRuleSet.effective_to)}`
                          : ' / 適用終了: なし'}
                      </div>

                      <div style={styles.ruleList}>
                        {selectedRateRuleSet.rules.map((rule) => (
                          <div key={rule.payroll_rate_rule_id} style={styles.ruleRow}>
                            <span>{formatRuleRange(rule)}</span>
                            <strong>{formatMoney(rule.unit_pay)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={styles.actionStack}>
                    <Link href="/admin/staff/payroll/rate-rules" style={styles.secondaryButton}>
                      単価ルール管理
                    </Link>
                    <button
                      type="button"
                      onClick={buildPreviewForSelectedPeriod}
                      disabled={loading || !selectedPeriodId || isSelectedPeriodLocked || isSelectedPeriodMonthlyBonus}
                      style={{
                        ...styles.primaryButton,
                        ...((loading || !selectedPeriodId || isSelectedPeriodLocked || isSelectedPeriodMonthlyBonus) ? styles.disabledButton : {}),
                      }}
                    >
                      {isSelectedPeriodMonthlyBonus ? '月末ボーナスは次のステップで作成' : '履歴からプレビュー生成'}
                    </button>
                  </div>
                </>
              )}
            </section>
          </aside>

          <main style={styles.main}>
            <section style={styles.summaryGrid}>
              <SummaryCard label="選択期間" value={selectedPeriod ? getPeriodTypeLabel(selectedPeriod.half_type) : '-'} sub={selectedPeriod ? `${formatDate(selectedPeriod.period_start)} ～ ${formatDate(selectedPeriod.period_end)}` : '給与期間を選択してください'} />
              <SummaryCard label="状態" value={selectedPeriod ? getPeriodStatusLabel(selectedPeriod.status) : '-'} sub={isSelectedPeriodLocked ? '支払い確認済み・編集不可' : '編集中・保存可能'} />
              <SummaryCard label={isSelectedPeriodMonthlyBonus ? 'ボーナス原資' : '総支給額'} value={isSelectedPeriodMonthlyBonus ? formatMoney(monthlyBonusPoolNumber) : formatMoney(totalCalculatedPayAmount)} sub={isSelectedPeriodMonthlyBonus ? '入力した月末ボーナス原資' : `通常 ${formatMoney(baseTotalCalculatedPayAmount)} / 牧場 ${formatMoney(totalRanchCarePayAmount)}`} />
              <SummaryCard label={isSelectedPeriodMonthlyBonus ? '月内加算合計' : '振込額合計'} value={isSelectedPeriodMonthlyBonus ? formatWorkMinutes(totalMonthlyBonusEligibleMinutesAll) : formatMoney(totalTransferAmount)} sub={isSelectedPeriodMonthlyBonus ? `対象者 ${monthlyBonusEligibleUserCount}名` : `調整額 ${formatMoney(totalAdjustmentAmount)} / 加算時間 ${formatWorkMinutes(totalStaffBonusEligibleMinutes)}`} />
            </section>

            <section style={isSelectedPeriodLocked ? styles.lockPanel : styles.panel}>
              <div style={styles.mainSectionHeader}>
                <div>
                  <h2 style={styles.mainTitle}>給与期間の確定</h2>
                  <p style={styles.mainDescription}>
                    支払い内容を確認後、給与期間を確定すると再生成・調整・金庫保存を防止できます。
                  </p>
                </div>
              </div>

              <div style={styles.lockActionGrid}>
                <div>
                  <div style={isSelectedPeriodLocked ? styles.lockStatusBadge : styles.openStatusBadge}>
                    {isSelectedPeriodLocked ? '確定済み' : '編集中'}
                  </div>
                  <p style={styles.lockDescription}>
                    {isSelectedPeriodLocked
                      ? 'この給与期間は確定済みです。修正が必要な場合のみロック解除してください。'
                      : canLockSelectedPeriod
                      ? 'この給与期間は確定できます。支払い確認後に確定してください。'
                      : lockBlockedReason}
                  </p>
                </div>

                <div style={styles.lockButtonGroup}>
                  {isSelectedPeriodLocked ? (
                    <button
                      type="button"
                      onClick={unlockSelectedPayrollPeriod}
                      disabled={loading || !selectedPeriodId}
                      style={styles.dangerButton}
                    >
                      ロック解除
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={lockSelectedPayrollPeriod}
                      disabled={loading || !canLockSelectedPeriod}
                      style={{
                        ...styles.primaryButton,
                        ...((loading || !canLockSelectedPeriod) ? styles.disabledButton : {}),
                      }}
                    >
                      給与期間を確定
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section style={styles.panel}>
              <div style={styles.mainSectionHeader}>
                <div>
                  <h2 style={styles.mainTitle}>給与プレビュー</h2>
                  <p style={styles.mainDescription}>
                    出勤履歴・スタンプ履歴・月内加算時間・牧場お世話記録から、支給額を確認します。
                  </p>
                </div>

                {!isSelectedPeriodMonthlyBonus && (
                  <div style={styles.previewInfoBox}>
                    <div style={styles.previewInfoLabel}>牧場お世話単価</div>
                    <div style={styles.previewInfoValue}>{formatMoney(ranchUnitCarePay)}</div>
                  </div>
                )}
              </div>

              {(isSelectedPeriodMonthlyBonus || runItems.length === 0) ? (
                <div style={styles.emptyBox}>
                  {isSelectedPeriodMonthlyBonus ? '月末ボーナスは下の専用画面で保存・配分します。' : '給与プレビューはまだありません。'}
                  <br />
                  {isSelectedPeriodMonthlyBonus
                    ? 'この期間では通常給与のプレビュー生成は使用しません。'
                    : '左側で給与期間と単価ルールを選択し、「履歴からプレビュー生成」を押してください。'}
                </div>
              ) : (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <colgroup>
                      <col style={{ width: '82px' }} />
                      <col style={{ width: '110px' }} />
                      <col style={{ width: '58px' }} />
                      <col style={{ width: '82px' }} />
                      <col style={{ width: '72px' }} />
                      <col style={{ width: '82px' }} />
                      <col style={{ width: '88px' }} />
                      <col style={{ width: '58px' }} />
                      <col style={{ width: '88px' }} />
                      <col style={{ width: '88px' }} />
                      <col style={{ width: '86px' }} />
                      <col style={{ width: '92px' }} />
                    </colgroup>

                    <thead>
                      <tr>
                        <th style={styles.th}>コード</th>
                        <th style={styles.th}>氏名</th>
                        <th style={styles.th}>出勤</th>
                        <th style={styles.th}><HeaderTwoLine top="今月" bottom="加算" /></th>
                        <th style={styles.th}><HeaderTwoLine top="締め時" bottom="スタンプ" /></th>
                        <th style={styles.th}>単価</th>
                        <th style={styles.th}><HeaderTwoLine top="通常" bottom="支給" /></th>
                        <th style={styles.th}><HeaderTwoLine top="牧場" bottom="回数" /></th>
                        <th style={styles.th}><HeaderTwoLine top="牧場" bottom="支給" /></th>
                        <th style={styles.th}><HeaderTwoLine top="支給" bottom="合計" /></th>
                        <th style={styles.th}>調整</th>
                        <th style={styles.transferTh}><HeaderTwoLine top="振込" bottom="合計" /></th>
                      </tr>
                    </thead>

                    <tbody>
                      {runItems.map((item) => {
                        const edit = itemEdits[item.payroll_run_item_id] || {
                          adjustmentAmount: String(item.adjustment_amount ?? 0),
                          note: item.note || '',
                        }

                        const rowLocked = isSelectedPeriodLocked || item.is_locked
                        const ranchCareCount = getRanchCareCount(item)
                        const ranchCarePayAmount = getRanchCarePayAmount(item)
                        const staffBonusEligibleMinutes = getStaffBonusEligibleMinutes(item)
                        const totalPayAmount = getTotalCalculatedPayAmount(item)
                        const totalTransfer = getTotalTransferAmount(item)

                        return (
                          <tr key={item.payroll_run_item_id}>
                            <td style={styles.tdStrong}>{item.staff_code}</td>
                            <td style={styles.td}>{item.display_name}</td>
                            <td style={styles.tdCenter}>{item.attendance_count}</td>
                            <td style={styles.tdCenter}>{formatWorkMinutes(staffBonusEligibleMinutes)}</td>
                            <td style={styles.tdCenter}>{item.stamp_count_at_close}</td>
                            <td style={styles.td}>{formatMoney(item.applied_unit_pay)}</td>
                            <td style={styles.tdStrong}>{formatMoney(item.calculated_pay_amount)}</td>
                            <td style={styles.tdCenter}>{ranchCareCount}</td>
                            <td style={styles.tdStrong}>{formatMoney(ranchCarePayAmount)}</td>
                            <td style={styles.tdStrong}>{formatMoney(totalPayAmount)}</td>
                            <td style={styles.td}>
                              <input
                                type="text"
                                value={edit.adjustmentAmount}
                                disabled={rowLocked}
                                onChange={(e) => {
                                  const value = e.target.value
                                    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
                                    .replace(/,/g, '')
                                    .replace(/[^\d-]/g, '')
                                  updateItemEdit(item.payroll_run_item_id, 'adjustmentAmount', value)
                                }}
                                onBlur={() => saveRunItemAdjustment(item)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.currentTarget.blur()
                                  }
                                }}
                                style={{
                                  ...styles.smallInput,
                                  ...(rowLocked ? styles.disabledInput : {}),
                                }}
                              />
                            </td>
                            <td style={styles.transferTd}>{formatMoney(totalTransfer)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div style={styles.bottomGrid}>
              {isSelectedPeriodMonthlyBonus ? (
                <>
                  <section style={styles.panel}>
                    <div style={styles.mainSectionHeader}>
                      <div>
                        <h2 style={styles.mainTitle}>月末ボーナス設定</h2>
                        <p style={styles.mainDescription}>
                          月末ボーナスでは、金庫額や牧場支給は使わず、ボーナス原資と月内加算時間で配分します。
                        </p>
                      </div>
                    </div>

                    <div style={styles.formGridTwo}>
                      <label>
                        <div style={styles.inputLabel}>月末ボーナス原資</div>
                        <input
                          type="text"
                          value={monthlyBonusPoolAmount}
                          onChange={handleAmountChange(setMonthlyBonusPoolAmount)}
                          disabled={isSelectedPeriodLocked}
                          style={{
                            ...styles.input,
                            ...(isSelectedPeriodLocked ? styles.disabledInput : {}),
                          }}
                          placeholder="例: 300000000"
                        />
                        <p style={styles.autoNote}>
                          この金額を、各従業員の「今月加算」の割合で配分します。
                        </p>
                      </label>

                      <label>
                        <div style={styles.inputLabel}>全員の加算時間合計</div>
                        <input
                          type="text"
                          value={formatWorkMinutes(totalMonthlyBonusEligibleMinutesAll)}
                          readOnly
                          style={styles.readOnlyInput}
                        />
                        <p style={styles.autoNote}>
                          対象者: {monthlyBonusEligibleUserCount}名 / 月内の staff_work_sessions から自動集計しています。
                        </p>
                      </label>
                    </div>

                    <div style={{ ...styles.summaryList, marginTop: '14px' }}>
                      <SummaryLine
                        label="前回支払い後金庫額"
                        value={monthlyBonusVaultBeforeDisplay !== null && monthlyBonusVaultBeforeDisplay !== undefined ? formatMoney(monthlyBonusVaultBeforeDisplay) : '未保存'}
                      />
                      <SummaryLine
                        label="月末ボーナス額"
                        value={formatMoney(monthlyBonusPoolNumber)}
                      />
                      <SummaryLine
                        label="月末ボーナス後金庫額"
                        value={monthlyBonusVaultAfterDisplay !== null && monthlyBonusVaultAfterDisplay !== undefined ? formatMoney(monthlyBonusVaultAfterDisplay) : '保存後に表示'}
                      />
                    </div>

                    <div style={styles.calcNoteBox}>
                      個人ボーナス額 = 月末ボーナス原資 × 個人の加算時間 ÷ 全員の加算時間合計
                      <br />
                      原資を0円で保存すると、保存済みの月末ボーナス配分を0円に戻せます。
                      <br />
                      例: 原資300,000,000、全員合計10時間、個人2時間の場合 → 60,000,000
                    </div>

                    <label style={{ display: 'block', marginTop: '14px' }}>
                      <div style={styles.inputLabel}>備考</div>
                      <textarea
                        value={periodMemo}
                        onChange={(e) => setPeriodMemo(e.target.value)}
                        disabled={isSelectedPeriodLocked}
                        style={{
                          ...styles.textarea,
                          ...(isSelectedPeriodLocked ? styles.disabledInput : {}),
                        }}
                        placeholder="月末ボーナスのメモなど"
                      />
                    </label>

                    <div style={{ marginTop: '16px' }}>
                      <button
                        type="button"
                        onClick={saveMonthlyBonusDistribution}
                        disabled={!canSaveMonthlyBonusDistribution}
                        style={{
                          ...styles.primaryButton,
                          ...(!canSaveMonthlyBonusDistribution ? styles.disabledButton : {}),
                        }}
                      >
                        {isSelectedPeriodLocked ? '確定済み' : '保存・配分作成'}
                      </button>
                    </div>
                  </section>

                  <section style={styles.panel}>
                    <div style={styles.mainSectionHeader}>
                      <div>
                        <h2 style={styles.mainTitle}>月末ボーナス配分プレビュー</h2>
                        <p style={styles.mainDescription}>
                          月末ボーナス原資を、今月加算時間の割合で従業員別に配分します。
                        </p>
                      </div>
                    </div>

                    <div style={styles.summaryList}>
                      <SummaryLine label="月末ボーナス原資" value={formatMoney(monthlyBonusPoolNumber)} />
                      <SummaryLine label="保存済み配分合計" value={formatMoney(selectedMonthlyBonusRun?.total_distributed_amount ?? 0)} />
                      <SummaryLine label="前回支払い後金庫額" value={monthlyBonusVaultBeforeDisplay !== null && monthlyBonusVaultBeforeDisplay !== undefined ? formatMoney(monthlyBonusVaultBeforeDisplay) : '未保存'} />
                      <SummaryLine label="月末ボーナス後金庫額" value={monthlyBonusVaultAfterDisplay !== null && monthlyBonusVaultAfterDisplay !== undefined ? formatMoney(monthlyBonusVaultAfterDisplay) : '保存後に表示'} />
                      <SummaryLine label="全員の加算時間合計" value={formatWorkMinutes(totalMonthlyBonusEligibleMinutesAll)} />
                      <SummaryLine label="加算対象者数" value={`${monthlyBonusEligibleUserCount}名`} />
                      <SummaryLine label="プレビュー配分合計" value={formatMoney(totalMonthlyBonusPreviewAmount)} />
                    </div>

                    {monthlyBonusDistributionRows.length === 0 ? (
                      <div style={{ ...styles.emptyMini, marginTop: '14px' }}>
                        月末ボーナス原資が0円の場合、従業員別の配分額は作成されません。
                        <br />
                        原資を入力すると、従業員別の配分額が表示されます。
                      </div>
                    ) : (
                      <div style={{ ...styles.tableWrap, marginTop: '14px' }}>
                        <table style={{ ...styles.table, minWidth: '620px' }}>
                          <colgroup>
                            <col style={{ width: '160px' }} />
                            <col style={{ width: '120px' }} />
                            <col style={{ width: '90px' }} />
                            <col style={{ width: '130px' }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th style={styles.th}>氏名</th>
                              <th style={styles.th}>加算時間</th>
                              <th style={styles.th}>割合</th>
                              <th style={styles.th}>ボーナス額</th>
                            </tr>
                          </thead>
                          <tbody>
                            {monthlyBonusDistributionRows.map((row) => (
                              <tr key={row.userId}>
                                <td style={styles.tdStrong}>{row.employeeName}</td>
                                <td style={styles.tdCenter}>{formatWorkMinutes(row.bonusEligibleMinutes)}</td>
                                <td style={styles.tdCenter}>{formatPercent(row.rate)}</td>
                                <td style={styles.transferTd}>{formatMoney(row.bonusAmount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <>
                  <section style={styles.panel}>
                    <div style={styles.mainSectionHeader}>
                      <div>
                        <h2 style={styles.mainTitle}>金庫・牧場・備考</h2>
                        <p style={styles.mainDescription}>
                          前回支払い後の金庫額、今回支払い前の金庫額、牧場管理から反映された牧場利益、イベント等のメモを保存します。
                        </p>
                      </div>

                      <Link href="/admin/staff/ranch" style={styles.headerLinkButton}>
                        牧場管理を開く
                      </Link>
                    </div>

                    <div style={styles.formGridTwo}>
                      <label>
                        <div style={styles.inputLabel}>前回支払い後金庫額</div>
                        <input
                          type="text"
                          value={formatMoney(previousVaultAfterAmount)}
                          readOnly
                          style={styles.readOnlyInput}
                        />
                        <p style={styles.autoNote}>{previousVaultSourceText}</p>
                      </label>

                      <label>
                        <div style={styles.inputLabel}>牧場利益（牧場管理から反映）</div>
                        <input
                          type="text"
                          value={formatMoney(ranchProfitAmount)}
                          readOnly
                          style={styles.readOnlyInput}
                        />
                        <p style={styles.autoNote}>
                          {ranchPayrollLink
                            ? `最終反映: ${formatDateTime(ranchPayrollLink.applied_at)}`
                            : 'まだ牧場管理から反映されていません。'}
                        </p>
                        {hasRanchProfitDifference && (
                          <div style={styles.ranchDiffBox}>
                            <p style={styles.ranchDiffText}>
                              保存済みの値（{formatMoney(ranchProfitAmount)}）と、牧場管理からの反映値（
                              {formatMoney(ranchPayrollLink.ranch_profit_amount)}）が異なります。
                              通常の保存では保存済みの値のままです。
                            </p>
                            <button
                              type="button"
                              onClick={applyRanchLinkToInput}
                              disabled={isSelectedPeriodLocked || loading}
                              style={styles.ranchDiffButton}
                            >
                              牧場の反映値をこの欄に入れる
                            </button>
                          </div>
                        )}
                      </label>

                      <label>
                        <div style={styles.inputLabel}>今回の支払い前金庫額</div>
                        <input
                          type="text"
                          value={vaultBeforeAmount}
                          onChange={handleAmountChange(setVaultBeforeAmount)}
                          disabled={isSelectedPeriodLocked}
                          style={{
                            ...styles.input,
                            ...(isSelectedPeriodLocked ? styles.disabledInput : {}),
                          }}
                        />
                      </label>

                      <label>
                        <div style={styles.inputLabel}>その他収入</div>
                        <input
                          type="text"
                          value={extraIncomeAmount}
                          onChange={handleAmountChange(setExtraIncomeAmount)}
                          disabled={isSelectedPeriodLocked}
                          style={{
                            ...styles.input,
                            ...(isSelectedPeriodLocked ? styles.disabledInput : {}),
                          }}
                        />
                      </label>
                    </div>

                    <div style={styles.calcNoteBox}>
                      営業利益 = 今回の支払い前金庫額 - 前回支払い後金庫額 + その他収入
                      <br />
                      経常利益 = 営業利益 + 牧場利益
                    </div>

                    <label style={{ display: 'block', marginTop: '14px' }}>
                      <div style={styles.inputLabel}>備考</div>
                      <textarea
                        value={periodMemo}
                        onChange={(e) => setPeriodMemo(e.target.value)}
                        disabled={isSelectedPeriodLocked}
                        style={{
                          ...styles.textarea,
                          ...(isSelectedPeriodLocked ? styles.disabledInput : {}),
                        }}
                        placeholder="イベント、特記事項、支払いメモなど"
                      />
                    </label>

                    <div style={{ marginTop: '16px' }}>
                      <button
                        type="button"
                        onClick={savePayrollInputs}
                        disabled={loading || !selectedPeriodId || isSelectedPeriodLocked}
                        style={{
                          ...styles.primaryButton,
                          ...((loading || !selectedPeriodId || isSelectedPeriodLocked) ? styles.disabledButton : {}),
                        }}
                      >
                        {isSelectedPeriodLocked ? '確定済み' : '入力内容を保存'}
                      </button>
                    </div>
                  </section>

                  <section style={styles.panel}>
                    <div style={styles.mainSectionHeader}>
                      <div>
                        <h2 style={styles.mainTitle}>給与期間集計</h2>
                        <p style={styles.mainDescription}>
                          保存済みの金庫・牧場情報と給与額から自動計算します。
                        </p>
                      </div>
                    </div>

                    {periodSummary ? (
                      <div style={styles.summaryList}>
                        <SummaryLine label="通常支給額" value={formatMoney(baseTotalCalculatedPayAmount)} />
                        <SummaryLine label="牧場お世話支給額" value={formatMoney(totalRanchCarePayAmount)} />
                        <SummaryLine label="総支給額" value={formatMoney(totalCalculatedPayAmount)} />
                        <SummaryLine label="振込額合計" value={formatMoney(totalTransferAmount)} />
                        <SummaryLine label="調整額合計" value={formatMoney(totalAdjustmentAmount)} />
                        <SummaryLine label="牧場利益" value={formatMoney(periodSummary.ranch_profit_amount)} />
                        <SummaryLine label="今回の支払い前金庫額" value={formatMoney(periodSummary.vault_before_amount)} />
                        <SummaryLine label="金庫 + 牧場" value={formatMoney(periodSummary.vault_plus_ranch_amount)} />
                        <SummaryLine label="支払い後金額" value={formatMoney(periodSummary.vault_after_amount)} />
                        <SummaryLine label="営業利益" value={formatMoney(periodSummary.store_profit_amount)} />
                        <SummaryLine label="経常利益" value={formatMoney(periodSummary.total_profit_amount)} />
                      </div>
                    ) : (
                      <div style={styles.emptyMini}>
                        金庫・牧場・備考を保存すると、ここに集計結果が表示されます。
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub }) {
  return (
    <div style={styles.summaryCard}>
      <div style={styles.summaryLabel}>{label}</div>
      <div style={styles.summaryValue}>{value}</div>
      <div style={styles.summarySub}>{sub}</div>
    </div>
  )
}

function SummaryLine({ label, value }) {
  return (
    <div style={styles.summaryLine}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}



const styles = {
  page: {
    minHeight: '65vh',
    background: `linear-gradient(180deg, ${theme.bg} 0%, ${theme.bg2} 100%)`,
    color: theme.text,
    padding: '24px',
  },
  container: {
    maxWidth: '1760px',
    margin: '0 auto',
  },
  header: {
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    padding: '24px 28px',
    marginBottom: '20px',
    boxShadow: 'none',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '18px',
    flexWrap: 'wrap',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  brandMark: {
    width: '58px',
    height: '58px',
    borderRadius: '4px',
    background: theme.pale,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '30px',
    border: `1px solid ${theme.border2}`,
  },
  title: {
    fontFamily: 'var(--font-heading)',
    fontSize: '38px',
    fontWeight: 900,
    color: theme.deep,
    margin: 0,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontFamily: 'var(--font-heading)',
    margin: '8px 0 0',
    fontSize: '18px',
    color: theme.muted,
  },
  nav: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
  },
  navButton: {
    padding: '12px 16px',
    fontSize: '15px',
    fontWeight: 800,
    borderRadius: '4px',
    border: `1px solid ${theme.border2}`,
    background: theme.white,
    color: theme.deep,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  },
  message: {
    marginBottom: '18px',
    fontSize: '16px',
    fontWeight: 800,
    color: theme.deep,
    background: theme.white,
    padding: '14px 16px',
    borderRadius: '4px',
    border: `1px solid ${theme.border}`,
    whiteSpace: 'pre-wrap',
  },
  dashboard: {
    display: 'grid',
    gridTemplateColumns: '360px minmax(0, 1fr)',
    gap: '20px',
    alignItems: 'start',
  },
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    position: 'sticky',
    top: '16px',
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    minWidth: 0,
  },
  panel: {
    background: theme.panel,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    padding: '20px',
    boxShadow: 'none',
  },
  lockPanel: {
    background: theme.pale,
    border: `1px solid ${theme.border2}`,
    borderRadius: '4px',
    padding: '20px',
    boxShadow: 'none',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '14px',
  },
  sectionNumber: {
    fontSize: '13px',
    fontWeight: 900,
    color: theme.white,
    background: theme.green,
    borderRadius: '4px',
    padding: '5px 9px',
    lineHeight: 1,
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 900,
    color: theme.deep,
    margin: 0,
  },
  mainSectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '16px',
  },
  mainTitle: {
    fontSize: '24px',
    fontWeight: 900,
    color: theme.deep,
    margin: 0,
  },
  mainDescription: {
    fontSize: '15px',
    color: theme.muted,
    lineHeight: 1.7,
    margin: '6px 0 0',
  },
  headerLinkButton: {
    padding: '11px 14px',
    fontSize: '14px',
    fontWeight: 900,
    borderRadius: '4px',
    border: `1px solid ${theme.border2}`,
    background: theme.white,
    color: theme.deep,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
  },
  previewInfoBox: {
    background: theme.white,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    padding: '10px 12px',
    minWidth: '160px',
  },
  previewInfoLabel: {
    fontSize: '11px',
    color: theme.muted,
    fontWeight: 900,
    marginBottom: '5px',
  },
  previewInfoValue: {
    fontSize: '18px',
    color: theme.deep,
    fontWeight: 950,
  },
  infoList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  infoLabel: {
    fontSize: '12px',
    fontWeight: 900,
    color: theme.muted,
    marginBottom: '4px',
  },
  infoValue: {
    fontSize: '18px',
    fontWeight: 900,
    color: theme.text,
  },
  note: {
    fontSize: '15px',
    color: theme.muted,
    lineHeight: 1.7,
    margin: 0,
  },
  formGridTwo: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  inputLabel: {
    fontSize: '12px',
    color: theme.muted,
    fontWeight: 900,
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 13px',
    fontSize: '16px',
    borderRadius: '4px',
    border: `1px solid ${theme.border2}`,
    background: theme.white,
    color: theme.text,
    outline: 'none',
  },
  disabledInput: {
    background: theme.panel2,
    color: theme.muted,
    cursor: 'not-allowed',
  },
  readOnlyInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 13px',
    fontSize: '16px',
    borderRadius: '4px',
    border: `1px solid ${theme.border}`,
    background: theme.pale,
    color: theme.deep,
    outline: 'none',
    fontWeight: 900,
  },
  autoNote: {
    margin: '7px 0 0',
    fontSize: '12px',
    color: theme.muted,
    lineHeight: 1.5,
    fontWeight: 800,
  },
  ranchDiffBox: {
    marginTop: '8px',
    padding: '10px 12px',
    border: '1px solid #e0b252',
    borderRadius: '10px',
    background: '#fff7e0',
  },
  ranchDiffText: {
    margin: '0 0 8px',
    fontSize: '12px',
    lineHeight: 1.6,
    fontWeight: 800,
    color: '#7a5200',
  },
  ranchDiffButton: {
    padding: '7px 12px',
    borderRadius: '8px',
    border: '1px solid #b07d1a',
    background: '#ffffff',
    color: '#7a5200',
    fontWeight: 800,
    cursor: 'pointer',
  },
  select: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 13px',
    fontSize: '15px',
    borderRadius: '4px',
    border: `1px solid ${theme.border2}`,
    background: theme.white,
    color: theme.text,
    outline: 'none',
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 13px',
    fontSize: '15px',
    borderRadius: '4px',
    border: `1px solid ${theme.border2}`,
    background: theme.white,
    color: theme.text,
    outline: 'none',
    minHeight: '100px',
    resize: 'vertical',
    lineHeight: 1.7,
  },
  actionStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginTop: '14px',
  },
  primaryButton: {
    width: '100%',
    justifyContent: 'center',
    padding: '13px 16px',
    fontSize: '15px',
    fontWeight: 900,
    borderRadius: '4px',
    border: 'none',
    background: theme.green,
    color: theme.white,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    boxShadow: 'none',
  },
  secondaryButton: {
    width: '100%',
    justifyContent: 'center',
    padding: '12px 16px',
    fontSize: '15px',
    fontWeight: 900,
    borderRadius: '4px',
    border: `1px solid ${theme.border2}`,
    background: theme.white,
    color: theme.deep,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  },
  dangerButton: {
    width: '100%',
    justifyContent: 'center',
    padding: '13px 16px',
    fontSize: '15px',
    fontWeight: 900,
    borderRadius: '4px',
    border: `1px solid ${theme.border2}`,
    background: theme.white,
    color: theme.danger,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.62,
    cursor: 'not-allowed',
  },
  periodList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  periodCard: {
    textAlign: 'left',
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    background: theme.white,
    padding: '14px',
    cursor: 'pointer',
  },
  periodCardActive: {
    border: `2px solid ${theme.green}`,
    background: theme.pale,
  },
  periodCardLocked: {
    background: theme.panel2,
  },
  periodTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '10px',
    alignItems: 'center',
    marginBottom: '6px',
  },
  periodTitle: {
    fontSize: '18px',
    fontWeight: 900,
    color: theme.deep,
  },
  periodMeta: {
    fontSize: '13px',
    color: theme.muted,
    lineHeight: 1.6,
  },
  openBadge: {
    padding: '4px 8px',
    borderRadius: '4px',
    background: theme.white,
    border: `1px solid ${theme.border2}`,
    color: theme.deep,
    fontSize: '11px',
    fontWeight: 900,
    whiteSpace: 'nowrap',
  },
  lockedBadge: {
    padding: '4px 8px',
    borderRadius: '4px',
    background: theme.green,
    color: theme.white,
    fontSize: '11px',
    fontWeight: 900,
    whiteSpace: 'nowrap',
  },
  ruleBox: {
    marginTop: '12px',
    background: theme.white,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    padding: '14px',
  },
  ruleName: {
    fontSize: '16px',
    fontWeight: 900,
    color: theme.deep,
    lineHeight: 1.5,
  },
  ruleDate: {
    fontSize: '12px',
    color: theme.muted,
    marginTop: '6px',
    lineHeight: 1.6,
  },
  ruleList: {
    marginTop: '10px',
    display: 'flex',
    flexDirection: 'column',
  },
  ruleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '8px 0',
    borderTop: `1px solid ${theme.border}`,
    fontSize: '14px',
    color: theme.text,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '14px',
  },
  summaryCard: {
    background: theme.panel,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    padding: '18px',
    boxShadow: 'none',
  },
  summaryLabel: {
    fontSize: '12px',
    fontWeight: 900,
    color: theme.muted,
    marginBottom: '8px',
  },
  summaryValue: {
    fontSize: '27px',
    fontWeight: 950,
    color: theme.deep,
    lineHeight: 1.2,
  },
  summarySub: {
    fontSize: '12px',
    color: theme.muted,
    marginTop: '8px',
    lineHeight: 1.5,
  },
  lockActionGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 220px',
    gap: '16px',
    alignItems: 'center',
  },
  lockStatusBadge: {
    display: 'inline-flex',
    padding: '6px 11px',
    borderRadius: '4px',
    background: theme.green,
    color: theme.white,
    fontSize: '13px',
    fontWeight: 950,
    marginBottom: '8px',
  },
  openStatusBadge: {
    display: 'inline-flex',
    padding: '6px 11px',
    borderRadius: '4px',
    background: theme.white,
    color: theme.deep,
    border: `1px solid ${theme.border2}`,
    fontSize: '13px',
    fontWeight: 950,
    marginBottom: '8px',
  },
  lockDescription: {
    fontSize: '14px',
    color: theme.muted,
    lineHeight: 1.7,
    margin: 0,
  },
  lockButtonGroup: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  emptyBox: {
    background: theme.white,
    border: `1px dashed ${theme.border2}`,
    borderRadius: '4px',
    padding: '42px 24px',
    textAlign: 'center',
    color: theme.muted,
    fontSize: '17px',
    lineHeight: 1.8,
  },
  emptyMini: {
    background: theme.white,
    border: `1px dashed ${theme.border2}`,
    borderRadius: '4px',
    padding: '24px',
    color: theme.muted,
    fontSize: '15px',
    lineHeight: 1.7,
  },
  tableWrap: {
    overflowX: 'auto',
    background: theme.white,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
    minWidth: '1096px',
  },
  th: {
    background: theme.pale,
    color: theme.deep,
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: `1px solid ${theme.border2}`,
    whiteSpace: 'normal',
    fontSize: '12px',
    fontWeight: 900,
    lineHeight: 1.25,
  },
  transferTh: {
    background: theme.transferBg,
    color: theme.deep,
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: `1px solid ${theme.transferBorder}`,
    whiteSpace: 'normal',
    fontSize: '12px',
    fontWeight: 950,
    lineHeight: 1.25,
  },
  headerTwoLine: {
    display: 'inline-flex',
    flexDirection: 'column',
    gap: '2px',
    lineHeight: 1.15,
  },
  td: {
    padding: '11px 8px',
    borderBottom: `1px solid ${theme.border}`,
    whiteSpace: 'nowrap',
    fontSize: '13px',
    color: theme.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  tdStrong: {
    padding: '11px 8px',
    borderBottom: `1px solid ${theme.border}`,
    whiteSpace: 'nowrap',
    fontSize: '13px',
    color: theme.deep,
    fontWeight: 900,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  tdCenter: {
    padding: '11px 8px',
    borderBottom: `1px solid ${theme.border}`,
    whiteSpace: 'nowrap',
    fontSize: '13px',
    color: theme.text,
    textAlign: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  transferTd: {
    padding: '11px 8px',
    borderBottom: `1px solid ${theme.transferBorder}`,
    whiteSpace: 'nowrap',
    fontSize: '13px',
    color: theme.deep,
    background: theme.transferBg,
    fontWeight: 950,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  smallInput: {
    width: '74px',
    boxSizing: 'border-box',
    padding: '8px 8px',
    fontSize: '13px',
    borderRadius: '4px',
    border: `1px solid ${theme.border2}`,
    background: theme.white,
    color: theme.text,
    outline: 'none',
  },
  bottomGrid: {
    display: 'grid',
    gridTemplateColumns: '1.15fr 0.85fr',
    gap: '18px',
    alignItems: 'start',
  },
  calcNoteBox: {
    marginTop: '14px',
    background: theme.white,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    padding: '12px 14px',
    color: theme.muted,
    fontSize: '13px',
    fontWeight: 800,
    lineHeight: 1.8,
  },
  summaryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    background: theme.white,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    overflow: 'hidden',
  },
  summaryLine: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
    padding: '13px 14px',
    borderBottom: `1px solid ${theme.border}`,
    fontSize: '14px',
    color: theme.text,
  },
  loadingText: {
    fontSize: '18px',
    margin: 0,
    color: theme.muted,
  },
}