import type { CSSProperties, ReactNode } from 'react'
import { themeTokens, type ThemeConfig } from '@/lib/theme.mjs'

export function themeProps(theme: ThemeConfig) {
  return {
    style: themeTokens(theme) as CSSProperties,
    'data-theme': theme.preset, 'data-background': theme.background,
    'data-decoration': theme.decoration.kind,
  }
}

export function WeddingTheme({ theme, children }: { theme: ThemeConfig; children: ReactNode }) {
  return <div className="wedding-theme" {...themeProps(theme)}>
    <ThemeDecoration theme={theme} />
    <div className="theme-content">{children}</div>
  </div>
}

function ThemeDecoration({ theme }: { theme: ThemeConfig }) {
  const { kind, intensity, motion } = theme.decoration
  if (!intensity || kind === 'none') return null
  const branches = ['pine', 'botanical', 'floral'].includes(kind)
  return <div className="theme-decoration" aria-hidden="true">
    {branches && <svg className="theme-branches" viewBox="0 0 360 132" fill="none">
      <path d="M-10 114C38 84 89 38 178 9M-2 85C45 58 78 27 129-4" stroke="currentColor" strokeWidth="2" />
      {kind === 'pine' ? <path d="M13 97l12-43m-4 36 49-4M35 82l9-48m1 41 45-7M55 65l9-43m4 36 45-9M81 47l6-33m5 26 42-8M108 30l8-27m3 23 35-9M19 77l10-39m12 24 38-10M59 47l7-34m15 18 35-12"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /> :
        [28, 57, 86, 115, 144].map((x, index) => <g key={x} transform={`translate(${x} ${88 - index * 16}) rotate(-29)`}>
          <ellipse cy="-9" rx="4" ry="12" fill="currentColor" transform="rotate(-34)" />
          <ellipse cx="10" cy="4" rx="12" ry="4" fill="currentColor" transform="rotate(-9)" />
          {kind === 'floral' && <circle cx="2" cy="-19" r="7" fill="var(--theme-accent)" />}
        </g>)}
      <path d="M190 10h163M197 16h133" stroke="var(--theme-accent)" opacity=".7" />
    </svg>}
    {(kind === 'pine' || kind === 'snow') && <div className={motion ? 'theme-snow theme-snow-moving' : 'theme-snow'} />}
  </div>
}

export function ThemeArtwork({ eventId, id, kind }: {
  eventId: string; id: string | null; kind: 'cover' | 'monogram'
}) {
  if (!id) return null
  return (
    // Assets are same-event, authenticated redirects to private R2 and have reserved dimensions.
    // eslint-disable-next-line @next/next/no-img-element
    <img className={`theme-${kind}`} src={`/api/events/${eventId}/theme-assets/${id}`} alt=""
      width={kind === 'cover' ? 800 : 48} height={kind === 'cover' ? 300 : 48}
      loading={kind === 'cover' ? 'lazy' : 'eager'} decoding="async" />
  )
}
