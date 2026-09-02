/**
 * 다중 패싯 필터 — 이 앱의 가치. **순수 함수**(테스트가 붙는다).
 *
 * ★ 실측 채움률이 높은 필드만 필터로 만든다(팀 지시). 필터를 걸었는데 대부분이 사라지면
 *   "없다"는 거짓말이 된다. 그래서 필터는 네 축으로 제한한다(2026-09-02 실측 채움률):
 *     업종 induty      99.8%
 *     입지 lctCl       84.0%
 *     반려동물 animal   83.6%
 *     운영계절 operPdCl 78.9%
 *   resveUrl(46%)·glampInnerFclty(16%)·exprnProgrm(11%) 등 낮은 필드는 필터에서 뺀다
 *   (상세 화면에는 값이 있으면 보여 준다).
 *
 * 결합 규칙: 축들 사이는 AND(업종 AND 입지 AND 반려동물 AND 연중). 각 축 안에서 업종·입지는
 * 단일 선택(칩), 반려동물·연중은 on/off 토글이다. 조합이 이 앱의 discovery UX 다.
 */

import type { Camp } from './camps';

/** 업종 필터 옵션. label=화면표기, tokens=induty 원문에서 이 중 하나라도 있으면 매치. */
export interface FacetOption {
  key: string;
  label: string;
  tokens: string[];
}

/** 업종(induty). 원문은 "일반야영장/자동차야영장/글램핑/카라반" 및 콤마 조합(실측). */
export const INDUTY_OPTIONS: FacetOption[] = [
  { key: 'glamping', label: '글램핑', tokens: ['글램핑'] },
  { key: 'caravan', label: '카라반', tokens: ['카라반'] },
  { key: 'auto', label: '오토캠핑', tokens: ['자동차야영장'] },
  { key: 'general', label: '일반야영', tokens: ['일반야영장'] },
];

/** 입지(lctCl). 원문은 "산/숲/해변/계곡/강/섬/도심" 및 콤마 조합(실측). */
export const LCT_OPTIONS: FacetOption[] = [
  { key: 'beach', label: '해변', tokens: ['해변'] },
  { key: 'valley', label: '계곡', tokens: ['계곡'] },
  { key: 'forest', label: '숲', tokens: ['숲'] },
  { key: 'mountain', label: '산', tokens: ['산'] },
  { key: 'river', label: '강', tokens: ['강'] },
  { key: 'island', label: '섬', tokens: ['섬'] },
  { key: 'city', label: '도심', tokens: ['도심'] },
];

/**
 * 시도(도/광역시) 옵션. key 는 camps.ts normalizeSido 의 반환값과 1:1. center 는 지도 이동용
 * 대략 중심좌표(WGS84). 순서는 실측 건수 내림차순(경기·강원·경남… 큰 지역이 앞).
 * count 는 서버가 전량 기준으로 채워 칩 옆에 붙인다(INDUTY/LCT 와 동일 방식).
 */
export interface SidoOption {
  key: string;
  label: string;
  center: { lat: number; lon: number };
}

export const SIDO_OPTIONS: SidoOption[] = [
  { key: 'gyeonggi', label: '경기', center: { lat: 37.41, lon: 127.52 } },
  { key: 'gangwon', label: '강원', center: { lat: 37.82, lon: 128.16 } },
  { key: 'gyeongnam', label: '경남', center: { lat: 35.35, lon: 128.25 } },
  { key: 'gyeongbuk', label: '경북', center: { lat: 36.3, lon: 128.9 } },
  { key: 'jeonnam', label: '전남·광주', center: { lat: 34.9, lon: 126.95 } },
  { key: 'chungnam', label: '충남', center: { lat: 36.52, lon: 126.8 } },
  { key: 'chungbuk', label: '충북', center: { lat: 36.8, lon: 127.7 } },
  { key: 'jeonbuk', label: '전북', center: { lat: 35.72, lon: 127.15 } },
  { key: 'incheon', label: '인천', center: { lat: 37.45, lon: 126.6 } },
  { key: 'jeju', label: '제주', center: { lat: 33.43, lon: 126.56 } },
  { key: 'daegu', label: '대구', center: { lat: 35.87, lon: 128.6 } },
  { key: 'ulsan', label: '울산', center: { lat: 35.54, lon: 129.31 } },
  { key: 'daejeon', label: '대전', center: { lat: 36.35, lon: 127.38 } },
  { key: 'seoul', label: '서울', center: { lat: 37.5665, lon: 126.978 } },
  { key: 'busan', label: '부산', center: { lat: 35.18, lon: 129.07 } },
  { key: 'sejong', label: '세종', center: { lat: 36.48, lon: 127.29 } },
  { key: 'gwangju', label: '광주', center: { lat: 35.16, lon: 126.85 } },
];

/** 필터 상태. null/false = 그 축 미적용. */
export interface Filters {
  induty: string | null; // INDUTY_OPTIONS.key
  lct: string | null; // LCT_OPTIONS.key
  sido: string | null; // SIDO_OPTIONS.key (정규화된 시도)
  animalOnly: boolean; // 반려동물 동반 가능만
  yearRoundOnly: boolean; // 연중(사계절) 운영만
}

export const EMPTY_FILTERS: Filters = {
  induty: null,
  lct: null,
  sido: null,
  animalOnly: false,
  yearRoundOnly: false,
};

function optionTokens(options: FacetOption[], key: string | null): string[] | null {
  if (!key) return null;
  return options.find((o) => o.key === key)?.tokens ?? null;
}

/** camp 의 목록형 필드(values)가 tokens 중 하나라도 포함하는가. */
function listMatches(values: string[], tokens: string[]): boolean {
  return values.some((v) => tokens.some((t) => v.includes(t)));
}

/** camp 가 필터 전부(AND)를 통과하는가. */
export function matchesFilters(camp: Camp, f: Filters): boolean {
  const indutyTokens = optionTokens(INDUTY_OPTIONS, f.induty);
  if (indutyTokens && !listMatches(camp.induty, indutyTokens)) return false;

  const lctTokens = optionTokens(LCT_OPTIONS, f.lct);
  if (lctTokens && !listMatches(camp.lct, lctTokens)) return false;

  // 시도: 정규화 key 완전일치.
  if (f.sido && camp.sido !== f.sido) return false;

  // 반려동물: 정보 없음(unknown)은 "동반 가능만" 필터에서 제외한다("안 됨"으로 단정하진 않되,
  // "동반 가능"으로 세지도 않는다 — 정직성).
  if (f.animalOnly && !(camp.animal === 'yes' || camp.animal === 'small')) return false;

  if (f.yearRoundOnly && !camp.yearRound) return false;

  return true;
}

/** 필터가 하나라도 적용됐는가(빈 상태 안내용). */
export function hasAnyFilter(f: Filters): boolean {
  return (
    f.induty !== null ||
    f.lct !== null ||
    f.sido !== null ||
    f.animalOnly ||
    f.yearRoundOnly
  );
}
