import { NextResponse } from 'next/server';

/**
 * 카탈로그 예열(cron). **첫 사용자가 콜드 수집을 안 밟도록** 미리 데운다.
 *
 * 좌표 없는 엔드포인트(`/api/camps`)를 자기 공개 URL 로 때린다:
 *  - 카탈로그를 **인스턴스 간 공유 Data Cache** 에 채운다(gocamping-api 의 fetch revalidate).
 *  - 그 응답은 좌표 없이 전 사용자 동일이라 **CDN 에도** 채워진다(라우트가 SWR 헤더를 붙인다).
 * 서버에서 getCatalogCached 만 부르면 CDN 은 안 채워지므로 반드시 공개 도메인으로 요청한다.
 *
 * ★ Vercel Hobby 크론은 **하루 1회**. vercel.json 에서 KST 자정 직후(UTC 15:00)로 잡아,
 *   SWR 창이 KST 자정에 잘려 만료된 뒤 그날 첫 요청을 이 예열이 커버하게 한다.
 *
 * 쿼터: 하루 1회 예열 = basedList 1콜/일(1,000/일 한도의 0.1%). 여유가 압도적으로 크다.
 *
 * fail closed: **CRON_SECRET 없으면 503, 안 맞으면 401.** 아무나 예열을 못 돌리게.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function baseUrl(): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? 'kr-camping-now.vercel.app';
  return `https://${host}`;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET 이 설정되지 않았습니다 (fail closed).' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: '인증 실패' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const started = Date.now();
  try {
    // 좌표 없는 폴백 요청 → 카탈로그 Data Cache + CDN 을 함께 데운다.
    const res = await fetch(`${baseUrl()}/api/camps`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(45_000),
      headers: { Accept: 'application/json' },
    });
    const ms = Date.now() - started;
    const cache = res.headers.get('x-vercel-cache');
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, status: res.status, cache, ms },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    // '일을 했는지' 증명: 채운 건수를 응답에서 읽어 담는다(ok:true 인데 빈 예열 방지).
    const body = (await res.json()) as {
      camps?: unknown[];
      meta?: { total?: number; noCoords?: number };
    };
    return NextResponse.json(
      {
        ok: true,
        warmedAt: new Date().toISOString(),
        ms,
        cache,
        returned: Array.isArray(body.camps) ? body.camps.length : 0,
        total: body.meta?.total ?? 0,
        noCoords: body.meta?.noCoords ?? 0,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, error: message, ms: Date.now() - started },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
