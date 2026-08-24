// 안드로이드 앱링크 검증 파일.
//
// 이 파일 하나가 안 읽히면 앱링크가 통째로 죽는다. 그런데 안 읽혀도 아무 데도
// 티가 안 난다 — 링크를 눌렀을 때 그냥 브라우저가 열릴 뿐이라, 사람들은
// "원래 그런가 보다" 하고 넘어간다.
//
// 실제로 BOM(EF BB BF)이 붙어 있어서 JSON.parse 가 아예 실패하는 상태였다.
// 파일을 눈으로 보면 멀쩡해 보이는데(에디터가 BOM 을 안 보여준다) 파서는 못 읽는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const F = join(ROOT, '.well-known', 'assetlinks.json');
const raw = readFileSync(F);

test('⚠️ 눈에 안 보이는 BOM 이 없다', () => {
  assert.ok(!(raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF),
    'BOM(EF BB BF)이 붙어 있다 — 파서가 파일을 통째로 못 읽는다');
});

test('그냥 JSON.parse 로 읽힌다', () => {
  // 안드로이드는 이 파일을 엄격하게 읽는다. Node 가 봐주는 것에 기대면 안 된다.
  assert.doesNotThrow(() => JSON.parse(raw.toString('utf8')));
});

test('앱링크가 요구하는 모양을 갖췄다', () => {
  const j = JSON.parse(raw.toString('utf8'));
  assert.ok(Array.isArray(j) && j.length > 0, '배열이 아니거나 비었다');
  for (const e of j) {
    assert.ok(e.relation?.includes('delegate_permission/common.handle_all_urls'),
      'relation 이 없거나 값이 다르다');
    assert.equal(e.target?.namespace, 'android_app');
    assert.ok(e.target?.package_name, 'package_name 이 없다');
    const fps = e.target?.sha256_cert_fingerprints;
    assert.ok(Array.isArray(fps) && fps.length > 0, '지문이 없다');
    for (const fp of fps) {
      // 32바이트를 콜론으로 이은 대문자 16진수
      assert.match(fp, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/,
        `지문 모양이 아니다: ${fp.slice(0, 20)}…`);
    }
  }
});

test('⚠️ 패키지 이름이 앱과 같다', () => {
  // 여기가 어긋나면 검증이 조용히 실패한다. 실제로 달랐다
  // (assetlinks 는 dev.pages.myan.an, 앱은 com.myan.app).
  const j = JSON.parse(raw.toString('utf8'));
  const app = JSON.parse(readFileSync(join(ROOT, 'myan-native', 'app.json'), 'utf8'));
  const pkg = app?.expo?.android?.package;
  assert.ok(pkg, 'app.json 에 안드로이드 패키지 이름이 없다');
  assert.ok(j.some(e => e.target.package_name === pkg),
    `assetlinks 에 ${pkg} 가 없다 — 있는 것: ${j.map(e => e.target.package_name).join(', ')}`);
});

test('앱이 도메인을 주장하고 있다', () => {
  // assetlinks 는 사이트 쪽 절반이다. 앱 쪽에 intentFilters 가 없으면
  // 사이트가 아무리 허락해도 앱이 그 주소를 달라고 한 적이 없는 셈이다.
  const app = JSON.parse(readFileSync(join(ROOT, 'myan-native', 'app.json'), 'utf8'));
  const filters = app?.expo?.android?.intentFilters || [];
  assert.ok(filters.length > 0, 'intentFilters 가 없다 — 앱이 도메인을 주장하지 않는다');
  const verified = filters.filter(f => f.autoVerify);
  assert.ok(verified.length > 0, 'autoVerify 인 필터가 없다 — 앱링크가 아니라 그냥 링크다');
  const hosts = verified.flatMap(f => (f.data || []).map(d => d.host)).filter(Boolean);
  assert.ok(hosts.length > 0, '주장하는 호스트가 없다');
});
