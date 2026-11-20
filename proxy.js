import { NextResponse } from 'next/server'
import { EVENT_COOKIE, createEventSession, validEventSession } from './lib/event-session'

// ローカル開発（npm run dev を localhost で開いたとき）だけ、ログイン画面を省いて自動でログイン済みにする（2026-11-20、ユーザー依頼）。
// 本番（Vercel）は NODE_ENV が production なので、この分岐には入らない。npm run start（本番モード）でもログインが必要。
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const localDevBypass = request =>
  process.env.NODE_ENV === 'development' && LOCAL_HOSTS.has(request.nextUrl.hostname) && !!process.env.ADMIN_PASSWORD

export function proxy(request) {
  const pathname = request.nextUrl.pathname
  const protectedPath = (pathname.startsWith('/admin') && pathname !== '/admin/login') || (pathname.startsWith('/api/admin-') && !['/api/admin-login','/api/admin-logout'].includes(pathname))
  const hasSession = validEventSession(request.cookies.get(EVENT_COOKIE)?.value)

  if (localDevBypass(request)) {
    // ログイン画面を開いたら、そのままホームへ
    if (pathname === '/admin/login') {
      const redirect = NextResponse.redirect(new URL('/admin', request.url))
      if (!hasSession) redirect.cookies.set(EVENT_COOKIE, createEventSession(), { httpOnly: true, secure: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 })
      return redirect
    }
    // 管理画面・管理 API は、セッションがなければこの場で作って通す
    if (protectedPath && !hasSession) {
      const session = createEventSession()
      request.cookies.set(EVENT_COOKIE, session)
      const headers = new Headers(request.headers)
      headers.set('cookie', request.cookies.toString())
      const response = NextResponse.next({ request: { headers } })
      response.cookies.set(EVENT_COOKIE, session, { httpOnly: true, secure: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 })
      return response
    }
  }

  if (protectedPath && !hasSession) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: '管理ログインをやり直してください。' }, { status: 401 })
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }
  const response = NextResponse.next()
  if (pathname.startsWith('/hunter-user/') || pathname.startsWith('/hunter-print/') || pathname.startsWith('/api/hunter-owner') || pathname.startsWith('/hunter-access/') || pathname.startsWith('/api/hunters') || pathname.startsWith('/event-access/') || pathname.startsWith('/api/event-')) {
    response.headers.set('Referrer-Policy', 'no-referrer')
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }
  return response
}
export const config = { matcher: ['/admin/:path*','/api/:path*','/event-access/:path*','/hunter-access/:path*','/hunter-user/:path*','/hunter-print/:path*'] }
