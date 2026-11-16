'use client'

import { usePathname } from 'next/navigation'
import s from './v2.module.css'

// 従業員まわりの見出しとタブ（従業員一覧／カード操作／月末リセット）
const TABS = [
  { href: '/admin/staff', label: '従業員一覧', match: ['/admin/staff', '/admin/staff/employees'] },
  { href: '/admin/staff/card', label: 'カード操作', match: ['/admin/staff/card'] },
  { href: '/admin/staff/manage', label: '月末リセット', match: ['/admin/staff/manage'] },
]

export default function StaffTabs() {
  const path = usePathname() || ''
  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span className={s.kicker}>Staff</span>
        <h1 className={s.title}>従業員</h1>
      </div>
      <nav className={s.tabs} aria-label="従業員の画面">
        {TABS.map((tab) => {
          const active = tab.match.includes(path)
          return (
            <a
              key={tab.href}
              href={tab.href}
              className={`${s.tab} ${active ? s.tabActive : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {tab.label}
            </a>
          )
        })}
      </nav>
    </header>
  )
}
