import { NextResponse } from 'next/server';

import { getCatalogCached } from '@/lib/gocamping-cache';
import { nearest, SEOUL, type LatLon } from '@/lib/geo';
import { swrCacheControl } from '@/lib/cache-control';
import {
  INDUTY_OPTIONS,
  LCT_OPTIONS,
  matchesFilters,
  type FacetOption,
  type Filters,
} from '@/lib/facets';
import type { Camp } from '@/lib/camps';
import type { CampsResponse, FacetCount } from '@/lib/types';

/**
 * ★ 이 앱의 심장: 서버 공간 필터 + 패싯 필터.
 *
 * 카탈로그(3,109건)를 통째로 클라이언트에 내리지 않는다. 서버가 전량을 캐시(하루 1회 업스트림)
 * 하고, 필터를 적용한 뒤 요청 좌표 기준으로 가까운 N건만 골라 내린다. 위치가 바뀌어도 업스트림은
 * 0 — 캐시된 전량에서 다시 고를 뿐이다.
 *
 * 쿼리: lat/lon(없으면 서울 폴백), induty, lct, animal(1), yearRound(1).
 * 응답: camps(가까운 순 ≤LIMIT, 거리 포함), counts(칩 옆 숫자, 전량 기준), meta.
 *
 * 캐시(두 갈래):
 *  - **좌표 없는 요청(서울 폴백)**: 응답이 필터에만 의존해 전 사용자 동일 → CDN 캐시 가능.
 *    s-maxage + SWR 로 콜드도 즉시 응답.
 *  - **좌표 있는 요청(실제 위치)**: 좌표마다 응답이 달라 no-store. 대신 카탈로그가 인스턴스 간
 *    공유 Data Cache 라 콜드도 빠르다.
 */

const LIMIT = 200; // 클라이언트로 내리는 최대 건수. 지도·리스트가 감당할 상한.

function parseCoord(v: string | null, lo: number, hi: number): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) return null;
  return n;
}

/** 옵션별 카운트(전량 기준, 현재 필터 무시 — 칩 라벨이 흔들리지 않게). */
function countByOption(camps: Camp[], options: FacetOption[], pick: (c: Camp) => string[]): FacetCount[] {
  return options.map((o) => ({
    key: o.key,
    count: camps.filter((c) => pick(c).some((v) => o.tokens.some((t) => v.includes(t)))).length,
  }));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // 좌표 검증(경도 124~132, 위도 33~39 = 한국 근방). 없거나 이상하면 서울 폴백.
  const lat = parseCoord(searchParams.get('lat'), 33, 39);
  const lon = parseCoord(searchParams.get('lon'), 124, 132);
  const origin: LatLon = lat != null && lon != null ? { lat, lon } : SEOUL;
  const usedFallback = lat == null || lon == null;

  const filters: Filters = {
    induty: searchParams.get('induty')?.trim() || null,
    lct: searchParams.get('lct')?.trim() || null,
    animalOnly: searchParams.get('animal') === '1',
    yearRoundOnly: searchParams.get('yearRound') === '1',
  };

  try {
    const catalog = await getCatalogCached();

    const pool = catalog.camps.filter((c) => matchesFilters(c, filters));
    const ranked = nearest(pool, origin, LIMIT);
    const camps = ranked.map((r) => ({
      ...r.item,
      distanceKm: Math.round(r.distanceKm * 10) / 10,
    }));

    const all = catalog.camps;
    const body: CampsResponse = {
      camps,
      counts: {
        induty: countByOption(all, INDUTY_OPTIONS, (c) => c.induty),
        lct: countByOption(all, LCT_OPTIONS, (c) => c.lct),
        animal: all.filter((c) => c.animal === 'yes' || c.animal === 'small').length,
        yearRound: all.filter((c) => c.yearRound).length,
      },
      meta: {
        returned: camps.length,
        matched: pool.length,
        total: all.length,
        noCoords: catalog.noCoords,
        usedFallback,
        truncated: pool.length > camps.length,
      },
    };

    return NextResponse.json(body, {
      headers: {
        // 좌표 없는 폴백만 CDN 캐시(전 사용자 동일). 실좌표는 사용자마다 달라 no-store.
        'Cache-Control': usedFallback ? swrCacheControl(3600) : 'no-store',
      },
    });
  } catch (e) {
    // "결측"이 아니라 "지금 불러오지 못함"으로 구분(F-6). 캐시 금지.
    const code = e instanceof Error && 'code' in e ? (e as { code: string }).code : 'ERROR';
    return NextResponse.json(
      { error: 'upstream', code },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
