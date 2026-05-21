// M;Y 安 — Service Worker v2.1
const CACHE_NAME = 'myan-v2';
const OFFLINE_URL = '/index.html';

// 캐시할 파일 목록
const CACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-pwa-192-192.png',
  '/icon-pwa-512-512.png',
];

// ── 설치: 앱 셸 캐싱 ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_ASSETS))
  );
  self.skipWaiting();
});

// ── 활성화: 구버전 캐시 삭제 ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── 네트워크 요청 처리: Network First (최신 우선) ──
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // 외부 API 요청은 캐시하지 않음
  if (e.request.url.includes('googleapis.com') ||
      e.request.url.includes('accounts.google.com') ||
      e.request.url.includes('portone.io') ||
      e.request.url.includes('telegram.org')) {
    return;
  }

  // 자체 Worker API 엔드포인트는 캐시하지 않음 (동적 데이터)
  try {
    const reqPath = new URL(e.request.url).pathname;
    const apiPaths = ['/chat', '/user-tokens', '/migrate-tokens', '/signup-grant',
                      '/payment-request', '/payment-status', '/admin/', '/api/'];
    if (apiPaths.some(p => reqPath.startsWith(p))) return;
  } catch { return; }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // 성공하면 캐시 업데이트
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => {
        // 오프라인이면 캐시에서 반환
        return caches.match(e.request).then(cached => cached || caches.match(OFFLINE_URL));
      })
  );
});

// ── 푸시 알림 수신 ──
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'M;Y 安';
  const body  = data.body  || '오늘의 기운을 확인하세요.';
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  '/icon-pwa-192-192.png',
      badge: '/icon-pwa-192-192.png',
      tag:   'myan-daily',
      renotify: true,
      data: { url: data.url || '/' },
    })
  );
});

// ── 알림 클릭 → 앱 열기 ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(target);
    })
  );
});
