import { NextResponse } from 'next/server';

import { getCatalogCached } from '@/lib/gocamping-cache';
import { swrCacheControl } from '@/lib/cache-control';
import type { CampIndexItem } from '@/lib/types';

/**
 * 커맨드 팔레트(⌘K) 이름 검색용 **경량 인덱스**. 전량(≈3,099곳)의 {id,name,region,lat,lon} 만.
 *
 * 왜 별도 엔드포인트인가(판단 근거):
 *  - 팔레트에서 "이름으로 전국 검색"이 핵심 기능인데, 지도용 응답은 가까운 200곳만 내려간다.
 *    전국 이름검색을 하려면 전체 이름이 클라이언트에 있어야 한다.
 *  - 그렇다고 전체 Camp 객체(부대시설·소개 등)를 다 내리면 이 앱이 피하려던 대용량 payload 가 된다.
 *    그래서 검색에 필요한 필드만(이름·지역·좌표) 추려 ~50KB(gzip) 수준으로 내린다.
 *  - **업스트림 호출을 늘리지 않는다**: getCatalogCached(이미 캐시된 카탈로그)에서 읽을 뿐이다.
 *  - 위치 무관·전 사용자 동일이라 CDN 이 KST 자정까지 캐시한다. 팔레트 최초 오픈 시 1회만 받는다.
 */
export async function GET() {
  try {
    const catalog = await getCatalogCached();
    const items: CampIndexItem[] = catalog.camps.map((c) => ({
      id: c.id,
      name: c.name,
      region: c.region,
      lat: c.lat,
      lon: c.lon,
    }));
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
