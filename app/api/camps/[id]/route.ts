import { NextResponse } from 'next/server';

import { getCatalogCached } from '@/lib/gocamping-cache';

/**
 * 단건 캠핑장 전체 정보. 팔레트에서 **가까운 200곳 밖의 캠핑장**을 이름으로 골랐을 때, 상세를
 * 그리려면 그 캠핑장의 전체 필드가 필요하다(리스트엔 없다). 그때만 이걸 부른다.
 *
 * **업스트림 호출 없음**: getCatalogCached(이미 캐시된 카탈로그)에서 id 로 찾아 돌려줄 뿐이다.
 * 카탈로그는 하루 단위라 상세도 반나절 CDN 캐시.
 */
const CACHE_OK = 'public, s-maxage=43200, stale-while-revalidate=86400';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  try {
    const catalog = await getCatalogCached();
    const camp = catalog.camps.find((c) => c.id === id);
    if (!camp) {
      return NextResponse.json(
        { error: 'not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json({ camp }, { headers: { 'Cache-Control': CACHE_OK } });
  } catch (e) {
    const code = e instanceof Error && 'code' in e ? (e as { code: string }).code : 'ERROR';
    return NextResponse.json(
      { error: 'upstream', code },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
