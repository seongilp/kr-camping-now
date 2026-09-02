import Link from 'next/link';
import { CalendarClock, Dog, MapPin, Navigation, Tent, Waves } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';

/**
 * 랜딩 페이지(서버 컴포넌트). 니치를 한 문장으로 세우고 지도로 보낸다.
 * SEO 를 위해 실제 설명 텍스트를 서버에서 렌더한다 — 지도 앱 본체는 클라이언트라 크롤러가
 * 못 읽으므로, 이 페이지가 색인의 근거가 된다.
 */
export default function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <div className="flex flex-1 flex-col justify-center">
        <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <Tent className="size-3.5 text-primary" />
          한국관광공사 고캠핑 공식 데이터 · 전국 3,100여 곳
        </div>

        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          내 주변 캠핑장,
          <br />
          조건으로 골라 지도에서.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          글램핑·카라반·오토캠핑, 해변·계곡·숲, 반려동물 동반, 연중 운영까지. 원하는 조건을 겹쳐
          걸러 내 주변부터 찾아보세요.
        </p>

        <div className="mt-8">
          <Link
            href="/map"
            className={buttonVariants({
              size: 'lg',
              className: 'h-12 w-full gap-2 text-base sm:w-auto sm:px-8',
            })}
          >
            <Navigation className="size-4" />
            지도 열기
          </Link>
        </div>

        <ul className="mt-12 grid gap-4 text-sm sm:grid-cols-2">
          <Feature icon={<MapPin className="size-5 text-primary" />}>
            현재 위치 기준으로 가까운 캠핑장부터. 위치를 못 잡으면 서울 기준으로 보여줍니다.
          </Feature>
          <Feature icon={<Tent className="size-5 text-primary" />}>
            업종 필터: 글램핑 · 카라반 · 오토캠핑 · 일반야영.
          </Feature>
          <Feature icon={<Waves className="size-5 text-primary" />}>
            입지 필터: 해변 · 계곡 · 숲 · 산 · 강 · 섬 · 도심.
          </Feature>
          <Feature icon={<Dog className="size-5 text-emerald-400" />}>
            반려동물 동반 가능한 곳만 모아 보기.
          </Feature>
          <Feature icon={<CalendarClock className="size-5 text-amber-400" />}>
            연중(사계절) 운영하는 캠핑장만 골라 보기.
          </Feature>
        </ul>

        {/* 한계를 첫 화면부터 정직하게 — 실시간 빈자리 앱이 아니다. */}
        <p className="mt-8 rounded-lg border border-border bg-card/50 p-3 text-xs leading-relaxed text-muted-foreground">
          실시간 빈자리 정보는 제공하지 않습니다(고캠핑 데이터에 없음). 사이트 개수는 총량이며
          잔여 수가 아닙니다. 예약은 각 캠핑장 예약 링크로 이동해 확인하세요.
        </p>
      </div>

      <footer className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
        데이터 출처: 한국관광공사 고캠핑(GoCamping) 정보조회 서비스 · 좌표 WGS84
      </footer>
    </main>
  );
}

function Feature({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="text-muted-foreground">{children}</span>
    </li>
  );
}
