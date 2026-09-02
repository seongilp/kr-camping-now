'use client';

import { useEffect, useState } from 'react';
import {
  CalendarDays,
  Dog,
  ExternalLink,
  ListChecks,
  MapPin,
  Phone,
  Tent,
  X,
} from 'lucide-react';

import type { CampWithDistance } from '@/lib/types';

/** 사진 갤러리 로딩 상태(무한 로딩 금지, 실패/없음/성공을 구분). */
type Gallery =
  | { kind: 'loading' }
  | { kind: 'ready'; images: string[] }
  | { kind: 'unavailable' };

/**
 * 캠핑장 상세 시트. 카탈로그에 이미 담긴 필드는 그대로 보여 주고(추가 호출 없음), 사진 갤러리만
 * imageList 로 lazy 로딩한다(쿼터 분산).
 *
 * 채움률 낮은 필드(예약링크 46%·체험 11%)도 **값이 있으면** 보여 준다 — 필터에선 뺐지만 상세에는
 * 정직하게 노출. 값이 없으면 그 줄 자체를 그리지 않는다(빈 항목을 만들지 않는다).
 */
export function CampDetail({
  camp,
  usedFallback,
  onClose,
}: {
  camp: CampWithDistance;
  usedFallback: boolean;
  onClose: () => void;
}) {
  const [gallery, setGallery] = useState<Gallery>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    setGallery({ kind: 'loading' });
    fetch(`/api/camps/${camp.id}/images`)
      .then((r) => r.json() as Promise<{ images: string[]; unavailable: boolean }>)
      .then((j) => {
        if (!alive) return;
        setGallery(j.unavailable ? { kind: 'unavailable' } : { kind: 'ready', images: j.images });
      })
      .catch(() => alive && setGallery({ kind: 'unavailable' }));
    return () => {
      alive = false;
    };
  }, [camp.id]);

  const animalLabel =
    camp.animal === 'small'
      ? '소형견 동반 가능'
      : camp.animal === 'yes'
        ? '반려동물 동반 가능'
        : camp.animal === 'no'
          ? '반려동물 동반 불가'
          : null;

  // 대표사진을 갤러리 앞에 세우고, 갤러리에 중복이면 제거.
  const galleryImages =
    gallery.kind === 'ready'
      ? [camp.image, ...gallery.images].filter((u, i, a): u is string => !!u && a.indexOf(u) === i)
      : camp.image
        ? [camp.image]
        : [];

  return (
    <div className="max-h-[80dvh] overflow-y-auto rounded-t-2xl border border-border bg-card shadow-2xl sm:max-h-[75dvh] sm:rounded-2xl">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold">{camp.name}</h2>
          {camp.region && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              {camp.region}
              {!usedFallback && <span className="text-primary"> · {camp.distanceKm}km</span>}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="space-y-4 px-4 py-4">
        {/* 사진 갤러리(가로 스크롤). loading/없음/실패를 구분. */}
        {galleryImages.length > 0 && (
          <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1">
            {galleryImages.slice(0, 12).map((src) => (
              // eslint-disable-next-line @next/next/no-img-element -- 외부 CDN, next/image 불필요
              <img
                key={src}
                src={src}
                alt=""
                loading="lazy"
                className="h-40 w-60 shrink-0 rounded-lg object-cover"
              />
            ))}
          </div>
        )}
        {galleryImages.length === 0 && gallery.kind === 'loading' && (
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        )}
        {galleryImages.length === 0 && gallery.kind === 'ready' && (
          <div className="flex h-24 items-center justify-center gap-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
            <Tent className="size-4" />
            등록된 사진이 없습니다
          </div>
        )}
        {galleryImages.length === 0 && gallery.kind === 'unavailable' && (
          <div className="flex h-24 items-center justify-center rounded-lg bg-muted/50 text-xs text-muted-foreground">
            사진을 불러오지 못했습니다
          </div>
        )}

        {/* 한 줄 소개 */}
        {camp.lineIntro && <p className="text-sm leading-relaxed">{camp.lineIntro}</p>}

        {/* 패싯 배지 */}
        <div className="flex flex-wrap gap-1.5">
          {camp.induty.map((t) => (
            <span
              key={`i-${t}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
            >
              <Tent className="size-3" />
              {t}
            </span>
          ))}
          {camp.lct.map((t) => (
            <span
              key={`l-${t}`}
              className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
            >
              {t}
            </span>
          ))}
          {animalLabel && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                camp.animal === 'no'
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-emerald-500/15 text-emerald-400'
              }`}
            >
              <Dog className="size-3" />
              {animalLabel}
            </span>
          )}
        </div>

        {/* 운영 계절 */}
        {camp.seasons.length > 0 && (
          <Row icon={<CalendarDays className="size-4" />} label="운영">
            {camp.yearRound ? '연중(사계절)' : camp.seasons.join(' · ')}
          </Row>
        )}

        {/* 부대시설 */}
        {camp.sbrs.length > 0 && (
          <Row icon={<ListChecks className="size-4" />} label="부대시설">
            {camp.sbrs.join(' · ')}
          </Row>
        )}

        {/* 예약 방식 */}
        {camp.resve.length > 0 && (
          <Row icon={<CalendarDays className="size-4" />} label="예약">
            {camp.resve.join(' · ')}
          </Row>
        )}

        {/* 주소 */}
        {camp.addr && (
          <Row icon={<MapPin className="size-4" />} label="주소">
            {camp.addr}
          </Row>
        )}

        {/* 전화 */}
        {camp.tel && (
          <Row icon={<Phone className="size-4" />} label="전화">
            <a href={`tel:${camp.tel}`} className="text-primary hover:underline">
              {camp.tel}
            </a>
          </Row>
        )}

        {/* 링크: 예약/홈페이지 + 길찾기 */}
        <div className="flex flex-wrap gap-2 pt-1">
          {camp.resveUrl && (
            <LinkBtn href={camp.resveUrl} primary>
              예약하기
            </LinkBtn>
          )}
          {camp.homepage && camp.homepage !== camp.resveUrl && (
            <LinkBtn href={camp.homepage}>홈페이지</LinkBtn>
          )}
          <LinkBtn
            href={`https://map.kakao.com/link/to/${encodeURIComponent(camp.name)},${camp.lat},${camp.lon}`}
          >
            길찾기
          </LinkBtn>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <span className="mr-2 text-xs font-medium text-muted-foreground">{label}</span>
        <span className="break-words">{children}</span>
      </div>
    </div>
  );
}

function LinkBtn({
  href,
  children,
  primary,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        primary
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'border border-border hover:bg-accent'
      }`}
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}
