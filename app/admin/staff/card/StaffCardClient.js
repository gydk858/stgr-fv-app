'use client'

import s from '@/components/v2/v2.module.css'
import StaffTabs from '@/components/v2/StaffTabs'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { adminGet, adminPost } from '@/lib/admin-api'

const STAFF_PROGRAM_CODE = 'stamp_staff_attendance'
const STAFF_MAX_COUNT = 15
const STAFF_PUBLIC_CARD_BASE =
  'https://arahjxdrmqqvzzmyxuot.supabase.co/storage/v1/object/public/stamp-images/live-staff'

export default function StaffCardClient() {
  const searchParams = useSearchParams()

  const [staffCode, setStaffCode] = useState('')
  const [createStaffCode, setCreateStaffCode] = useState('')
  const [createStaffName, setCreateStaffName] = useState('')

  const [cardRecord, setCardRecord] = useState(null)
  const [message, setMessage] = useState('')
  const [createMessage, setCreateMessage] = useState('')
  const [editName, setEditName] = useState('')
  const [nameMessage, setNameMessage] = useState('')
  const [copiedFixed, setCopiedFixed] = useState(false)
  const [previewKey, setPreviewKey] = useState(Date.now())

  const [currentStore, setCurrentStore] = useState(null)
  const [storeError, setStoreError] = useState('')
  const [isStoreLoading, setIsStoreLoading] = useState(true)
  const [autoSearchDone, setAutoSearchDone] = useState(false)
  // 「従業員を選ぶ」の選択肢（従業員一覧と同じ読み取り API）
  const [staffOptions, setStaffOptions] = useState([])

  useEffect(() => {
    adminGet('/api/admin-staff', { view: 'employees' })
      .then(({ employees }) => {
        const rows = [...(employees || [])].sort((a, b) => {
          const ra = a.employment_status === 'retired' ? 1 : 0
          const rb = b.employment_status === 'retired' ? 1 : 0
          if (ra !== rb) return ra - rb
          return String(a.staff_code || '').localeCompare(String(b.staff_code || ''), 'ja')
        })
        setStaffOptions(rows)
      })
      .catch((error) => console.error(error))
  }, [])

  const isCardOperable = cardRecord?.employment_status === 'active'

  const normalizeStaffCode = (value) => {
    return String(value || '').replace(/\s+/g, '').trim()
  }

  const refreshPreview = () => {
    setPreviewKey(Date.now())
  }

  const getFixedCardUrl = (targetUserId) => {
    return `${STAFF_PUBLIC_CARD_BASE}/${targetUserId}.png`
  }

  const getPreviewUrl = (targetRecord) => {
    if (!targetRecord) return ''
    const fixedUrl = getFixedCardUrl(targetRecord.user_id)
    return `${fixedUrl}?preview=${previewKey}`
  }

  const getEmploymentStatusLabel = (status) => {
    if (status === 'active') return '在籍中'
    if (status === 'retired') return '退職済み'
    return '操作不可'
  }

  const syncStaffCardImage = async (targetUserId) => {
    const syncRes = await fetch(`/api/sync-staff-card/${targetUserId}`, {
      method: 'POST',
      cache: 'no-store',
    })

    const syncJson = await syncRes.json()

    if (!syncRes.ok || !syncJson.ok) {
      throw new Error(
        syncJson.error || syncJson.message || '従業員カード画像の同期に失敗しました'
      )
    }

    return syncJson
  }

  const loadCurrentStore = async () => {
    setIsStoreLoading(true)
    setStoreError('')

    try {
      // 現在の店舗（有効なものだけ）は /api/admin-context がサーバー側で決める
      const { store } = await adminGet('/api/admin-context', { active: 1 })

      setCurrentStore(store)
    } catch (error) {
      setCurrentStore(null)
      setStoreError(
        error instanceof Error ? error.message : '店舗設定の読み込みに失敗しました'
      )
    } finally {
      setIsStoreLoading(false)
    }
  }

  useEffect(() => {
    loadCurrentStore()
  }, [])

  useEffect(() => {
    const queryStaffCode = normalizeStaffCode(searchParams.get('staff_code'))

    if (!queryStaffCode) return
    if (autoSearchDone) return
    if (isStoreLoading) return
    if (!currentStore) return

    setStaffCode(queryStaffCode)
    setAutoSearchDone(true)
    searchStaffCardByCode(queryStaffCode, true)
  }, [searchParams, autoSearchDone, isStoreLoading, currentStore])

  const requireCurrentStore = () => {
    if (!currentStore?.store_id || !currentStore?.store_code) {
      throw new Error(storeError || '現在の店舗設定が読み込まれていません')
    }

    return currentStore
  }

  // 従業員コードでカードを取得する（店舗の確認と、今月の出勤履歴の合計はサーバー側）
  const fetchStaffCardWithTotal = async (targetStaffCode) => {
    const normalized = normalizeStaffCode(targetStaffCode)
    requireCurrentStore()
    const { card, month_attendance_total } = await adminGet('/api/admin-staff', {
      view: 'card',
      staff_code: normalized,
    })
    return { card, monthTotal: Number(month_attendance_total || 0) }
  }

  const fetchStaffCardByCode = async (targetStaffCode) => {
    const { card } = await fetchStaffCardWithTotal(targetStaffCode)
    return card
  }

  // カード画像だけの作り直しが失敗したときの案内（出勤数などの DB の更新は完了している）
  const imageRetryMessage = (result) =>
    result && result.image_ok === false
      ? `（カード画像の更新に失敗しました: ${result.image_error || '不明なエラー'}。もう一度「検索」を押すと画像だけを作り直します）`
      : ''

  const searchStaffCardByCode = async (targetStaffCode, fromAutoSearch = false) => {
    setMessage('')
    setNameMessage('')
    setCopiedFixed(false)

    const normalized = normalizeStaffCode(targetStaffCode)

    if (!normalized) {
      setCardRecord(null)
      setEditName('')
      setMessage('従業員コードを入力してください')
      return
    }

    try {
      const data = await fetchStaffCardByCode(normalized)
      await syncStaffCardImage(data.user_id)
      const refreshedData = await fetchStaffCardByCode(normalized)

      setCardRecord(refreshedData)
      setEditName(refreshedData.display_name || '')
      setMessage(
        fromAutoSearch
          ? `従業員一覧から ${normalized} を表示しました（${currentStore?.store_name ?? ''}）`
          : `従業員カードを表示しました（${currentStore?.store_name ?? ''}）`
      )
      refreshPreview()
    } catch (error) {
      setCardRecord(null)
      setEditName('')
      setMessage(
        error instanceof Error ? error.message : '従業員カード情報の取得に失敗しました'
      )
    }
  }

  const searchStaffCard = async () => {
    await searchStaffCardByCode(staffCode, false)
  }

  const createStaffCard = async () => {
    setCreateMessage('')
    setMessage('')
    setNameMessage('')
    setCopiedFixed(false)

    const normalizedCode = normalizeStaffCode(createStaffCode)
    const trimmedName = createStaffName.trim()

    if (!normalizedCode) {
      setCreateMessage('従業員コードを入力してください')
      return
    }

    try {
      const store = requireCurrentStore()

      const created = await adminPost('/api/admin-staff', {
        action: 'create_card',
        staff_code: normalizedCode,
        display_name: trimmedName === '' ? null : trimmedName,
      })
      const fetchedCard = created.card

      setCreateMessage(
        `従業員コード ${normalizedCode} を発行しました（${store.store_name}）`
      )
      setMessage(`従業員カードを新規発行しました${imageRetryMessage(created)}`)
      setStaffCode(normalizedCode)
      setCardRecord(fetchedCard)
      setEditName(fetchedCard.display_name || '')
      setCreateStaffCode('')
      setCreateStaffName('')
      refreshPreview()
    } catch (error) {
      setCreateMessage(
        error instanceof Error ? error.message : '従業員カード発行に失敗しました'
      )
    }
  }

  const saveName = async () => {
    setNameMessage('')
    setCopiedFixed(false)

    if (!cardRecord) {
      setNameMessage('先に従業員カードを検索してください')
      return
    }

    const trimmedName = editName.trim()

    let result
    try {
      result = await adminPost('/api/admin-staff', {
        action: 'save_card_name',
        user_id: Number(cardRecord.user_id),
        name: trimmedName === '' ? null : trimmedName,
      })
    } catch (error) {
      setNameMessage(error instanceof Error ? error.message : '氏名の保存に失敗しました')
      return
    }

    setCardRecord(result.card)
    setEditName(result.card.display_name || '')
    setNameMessage(`氏名を保存しました${imageRetryMessage(result)}`)
    refreshPreview()
  }

  const updateAttendanceCount = async (diff) => {
    if (!cardRecord) return

    if (!isCardOperable) {
      setMessage('この従業員は退職済みのため、出勤数を操作できません。')
      return
    }

    // +1 / -1 は、給与の出勤数の元になる出勤履歴にも記録される。
    // 出勤履歴の今月の合計が 0 未満になる減算は、出勤履歴の RPC が拒否する（2026-11-15 に追加。
    // 2026-11-01 に前月から繰り越した表示を -1 で消し、11月の出勤数が1回分少なくなった件への対策）。
    // 画面でも事前に確認して、分かりやすい案内を出す。
    const historyGuideMessage = (monthTotal) =>
      `今月の出勤履歴（給与の出勤数の元）は合計 ${monthTotal} 回のため、-1 はできません。` +
      '前月から繰り越したカードの表示数だけを 0 にしたい場合は「リセット」を使ってください。' +
      'リセットはカードの表示数だけを変え、出勤履歴（給与）は変えません。次の出勤時の同期で、表示は今月の出勤履歴の合計に戻ります。'

    // 画面でも事前に、今月の出勤履歴の合計を最新の値で確認する（確定の判定はサーバーの RPC）
    if (diff < 0) {
      let monthTotal
      try {
        monthTotal = (await fetchStaffCardWithTotal(cardRecord.staff_code)).monthTotal
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '今月の出勤履歴を確認できませんでした')
        return
      }
      if (monthTotal + diff < 0) {
        setMessage(historyGuideMessage(monthTotal))
        return
      }
    }

    // 出勤履歴とカード表示は、サーバーの1トランザクション（staff_card_adjust_admin）で更新する。画像はその後に作る。
    let result
    try {
      result = await adminPost('/api/admin-staff', {
        action: 'adjust_card',
        user_id: Number(cardRecord.user_id),
        card_action: diff > 0 ? 'add' : 'remove',
      })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '出勤数の更新に失敗しました')
      return
    }

    setCardRecord(result.card)
    setMessage(`出勤数を ${result.card.current_count} に更新しました${imageRetryMessage(result)}`)
    setCopiedFixed(false)
    refreshPreview()
  }

  const resetStaffCard = async () => {
    if (!cardRecord) return

    if (!isCardOperable) {
      setMessage('この従業員は退職済みのため、出勤数を操作できません。')
      return
    }

    // リセットはカードの表示数だけを 0 にする（出勤履歴には 0 を記録し、給与の出勤数は変えない）
    let result
    try {
      result = await adminPost('/api/admin-staff', {
        action: 'adjust_card',
        user_id: Number(cardRecord.user_id),
        card_action: 'reset',
      })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '出勤数のリセットに失敗しました')
      return
    }

    setCardRecord(result.card)
    setMessage(`カードの表示数をリセットしました（出勤履歴は変わりません）${imageRetryMessage(result)}`)
    setCopiedFixed(false)
    refreshPreview()
  }

  const copyFixedCardUrl = async () => {
    if (!cardRecord) return

    const fullUrl = getFixedCardUrl(cardRecord.user_id)

    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopiedFixed(true)
      setTimeout(() => setCopiedFixed(false), 2000)
    } catch {
      setCopiedFixed(false)
      setMessage('固定URLのコピーに失敗しました')
    }
  }

  // ---- 新デザイン（案B）の表示用 ----
  const notices = [createMessage, message, nameMessage].filter(Boolean)
  const noticeIsError = (text) => /失敗|できません|入力してください|先に|見つかりません|読み込まれていません/.test(text)
  const selectedOption = staffOptions.find((option) => option.staff_code === cardRecord?.staff_code)

  const openFromSelect = (code) => {
    if (!code) return
    setStaffCode(code)
    searchStaffCardByCode(code, false)
  }

  return (
    <>
      <StaffTabs />

      {notices.map((text, index) => (
        <div
          key={`${index}-${text}`}
          className={noticeIsError(text) ? s.warnBox : s.notice}
          role={noticeIsError(text) ? 'alert' : 'status'}
          style={noticeIsError(text) ? { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#f8ece7', color: '#b8573f', fontSize: 14 } : undefined}
        >
          <span>{text}</span>
          <button
            type="button"
            className={s.noticeClose}
            aria-label="お知らせを閉じる"
            onClick={() => {
              if (text === createMessage) setCreateMessage('')
              if (text === message) setMessage('')
              if (text === nameMessage) setNameMessage('')
            }}
          >
            ×
          </button>
        </div>
      ))}

      {storeError && (
        <div className={s.warnBox} role="alert" style={{ background: '#f8ece7', color: '#b8573f', fontSize: 14 }}>
          店舗設定を読み込めませんでした：{storeError}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <aside style={{ flex: '1 1 300px', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section className={s.card} aria-labelledby="card-search">
            <h2 id="card-search" className={s.h2}>カードを開く</h2>
            <label className={s.field}>
              従業員を選ぶ
              <select
                className={s.select}
                value={selectedOption ? selectedOption.staff_code : ''}
                onChange={(e) => openFromSelect(e.target.value)}
                disabled={isStoreLoading || !currentStore}
              >
                <option value="">選んでください</option>
                {staffOptions.map((option) => (
                  <option key={option.user_id} value={option.staff_code}>
                    {option.staff_code}　{option.employee_name || '未登録'}
                    {option.employment_status === 'retired' ? '（退職）' : ''}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <label className={s.field} style={{ flex: 1, fontSize: 13 }}>
                コードで探す
                <input
                  type="text"
                  className={s.input}
                  placeholder="例：Bambi01"
                  value={staffCode}
                  onChange={(e) => setStaffCode(normalizeStaffCode(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') searchStaffCard()
                  }}
                />
              </label>
              <button type="button" className={s.btn} onClick={searchStaffCard} disabled={isStoreLoading || !currentStore}>
                開く
              </button>
            </div>
          </section>

          <details className={s.card}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#22352b' }}>＋ 新しいカードを発行する</summary>
            <label className={s.field}>
              従業員コード
              <input
                type="text"
                className={s.input}
                placeholder="例：Bambi25"
                value={createStaffCode}
                onChange={(e) => setCreateStaffCode(normalizeStaffCode(e.target.value))}
              />
            </label>
            <label className={s.field}>
              氏名（あとからでも可）
              <input type="text" className={s.input} value={createStaffName} onChange={(e) => setCreateStaffName(e.target.value)} />
            </label>
            <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={createStaffCard} disabled={isStoreLoading || !currentStore}>
              カードを発行する
            </button>
          </details>

          <section className={s.card} style={{ background: '#f4efe6', boxShadow: 'none' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#22352b' }}>ふだんの運用</span>
            <span className={s.muted}>
              出勤スタンプはDiscordで押します。ここでの＋1／−1は、ミスを直すときだけ使います。出勤は朝4時区切りの日付で記録され、給与の出勤数になります。出勤回数に上限はありません（カード画像のマスは表示の上限です）。
            </span>
          </section>
        </aside>

        <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {!cardRecord ? (
            <section className={s.card}>
              <div className={s.empty}>左の「カードを開く」で従業員を選ぶと、ここにカードが表示されます。</div>
            </section>
          ) : (
            <>
              <section className={s.card} aria-labelledby="card-main">
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className={s.muted}>
                      {cardRecord.staff_code}
                      {selectedOption?.staff_grade ? ` ・ ${selectedOption.staff_grade}` : ''}
                    </span>
                    <h2 id="card-main" style={{ margin: 0, fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 24, color: '#22352b' }}>
                      {cardRecord.display_name || '氏名未登録'}
                    </h2>
                  </div>
                  <span
                    className={s.pill}
                    style={
                      isCardOperable
                        ? { background: '#e7eee4', color: '#34503a', fontWeight: 700 }
                        : { background: '#efeae0', color: '#6f665c', fontWeight: 700 }
                    }
                  >
                    {getEmploymentStatusLabel(cardRecord.employment_status)}
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
                  <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ background: '#f4efe6', border: '1px solid #e4dacb', borderRadius: 12, padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getPreviewUrl(cardRecord)}
                        alt={`従業員カード ${cardRecord.staff_code}`}
                        style={{ maxWidth: '100%', height: 'auto', borderRadius: 8, display: 'block' }}
                      />
                    </div>
                    <button type="button" className={`${s.btn} ${s.btnSmall}`} onClick={refreshPreview} style={{ alignSelf: 'flex-start' }}>
                      画像を読み込み直す
                    </button>
                  </div>

                  <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className={s.cardDark} style={{ gap: 0, padding: '16px 18px' }}>
                      <span style={{ fontSize: 13, color: '#c7d1c4' }}>カードの出勤数</span>
                      <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 40, color: '#e4d1a6', lineHeight: 1.2 }}>
                        {cardRecord.current_count} <span style={{ fontSize: 16 }}>回</span>
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#22352b' }}>出勤数を直す</span>
                      {!isCardOperable && (
                        <span style={{ fontSize: 13, color: '#b8573f' }}>退職済みのため、出勤数は操作できません。</span>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => updateAttendanceCount(-1)}
                          disabled={!isCardOperable}
                          style={{ flex: 1, minHeight: 48, background: '#faf6ee', border: '1px solid #d8ccb6', borderRadius: 12, fontSize: 18, fontWeight: 700, color: '#2f4a3a', cursor: isCardOperable ? 'pointer' : 'not-allowed', opacity: isCardOperable ? 1 : 0.5 }}
                        >
                          −1
                        </button>
                        <button
                          type="button"
                          onClick={() => updateAttendanceCount(1)}
                          disabled={!isCardOperable}
                          style={{ flex: 1, minHeight: 48, background: '#2f4a3a', border: 0, borderRadius: 12, fontSize: 18, fontWeight: 700, color: '#fbf6ec', cursor: isCardOperable ? 'pointer' : 'not-allowed', opacity: isCardOperable ? 1 : 0.5 }}
                        >
                          ＋1
                        </button>
                        <button
                          type="button"
                          onClick={resetStaffCard}
                          disabled={!isCardOperable}
                          style={{ minHeight: 48, padding: '0 14px', background: 'transparent', border: '1px solid #e3c2b8', borderRadius: 12, fontSize: 13, color: '#b8573f', cursor: isCardOperable ? 'pointer' : 'not-allowed', opacity: isCardOperable ? 1 : 0.5 }}
                        >
                          表示を0に
                        </button>
                      </div>
                      <span className={s.muted} style={{ fontSize: 12 }}>
                        ＋1／−1は給与の出勤数にも入ります。「表示を0に」はカードの表示だけを0にし、給与は変えません。
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
                <section className={s.card} aria-labelledby="card-name" style={{ flex: '1 1 280px' }}>
                  <h2 id="card-name" className={s.h2}>氏名を直す</h2>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      className={s.input}
                      placeholder="氏名を入力"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      aria-label="氏名"
                      style={{ flex: 1 }}
                    />
                    <button type="button" className={s.btn} onClick={saveName} style={{ fontWeight: 700 }}>
                      保存
                    </button>
                  </div>
                  <span className={s.muted} style={{ fontSize: 12 }}>
                    保存するとカード画像も作り直します。空欄で保存すると「氏名未登録」に戻ります。
                  </span>
                </section>

                <section className={s.card} aria-labelledby="card-url" style={{ flex: '1 1 280px' }}>
                  <h2 id="card-url" className={s.h2}>カードの固定URL</h2>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <a
                      href={getFixedCardUrl(cardRecord.user_id)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, background: '#f4efe6', padding: '10px 12px', borderRadius: 10, fontFamily: 'monospace' }}
                    >
                      {getFixedCardUrl(cardRecord.user_id)}
                    </a>
                    <button type="button" className={`${s.btn} ${s.btnSmall}`} onClick={copyFixedCardUrl} style={{ background: '#eef2ea', border: 0 }}>
                      {copiedFixed ? 'コピー済み' : 'コピー'}
                    </button>
                  </div>
                  <span className={s.muted} style={{ fontSize: 12 }}>GTAで印刷に使うURLです。URLは変わりません。</span>
                  <details>
                    <summary style={{ cursor: 'pointer', fontSize: 13, color: '#6f665c' }}>詳しい情報（番号・カードID・カードの状態）</summary>
                    <p className={s.muted} style={{ margin: '6px 0 0' }}>
                      店舗 {currentStore?.store_name ?? '未設定'} ・ 番号 {cardRecord.user_id} ・ カードID {cardRecord.card_id} ・ カードの状態 {cardRecord.card_status || 'active'}
                    </p>
                  </details>
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
