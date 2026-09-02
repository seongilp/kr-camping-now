import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EMPTY_FILTERS,
  INDUTY_COLOR,
  hasAnyFilter,
  indutyColorFor,
  matchesFilters,
  primaryInduty,
  type Filters,
} from '../facets';
import type { Camp } from '../camps';

function camp(over: Partial<Camp>): Camp {
  return {
    id: '1',
    name: '테스트 캠핑장',
    lineIntro: null,
    addr: null,
    region: null,
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

const f = (over: Partial<Filters>): Filters => ({ ...EMPTY_FILTERS, ...over });

describe('matchesFilters — 축 사이는 AND', () => {
  it('빈 필터는 전부 통과', () => {
    assert.equal(matchesFilters(camp({}), EMPTY_FILTERS), true);
  });

  it('업종: 오토캠핑 필터는 원문 "자동차야영장" 에 매치', () => {
    assert.equal(matchesFilters(camp({ induty: ['자동차야영장'] }), f({ induty: 'auto' })), true);
    assert.equal(matchesFilters(camp({ induty: ['일반야영장'] }), f({ induty: 'auto' })), false);
  });

  it('업종: 콤바인(일반+글램핑)에서 글램핑 매치', () => {
    assert.equal(
      matchesFilters(camp({ induty: ['일반야영장', '글램핑'] }), f({ induty: 'glamping' })),
      true,
    );
  });

  it('입지: 해변 매치', () => {
    assert.equal(matchesFilters(camp({ lct: ['해변'] }), f({ lct: 'beach' })), true);
    assert.equal(matchesFilters(camp({ lct: ['산', '숲'] }), f({ lct: 'beach' })), false);
  });

  it('반려동물: 가능/소형견은 통과, 불가/정보없음은 제외', () => {
    assert.equal(matchesFilters(camp({ animal: 'yes' }), f({ animalOnly: true })), true);
    assert.equal(matchesFilters(camp({ animal: 'small' }), f({ animalOnly: true })), true);
    assert.equal(matchesFilters(camp({ animal: 'no' }), f({ animalOnly: true })), false);
    assert.equal(matchesFilters(camp({ animal: 'unknown' }), f({ animalOnly: true })), false);
  });

  it('연중: yearRound 만 통과', () => {
    assert.equal(matchesFilters(camp({ yearRound: true }), f({ yearRoundOnly: true })), true);
    assert.equal(matchesFilters(camp({ yearRound: false }), f({ yearRoundOnly: true })), false);
  });

  it('시도: 정규화 key 완전일치', () => {
    assert.equal(matchesFilters(camp({ sido: 'gangwon' }), f({ sido: 'gangwon' })), true);
    assert.equal(matchesFilters(camp({ sido: 'gyeonggi' }), f({ sido: 'gangwon' })), false);
    assert.equal(matchesFilters(camp({ sido: null }), f({ sido: 'gangwon' })), false);
  });

  it('여러 축 AND: 글램핑 + 해변 + 반려동물 모두 만족해야 통과', () => {
    const both = camp({ induty: ['글램핑'], lct: ['해변'], animal: 'yes' });
    const filters = f({ induty: 'glamping', lct: 'beach', animalOnly: true });
    assert.equal(matchesFilters(both, filters), true);
    // 입지만 다르면 탈락
    assert.equal(matchesFilters(camp({ induty: ['글램핑'], lct: ['산'], animal: 'yes' }), filters), false);
  });
});

describe('primaryInduty — 대표 업종 우선순위(글램핑>카라반>오토>일반)', () => {
  it('단일 업종은 그대로', () => {
    assert.equal(primaryInduty(['글램핑']), 'glamping');
    assert.equal(primaryInduty(['자동차야영장']), 'auto');
    assert.equal(primaryInduty(['일반야영장']), 'general');
  });
  it('복수 업종은 우선순위 앞선 것(희소한 특징이 이긴다)', () => {
    assert.equal(primaryInduty(['일반야영장', '카라반']), 'caravan'); // 카라반 > 일반
    assert.equal(primaryInduty(['일반야영장', '글램핑']), 'glamping'); // 글램핑 > 일반
    assert.equal(primaryInduty(['카라반', '글램핑']), 'glamping'); // 글램핑 > 카라반
    assert.equal(primaryInduty(['일반야영장', '자동차야영장']), 'auto'); // 오토 > 일반
  });
  it('업종 없으면 null → 중립색', () => {
    assert.equal(primaryInduty([]), null);
    assert.equal(indutyColorFor([]), INDUTY_COLOR.general);
  });
  it('indutyColorFor 는 대표 업종 색을 준다', () => {
    assert.equal(indutyColorFor(['일반야영장', '글램핑']), INDUTY_COLOR.glamping);
  });
});

describe('hasAnyFilter', () => {
  it('빈 필터는 false', () => {
    assert.equal(hasAnyFilter(EMPTY_FILTERS), false);
  });
  it('하나라도 켜지면 true', () => {
    assert.equal(hasAnyFilter(f({ induty: 'auto' })), true);
    assert.equal(hasAnyFilter(f({ animalOnly: true })), true);
  });
});
