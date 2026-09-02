import { NextResponse } from 'next/server';

import { getImagesCached } from '@/lib/gocamping-cache';

/**
 * 한 캠핑장의 사진 갤러리(imageList). 사용자가 상세를 열 때만 lazy 로 쳐서 쿼터를 분산한다.
 *
 * 상태 구분이 이 앱의 정직함이다(F-6):
 *  - 빈 배열 → 그 캠핑장에 등록된 추가 사진이 **없음**(정상). 지어내지 않는다.
 *  - 조회 실패(쿼터·타임아웃) → **불러오지 못함**(unavailable). 캐시하지 않는다(F-4).
 */
const CACHE_OK = 'public, s-maxage=43200, stale-while-revalidate=86400';
const CACHE_FAIL = 'no-store';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  try {
    const images = await getImagesCached(id);
    return NextResponse.json(
      { images, unavailable: false },
      { headers: { 'Cache-Control': CACHE_OK } },
    );
  } catch {
    return NextResponse.json(
      { images: [], unavailable: true },
      { headers: { 'Cache-Control': CACHE_FAIL } },
    );
  }
}
