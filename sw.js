// M;Y 安 — Service Worker v2.3
const CACHE_NAME = 'myan-v4';
const OFFLINE_URL = '/index.html';

const CACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/constants.js',
  '/js/locales.js',
  '/js/saju-engine.js',
  '/js/app.js',
  '/icon-pwa-192-192.png',
  '/icon-pwa-512-512.png',
];

// ── 설치 ──
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(CACHE_ASSETS)));
  self.skipWaiting();
});

// ── 활성화 ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── 네트워크 요청 처리: Network First ──
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('googleapis.com') ||
      e.request.url.includes('accounts.google.com') ||
      e.request.url.includes('portone.io') ||
      e.request.url.includes('telegram.org')) return;
  try {
    const p = new URL(e.request.url).pathname;
    if (['/chat','/user-tokens','/migrate-tokens','/signup-grant',
         '/payment-request','/payment-status','/admin/','/api/'].some(x => p.startsWith(x))) return;
  } catch { return; }
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() =>
      caches.match(e.request).then(cached => cached || caches.match(OFFLINE_URL))
    )
  );
});

// ── 오늘의 일진 계산 (서비스 워커 독립 실행) ──
const _CG  = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const _JJ  = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const _CGO = ['木','木','火','火','土','土','金','金','水','水'];
const _ON  = { ko:{木:'목(木)',火:'화(火)',土:'토(土)',金:'금(金)',水:'수(水)'},
               en:{木:'Wood',火:'Fire',土:'Earth',金:'Metal',水:'Water'},
               zh:{木:'木气',火:'火气',土:'土气',金:'金气',水:'水气'},
               ja:{木:'木',火:'火',土:'土',金:'金',水:'水'} };
const _BODY= {
  ko:{ 木:'나무 기운이 흐르는 하루입니다. 새로운 시작과 성장의 에너지를 활용하세요.',
       火:'불꽃 기운이 활활 타오르는 하루입니다. 열정과 소통의 날로 삼으세요.',
       土:'대지 기운이 안정을 가져오는 하루입니다. 중심을 잡고 실속을 챙기세요.',
       金:'금속 기운이 날카롭게 빛나는 하루입니다. 결단과 정리의 시간으로 쓰세요.',
       水:'물 기운이 유연하게 흐르는 하루입니다. 직관을 믿고 유연하게 움직이세요.' },
  en:{ 木:'Wood energy flows today. Harness the power of new beginnings and growth.',
       火:'Fire energy blazes today. Channel passion and communication.',
       土:'Earth energy brings stability today. Stay grounded and practical.',
       金:'Metal energy shines sharp today. Time for decisions and clarity.',
       水:'Water energy flows freely today. Trust your intuition and stay flexible.' },
  zh:{ 木:'今日木气流动，善用新生与成长的能量。',
       火:'今日火气旺盛，以热情与沟通开启美好一天。',
       土:'今日土气稳固，保持中心，脚踏实地。',
       金:'今日金气锐利，是做决断与整理的好时机。',
       水:'今日水气流动，信任直觉，灵活应对。' },
  ja:{ 木:'今日は木の気が流れています。新たな始まりと成長のエネルギーを活かしてください。',
       火:'今日は火の気が燃え上がっています。情熱とコミュニケーションの日にしましょう。',
       土:'今日は土の気が安定をもたらします。落ち着いて着実に進んでください。',
       金:'今日は金の気が鋭く輝いています。決断と整理の時間にしましょう。',
       水:'今日は水の気が柔らかく流れています。直感を信じて柔軟に動きましょう。' },
};

function _swIlchin() {
  const ref = new Date(2023, 0, 1); ref.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const idx = ((44 + Math.round((now - ref) / 864e5)) % 60 + 60) % 60;
  return { ci: idx % 10, ji: idx % 12, o: _CGO[idx % 10] };
}

// ── 푸시 알림 수신 ──
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) {}

  // 서버에서 내용 없이 트리거만 보낸 경우 → 일진 로컬 계산
  if (!data.title) {
    const lang = data.lang || 'ko';
    const il   = _swIlchin();
    const on   = (_ON[lang] || _ON.ko)[il.o];
    const body = (_BODY[lang] || _BODY.ko)[il.o];
    const titles = { ko:`✦ 오늘의 기운 · ${on}`, en:`✦ Today's Energy · ${on}`,
                     zh:`✦ 今日气运 · ${on}`,     ja:`✦ 今日の気運 · ${on}` };
    data.title = titles[lang] || titles.ko;
    data.body  = body;
  }

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:     data.body,
      icon:     '/icon-pwa-192-192.png',
      badge:    '/icon-pwa-192-192.png',
      tag:      'myan-daily',
      renotify: true,
      data:     { url: data.url || '/' },
    })
  );
});

// ── 알림 클릭 → 앱 열기 ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const found = list.find(c => c.url.includes(self.location.origin));
      if (found) return found.focus();
      return clients.openWindow(target);
    })
  );
});
