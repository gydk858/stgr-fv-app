'use client'

import s from '@/components/v2/v2.module.css'
import StaffTabs from '@/components/v2/StaffTabs'

import { useEffect, useMemo, useState } from 'react'
import { adminGet, adminPost } from '@/lib/admin-api'

const STAFF_GRADES = ['Recruit', 'Employee', 'Experienced', 'Chief']

export default function EmployeesClient() {
  const [loading, setLoading] = useState(true)
  const [savingUserId, setSavingUserId] = useState(null)
  const [message, setMessage] = useState('')

  const [store, setStore] = useState(null)
  const [employees, setEmployees] = useState([])
  const [cardMap, setCardMap] = useState({})

  const [statusFilter, setStatusFilter] = useState('active')
  const [searchText, setSearchText] = useState('')
  const [edits, setEdits] = useState({})
  // その場で編集中の従業員（1人ずつ）
  const [editingUserId, setEditingUserId] = useState(null)

  useEffect(() => {
    initialize()
  }, [])

  const initialize = async () => {
    setLoading(true)
    setMessage('')

    try {
      // 店舗・従業員・在籍カードは /api/admin-staff がまとめて返す（店舗はサーバーが決める）
      await fetchEmployees()
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

  const fetchEmployees = async () => {
    const { store: storeData, employees: employeeRows, cards } = await adminGet('/api/admin-staff', {
      view: 'employees',
    })

    if (storeData) setStore(storeData)
    const rows = employeeRows || []
    setEmployees(rows)

    const nextEdits = {}
    rows.forEach((employee) => {
      nextEdits[employee.user_id] = {
        employeeName: employee.employee_name || '',
        employmentStatus: employee.employment_status || 'active',
        staffGrade: employee.staff_grade || 'Recruit',
        resignedAt: employee.resigned_at || '',
        employeeNote: employee.employee_note || '',
      }
    })
    setEdits(nextEdits)

    const map = {}
    ;(cards || []).forEach((card) => {
      map[String(card.user_id)] = card
    })
    setCardMap(map)

    return rows
  }

  const reload = async () => {
    if (!store?.store_id) return

    setLoading(true)
    setMessage('再読み込み中です...')

    try {
      await fetchEmployees()
      setMessage('従業員一覧を再読み込みしました')
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

  const updateEdit = (userId, field, value) => {
    setEdits((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || {
          employeeName: '',
          employmentStatus: 'active',
          staffGrade: 'Recruit',
          resignedAt: '',
          employeeNote: '',
        }),
        [field]: value,
      },
    }))
  }

  const saveEmployee = async (employee) => {
    const edit = edits[employee.user_id]
    if (!edit) return

    setSavingUserId(employee.user_id)
    setMessage(`${employee.staff_code} を保存中です...`)

    try {
      const employmentStatus = edit.employmentStatus || 'active'
      const staffGrade = STAFF_GRADES.includes(edit.staffGrade)
        ? edit.staffGrade
        : 'Recruit'

      // 現在の店舗の従業員かどうかは、サーバーが確認してから更新する
      await adminPost('/api/admin-staff', {
        action: 'save_employee',
        user_id: Number(employee.user_id),
        employee_name: edit.employeeName.trim() === '' ? null : edit.employeeName.trim(),
        employment_status: employmentStatus,
        resigned_at:
          employmentStatus === 'retired' && edit.resignedAt
            ? edit.resignedAt
            : null,
        employee_note: edit.employeeNote.trim() === '' ? null : edit.employeeNote.trim(),
        staff_grade: staffGrade,
      })

      await fetchEmployees()

      setMessage(`${employee.staff_code} を保存しました`)
    } catch (error) {
      console.error(error)
      setMessage(
        error instanceof Error
          ? `${employee.staff_code} の保存に失敗しました: ${error.message}`
          : `${employee.staff_code} の保存に失敗しました`
      )
    } finally {
      setSavingUserId(null)
    }
  }

  const markRetiredToday = (employee) => {
    const today = new Date().toISOString().slice(0, 10)
    updateEdit(employee.user_id, 'employmentStatus', 'retired')
    updateEdit(employee.user_id, 'resignedAt', today)
  }

  const markActive = (employee) => {
    updateEdit(employee.user_id, 'employmentStatus', 'active')
    updateEdit(employee.user_id, 'resignedAt', '')
  }

  const filteredEmployees = useMemo(() => {
    const keyword = searchText.trim().toLowerCase()

    return employees.filter((employee) => {
      const status = employee.employment_status || 'active'

      if (statusFilter === 'active' && status !== 'active') return false
      if (statusFilter === 'retired' && status !== 'retired') return false

      if (!keyword) return true

      const joined = [
        employee.staff_code,
        employee.employee_name,
        employee.staff_grade,
        employee.employee_note,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return joined.includes(keyword)
    })
  }, [employees, statusFilter, searchText])

  const activeCount = employees.filter(
    (employee) => (employee.employment_status || 'active') === 'active'
  ).length

  const retiredCount = employees.filter(
    (employee) => employee.employment_status === 'retired'
  ).length

  const chiefCount = employees.filter(
    (employee) => employee.staff_grade === 'Chief'
  ).length

  const logout = async () => {
    await fetch('/api/admin-logout', { method: 'POST' })
    window.location.href = '/admin/login'
  }

  const formatNumber = (value) => {
    if (value === null || value === undefined || value === '') return '0'
    return Number(value).toLocaleString()
  }

  // ---- 新デザイン（案B）の表示用 ----
  const startEditEmployee = (employee) => {
    setEditingUserId(employee.user_id)
  }

  // やめる：入力中の内容を、保存されている値に戻す
  const cancelEditEmployee = (employee) => {
    setEdits((prev) => ({
      ...prev,
      [employee.user_id]: {
        employeeName: employee.employee_name || '',
        employmentStatus: employee.employment_status || 'active',
        staffGrade: employee.staff_grade || 'Recruit',
        resignedAt: employee.resigned_at || '',
        employeeNote: employee.employee_note || '',
      },
    }))
    setEditingUserId(null)
  }

  const saveAndClose = async (employee) => {
    await saveEmployee(employee)
    setEditingUserId(null)
  }

  const experiencedCount = employees.filter(
    (employee) => (employee.employment_status || 'active') === 'active' && employee.staff_grade === 'Experienced'
  ).length
  const activeChiefCount = employees.filter(
    (employee) => (employee.employment_status || 'active') === 'active' && employee.staff_grade === 'Chief'
  ).length

  const gradePill = (grade) => {
    const g = grade || 'Recruit'
    const style =
      g === 'Chief'
        ? { background: '#f4ede0', color: '#6a4a12' }
        : g === 'Experienced'
          ? { background: '#eef2ea', color: '#2f4a3a' }
          : { background: '#faf6ee', color: '#6f665c', border: '1px solid #e4dacb' }
    return <span className={s.pill} style={{ ...style, fontSize: 12, fontWeight: 700 }}>{g}</span>
  }

  const statusPill = (status, resignedAt) =>
    status === 'retired' ? (
      <span className={s.pill} style={{ background: '#efeae0', color: '#6f665c', fontSize: 12, fontWeight: 700 }}>
        退職{resignedAt ? ` ${String(resignedAt).slice(0, 10)}` : ''}
      </span>
    ) : (
      <span className={s.pill} style={{ background: '#e7eee4', color: '#34503a', fontSize: 12, fontWeight: 700 }}>在籍中</span>
    )

  if (loading) {
    return (
      <>
        <StaffTabs />
        <div className={s.card}><p className={s.muted}>読み込み中です...</p></div>
      </>
    )
  }

  const isError = /失敗/.test(message)
  const filters = [
    ['active', '在籍中'],
    ['retired', '退職'],
    ['all', 'すべて'],
  ]

  return (
    <>
      <StaffTabs />

      {message && !/を保存中です/.test(message) && (
        <div
          className={isError ? s.warnBox : s.notice}
          role={isError ? 'alert' : 'status'}
          style={isError ? { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#f8ece7', color: '#b8573f', fontSize: 14 } : undefined}
        >
          <span>{message}</span>
          <button type="button" className={s.noticeClose} aria-label="お知らせを閉じる" onClick={() => setMessage('')}>×</button>
        </div>
      )}

      <section aria-label="人数" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <div className={s.cardDark} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, padding: '12px 18px' }}>
          <span style={{ fontSize: 13, color: '#c7d1c4' }}>在籍中</span>
          <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 24, color: '#e4d1a6' }}>{activeCount}</span>
          <span style={{ fontSize: 13, color: '#c7d1c4' }}>人</span>
        </div>
        <div className={s.card} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, padding: '12px 18px' }}>
          <span className={s.muted}>うち Chief</span>
          <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 22, color: '#22352b' }}>{activeChiefCount}</span>
          <span className={s.muted}>・ Experienced {experiencedCount}</span>
        </div>
        <div className={s.card} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, padding: '12px 18px' }}>
          <span className={s.muted}>退職</span>
          <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 22, color: '#22352b' }}>{retiredCount}</span>
          <span className={s.muted}>人</span>
        </div>
        <button type="button" className={`${s.btn} ${s.btnSmall}`} onClick={reload} disabled={loading} style={{ alignSelf: 'center', marginLeft: 'auto' }}>
          再読み込み
        </button>
      </section>

      <section className={s.card} aria-labelledby="staff-list">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <h2 id="staff-list" className={s.h2}>従業員一覧</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <div role="group" aria-label="在籍で絞る" style={{ display: 'flex', gap: 4, background: '#f4efe6', padding: 4, borderRadius: 999 }}>
              {filters.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={statusFilter === key}
                  onClick={() => setStatusFilter(key)}
                  style={{
                    minHeight: 34,
                    padding: '0 14px',
                    border: 0,
                    borderRadius: 999,
                    fontSize: 13,
                    cursor: 'pointer',
                    background: statusFilter === key ? '#fffdf9' : 'transparent',
                    color: statusFilter === key ? '#22352b' : '#6f665c',
                    fontWeight: statusFilter === key ? 700 : 400,
                    boxShadow: statusFilter === key ? '0 1px 4px rgba(43,41,37,.12)' : 'none',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              type="search"
              className={s.input}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="名前・コード・メモで探す"
              aria-label="従業員を探す"
              style={{ minHeight: 38, width: 220, fontSize: 14 }}
            />
          </div>
        </div>

        {filteredEmployees.length === 0 ? (
          <div className={s.empty}>条件に合う従業員はいません。</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table} style={{ fontSize: 14 }}>
              <thead>
                <tr>
                  <th scope="col">従業員</th>
                  <th scope="col">グレード</th>
                  <th scope="col">在籍</th>
                  <th scope="col" style={{ textAlign: 'right' }}>カードの出勤数</th>
                  <th scope="col">メモ</th>
                  <th scope="col"><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>操作</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => {
                  const edit = edits[employee.user_id] || {
                    employeeName: employee.employee_name || '',
                    employmentStatus: employee.employment_status || 'active',
                    staffGrade: employee.staff_grade || 'Recruit',
                    resignedAt: employee.resigned_at || '',
                    employeeNote: employee.employee_note || '',
                  }
                  const card = cardMap[String(employee.user_id)]
                  const isRetired = edit.employmentStatus === 'retired'
                  const isSaving = savingUserId === employee.user_id
                  const cardHref = `/admin/staff/card?staff_code=${encodeURIComponent(employee.staff_code)}`

                  if (editingUserId === employee.user_id) {
                    return (
                      <tr key={employee.user_id} style={{ background: '#fbf7ef' }}>
                        <td colSpan={6} style={{ borderLeft: '3px solid #dcc79e', padding: 14 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#8a6f45' }}>{employee.staff_code} を編集中</span>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                              <label className={s.field}>
                                氏名
                                <input type="text" className={s.input} value={edit.employeeName} onChange={(e) => updateEdit(employee.user_id, 'employeeName', e.target.value)} placeholder="氏名" />
                              </label>
                              <label className={s.field}>
                                グレード
                                <select className={s.select} value={edit.staffGrade} onChange={(e) => updateEdit(employee.user_id, 'staffGrade', e.target.value)}>
                                  {STAFF_GRADES.map((grade) => (
                                    <option key={grade} value={grade}>{grade}</option>
                                  ))}
                                </select>
                              </label>
                              <label className={s.field}>
                                在籍
                                <select className={s.select} value={edit.employmentStatus} onChange={(e) => updateEdit(employee.user_id, 'employmentStatus', e.target.value)}>
                                  <option value="active">在籍中</option>
                                  <option value="retired">退職</option>
                                </select>
                              </label>
                              <label className={s.field}>
                                退職日
                                <input
                                  type="date"
                                  className={s.input}
                                  value={edit.resignedAt || ''}
                                  onChange={(e) => updateEdit(employee.user_id, 'resignedAt', e.target.value)}
                                  disabled={!isRetired}
                                />
                              </label>
                            </div>
                            <label className={s.field}>
                              メモ
                              <input type="text" className={s.input} value={edit.employeeNote} onChange={(e) => updateEdit(employee.user_id, 'employeeNote', e.target.value)} placeholder="メモ" />
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
                              {isRetired ? (
                                <button type="button" className={`${s.btn} ${s.btnSmall}`} onClick={() => markActive(employee)} disabled={isSaving}>
                                  在籍に戻す
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className={`${s.btn} ${s.btnSmall}`}
                                  onClick={() => markRetiredToday(employee)}
                                  disabled={isSaving}
                                  style={{ background: 'transparent', color: '#b8573f', border: '1px solid #e3c2b8' }}
                                >
                                  今日付けで退職にする
                                </button>
                              )}
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button type="button" className={`${s.btn} ${s.btnSmall}`} onClick={() => cancelEditEmployee(employee)} disabled={isSaving}>
                                  やめる
                                </button>
                                <button type="button" className={`${s.btn} ${s.btnSmall} ${s.btnPrimary}`} onClick={() => saveAndClose(employee)} disabled={isSaving}>
                                  {isSaving ? '保存中...' : '保存する'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr key={employee.user_id}>
                      <th scope="row" style={{ fontWeight: 500 }}>
                        {employee.employee_name || '未登録'}
                        <span className={s.subText}>{employee.staff_code}</span>
                      </th>
                      <td>{gradePill(employee.staff_grade)}</td>
                      <td>{statusPill(employee.employment_status || 'active', employee.resigned_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {card ? (
                          <>
                            {formatNumber(card.current_count)}
                            <span className={s.muted} style={{ fontSize: 12 }}> 回</span>
                          </>
                        ) : (
                          <span style={{ color: '#b9ae9f' }}>−</span>
                        )}
                      </td>
                      <td className={s.muted} style={{ fontSize: 13 }}>{employee.employee_note || '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className={`${s.btn} ${s.btnSmall}`}
                          onClick={() => startEditEmployee(employee)}
                          disabled={savingUserId !== null || (editingUserId !== null && editingUserId !== employee.user_id)}
                          style={{ background: '#eef2ea', border: 0 }}
                        >
                          直す
                        </button>{' '}
                        <a href={cardHref} className={`${s.btn} ${s.btnSmall}`} style={{ textDecoration: 'none' }}>
                          カード
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className={s.muted} style={{ margin: 0, fontSize: 12 }}>
          「直す」を押すと、その行がその場で編集欄に開きます。退職にしても、過去の給与履歴は消えません。「カード」を押すと、カード操作のタブでその人のカードが開きます。
        </p>
      </section>
    </>
  )
}
