/**
 * 원본 데이터 quirk: 고캠핑 basedList 에는 실제 야영장이 아닌 업체(캠핑카 대여·아카데미 등)가
 * 야영장으로 잘못 등록돼 있다. 설명 필드(firstImageUrl/lineIntro/intro/sbrsCl/homepage/사이트수)가
 * 전부 비어 있고 이름이 법인명인 게 공통점이지만, 그 휴리스틱만으로는 깨끗이 분리되지 않는다
 * (예: 진짜 캠핑장인 "주식회사 목계장터"도 법인명 + 필드 결측이라 걸려 버린다). 그래서 휴리스틱
 * 대신 contentId 를 명시한 제외 목록으로 처리한다.
 */

/** 명시 제외 대상 contentId 목록. */
export const EXCLUDED_CAMP_IDS: ReadonlySet<string> = new Set([
  '101213', // 스마트락(주), 서울 구로 — 캠핑카 대여업체 추정
  '101154', // 빈투어 주식회사, 서울 중구 — 캠핑카 대여업체 추정
  '100614', // (주)더술컴퍼니아카데미, 서울 종로 — 아카데미
]);

/** 주어진 contentId 가 명시 제외 목록에 있는지 확인. */
export function isExcludedCamp(contentId: string): boolean {
  return EXCLUDED_CAMP_IDS.has(contentId);
}
