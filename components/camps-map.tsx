'use client';

import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';

import type { LatLon } from '@/lib/geo';
import type { MapBounds } from '@/lib/types';

import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * 캠핑장 지도. MapLibre **v5** — v6 는 Turbopack 에서 워커 로딩이 실패해 지도가 조용히 안 뜬다
 * (메모리 기록). 좌표는 WGS84(lon,lat)를 API 가 직접 준다.
 *
 * 두 레이어로 나뉜다:
 *  - **전국 배경층(camps-all)**: 전국 인덱스 전량(≈3,099)을 작고 흐린 원으로 깐다. bounds 조회는
 *    화면 중심 기준 가까운 ≤200건만 내려주므로(lib/geo.ts nearest), 그 배경이 없으면 전국 줌에서
 *    캠핑장이 화면 중심 근처에만 몰려 보이는 착시가 생긴다(실측 버그). 클러스터링은 불필요 —
 *    원 3천 개는 가볍다.
 *  - **근접 강조층(camps)**: 서버가 지금 화면·위치 기준으로 골라준 가까운 ≤200건. 배경층 위에
 *    또렷하게(불투명 + 큰 반경 + 테두리) 그려 "지금 리스트에 있는 곳"을 구분해 준다.
 * 클릭은 근접층을 먼저 잡는다(레이어 배열 순서 = 클릭 우선순위, 나중에 add 된 게 위·먼저 히트).
 * 배경층만 있는 지점을 클릭하면 리스트에 없을 수 있어 onSelectFromAll(단건 조회 합류 경로)로 보낸다.
 *
 * 핀 색은 **대표 업종(primaryInduty)** 색이다(글램핑/카라반/오토캠핑/일반). 색은 각 point.color 로
 * 이미 계산돼 들어온다 — 지도는 그대로 칠하기만 한다(색·우선순위 규칙은 lib/facets 한 곳에).
 */

export interface MapPoint {
  id: string;
  lon: number;
  lat: number;
  title: string;
  /** 대표 업종 색(#hex). lib/facets indutyColorFor 로 계산돼 들어온다. */
  color: string;
}

const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const KOREA_BOUNDS: [[number, number], [number, number]] = [
  [125.9, 33.1],
  [129.6, 38.6],
];
const FIT_PADDING = { top: 40, right: 40, bottom: 40, left: 40 };
const SOURCE = 'camps';

function toGeoJson(points: MapPoint[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { id: p.id, title: p.title, color: p.color },
    })),
  };
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const SOURCE_ALL = 'camps-all';

/** 지도 이동 목적지(프로그램 이동). key 가 바뀔 때만 실제로 이동한다(사용자 조작과 안 싸우게). */
export interface FlyTarget {
  lat: number;
  lon: number;
  zoom: number;
  key: number;
}

export function CampsMap({
  points,
  allPoints,
  center,
  isUserLocation,
  selectedId,
  onSelect,
  onSelectFromAll,
  onUserMoveEnd,
  flyTo,
}: {
  points: MapPoint[];
  /** 전국 배경층. 인덱스 로딩 전·실패 시 null(그동안은 근접 200곳만 보인다 — 기존 동작). */
  allPoints?: MapPoint[] | null;
  /** 지도 초기 중심. 실제 위치면 그 좌표, 폴백이면 서울. 항상 여기로 맞춘다(전국 축소 뷰 금지). */
  center: LatLon;
  /** center 가 사용자의 실제 위치인가. true 일 때만 파란 '내 위치' 점을 찍는다(폴백은 안 찍음). */
  isUserLocation: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 배경층(camps-all) 클릭. 근접 200곳 밖일 수 있어 단건 조회 합류 경로로 보낸다. 없으면 onSelect. */
  onSelectFromAll?: (id: string) => void;
  /** 사용자가 지도를 옮겨 멈췄을 때 그 화면 bounds 를 알린다(프로그램 이동은 제외). 브라우저가 디바운스. */
  onUserMoveEnd?: (b: MapBounds) => void;
  /** 프로그램 이동(⌘K 선택·시도 선택·"가장 가까운" 등). key 가 바뀔 때만 이동. */
  flyTo?: FlyTarget | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const fittedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const onSelectFromAllRef = useRef(onSelectFromAll);
  const onUserMoveEndRef = useRef(onUserMoveEnd);
  const pointsRef = useRef(points);
  const allPointsRef = useRef(allPoints);
  const centerRef = useRef(center);
  const flyKeyRef = useRef<number | null>(null);
  // 프로그램 이동(easeTo)이 유발한 moveend 를 사용자 조작으로 오인하지 않도록 잠깐 무시.
  const programMoveRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => void (onSelectRef.current = onSelect), [onSelect]);
  useEffect(() => void (onSelectFromAllRef.current = onSelectFromAll), [onSelectFromAll]);
  useEffect(() => void (onUserMoveEndRef.current = onUserMoveEnd), [onUserMoveEnd]);
  useEffect(() => void (pointsRef.current = points), [points]);
  useEffect(() => void (allPointsRef.current = allPoints), [allPoints]);
  useEffect(() => void (centerRef.current = center), [center]);

  const readBounds = (map: MapLibreMap): MapBounds => {
    const b = map.getBounds();
    return { minLat: b.getSouth(), maxLat: b.getNorth(), minLon: b.getWest(), maxLon: b.getEast() };
  };

  /* 지도 생성 — 한 번만. */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      bounds: KOREA_BOUNDS,
      fitBoundsOptions: { padding: FIT_PADDING },
      minZoom: 4,
      maxZoom: 18,
      attributionControl: false,
      // CARTO 글리프에 한글이 없어 라벨이 안 보인다. 브라우저 폰트로 그린다.
      localIdeographFontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif",
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      // 전국 배경층 — 먼저 add 해 근접 강조층 '아래'에 깔리게 한다(add 순서 = 렌더 순서).
      map.addSource(SOURCE_ALL, { type: 'geojson', data: toGeoJson(allPointsRef.current ?? []) });
      map.addLayer({
        id: 'camps-all-point',
        type: 'circle',
        source: SOURCE_ALL,
        paint: {
          // 근접층(circle-radius 5~9)보다 뚜렷이 작게 — "여기도 있다"는 배경 정보일 뿐, 강조는 근접층 몫.
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2, 10, 4],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.55,
          // 테두리 없음(근접층과의 시각적 위계 차이를 명확히).
        },
      });

      map.addSource(SOURCE, { type: 'geojson', data: toGeoJson(pointsRef.current) });

      map.addLayer({
        id: 'camp-selected',
        type: 'circle',
        source: SOURCE,
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': 13,
          'circle-color': 'transparent',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
      });
      map.addLayer({
        id: 'camp-point',
        type: 'circle',
        source: SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2.5, 8, 5, 15, 9],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.95,
          // 어두운 베이스맵에서 각 색이 서로·배경과 분리되도록 진한 테두리.
          'circle-stroke-color': '#0b0f19',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 8, 1.5],
        },
      });
      map.addLayer({
        id: 'camp-label',
        type: 'symbol',
        source: SOURCE,
        minzoom: 11,
        layout: {
          'text-field': ['get', 'title'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-max-width': 9,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#e5e7eb',
          'text-halo-color': '#0b0f19',
          'text-halo-width': 1.2,
        },
      });

      loadedRef.current = true;
      map.getSource<maplibregl.GeoJSONSource>(SOURCE)?.setData(toGeoJson(pointsRef.current));
      map.getSource<maplibregl.GeoJSONSource>(SOURCE_ALL)?.setData(toGeoJson(allPointsRef.current ?? []));
    });

    // 클릭 우선순위: 근접 강조층(camp-point/camp-label) 먼저, 없으면 배경층(camps-all-point).
    // 같은 지점에 양쪽 다 있어도(흔함 — 배경층이 근접층 전체를 포함) 근접층이 이긴다.
    map.on('click', (e) => {
      if (!loadedRef.current) return;
      const near = map.queryRenderedFeatures(e.point, { layers: ['camp-point', 'camp-label'] });
      const nearId = near[0]?.properties?.id as string | undefined;
      if (nearId) {
        onSelectRef.current(nearId);
        return;
      }
      const bg = map.queryRenderedFeatures(e.point, { layers: ['camps-all-point'] });
      const bgId = bg[0]?.properties?.id as string | undefined;
      // 근접층 밖의 캠핑장일 수 있으므로 단건 조회 합류 경로로. 안 넘어왔으면 기존 onSelect 로 폴백.
      if (bgId) (onSelectFromAllRef.current ?? onSelectRef.current)(bgId);
    });

    for (const layer of ['camp-point', 'camp-label', 'camps-all-point']) {
      map.on('mouseenter', layer, () => void (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', layer, () => void (map.getCanvas().style.cursor = ''));
    }

    // 사용자가 지도를 옮겨 멈추면(e.originalEvent 有 = 드래그/휠 등 사용자 입력) 그 영역을 알린다.
    // 프로그램 이동(easeTo)이 낸 moveend 는 originalEvent 가 없고 programMoveRef 로도 한 번 더 막는다.
    map.on('moveend', (e) => {
      const userGesture = !!(e as { originalEvent?: unknown }).originalEvent;
      if (!userGesture || programMoveRef.current) {
        programMoveRef.current = false;
        return;
      }
      if (!onUserMoveEndRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // 드래그 관성·연속 조작을 하나로 묶는다(250ms).
      debounceRef.current = setTimeout(() => onUserMoveEndRef.current?.(readBounds(map)), 250);
    });

    // 0x0 으로 생성되면 줌이 굳는다. 실제 크기를 얻은 뒤 한 번 더 맞춘다.
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width < 1 || box.height < 1) return;
      map.resize();
      if (fittedRef.current) return;
      fittedRef.current = true;
      // center 는 항상 있다(실제 위치 또는 서울 폴백). 전국 축소 뷰로 두지 않는다 —
      // 캠핑장이 안 보이는 어두운 빈 지도가 '지도가 안 뜬다'는 오해를 부른다.
      const c = centerRef.current;
      map.easeTo({ center: [c.lon, c.lat], zoom: 11, duration: 0 });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
      fittedRef.current = false;
    };
  }, []);

  /* 프로그램 이동: flyTo.key 가 바뀔 때만 easeTo. 뒤이어 오는 moveend 를 programMoveRef 로 무시해
     "지도가 스스로 움직였는데 그걸 사용자 조작으로 오인해 bounds 조회가 도는" 루프를 막는다. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo || flyKeyRef.current === flyTo.key) return;
    flyKeyRef.current = flyTo.key;
    programMoveRef.current = true;
    fittedRef.current = true; // 초기 fit 로직과 안 겹치게
    map.easeTo({ center: [flyTo.lon, flyTo.lat], zoom: flyTo.zoom, duration: 600 });
  }, [flyTo]);

  /* 포인트 갱신. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map
      .getSource<maplibregl.GeoJSONSource>(SOURCE)
      ?.setData(points.length ? toGeoJson(points) : EMPTY);
  }, [points]);

  /* 전국 배경층 갱신. 인덱스가 로딩 중엔 allPoints 가 null 이라 빈 컬렉션(로딩 전엔 근접층만 보임). */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map
      .getSource<maplibregl.GeoJSONSource>(SOURCE_ALL)
      ?.setData(allPoints?.length ? toGeoJson(allPoints) : EMPTY);
  }, [allPoints]);

  /* 중심 이동 + (실제 위치일 때만) 파란 '내 위치' 점.
     폴백(서울)일 땐 점을 찍지 않는다 — 서울을 '내 위치'인 척하지 않기 위해서다(정직성). */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let marker: maplibregl.Marker | null = null;
    if (isUserLocation) {
      const el = document.createElement('div');
      el.className = 'kr-user-dot';
      marker = new maplibregl.Marker({ element: el })
        .setLngLat([center.lon, center.lat])
        .addTo(map);
    }
    if (loadedRef.current && !fittedRef.current) {
      fittedRef.current = true;
      map.easeTo({ center: [center.lon, center.lat], zoom: 11, duration: 400 });
    }
    return () => void marker?.remove();
  }, [center, isUserLocation]);

  /* 선택 강조 + 화면으로 끌어오기. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map.setFilter('camp-selected', ['==', ['get', 'id'], selectedId ?? '']);
    if (!selectedId) return;
    const hit = pointsRef.current.find((p) => p.id === selectedId);
    if (hit) {
      map.easeTo({ center: [hit.lon, hit.lat], zoom: Math.max(map.getZoom(), 13), duration: 500 });
    }
  }, [selectedId]);

  return <div ref={containerRef} className="size-full" />;
}
