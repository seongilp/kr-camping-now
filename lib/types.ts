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

/** 커맨드 팔레트 이름검색용 경량 인덱스 항목(전량, 검색·지도이동에 필요한 최소 필드). */
export interface CampIndexItem {
  id: string;
  name: string;
  region: string | null;
  lat: number;
  lon: number;
}

/** /api/camps 응답. */
export interface CampsResponse {
  camps: CampWithDistance[];
  counts: {
    induty: FacetCount[];
    lct: FacetCount[];
    animal: number; // 반려동물 동반 가능(가능+소형견)
    yearRound: number; // 연중 운영
  };
  meta: {
    returned: number; // 클라이언트로 내린 건수
    matched: number; // 필터 통과 건수(전량 기준)
    total: number; // 좌표 있는 전체 건수
    noCoords: number; // 좌표가 없어 지도에 못 찍는 건수(정직하게 노출)
    usedFallback: boolean; // 위치 폴백(서울) 여부
    truncated: boolean; // matched > returned (가까운 N건만 내려줌)
  };
}
