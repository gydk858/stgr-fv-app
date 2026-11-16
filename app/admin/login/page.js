'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import s from '@/components/v2/v2.module.css'
import { v2FontVariables } from '@/components/v2/fonts'

// 管理画面のログイン（新デザイン案B）。ログインの処理（/api/admin-login に送る・成功したらホームへ）は従来どおり。
export default function AdminLoginPage() {
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [sending, setSending] = useState(false)
  const router = useRouter()

  const handleLogin = async (e) => {
    e.preventDefault()
    if (sending) return
    setMessage('')
    setSending(true)

    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const result = await res.json()

      if (!res.ok) {
        setMessage(result.message || 'ログインに失敗しました')
        return
      }

      router.push('/admin')
      router.refresh()
    } catch {
      setMessage('ログインに失敗しました。通信状態を確認して、もう一度お試しください。')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className={v2FontVariables}
      style={{
        // 部品（入力欄・ボタン）の色。管理画面では外枠が決めているが、ログインは外枠なしなのでここで決める
        '--forest': '#22352b', '--moss': '#2f4a3a', '--ground': '#f4efe6', '--paper': '#fffdf9', '--field': '#faf6ee',
        '--line': '#e4dacb', '--line2': '#d8ccb6', '--sand': '#dcc79e', '--sand-text': '#8a6f45', '--terracotta': '#b8573f',
        '--sage': '#e7eee4', '--sage-text': '#34503a', '--text': '#2b2925', '--muted': '#6f665c',
        minHeight: '100vh',
        background: '#f4efe6',
        color: '#2b2925',
        fontFamily: 'var(--v2-font-body), "Yu Gothic", sans-serif',
        fontSize: 15,
        lineHeight: 1.7,
        display: 'flex',
        flexWrap: 'wrap',
      }}
    >
      <section
        aria-label="お店の名前"
        style={{
          flex: '1 1 420px',
          minHeight: 320,
          background: '#22352b',
          color: '#e9e2d4',
          padding: '48px 56px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <svg aria-hidden="true" width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.07 }}>
          <defs>
            <pattern id="login-asanoha" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M24 0 L24 48 M0 24 L48 24 M0 0 L48 48 M48 0 L0 48" stroke="#dcc79e" strokeWidth="1" fill="none" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#login-asanoha)" />
        </svg>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span
            aria-hidden="true"
            style={{ width: 52, height: 52, background: '#b8573f', color: '#fbf6ec', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 26, borderRadius: 12 }}
          >
            鹿
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
            <span style={{ fontFamily: 'var(--v2-font-latin), serif', fontStyle: 'italic', fontSize: 24, color: '#dcc79e' }}>Bistro Bambi</span>
            <span style={{ fontSize: 13, letterSpacing: '0.2em', color: '#c7d1c4' }}>ビストロ・バンビ</span>
          </span>
        </div>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontFamily: 'var(--v2-font-mincho), serif', fontWeight: 700, fontSize: 34, letterSpacing: '0.12em', color: '#f4efe6' }}>
            森の恵みと、ともに。
          </span>
          <span style={{ fontSize: 14, color: '#c7d1c4' }}>店長の管理画面</span>
        </div>
      </section>

      <main style={{ flex: '1 1 420px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', boxSizing: 'border-box' }}>
        <form
          onSubmit={handleLogin}
          style={{
            width: '100%',
            maxWidth: 400,
            background: '#fffdf9',
            border: '1px solid #e4dacb',
            borderRadius: 18,
            padding: '32px 30px',
            boxShadow: '0 4px 20px rgba(43, 41, 37, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className={s.kicker}>Welcome back</span>
            <h1 className={s.title} style={{ fontSize: 26 }}>ログイン</h1>
          </div>

          <label htmlFor="password" className={s.field}>
            パスワード
            <span style={{ display: 'flex', gap: 8 }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="パスワードを入力"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={s.input}
                style={{ flex: 1, minWidth: 0, minHeight: 48, fontSize: 16, textAlign: 'left' }}
              />
              <button
                type="button"
                className={s.btn}
                onClick={() => setShowPassword((prev) => !prev)}
                aria-pressed={showPassword}
                style={{ minHeight: 48 }}
              >
                {showPassword ? '隠す' : '表示'}
              </button>
            </span>
          </label>

          <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={sending} style={{ minHeight: 50, fontSize: 16, background: '#22352b', borderColor: '#22352b' }}>
            {sending ? 'ログイン中...' : 'ログインする'}
          </button>

          {message && (
            <div role="alert" style={{ padding: '10px 14px', background: '#f8ece7', color: '#b8573f', borderRadius: 10, fontSize: 14 }}>
              {message}
            </div>
          )}

          <span className={s.muted} style={{ fontSize: 12, textAlign: 'center' }}>
            ログインすると、ホーム（今日のようす）が開きます
          </span>
        </form>
      </main>
    </div>
  )
}
