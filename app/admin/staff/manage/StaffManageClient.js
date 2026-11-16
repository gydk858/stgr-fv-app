'use client'

import s from '@/components/v2/v2.module.css'
import StaffTabs from '@/components/v2/StaffTabs'

import { useEffect, useState } from 'react'
import { adminGet, adminPost } from '@/lib/admin-api'

export default function StaffManageClient() {
  const now = new Date()

  const [targetYear, setTargetYear] = useState(now.getFullYear())
  const [targetMonth, setTargetMonth] = useState(now.getMonth() + 1)

  const [message, setMessage] = useState('')
  const [isResetting, setIsResetting] = useState(false)

  const [checkLoading, setCheckLoading] = useState(false)
  const [resetStatus, setResetStatus] = useState(null)

  const fetchResetStatus = async (
    year = targetYear,
    month = targetMonth,
    options = { showMessage: false }
  ) => {
    setCheckLoading(true)

    if (options.showMessage) {
      setMessage('リセット前チェックを実行中です...')
    }

    try {
      const { data } = await adminGet('/api/admin-staff', {
        view: 'reset_status',
        year: Number(year),
        month: Number(month),
      })

      const status = Array.isArray(data) && data.length > 0 ? data[0] : null
      setResetStatus(status)

      if (options.showMessage) {
        setMessage(status ? 'リセット前チェックを更新しました' : '確認結果を取得できませんでした')
      }

      return status
    } catch (error) {
      console.error(error)
      setResetStatus(null)
      setMessage(
        error instanceof Error
          ? `リセット前チェックに失敗しました: ${error.message}`
          : 'リセット前チェックに失敗しました'
      )
      return null
    } finally {
      setCheckLoading(false)
    }
  }

  useEffect(() => {
    fetchResetStatus(targetYear, targetMonth)
  }, [])

  const handleYearChange = (value) => {
    setTargetYear(value)
    if (value && targetMonth) {
      fetchResetStatus(value, targetMonth)
    }
  }

  const handleMonthChange = (value) => {
    setTargetMonth(value)
    if (targetYear && value) {
      fetchResetStatus(targetYear, value)
    }
  }

  const resetAllStaffCards = async () => {
    if (isResetting) return

    const latestStatus = await fetchResetStatus(targetYear, targetMonth)

    if (!latestStatus) {
      setMessage('リセット前チェックを取得できないため、リセットを中止しました')
      return
    }

    const warnings = latestStatus.warning_messages || []

    if (!latestStatus.can_reset) {
      setMessage(
        [
          'リセット前チェックで未完了項目があるため、月末一括リセットは実行できません。',
          '',
          ...warnings.map((warning) => `・${warning}`),
        ].join('\n')
      )
      return
    }

    const finalOk = window.confirm(
      [
        '本当に在籍中従業員カードの出勤数を 0 に戻しますか？',
        '',
        `対象: ${latestStatus.target_year}年${latestStatus.target_month}月`,
        `店舗: ${latestStatus.store_name}`,
        `在籍中従業員カード: ${latestStatus.staff_card_count}件`,
        `現在スタンプ合計: ${latestStatus.current_stamp_total}`,
        '',
        'この操作でカード上の現在スタンプ数は0になります。',
        '出勤履歴・給与明細・給与集計は削除されません。',
        '退職済み従業員カードはリセット対象外です。',
      ].join('\n')
    )

    if (!finalOk) return

    setMessage('')
    setIsResetting(true)

    try {
      // 実行者と理由はサーバーで固定する（/api/admin-staff の reset_month）
      const { data } = await adminPost('/api/admin-staff', {
        action: 'reset_month',
        year: Number(targetYear),
        month: Number(targetMonth),
      })

      const result = Array.isArray(data) && data.length > 0 ? data[0] : null
      const affectedCards = result?.affected_cards ?? 0

      setMessage(`在籍中従業員カードをリセットしました（${affectedCards}件）`)
      await fetchResetStatus(targetYear, targetMonth)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : '在籍中従業員カードのリセットに失敗しました'
      )
    } finally {
      setIsResetting(false)
    }
  }

  const formatDate = (value) => {
    if (!value) return '-'
    return String(value).slice(0, 10)
  }

  const formatNumber = (value) => {
    if (value === null || value === undefined || value === '') return '0'
    return Number(value).toLocaleString()
  }

  // ---- 新デザイン（案B）の表示用 ----
  // 月の切り替え（‹ ›）
  const moveMonth = (delta) => {
    if (checkLoading || isResetting) return
    const base = new Date(Number(targetYear), Number(targetMonth) - 1 + delta, 1)
    const year = base.getFullYear()
    const month = base.getMonth() + 1
    setTargetYear(year)
    setTargetMonth(month)
    setMessage('')
    fetchResetStatus(year, month)
  }

  const isError = /失敗|中止|できません|取得できません/.test(message)

  const checks = resetStatus
    ? [
        ['前半の給与期間', resetStatus.first_period_exists, resetStatus.first_period_exists ? '作成済み' : '未作成'],
        ['前半の給与明細', Number(resetStatus.first_run_item_count || 0) > 0, `${formatNumber(resetStatus.first_run_item_count)}件`],
        ['前半の金庫の数字', resetStatus.first_summary_exists, resetStatus.first_summary_exists ? '保存済み' : '未保存'],
        ['後半の給与期間', resetStatus.second_period_exists, resetStatus.second_period_exists ? '作成済み' : '未作成'],
        ['後半の給与明細', Number(resetStatus.second_run_item_count || 0) > 0, `${formatNumber(resetStatus.second_run_item_count)}件`],
        ['後半の金庫の数字', resetStatus.second_summary_exists, resetStatus.second_summary_exists ? '保存済み' : '未保存'],
      ]
    : []

  return (
    <>
      <StaffTabs />

      {message && !/実行中です/.test(message) && (
        <div
          className={isError ? s.warnBox : s.notice}
          role={isError ? 'alert' : 'status'}
          style={isError ? { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#f8ece7', color: '#b8573f', fontSize: 14, whiteSpace: 'pre-wrap' } : undefined}
        >
          <span>{message}</span>
          <button type="button" className={s.noticeClose} aria-label="お知らせを閉じる" onClick={() => setMessage('')}>×</button>
        </div>
      )}

      <section className={s.card} aria-label="対象の月" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '16px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" className={s.iconBtn} aria-label="前の月" onClick={() => moveMonth(-1)} disabled={checkLoading || isResetting}>‹</button>
          <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 22, color: '#22352b', padding: '0 8px' }}>
            {targetYear}年{targetMonth}月
          </span>
          <button type="button" className={s.iconBtn} aria-label="次の月" onClick={() => moveMonth(1)} disabled={checkLoading || isResetting}>›</button>
        </div>
        <button
          type="button"
          className={`${s.btn} ${s.btnSmall}`}
          onClick={() => fetchResetStatus(targetYear, targetMonth, { showMessage: true })}
          disabled={checkLoading || isResetting}
        >
          {checkLoading ? '確認中...' : 'もう一度確認する'}
        </button>
        <p className={s.muted} style={{ flexBasis: '100%', margin: 0 }}>
          ふつうは、これからリセットしたい月（締めが終わった月）を選びます。リセットしても、出勤履歴や給与明細は消えません。カードの表示の出勤数だけが0になります。
        </p>
      </section>

      {!resetStatus ? (
        <section className={s.card}>
          <div className={s.empty}>{checkLoading ? '確認中です...' : '確認結果がありません。「もう一度確認する」を押してください。'}</div>
        </section>
      ) : (
        <>
          <section aria-label="対象のまとめ" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div className={s.card} style={{ gap: 2, padding: '18px 20px' }}>
              <span className={s.muted}>対象の期間</span>
              <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 20, color: '#22352b' }}>
                {formatDate(resetStatus.period_start)}〜{formatDate(resetStatus.period_end)}
              </span>
              <span className={s.muted} style={{ fontSize: 12 }}>{resetStatus.store_name}</span>
            </div>
            <div className={s.card} style={{ gap: 2, padding: '18px 20px' }}>
              <span className={s.muted}>リセットする在籍中のカード</span>
              <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 26, color: '#22352b' }}>
                {formatNumber(resetStatus.staff_card_count)} <span style={{ fontSize: 15 }}>枚</span>
              </span>
              <span className={s.muted} style={{ fontSize: 12 }}>いまの表示の合計 {formatNumber(resetStatus.current_stamp_total)} 回</span>
            </div>
            <div className={s.card} style={{ gap: 2, padding: '18px 20px' }}>
              <span className={s.muted}>この月の出勤履歴</span>
              <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 26, color: '#22352b' }}>
                {formatNumber(resetStatus.attendance_event_count)} <span style={{ fontSize: 15 }}>件</span>
              </span>
              <span className={s.muted} style={{ fontSize: 12 }}>出勤数の合計 {formatNumber(resetStatus.attendance_total)} 回（リセットしても消えません）</span>
            </div>
          </section>

          <section className={s.card} aria-labelledby="reset-checks">
            <h2 id="reset-checks" className={s.h2}>リセット前の確認</h2>
            <span className={s.muted}>前半・後半の給与が保存され、確定済みになっているかを確認します。終わっていない項目がある間は、リセットできません。</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {checks.map(([title, ok, detail]) => (
                <div
                  key={title}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: ok ? '#eef2ea' : '#f8ece7', border: `1px solid ${ok ? '#d5e0d1' : '#e3c2b8'}` }}
                >
                  <span
                    aria-hidden="true"
                    style={{ width: 26, height: 26, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, background: ok ? '#2f4a3a' : '#b8573f', color: '#fbf6ec', flex: '0 0 auto' }}
                  >
                    {ok ? '✓' : '！'}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 700, color: ok ? '#22352b' : '#b8573f' }}>{title}</span>
                    <span className={s.muted} style={{ fontSize: 12 }}>
                      {ok ? '' : '未完了 ・ '}
                      {detail}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section
            className={s.card}
            aria-labelledby="reset-run"
            style={resetStatus.can_reset ? { border: '2px solid #dcc79e' } : { background: '#f4efe6', boxShadow: 'none' }}
          >
            <h2 id="reset-run" className={s.h2}>
              {resetStatus.can_reset ? 'リセットできる状態です' : 'まだリセットできません'}
            </h2>
            {resetStatus.can_reset ? (
              <span className={s.muted}>給与・金庫の数字が保存され、給与期間も確定済みです。内容を確かめてから実行してください。</span>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 20, color: '#b8573f', fontSize: 14 }}>
                {(resetStatus.warning_messages || []).map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                className={s.btn}
                onClick={resetAllStaffCards}
                disabled={isResetting || checkLoading || !resetStatus.can_reset}
                style={
                  resetStatus.can_reset
                    ? { background: '#b8573f', color: '#fbf6ec', border: 0, fontWeight: 700, minHeight: 46, padding: '0 22px' }
                    : { minHeight: 46, padding: '0 22px' }
                }
              >
                {isResetting ? 'リセット中...' : '在籍中のカードの出勤数を0に戻す'}
              </button>
              <span className={s.muted} style={{ fontSize: 12 }}>
                押すと最終確認が出ます。退職済みのカードと、お客様のスタンプカードは対象外です。翌月の出勤スタンプを始める前に使います。
              </span>
            </div>
          </section>
        </>
      )}
    </>
  )
}
