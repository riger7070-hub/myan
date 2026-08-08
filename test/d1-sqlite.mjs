// worker.js 의 핸들러를 "진짜 SQL 이 도는" 환경에서 돌리기 위한 D1 셤.
//
// push-unsubscribe 테스트가 쓰는 손수 만든 스텁은 SQL 을 실행하지 않고 정규식으로 흉내만 낸다.
// 그래서 원자성(조건부 INSERT, ON CONFLICT ... WHERE, PRIMARY KEY 충돌)처럼 **SQL 자체가
// 지켜주는 계약**은 그걸로 검증할 수 없다. 여기서는 node:sqlite 에 worker.js 의 실제 DDL 을
// 그대로 올리고, D1 이 노출하는 만큼의 API(prepare/bind/first/all/run)만 얇게 감싼다.
//
// 주의: 각 질의 앞에 매크로태스크 한 틱을 끼워 넣는 게 중요하다. D1 은 네트워크 너머에 있어서
// 한 요청이 질의를 기다리는 동안 다른 요청이 끼어들 수 있는데, 동기 SQLite 를 그냥 async 로만
// 감싸면 질의가 마이크로태스크로 즉시 풀려 한 요청이 끝까지 달려버린다(그러면 경합이 재현되지
// 않아 "테스트는 통과하는데 프로덕션은 깨지는" 상태가 된다).

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// schema.test.mjs 와 같은 방식으로 worker.js 안의 DDL 을 꺼낸다.
// (여기가 어긋나면 실제와 다른 스키마를 검증하게 되므로 추출 방식을 일부러 맞춰 둔다.)
function loadDDL() {
  const src = readFileSync(join(ROOT, 'worker.js'), 'utf8');
  return [...src.matchAll(/_execEach\(env, `([\s\S]*?)`, '(\w+)'\)/g)]
    .flatMap(m => m[1].split(';').map(s => s.trim()).filter(Boolean));
}

/**
 * worker.js 의 실제 스키마가 올라간 인메모리 D1 셤을 만든다.
 * @returns {{db: DatabaseSync, DB: object}} db 는 테스트에서 직접 조회할 때 쓴다.
 */
export function createD1() {
  const db = new DatabaseSync(':memory:');
  for (const stmt of loadDDL()) {
    // ALTER 는 CREATE 정의에 이미 있는 컬럼을 다시 붙이는 경우가 많다(운영 DB 보정용).
    try { db.exec(stmt); } catch { /* duplicate column 등은 무시 */ }
  }

  // 네트워크 왕복 한 번 분량의 양보. setTimeout 이라야 마이크로태스크만 도는 다른 요청보다
  // 뒤로 밀리지 않고 실제 D1 처럼 순서가 섞인다.
  const roundTrip = () => new Promise(resolve => setTimeout(resolve, 0));

  const DB = {
    prepare(sql) {
      let args = [];
      return {
        bind(...a) { args = a; return this; },
        async first() {
          await roundTrip();
          const row = db.prepare(sql).get(...args);
          return row === undefined ? null : row;
        },
        async all() {
          await roundTrip();
          return { results: db.prepare(sql).all(...args) };
        },
        async run() {
          await roundTrip();
          const r = db.prepare(sql).run(...args);
          // D1 의 meta 중 핸들러들이 실제로 보는 두 필드만 채운다.
          return { meta: { changes: Number(r.changes), rows_written: Number(r.changes) } };
        },
      };
    },
  };

  return { db, DB };
}

/** payment_requests 잔액(= 승인된 행의 tokens 합계) */
export function balanceOf(db, email) {
  const row = db.prepare(
    `SELECT COALESCE(SUM(tokens),0) AS bal FROM payment_requests WHERE user_email=? AND status='approved'`
  ).get(email);
  return Number(row.bal);
}
