'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Dog, Loader2, MapPin, Sun, Tent } from 'lucide-react';

import type { LatLon } from '@/lib/geo';
import { SEOUL } from '@/lib/geo';
import type { CampWithDistance, CampsResponse } from '@/lib/types';
import {
  EMPTY_FILTERS,
  INDUTY_OPTIONS,
  LCT_OPTIONS,
  hasAnyFilter,
  type Filters,
} from '@/lib/facets';
import { cn } from '@/lib/utils';
import { CampCard } from '@/components/camp-card';
import { CampDetail } from '@/components/camp-detail';
import { CampsMap, type MapPoint } from '@/components/camps-map';

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
  const [geo, setGeo] = useState<GeoState>({ kind: 'locating' });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const hasRealLocation = geo.kind === 'granted';
  const origin: LatLon = geo.kind === 'granted' ? geo.at : SEOUL;

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
      (pos) =>
        setGeo({ kind: 'granted', at: { lat: pos.coords.latitude, lon: pos.coords.longitude } }),
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
    if (hasRealLocation) {
      params.set('lat', String(origin.lat));
      params.set('lon', String(origin.lon));
    }
    if (filters.induty) params.set('induty', filters.induty);
    if (filters.lct) params.set('lct', filters.lct);
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
        if (alive) setData({ kind: 'ready', data: json });
      })
      .catch((e: { code?: string }) => {
        if (alive) setData({ kind: 'error', code: e?.code });
      });
    return () => {
      alive = false;
    };
  }, [filters, hasRealLocation, origin.lat, origin.lon, geo.kind]);

  useEffect(() => load(), [load]);

  const camps: CampWithDistance[] = data.kind === 'ready' ? data.data.camps : [];
  const counts = data.kind === 'ready' ? data.data.counts : null;
  const meta = data.kind === 'ready' ? data.data.meta : null;
  const usedFallback = meta?.usedFallback ?? !hasRealLocation;

  const points: MapPoint[] = useMemo(
    () => camps.map((c) => ({ id: c.id, lon: c.lon, lat: c.lat, title: c.name })),
    [camps],
  );

  const selected = camps.find((c) => c.id === selectedId) ?? null;
  const center = origin;

  const indutyCount = (key: string) => counts?.induty.find((c) => c.key === key)?.count ?? 0;
  const lctCount = (key: string) => counts?.lct.find((c) => c.key === key)?.count ?? 0;

  return (
    <div className="flex h-dvh flex-col">
      {/* 상단 바 */}
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 text-sm font-bold">
          <Tent className="size-4 text-primary" />
          캠핑나우
        </Link>
        {meta && (
          <span className="text-[11px] text-muted-foreground">
            전국 {meta.total.toLocaleString()}곳
          </span>
        )}
      </header>

      {/* 필터: 업종·입지 칩(가로 스크롤) + 반려동물·연중 토글 */}
      <div className="space-y-1.5 border-b border-border px-4 py-2">
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

      {/* 지도 첫 화면: 데스크톱은 좌우 분할(지도 우측 넓게), 모바일은 지도 위/리스트 아래 */}
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col sm:flex-row-reverse">
        {/* 지도 */}
        <div className="relative h-[42dvh] w-full shrink-0 sm:h-auto sm:flex-1">
          {(data.kind === 'ready' || (data.kind === 'loading' && camps.length > 0)) && (
            <CampsMap
              points={points}
              center={center}
              isUserLocation={hasRealLocation}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
          {data.kind === 'loading' && camps.length === 0 && (
            <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {geo.kind === 'locating' ? '내 위치 확인 중…' : '캠핑장 불러오는 중…'}
            </div>
          )}
          {data.kind === 'error' && (
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
            <span className="font-medium text-foreground">주변 캠핑장</span>
            {data.kind === 'ready' && (
              <span>
                {camps.length}곳{hasRealLocation ? ' · 가까운 순' : ' · 서울 기준'}
              </span>
            )}
          </div>

          {/* 잘림 안내: matched > returned 면 "가장 가까운 N곳만" 임을 정직하게 알린다. */}
          {data.kind === 'ready' && meta?.truncated && (
            <p className="px-4 pb-1 text-[11px] text-muted-foreground">
              조건에 맞는 {meta.matched.toLocaleString()}곳 중 가까운 {camps.length}곳
            </p>
          )}

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
            {data.kind === 'ready' && camps.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Tent className="size-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">
                  {hasAnyFilter(filters)
                    ? '이 조건에 맞는 캠핑장이 주변에 없습니다.'
                    : '주변에 캠핑장이 없습니다.'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {hasAnyFilter(filters) ? '필터를 줄이거나 초기화해 보세요.' : '지도를 움직여 보세요.'}
                </p>
              </div>
            )}
            {camps.map((c) => (
              <CampCard
                key={c.id}
                camp={c}
                usedFallback={usedFallback}
                selected={c.id === selectedId}
                onSelect={() => setSelectedId(c.id)}
              />
            ))}
            {data.kind === 'loading' &&
              camps.length === 0 &&
              geo.kind !== 'locating' &&
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[92px] animate-pulse rounded-xl bg-muted" />
              ))}
          </div>

          {/* 좌표 없는 캠핑장 정직 고지(지도에 못 찍음). 실측 좌표 채움률 99.7%라 극소수. */}
          {data.kind === 'ready' && meta && meta.noCoords > 0 && (
            <p className="border-t border-border px-4 py-1.5 text-[11px] text-muted-foreground">
              좌표가 제공되지 않아 지도에 표시하지 못한 캠핑장 {meta.noCoords}곳은 목록에서 제외됩니다.
            </p>
          )}
        </div>
      </div>

      {/* 상세 시트 */}
      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-20 sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[26rem]">
          <CampDetail camp={selected} usedFallback={usedFallback} onClose={() => setSelectedId(null)} />
        </div>
      )}
    </div>
  );
}

/* ── 작은 UI 조각들 ───────────────────────────────────────────── */

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
