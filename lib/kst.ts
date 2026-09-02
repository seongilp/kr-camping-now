/**
 * KST 달력 날짜 계산. (형제앱 kr-taxfree-now/lib/kst.ts 의 패턴을 그대로 옮긴 것.)
 *
 * 왜 따로 두는가: 캐시 TTL 을 "KST 자정"에서 잘라야 날짜 경계를 넘겨 하루 틀린 캐시를
 * 재사용하는 일이 구조적으로 안 생긴다. 형제앱(항공·입양)에서 인스턴트(시각 Date)와
 * 달력 날짜를 섞어 자정 경계에서 하루씩 밀린 결함을 두 번 겪었다. 그래서 여기서는
 * **KST 달력 날짜 → 에폭 일수(정수)** 로만 계산한다. 기준이 하나뿐이라 다시 어긋날 여지가 없다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** 지금이 KST 로 며칠인지, 1970-01-01 을 0 으로 세는 정수. */
export function kstToday(nowMs: number = Date.now()): number {
  return Math.floor((nowMs + KST_OFFSET_MS) / DAY_MS);
}

/** 에폭 일수 → `20260901`. */
export function dayToYmd(day: number): string {
  const date = new Date(day * DAY_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

/** KST 기준 오늘 `YYYYMMDD`. 서버가 UTC 로 도므로 직접 보정한다. */
export function todayYmdKst(nowMs: number = Date.now()): string {
  return dayToYmd(kstToday(nowMs));
}

/**
 * 다음 KST 자정까지 남은 밀리초. 자정 정각이면 꼬박 하루(86,400,000).
 * 캐시 수명을 이 값으로 잘라 두면 날짜 경계를 넘긴 캐시 재사용이 구조적으로 불가능해진다.
 */
export function msUntilKstMidnight(nowMs: number = Date.now()): number {
  return (kstToday(nowMs) + 1) * DAY_MS - KST_OFFSET_MS - nowMs;
}

/** 다음 KST 자정까지 남은 '초'. 항상 1 이상. CDN/Data Cache TTL 계산용. */
export function secondsUntilKstMidnight(nowMs: number = Date.now()): number {
  return Math.max(1, Math.ceil(msUntilKstMidnight(nowMs) / 1000));
}
