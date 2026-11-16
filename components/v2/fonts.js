// 新デザイン（案B：森のキッチン）のフォント。next/font でサイト自身から配信する（ブラウザから Google へは通信しない）。
// 日本語フォントは文字数が多いため preload しない。
import { Shippori_Mincho, Zen_Maru_Gothic, Cormorant_Garamond } from 'next/font/google'

export const v2Mincho = Shippori_Mincho({
  weight: ['500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--v2-font-mincho',
})

export const v2Body = Zen_Maru_Gothic({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--v2-font-body',
})

export const v2Latin = Cormorant_Garamond({
  weight: ['500', '600'],
  style: ['italic'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--v2-font-latin',
})

export const v2FontVariables = `${v2Mincho.variable} ${v2Body.variable} ${v2Latin.variable}`
