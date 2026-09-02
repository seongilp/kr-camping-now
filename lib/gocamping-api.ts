/**
 * 한국관광공사 고캠핑 API 클라이언트. **서버 전용.**
 *
 * ── 키 인코딩 함정(형제앱들이 반복해 데인 것) ──
 * DATA_GO_KR_KEY(=HORSE) 는 이미 %-인코딩된 Encoding 키다. 쿼리스트링을 **문자열로 직접 조립**하고
 * serviceKey 는 verbatim 으로 이어붙인다. URLSearchParams/params 객체에 넣으면 재인코딩되어
 * (`%2B`→`%252B`) 403 SERVICE_KEY_IS_NOT_REGISTERED(code 30) 가 난다 — "미신청"과 문자열이
 * 똑같아 오진한다. 실측에서 searchList 를 재인코딩했더니 그대로 code 30 이 재현됐다.
 * 키 값은 절대 로그로 출력하지 않는다.
 *
 * ── basedList 사양(직접 호출로 확인, 2026-09-02) ──
 *  - 전국 totalCount=3,109. numOfRows 를 크게(5000) 주면 **1콜에 전량**이 온다(12페이지 페이징 불필요).
 *  - 정상 응답 response.body.items.item[], 좌표 mapX(경도)/mapY(위도) WGS84, 채움률 99.7%.
 *  - 일일 한도 개발계정 1,000회/오퍼레이션. 예열 1콜/일 + 상세 이미지 lazy 라 여유가 크다.
 *
 * ── 실패 처리 ──
 * 200 이 성공이 아니다(F-8). 본문의 returnReasonCode/resultCode 로 판정한다. 실패는 예외로
 * 던지고 **캐시하지 않는다**(F-4). 모든 fetch 에 AbortSignal.timeout(6s).
 */

import { itemsOf, parseApiError, totalOf, type CampRaw } from './camps';
import { secondsUntilKstMidnight } from './kst';

const HOST = 'https://apis.data.go.kr/B551011/GoCamping';
const TIMEOUT_MS = 6000;
/** 전량을 한 번에. totalCount 3,109 이므로 넉넉히. */
const PAGE_SIZE = 5000;
const COMMON = 'MobileOS=ETC&MobileApp=kr-camping-now&_type=json';

export class GoCampingFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GoCampingFailure';
  }
}

function serviceKey(): string {
  const key = process.env.DATA_GO_KR_KEY?.trim() || process.env.HORSE?.trim();
  if (!key) throw new GoCampingFailure('NO_KEY', 'DATA_GO_KR_KEY 가 설정되지 않았습니다.');
  // 이미 %-인코딩된 Encoding 키면 그대로, Decoding 키(% 없음)만 한 번 인코딩한다.
  return key.includes('%') ? key : encodeURIComponent(key);
}

/**
 * @param revalidate Next Data Cache TTL(초). **인스턴스 간 공유되는 캐시**라 콜드 인스턴스가
 *   업스트림을 다시 때리지 않는다. 0 이면 캐시하지 않는다(no-store).
 */
async function fetchJson(url: string, revalidate: number): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: revalidate > 0 ? { revalidate } : undefined,
    ...(revalidate > 0 ? {} : { cache: 'no-store' as const }),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // 인증 오류는 _type=json 을 줘도 XML 로 떨어진다. 코드만 뽑아 실패로.
    const code = /<returnReasonCode>([^<]*)</.exec(text)?.[1] ?? 'NON_JSON';
    throw new GoCampingFailure(code, `응답 해석 실패: ${text.slice(0, 120)}`);
  }
  const err = parseApiError(json);
  if (err) throw new GoCampingFailure(err.code, err.msg);
  return json;
}

/**
 * 전국 캠핑장 전량(basedList). 1콜로 받고, totalCount 와 실제 수신 수가 크게 어긋나면
 * (페이지 상한에 걸린 경우) 남은 페이지를 마저 받는다 — 방어적 페이징.
 */
export async function fetchCamps(): Promise<CampRaw[]> {
  const key = serviceKey();
  const base = `${HOST}/basedList?serviceKey=${key}&${COMMON}&numOfRows=${PAGE_SIZE}`;
  // 카탈로그는 KST 자정까지 공유 Data Cache. URL 이 날짜 무관하게 안정적이라 인스턴스 간 공유된다.
  const revalidate = secondsUntilKstMidnight();

  const first = await fetchJson(`${base}&pageNo=1`, revalidate);
  const total = totalOf(first);
  const acc = itemsOf(first);

  // 방어적: 한 페이지에 다 안 들어왔으면(향후 데이터 증가 등) 나머지 페이지를 받는다.
  const pages = Math.min(20, Math.ceil(total / PAGE_SIZE));
  for (let p = 2; p <= pages; p += 1) {
    acc.push(...itemsOf(await fetchJson(`${base}&pageNo=${p}`, revalidate)));
  }
  return acc;
}

/** imageList 원본 이미지 URL. */
export interface CampImage {
  imageUrl: string;
}

/**
 * 한 캠핑장의 사진 갤러리(imageList). 사용자가 상세를 열 때만 lazy 로 부른다(쿼터 분산).
 * 실측: contentId 로 조회, 정상 response.body.items.item[].imageUrl.
 */
export async function fetchImages(contentId: string): Promise<string[]> {
  const url =
    `${HOST}/imageList?serviceKey=${serviceKey()}&${COMMON}` +
    `&numOfRows=30&pageNo=1&contentId=${encodeURIComponent(contentId)}`;
  // 사진은 거의 안 바뀐다. 12시간 공유 Data Cache.
  const json = await fetchJson(url, 12 * 60 * 60);
  return (itemsOf(json) as CampImage[])
    .map((i) => i.imageUrl?.trim())
    .filter((u): u is string => !!u);
}
