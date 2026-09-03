import type { Camp } from './camps';

/** API 가 내려주는 캠핑장(정규화 Camp + 서버가 계산한 거리). */
export interface CampWithDistance extends Camp {
  distanceKm: number;
}

/** 각 패싯 축의 카운트(현재 다른 필터를 무시한 전량 기준 — 칩 라벨 옆 숫자). */
export interface FacetCount {
  key: string;
  count: number;
}

/** 지도에 보이는 영역(WGS84). 서버 bounds 조회 파라미터로 그대로 넘어간다. */
export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * 커맨드 팔레트 이름검색 + 전국 배경 지도용 경량 인덱스 항목(전량, 검색·지도이동에 필요한 최소 필드).
 * color 는 대표 업종 색(#hex, 7자) — 지도가 업종별로 다시 계산하지 않고 그대로 칠하기만 하도록
 * 서버에서 미리 넣어 준다(facets.ts indutyColorFor 와 규칙 동일). 페이로드 증가는 항목당 7바이트뿐.
 */
export interface CampIndexItem {
  id: string;
  name: string;
  region: string | null;
  lat: number;
  lon: number;
  color: string;
}

/**
 * 조회 모드. 리스트 정렬 기준·헤더 문구·거리 표시 여부를 가른다.
 *  - location: 사용자 실제 위치 기준 가까운 순(거리 표시)
 *  - bounds:   지도에 보이는 영역 안(거리 미표시 — 임의 중심 기준이라 오해 소지)
 *  - fallback: 위치 없음 → 서울 기준(거리 미표시)
 */
export type QueryMode = 'location' | 'bounds' | 'fallback';

/** /api/camps 응답. */
export interface CampsResponse {
  camps: CampWithDistance[];
  counts: {
    induty: FacetCount[];
    lct: FacetCount[];
    sido: FacetCount[];
    animal: number; // 반려동물 동반 가능(가능+소형견)
    yearRound: number; // 연중 운영
  };
  meta: {
    mode: QueryMode;
    returned: number; // 클라이언트로 내린 건수
    matched: number; // 필터(+영역) 통과 건수
    total: number; // 좌표 있는 전체 건수
    noCoords: number; // 좌표가 없어 지도에 못 찍는 건수(정직하게 노출)
    usedFallback: boolean; // 위치 폴백(서울) 여부
    truncated: boolean; // matched > returned (가까운 N건만 내려줌)
  };
}
