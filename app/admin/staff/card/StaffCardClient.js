'use client'

import theme from '@/lib/ui-theme'

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

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div style={styles.brandRow}>
            <div style={styles.brandMark}>📇</div>
            <div>
              <h1 style={styles.title}>-Bistro-Bambi</h1>
              <p style={styles.subtitle}>従業員カード管理</p>
              <p style={styles.headerDescription}>
                従業員カードの発行・検索・氏名変更・出勤数の確認と管理者調整を行います。
              </p>
              <p style={styles.storeText}>
                現在の対象店舗：
                {isStoreLoading
                  ? ' 読み込み中...'
                  : currentStore
                  ? ` ${currentStore.store_name} (${currentStore.store_code})`
                  : ' 未設定'}
              </p>
              {storeError && <p style={styles.errorText}>{storeError}</p>}
            </div>
          </div>

          <nav style={styles.nav}>
            <a href="/admin/staff/employees" style={styles.navButton}>
              従業員一覧
            </a>
            <a href="/admin/staff/manage" style={styles.navButton}>
              月末一括リセット
            </a>
            <a href="/admin/staff" style={styles.navButton}>
              従業員管理
            </a>
            <a href="/admin" style={styles.navButton}>
              管理メニュー
            </a>
          </nav>
        </header>

        {(createMessage || message || nameMessage) && (
          <div style={styles.messageArea}>
            {createMessage && <div style={styles.message}>{createMessage}</div>}
            {message && <div style={styles.message}>{message}</div>}
            {nameMessage && <div style={styles.message}>{nameMessage}</div>}
          </div>
        )}

        <div style={styles.layout}>
          <aside style={styles.sidebar}>
            <section style={styles.panel}>
              <div style={styles.sectionHead}>
                <span style={styles.sectionNumber}>01</span>
                <h2 style={styles.sectionTitle}>従業員カード新規発行</h2>
              </div>

              <p style={styles.description}>
                従業員コードと氏名を登録して、出勤管理用カードを発行します。
              </p>

              <div style={styles.formStack}>
                <input
                  type="text"
                  placeholder="従業員コードを入力（例: Bambi01）"
                  value={createStaffCode}
                  onChange={(e) => setCreateStaffCode(normalizeStaffCode(e.target.value))}
                  style={styles.input}
                />

                <input
                  type="text"
                  placeholder="氏名を入力（省略可）"
                  value={createStaffName}
                  onChange={(e) => setCreateStaffName(e.target.value)}
                  style={styles.input}
                />

                <button
                  onClick={createStaffCard}
                  style={{
                    ...styles.primaryButton,
                    ...((isStoreLoading || !currentStore) ? styles.disabledButton : {}),
                  }}
                  disabled={isStoreLoading || !currentStore}
                >
                  従業員カード新規発行
                </button>
              </div>
            </section>

            <section style={styles.panel}>
              <div style={styles.sectionHead}>
                <span style={styles.sectionNumber}>02</span>
                <h2 style={styles.sectionTitle}>従業員カード検索</h2>
              </div>

              <p style={styles.description}>
                従業員コードでカード情報と現在の出勤数を確認します。
              </p>

              <div style={styles.formStack}>
                <input
                  type="text"
                  placeholder="従業員コードを入力"
                  value={staffCode}
                  onChange={(e) => setStaffCode(normalizeStaffCode(e.target.value))}
                  style={styles.input}
                />

                <button
                  onClick={searchStaffCard}
                  style={{
                    ...styles.primaryButton,
                    ...((isStoreLoading || !currentStore) ? styles.disabledButton : {}),
                  }}
                  disabled={isStoreLoading || !currentStore}
                >
                  検索
                </button>
              </div>
            </section>

            {cardRecord && (
              <>
                <section style={styles.panel}>
                  <div style={styles.sectionHead}>
                    <span style={styles.sectionNumber}>03</span>
                    <h2 style={styles.sectionTitle}>氏名登録・修正</h2>
                  </div>

                  <div style={styles.formStack}>
                    <input
                      type="text"
                      placeholder="氏名を入力"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={styles.input}
                    />

                    <button onClick={saveName} style={styles.primaryButton}>
                      氏名を保存
                    </button>
                  </div>

                  <p style={styles.smallNote}>
                    空欄で保存すると、氏名未登録に戻せます。
                  </p>
                </section>

                <section style={isCardOperable ? styles.panel : styles.disabledPanel}>
                  <div style={styles.sectionHead}>
                    <span style={styles.sectionNumber}>04</span>
                    <h2 style={styles.sectionTitle}>出勤数の管理者調整</h2>
                  </div>

                  <p style={styles.description}>
                    通常の出勤操作はDiscordで行います。この操作はミス修正や確認用の管理者調整として使います。
                    給与集計用の出勤履歴はAM4:00基準の日付で保存されます。
                  </p>

                  {!isCardOperable && (
                    <div style={styles.retiredNotice}>
                      この従業員は退職済みのため、出勤数を操作できません。
                    </div>
                  )}

                  <div style={styles.attendanceActions}>
                    <button
                      onClick={() => updateAttendanceCount(-1)}
                      style={{
                        ...styles.attendanceButton,
                        ...(!isCardOperable ? styles.disabledActionButton : {}),
                      }}
                      disabled={!isCardOperable}
                    >
                      -1
                    </button>
                    <button
                      onClick={() => updateAttendanceCount(1)}
                      style={{
                        ...styles.attendanceButton,
                        ...(!isCardOperable ? styles.disabledActionButton : {}),
                      }}
                      disabled={!isCardOperable}
                    >
                      +1
                    </button>
                    <button
                      onClick={resetStaffCard}
                      style={{
                        ...styles.dangerButton,
                        ...(!isCardOperable ? styles.disabledDangerButton : {}),
                      }}
                      disabled={!isCardOperable}
                    >
                      リセット
                    </button>
                  </div>
                </section>
              </>
            )}
          </aside>

          <main style={styles.main}>
            <section style={styles.summaryGrid}>
              <SummaryCard
                label="従業員コード"
                value={cardRecord ? cardRecord.staff_code : '-'}
                sub="検索後に表示"
              />
              <SummaryCard
                label="氏名"
                value={cardRecord ? cardRecord.display_name || '未登録' : '-'}
                sub="従業員カード表示名"
              />
              <SummaryCard
                label="現在の出勤数"
                value={cardRecord ? cardRecord.current_count : '-'}
                sub="Discord操作・管理者調整後の現在値"
              />
              <SummaryCard
                label="在籍状態"
                value={cardRecord ? getEmploymentStatusLabel(cardRecord.employment_status) : '-'}
                sub={cardRecord && !isCardOperable ? '退職済みのため操作不可' : '出勤数操作可能'}
              />
            </section>

            <section style={styles.panel}>
              <div style={styles.mainSectionHead}>
                <div>
                  <h2 style={styles.mainTitle}>従業員カード情報</h2>
                  <p style={styles.mainDescription}>
                    店舗、従業員コード、氏名、現在の出勤数、固定URLを確認します。
                  </p>
                </div>
              </div>

              {cardRecord ? (
                <>
                  {!isCardOperable && (
                    <div style={styles.retiredNotice}>
                      この従業員は退職済みに設定されています。出勤数操作の対象外です。
                    </div>
                  )}

                  <div style={styles.infoGrid}>
                    <InfoItem label="店舗" value={currentStore?.store_name ?? '未設定'} />
                    <InfoItem label="従業員コード" value={cardRecord.staff_code} />
                    <InfoItem label="番号" value={cardRecord.user_id} />
                    <InfoItem label="カードID" value={cardRecord.card_id} />
                    <InfoItem label="氏名" value={cardRecord.display_name || '未登録'} />
                    <InfoItem label="現在の出勤数" value={cardRecord.current_count} />
                    <InfoItem
                      label="在籍状態"
                      value={getEmploymentStatusLabel(cardRecord.employment_status)}
                    />
                    <InfoItem label="カード状態" value={cardRecord.card_status || 'active'} />
                  </div>

                  <div style={styles.urlBox}>
                    <div style={styles.inputLabel}>固定カードURL</div>

                    <div style={styles.urlRow}>
                      <a
                        href={getFixedCardUrl(cardRecord.user_id)}
                        target="_blank"
                        rel="noreferrer"
                        style={styles.link}
                      >
                        {getFixedCardUrl(cardRecord.user_id)}
                      </a>

                      <button
                        onClick={copyFixedCardUrl}
                        style={copiedFixed ? styles.copyButtonActive : styles.copyButton}
                      >
                        {copiedFixed ? 'コピー済み' : 'コピー'}
                      </button>
                    </div>

                    <p style={styles.smallNote}>
                      従業員カードの固定URLです。カード画像上のマス数は表示上限であり、給与計算上の出勤上限ではありません。
                    </p>
                  </div>
                </>
              ) : (
                <div style={styles.emptyBox}>
                  従業員カードを検索すると、ここに従業員コード、氏名、現在の出勤数などが表示されます。
                </div>
              )}
            </section>

            <section style={styles.panel}>
              <div style={styles.mainSectionHead}>
                <div>
                  <h2 style={styles.mainTitle}>従業員カード画像プレビュー</h2>
                  <p style={styles.mainDescription}>
                    氏名保存や出勤数更新後は自動で画像を同期します。
                  </p>
                </div>
              </div>

              {cardRecord ? (
                <>
                  <div style={styles.previewFrame}>
                    <img
                      src={getPreviewUrl(cardRecord)}
                      alt={`従業員カード ${cardRecord.staff_code}`}
                      style={styles.previewImage}
                    />
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <button onClick={refreshPreview} style={styles.secondaryButton}>
                      プレビュー再読み込み
                    </button>
                  </div>
                </>
              ) : (
                <div style={styles.emptyBox}>
                  従業員カード検索後に、ここへ大きくプレビュー表示されます。
                </div>
              )}
            </section>

            <section style={styles.memoPanel}>
              <div style={styles.memoBadge}>OPERATION MEMO</div>
              <h2 style={styles.memoTitle}>運用メモ</h2>
              <div style={styles.memoGrid}>
                <div style={styles.memoItem}>
                  <div style={styles.memoLabel}>通常操作</div>
                  <p style={styles.memoText}>
                    従業員の出勤スタンプはDiscord側で押す運用です。
                  </p>
                </div>
                <div style={styles.memoItem}>
                  <div style={styles.memoLabel}>管理画面操作</div>
                  <p style={styles.memoText}>
                    この画面の +1 / -1 は、ミス修正や管理者確認用の調整として使用します。
                  </p>
                </div>
                <div style={styles.memoItem}>
                  <div style={styles.memoLabel}>給与集計</div>
                  <p style={styles.memoText}>
                    出勤履歴はAM4:00基準の work_date で保存され、給与計算に使われます。出勤回数に上限は設けません。
                  </p>
                </div>
              </div>
            </section>
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

function InfoItem({ label, value }) {
  return (
    <div style={styles.infoItem}>
      <div style={styles.infoLabel}>{label}</div>
      <div style={styles.infoValue}>{value}</div>
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
    maxWidth: '1640px',
    margin: '0 auto',
  },
  header: {
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    padding: '24px 28px',
    marginBottom: '18px',
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
    fontWeight: 950,
    color: theme.deep,
    margin: 0,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontFamily: 'var(--font-heading)',
    margin: '8px 0 0',
    fontSize: '20px',
    color: theme.deep,
    fontWeight: 900,
  },
  headerDescription: {
    margin: '6px 0 0',
    fontSize: '14px',
    color: theme.muted,
    lineHeight: 1.6,
  },
  storeText: {
    margin: '8px 0 0',
    fontSize: '14px',
    color: theme.muted,
    lineHeight: 1.6,
    fontWeight: 800,
  },
  errorText: {
    margin: '8px 0 0',
    fontSize: '14px',
    color: theme.danger,
    fontWeight: 900,
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
  messageArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '18px',
  },
  message: {
    fontSize: '15px',
    fontWeight: 800,
    color: theme.deep,
    background: theme.white,
    padding: '13px 15px',
    borderRadius: '4px',
    border: `1px solid ${theme.border}`,
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: '390px minmax(0, 1fr)',
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
  disabledPanel: {
    background: theme.panel2,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    padding: '20px',
    boxShadow: 'none',
  },
  sectionHead: {
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
  description: {
    fontSize: '15px',
    color: theme.muted,
    lineHeight: 1.7,
    margin: '0 0 14px',
  },
  smallNote: {
    fontSize: '13px',
    color: theme.muted,
    lineHeight: 1.7,
    margin: '10px 0 0',
  },
  formStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '13px 14px',
    fontSize: '16px',
    borderRadius: '4px',
    border: `1px solid ${theme.border2}`,
    background: theme.white,
    color: theme.text,
    outline: 'none',
  },
  inputLabel: {
    fontSize: '12px',
    color: theme.muted,
    fontWeight: 900,
    marginBottom: '6px',
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
  disabledButton: {
    opacity: 0.65,
    cursor: 'default',
  },
  secondaryButton: {
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
  attendanceActions: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
  },
  attendanceButton: {
    padding: '17px 18px',
    fontSize: '26px',
    fontWeight: 950,
    borderRadius: '4px',
    border: 'none',
    background: theme.green,
    color: theme.white,
    cursor: 'pointer',
    boxShadow: 'none',
  },
  disabledActionButton: {
    opacity: 0.48,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  dangerButton: {
    gridColumn: '1 / -1',
    padding: '14px 18px',
    fontSize: '16px',
    fontWeight: 900,
    borderRadius: '4px',
    border: `1px solid ${theme.border2}`,
    background: theme.white,
    color: theme.danger,
    cursor: 'pointer',
  },
  disabledDangerButton: {
    opacity: 0.48,
    cursor: 'not-allowed',
    background: theme.white,
    color: theme.muted,
  },
  retiredNotice: {
    marginBottom: '14px',
    background: theme.dangerPale,
    border: `1px solid ${theme.border2}`,
    borderRadius: '4px',
    padding: '12px 14px',
    color: theme.danger,
    fontSize: '14px',
    fontWeight: 900,
    lineHeight: 1.7,
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
    fontSize: '24px',
    fontWeight: 950,
    color: theme.deep,
    lineHeight: 1.3,
    wordBreak: 'break-word',
  },
  summarySub: {
    fontSize: '12px',
    color: theme.muted,
    marginTop: '8px',
    lineHeight: 1.5,
  },
  mainSectionHead: {
    marginBottom: '16px',
  },
  mainTitle: {
    fontSize: '24px',
    fontWeight: 950,
    color: theme.deep,
    margin: 0,
  },
  mainDescription: {
    fontSize: '15px',
    color: theme.muted,
    lineHeight: 1.7,
    margin: '6px 0 0',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
  },
  infoItem: {
    background: theme.white,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    padding: '14px',
  },
  infoLabel: {
    fontSize: '12px',
    color: theme.muted,
    fontWeight: 900,
    marginBottom: '8px',
  },
  infoValue: {
    fontSize: '18px',
    color: theme.deep,
    fontWeight: 900,
    wordBreak: 'break-word',
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
  urlBox: {
    marginTop: '16px',
    background: theme.white,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    padding: '14px',
  },
  urlRow: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  link: {
    color: theme.green,
    fontWeight: 900,
    textDecoration: 'none',
    wordBreak: 'break-all',
  },
  copyButton: {
    padding: '10px 13px',
    fontSize: '14px',
    fontWeight: 900,
    borderRadius: '4px',
    border: `1px solid ${theme.border2}`,
    background: theme.white,
    color: theme.deep,
    cursor: 'pointer',
  },
  copyButtonActive: {
    padding: '10px 13px',
    fontSize: '14px',
    fontWeight: 900,
    borderRadius: '4px',
    border: 'none',
    background: theme.green,
    color: theme.white,
    cursor: 'pointer',
  },
  previewFrame: {
    background: theme.white,
    padding: '16px',
    borderRadius: '4px',
    border: `1px solid ${theme.border}`,
  },
  previewImage: {
    width: '100%',
    maxWidth: '100%',
    borderRadius: '4px',
    border: `1px solid ${theme.border2}`,
    display: 'block',
    background: theme.white,
  },
  memoPanel: {
    background: theme.panel,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    padding: '20px',
    boxShadow: 'none',
  },
  memoBadge: {
    display: 'inline-flex',
    padding: '6px 10px',
    borderRadius: '4px',
    background: theme.pale,
    border: `1px solid ${theme.border2}`,
    color: theme.deep,
    fontSize: '12px',
    fontWeight: 950,
    marginBottom: '10px',
    letterSpacing: '0.08em',
  },
  memoTitle: {
    fontSize: '24px',
    fontWeight: 950,
    color: theme.deep,
    margin: 0,
  },
  memoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '12px',
    marginTop: '16px',
  },
  memoItem: {
    background: theme.white,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    padding: '14px',
  },
  memoLabel: {
    fontSize: '13px',
    color: theme.deep,
    fontWeight: 950,
    marginBottom: '8px',
  },
  memoText: {
    fontSize: '14px',
    color: theme.muted,
    lineHeight: 1.75,
    margin: 0,
  },
}