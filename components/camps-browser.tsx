'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Dog, Loader2, MapPin, Search, Sun, Tent } from 'lucide-react';

import type { LatLon } from '@/lib/geo';
import { SEOUL, haversineKm } from '@/lib/geo';
import type { CampIndexItem, CampWithDistance, CampsResponse, MapBounds } from '@/lib/types';
import {
  EMPTY_FILTERS,
  INDUTY_COLOR,
  INDUTY_OPTIONS,
  LCT_OPTIONS,
  SIDO_OPTIONS,
  hasAnyFilter,
  indutyColorFor,
  type Filters,
} from '@/lib/facets';
import { cn } from '@/lib/utils';
import { CampCard } from '@/components/camp-card';
import { CampDetail } from '@/components/camp-detail';
import { CampsMap, type FlyTarget, type MapPoint } from '@/components/camps-map';
import { CommandPalette } from '@/components/command-palette';

/** 위치 상태를 명확히 구분(무한 로딩 금지, F-6). */
type GeoState =
  | { kind: 'locating' }
  | { kind: 'granted'; at: LatLon }
  | { kind: 'denied' }
  | { kind: 'unavailable' }
  | { kind: 'unsupported' };

/** 데이터 로딩 상태. "0건"·"로딩중"·"실패"를 절대 섞지 않는다(F-6). */
type DataState =
  | { kind: 'loading' }
  | { kind: 'error'; code?: string }
  | { kind: 'ready'; data: CampsResponse };

export function CampsBrowser() {
  const [data, setData] = useState<DataState>({ kind: 'loading' });
  // 마지막으로 성공한 응답을 보존한다. 필터·영역이 바뀌어 재요청(loading)하는 동안에도 이전 결과를
  // 계속 보여줘 **지도가 언마운트되지 않게** 한다(언마운트되면 다시 뜰 때 초기 위치로 튀어 flyTo 가 사라진다).
  const [lastReady, setLastReady] = useState<CampsResponse | null>(null);
  const [geo, setGeo] = useState<GeoState>({ kind: 'locating' });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 커맨드 팔레트(⌘K) 상태.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [index, setIndex] = useState<CampIndexItem[] | null>(null);
  const [indexLoading, setIndexLoading] = useState(false);
  // 팔레트에서 고른, 가까운 200곳 '밖'의 캠핑장(단건 조회로 채운다). 지도·상세에 합류시킨다.
  const [extraCamp, setExtraCamp] = useState<CampWithDistance | null>(null);
  // 지도에 보이는 영역. 사용자가 지도를 옮기면 채워지고, 그 영역으로 서버 조회한다.
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  // 프로그램 지도 이동(시도 선택·가장 가까운·내 위치 등). key 증가로만 실제 이동.
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const flyKeyRef = useRef(0);
  const paletteOpenRef = useRef(paletteOpen);
  useEffect(() => void (paletteOpenRef.current = paletteOpen), [paletteOpen]);

  const hasRealLocation = geo.kind === 'granted';
  const origin: LatLon = geo.kind === 'granted' ? geo.at : SEOUL;

  /** 지도를 특정 지점으로 프로그램 이동(사용자 조작과 구분됨). */
  const flyToPoint = useCallback((lat: number, lon: number, zoom: number) => {
    flyKeyRef.current += 1;
    setFlyTo({ lat, lon, zoom, key: flyKeyRef.current });
  }, []);

  /* 위치. 지도 진입은 "내 주변"을 보겠다는 의도라 한 번 요청.
     거부/불가/미지원을 각각 다른 상태로 두고, 어느 경우든 서울로 폴백해 계속 동작한다. */
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeo({ kind: 'unsupported' });
      return;
    }
    let alive = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (alive)
          setGeo({ kind: 'granted', at: { lat: pos.coords.latitude, lon: pos.coords.longitude } });
      },
      (err) => {
        if (!alive) return;
        setGeo({ kind: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
    return () => {
      alive = false;
    };
  }, []);

  const requestLocation = () => {
    setGeo({ kind: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const at = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setGeo({ kind: 'granted', at });
        setBounds(null); // '내 위치로' → 영역 조회 해제하고 내 주변으로 되돌린다
        flyToPoint(at.lat, at.lon, 11);
      },
      (err) => setGeo({ kind: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  /* 데이터 로드. 서버가 공간+패싯 필터를 하므로 위치/필터가 바뀌면 재요청(업스트림은 캐시라 0).
     위치가 아직 locating 이면 기다린다 — 서울 결과를 잠깐 보였다가 튀는 걸 막는다. */
  const load = useCallback(() => {
    if (geo.kind === 'locating') return;
    let alive = true;
    setData({ kind: 'loading' });
    const params = new URLSearchParams();
    // 영역(사용자가 지도 이동) 우선 → 없으면 실제 위치 → 없으면 서울 폴백(서버 기본).
    if (bounds) {
      params.set('minLat', String(bounds.minLat));
      params.set('maxLat', String(bounds.maxLat));
      params.set('minLon', String(bounds.minLon));
      params.set('maxLon', String(bounds.maxLon));
    } else if (hasRealLocation) {
      params.set('lat', String(origin.lat));
      params.set('lon', String(origin.lon));
    }
    if (filters.induty) params.set('induty', filters.induty);
    if (filters.lct) params.set('lct', filters.lct);
    if (filters.sido) params.set('sido', filters.sido);
    if (filters.animalOnly) params.set('animal', '1');
    if (filters.yearRoundOnly) params.set('yearRound', '1');

    fetch(`/api/camps?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { code?: string };
          throw Object.assign(new Error('upstream'), { code: body.code });
        }
        return r.json() as Promise<CampsResponse>;
      })
      .then((json) => {
        if (!alive) return;
        setData({ kind: 'ready', data: json });
        setLastReady(json); // 다음 로딩 동안 지도·리스트를 유지하기 위한 스냅샷
      })
      .catch((e: { code?: string }) => {
        if (alive) setData({ kind: 'error', code: e?.code });
      });
    return () => {
      alive = false;
    };
  }, [filters, bounds, hasRealLocation, origin.lat, origin.lon, geo.kind]);

  useEffect(() => load(), [load]);

  // 표시용 데이터는 "지금 준비된 것 또는 마지막 성공분". 로딩 중에도 이전 결과를 유지한다.
  const shown = data.kind === 'ready' ? data.data : lastReady;
  const camps: CampWithDistance[] = shown?.camps ?? [];
  const counts = shown?.counts ?? null;
  const meta = shown?.meta ?? null;
  const isLoading = data.kind === 'loading';
  const hasEverLoaded = shown !== null;

  /* ⌘K / Ctrl+K: 팔레트 토글. 입력창에 포커스가 있어도 팔레트는 열어야 하므로 여기선 가드하지 않는다. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ESC: 상세 카드 닫기(pet-travel 선례). 상세가 열렸을 때만 리스너를 붙인다.
     - 팔레트가 위에 있으면(paletteOpen) 팔레트가 ESC 를 먼저 먹으므로 여기선 건드리지 않는다.
     - 입력창(INPUT/TEXTAREA/contentEditable)에 포커스가 있으면 그쪽 동작을 우선한다. */
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || paletteOpenRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return;
      setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  /* 팔레트 최초 오픈 시 전국 이름 인덱스를 1회만 지연 로딩(검색은 이후 전부 클라이언트). */
  useEffect(() => {
    if (!paletteOpen || index || indexLoading) return;
    setIndexLoading(true);
    fetch('/api/camps/index')
      .then((r) => (r.ok ? (r.json() as Promise<{ items: CampIndexItem[] }>) : Promise.reject()))
      .then((j) => setIndex(j.items))
      .catch(() => setIndex(null))
      .finally(() => setIndexLoading(false));
  }, [paletteOpen, index, indexLoading]);

  /* 팔레트에서 캠핑장 선택.
     - 이미 리스트(가까운 200곳)에 있으면 그대로 선택.
     - 밖이면 단건 조회로 전체 정보를 받아 extraCamp 로 합류(지도·상세). 거리는 클라이언트에서 계산. */
  const selectCampFromPalette = useCallback(
    async (id: string) => {
      setPaletteOpen(false);
      if (camps.some((c) => c.id === id)) {
        setExtraCamp(null);
        setSelectedId(id);
        return;
      }
      try {
        const res = await fetch(`/api/camps/${id}`);
        if (!res.ok) return;
        const { camp } = (await res.json()) as { camp: CampWithDistance };
        const distanceKm = Math.round(haversineKm(origin, { lat: camp.lat, lon: camp.lon }) * 10) / 10;
        setExtraCamp({ ...camp, distanceKm });
        setSelectedId(id);
      } catch {
        // 단건 조회 실패는 조용히 무시(팔레트만 닫힘). 사용자가 다시 시도할 수 있다.
      }
    },
    [camps, origin],
  );

  // 리스트 밖에서 고른 캠핑장(extraCamp)을 지도·상세에 합류시킨다(중복 제거).
  const mergedCamps: CampWithDistance[] = useMemo(
    () => (extraCamp && !camps.some((c) => c.id === extraCamp.id) ? [extraCamp, ...camps] : camps),
    [camps, extraCamp],
  );

  const points: MapPoint[] = useMemo(
    () =>
      mergedCamps.map((c) => ({
        id: c.id,
        lon: c.lon,
        lat: c.lat,
        title: c.name,
        color: indutyColorFor(c.induty), // 대표 업종 색(글램핑>카라반>오토>일반 우선순위)
      })),
    [mergedCamps],
  );

  const selected = mergedCamps.find((c) => c.id === selectedId) ?? null;
  const center = origin;

  // 조회 모드: 서버가 확정해 준 mode 를 신뢰(없으면 클라이언트 추정).
  const mode = meta?.mode ?? (bounds ? 'bounds' : hasRealLocation ? 'location' : 'fallback');
  // 거리는 '내 실제 위치' 기준일 때만 의미 있다. 영역·폴백·시도 기준 거리는 오해를 부르므로 숨긴다.
  const showDistance = mode === 'location';

  const indutyCount = (key: string) => counts?.induty.find((c) => c.key === key)?.count ?? 0;
  const lctCount = (key: string) => counts?.lct.find((c) => c.key === key)?.count ?? 0;
  const sidoCount = (key: string) => counts?.sido.find((c) => c.key === key)?.count ?? 0;

  /* 사용자가 지도를 옮겨 멈추면 그 영역으로 조회 전환(디바운스는 지도 컴포넌트가 함). */
  const handleUserMoveEnd = useCallback((b: MapBounds) => setBounds(b), []);

  /* 시도 선택/해제. 시도는 새 지역 의도라 영역(bounds)을 해제하고, 선택 시 그 지역으로 지도 이동.
     팔레트·사이드바가 이 하나를 공유해 상태가 갈라지지 않게 한다. */
  const toggleSido = useCallback(
    (key: string) => {
      // 부작용(지도 이동·영역 해제)은 setFilters 업데이터 '밖'에서 — 업데이터는 순수해야 한다
      // (StrictMode 이중 호출 등에서 setState 를 그 안에 넣으면 누락된다).
      const selecting = filters.sido !== key;
      setFilters((f) => ({ ...f, sido: f.sido === key ? null : key }));
      if (selecting) {
        const opt = SIDO_OPTIONS.find((o) => o.key === key);
        if (opt) {
          setBounds(null);
          flyToPoint(opt.center.lat, opt.center.lon, 9);
        }
      }
    },
    [filters.sido, flyToPoint],
  );

  /* "가장 가까운 곳으로": 영역 조회를 풀고 내 위치(없으면 서울)로 되돌린다. */
  const resetToNearest = useCallback(() => {
    setBounds(null);
    flyToPoint(origin.lat, origin.lon, 11);
  }, [origin.lat, origin.lon, flyToPoint]);

  return (
    <div className="flex h-dvh flex-col">
      {/* 상단 바 */}
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 text-sm font-bold">
          <Tent className="size-4 text-primary" />
          캠핑나우
        </Link>
        <div className="flex items-center gap-2">
          {meta && (
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              전국 {meta.total.toLocaleString()}곳
            </span>
          )}
          {/* 검색/필터 팔레트 열기. 데스크톱은 ⌘K 힌트, 모바일은 버튼이 유일한 진입로. */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            aria-label="캠핑장 검색 및 필터 열기"
          >
            <Search className="size-3.5" />
            <span className="hidden sm:inline">검색</span>
            <kbd className="hidden rounded border border-border bg-muted px-1 font-sans text-[10px] sm:inline">
              ⌘K
            </kbd>
          </button>
        </div>
      </header>

      {/* 필터: 지역(시도)·업종·입지 칩(가로 스크롤) + 반려동물·연중 토글 */}
      <div className="space-y-1.5 border-b border-border px-4 py-2">
        <ChipRow label="지역">
          {SIDO_OPTIONS.map((o) => (
            <Chip key={o.key} active={filters.sido === o.key} onClick={() => toggleSido(o.key)}>
              {o.label}
              {counts && <Count>{sidoCount(o.key)}</Count>}
            </Chip>
          ))}
        </ChipRow>

        <ChipRow label="업종">
          {INDUTY_OPTIONS.map((o) => (
            <Chip
              key={o.key}
              active={filters.induty === o.key}
              onClick={() =>
                setFilters((f) => ({ ...f, induty: f.induty === o.key ? null : o.key }))
              }
            >
              {o.label}
              {counts && <Count>{indutyCount(o.key)}</Count>}
            </Chip>
          ))}
        </ChipRow>

        <ChipRow label="입지">
          {LCT_OPTIONS.map((o) => (
            <Chip
              key={o.key}
              active={filters.lct === o.key}
              onClick={() => setFilters((f) => ({ ...f, lct: f.lct === o.key ? null : o.key }))}
            >
              {o.label}
              {counts && <Count>{lctCount(o.key)}</Count>}
            </Chip>
          ))}
          <span className="mx-0.5 w-px shrink-0 bg-border" aria-hidden />
          <Chip
            active={filters.animalOnly}
            tone="emerald"
            onClick={() => setFilters((f) => ({ ...f, animalOnly: !f.animalOnly }))}
          >
            <Dog className="size-3" />
            반려동물
            {counts && <Count>{counts.animal}</Count>}
          </Chip>
          <Chip
            active={filters.yearRoundOnly}
            tone="amber"
            onClick={() => setFilters((f) => ({ ...f, yearRoundOnly: !f.yearRoundOnly }))}
          >
            <Sun className="size-3" />
            연중
            {counts && <Count>{counts.yearRound}</Count>}
          </Chip>
          {hasAnyFilter(filters) && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="ml-1 shrink-0 rounded-full px-2 py-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              초기화
            </button>
          )}
        </ChipRow>
      </div>

      {/* 위치 상태 배너: 폴백/거부/불가를 명확히. granted 면 배너 없음. */}
      {geo.kind !== 'granted' && geo.kind !== 'locating' && (
        <div className="flex items-center gap-2 border-b border-border bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
          <MapPin className="size-3.5 shrink-0" />
          <span className="flex-1">
            {geo.kind === 'denied'
              ? '위치 권한이 거부되어 서울 기준으로 보여줍니다.'
              : geo.kind === 'unsupported'
                ? '이 브라우저는 위치를 지원하지 않아 서울 기준으로 보여줍니다.'
                : '위치를 확인할 수 없어 서울 기준으로 보여줍니다.'}
          </span>
          {geo.kind !== 'unsupported' && (
            <button
              type="button"
              onClick={requestLocation}
              className="shrink-0 rounded-full border border-amber-400/40 px-2 py-0.5 font-medium hover:bg-amber-400/10"
            >
              내 위치로
            </button>
          )}
        </div>
      )}

      {/* 지도 첫 화면: 데스크톱은 좌우 분할(목록 좌측 고정폭 + 지도 우측 전폭), 모바일은 지도 위/리스트 아래.
          전폭(full-bleed) — 가운데 정렬 컨테이너를 두지 않는다. 헤더·필터 바와 같은 좌측 기준선(px-4)에
          목록을 붙이고, 남는 폭은 전부 지도에 준다(초대형 화면에서 목록은 고정폭이라 안 늘어난다). */}
      <div className="flex min-h-0 w-full flex-1 flex-col sm:flex-row-reverse">
        {/* 지도 */}
        <div className="relative h-[42dvh] w-full shrink-0 sm:h-auto sm:flex-1">
          {/* 한 번이라도 로드되면 지도를 계속 마운트해 둔다. 재요청 중 언마운트하면 다시 뜰 때
              초기 위치로 튀어 flyTo(시도 선택·영역 이동)가 사라진다. */}
          {hasEverLoaded && (
            <CampsMap
              points={points}
              center={center}
              isUserLocation={hasRealLocation}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onUserMoveEnd={handleUserMoveEnd}
              flyTo={flyTo}
            />
          )}
          {/* 업종 색 범례. 좌하단(저작권은 우하단이라 안 겹침). 모바일에선 칩이 줄바꿈된다. */}
          {hasEverLoaded && <MapLegend />}
          {/* 최초 로딩(아직 아무 데이터 없음) */}
          {!hasEverLoaded && data.kind !== 'error' && (
            <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {geo.kind === 'locating' ? '내 위치 확인 중…' : '캠핑장 불러오는 중…'}
            </div>
          )}
          {/* 재요청 중(이전 결과는 유지)엔 작은 오버레이만 */}
          {hasEverLoaded && isLoading && (
            <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
              <Loader2 className="size-3.5 animate-spin" />
              불러오는 중…
            </div>
          )}
          {/* 첫 로드 실패(보여줄 이전 데이터가 없을 때만 전면 에러) */}
          {!hasEverLoaded && data.kind === 'error' && (
            <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
              <AlertCircle className="size-6 text-destructive" />
              <p className="text-muted-foreground">지금 캠핑장 정보를 불러오지 못했습니다.</p>
              <button
                type="button"
                onClick={() => load()}
                className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent"
              >
                다시 시도
              </button>
            </div>
          )}
        </div>

        {/* 리스트 */}
        <div className="flex min-h-0 flex-1 flex-col sm:w-[26rem] sm:flex-none sm:border-r sm:border-border">
          <div className="flex items-baseline justify-between px-4 py-2 text-xs text-muted-foreground">
            {/* 헤더 문구를 모드에 맞춘다: 지도를 옮겼으면 "이 지도 영역". */}
            <span className="font-medium text-foreground">
              {mode === 'bounds' ? '이 지도 영역' : '주변 캠핑장'}
            </span>
            {shown && (
              <span>
                {camps.length}곳
                {mode === 'location'
                  ? ' · 가까운 순'
                  : mode === 'bounds'
                    ? ' · 이 영역'
                    : ' · 서울 기준'}
              </span>
            )}
          </div>

          {/* 잘림 안내: matched > returned 면 "가장 가까운 N곳만" 임을 정직하게 알린다. */}
          {meta?.truncated && (
            <p className="px-4 pb-1 text-[11px] text-muted-foreground">
              {mode === 'bounds' ? '이 영역' : '조건'}에 맞는 {meta.matched.toLocaleString()}곳 중
              {mode === 'bounds' ? ' 가까운' : ' 가까운'} {camps.length}곳
            </p>
          )}

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
            {hasEverLoaded && !isLoading && camps.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Tent className="size-8 text-muted-foreground/50" />
                {/* 0곳: 필터 때문인지 / 원래 없는 영역인지 구분해 안내(정직성). */}
                <p className="text-sm font-medium">
                  {mode === 'bounds'
                    ? hasAnyFilter(filters)
                      ? '이 지도 영역에는 조건에 맞는 캠핑장이 없습니다.'
                      : '이 지도 영역에는 캠핑장이 없습니다.'
                    : hasAnyFilter(filters)
                      ? '이 조건에 맞는 캠핑장이 없습니다.'
                      : '주변에 캠핑장이 없습니다.'}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {mode === 'bounds' && (
                    <button
                      type="button"
                      onClick={resetToNearest}
                      className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent"
                    >
                      가장 가까운 곳으로
                    </button>
                  )}
                  {hasAnyFilter(filters) && (
                    <button
                      type="button"
                      onClick={() => setFilters(EMPTY_FILTERS)}
                      className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent"
                    >
                      필터 초기화
                    </button>
                  )}
                </div>
              </div>
            )}
            {camps.map((c) => (
              <CampCard
                key={c.id}
                camp={c}
                showDistance={showDistance}
                selected={c.id === selectedId}
                onSelect={() => setSelectedId(c.id)}
              />
            ))}
            {!hasEverLoaded &&
              isLoading &&
              geo.kind !== 'locating' &&
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[92px] animate-pulse rounded-xl bg-muted" />
              ))}
          </div>

          {/* 좌표 없는 캠핑장 정직 고지(지도에 못 찍음). 실측 좌표 채움률 99.7%라 극소수. */}
          {meta && meta.noCoords > 0 && (
            <p className="border-t border-border px-4 py-1.5 text-[11px] text-muted-foreground">
              좌표가 제공되지 않아 지도에 표시하지 못한 캠핑장 {meta.noCoords}곳은 목록에서 제외됩니다.
            </p>
          )}
        </div>
      </div>

      {/* 상세 시트 */}
      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-20 sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[26rem]">
          <CampDetail camp={selected} showDistance={showDistance} onClose={() => setSelectedId(null)} />
        </div>
      )}

      {/* 커맨드 팔레트(⌘K). 상세보다 위 레이어(z-50). 필터 상태를 부모와 공유. */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        index={index}
        indexLoading={indexLoading}
        filters={filters}
        setFilters={setFilters}
        onToggleSido={toggleSido}
        onSelectCamp={selectCampFromPalette}
      />
    </div>
  );
}

/* ── 작은 UI 조각들 ───────────────────────────────────────────── */

/** 지도 업종 색 범례. 핀 색이 뭘 뜻하는지 없으면 여전히 눌러 봐야 하므로 지도 위에 둔다. */
function MapLegend() {
  return (
    <div className="absolute bottom-2 left-2 z-10 max-w-[calc(100%-1rem)] rounded-lg border border-border bg-card/90 px-2.5 py-1.5 text-[11px] shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {INDUTY_OPTIONS.map((o) => (
          <span key={o.key} className="inline-flex items-center gap-1">
            <span
              className="size-2.5 shrink-0 rounded-full ring-1 ring-black/40"
              style={{ background: INDUTY_COLOR[o.key] }}
            />
            <span className="text-muted-foreground">{o.label}</span>
          </span>
        ))}
      </div>
      {/* 카드엔 배지가 여럿인데 핀은 하나라 대표 하나로 칠한다는 걸 밝힌다(정직성). */}
      <p className="mt-0.5 text-[10px] text-muted-foreground/70">복수 업종은 대표 하나로 표시</p>
    </div>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="scrollbar-none flex gap-1.5 overflow-x-auto">{children}</div>
    </div>
  );
}

function Chip({
  active,
  tone = 'primary',
  onClick,
  children,
}: {
  active: boolean;
  tone?: 'primary' | 'emerald' | 'amber';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const activeCls =
    tone === 'emerald'
      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-400'
      : tone === 'amber'
        ? 'border-amber-500/50 bg-amber-500/15 text-amber-400'
        : 'border-primary bg-primary text-primary-foreground';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? activeCls : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="opacity-60">{children}</span>;
}
