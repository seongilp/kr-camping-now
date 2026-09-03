import type { Metadata, Viewport } from 'next';
import { Noto_Sans_KR } from 'next/font/google';

import './globals.css';

/**
 * 루트 레이아웃. 국내 사용자용 한국어 앱이라 로케일 분기가 없다(`<html lang="ko">`).
 * 다크모드 기본(`class="dark"`)은 형제앱과 통일. 폰트는 한글 본문에 맞는 Noto Sans KR.
 */
const notoSansKr = Noto_Sans_KR({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

const SITE = 'https://kr-camping-now.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: '캠핑나우 — 내 주변 캠핑장 지도',
  description:
    '전국 3,100여 개 캠핑장을 지도에서. 글램핑·카라반·오토캠핑, 해변·계곡·숲, 반려동물 동반, 연중 운영까지 조건으로 걸러 내 주변부터 찾아보세요. 한국관광공사 고캠핑 공식 데이터.',
  keywords: ['캠핑장', '글램핑', '카라반', '오토캠핑', '반려동물 캠핑', '캠핑장 지도', '고캠핑'],
  applicationName: '캠핑나우',
  appleWebApp: { title: '캠핑나우' },
  alternates: { canonical: SITE },
  openGraph: {
    title: '캠핑나우 — 내 주변 캠핑장 지도',
    description: '전국 캠핑장을 지도에서 조건별로. 내 주변 · 글램핑 · 반려동물 동반 · 연중 운영.',
    url: SITE,
    siteName: '캠핑나우',
    locale: 'ko_KR',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#0b0f19',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`dark ${notoSansKr.variable} antialiased`} suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground">{children}</body>
    </html>
  );
}
