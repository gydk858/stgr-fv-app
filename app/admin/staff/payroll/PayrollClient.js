'use client'

import s from '@/components/v2/v2.module.css'

import { useEffect, useMemo, useState } from 'react'
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

  // 月の切り替え（‹ ›）。年月を決めてから、その月の給与期間を読み直す
  const moveMonth = async (delta) => {
    if (!store?.store_id || loading) return
    const base = new Date(Number(targetYear), Number(targetMonth) - 1 + delta, 1)
    const year = base.getFullYear()
    const month = base.getMonth() + 1
    setTargetYear(year)
    setTargetMonth(month)
    setLoading(true)
    setMessage('')
    try {
      await fetchPayrollPeriods(store.store_id, year, month)
    } catch (error) {
      console.error(error)
      setMessage(`給与期間の取得に失敗しました: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const sortedPeriods = [...periods].sort(
    (a, b) => getPayrollPeriodSortOrder(a.half_type) - getPayrollPeriodSortOrder(b.half_type)
  )

  const steps = isSelectedPeriodMonthlyBonus
    ? ['ボーナス原資を入力', '配分を確認して保存', '支払って確定']
    : ['金庫と利益を入力', '明細を確認・調整', '支払って確定']
  const currentStep = isSelectedPeriodLocked
    ? 3
    : isSelectedPeriodMonthlyBonus
    ? (selectedMonthlyBonusRun ? 3 : monthlyBonusPoolNumber > 0 ? 2 : 1)
    : (runItems.length > 0 && periodSummary ? 3 : periodSummary ? 2 : 1)

  if (initialLoading) {
    return <div className={s.card}><p className={s.muted}>読み込み中です...</p></div>
  }

  const lockCard = (
    <section className={s.cardDark} aria-labelledby="payroll-lock">
      <h2 id="payroll-lock" className={s.h2}>3 支払って確定</h2>
      {!isSelectedPeriodMonthlyBonus && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 14, color: '#c7d1c4' }}>振込の合計</span>
          <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 26, color: '#e4d1a6' }}>{formatMoney(totalTransferAmount)}</span>
        </div>
      )}
      {isSelectedPeriodMonthlyBonus && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 14, color: '#c7d1c4' }}>保存済みの配分合計</span>
          <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 26, color: '#e4d1a6' }}>{formatMoney(selectedMonthlyBonusRun?.total_distributed_amount ?? 0)}</span>
        </div>
      )}
      <p style={{ margin: 0, fontSize: 13, color: '#c7d1c4' }}>
        {isSelectedPeriodLocked
          ? 'この給与期間は確定済みです。修正が必要なときだけ確定を解除してください。'
          : canLockSelectedPeriod
          ? 'ゲーム内で支払いを終えてから確定してください。確定すると、明細・調整・金庫などの入力は変更できなくなります。'
          : lockBlockedReason}
      </p>
      {isSelectedPeriodLocked ? (
        <button type="button" className={s.btnDanger} style={{ background: '#fffdf9' }} onClick={unlockSelectedPayrollPeriod} disabled={loading || !selectedPeriodId}>
          確定を解除する
        </button>
      ) : (
        <button type="button" className={s.btnSand} onClick={lockSelectedPayrollPeriod} disabled={loading || !canLockSelectedPeriod}>
          この期間を確定する
        </button>
      )}
    </section>
  )

  return (
    <>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className={s.kicker}>Payroll</span>
            <h1 className={s.title}>給与</h1>
          </div>
          <a href="/admin/staff/payroll/legacy" style={{ fontSize: 13 }}>旧画面で開く</a>
        </div>
        <nav className={s.tabs} aria-label="給与の画面">
          <a href="/admin/staff/payroll" className={`${s.tab} ${s.tabActive}`} aria-current="page">給与計算</a>
          <a href="/admin/staff/payroll/monthly" className={s.tab}>月次給与</a>
          <a href="/admin/staff/payroll/history" className={s.tab}>給与履歴</a>
          <a href="/admin/staff/payroll/rate-rules" className={s.tab}>単価ルール</a>
        </nav>
      </header>

      {message && (
        <div className={s.notice} role="status">
          <span>{message}</span>
          <button type="button" className={s.noticeClose} aria-label="お知らせを閉じる" onClick={() => setMessage('')}>×</button>
        </div>
      )}

      <section className={s.card} aria-label="給与期間" style={{ gap: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" className={s.iconBtn} aria-label="前の月" onClick={() => moveMonth(-1)} disabled={loading}>‹</button>
            <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 22, color: '#22352b', padding: '0 8px' }}>
              {targetYear}年{targetMonth}月
            </span>
            <button type="button" className={s.iconBtn} aria-label="次の月" onClick={() => moveMonth(1)} disabled={loading}>›</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              単価ルール
              <select
                className={s.select}
                value={selectedRateRuleSetId}
                onChange={(e) => setSelectedRateRuleSetId(e.target.value)}
                disabled={loading || isSelectedPeriodLocked || rateRuleSets.length === 0}
                style={{ minHeight: 40, fontSize: 14 }}
              >
                {rateRuleSets.length === 0 && <option value="">有効な単価ルールがありません</option>}
                {rateRuleSets.map((ruleSet) => (
                  <option key={ruleSet.payroll_rate_rule_set_id} value={String(ruleSet.payroll_rate_rule_set_id)}>
                    {ruleSet.rule_name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className={`${s.btn} ${s.btnSmall}`} onClick={reloadCurrentMonth} disabled={loading}>再読み込み</button>
          </div>
        </div>

        {sortedPeriods.length === 0 ? (
          <div className={s.empty}>
            この月の給与期間はまだありません。
            <div style={{ marginTop: 12 }}>
              <button type="button" className={s.btnPrimary} onClick={createPayrollPeriods} disabled={loading}>この月の給与期間を作る</button>
            </div>
          </div>
        ) : (
          <div role="radiogroup" aria-label="給与期間" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {sortedPeriods.map((period) => {
              const active = String(selectedPeriodId) === String(period.payroll_period_id)
              const locked = period.status === 'locked'
              return (
                <button
                  key={period.payroll_period_id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={loading}
                  onClick={() => handlePeriodChange(String(period.payroll_period_id))}
                  style={{
                    textAlign: 'left', cursor: 'pointer', font: 'inherit',
                    padding: '12px 14px', borderRadius: 14,
                    border: active ? '2px solid #2f4a3a' : '1px solid #e4dacb',
                    background: active ? '#eef2ea' : '#fffdf9',
                    display: 'flex', flexDirection: 'column', gap: 2,
                  }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 16, color: '#22352b' }}>{getPeriodTypeLabel(period.half_type)}</span>
                    <span className={`${s.pill} ${locked ? s.pillLocked : s.pillOpen}`}>{getPeriodStatusLabel(period.status)}</span>
                  </span>
                  <span style={{ fontSize: 13, color: '#6f665c' }}>
                    {formatDate(period.period_start)} 〜 {formatDate(period.period_end)} ・ 支払日 {formatDate(period.payday)}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {selectedRateRuleSet && (
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#6f665c' }}>
              単価ルール「{selectedRateRuleSet.rule_name}」の内容（適用開始 {formatDate(selectedRateRuleSet.effective_from)}
              {selectedRateRuleSet.effective_to ? ` ／ 終了 ${formatDate(selectedRateRuleSet.effective_to)}` : ''}）
            </summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {selectedRateRuleSet.rules.map((rule) => (
                <span key={rule.payroll_rate_rule_id} style={{ padding: '4px 12px', background: '#faf6ee', border: '1px solid #e4dacb', borderRadius: 999, fontSize: 13 }}>
                  {formatRuleRange(rule)}：<b>{formatMoney(rule.unit_pay)}</b>
                </span>
              ))}
            </div>
          </details>
        )}
      </section>

      {selectedPeriod && (
        <ol aria-label="作業の流れ" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {steps.map((label, index) => {
            const done = index + 1 < currentStep || isSelectedPeriodLocked
            const now = index + 1 === currentStep && !isSelectedPeriodLocked
            return (
              <li
                key={label}
                aria-current={now ? 'step' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 14,
                  background: now ? '#2f4a3a' : '#fffdf9',
                  color: now ? '#fbf6ec' : '#3d3a34',
                  border: now ? '0' : '1px solid #e4dacb',
                }}
              >
                <span style={{
                  width: 28, height: 28, borderRadius: 999, flex: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
                  background: now ? '#dcc79e' : done ? '#e7eee4' : '#eef2ea',
                  color: now ? '#22352b' : '#2f4a3a',
                }}>{done ? '✓' : index + 1}</span>
                {label}
              </li>
            )
          })}
        </ol>
      )}

      {selectedPeriod && !isSelectedPeriodMonthlyBonus && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
          <section className={s.card} aria-labelledby="payroll-items" style={{ flex: '999 1 640px', minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <h2 id="payroll-items" className={s.h2}>2 明細を確認・調整</h2>
              <button
                type="button"
                className={`${s.btn} ${s.btnSmall}`}
                onClick={buildPreviewForSelectedPeriod}
                disabled={loading || !selectedPeriodId || isSelectedPeriodLocked}
              >
                {runItems.length > 0 ? '出勤記録から明細を作り直す' : '出勤記録から明細を作る'}
              </button>
            </div>

            {runItems.length === 0 ? (
              <div className={s.empty}>明細はまだありません。単価ルールを確かめて「出勤記録から明細を作る」を押してください。</div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table} style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th scope="col">従業員</th>
                      <th scope="col">出勤</th>
                      <th scope="col">締め時<br />スタンプ</th>
                      <th scope="col">単価</th>
                      <th scope="col">通常支給</th>
                      <th scope="col">牧場<br />回数</th>
                      <th scope="col">牧場支給</th>
                      <th scope="col">支給合計</th>
                      <th scope="col">調整</th>
                      <th scope="col" className={s.colStrongHead}>振込額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runItems.map((item) => {
                      const edit = itemEdits[item.payroll_run_item_id] || {
                        adjustmentAmount: String(item.adjustment_amount ?? 0),
                        note: item.note || '',
                      }
                      const rowLocked = isSelectedPeriodLocked || item.is_locked
                      const minutes = getStaffBonusEligibleMinutes(item)
                      return (
                        <tr key={item.payroll_run_item_id}>
                          <th scope="row" style={{ fontWeight: 500 }}>
                            {item.display_name}
                            <span className={s.subText}>{item.staff_code}{minutes > 0 ? ` ・ 今月加算 ${formatWorkMinutes(minutes)}` : ''}</span>
                          </th>
                          <td>{item.attendance_count}</td>
                          <td>{item.stamp_count_at_close}</td>
                          <td>{formatMoney(item.applied_unit_pay)}</td>
                          <td>{formatMoney(item.calculated_pay_amount)}</td>
                          <td>{getRanchCareCount(item)}</td>
                          <td>{formatMoney(getRanchCarePayAmount(item))}</td>
                          <td>{formatMoney(getTotalCalculatedPayAmount(item))}</td>
                          <td>
                            <input
                              type="text"
                              inputMode="numeric"
                              aria-label={`${item.display_name}の調整額`}
                              className={s.cellInput}
                              value={edit.adjustmentAmount}
                              disabled={rowLocked}
                              onChange={(e) => {
                                const value = e.target.value
                                  .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
                                  .replace(/,/g, '')
                                  .replace(/[^\d-]/g, '')
                                updateItemEdit(item.payroll_run_item_id, 'adjustmentAmount', value)
                              }}
                              onBlur={() => saveRunItemAdjustment(item)}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            />
                          </td>
                          <td className={s.colStrong}>{formatMoney(getTotalTransferAmount(item))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">合計 {runItems.length}人</th>
                      <td>{runItems.reduce((sum, item) => sum + Number(item.attendance_count || 0), 0)}</td>
                      <td></td>
                      <td></td>
                      <td>{formatMoney(baseTotalCalculatedPayAmount)}</td>
                      <td>{runItems.reduce((sum, item) => sum + getRanchCareCount(item), 0)}</td>
                      <td>{formatMoney(totalRanchCarePayAmount)}</td>
                      <td>{formatMoney(totalCalculatedPayAmount)}</td>
                      <td>{formatMoney(totalAdjustmentAmount)}</td>
                      <td className={s.colStrongFoot}>{formatMoney(totalTransferAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className={s.muted}>
              調整額は入力欄を離れるか Enter で保存されます。単価は、締め時点の今月の出勤スタンプ数で決まります（後半も月初からの累計）。
              牧場お世話単価：{formatMoney(ranchUnitCarePay)}
            </p>
          </section>

          <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <section className={s.card} aria-labelledby="payroll-vault">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <h2 id="payroll-vault" className={s.h2}>1 金庫と利益を入力</h2>
                <a href="/admin/staff/ranch" style={{ fontSize: 13 }}>牧場を開く</a>
              </div>
              <label className={s.field}>
                今回の支払い前金庫額
                <input className={s.input} type="text" inputMode="numeric" value={vaultBeforeAmount} onChange={handleAmountChange(setVaultBeforeAmount)} disabled={isSelectedPeriodLocked} />
              </label>
              <label className={s.field}>
                その他収入
                <input className={s.input} type="text" inputMode="numeric" value={extraIncomeAmount} onChange={handleAmountChange(setExtraIncomeAmount)} disabled={isSelectedPeriodLocked} />
              </label>
              <div className={s.readonly}><span>前回支払い後金庫額（自動）</span><span>{formatMoney(previousVaultAfterAmount)}</span></div>
              <p className={s.muted} style={{ marginTop: -8 }}>{previousVaultSourceText}</p>
              <div className={s.warnBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, fontWeight: 700, color: '#2b2925' }}>
                  <span>牧場利益</span><span>{formatMoney(ranchProfitAmount)}</span>
                </div>
                <span>{ranchPayrollLink ? `牧場管理からの最終反映：${formatDateTime(ranchPayrollLink.applied_at)}` : 'まだ牧場管理から反映されていません。'}</span>
                {hasRanchProfitDifference && (
                  <>
                    <span>
                      保存済みの値（{formatMoney(ranchProfitAmount)}）と、牧場管理からの反映値（{formatMoney(ranchPayrollLink.ranch_profit_amount)}）が異なります。通常の保存では保存済みの値のままです。
                    </span>
                    <button type="button" className={`${s.btn} ${s.btnSmall}`} style={{ alignSelf: 'flex-start' }} onClick={applyRanchLinkToInput} disabled={isSelectedPeriodLocked || loading}>
                      牧場の反映値をこの欄に入れる
                    </button>
                  </>
                )}
              </div>
              <label className={s.field}>
                備考
                <textarea className={s.textarea} value={periodMemo} onChange={(e) => setPeriodMemo(e.target.value)} disabled={isSelectedPeriodLocked} placeholder="イベント、特記事項、支払いメモなど" />
              </label>
              <button type="button" className={s.btnPrimary} onClick={savePayrollInputs} disabled={loading || !selectedPeriodId || isSelectedPeriodLocked}>
                {isSelectedPeriodLocked ? '確定済み' : '入力内容を保存'}
              </button>
              {periodSummary ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  {[
                    ['営業利益', periodSummary.store_profit_amount],
                    ['経常利益', periodSummary.total_profit_amount],
                    ['金庫＋牧場', periodSummary.vault_plus_ranch_amount],
                    ['支払い後の金庫', periodSummary.vault_after_amount],
                  ].map(([label, value]) => (
                    <div key={label} style={{ padding: '10px 12px', background: '#eef2ea', borderRadius: 12, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 12, color: '#34503a' }}>{label}</span>
                      <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 18, color: '#22352b' }}>{formatMoney(value)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={s.muted}>保存すると、営業利益・経常利益などがここに表示されます。</p>
              )}
              <p className={s.muted}>営業利益 ＝ 今回の支払い前金庫額 − 前回支払い後金庫額 ＋ その他収入 ／ 経常利益 ＝ 営業利益 ＋ 牧場利益</p>
            </section>

            {lockCard}
          </div>
        </div>
      )}

      {selectedPeriod && isSelectedPeriodMonthlyBonus && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
          <section className={s.card} aria-labelledby="bonus-preview" style={{ flex: '999 1 560px', minWidth: 0 }}>
            <h2 id="bonus-preview" className={s.h2}>2 配分を確認して保存</h2>
            <p className={s.muted}>
              原資を、各従業員の今月の加算対象時間の割合で配分します。個人の額 ＝ 原資 × 個人の加算時間 ÷ 全員の加算時間の合計。
              保存済みの原資と配分はそのまま表示し、画面を開いただけでは計算し直しません。
            </p>
            {monthlyBonusDistributionRows.length === 0 ? (
              <div className={s.empty}>原資が0円のときは、従業員別の配分は作られません。原資を入力すると配分が表示されます。</div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table} style={{ minWidth: 560 }}>
                  <thead>
                    <tr>
                      <th scope="col">従業員</th>
                      <th scope="col">加算時間</th>
                      <th scope="col">割合</th>
                      <th scope="col" className={s.colStrongHead}>ボーナス額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyBonusDistributionRows.map((row) => (
                      <tr key={row.userId}>
                        <th scope="row" style={{ fontWeight: 500 }}>{row.employeeName}</th>
                        <td>{formatWorkMinutes(row.bonusEligibleMinutes)}</td>
                        <td>{formatPercent(row.rate)}</td>
                        <td className={s.colStrong}>{formatMoney(row.bonusAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">合計 {monthlyBonusEligibleUserCount}人</th>
                      <td>{formatWorkMinutes(totalMonthlyBonusEligibleMinutesAll)}</td>
                      <td></td>
                      <td className={s.colStrongFoot}>{formatMoney(totalMonthlyBonusPreviewAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <section className={s.card} aria-labelledby="bonus-pool">
              <h2 id="bonus-pool" className={s.h2}>1 ボーナス原資を入力</h2>
              <label className={s.field}>
                月末ボーナス原資
                <input className={s.input} type="text" inputMode="numeric" value={monthlyBonusPoolAmount} onChange={handleAmountChange(setMonthlyBonusPoolAmount)} disabled={isSelectedPeriodLocked} placeholder="例: 300000000" />
              </label>
              <div className={s.readonly}><span>全員の加算時間の合計</span><span>{formatWorkMinutes(totalMonthlyBonusEligibleMinutesAll)}（{monthlyBonusEligibleUserCount}人）</span></div>
              <div className={s.readonly}><span>前回支払い後金庫額</span><span>{monthlyBonusVaultBeforeDisplay !== null && monthlyBonusVaultBeforeDisplay !== undefined ? formatMoney(monthlyBonusVaultBeforeDisplay) : '未保存'}</span></div>
              <div className={s.readonly}><span>月末ボーナス後金庫額</span><span>{monthlyBonusVaultAfterDisplay !== null && monthlyBonusVaultAfterDisplay !== undefined ? formatMoney(monthlyBonusVaultAfterDisplay) : '保存後に表示'}</span></div>
              <label className={s.field}>
                備考
                <textarea className={s.textarea} value={periodMemo} onChange={(e) => setPeriodMemo(e.target.value)} disabled={isSelectedPeriodLocked} placeholder="月末ボーナスのメモなど" />
              </label>
              <button type="button" className={s.btnPrimary} onClick={saveMonthlyBonusDistribution} disabled={!canSaveMonthlyBonusDistribution}>
                {isSelectedPeriodLocked ? '確定済み' : '保存して配分を作る'}
              </button>
              <p className={s.muted}>原資を0円で保存すると、保存済みの配分を0円に戻せます。</p>
            </section>

            {lockCard}
          </div>
        </div>
      )}

      {!selectedPeriod && sortedPeriods.length > 0 && (
        <div className={s.empty}>上の給与期間から、作業する期間を選んでください。</div>
      )}
    </>
  )
}
