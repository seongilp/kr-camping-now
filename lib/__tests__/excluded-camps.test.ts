import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EXCLUDED_CAMP_IDS, isExcludedCamp } from '../excluded-camps';

describe('isExcludedCamp', () => {
  it('명시된 제외 contentId 는 true', () => {
    assert.equal(isExcludedCamp('101213'), true);
    assert.equal(isExcludedCamp('101154'), true);
    assert.equal(isExcludedCamp('100614'), true);
  });

  it('제외 목록에 없는 contentId 는 false', () => {
    assert.equal(isExcludedCamp('100001'), false);
    assert.equal(isExcludedCamp(''), false);
  });

  it('EXCLUDED_CAMP_IDS 는 정확히 3건', () => {
    assert.equal(EXCLUDED_CAMP_IDS.size, 3);
  });
});
