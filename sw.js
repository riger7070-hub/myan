// M;Y 安 — Service Worker
// VERSION은 worker.js가 /sw.js 응답 시 CF_VERSION_METADATA.id로 실시간 치환함(배포마다 자동 갱신).
// 아래 값은 그 치환이 없는 로컬(wrangler dev) 환경에서만 쓰이는 기본값.
const VERSION = 'local-dev';
const CACHE_NAME = `myan-v10-${VERSION}`;
const CACHE_IMAGES = `myan-images-v7`;
const CACHE_STATIC = `myan-static-v7`;
const OFFLINE_URL = '/index.html';

// 즉시 캐시할 핵심 리소스
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/constants.js',
  '/js/locales.js',
  '/js/saju-engine.js',
  '/js/effect.js',
  '/js/app.js',
  '/js/modules/performance.js',
  '/js/modules/analytics.js',
  '/js/modules/notifications.js',
];

// WebP 이미지 (우선 캐시)
const PRECACHE_IMAGES = [
  '/icon-pwa-192-192.webp',
  '/icon-pwa-512-512.webp',
  '/icon-maskable-192.webp',
  '/icon-maskable-512.webp',
  '/icon-og-512-512.webp',
];

// ════════════════════════════════════════════════════════════════
//  설치 (Install)
// ════════════════════════════════════════════════════════════════
self.addEventListener('install', event => {
  console.log('[SW] Installing version', VERSION);

  event.waitUntil(
    Promise.all([
      // 핵심 리소스 캐시
      caches.open(CACHE_NAME).then(cache =>
        cache.addAll(PRECACHE_ASSETS).catch(err => {
          console.warn('[SW] Precache failed:', err);
          // 일부 실패해도 계속 진행
        })
      ),
      // 이미지 별도 캐시
      caches.open(CACHE_IMAGES).then(cache =>
        cache.addAll(PRECACHE_IMAGES).catch(err => {
          console.warn('[SW] Image precache failed:', err);
        })
      )
    ]).then(() => {
      console.log('[SW] Install complete');
      return self.skipWaiting(); // 즉시 활성화
    })
  );
});

// ════════════════════════════════════════════════════════════════
//  활성화 (Activate)
// ════════════════════════════════════════════════════════════════
self.addEventListener('activate', event => {
  console.log('[SW] Activating version', VERSION);

  event.waitUntil(
    // 모든 캐시 강제 삭제 (v4.0 이전 캐시 완전 제거)
    caches.keys().then(cacheNames => {
      console.log('[SW] Deleting ALL old caches:', cacheNames);
      return Promise.all(
        cacheNames.map(name => {
          console.log('[SW] Deleting cache:', name);
          return caches.delete(name);
        })
      );
    }).then(() => {
      // 새 캐시 즉시 생성
      return Promise.all([
        caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS)),
        caches.open(CACHE_IMAGES).then(cache => cache.addAll(PRECACHE_IMAGES))
      ]);
    }).then(() => {
      console.log('[SW] Activation complete - fresh cache installed');
      return self.clients.claim(); // 즉시 제어 시작
    })
  );
});

// ════════════════════════════════════════════════════════════════
//  캐싱 전략 함수들
// ════════════════════════════════════════════════════════════════

// Network First: HTML, API 호출
async function networkFirst(request, cacheName = CACHE_NAME) {
  try {
    const networkResponse = await fetch(request);

    // 성공적인 응답이면 캐시 업데이트
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    // 네트워크 실패 시 캐시에서 반환
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // 캐시도 없으면 오프라인 페이지
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_URL);
    }

    throw error;
  }
}

// Cache First: 이미지, 폰트, 아이콘
async function cacheFirst(request, cacheName = CACHE_IMAGES) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache First failed:', error);
    throw error;
  }
}

// Stale-While-Revalidate: CSS, JS
async function staleWhileRevalidate(request, cacheName = CACHE_STATIC) {
  const cachedResponse = await caches.match(request);

  const fetchPromise = fetch(request).then(async networkResponse => {
    if (networkResponse && networkResponse.status === 200) {
      try {
        const cache = await caches.open(cacheName);
        // clone 전에 응답이 사용되지 않았는지 확인
        const responseToCache = networkResponse.clone();
        cache.put(request, responseToCache);
      } catch (e) {
        // clone 실패해도 계속 진행
      }
    }
    return networkResponse;
  }).catch(() => cachedResponse);

  // 캐시가 있으면 즉시 반환, 동시에 백그라운드 업데이트
  return cachedResponse || fetchPromise;
}

// ════════════════════════════════════════════════════════════════
//  Fetch 이벤트 (요청 라우팅)
// ════════════════════════════════════════════════════════════════
self.addEventListener('fetch', event => {
  const { request } = event;
  const { url, method } = request;

  // GET 요청만 캐싱
  if (method !== 'GET') return;

  // 외부 API는 캐싱 안 함
  if (url.includes('googleapis.com') ||
      url.includes('gstatic.com') ||
      url.includes('accounts.google.com') ||
      url.includes('tosspayments.com') ||
      url.includes('portone.io') ||
      url.includes('telegram.org') ||
      url.includes('cdnjs.cloudflare.com')) {
    return;
  }

  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return;
  }

  // API 엔드포인트는 캐싱 안 함
  if (pathname.startsWith('/chat') ||
      pathname.startsWith('/api/') ||
      pathname.startsWith('/admin/') ||
      pathname.startsWith('/user-tokens') ||
      pathname.startsWith('/migrate-tokens') ||
      pathname.startsWith('/signup-grant')) {
    return;
  }

  // 캐싱 전략 선택
  event.respondWith(
    (async () => {
      // 1. 이미지, 폰트 → Cache First
      if (pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|woff2|woff|ttf|eot)$/i)) {
        return cacheFirst(request, CACHE_IMAGES);
      }

      // 2. CSS, JS 모듈 → Stale-While-Revalidate
      if (pathname.match(/\.(css|js)$/i)) {
        return staleWhileRevalidate(request, CACHE_STATIC);
      }

      // 3. HTML, JSON → Network First
      if (pathname.match(/\.(html|json)$/i) || pathname === '/' || !pathname.includes('.')) {
        return networkFirst(request, CACHE_NAME);
      }

      // 4. 기타 정적 파일 → Stale-While-Revalidate
      return staleWhileRevalidate(request, CACHE_STATIC);
    })()
  );
});

// ════════════════════════════════════════════════════════════════
//  백그라운드 동기화 (주기적 캐시 업데이트)
// ════════════════════════════════════════════════════════════════
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(names =>
        Promise.all(names.map(name => caches.delete(name)))
      ).then(() => {
        event.ports[0].postMessage({ success: true });
      })
    );
  }
});

// ════════════════════════════════════════════════════════════════
//  오늘의 일진 계산 (서비스 워커 독립 실행)
// ════════════════════════════════════════════════════════════════
const _CGO = ['木','木','火','火','土','土','金','金','水','水'];
const _ON  = {
  ko:{木:'목(木)',火:'화(火)',土:'토(土)',金:'금(金)',水:'수(水)'},
  en:{木:'Wood',火:'Fire',土:'Earth',金:'Metal',水:'Water'},
  zh:{木:'木气',火:'火气',土:'土气',金:'金气',水:'水气'},
  ja:{木:'木',火:'火',土:'土',金:'金',水:'水'}
};
const _BODY= {
  ko:{
    木:'나무 기운이 흐르는 하루입니다. 새로운 시작과 성장의 에너지를 활용하세요.',
    火:'불꽃 기운이 활활 타오르는 하루입니다. 열정과 소통의 날로 삼으세요.',
    土:'대지 기운이 안정을 가져오는 하루입니다. 중심을 잡고 실속을 챙기세요.',
    金:'금속 기운이 날카롭게 빛나는 하루입니다. 결단과 정리의 시간으로 쓰세요.',
    水:'물 기운이 유연하게 흐르는 하루입니다. 직관을 믿고 유연하게 움직이세요.'
  },
  en:{
    木:'Wood energy flows today. Harness the power of new beginnings and growth.',
    火:'Fire energy blazes today. Channel passion and communication.',
    土:'Earth energy brings stability today. Stay grounded and practical.',
    金:'Metal energy shines sharp today. Time for decisions and clarity.',
    水:'Water energy flows freely today. Trust your intuition and stay flexible.'
  },
  zh:{
    木:'今日木气流动，善用新生与成长的能量。',
    火:'今日火气旺盛，以热情与沟通开启美好一天。',
    土:'今日土气稳固，保持中心，脚踏实地。',
    金:'今日金气锐利，是做决断与整理的好时机。',
    水:'今日水气流动，信任直觉，灵活应对。'
  },
  ja:{
    木:'今日は木の気が流れています。新たな始まりと成長のエネルギーを活かしてください。',
    火:'今日は火の気が燃え上がっています。情熱とコミュニケーションの日にしましょう。',
    土:'今日は土の気が安定をもたらします。落ち着いて着実に進んでください。',
    金:'今日は金の気が鋭く輝いています。決断と整理の時間にしましょう。',
    水:'今日は水の気が柔らかく流れています。直感を信じて柔軟に動きましょう。'
  },
};

function _swIlchin() {
  const ref = new Date(2023, 0, 1); ref.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const idx = ((44 + Math.round((now - ref) / 864e5)) % 60 + 60) % 60;
  return { ci: idx % 10, ji: idx % 12, o: _CGO[idx % 10] };
}

// ════════════════════════════════════════════════════════════════
//  푸시 알림 수신
// ════════════════════════════════════════════════════════════════
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {}

  // 서버에서 내용 없이 트리거만 보낸 경우 → 일진 로컬 계산
  if (!data.title) {
    const lang = data.lang || 'ko';
    const il   = _swIlchin();
    const on   = (_ON[lang] || _ON.ko)[il.o];
    const body = (_BODY[lang] || _BODY.ko)[il.o];
    const titles = {
      ko:`✦ 오늘의 기운 · ${on}`,
      en:`✦ Today's Energy · ${on}`,
      zh:`✦ 今日气运 · ${on}`,
      ja:`✦ 今日の気運 · ${on}`
    };
    data.title = titles[lang] || titles.ko;
    data.body  = body;
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:     data.body,
      icon:     '/icon-pwa-192-192.webp',
      badge:    '/icon-pwa-192-192.webp',
      tag:      'myan-daily',
      renotify: true,
      data:     { url: data.url || '/' },
    })
  );
});

// ════════════════════════════════════════════════════════════════
//  알림 클릭 → 앱 열기
// ════════════════════════════════════════════════════════════════
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const found = list.find(c => c.url.includes(self.location.origin));
      if (found) {
        return found.focus();
      }
      return clients.openWindow(target);
    })
  );
});
