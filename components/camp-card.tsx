'use client';

import { Dog, MapPin, Sun, Tent } from 'lucide-react';

import type { CampWithDistance } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * 캠핑장 카드. 대표사진(75% 채움) + 이름 + 지역 + 거리 + 패싯 배지.
 * 사진이 없으면(25%) 텐트 아이콘 플레이스홀더 — 깨진 이미지 대신.
 *
 * 배지는 실측 채움률 높은 것만: 업종(induty)·입지(lct)·반려동물·연중. 값이 있는 것만 그린다
 * (없는 걸 "없음" 배지로 채우지 않는다 — 정직성).
 */
export function CampCard({
  camp,
  showDistance,
  selected,
  onSelect,
}: {
  camp: CampWithDistance;
  /** 거리(km)를 보여줄지. 실제 내 위치 기준일 때만 true(영역·폴백·시도 기준 거리는 오해 소지). */
  showDistance: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const animalLabel =
    camp.animal === 'small' ? '소형견 동반' : camp.animal === 'yes' ? '반려동물 동반' : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full gap-3 rounded-xl border p-2.5 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/10'
          : 'border-border bg-card hover:border-primary/40 hover:bg-accent',
      )}
    >
      {/* 썸네일 */}
      <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
        {camp.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- 외부 CDN 썸네일, next/image 불필요
          <img
            src={camp.image}
            alt=""
            loading="lazy"
            className="size-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
            }}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground/40">
            <Tent className="size-7" />
          </div>
        )}
      </div>

      {/* 본문 */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-sm font-semibold">{camp.name}</h3>
          <span className="shrink-0 text-xs font-medium text-primary">
            {showDistance ? `${camp.distanceKm}km` : ''}
          </span>
        </div>

        {camp.region && (
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            {camp.region}
          </p>
        )}

        <div className="mt-0.5 flex flex-wrap gap-1">
          {camp.induty.slice(0, 2).map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary"
            >
              <Tent className="size-2.5" />
              {t}
            </span>
          ))}
          {camp.lct.slice(0, 2).map((t) => (
            <span
              key={t}
              className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground"
            >
              {t}
            </span>
          ))}
          {animalLabel && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
              <Dog className="size-2.5" />
              {animalLabel}
            </span>
          )}
          {camp.yearRound && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
              <Sun className="size-2.5" />
              연중
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
