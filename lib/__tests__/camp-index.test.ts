import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toIndexItem } from '../camp-index';
import type { Camp } from '../camps';
import { INDUTY_COLOR, OTHER_INDUTY_COLOR } from '../facets';

function camp(over: Partial<Camp>): Camp {
  return {
    id: '1',
    name: '테스트 캠핑장',
    lineIntro: null,
    addr: null,
    region: '경기도 연천군',
    sido: null,
    lat: 37.5,
    lon: 127,
    tel: null,
    image: null,
    induty: [],
    lct: [],
    animal: 'unknown',
    seasons: [],
    yearRound: false,
    sbrs: [],
    homepage: null,
    resveUrl: null,
    resve: [],
    ...over,
  };
}

describe('toIndexItem — 전송용 최소 필드로 깎기 + 대표 업종 색 계산', () => {
  it('id·name·region·lat·lon 을 그대로 옮긴다', () => {
    const item = toIndexItem(camp({ id: 'abc', name: '별빛캠핑장', lat: 35.1, lon: 128.2 }));
    assert.equal(item.id, 'abc');
    assert.equal(item.name, '별빛캠핑장');
    assert.equal(item.region, '경기도 연천군');
    assert.equal(item.lat, 35.1);
    assert.equal(item.lon, 128.2);
  });

  it('color 는 indutyColorFor 와 동일 규칙(글램핑 우선)', () => {
    const item = toIndexItem(camp({ induty: ['일반야영장', '글램핑'] }));
    assert.equal(item.color, INDUTY_COLOR.glamping);
  });

  it('업종 정보가 없으면 중립색(OTHER_INDUTY_COLOR)', () => {
    const item = toIndexItem(camp({ induty: [] }));
    assert.equal(item.color, OTHER_INDUTY_COLOR);
  });

  it('color 는 hex 7자(#rrggbb) — 페이로드를 작게 유지', () => {
    const item = toIndexItem(camp({ induty: ['카라반'] }));
    assert.match(item.color, /^#[0-9a-f]{6}$/);
  });
});
