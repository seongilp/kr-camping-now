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
 * 서버가 이미 가까운 ≤200건만 내려주므로(공간 필터) 클러스터링 없이 개별 마커로 찍는다.
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

/** 지도 이동 목적지(프로그램 이동). key 가 바뀔 때만 실제로 이동한다(사용자 조작과 안 싸우게). */
export interface FlyTarget {
  lat: number;
  lon: number;
  zoom: number;
  key: number;
}

export function CampsMap({
  points,
  center,
  isUserLocation,
  selectedId,
  onSelect,
  onUserMoveEnd,
  flyTo,
}: {
  points: MapPoint[];
  /** 지도 초기 중심. 실제 위치면 그 좌표, 폴백이면 서울. 항상 여기로 맞춘다(전국 축소 뷰 금지). */
  center: LatLon;
  /** center 가 사용자의 실제 위치인가. true 일 때만 파란 '내 위치' 점을 찍는다(폴백은 안 찍음). */
  isUserLocation: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
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
  const onUserMoveEndRef = useRef(onUserMoveEnd);
  const pointsRef = useRef(points);
  const centerRef = useRef(center);
  const flyKeyRef = useRef<number | null>(null);
  // 프로그램 이동(easeTo)이 유발한 moveend 를 사용자 조작으로 오인하지 않도록 잠깐 무시.
  const programMoveRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => void (onSelectRef.current = onSelect), [onSelect]);
  useEffect(() => void (onUserMoveEndRef.current = onUserMoveEnd), [onUserMoveEnd]);
  useEffect(() => void (pointsRef.current = points), [points]);
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
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 5, 15, 9],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.95,
          // 어두운 베이스맵에서 각 색이 서로·배경과 분리되도록 진한 테두리.
          'circle-stroke-color': '#0b0f19',
          'circle-stroke-width': 1.5,
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
    });

    for (const layer of ['camp-point', 'camp-label']) {
      map.on('click', layer, (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) onSelectRef.current(id);
      });
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
