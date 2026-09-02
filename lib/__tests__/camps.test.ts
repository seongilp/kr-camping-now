import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cleanText,
  itemsOf,
  normalize,
  normalizeSido,
  parseAnimal,
  parseApiError,
  splitList,
  totalOf,
  type CampRaw,
} from '../camps';

describe('parseApiError — 정상/에러 최상위 구조가 통째로 다르다(F-9), 세 구조를 본다', () => {
  it('정상(resultCode 0000)은 null', () => {
    assert.equal(
      parseApiError({ response: { header: { resultCode: '0000', resultMsg: 'OK' } } }),
      null,
    );
  });
  it('cmmMsgHeader(키/쿼터 계열)를 잡는다 — 200 이어도 실패', () => {
    const json = {
      OpenAPI_ServiceResponse: {
        cmmMsgHeader: { returnReasonCode: '30', errMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' },
      },
    };
    assert.deepEqual(parseApiError(json), {
      code: '30',
      msg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR',
    });
  });
  it('쿼터 초과(22)도 cmmMsgHeader 로 온다', () => {
    const json = {
      OpenAPI_ServiceResponse: {
        cmmMsgHeader: {
          returnReasonCode: '22',
          errMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR',
        },
      },
    };
    assert.equal(parseApiError(json)?.code, '22');
  });
  it('response.header 의 비-0000 도 에러로(파라미터 오류 등)', () => {
    const json = { response: { header: { resultCode: '10', resultMsg: 'INVALID' } } };
    assert.deepEqual(parseApiError(json), { code: '10', msg: 'INVALID' });
  });
  it('평면 파라미터 에러(basedSyncList&syncType=u 실측)도 잡는다', () => {
    // 실측: {"responseTime":"...","resultCode":"10","resultMsg":"INVALID_REQUEST_PARAMETER_ERROR(syncType)"}
    const json = {
      responseTime: '2026-09-02T14:12:08.330',
      resultCode: '10',
      resultMsg: 'INVALID_REQUEST_PARAMETER_ERROR(syncType)',
    };
    assert.equal(parseApiError(json)?.code, '10');
  });
  it('평면 구조라도 resultCode 0000 이면 정상(null)', () => {
    assert.equal(parseApiError({ resultCode: '0000', resultMsg: 'OK' }), null);
  });
});

describe('itemsOf / totalOf — 정상 구조에서 배열·건수 추출', () => {
  it('0건(items 없음/빈문자)은 빈 배열', () => {
    assert.deepEqual(itemsOf({ response: { body: { items: '', totalCount: 0 } } }), []);
    assert.deepEqual(itemsOf({ response: { body: {} } }), []);
  });
  it('단일 객체(item 하나)도 배열로 감싼다', () => {
    assert.equal(itemsOf({ response: { body: { items: { item: { contentId: '1' } } } } }).length, 1);
  });
  it('배열은 그대로', () => {
    const many = itemsOf({
      response: { body: { items: { item: [{ contentId: '1' }, { contentId: '2' }] } } },
    });
    assert.equal(many.length, 2);
  });
  it('에러 구조가 들어와도 crash 아니라 빈 배열', () => {
    assert.deepEqual(itemsOf({ OpenAPI_ServiceResponse: { cmmMsgHeader: {} } }), []);
  });
  it('totalCount 를 읽는다', () => {
    assert.equal(totalOf({ response: { body: { totalCount: 3109 } } }), 3109);
    assert.equal(totalOf({}), 0);
  });
});

describe('splitList — 콤마로 나눈 목록형 필드', () => {
  it('콤마 분해 + 공백 제거', () => {
    assert.deepEqual(splitList('일반야영장,글램핑'), ['일반야영장', '글램핑']);
    assert.deepEqual(splitList('산, 숲 , 계곡'), ['산', '숲', '계곡']);
  });
  it('빈 값은 빈 배열', () => {
    assert.deepEqual(splitList(''), []);
    assert.deepEqual(splitList(undefined), []);
  });
});

describe('parseAnimal — 반려동물 정책(정보 없음과 불가를 구분)', () => {
  it('가능/소형견/불가/없음', () => {
    assert.equal(parseAnimal('가능'), 'yes');
    assert.equal(parseAnimal('가능(소형견)'), 'small');
    assert.equal(parseAnimal('불가능'), 'no');
    assert.equal(parseAnimal(''), 'unknown');
    assert.equal(parseAnimal(undefined), 'unknown');
  });
});

describe('normalizeSido — 행정구역 개편으로 갈라진 표기를 하나로 합친다(실측 18종)', () => {
  it('강원도 + 강원특별자치도 → gangwon (합치지 않으면 215곳이 샌다)', () => {
    assert.equal(normalizeSido('강원도'), 'gangwon');
    assert.equal(normalizeSido('강원특별자치도'), 'gangwon');
  });
  it('전라북도 + 전북특별자치도 → jeonbuk', () => {
    assert.equal(normalizeSido('전라북도'), 'jeonbuk');
    assert.equal(normalizeSido('전북특별자치도'), 'jeonbuk');
  });
  it('전남광주통합특별시 → jeonnam (묶음 값, 일반 광주/전남 규칙보다 먼저 잡힌다)', () => {
    assert.equal(normalizeSido('전남광주통합특별시'), 'jeonnam');
  });
  it('광역시/특별시/도 표기를 표준 key 로', () => {
    assert.equal(normalizeSido('경기도'), 'gyeonggi');
    assert.equal(normalizeSido('경상남도'), 'gyeongnam');
    assert.equal(normalizeSido('경상북도'), 'gyeongbuk');
    assert.equal(normalizeSido('충청남도'), 'chungnam');
    assert.equal(normalizeSido('충청북도'), 'chungbuk');
    assert.equal(normalizeSido('인천광역시'), 'incheon');
    assert.equal(normalizeSido('제주특별자치도'), 'jeju');
    assert.equal(normalizeSido('세종특별자치시'), 'sejong');
    assert.equal(normalizeSido('서울특별시'), 'seoul');
  });
  it('빈값은 null', () => {
    assert.equal(normalizeSido(''), null);
    assert.equal(normalizeSido(undefined), null);
  });
});

describe('cleanText — HTML 태그·공백 정리', () => {
  it('태그를 벗기고 공백을 정리한다', () => {
    assert.equal(cleanText('<p>숲속  캠핑</p>'), '숲속 캠핑');
  });
  it('빈 값은 null', () => {
    assert.equal(cleanText(''), null);
    assert.equal(cleanText('<br/>'), null);
  });
});

describe('normalize — 좌표 없거나 한국 밖이면 null(지도에 못 찍음)', () => {
  const base: CampRaw = {
    contentId: '1648',
    facltNm: '조각가 박시동 미술관',
    mapX: '127.12',
    mapY: '36.45',
    induty: '일반야영장,글램핑',
    lctCl: '산,숲',
    animalCmgCl: '가능(소형견)',
    operPdCl: '봄,여름,가을,겨울',
    sbrsCl: '전기,온수',
    doNm: '충청남도',
    sigunguNm: '공주시',
  };

  it('정상 item 을 정규화한다', () => {
    const c = normalize(base)!;
    assert.equal(c.id, '1648');
    assert.deepEqual(c.induty, ['일반야영장', '글램핑']);
    assert.deepEqual(c.lct, ['산', '숲']);
    assert.equal(c.animal, 'small');
    assert.equal(c.yearRound, true); // 사계절
    assert.equal(c.region, '충청남도 공주시');
  });
  it('사계절이 아니면 yearRound=false', () => {
    const c = normalize({ ...base, operPdCl: '봄,여름,가을' })!;
    assert.equal(c.yearRound, false);
    assert.deepEqual(c.seasons, ['봄', '여름', '가을']);
  });
  it('좌표 없으면 null', () => {
    assert.equal(normalize({ ...base, mapX: '', mapY: '' }), null);
  });
  it('한국 밖(경도/위도 스왑 등)이면 null', () => {
    assert.equal(normalize({ ...base, mapX: '36.45', mapY: '127.12' }), null);
  });
  it('id/이름 없으면 null', () => {
    assert.equal(normalize({ ...base, contentId: '' }), null);
    assert.equal(normalize({ ...base, facltNm: '' }), null);
  });
});
