/**
 * 커맨드 팔레트 + 전국 배경 지도용 경량 인덱스 변환. **순수 함수**(테스트가 붙는다).
 *
 * Camp(정규화된 전체 필드) → CampIndexItem(전송용 최소 필드)로 깎아낸다. 여기서 색을 미리
 * 계산해 넣는 이유는 lib/facets.ts 참고 — 클라이언트가 업종 배열을 안 받아도 되게(페이로드 절약)
 * 하면서, 색 규칙(indutyColorFor)은 여전히 facets.ts 한 곳에 둔다(이 파일은 그 결과만 옮겨 담는다).
 */

import type { Camp } from './camps';
import { indutyColorFor } from './facets';
import type { CampIndexItem } from './types';

export function toIndexItem(c: Camp): CampIndexItem {
  return {
    id: c.id,
    name: c.name,
    region: c.region,
    lat: c.lat,
    lon: c.lon,
    color: indutyColorFor(c.induty),
  };
}
