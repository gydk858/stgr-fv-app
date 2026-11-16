'use client'

// 新デザイン（案B）の管理画面の外枠：左の固定メニュー＋本文。
// 置き換えが済んだ画面だけで使う（どの画面で使うかは components/site/SiteShell.tsx で決める）。
import { usePathname } from 'next/navigation'
import s from './v2.module.css'
import { v2FontVariables } from './fonts'

const GROUPS = [
  { label: null, links: [['/admin', 'ホーム']] },
  { label: 'スタッフ・お金', links: [['/admin/staff', '従業員'], ['/admin/staff/payroll', '給与'], ['/admin/staff/ranch', '牧場']] },
  { label: 'お店の運営', links: [['/admin/hunters', 'ハンティング'], ['/admin/events', 'イベント']] },
]

// 今いる画面に一致するメニュー（より長い一致を優先。「従業員」が給与・牧場の画面で選択中にならないようにする）
function activeHref(path) {
  const all = GROUPS.flatMap((g) => g.links.map(([href]) => href))
  return all
    .filter((href) => (href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0]
}

export default function AdminShellV2({ children }) {
  const path = usePathname() || '/admin'
  const current = activeHref(path)

  const logout = async () => {
    await fetch('/api/admin-logout', { method: 'POST' })
    window.location.href = '/admin/login'
  }

  return (
    <div className={`${s.shell} ${v2FontVariables}`}>
      <nav className={s.nav} aria-label="メインメニュー">
        <a href="/admin" className={s.brand}>
          <span className={s.seal} aria-hidden="true">鹿</span>
          <span className={s.brandText}>
            <span className={s.brandEn}>Bistro Bambi</span>
            <span className={s.brandJa}>店長の管理画面</span>
          </span>
        </a>
        <svg className={s.asanoha} aria-hidden="true">
          <defs>
            <pattern id="v2-asanoha" width="12" height="6" patternUnits="userSpaceOnUse">
              <path d="M0 3 L6 0 L12 3 L6 6 Z M6 0 L6 6 M0 3 L12 3" stroke="#c9b285" strokeWidth="0.5" fill="none" opacity="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="6" fill="url(#v2-asanoha)" />
        </svg>
        {GROUPS.map((group) => (
          <div className={s.navGroup} key={group.label || 'top'}>
            {group.label && <span className={s.navLabel}>{group.label}</span>}
            {group.links.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className={`${s.navLink} ${current === href ? s.navLinkActive : ''}`}
                aria-current={current === href ? 'page' : undefined}
              >
                {label}
              </a>
            ))}
          </div>
        ))}
        <button type="button" className={s.navLogout} onClick={logout}>ログアウト</button>
      </nav>
      <main className={s.main}>{children}</main>
    </div>
  )
}
