'use client'

// 新デザイン（案B）の、左メニューなしの外枠（スタッフ用の専用URLなど）。
// フォントと地の色だけを用意し、管理画面へのリンクは出さない。
import { v2FontVariables } from './fonts'

export default function StandaloneV2({ children }) {
  return (
    <div
      className={v2FontVariables}
      style={{
        minHeight: '100vh',
        background: '#f4efe6',
        color: '#2b2925',
        fontFamily: 'var(--v2-font-body), "Yu Gothic", sans-serif',
        padding: '28px 32px 64px',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  )
}
