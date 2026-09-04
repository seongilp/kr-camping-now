import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCatalog } from '../gocamping-cache';
import type { CampRaw } from '../camps';

const base: CampRaw = {
  contentId: '1648',
  facltNm: '조각가 박시동 미술관',
  mapX: '127.12',
  mapY: '36.45',
};

describe('buildCatalog', () => {
  it('명시 제외 목록의 contentId 는 카탈로그에서 빠지고 noCoords 로도 세지 않는다', () => {
    const raws: CampRaw[] = [
      base,
      { ...base, contentId: '101213', facltNm: '스마트락(주)' }, // 제외 대상
    ];
    const catalog = buildCatalog(raws);
    assert.equal(catalog.camps.length, 1);
    assert.equal(catalog.camps[0]?.id, '1648');
    assert.equal(catalog.noCoords, 0);
  });
});
