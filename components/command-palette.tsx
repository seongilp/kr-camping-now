'use client';

import { Command } from 'cmdk';
import { useEffect, useMemo, useState } from 'react';
import { Dog, Loader2, MapPin, Search, Sun, Tent } from 'lucide-react';

import { INDUTY_OPTIONS, LCT_OPTIONS, SIDO_OPTIONS, type Filters } from '@/lib/facets';
import type { CampIndexItem } from '@/lib/types';

/**
 * 커맨드 팔레트(⌘K / Ctrl+K). shadcn 이 쓰는 것과 같은 `cmdk` 라이브러리를 그대로 쓴다
 * (검색 필터·키보드 내비·ARIA 는 cmdk 가 담당). 감싸는 모달 오버레이만 직접 그린다 —
 * cmdk 의 Command.Dialog 는 Radix 에 의존하는데 이 앱은 base-ui 계열이라 의존성 충돌을 피한다.
 *
 * 두 가지를 한다:
 *  1) 캠핑장 이름 검색(전국 ≈3,099곳). 검색은 **클라이언트에서** 인덱스로만 — 키 입력마다
 *     서버를 때리지 않는다. 대용량 대비로 shouldFilter=false + 직접 부분일치 후 상위 N개만 렌더.
 *  2) 필터 토글(업종·입지·반려동물·연중). 부모의 filters 상태를 그대로 바꾼다(팔레트/사이드바가
 *     같은 상태를 공유 — 두 벌로 갈라지지 않게).
 */

const MAX_RESULTS = 40; // 3,099곳을 다 렌더하면 무겁다. 부분일치 상위 N개만.

export function CommandPalette({
  open,
  onClose,
  index,
  indexLoading,
  filters,
  setFilters,
  onToggleSido,
  onSelectCamp,
}: {
  open: boolean;
  onClose: () => void;
  index: CampIndexItem[] | null;
  indexLoading: boolean;
  filters: Filters;
  setFilters: (updater: (f: Filters) => Filters) => void;
  /** 시도 토글은 지도 이동·영역 해제 부수효과가 있어 부모 핸들러를 공유한다(상태 갈라짐 방지). */
  onToggleSido: (key: string) => void;
  onSelectCamp: (id: string) => void;
}) {
  const [query, setQuery] = useState('');

  // 열릴 때마다 검색어 초기화(직전 검색이 남아 있지 않게).
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!index || !q) return [];
    // 부분일치(한글은 String.includes 로 그대로 된다). 이름 우선, 지역도 보조로.
    const hits: CampIndexItem[] = [];
    for (const c of index) {
      if (c.name.toLowerCase().includes(q) || (c.region ?? '').toLowerCase().includes(q)) {
        hits.push(c);
        if (hits.length >= MAX_RESULTS) break;
      }
    }
    return hits;
  }, [index, q]);

  if (!open) return null;

  const toggleInduty = (key: string) =>
    setFilters((f) => ({ ...f, induty: f.induty === key ? null : key }));
  const toggleLct = (key: string) => setFilters((f) => ({ ...f, lct: f.lct === key ? null : key }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command
          shouldFilter={false}
          label="캠핑장 검색 및 필터"
          onKeyDown={(e) => {
            // ESC: 검색어가 있으면 지우고, 없으면 팔레트를 닫는다(팔레트가 상세보다 위).
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              if (query) setQuery('');
              else onClose();
            }
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="캠핑장 이름·지역 검색, 또는 필터 선택…"
              className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-1.5">
            {indexLoading && !index && (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                전국 캠핑장 목록 불러오는 중…
              </div>
            )}

            {q && (
              <Command.Empty className="py-6 text-center text-xs text-muted-foreground">
                “{query}”에 맞는 캠핑장이 없습니다
              </Command.Empty>
            )}

            {/* 필터 토글: 검색어 없을 때만 노출(검색 중엔 캠핑장 결과에 집중) */}
            {!q && (
              <Command.Group
                heading="필터"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {INDUTY_OPTIONS.map((o) => (
                  <Item
                    key={`i-${o.key}`}
                    active={filters.induty === o.key}
                    icon={<Tent className="size-4" />}
                    onSelect={() => toggleInduty(o.key)}
                  >
                    업종 · {o.label}
                  </Item>
                ))}
                {LCT_OPTIONS.map((o) => (
                  <Item
                    key={`l-${o.key}`}
                    active={filters.lct === o.key}
                    icon={<MapPin className="size-4" />}
                    onSelect={() => toggleLct(o.key)}
                  >
                    입지 · {o.label}
                  </Item>
                ))}
                <Item
                  active={filters.animalOnly}
                  icon={<Dog className="size-4" />}
                  onSelect={() => setFilters((f) => ({ ...f, animalOnly: !f.animalOnly }))}
                >
                  반려동물 동반 가능만
                </Item>
                <Item
                  active={filters.yearRoundOnly}
                  icon={<Sun className="size-4" />}
                  onSelect={() => setFilters((f) => ({ ...f, yearRoundOnly: !f.yearRoundOnly }))}
                >
                  연중(사계절) 운영만
                </Item>
                {SIDO_OPTIONS.map((o) => (
                  <Item
                    key={`s-${o.key}`}
                    active={filters.sido === o.key}
                    icon={<MapPin className="size-4" />}
                    onSelect={() => onToggleSido(o.key)}
                  >
                    지역 · {o.label}
                  </Item>
                ))}
              </Command.Group>
            )}

            {/* 캠핑장 이름 검색 결과 */}
            {q && results.length > 0 && (
              <Command.Group
                heading={`캠핑장 ${results.length}곳${results.length >= MAX_RESULTS ? '+' : ''}`}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {results.map((c) => (
                  <Item
                    key={c.id}
                    value={`${c.id}-${c.name}`}
                    icon={<Tent className="size-4" />}
                    onSelect={() => onSelectCamp(c.id)}
                  >
                    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                      <span className="truncate">{c.name}</span>
                      {c.region && (
                        <span className="shrink-0 text-[11px] text-muted-foreground">{c.region}</span>
                      )}
                    </span>
                  </Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

function Item({
  active,
  icon,
  onSelect,
  value,
  children,
}: {
  active?: boolean;
  icon: React.ReactNode;
  onSelect: () => void;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
    >
      <span className={active ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
      {active && <span className="shrink-0 text-[11px] font-medium text-primary">적용됨</span>}
    </Command.Item>
  );
}
