// worker.js 안의 내부 함수를 테스트에서 불러오기 위한 로더.
//
// worker.js 는 ES 모듈(`import LunarPkg from 'lunar-javascript'`)이지만 package.json 에
// `"type": "module"` 이 없다. 루트의 convert-to-webp.js / quick-mobile-test.js /
// test-mobile-login.js 가 CommonJS(`require`)라서 그 필드를 켜면 그쪽이 깨진다.
// 그래서 여기서 worker.js 를 그대로 읽어 `.mjs` 확장자로 임시 복사한 뒤 import 한다.
// 복사본은 프로젝트 트리 안에 두므로 'lunar-javascript' 해석도 정상 동작한다.
//
// 필요한 내부 함수는 복사본 끝에 export 문을 덧붙여 꺼낸다 — 이렇게 하면
// 실제 배포되는 worker.js 에는 테스트 전용 export 가 쌓이지 않는다.
// 함수 이름이 바뀌면 이 로더가 실패하는데, 그건 의도된 동작이다(테스트가 시끄럽게 깨져야 한다).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const WORKER_PATH = join(HERE, '..', 'worker.js');

/**
 * worker.js 를 로드하고 요청한 내부 함수들을 돌려준다.
 * @param {string[]} names 꺼낼 최상위 함수/상수 이름
 */
export async function loadWorker(names) {
  const src = readFileSync(WORKER_PATH, 'utf8');
  const tmpDir = join(HERE, '.tmp');
  mkdirSync(tmpDir, { recursive: true });

  // 이름을 파일명에 반영해 테스트끼리 캐시가 섞이지 않게 한다
  // (Node 는 같은 URL 을 두 번 import 하면 캐시된 모듈을 준다).
  // ⚠️ 이름을 그대로 이어 붙이면 파일명이 길어진다. 함수를 열대여섯 개 꺼내는 테스트에서
  // 윈도우 경로 길이(260자)를 넘겨 ENOENT 가 났다. 길면 지문으로 줄인다.
  const joined = names.join('-');
  let tag = joined;
  if (joined.length > 80) {
    let h = 0x811c9dc5;
    for (let i = 0; i < joined.length; i++) h = Math.imul(h ^ joined.charCodeAt(i), 0x01000193) >>> 0;
    tag = `${names.length}fn-${h.toString(36)}`;
  }
  const tmpFile = join(tmpDir, `worker.${tag}.mjs`);
  writeFileSync(tmpFile, `${src}\nexport { ${names.join(', ')} };\n`);

  return import(pathToFileURL(tmpFile).href);
}
