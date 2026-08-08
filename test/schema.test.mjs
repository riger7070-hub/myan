// 스키마 DDL 테스트.
//
// 2026-08-08에 프로덕션 D1 에 users / login_events / subscriptions / feature_history /
// photo_readings 가 **아예 없다**는 걸 발견했다. ensureDB*() 가 여러 문장을 한 템플릿에 담아
// `env.DB.exec(...).catch(() => {})` 로 돌리고 있었는데, D1 의 exec() 는 여러 줄에 걸친 문장을
// 제대로 못 다루고, 배치 전체에 걸린 하나의 catch 가 실패를 통째로 삼켰다. 로그도 없었다.
// 그래서 "기록이 저장되는 줄 알았는데 안 되고 있던" 상태가 오래 유지됐다.
//
// 이 테스트는 DDL 을 실제 SQLite 에 그대로 실행해본다. 문장이 깨졌거나 쪼개기가 잘못되면
// 여기서 바로 터진다 — 프로덕션에서 조용히 사라지는 대신에.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(ROOT, 'worker.js'), 'utf8');

// worker.js 안의 `_execEach(env, \`...\`, 'label')` 호출에서 DDL 을 그대로 꺼낸다.
const batches = [...worker.matchAll(/_execEach\(env, `([\s\S]*?)`, '(\w+)'\)/g)]
  .map(m => ({ sql: m[1], label: m[2] }));

// _execEach 와 동일한 방식으로 쪼갠다. 여기가 어긋나면 테스트가 실제와 다른 걸 검증하게 된다.
const split = sql => sql.split(';').map(s => s.trim()).filter(Boolean);

// 코드는 참조하지만 **일부러** 만들지 않는 테이블.
// subscriptions: 테이블이 생기는 순간 정기결제(handleSubscriptionConfirm + 재결제 크론)가
// 실제로 동작하기 시작한다. 결제 수단을 정식 등록하기 전까지 보류한다(worker.js 의 주석 참고).
const DEFERRED_TABLES = new Set(['subscriptions']);

test('DDL 배치를 소스에서 찾았다', () => {
  assert.ok(batches.length >= 2, `_execEach 배치를 ${batches.length}개만 찾았다`);
  assert.deepEqual(batches.map(b => b.label).sort(), ['alter', 'core', 'ext']);
});

test('모든 문장이 CREATE 또는 ALTER 로 시작한다 (쪼개기 검증)', () => {
  // 세미콜론이 문자열·주석 안에 들어가면 문장이 엉뚱하게 갈린다. 그 경우 여기서 걸린다.
  for (const { sql, label } of batches) {
    for (const stmt of split(sql)) {
      // 문장 앞에 붙은 SQL 주석(들여쓰기 포함)은 걷어내고 본문을 본다
      assert.match(stmt.replace(/^[ \t]*--.*$/gm, '').trim(), /^(CREATE|ALTER)\s/i,
        `[${label}] 문장 조각이 이상하다:\n${stmt.slice(0, 120)}`);
    }
  }
});

test('CREATE 문이 실제 SQLite 에서 전부 실행된다', () => {
  const db = new DatabaseSync(':memory:');
  const creates = batches
    .filter(b => b.label !== 'alter')   // ALTER 는 아래에서 따로 (순서 의존)
    .flatMap(b => split(b.sql).map(stmt => ({ stmt, label: b.label })));

  for (const { stmt, label } of creates) {
    assert.doesNotThrow(() => db.exec(stmt), `[${label}] 실행 실패:\n${stmt.slice(0, 160)}`);
  }
  db.close();
});

test('ALTER 보정이 CREATE 이후 순서에서 동작한다', () => {
  // ALTER TABLE users ... 는 users 가 먼저 만들어져 있어야 한다.
  // 예전엔 users 자체가 생성되지 않아 이 보정들이 전부 실패하고 있었다.
  const db = new DatabaseSync(':memory:');
  for (const b of batches.filter(x => x.label !== 'alter')) {
    for (const stmt of split(b.sql)) db.exec(stmt);
  }

  const alter = batches.find(b => b.label === 'alter');
  for (const stmt of split(alter.sql)) {
    try {
      db.exec(stmt);
    } catch (e) {
      // 이미 CREATE TABLE 정의에 들어 있는 컬럼을 다시 붙이는 건 정상이다(운영 DB 보정용).
      // 그 외의 실패 — 특히 "no such table" — 는 순서가 틀렸다는 뜻이라 반드시 터뜨린다.
      assert.match(e.message, /duplicate column name/,
        `ALTER 가 예상 못한 이유로 실패했다:\n${stmt.slice(0, 160)}\n→ ${e.message}`);
    }
  }
  db.close();
});

test('코드가 읽고 쓰는 테이블이 DDL 에 다 있다', () => {
  const db = new DatabaseSync(':memory:');
  for (const b of batches) {
    for (const stmt of split(b.sql)) { try { db.exec(stmt); } catch {} }
  }
  const created = new Set(
    db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(r => r.name)
  );
  db.close();

  // worker.js 가 실제로 질의하는 테이블 이름을 긁어온다.
  // 파일 전체에 정규식을 돌리면 AI 프롬프트 산문("...from the ancestors...")까지 걸리므로,
  // SQL 처럼 보이는 문자열 리터럴 안에서만 찾는다.
  const sqlLiterals = [...worker.matchAll(/`([^`]*)`|'([^'\n]*)'|"([^"\n]*)"/g)]
    .map(m => m[1] ?? m[2] ?? m[3] ?? '')
    .filter(s => /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i.test(s));

  const referenced = new Set();
  for (const sql of sqlLiterals) {
    for (const m of sql.matchAll(/\b(?:FROM|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)/gi)) {
      const name = m[1].toLowerCase();
      // 서브쿼리(`FROM (SELECT ...`)와 시스템 테이블은 제외
      if (!['select', 'sqlite_master', 'set'].includes(name)) referenced.add(name);
    }
  }
  assert.ok(referenced.size >= 5, `SQL 리터럴 추출이 너무 적다(${referenced.size}) — 정규식 확인 필요`);

  const missing = [...referenced].filter(t => !created.has(t) && !DEFERRED_TABLES.has(t)).sort();
  assert.deepEqual(missing, [],
    `코드는 쓰는데 DDL 에 없는 테이블:\n  ${missing.join('\n  ')}`);
});

test('보류 테이블은 정말로 생성되지 않는다', () => {
  // 실수로 다시 들어가는 걸 막는다. 결제를 열 때는 여기서 이름을 빼면서 의식적으로 결정하게 된다.
  const db = new DatabaseSync(':memory:');
  for (const b of batches) {
    for (const stmt of split(b.sql)) { try { db.exec(stmt); } catch {} }
  }
  const created = new Set(
    db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(r => r.name)
  );
  db.close();

  for (const t of DEFERRED_TABLES) {
    assert.ok(!created.has(t),
      `${t} 은(는) 보류 대상인데 DDL 에 들어왔다. 의도한 것이면 DEFERRED_TABLES 에서 빼라.`);
  }
});
