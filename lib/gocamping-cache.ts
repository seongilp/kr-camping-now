/**
 * 업스트림 보호 캐시(모듈 스코프 메모리 + inflight). 이 앱 쿼터 방어의 핵심이다.
 *
 * 왜 필수인가(팀 지시): 카탈로그는 3,109건이다. 오퍼레이션당 1,000회/일 한도에서 **하루 1회
 * 전량 수집**(basedList 1콜, numOfRows=5000)만 하면 하루 몇 콜로 끝난다. 반대로 사용자 위치가
 * 바뀔 때마다 반경 API 를 때리면 쿼터가 사용자 수에 비례해 터진다. 그래서 전량을 한 번 받아
 * 캐시하고, "내 주변"은 캐시된 전량에서 서버가 좌표로 골라 낸다(업스트림 0).
 *
 * 규칙:
 *  - 성공만 캐시한다. 쿼터·타임아웃 실패는 예외로 그대로 던진다(호출부가 no-store 응답).
 *  - **TTL 을 KST 자정에서 자른다.** 캐시 키에도 KST 날짜를 넣어 이중 안전.
 *  - Vercel 인스턴스는 언제든 새로 뜨므로 이 메모리 캐시는 웜 인스턴스 안에서의 최선이다.
 *    인스턴스 간 공유는 gocamping-api 의 fetch revalidate(Data Cache)가 맡는다.
 */

import { fetchCamps, fetchImages } from './gocamping-api';
import { normalize, type Camp, type CampRaw } from './camps';
import { isExcludedCamp } from './excluded-camps';
import { msUntilKstMidnight, todayYmdKst } from './kst';

/** 전량 카탈로그(정규화 완료). */
export interface Catalog {
  /** 좌표가 있어 지도에 찍을 수 있는 캠핑장. */
  camps: Camp[];
  /** 좌표가 없어 지도에 못 찍는 건수(정직하게 노출한다). */
  noCoords: number;
}

interface CatalogEntry {
  expiresAt: number;
  catalog: Catalog;
}

const catalogCache = new Map<string, CatalogEntry>();
const catalogInflight = new Map<string, Promise<Catalog>>();

/** 원본 배열 → 정규화 Catalog. 순수 조립(테스트 가능). 좌표 없는 항목을 세어 둔다. */
export function buildCatalog(raws: CampRaw[]): Catalog {
  // 실제 야영장이 아닌 업체(캠핑카 대여·아카데미 등) 명시 제외. lib/excluded-camps.ts 참고.
  const filtered = raws.filter((r) => !isExcludedCamp(r.contentId?.trim() ?? ''));
  const camps: Camp[] = [];
  let noCoords = 0;
  for (const r of filtered) {
    const c = normalize(r);
    if (c) camps.push(c);
    else noCoords += 1; // 좌표 결측 또는 한국 밖(=지도에 못 찍음)
  }
  return { camps, noCoords };
}

/** 전량 카탈로그. 성공 시 KST 자정까지 캐시. inflight 로 동시요청 합류. */
export async function getCatalogCached(): Promise<Catalog> {
  const today = todayYmdKst();
  const key = today;

  const hit = catalogCache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.catalog;

  const pending = catalogInflight.get(key);
  if (pending) return pending;

  const p = fetchCamps()
    .then((raws) => {
      const catalog = buildCatalog(raws);
      catalogCache.set(key, { expiresAt: Date.now() + msUntilKstMidnight(), catalog });
      for (const k of catalogCache.keys()) {
        if (k !== today) catalogCache.delete(k); // 어제 키 청소
      }
      return catalog;
    })
    .finally(() => {
      catalogInflight.delete(key); // 실패든 성공이든 inflight 비움(실패 재시도 가능)
    });

  catalogInflight.set(key, p);
  return p;
}

interface ImageEntry {
  at: number;
  value: string[];
}

const IMAGE_TTL_MS = 12 * 60 * 60 * 1000;
const IMAGE_MAX = 2000;
const imageCache = new Map<string, ImageEntry>();
const imageInflight = new Map<string, Promise<string[]>>();

/** 상세 사진 갤러리(캐시). 성공만 캐시(빈 배열=사진 없음도 유효한 답이라 캐시). 실패는 던진다. */
export async function getImagesCached(contentId: string): Promise<string[]> {
  const hit = imageCache.get(contentId);
  if (hit && Date.now() - hit.at < IMAGE_TTL_MS) return hit.value;

  const pending = imageInflight.get(contentId);
  if (pending) return pending;

  const p = fetchImages(contentId)
    .then((value) => {
      imageCache.set(contentId, { at: Date.now(), value });
      if (imageCache.size > IMAGE_MAX) {
        const oldest = imageCache.keys().next().value;
        if (oldest !== undefined) imageCache.delete(oldest);
      }
      return value;
    })
    .finally(() => {
      imageInflight.delete(contentId);
    });

  imageInflight.set(contentId, p);
  return p;
}
