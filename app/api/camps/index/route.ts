import { NextResponse } from 'next/server';

import { getCatalogCached } from '@/lib/gocamping-cache';
import { swrCacheControl } from '@/lib/cache-control';
import { toIndexItem } from '@/lib/camp-index';
import type { CampIndexItem } from '@/lib/types';

/**
 * 전국 인덱스. 전량(≈3,099곳)의 {id,name,region,lat,lon,color} 만. 두 소비처가 공유한다:
 *  1) 커맨드 팔레트(⌘K) 이름 검색 — 가까운 200곳 밖의 캠핑장을 찾는 유일한 길.
 *  2) 지도의 전국 배경층 — 지도 bounds 조회가 가까운 ≤200건만 내려주므로(lib/geo.ts nearest),
 *     그 밖의 나머지도 "어딘가에 있다"는 감을 주려면 전국 좌표가 클라이언트에 있어야 한다.
 *
 * 왜 별도 엔드포인트인가(판단 근거):
 *  - 그렇다고 전체 Camp 객체(부대시설·소개 등)를 다 내리면 이 앱이 피하려던 대용량 payload 가 된다.
 *    그래서 두 소비처에 필요한 필드만(이름·지역·좌표·대표 업종 색) 추려 ~60KB(gzip) 수준으로 내린다.
 *    color 는 hex 7자뿐이라 페이로드 증가가 미미하다(toIndexItem, lib/camp-index.ts).
 *  - **업스트림 호출을 늘리지 않는다**: getCatalogCached(이미 캐시된 카탈로그)에서 읽을 뿐이다.
 *  - 위치 무관·전 사용자 동일이라 CDN 이 KST 자정까지 캐시한다. 화면 마운트 후 유휴 시간에 1회만 받는다
 *    (components/camps-browser.tsx — 과거엔 팔레트 최초 오픈 시였지만, 지도 배경층도 이 인덱스를
 *    쓰게 되면서 팔레트를 열지 않아도 필요해졌다).
 */
export async function GET() {
  try {
    const catalog = await getCatalogCached();
    const items: CampIndexItem[] = catalog.camps.map(toIndexItem);
    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': swrCacheControl(3600) } },
    );
  } catch (e) {
    const code = e instanceof Error && 'code' in e ? (e as { code: string }).code : 'ERROR';
    return NextResponse.json(
      { error: 'upstream', code },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
