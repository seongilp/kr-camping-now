# 캠핑나우 (kr-camping-now)

내 주변에서 조건에 맞는 캠핑장을 지도에서 찾는 계획형 지도 앱. 한국관광공사 **고캠핑(GoCamping)**
공식 데이터로 전국 3,100여 개 캠핑장을 **좌표 + 다중 패싯(업종·입지·반려동물·운영계절)** 으로 거른다.

국내 사용자용 한국어 앱. 형제 앱 `gofish`·`korea-mountain` 과 같은 결의 계획형 도구다.

## 무엇을 하나

- **지도가 첫 화면.** 현재 위치를 읽어 가까운 캠핑장부터 보여 준다. 위치 권한이 없거나 거부되면
  **서울 기준**으로 폴백하고, 그 사실을 배너로 정직하게 밝힌다(무한 로딩 없음).
- **다중 패싯 필터** — 이 앱의 가치. 축을 겹쳐 걸 수 있다(AND):
  - **업종**(`induty`): 글램핑 · 카라반 · 오토캠핑 · 일반야영
  - **입지**(`lctCl`): 해변 · 계곡 · 숲 · 산 · 강 · 섬 · 도심
  - **반려동물 동반**(`animalCmgCl`): 가능/소형견만
  - **연중 운영**(`operPdCl`): 사계절 운영만
- **상세**: 사진 갤러리(고캠핑 `imageList` lazy 로딩), 소개, 부대시설, 예약 방식, 주소·전화,
  예약 링크·홈페이지·길찾기.

### 하지 않는 것 (정직성)

- **실시간 빈자리 없음.** 고캠핑 데이터에 잔여 사이트 수가 없다. 사이트 개수 필드는 **총량**이지
  빈자리가 아니다 — 그래서 "지금 몇 자리 남았나"는 이 앱이 하지 않는다.
- 채움률이 낮은 필드(예약링크 46%·글램핑 내부시설 16%·체험 11%)는 **필터로 만들지 않는다.**
  필터를 걸었는데 대부분이 사라지면 "없다"는 거짓말이 되기 때문. 대신 **상세 화면에는 값이 있으면
  보여 준다.**
- 좌표가 없어 지도에 못 찍는 캠핑장(실측 10곳/3,109)은 목록에서 제외하고 그 수를 밝힌다.

## 데이터 실측 (2026-09-02, 활용신청 승인 직후 전량 수집)

| 항목 | 값 |
|---|---|
| 총 건수 | **3,109** (좌표 있음 3,099 + 좌표 없음 10) |
| 좌표(mapX/mapY) | **99.7%**, 전부 WGS84 한국범위(이탈 0) |
| 업종 `induty` | 99.8% |
| 입지 `lctCl` | 84.0% |
| 반려동물 `animalCmgCl` | 83.6% |
| 운영계절 `operPdCl` | 78.9% |
| 대표사진 `firstImageUrl` | 75.0% |
| 부대시설 `sbrsCl` | 70.8% |
| 예약링크 `resveUrl` | 46.4% (필터 제외, 상세에만) |
| 일일 한도 | 개발계정 **1,000회/오퍼레이션·일** |

## 아키텍처

```
app/
  page.tsx                     랜딩(서버 컴포넌트, SEO)
  map/page.tsx                 앱 본체 → CampsBrowser
  api/camps/route.ts           ★ 서버 공간+패싯 필터(가까운 ≤200곳만 반환)
  api/camps/[id]/images/route.ts  사진 갤러리(imageList, lazy)
  api/warm/route.ts            카탈로그 예열(cron, fail-closed)
lib/
  gocamping-api.ts             고캠핑 클라이언트(서버 전용, 키 verbatim)
  gocamping-cache.ts           모듈 캐시 + inflight(KST 자정 TTL)
  camps.ts                     정규화·응답 파서(정상/에러/평면 3구조)
  facets.ts                    필터 정의·매칭(순수 함수)
  geo.ts                       하버사인·nearest(서버 공간 필터)
  kst.ts                       KST 달력 계산(캐시 TTL 컷)
  cache-control.ts             CDN SWR 헤더(자정 컷)
components/
  camps-browser.tsx            메인 클라이언트(위치·필터·상태)
  camps-map.tsx                MapLibre v5 지도
  camp-card.tsx / camp-detail.tsx
```

### 캐싱 (쿼터 방어)

카탈로그(3,109건)는 하루에도 거의 안 바뀐다. 그래서:

1. **인스턴스 간 공유 Data Cache** — `fetch(..., { next: { revalidate } })` 로 업스트림 응답을
   **KST 자정까지** 공유한다. 콜드 인스턴스가 업스트림을 다시 때리지 않는다.
2. **모듈 캐시 + inflight** — 정규화된 카탈로그를 웜 인스턴스 메모리에 캐시(성공만, 실패는 던짐).
3. **서버 공간 필터** — 전량을 클라이언트로 내리지 않는다. 필터 적용 후 가까운 **≤200곳만** 반환
   (payload gzip ~26KB). 위치가 바뀌어도 업스트림은 0.
4. **CDN SWR** — 위치 없는 폴백 응답만 `s-maxage + stale-while-revalidate`(자정 컷)로 CDN 캐시.
   실좌표 응답은 사용자마다 달라 `no-store`.
5. **예열 크론** — `/api/warm` 이 하루 1회 자기 공개 URL 을 때려 Data Cache + CDN 을 미리 데운다.

**쿼터 계산:** 예열 1콜/일 + 콜드 인스턴스 몇 콜 + 상세 사진 lazy = 오퍼레이션당 1,000회/일의
극히 일부. 여유가 압도적으로 크다.

## 개발

```bash
npm install
cp .env.example .env.local   # DATA_GO_KR_KEY(고캠핑 활용신청된 Encoding 키) 채우기
npm run dev                  # http://localhost:3000
npm test                     # 순수 함수 단위 테스트(파서·거리·KST·필터·캐시)
npm run build
```

### 환경변수

| 이름 | 용도 |
|---|---|
| `DATA_GO_KR_KEY` | data.go.kr 서비스키. **Encoding 형태**를 그대로. 재인코딩하면 code 30 |
| `CRON_SECRET` | `/api/warm` 인증. 없으면 503(fail-closed) |

## 함정 (형제 앱들이 피 흘려 배운 것)

1. **serviceKey 재인코딩 금지.** 이미 %-인코딩된 키를 URLSearchParams 등에 넣으면 이중인코딩되어
   403 `SERVICE_KEY_IS_NOT_REGISTERED`(code 30) — "미신청"과 문자열이 같아 오진한다. 쿼리스트링을
   문자열로 직접 조립하고 verbatim 보간한다.
2. **200 이 성공이 아니다.** 본문의 `resultCode`/`returnReasonCode` 를 본다. 응답 구조가 3종:
   정상 `response.body.items.item` / 게이트웨이·키 에러 `OpenAPI_ServiceResponse.cmmMsgHeader` /
   앱 파라미터 에러 평면 `{resultCode:"10", ...}`.
3. **MapLibre v5.** v6 는 Turbopack 워커 로딩 실패로 지도가 조용히 안 뜬다.
4. **Vercel `regions:["icn1"]`** (배포 시). iad1 이면 태평양 왕복으로 타임아웃.
5. **KST 자정 컷.** 캐시 TTL 을 KST 자정에서 잘라 날짜 경계 하루 밀림을 원천 차단.

## 데이터 출처

한국관광공사 고캠핑(GoCamping) 정보조회 서비스 (data.go.kr, 15101933). 좌표 WGS84.
