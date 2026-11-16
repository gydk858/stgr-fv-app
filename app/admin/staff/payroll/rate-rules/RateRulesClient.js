'use client'

import s from '@/components/v2/v2.module.css'

import { useEffect, useMemo, useState } from 'react'
import { adminGet, adminPost } from '@/lib/admin-api'

export default function RateRulesClient() {
  const today = new Date().toISOString().slice(0, 10)

  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [store, setStore] = useState(null)
  const [ruleSets, setRuleSets] = useState([])

  const [editingRuleSetId, setEditingRuleSetId] = useState(null)
  const [ruleName, setRuleName] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(today)
  const [effectiveTo, setEffectiveTo] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [note, setNote] = useState('')
  const [unitPay05, setUnitPay05] = useState('3000000')
  const [unitPay610, setUnitPay610] = useState('6000000')
  const [unitPay11Plus, setUnitPay11Plus] = useState('10000000')

  const editingRuleSet = useMemo(() => {
    if (!editingRuleSetId) return null
    return ruleSets.find(
      (ruleSet) =>
        String(ruleSet.payroll_rate_rule_set_id) === String(editingRuleSetId)
    )
  }, [editingRuleSetId, ruleSets])

  useEffect(() => {
    initialize()
  }, [])

  const initialize = async () => {
    setInitialLoading(true)
    setMessage('')

    try {
      // 店舗は単価ルールの API が返す（サーバーが current_store_code から決める）。
      await fetchRateRuleSets()
      resetForm()
    } catch (error) {
      console.error(error)
      setMessage(`初期表示に失敗しました: ${error.message}`)
    } finally {
      setInitialLoading(false)
    }
  }

  // 店舗はサーバーが決める（呼び出し側が渡す店舗IDは使わない）。
  const fetchRateRuleSets = async () => {
    let ruleSetsOnly = []
    let ruleRows = []

    try {
      const { store: storeData, rule_sets, rules } = await adminGet('/api/admin-payroll', { view: 'rate_rules' })
      if (storeData) setStore(storeData)
      ruleSetsOnly = rule_sets || []
      ruleRows = rules || []
    } catch (fetchError) {
      console.error(fetchError)
      setMessage(`単価ルールセットの取得に失敗しました: ${fetchError.message}`)
      return []
    }

    const rulesBySetId = ruleRows.reduce((map, rule) => {
      const key = String(rule.payroll_rate_rule_set_id)
      if (!map[key]) map[key] = []
      map[key].push(rule)
      return map
    }, {})

    const merged = ruleSetsOnly.map((ruleSet) => ({
      ...ruleSet,
      rules: rulesBySetId[String(ruleSet.payroll_rate_rule_set_id)] || [],
    }))

    setRuleSets(merged)
    return merged
  }

  const resetForm = () => {
    setEditingRuleSetId(null)
    setRuleName('Bistro-Bambi 給与ルール')
    setEffectiveFrom(today)
    setEffectiveTo('')
    setIsActive(true)
    setNote('')
    setUnitPay05('3000000')
    setUnitPay610('6000000')
    setUnitPay11Plus('10000000')
  }

  const getRuleByRange = (ruleSet, min, max) => {
    return ruleSet?.rules?.find((rule) => {
      const sameMin = Number(rule.min_stamp_count) === Number(min)

      if (max === null) {
        return sameMin && (rule.max_stamp_count === null || rule.max_stamp_count === undefined)
      }

      return sameMin && Number(rule.max_stamp_count) === Number(max)
    })
  }

  const startEdit = (ruleSet) => {
    const rule05 = getRuleByRange(ruleSet, 0, 5)
    const rule610 = getRuleByRange(ruleSet, 6, 10)
    const rule11Plus = getRuleByRange(ruleSet, 11, null)

    setEditingRuleSetId(ruleSet.payroll_rate_rule_set_id)
    setRuleName(ruleSet.rule_name || '')
    setEffectiveFrom(formatDate(ruleSet.effective_from))
    setEffectiveTo(ruleSet.effective_to ? formatDate(ruleSet.effective_to) : '')
    setIsActive(Boolean(ruleSet.is_active))
    setNote(ruleSet.note || '')
    setUnitPay05(String(rule05?.unit_pay ?? 3000000))
    setUnitPay610(String(rule610?.unit_pay ?? 6000000))
    setUnitPay11Plus(String(rule11Plus?.unit_pay ?? 10000000))
    setMessage(`${ruleSet.rule_name} を編集中です`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

  const saveRuleSet = async () => {
    if (!store?.store_id) {
      setMessage('店舗情報が取得できていません')
      return
    }

    setLoading(true)
    setMessage('単価ルールを保存中です...')

    try {
      const trimmedName = ruleName.trim()

      if (!trimmedName) {
        throw new Error('ルール名を入力してください')
      }

      if (!effectiveFrom) {
        throw new Error('適用開始日を入力してください')
      }

      await adminPost('/api/admin-payroll', {
        action: 'save_rate_rule_set',
        payroll_rate_rule_set_id: editingRuleSetId ? Number(editingRuleSetId) : null,
        rule_name: trimmedName,
        effective_from: effectiveFrom,
        effective_to: effectiveTo ? effectiveTo : null,
        is_active: Boolean(isActive),
        note: note.trim() === '' ? null : note.trim(),
        unit_pay_0_5: toAmountNumber(unitPay05),
        unit_pay_6_10: toAmountNumber(unitPay610),
        unit_pay_11_plus: toAmountNumber(unitPay11Plus),
      })

      await fetchRateRuleSets(store.store_id)
      resetForm()
      setMessage('単価ルールを保存しました')
    } catch (error) {
      console.error(error)
      setMessage(`単価ルールの保存に失敗しました: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const deleteRuleSet = async (ruleSet) => {
    if (!ruleSet?.payroll_rate_rule_set_id) return

    const ok = window.confirm(
      `単価ルール「${ruleSet.rule_name}」を削除しますか？\n\n` +
        '給与期間で使用済みのルールは削除できません。\n' +
        '今後使わないだけの場合は、編集で「有効にする」のチェックを外してください。'
    )

    if (!ok) return

    setLoading(true)
    setMessage('単価ルールを削除中です...')

    try {
      const { data } = await adminPost('/api/admin-payroll', {
        action: 'delete_rate_rule_set',
        payroll_rate_rule_set_id: Number(ruleSet.payroll_rate_rule_set_id),
      })

      if (String(editingRuleSetId) === String(ruleSet.payroll_rate_rule_set_id)) {
        resetForm()
      }

      await fetchRateRuleSets(store.store_id)

      const result = Array.isArray(data) && data.length > 0 ? data[0] : null
      const deletedRuleCount = result?.deleted_rule_count ?? 0

      setMessage(`単価ルールを削除しました（明細 ${deletedRuleCount} 件）`)
    } catch (error) {
      console.error(error)
      setMessage(`単価ルールの削除に失敗しました: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await fetch('/api/admin-logout', { method: 'POST' })
    window.location.href = '/admin/login'
  }

  const formatDate = (value) => {
    if (!value) return ''
    return String(value).slice(0, 10)
  }

  const formatMoney = (value) => {
    if (value === null || value === undefined || value === '') return '-'
    return Number(value).toLocaleString()
  }

  const formatRuleRange = (rule) => {
    if (rule.max_stamp_count === null || rule.max_stamp_count === undefined) {
      return `${rule.min_stamp_count}個以上`
    }

    return `${rule.min_stamp_count}〜${rule.max_stamp_count}個`
  }

  // ---- 新デザイン（案B）の表示用 ----
  // 入力中の金額をカンマ付きで見せる（保存する値は数字だけのまま）
  const showAmount = (value) => {
    const text = String(value ?? '')
    if (text === '' || text === '-') return text
    const n = Number(text)
    return Number.isFinite(n) ? n.toLocaleString() : text
  }

  const sortedRuleSets = [...ruleSets].sort((a, b) => {
    if (Boolean(a.is_active) !== Boolean(b.is_active)) return a.is_active ? -1 : 1
    return Number(a.payroll_rate_rule_set_id) - Number(b.payroll_rate_rule_set_id)
  })
  const activeCount = ruleSets.filter((ruleSet) => ruleSet.is_active).length

  const tierStyles = [
    { box: { background: '#faf6ee', border: '1px solid #efe7da' }, label: '#6f665c', value: '#22352b' },
    { box: { background: '#f4ede0', border: '1px solid #ebdfc8' }, label: '#6a4a12', value: '#22352b' },
    { box: { background: '#22352b', border: '1px solid #22352b' }, label: '#c7d1c4', value: '#e4d1a6' },
  ]
  const tiers = [
    [0, 5],
    [6, 10],
    [11, null],
  ]

  if (initialLoading) {
    return <div className={s.card}><p className={s.muted}>読み込み中です...</p></div>
  }

  const isError = /失敗|入力してください|取得できていません/.test(message)

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
          <a href="/admin/staff/payroll/history" className={s.tab}>給与履歴</a>
          <a href="/admin/staff/payroll/rate-rules" className={`${s.tab} ${s.tabActive}`} aria-current="page">単価ルール</a>
        </nav>
      </header>

      {message && !/を編集中です$/.test(message) && (
        <div className={isError ? s.warnBox : s.notice} role={isError ? 'alert' : 'status'} style={isError ? { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#f8ece7', color: '#b8573f', fontSize: 14 } : undefined}>
          <span>{message}</span>
          <button type="button" className={s.noticeClose} aria-label="お知らせを閉じる" onClick={() => setMessage('')}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section aria-labelledby="rule-list" style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <h2 id="rule-list" className={s.h2}>
              単価ルール <span style={{ fontSize: 14, fontWeight: 500, color: '#6f665c' }}>{ruleSets.length}件（有効 {activeCount}件）</span>
            </h2>
            <span className={s.muted}>給与計算の画面で、期間ごとにどれか1つを選んで使います</span>
          </div>

          {sortedRuleSets.length === 0 ? (
            <div className={s.empty}>単価ルールがまだありません。右のフォームから作ってください。</div>
          ) : (
            sortedRuleSets.map((ruleSet) => {
              const editing = String(editingRuleSetId) === String(ruleSet.payroll_rate_rule_set_id)
              const inactive = !ruleSet.is_active
              return (
                <article
                  key={ruleSet.payroll_rate_rule_set_id}
                  className={s.card}
                  style={{
                    gap: 14,
                    ...(editing ? { border: '2px solid #dcc79e' } : {}),
                    ...(inactive && !editing ? { background: '#f4efe6', borderStyle: 'dashed', boxShadow: 'none' } : {}),
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, opacity: inactive && !editing ? 0.75 : 1 }}>
                      {editing && <span style={{ fontSize: 12, fontWeight: 700, color: '#8a6f45' }}>いま右で編集中</span>}
                      <h3 style={{ margin: 0, fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 19, color: '#22352b' }}>
                        {ruleSet.rule_name}
                      </h3>
                      <span className={s.muted}>
                        {formatDate(ruleSet.effective_from)} から ・ {ruleSet.effective_to ? `${formatDate(ruleSet.effective_to)} まで` : '終了日なし'}
                        {ruleSet.note ? ` ・ ${ruleSet.note}` : ''}
                      </span>
                    </div>
                    <span
                      className={s.pill}
                      style={inactive ? { background: '#efeae0', color: '#6f665c', fontWeight: 700 } : { background: '#e7eee4', color: '#34503a', fontWeight: 700 }}
                    >
                      {inactive ? '無効' : '有効'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, opacity: inactive && !editing ? 0.75 : 1 }}>
                    {tiers.map(([min, max], index) => {
                      const rule = getRuleByRange(ruleSet, min, max)
                      const style = tierStyles[index]
                      return (
                        <div key={min} style={{ ...style.box, borderRadius: 12, padding: '12px 14px' }}>
                          <span style={{ display: 'block', fontSize: 12, color: style.label }}>
                            スタンプ {max === null ? `${min}個以上` : `${min}〜${max}個`}
                          </span>
                          <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 22, color: style.value }}>
                            {rule ? formatMoney(rule.unit_pay) : '未設定'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  {ruleSet.rules
                    .filter((rule) => !tiers.some(([min, max]) => getRuleByRange(ruleSet, min, max) === rule))
                    .map((rule) => (
                      <span key={rule.payroll_rate_rule_id} className={s.muted}>
                        ほかの区分：{formatRuleRange(rule)} {formatMoney(rule.unit_pay)}
                      </span>
                    ))}

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className={`${s.btn} ${editing ? s.btnPrimary : ''}`}
                      onClick={() => startEdit(ruleSet)}
                      disabled={loading}
                    >
                      {editing ? '編集中' : '編集する'}
                    </button>
                    <button
                      type="button"
                      className={`${s.btn} ${s.btnSmall}`}
                      onClick={() => deleteRuleSet(ruleSet)}
                      disabled={loading}
                      style={{ background: 'transparent', color: '#b8573f', border: '1px solid #e3c2b8' }}
                    >
                      削除
                    </button>
                  </div>
                </article>
              )
            })
          )}
        </section>

        <aside
          aria-labelledby="rule-form"
          className={s.card}
          style={{ flex: '1 1 340px', maxWidth: 440, position: 'sticky', top: 24, gap: 14 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h2 id="rule-form" className={s.h2}>{editingRuleSet ? 'ルールを編集' : '新しいルールを作る'}</h2>
            <span className={s.muted}>
              {editingRuleSet ? `「${editingRuleSet.rule_name}」を編集しています` : 'スタンプ数に応じた単価を3段階で決めます'}
            </span>
          </div>

          <label className={s.field}>
            ルール名
            <input
              type="text"
              className={s.input}
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder="例：Bistro-Bambi 基本給与_高"
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <label className={s.field}>
              使い始める日
              <input type="date" className={s.input} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </label>
            <label className={s.field}>
              終わる日
              <input type="date" className={s.input} value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
              <span className={s.subText}>空欄なら終了日なし</span>
            </label>
          </div>

          <fieldset style={{ margin: 0, border: '1px solid #e4dacb', borderRadius: 12, padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <legend style={{ padding: '0 6px', fontSize: 14, fontWeight: 700, color: '#22352b' }}>スタンプ数ごとの単価</legend>
            {[
              ['0〜5個', unitPay05, setUnitPay05],
              ['6〜10個', unitPay610, setUnitPay610],
              ['11個以上', unitPay11Plus, setUnitPay11Plus],
            ].map(([label, value, setter]) => (
              <label key={label} style={{ display: 'grid', gridTemplateColumns: '88px 1fr', alignItems: 'center', gap: 10, fontSize: 14 }}>
                {label}
                <input
                  type="text"
                  inputMode="numeric"
                  className={s.input}
                  value={showAmount(value)}
                  onChange={handleAmountChange(setter)}
                  style={{ textAlign: 'right' }}
                />
              </label>
            ))}
            <span className={s.subText}>金額は打つとカンマ付きで表示されます（全角の数字も使えます）</span>
          </fieldset>

          <label className={s.field}>
            メモ
            <textarea
              className={s.textarea}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="売上に応じたルール、イベント時用など"
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: '#2f4a3a' }}
            />
            有効にする（給与計算で選べるようにする）
          </label>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className={`${s.btn} ${s.btnPrimary}`}
              onClick={saveRuleSet}
              disabled={loading}
              style={{ flex: '1 1 auto' }}
            >
              {loading ? '保存中...' : editingRuleSetId ? '変更を保存' : 'このルールを作る'}
            </button>
            {editingRuleSetId && (
              <button type="button" className={s.btn} onClick={() => { resetForm(); setMessage('') }} disabled={loading}>
                やめて新規作成へ
              </button>
            )}
          </div>
          <p className={s.muted} style={{ margin: 0, fontSize: 12 }}>
            使い終わったルールは、削除ではなく「有効にする」を外すのがおすすめです（給与期間で使ったルールは削除できません）。
          </p>
        </aside>
      </div>
    </>
  )
}
