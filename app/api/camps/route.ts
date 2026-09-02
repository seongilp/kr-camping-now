import { NextResponse } from 'next/server';

import { getCatalogCached } from '@/lib/gocamping-cache';
import { nearest, SEOUL, type LatLon } from '@/lib/geo';
import { swrCacheControl } from '@/lib/cache-control';
import {
  INDUTY_OPTIONS,
  LCT_OPTIONS,
  SIDO_OPTIONS,
  matchesFilters,
  type FacetOption,
  type Filters,
} from '@/lib/facets';
import type { Camp } from '@/lib/camps';
import type { CampsResponse, FacetCount, QueryMode } from '@/lib/types';

/**
 * ★ 이 앱의 심장: 서버 공간 필터 + 패싯 필터.
 *
 * 카탈로그(≈3,099곳, 좌표 있는 것)를 통째로 클라이언트에 내리지 않는다. 서버가 전량을 캐시
 * (하루 1회 업스트림)하고, 필터·영역을 적용한 뒤 가까운 N건만 골라 내린다. 위치·영역이 바뀌어도
 * 업스트림은 0 — 캐시된 전량에서 다시 고를 뿐이다.
 *
 * 세 가지 조회 모드(mode):
 *  - **bounds**: 지도에 보이는 영역(minLat/maxLat/minLon/maxLon)만. 지도를 옮기면 그 화면의
 *    캠핑장이 나온다. 정렬은 영역 중심 기준. → 수도권에서 봐도 강원·제주가 밀려 안 오던 문제 해소.
 *  - **location**: 좌표(lat/lon)가 있으면 그 위치 기준 가까운 순(거리 표시).
 *  - **fallback**: 아무것도 없으면 서울 기준.
 *
 * 캐시 판단(kr-taxfree-now 와 동일 근거):
 *  - **fallback 만 CDN 캐시**(SWR). 좌표·영역이 없어 전 사용자 동일하기 때문.
 *  - **location·bounds 는 no-store**. 좌표/영역이 사용자마다·연속적으로 달라 CDN 이 안 먹는다.
 *    격자 반올림으로 CDN 을 태울 수도 있으나 파편화가 크고 이득이 작다 — 무거운 카탈로그 수집은
 *    이미 인스턴스 간 공유 Data Cache 라 콜드도 빠르고, 영역 필터는 서버 메모리에서 ~1ms 다.
 */

const LIMIT = 200; // 클라이언트로 내리는 최대 건수. 지도·리스트가 감당할 상한.

function parseCoord(v: string | null, lo: number, hi: number): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) return null;
  return n;
}

interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** 네 값이 모두 유효하고 min<max 여야 bounds 로 인정. 아니면 null. */
function parseBounds(sp: URLSearchParams): Bounds | null {
  const minLat = parseCoord(sp.get('minLat'), 30, 40);
  const maxLat = parseCoord(sp.get('maxLat'), 30, 40);
  const minLon = parseCoord(sp.get('minLon'), 122, 134);
  const maxLon = parseCoord(sp.get('maxLon'), 122, 134);
  if (minLat == null || maxLat == null || minLon == null || maxLon == null) return null;
  if (minLat >= maxLat || minLon >= maxLon) return null;
  return { minLat, maxLat, minLon, maxLon };
}

/** 옵션별 카운트(전량 기준, 현재 필터 무시 — 칩 라벨이 흔들리지 않게). */
function countByTokens(
  camps: Camp[],
  options: FacetOption[],
  pick: (c: Camp) => string[],
): FacetCount[] {
  return options.map((o) => ({
    key: o.key,
    count: camps.filter((c) => pick(c).some((v) => o.tokens.some((t) => v.includes(t)))).length,
  }));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const bounds = parseBounds(searchParams);
  const lat = parseCoord(searchParams.get('lat'), 33, 39);
  const lon = parseCoord(searchParams.get('lon'), 124, 132);
  const hasLoc = lat != null && lon != null;

  const mode: QueryMode = bounds ? 'bounds' : hasLoc ? 'location' : 'fallback';
  // 정렬 기준점: bounds 면 영역 중심, location 이면 실좌표, 아니면 서울.
  const origin: LatLon = bounds
    ? { lat: (bounds.minLat + bounds.maxLat) / 2, lon: (bounds.minLon + bounds.maxLon) / 2 }
    : hasLoc
      ? { lat: lat as number, lon: lon as number }
      : SEOUL;

  const filters: Filters = {
    induty: searchParams.get('induty')?.trim() || null,
    lct: searchParams.get('lct')?.trim() || null,
    sido: searchParams.get('sido')?.trim() || null,
    animalOnly: searchParams.get('animal') === '1',
    yearRoundOnly: searchParams.get('yearRound') === '1',
  };

  try {
    const catalog = await getCatalogCached();

    // 1) 패싯 필터 통과. 2) bounds 모드면 영역 안으로 한 번 더 거른다.
    let pool = catalog.camps.filter((c) => matchesFilters(c, filters));
    if (bounds) {
      pool = pool.filter(
        (c) =>
          c.lat >= bounds.minLat &&
          c.lat <= bounds.maxLat &&
          c.lon >= bounds.minLon &&
          c.lon <= bounds.maxLon,
      );
    }

    const ranked = nearest(pool, origin, LIMIT);
    const camps = ranked.map((r) => ({
      ...r.item,
      distanceKm: Math.round(r.distanceKm * 10) / 10,
    }));

    const all = catalog.camps;
    const body: CampsResponse = {
      camps,
      counts: {
        induty: countByTokens(all, INDUTY_OPTIONS, (c) => c.induty),
        lct: countByTokens(all, LCT_OPTIONS, (c) => c.lct),
        // 시도는 정규화 key 완전일치라 토큰 방식과 다르게 센다.
        sido: SIDO_OPTIONS.map((o) => ({
          key: o.key,
          count: all.filter((c) => c.sido === o.key).length,
        })),
        animal: all.filter((c) => c.animal === 'yes' || c.animal === 'small').length,
        yearRound: all.filter((c) => c.yearRound).length,
      },
      meta: {
        mode,
        returned: camps.length,
        matched: pool.length,
        total: all.length,
        noCoords: catalog.noCoords,
        usedFallback: mode === 'fallback',
        truncated: pool.length > camps.length,
      },
    };

    return NextResponse.json(body, {
      headers: {
        // fallback(전 사용자 동일)만 CDN 캐시. location·bounds 는 사용자마다 달라 no-store.
        'Cache-Control': mode === 'fallback' ? swrCacheControl(3600) : 'no-store',
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
