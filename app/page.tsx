import { v2FontVariables } from '@/components/v2/fonts'

// トップページ（入口）。新デザイン（案B）2026-11-17〜。外枠は SiteShell で外している。
const mincho = 'var(--v2-font-mincho), serif'
const latin = 'var(--v2-font-latin), serif'

const card: React.CSSProperties = {
  background: '#fffdf9',
  border: '1px solid #e4dacb',
  borderRadius: 18,
  padding: '24px 26px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  boxShadow: '0 6px 24px rgba(43,41,37,.10)',
}

export default function Home() {
  return (
    <div
      className={v2FontVariables}
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#f4efe6',
        color: '#2b2925',
        fontFamily: 'var(--v2-font-body), "Yu Gothic", sans-serif',
        fontSize: 15,
        lineHeight: 1.7,
      }}
    >
      <section
        aria-label="ビストロバンビ"
        style={{
          position: 'relative',
          minHeight: 'min(520px, 70vh)',
          display: 'flex',
          alignItems: 'flex-end',
          overflow: 'hidden',
          background:
            "linear-gradient(180deg, rgba(34,53,43,.55) 0%, rgba(34,53,43,.78) 60%, rgba(26,42,33,.95) 100%), #22352b url('/site/forest-hero.webp') center 56%/cover no-repeat",
        }}
      >
        <div style={{ position: 'absolute', left: 'clamp(20px, 4vw, 48px)', top: 32, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span
            aria-hidden="true"
            style={{ width: 48, height: 48, background: '#b8573f', color: '#fbf6ec', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mincho, fontWeight: 700, fontSize: 24, borderRadius: 12 }}
          >
            鹿
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
            <span style={{ fontFamily: latin, fontStyle: 'italic', fontSize: 22, color: '#dcc79e' }}>Bistro Bambi</span>
            <span style={{ fontSize: 12, letterSpacing: '0.2em', color: '#c7d1c4' }}>ビストロ・バンビ</span>
          </span>
        </div>
        <div style={{ position: 'relative', padding: '120px clamp(20px, 4vw, 48px) 72px', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
          <span style={{ fontFamily: latin, fontStyle: 'italic', fontSize: 20, color: '#dcc79e' }}>Welcome to Bambi</span>
          <h1 style={{ margin: 0, fontFamily: mincho, fontWeight: 700, fontSize: 'clamp(30px, 4.2vw, 46px)', letterSpacing: '0.12em', color: '#f4efe6', lineHeight: 1.4 }}>
            森の恵みと、ともに。
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: '#e9e2d4' }}>ビストロバンビへようこそ。</p>
        </div>
      </section>

      <section
        style={{
          maxWidth: 1080,
          width: '100%',
          margin: '-40px auto 0',
          padding: '0 24px 56px',
          boxSizing: 'border-box',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
          position: 'relative',
        }}
      >
        <article style={card}>
          <span style={{ fontFamily: latin, fontStyle: 'italic', fontSize: 17, color: '#8a6f45' }}>For staff</span>
          <h2 style={{ margin: 0, fontFamily: mincho, fontWeight: 700, fontSize: 21, color: '#22352b' }}>スタッフの方</h2>
          <p style={{ margin: 0, fontSize: 14, color: '#6f665c' }}>管理画面にはこちらからログインしてください。</p>
          <a
            href="/admin/login"
            style={{ alignSelf: 'flex-start', marginTop: 6, display: 'inline-flex', alignItems: 'center', minHeight: 46, padding: '0 22px', background: '#22352b', color: '#fbf6ec', borderRadius: 12, fontWeight: 700, textDecoration: 'none' }}
          >
            ログインする →
          </a>
        </article>
        <article style={card}>
          <span style={{ fontFamily: latin, fontStyle: 'italic', fontSize: 17, color: '#8a6f45' }}>For hunters &amp; guests</span>
          <h2 style={{ margin: 0, fontFamily: mincho, fontWeight: 700, fontSize: 21, color: '#22352b' }}>専用ページをお持ちの方</h2>
          <p style={{ margin: 0, fontSize: 14, color: '#6f665c' }}>
            ハンターの本人用ページや担当者用のページは、お店からお渡ししたURLからお進みください。URLがわからないときは、スタッフにお声がけください。
          </p>
        </article>
      </section>

      <footer style={{ marginTop: 'auto', padding: '22px clamp(20px, 4vw, 48px)', borderTop: '1px solid #e4dacb', display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', color: '#6f665c', fontSize: 12, letterSpacing: '0.12em' }}>
        <span style={{ fontFamily: latin, fontStyle: 'italic', fontSize: 15, color: '#8a6f45' }}>Bistro Bambi</span>
        <span>森の恵みと、ともに。</span>
      </footer>
    </div>
  )
}
