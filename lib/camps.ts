/**
 * 고캠핑 캠핑장 데이터의 정규화. **순수 함수만** 둔다(테스트가 여기에 붙는다).
 *
 * 형제앱들이 피 흘려 배운 두 곳을 그대로 물려받는다:
 *  1) 응답 파서 — 정상/에러 최상위 구조가 통째로 다르다(F-9). 한쪽만 기대하면 조용히 0건.
 *     정상: response.body.items.item / 게이트웨이·키 에러: OpenAPI_ServiceResponse.cmmMsgHeader
 *     / 앱 파라미터 에러: 평면 {resultCode:"10", ...}. 세 구조를 모두 본다.
 *  2) 결측을 값인 척하지 않기 — 필드가 있는 것과 값이 든 것은 다르다(실측). 빈 값은 null 로 둔다.
 *
 * ── 좌표(이 앱의 생사) ──
 * mapX=경도, mapY=위도, WGS84. 실측 채움률 99.7%. 좌표가 없거나 한국 밖이면 normalize 가
 * null 을 돌려준다(지도에 못 찍는 항목). 그런 항목은 카탈로그에서 좌표 없음으로 따로 세어
 * "지도에 표시 못한 N곳"으로 정직하게 밝힌다(buildCatalog 가 집계).
 */

/** basedList/searchList/locationBasedList item(우리가 쓰는 필드만). 이름은 실측 확인. */
export interface CampRaw {
  contentId?: string;
  facltNm?: string;
  lineIntro?: string;
  intro?: string;
  addr1?: string;
  addr2?: string;
  mapX?: string;
  mapY?: string;
  tel?: string;
  firstImageUrl?: string;
  doNm?: string;
  sigunguNm?: string;
  induty?: string;
  lctCl?: string;
  animalCmgCl?: string;
  operPdCl?: string;
  operDeCl?: string;
  sbrsCl?: string;
  sbrsEtc?: string;
  posblFcltyCl?: string;
  themaEnvrnCl?: string;
  exprnProgrm?: string;
  glampInnerFclty?: string;
  caravInnerFclty?: string;
  homepage?: string;
  resveUrl?: string;
  resveCl?: string;
  manageSttus?: string;
  direction?: string;
}

/** 반려동물 동반 구분. 값 정보가 없으면 'unknown'(="안 됨"이 아니다 — 정직하게 구분). */
export type AnimalPolicy = 'yes' | 'small' | 'no' | 'unknown';

/**
 * 시도(도/광역시) 정규화. `doNm` 값이 행정구역 개편으로 지저분하다(실측 18종):
 *   강원도 + 강원특별자치도 → 강원 / 전라북도 + 전북특별자치도 → 전북
 *   전남광주통합특별시 → 전남·광주(데이터가 둘을 한 값으로 묶어 놓음, 분리 불가) 등.
 * 합치지 않으면 "강원"을 골라도 215곳(강원특별자치도)이 빠진다. 아래 규칙으로 하나의 key 로 합친다.
 *
 * 반환: 표준 시도 key(영문). 매칭 실패 시 null(필터에 안 잡힘).
 * 순서 주의 — '전남광주통합' 을 일반 '광주'/'전남' 규칙보다 먼저 본다.
 */
const SIDO_RULES: [test: (s: string) => boolean, key: string][] = [
  [(s) => s.includes('전남광주'), 'jeonnam'], // 전남광주통합특별시(묶음 값)
  [(s) => s.includes('경기'), 'gyeonggi'],
  [(s) => s.includes('강원'), 'gangwon'],
  [(s) => s.includes('경상남') || s === '경남', 'gyeongnam'],
  [(s) => s.includes('경상북') || s === '경북', 'gyeongbuk'],
  [(s) => s.includes('충청남') || s === '충남', 'chungnam'],
  [(s) => s.includes('충청북') || s === '충북', 'chungbuk'],
  [(s) => s.includes('전라북') || s.includes('전북'), 'jeonbuk'],
  [(s) => s.includes('전라남') || s === '전남', 'jeonnam'],
  [(s) => s.includes('인천'), 'incheon'],
  [(s) => s.includes('제주'), 'jeju'],
  [(s) => s.includes('대구'), 'daegu'],
  [(s) => s.includes('울산'), 'ulsan'],
  [(s) => s.includes('대전'), 'daejeon'],
  [(s) => s.includes('세종'), 'sejong'],
  [(s) => s.includes('서울'), 'seoul'],
  [(s) => s.includes('부산'), 'busan'],
  [(s) => s.includes('광주'), 'gwangju'], // 앞의 전남광주 규칙에서 안 걸린 순수 광주(향후 데이터 대비)
];

export function normalizeSido(doNm: string | undefined | null): string | null {
  const s = doNm?.trim();
  if (!s) return null;
  for (const [test, key] of SIDO_RULES) {
    if (test(s)) return key;
  }
  return null;
}

/** 클라이언트로 내보내는 정규화된 캠핑장. 좌표는 숫자, 목록형 필드는 배열. */
export interface Camp {
  id: string;
  name: string;
  /** 한 줄 소개(lineIntro). 없으면 null. */
  lineIntro: string | null;
  addr: string | null;
  region: string | null; // "경기도 연천군"
  /** 정규화된 시도 key(강원도/강원특별자치도 등 표기 통합). 필터·집계용. */
  sido: string | null;
  lat: number;
  lon: number;
  tel: string | null;
  image: string | null;
  /** 업종(글램핑/카라반/자동차야영장/일반야영장 …). 콤마 분해. */
  induty: string[];
  /** 입지(해변/계곡/숲/산/강/섬/도심 …). 콤마 분해. */
  lct: string[];
  /** 반려동물 동반 정책. */
  animal: AnimalPolicy;
  /** 운영 계절(봄/여름/가을/겨울). 콤마 분해. */
  seasons: string[];
  /** 사계절(봄·여름·가을·겨울 모두) 운영이면 true. */
  yearRound: boolean;
  /** 부대시설(전기/온수/무선인터넷 …). */
  sbrs: string[];
  homepage: string | null;
  resveUrl: string | null;
  /** 예약 방식(전화/온라인실시간예약/현장 …). */
  resve: string[];
}

const SEASON_ALL = ['봄', '여름', '가을', '겨울'] as const;

/** 콤마(및 전각 콤마)로 나눠 공백 제거, 빈 항목 버린다. 값이 없으면 빈 배열. */
export function splitList(v: string | undefined | null): string[] {
  if (!v) return [];
  return v
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** animalCmgCl 원문("가능"/"불가능"/"가능(소형견)"/빈값) → 정책. */
export function parseAnimal(v: string | undefined): AnimalPolicy {
  const s = v?.trim();
  if (!s) return 'unknown';
  if (s.includes('불가')) return 'no';
  if (s.includes('소형')) return 'small';
  if (s.includes('가능')) return 'yes';
  return 'unknown';
}

const numOrNull = (v: string | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// 한국 대략 경계(WGS84). 좌표가 뒤집혀 오거나(경도/위도 스왑) 0,0 쓰레기를 거른다.
const KR_LON = [124, 132] as const;
const KR_LAT = [33, 39] as const;

/** HTML 태그·과잉 공백 제거(intro/lineIntro 방어). 값이 없으면 null. */
export function cleanText(v: string | undefined): string | null {
  if (!v) return null;
  const s = v
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s || null;
}

/**
 * 원본 item → 정규화 Camp. 좌표가 없거나 한국 밖이면 null(지도에 못 찍는다).
 * 결측 필드는 비운 채로 둔다 — 절대 지어내지 않는다.
 */
export function normalize(raw: CampRaw): Camp | null {
  const id = raw.contentId?.trim();
  const name = raw.facltNm?.trim();
  const lon = numOrNull(raw.mapX);
  const lat = numOrNull(raw.mapY);
  if (!id || !name) return null;
  if (lat == null || lon == null) return null;
  if (lon < KR_LON[0] || lon > KR_LON[1] || lat < KR_LAT[0] || lat > KR_LAT[1]) return null;

  const seasons = splitList(raw.operPdCl);
  const yearRound = SEASON_ALL.every((s) => seasons.includes(s));
  const region = [raw.doNm?.trim(), raw.sigunguNm?.trim()].filter(Boolean).join(' ') || null;
  const addr = raw.addr1?.trim() || null;

  return {
    id,
    name,
    lineIntro: cleanText(raw.lineIntro),
    addr,
    region,
    sido: normalizeSido(raw.doNm),
    lat,
    lon,
    tel: raw.tel?.trim() || null,
    image: raw.firstImageUrl?.trim() || null,
    induty: splitList(raw.induty),
    lct: splitList(raw.lctCl),
    animal: parseAnimal(raw.animalCmgCl),
    seasons,
    yearRound,
    sbrs: splitList(raw.sbrsCl),
    homepage: raw.homepage?.trim() || null,
    resveUrl: raw.resveUrl?.trim() || null,
    resve: splitList(raw.resveCl),
  };
}

/**
 * 응답 본문에서 items 배열을 안전하게 뽑는다.
 * 정상: response.body.items.item (배열/단일객체, 0건이면 items===""/없음).
 * 에러 판정은 parseApiError 가 맡는다(이 함수는 정상 구조만 본다).
 */
export function itemsOf(json: unknown): CampRaw[] {
  const body = (json as { response?: { body?: { items?: unknown } } })?.response?.body?.items;
  if (!body || body === '') return [];
  const item = (body as { item?: unknown }).item;
  if (Array.isArray(item)) return item as CampRaw[];
  return item ? [item as CampRaw] : [];
}

/** 정상 응답의 totalCount(없으면 0). */
export function totalOf(json: unknown): number {
  return (
    (json as { response?: { body?: { totalCount?: number } } })?.response?.body?.totalCount ?? 0
  );
}

/**
 * 응답이 에러면 { code, msg }, 정상이면 null. 세 자리를 모두 본다:
 *  - OpenAPI_ServiceResponse.cmmMsgHeader (키/쿼터 계열, 200/403 본문). 30=미신청, 12=서비스없음, 22=쿼터초과.
 *  - response.header.resultCode (정상은 "0000").
 *  - 평면 {resultCode:"10", resultMsg} (앱 파라미터 오류, 예: 잘못된 syncType).
 * 200 이 성공이 아니라는 규칙(F-8)을 지킨다.
 */
export function parseApiError(json: unknown): { code: string; msg: string } | null {
  const cmm = (
    json as {
      OpenAPI_ServiceResponse?: { cmmMsgHeader?: { returnReasonCode?: string; errMsg?: string } };
    }
  )?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (cmm?.returnReasonCode) {
    return { code: cmm.returnReasonCode, msg: cmm.errMsg ?? 'service error' };
  }

  const header = (json as { response?: { header?: { resultCode?: string; resultMsg?: string } } })
    ?.response?.header;
  if (header?.resultCode && header.resultCode !== '0000') {
    return { code: header.resultCode, msg: header.resultMsg ?? 'service error' };
  }

  // 평면 파라미터 에러: response 래퍼 없이 최상위에 resultCode 가 온다.
  const flat = json as { resultCode?: string; resultMsg?: string; response?: unknown };
  if (flat && !flat.response && flat.resultCode && flat.resultCode !== '0000') {
    return { code: flat.resultCode, msg: flat.resultMsg ?? 'service error' };
  }
  return null;
}
