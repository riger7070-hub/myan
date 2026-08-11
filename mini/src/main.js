// M;Y 安 앱인토스 미니앱.
//
// 웹 서비스(myan.riger7070.workers.dev)와 **계정도 토큰도 완전히 분리된 별도 서비스**다.
// 여기서 산 토큰은 웹에서 못 쓰고 반대도 마찬가지다. 서버가 세션 subject 로 구분한다
// (웹은 이메일, 미니앱은 'mini:<userKey>'). test/mini-isolation.test.mjs 참고.
//
// 콘텐츠 자체는 웹과 같은 서버 엔드포인트를 쓴다. 서버의 계정 계층(resolveAccount)이
// 누가 불렀는지 알아서 각자의 원장에서 토큰을 뺀다.
//
// 화면은 상태 하나(state.screen)로 갈아 끼운다. 화면 수가 적어 라우터를 두지 않았다.

import {
  appLogin, IAP, saveBase64Data, getTossShareLink, share, GoogleAdMob,
  graniteEvent, closeView,
} from '@apps-in-toss/web-framework';
import {
  SECTIONS, ALL_ITEMS, itemById, OHAENG_TYPES, TOPICS, PURPOSES, SIJI, GENDERS, SANGAJI,
  moonToday,
} from './contents.js';
import { icon } from './icons.js';

// ── 화면 밝기 ──
// 기본은 기기 설정을 따른다. 사용자가 직접 고르면 그 뜻을 우선한다.
// 이 앱은 밤·달이 컨셉이라 다크가 본래 모습이지만, 밝은 데서 보는 사람도 있다.
const THEME_KEY = 'myan_mini_theme';

function applyTheme(t) {
  const wanted = t || localStorage.getItem(THEME_KEY)
    || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', wanted);
  if (t) localStorage.setItem(THEME_KEY, t);
  return wanted;
}
const currentTheme = () => document.documentElement.getAttribute('data-theme') || 'dark';
applyTheme();

const API = 'https://myan.riger7070.workers.dev';
const SESSION_KEY = 'myan_mini_session';

// ⚠️ 콘솔에 등록한 상품 ID 와 정확히 같아야 한다. 서버의 MINI_PRODUCTS 와도 맞춰야
// 결제가 지급으로 이어진다(worker.js 의 MINI_PRODUCTS 주석 참고).
const PRODUCTS = [
  { sku: 'token_10',  tokens: 10,  label: '토큰 10개',  price: '3,900원' },
  { sku: 'token_30',  tokens: 30,  label: '토큰 30개',  price: '9,900원' },
  { sku: 'token_100', tokens: 100, label: '토큰 100개', price: '27,900원' },
];


const AD_TOKENS = 1;

// ⚠️ 앱인토스 콘솔에서 발급받은 광고 단위 ID. 등록 전에는 광고가 열리지 않는다.
// 값이 비어 있으면 버튼 자체를 숨긴다 — 눌러도 실패하는 버튼을 보여주지 않는다.
const AD_UNIT_ID = '';

const state = {
  screen: 'boot',
  session: localStorage.getItem(SESSION_KEY) || '',
  profile: null,
  tokens: 0,
  item: null,       // 지금 보려는 콘텐츠
  form: {},         // need 화면에서 받은 입력
  result: null,     // { title, icon, body, extras }
  history: [],
  error: '',
  busy: false,
  menu: false,      // 오른쪽 위 메뉴가 열려 있는가
};

const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── 서버 호출 ──────────────────────────────────────────────

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (auth && state.session) headers.Authorization = `Bearer ${state.session}`;

  let res;
  // 응답이 영영 안 오면 로딩 화면에 갇힌다. 실제로 그런 신고가 있었다 —
  // 무엇이 잘못됐는지도 모른 채 기다리게 두느니 끊고 알려주는 게 낫다.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    res = await fetch(API + path, {
      method, headers, signal: ctrl.signal,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch 가 던지면 브라우저는 이유를 안 알려준다("Failed to fetch"). 원인은 대개
    // CORS 아니면 네트워크인데, 토스 웹뷰엔 개발자 도구가 없어서 실제 오리진을
    // 함께 보여줘야 어느 쪽인지 판단할 수 있다.
    const err = new Error(ctrl.signal.aborted
      ? '응답이 너무 오래 걸려 중단했어요. 토큰을 쓰셨다면 지난 기록을 확인해 주세요.'
      : '서버에 연결하지 못했어요.');
    err.network = !ctrl.signal.aborted;
    err.origin = location.origin;
    throw err;
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || '잠시 후 다시 시도해 주세요.');
    err.status = res.status;
    throw err;
  }
  return data;
}

// ── 여는 화면 ──────────────────────────────────────────────
//
// 달이 뜬 밤, 문이 열리고 안도령이 걸어 나온다. 첫 인상을 만드는 자리이자,
// 로그인 확인(/mini/api/me)이 오가는 동안 빈 화면을 보여주지 않으려는 자리이기도 하다.
//
// 두 가지를 지킨다.
//   - 연출이 끝나기를 기다리되, 준비가 늦으면 더 기다리지 않는다(둘 중 늦은 쪽에 맞춘다).
//   - 두 번째부터는 짧게 지나간다. 매번 3초를 보고 있으면 그때부터는 장벽이다.
const SPLASH_MS = 2600;
const SPLASH_SEEN = 'myan_mini_seen';

function splashHtml() {
  const moon = moonToday();
  const stars = Array.from({ length: 18 }, (_, i) => {
    const x = (i * 37 + 11) % 100;          // 난수 대신 고정 배치 — 매번 같은 밤하늘이 된다
    const y = (i * 23 + 7) % 55;
    const d = (i % 5) * 0.4;
    return `<span class="star" style="left:${x}%;top:${y}%;animation-delay:${d}s"></span>`;
  }).join('');

  return `<div class="splash" id="splash">
    <div class="sky">${stars}
      <div class="moon" title="${moon.name}">${moon.icon}</div>
    </div>
    <div class="gate">
      <div class="door left"></div>
      <div class="door right"></div>
      <div class="glow"></div>
      <img class="oracle" src="${API}/andoryeong.svg" alt=""
           onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'oracle',textContent:'🧙'}))">
    </div>
    <div class="splash-title">MY;安</div>
    <div class="splash-sub">${moon.name} 아래, 안도령이 기다립니다</div>
    <div class="splash-wait"><div class="spinner"></div>문을 여는 중입니다</div>
  </div>`;
}

async function showSplash() {
  app.innerHTML = splashHtml();
  // 두 번째부터는 짧게. 매번 3초를 보고 있으면 그때부터는 장벽이다.
  const ms = sessionStorage.getItem(SPLASH_SEEN) ? 700 : SPLASH_MS;
  await new Promise(r => setTimeout(r, ms));
  sessionStorage.setItem(SPLASH_SEEN, '1');
}

// ── 부팅 ──────────────────────────────────────────────────

async function boot() {
  if (state.session) {
    try {
      const me = await api('/mini/api/me');
      state.profile = me.profile;
      state.tokens = me.tokens;
      // 결제는 됐는데 지급 직전에 앱이 꺼진 주문을 여기서 마저 처리한다.
      // 이게 없으면 사용자는 돈만 내고 토큰을 못 받는다.
      recoverPendingOrders();
      go(state.profile?.birthYear ? 'home' : 'profile');
      return;
    } catch (e) {
      // 세션 만료(401)면 지우고 로그인부터. 그 외 오류는 네트워크 문제일 수 있어 유지한다.
      if (e.status === 401) { localStorage.removeItem(SESSION_KEY); state.session = ''; }
    }
  }
  go('login');
}

async function recoverPendingOrders() {
  try {
    // 이것도 배열이 아니라 { orders: [...] } 로 온다.
    const pending = (await IAP.getPendingOrders())?.orders || [];
    for (const order of pending) {
      const orderId = order?.orderId;
      if (!orderId) continue;
      const r = await api('/mini/api/payment/grant', { method: 'POST', body: { orderId } });
      if (r?.ok) {
        state.tokens = r.balance ?? state.tokens;
        await IAP.completeProductGrant({ orderId });
      }
    }
    render();
  } catch { /* 복구 실패가 앱 사용을 막지는 않는다. 다음 실행에서 다시 시도된다. */ }
}

// ── 인증·프로필 ────────────────────────────────────────────

async function doLogin() {
  await withBusy(async () => {
    const { authorizationCode, referrer } = await appLogin();
    const r = await api('/mini/api/auth/login', {
      method: 'POST', auth: false, body: { authorizationCode, referrer },
    });
    state.session = r.session;
    localStorage.setItem(SESSION_KEY, r.session);
    const me = await api('/mini/api/me');
    state.tokens = me.tokens;
    state.profile = me.profile;
    go(state.profile?.birthYear ? 'home' : 'profile');
  });
}

async function saveProfile(form) {
  await withBusy(async () => {
    await api('/mini/api/profile', { method: 'POST', body: form });
    const me = await api('/mini/api/me');
    state.profile = me.profile;
    state.tokens = me.tokens;
    go('home');
  });
}

// ── 콘텐츠 ────────────────────────────────────────────────

const birthOf = (p) => ({
  year: +p.birthYear, month: +p.birthMonth, day: +p.birthDay, hour: p.birthHour || '',
});

/** 콘텐츠별 요청 본문. 서버가 실제로 읽는 필드에 맞춘다. */
function bodyFor(item, profile, form) {
  const birth = birthOf(profile);
  const base = { lang: 'ko' };
  switch (item.id) {
    case 'today':      return {};
    case 'saju':       return { mode: 'solo', lang: 'ko', p1: { ...birth, name: profile.name || '' } };
    case 'tarot':      return base;
    case 'rune':       return base;
    case 'lucky':      return base;
    case 'daeun':      return { ...base, birth, gender: profile.gender || '' };
    case 'spouse':     return { ...base, birth, gender: profile.gender || '' };
    case 'numerology': return { ...base, birth };
    case 'tojeong':    return { ...base, birth };
    case 'astro':      return { ...base, birth };
    case 'zodiac':     return { ...base, birth };
    case 'name':       return { ...base, name: form.name, birth };
    case 'iching':     return { ...base, question: form.text || '' };
    case 'dream':      return { ...base, dream: form.text };
    case 'topic':      return { ...base, topic: form.topic, birth };
    case 'typecompat': return { ...base, myType: form.myType, partnerType: form.partnerType };
    case 'photo':      return { ...base, type: form.photoType, image: form.image };
    case 'takil':      return { ...base, purpose: form.purpose, birth, from: form.from || '', days: form.days || 30 };
    case 'compat':
      return { ...base, p1: { ...birth, name: profile.name || '' }, p2: form.partner };
    default:           return base;
  }
}

function openItem(item) {
  state.item = item;
  state.form = {};
  state.error = '';
  // 산가지는 서버도 AI 도 부르지 않는다. 콘텐츠 목록에 있지만 처리는 앱 안에서 끝난다.
  if (item.local) { drawStick(); return; }
  if (item.need) { go('need'); return; }
  runItem(item);
}

// 요청 세대. 뒤로가기로 로딩을 벗어난 뒤 응답이 도착하면 사용자를 결과 화면으로
// 끌고 가 버린다. 세대가 바뀌었으면 그 응답은 조용히 버린다.
let _runSeq = 0;

async function runItem(item) {
  const seq = ++_runSeq;
  state.item = item;
  state.screen = 'loading';
  state.error = '';
  // 문구는 화면에 들어올 때 한 번만 고른다. render() 안에서 뽑으면 다시 그릴 때마다
  // 문구가 바뀌어 깜빡이는 것처럼 보인다.
  state.loadingLine = LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)];
  render();
  try {
    const data = await api(item.path, {
      method: 'POST',
      auth: !item.free || item.id !== 'saju',   // 무료 사주는 인증 없이도 되지만 있어도 무방
      body: bodyFor(item, state.profile, state.form),
    });
    // 잔액 필드 이름이 갈린다: 웹 콘텐츠는 remaining, 미니 전용(/mini/api/today)은 tokens.
    // 둘 다 안 오면(무료 사주 등) 따로 물어본다.
    if (typeof data.remaining === 'number') state.tokens = data.remaining;
    else if (typeof data.tokens === 'number') state.tokens = data.tokens;
    else if (!item.free) refreshTokens();

    // 사용자가 이미 뒤로 나갔으면(또는 다른 콘텐츠를 눌렀으면) 화면을 뺏지 않는다.
    // 토큰은 이미 나갔지만 결과는 '지난 기록'에 남으므로 잃어버리지 않는다.
    if (seq !== _runSeq || state.screen !== 'loading') return;

    // 응답 모양이 예상과 달라 여기서 던지면 화면이 로딩에 갇힌다. 본문만이라도 띄운다.
    let parsed;
    try {
      parsed = extractResult(data);
    } catch (e) {
      console.error('[extract]', e);
      parsed = { body: data.reading || '', extras: [] };
    }
    state.result = { item, ...parsed, card: data.card, upright: data.upright };
    // 카드를 뽑는 콘텐츠는 결과를 곧장 들이밀지 않는다. 뒤집는 순간이 재미의 절반이다.
    state.reveal = !!data.card;
    go('result');
  } catch (e) {
    if (seq !== _runSeq || state.screen !== 'loading') return;
    if (e.status === 402) { state.error = '토큰이 부족해요.'; go('charge'); return; }
    state.error = e?.message || '오류가 발생했습니다.';
    if (e?.network && e.origin) state.error += `\n(요청 출처: ${e.origin})`;
    // 입력을 받은 콘텐츠면 그 화면으로 돌려보낸다. 홈으로 보내면 방금 적은 걸 다시 써야 한다.
    go(item.need ? 'need' : 'home');
  }
}

/**
 * 응답에서 보여줄 것을 뽑는다. 콘텐츠마다 응답 모양이 조금씩 달라서, 본문(reading)은
 * 공통으로 받고 그 밖의 표시거리는 알아보는 것만 추린다.
 * 모르는 필드는 조용히 버린다 — 서버가 필드를 늘려도 화면이 깨지지 않는다.
 */
function extractResult(d) {
  const body = d.reading || d.text || d.interpretation || '';
  const extras = [];
  const add = (label, value) => { if (value) extras.push({ label, value: String(value) }); };

  if (d.card?.name) add('뽑은 카드', `${d.card.icon || ''} ${d.card.name}${d.upright === false ? ' (역방향)' : ''}`.trim());
  if (d.hexagram?.name) add('괘', d.hexagram.name);
  if (d.rune?.name) add('룬', d.rune.name);
  add('라이프패스 넘버', d.lifePath);
  add('주제', d.title);
  add('이름', d.name);
  add('점수', d.score != null ? `${d.score}점` : '');
  add('사주', d.saju1 || d.saju);
  add('오늘의 기운', d.dayElem);
  if (d.branch && d.sipsin) add('배우자궁', `${d.branch}(${d.elem || ''}) · ${d.sipsin}`);
  if (Array.isArray(d.timeline) && d.timeline.length) {
    // 흔들리는 해만 짚는다. 합(合)은 본문에서 다루므로 목록까지 늘리지 않는다.
    const shake = d.timeline.filter(t => t.kinds?.some(k => k !== '합'));
    if (shake.length) add('살펴볼 해', shake.slice(0, 4).map(t => `${t.year}년`).join(', '));
  }
  add('연도', d.year);
  if (d.myType && d.partnerType) add('유형', `${d.myType} × ${d.partnerType}`);
  if (d.moon && typeof d.moon.illumination === 'number') add('달', `밝기 ${d.moon.illumination}%`);
  if (d.mercury?.retrograde) add('수성', `역행 중${d.mercury.endsAt ? ` (${d.mercury.endsAt}까지)` : ''}`);

  // 택일은 고른 날짜들이 본문만큼 중요하다.
  if (Array.isArray(d.picks)) {
    const days = d.picks.slice(0, 5)
      .map(x => (typeof x === 'string' ? x : x.ymd || x.date || ''))
      .filter(Boolean);
    if (days.length) add('좋은 날', days.join(', '));
  } else if (d.picks && typeof d.picks === 'object') {
    // 럭키 아이템은 { color, food, song } 처럼 객체로 온다.
    const KO = { color: '행운의 색', food: '행운의 음식', song: '오늘의 노래', item: '행운의 물건', place: '행운의 장소' };
    for (const [k, v] of Object.entries(d.picks)) {
      if (typeof v === 'string') add(KO[k] || k, v);
    }
  }
  if (d.best) add('가장 좋은 시기', typeof d.best === 'string' ? d.best : d.best.year || '');

  return { body, extras };
}

async function refreshTokens() {
  try { state.tokens = (await api('/mini/api/tokens')).tokens ?? state.tokens; } catch { /* 표시용이라 실패해도 넘어간다 */ }
}

async function loadHistory() {
  await withBusy(async () => {
    const r = await api('/api/feature-history?limit=30');
    state.history = r.history || [];
    go('history');
  });
}

// ── 결제 ──────────────────────────────────────────────────

/**
 * 콘솔에 실제로 등록된 상품 목록을 가져온다.
 * 코드에 적어 둔 SKU 와 콘솔이 어긋나면 결제가 통째로 실패하는데, 화면에는
 * "에러"라고만 떠서 원인을 알 수 없다. 실제 목록을 받아 대조해 보여준다.
 */
async function loadProducts() {
  try {
    // ⚠️ 배열이 아니라 { products: [...] } 로 온다. 배열로 착각해 .map 을 부르면
    //    "map is not a function" 으로 죽는다(실제로 그랬다).
    const res = await IAP.getProductItemList();
    const products = res?.products || [];
    state.catalog = products.map(p => ({
      sku: p.sku,
      label: p.displayName || p.sku,
      price: p.displayAmount || '',
      known: PRODUCTS.some(k => k.sku === p.sku),
    }));
    state.catalogError = state.catalog.length ? '' : '콘솔에 등록된 상품이 없습니다.';
  } catch (e) {
    state.catalog = null;
    state.catalogError = `상품 목록을 불러오지 못했어요. (${e?.message || e})`;
  }
  render();
}

function buyTokens(product) {
  state.error = '';
  state.busy = true;
  render();

  IAP.createOneTimePurchaseOrder({
    options: {
      productId: product.sku,   // 구버전 필드지만 타입상 필수라 함께 넣는다
      sku: product.sku,
      // 결제가 끝나면 토스가 이걸 부른다. 서버에 지급을 요청하고 성공 여부를 돌려준다.
      // false 를 돌려주면 토스가 미완료 주문으로 남겨 두고, 다음 실행 때 복구된다.
      processProductGrant: async ({ orderId }) => {
        try {
          const r = await api('/mini/api/payment/grant', { method: 'POST', body: { orderId } });
          state.tokens = r.balance ?? state.tokens;
          return true;
        } catch (e) {
          console.error('[grant]', e?.message);
          return false;
        }
      },
    },
    onEvent: () => { state.busy = false; state.error = ''; go('home'); },
    onError: (err) => {
      state.busy = false;
      // 사용자가 결제창을 닫은 것도 여기로 온다. 실패라고 겁주지 않되,
      // 원인을 통째로 감추면 상품 미등록 같은 설정 문제를 영영 못 찾는다.
      const detail = err?.message || err?.code || (typeof err === 'string' ? err : '');
      state.error = detail
        ? `결제가 완료되지 않았어요.\n(${String(detail).slice(0, 160)})`
        : '결제가 완료되지 않았어요.';
      console.warn('[iap]', err);
      render();
    },
  });
}

// ── 친구에게 알리기 ─────────────────────────────────────────
// 토큰 보상은 붙이지 않는다. 공유창을 띄운 것만으로 줄 수밖에 없는데(실제로 보냈는지는
// 앱이 알 수 없다) 그러면 눌렀다 닫기만 반복해도 토큰이 나온다. 토큰은 출석·퀴즈·광고
// 처럼 확인 가능한 행동에만 붙인다.
async function shareApp() {
  await withBusy(async () => {
    let link = '';
    try {
      link = await getTossShareLink('/');
    } catch { /* 링크를 못 만들어도 공유 자체는 시도한다 */ }

    await share({
      message: link
        ? `오늘 내 기운은 어떨까? 안도령이 사주로 풀어줘요.\n${link}`
        : '오늘 내 기운은 어떨까? 안도령이 사주로 풀어줘요. 토스에서 "오늘운빨"을 찾아보세요.',
    });
  });
}

// ── 놀이: 출석 · 퀴즈 · 산가지 ───────────────────────────────

async function doCheckin() {
  await withBusy(async () => {
    const r = await api('/mini/api/checkin', { method: 'POST', body: {} });
    state.tokens = r.balance ?? state.tokens;
    state.checkin = r;
    state.toast = r.message || '';
  });
}

async function startQuiz() {
  await withBusy(async () => {
    const r = await api('/mini/api/quiz');
    // step: 지금 보여줄 문제 번호. 문제는 3개를 한 번에 받아 두되(서명이 셋을 묶고
    // 있어서 나눠 받을 수 없다) 화면에는 하나씩 낸다.
    state.quiz = { ...r, picked: [], step: 0, done: null };
    state.showTips = false;
    go('quiz');
  });
}

/** 한 문제를 고르고 다음으로. 마지막이면 채점한다. */
function answerQuiz(choice) {
  const q = state.quiz;
  if (!q || q.done) return;
  const first = q.picked[q.step] == null;
  q.picked[q.step] = choice;

  // 마지막 문제에서 처음 고르면 바로 채점한다. 다만 이미 고른 걸 바꾸는 중이라면
  // 멋대로 제출하지 않는다 — 되돌아와서 고친 사람의 뜻은 "다시 보겠다"에 가깝다.
  if (q.step >= q.questions.length - 1) {
    if (first) { submitQuiz(); return; }
    render();
    return;
  }
  // 고른 게 잠깐 보이도록 한 박자 쉬고 넘어간다. 곧바로 바뀌면 눌렀는지도 모른다.
  render();
  setTimeout(() => { q.step++; state.showTips = false; render(); }, 260);
}

function stepQuiz(delta) {
  const q = state.quiz;
  if (!q || q.done) return;
  q.step = Math.min(Math.max(q.step + delta, 0), q.questions.length - 1);
  state.showTips = false;
  state.error = '';
  render();
}

async function submitQuiz() {
  const q = state.quiz;
  if (!q || q.picked.length !== q.questions.length) {
    state.error = '모든 문제를 골라 주세요.'; render(); return;
  }
  await withBusy(async () => {
    const r = await api('/mini/api/quiz', {
      method: 'POST', body: { payload: q.payload, sig: q.sig, answers: q.picked },
    });
    state.tokens = r.balance ?? state.tokens;
    state.quiz = { ...q, done: r };
  });
}

// ── 안도령 부풀리기 ──
// 서버가 목표 횟수와 발급 시각을 서명해 준다. 다 두드리면 그걸 그대로 돌려주고,
// 서버가 서명과 걸린 시간을 확인한 뒤 토큰을 준다.
async function startPop() {
  await withBusy(async () => {
    const r = await api('/mini/api/pop');
    state.pop = { ...r, count: 0, popped: false, done: null };
    go('pop');
  });
}

function tapPop() {
  const p = state.pop;
  if (!p || p.popped) return;
  p.count++;
  if (p.count >= p.taps) {
    p.popped = true;
    // 터지는 순간을 보여주고 나서 결과로 넘어간다. 곧장 화면을 갈아 끼우면
    // 30번 두드린 보람이 없다.
    const el = document.getElementById('pop-oracle');
    const stage = document.querySelector('.pop-stage');
    if (el) el.classList.add('burst');
    if (stage) {
      // 사방으로 흩어지는 조각. 요소를 미리 만들어 두지 않고 그때 붙였다 지운다.
      for (let i = 0; i < 14; i++) {
        const s = document.createElement('span');
        s.className = 'spark';
        const angle = (Math.PI * 2 * i) / 14;
        s.style.setProperty('--dx', `${Math.cos(angle) * 130}px`);
        s.style.setProperty('--dy', `${Math.sin(angle) * 130}px`);
        s.textContent = ['✦', '✧', '·'][i % 3];
        stage.appendChild(s);
      }
    }
    claimPop(700);
    return;
  }
  // 두드릴 때마다 다시 그리면 무겁다. 크기만 직접 만진다.
  const el = document.getElementById('pop-oracle');
  const wrap = document.getElementById('pop-bar');
  if (el) {
    el.style.transform = `scale(${1 + (p.count / p.taps) * 0.9})`;
    el.classList.remove('bump');
    void el.offsetWidth;          // 애니메이션 재시작
    el.classList.add('bump');
  }
  if (wrap) wrap.style.width = `${Math.round((p.count / p.taps) * 100)}%`;
}

async function claimPop(delayMs = 0) {
  const p = state.pop;
  // 터지는 연출이 끝날 시간을 준다. 서버 호출은 그 사이에 함께 진행한다.
  const shown = delayMs ? new Promise(r => setTimeout(r, delayMs)) : null;
  try {
    const r = await api('/mini/api/pop', {
      method: 'POST', body: { issuedAt: p.issuedAt, sig: p.sig, taps: p.count },
    });
    state.tokens = r.balance ?? state.tokens;
    state.pop = { ...p, done: r };
  } catch (e) {
    state.pop = { ...p, done: { message: e?.message || '보상을 받지 못했어요.' } };
  }
  if (shown) await shown;
  render();
}

/** 산가지 뽑기. 서버를 부르지 않는 무료 재미다 — 결과에 토큰이 걸리면 사행성이 된다. */
function drawStick() {
  const s = SANGAJI[Math.floor(Math.random() * SANGAJI.length)];
  state.stick = s;
  go('stick');
}

// ── 광고 보고 토큰 받기 ─────────────────────────────────────
//
// 보상은 SDK 가 'userEarnedReward' 를 보낼 때만 준다. 광고를 닫기만 한 경우
// (dismissed)에는 주지 않는다 — 그렇게 하면 광고를 띄우고 바로 닫아도 토큰이 나온다.
// 하루 상한은 서버가 쥐고 있어서 클라이언트를 고쳐도 넘길 수 없다.
async function watchAd() {
  if (!AD_UNIT_ID) { state.toast = '광고가 아직 준비되지 않았어요.'; render(); return; }
  state.busy = true; state.error = ''; render();

  let rewarded = false;
  const finish = async () => {
    state.busy = false;
    if (!rewarded) { render(); return; }
    try {
      const r = await api('/mini/api/ad-reward', { method: 'POST', body: {} });
      state.tokens = r.balance ?? state.tokens;
      state.toast = r.message || '';
    } catch (e) {
      state.error = e?.message || '보상 지급에 실패했어요.';
    }
    render();
  };

  try {
    await new Promise((resolve, reject) => {
      GoogleAdMob.loadAppsInTossAdMob({
        options: { adUnitId: AD_UNIT_ID },
        onEvent: (e) => { if (e?.type === 'loaded') resolve(); },
        onError: reject,
      });
    });
    GoogleAdMob.showAppsInTossAdMob({
      options: { adUnitId: AD_UNIT_ID },
      onEvent: (e) => {
        if (e?.type === 'userEarnedReward') rewarded = true;
        if (e?.type === 'dismissed' || e?.type === 'failedToShow') finish();
      },
      onError: () => finish(),
    });
  } catch (e) {
    state.busy = false;
    state.error = `광고를 불러오지 못했어요. (${e?.message || e})`;
    render();
  }
}

// ── 공유 카드 ──────────────────────────────────────────────

function shareCard() {
  const r = state.result;
  if (!r) return;
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#141009'); g.addColorStop(1, '#060608');
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  x.strokeStyle = 'rgba(201,169,110,0.25)'; x.lineWidth = 2;
  x.strokeRect(48, 48, W - 96, H - 96);

  x.textAlign = 'center';
  x.fillStyle = '#c9a96e';
  x.font = '64px serif';
  x.fillText(r.item.icon, W / 2, 210);
  x.font = '600 60px sans-serif';
  x.fillStyle = '#e8d4a8';
  x.fillText(r.item.label, W / 2, 300);

  // 본문은 넉넉히 줄바꿈해서 넣는다. 다 안 들어가면 잘라내고 말줄임표를 붙인다.
  x.font = '38px sans-serif';
  x.fillStyle = '#e9e4da';
  x.textAlign = 'left';
  const maxW = W - 200;
  let y = 420;
  const words = String(r.body).replace(/\s+/g, ' ').split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (x.measureText(test).width > maxW) {
      x.fillText(line, 100, y); y += 58; line = w;
      if (y > H - 260) { x.fillText('…', 100, y); line = ''; break; }
    } else line = test;
  }
  if (line) x.fillText(line, 100, y);

  x.textAlign = 'center';
  x.fillStyle = 'rgba(201,169,110,0.75)';
  x.font = '600 44px serif';
  x.fillText('MY;安', W / 2, H - 130);
  x.fillStyle = 'rgba(233,228,218,0.4)';
  x.font = '28px sans-serif';
  x.fillText('AI가 만든 참고용 콘텐츠입니다', W / 2, H - 80);

  // 토스 웹뷰에서는 <a download> 가 아무 일도 하지 않는다(다운로드가 막혀 있다).
  // SDK 의 saveBase64Data 로 앨범에 저장해야 한다. 지원하지 않는 구버전 앱에서만
  // 링크 방식으로 물러선다.
  const base64 = c.toDataURL('image/png').split(',')[1];
  const fileName = `myan-${r.item.id}.png`;
  saveBase64Data({ data: base64, fileName, mimeType: 'image/png' })
    .then(() => { state.toast = '앨범에 저장했어요.'; render(); })
    .catch((e) => {
      console.warn('[save]', e);
      try {
        const a = document.createElement('a');
        a.href = c.toDataURL('image/png');
        a.download = fileName;
        a.click();
      } catch { /* 여기까지 실패하면 알려주는 수밖에 없다 */ }
      state.toast = '저장하지 못했어요. 화면을 캡처해 주세요.';
      render();
    });
}

/**
 * 사진을 긴 변 1280px, JPEG 로 줄인다.
 * 요즘 휴대폰 사진은 5~12MB 라서 그대로 보내면 업로드도 오래 걸리고 서버에서도 막힌다.
 * "다른 사진을 고르세요"라고 돌려보내는 대신 앱이 알아서 줄인다.
 */
function shrinkImage(file, maxSide = 1280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 열지 못했어요.')); };
    img.src = url;
  });
}

// ── 공통 ──────────────────────────────────────────────────

async function withBusy(fn) {
  state.busy = true; state.error = ''; render();
  try {
    await fn();
  } catch (e) {
    state.error = e?.message || '오류가 발생했습니다.';
    if (e?.network && e.origin) state.error += `\n(요청 출처: ${e.origin})`;
  } finally {
    state.busy = false; render();
  }
}

// ── 화면 이동과 뒤로가기 ─────────────────────────────────────
//
// 토스 웹뷰에서 뒤로가기(제스처·하드웨어 버튼)는 브라우저 이력을 따라간다. 이력이
// 하나도 없으면 그 뒤로가기가 곧 **앱 종료**다. 실제로 사주를 보는 도중에 뒤로가기를
// 누르면 앱이 꺼졌다.
//
// 그래서 화면을 옮길 때마다 이력을 쌓고, popstate 에서 앱 안에서 되돌아간다.
// 홈에서 다시 뒤로가면 그때는 이력이 바닥이라 앱이 닫힌다 — 그게 사용자가 기대하는 동작이다.
//
// 로딩 화면은 쌓지 않고 갈아 끼운다(replace). 결과를 기다리다 뒤로가면 로딩이 아니라
// 그 앞 화면으로 돌아가야 자연스럽다.
// 화면 스택. 토스 웹뷰의 뒤로가기는 **브라우저 이력을 타지 않는다** — 네이티브가
// graniteEvent 의 backEvent 로 알려주고, 앱이 아무것도 안 하면 웹뷰가 그대로 닫힌다.
// 그래서 history API 대신 우리가 직접 스택을 들고 있다가 되돌린다.
const _stack = [];

function go(screen, { fromBack = false } = {}) {
  state.menu = false;                       // 어디로 가든 메뉴는 닫고 간다
  if (!fromBack && state.screen && state.screen !== screen) {
    // 로딩은 쌓지 않는다. 기다리다 뒤로가면 로딩이 아니라 그 앞 화면으로 돌아가야 한다.
    if (state.screen !== 'loading' && state.screen !== 'boot') _stack.push(state.screen);
  }
  state.screen = screen;
  render();
}

function goBack() {
  // 메뉴가 열려 있으면 그것부터 닫는다. 화면을 넘기기 전에 덮인 것을 걷어내는 게
  // 사용자가 기대하는 순서다.
  if (state.menu) { state.menu = false; render(); return; }
  const prev = _stack.pop();
  if (prev) { go(prev, { fromBack: true }); return; }
  // 스택이 비었으면 더 돌아갈 곳이 없다 — 그때는 앱을 닫는 게 기대되는 동작이다.
  closeView().catch(() => {});
}

// 네이티브 뒤로가기(제스처·하드웨어 버튼)를 받는다.
try {
  graniteEvent.addEventListener('backEvent', {
    onEvent: () => goBack(),
    onError: (e) => console.warn('[back]', e),
  });
} catch (e) {
  console.warn('[back] 구독 실패', e);
}

// 안드로이드 일부 환경은 브라우저 이력도 함께 움직인다. 그쪽으로도 들어오면 같이 처리한다.
window.addEventListener('popstate', () => goBack());

// ── 화면 ──────────────────────────────────────────────────

const AI_NOTICE =
  '이 콘텐츠는 생성형 AI(Google Gemini)가 만든 것으로, 재미로 보는 참고용입니다. '
  + '의학, 법률, 재무 등 중요한 결정의 근거로 삼지 마세요.';

/** 기록의 날짜. 서버는 유닉스 초로 주는데 그대로 찍으면 숫자만 보인다. */
function _histDate(h) {
  const v = h.createdAt ?? h.created_at;
  if (!v) return '';
  const ms = typeof v === 'number' ? v * 1000 : Date.parse(v);
  if (!Number.isFinite(ms)) return String(v).slice(0, 10);
  return new Date(ms + 9 * 3600000).toISOString().slice(0, 10);   // KST
}

// 목록에 보일 앞머리. 잘라낸 게 있을 때만 말줄임을 붙인다 — 짧은 풀이에까지 붙으면
// 뒤에 더 있는 줄 알고 눌러 보게 된다.
function _preview(h, max = 100) {
  const text = String(h.content || h.reading || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}

const FOOTER = `<footer><p class="muted">
  사업자 마이안 · 대표 안태현 · 사업자등록번호 501-33-63980<br>
  <a href="${API}/terms">이용약관</a> · <a href="${API}/privacy-policy">개인정보처리방침</a>
</p></footer>`;

// 기다리는 동안 문구가 차례로 바뀐다. 한 문장을 붙잡고 있으면 멈춘 것처럼 보이는데,
// 순서대로 넘어가면 "지금 이 단계를 하고 있구나"로 읽힌다.
const LOADING_LINES = [
  '안도령이 붓을 고르는 중입니다',
  '오늘의 일진을 펼쳐 보는 중입니다',
  '사주의 오행을 헤아리는 중입니다',
  '기운의 결을 따라가는 중입니다',
  '풀이를 글로 옮기는 중입니다',
  '마지막으로 다듬는 중입니다',
];

// 안도령 둘레를 도는 오행. 상생 순서(木火土金水)로 놓아 도는 방향에 뜻이 있게 했다.
const ORBIT = [
  { ch: '木', color: '#5d9e6f' }, { ch: '火', color: '#c0563f' },
  { ch: '土', color: '#c9a96e' }, { ch: '金', color: '#e6e2d8' },
  { ch: '水', color: '#4a7bb0' },
];

let _loadingTimer = null;

function startLoadingTicker() {
  stopLoadingTicker();
  let i = 0;
  _loadingTimer = setInterval(() => {
    // 마지막 문구에 닿으면 거기서 멈춘다. 계속 돌면 끝나지 않는 것처럼 보인다.
    if (i >= LOADING_LINES.length - 1) { stopLoadingTicker(); return; }
    i++;
    const el = document.getElementById('load-line');
    if (!el) { stopLoadingTicker(); return; }
    el.style.opacity = '0';
    setTimeout(() => { el.textContent = LOADING_LINES[i]; el.style.opacity = '1'; }, 260);
  }, 2600);
}

function stopLoadingTicker() {
  if (_loadingTimer) { clearInterval(_loadingTimer); _loadingTimer = null; }
}

// 메뉴에 담기는 것들. 홈 아래쪽에 흩어져 있던 것을 한자리에 모았다.
const MENU_ITEMS = [
  { id: 'btn-earn',        icon: 'secGift',  label: '무료 토큰 받기', sub: '출석 · 퀴즈 · 부풀리기' },
  { id: 'btn-history',     icon: 'saju',     label: '지난 기록',      sub: '풀이를 다시 볼 수 있어요' },
  { id: 'btn-editprofile', icon: 'secProfile', label: '내 정보',      sub: '이름 · 생년월일 · 화면 밝기' },
  { id: 'btn-shareapp',    icon: 'share',    label: '친구에게 알리기', sub: '' },
];

function header() {
  // 좌우 칸의 폭을 같게 두어야 제목이 진짜 가운데에 온다. 예전에는 오른쪽에 토큰
  // 알약이 있어서 그 폭만큼 제목이 왼쪽으로 밀렸다.
  const back = state.screen === 'home'
    ? '<span class="tb-slot"></span>'
    : '<button class="tb-slot tb-back" id="btn-home" aria-label="뒤로">‹</button>';
  // headbar 로 감싸는 이유: 메뉴 시트가 이 상자를 기준으로 자리를 잡아야
  // 메뉴 단추 바로 아래 오른쪽 끝에 맞아떨어진다.
  return `<div class="headbar">
    <div class="topbar">
      ${back}
      <span class="tb-title">MY;安</span>
      <button class="tb-slot tb-menu" id="btn-menu" aria-label="메뉴"
        aria-expanded="${state.menu ? 'true' : 'false'}">${icon('menu')}</button>
    </div>
    <div class="tokenbar">
      ${state.screen === 'home' ? `
        <button class="tb-earn" id="btn-earn2">
          <span class="tb-earn-ic">${icon('secGift')}</span>무료로 받기
        </button>` : ''}
      <button class="tb-token" id="btn-charge">${state.tokens} 토큰</button>
    </div>
    ${state.menu ? `
      <div class="menu-scrim" id="btn-menu-close"></div>
      <nav class="menu-sheet" aria-label="메뉴">
        ${MENU_ITEMS.map(m => `
          <button class="menu-item" id="${m.id}" ${m.id === 'btn-shareapp' && state.busy ? 'disabled' : ''}>
            <span class="menu-ic">${icon(m.icon)}</span>
            <span class="menu-text"><b>${m.label}</b>${m.sub ? `<i>${m.sub}</i>` : ''}</span>
          </button>`).join('')}
      </nav>` : ''}
  </div>`;
}

function render() {
  // 여는 화면이 도는 동안에는 아무것도 그리지 않는다. boot() 이 먼저 끝나면
  // 연출을 덮어써 버려서, 문이 열리다 말고 홈이 튀어나온다.
  if (state.splashing) return;

  const err = state.error ? `<p class="err">${esc(state.error)}</p>` : '';
  let html;
  // 한 번 보여준 안내는 다음 렌더에 남지 않는다.
  const toast = state.toast ? `<div class="toast">${esc(state.toast)}</div>` : '';
  state.toast = '';

  switch (state.screen) {
    case 'login':
      html = `
        <div class="brand"><h1>MY;安</h1><p>사주와 오늘의 기운이 만나는 자리</p></div>
        <div class="card">
          <h2>토스로 시작하기</h2>
          <p class="muted">토스 계정으로 안전하게 로그인해요. 별도 가입이 없습니다.</p>
          <button class="btn" id="btn-login" style="margin-top:16px" ${state.busy ? 'disabled' : ''}>
            ${state.busy ? '연결 중…' : '토스로 로그인'}
          </button>
          ${err}
        </div>
        <div class="ai-notice">${AI_NOTICE}</div>
        ${FOOTER}`;
      break;

    case 'profile': {
      const p = state.profile || {};
      // 처음 설정하는 사람과 이미 쓰고 있는 사람은 필요한 게 다르다.
      // 처음이면 "생년월일을 받는 화면", 그다음부터는 "내 것을 확인하고 고치는 화면"이다.
      const setup = !p.birthYear;
      const genderLabel = GENDERS.find(g => g.v === p.gender)?.label || '';
      const sijiLabel = (SIJI.find(([v]) => v === (p.birthHour || ''))?.[1] || '')
        .replace(/^\S+\s/, '');   // 요약 줄에서는 앞의 그림글자를 뺀다

      html = `
        ${setup ? '<div class="brand"><h1>MY;安</h1></div>' : `
          ${header()}
          <section class="hero mypage">
            <div class="hero-sky"></div>
            <div class="hero-text">
              <p class="hero-date">내 정보</p>
              <h2 class="hero-hi">${esc(p.name || '이름 없음')}</h2>
              <div class="mp-facts">
                <span>${esc(p.birthYear)}. ${esc(p.birthMonth)}. ${esc(p.birthDay)}</span>
                ${sijiLabel ? `<span>${esc(sijiLabel)}</span>` : '<span class="dim">시각 모름</span>'}
                ${genderLabel ? `<span>${esc(genderLabel)}</span>` : '<span class="dim">성별 미입력</span>'}
              </div>
            </div>
            <div class="mp-token"><b>${state.tokens}</b><span>토큰</span></div>
          </section>`}
        <section class="sec">
          <h3><span class="sec-icon">${icon('secProfile')}</span>${setup ? '생년월일' : '사주 정보'}<i class="rule"></i></h3>
        <div class="card">
          ${setup ? '<p class="muted" style="margin-bottom:2px">사주를 계산하는 데 필요해요. 태어난 시각까지 넣으면 더 정확해집니다.</p>' : ''}
          <label>이름 (선택)</label>
          <input id="f-name" value="${esc(p.name || '')}" placeholder="어떻게 불러드릴까요">
          <label>생년월일</label>
          <div class="grid3">
            <input id="f-y" type="number" inputmode="numeric" placeholder="1990" value="${esc(p.birthYear || '')}">
            <input id="f-m" type="number" inputmode="numeric" placeholder="5" value="${esc(p.birthMonth || '')}">
            <input id="f-d" type="number" inputmode="numeric" placeholder="15" value="${esc(p.birthDay || '')}">
          </div>
          <label>태어난 시각</label>
          <select id="f-h">${SIJI.map(([v, l]) =>
            `<option value="${v}"${v === (p.birthHour || '') ? ' selected' : ''}>${l}</option>`).join('')}</select>
          <label>성별</label>
          <div class="seg">${GENDERS.map(g =>
            `<button type="button" class="seg-btn${g.v === (p.gender || '') ? ' on' : ''}" data-gender="${g.v}">${g.label}</button>`).join('')}</div>
          <p class="muted small">대운 풀이는 남녀에 따라 흐름이 반대로 갑니다.</p>
          <button class="btn" id="btn-save" style="margin-top:20px" ${state.busy ? 'disabled' : ''}>
            ${state.busy ? '저장 중…' : setup ? '저장하고 시작하기' : '저장하기'}
          </button>
          ${err}
        </div>
        </section>

        <section class="sec">
          <h3><span class="sec-icon">${icon('secScreen')}</span>화면<i class="rule"></i></h3>
          <div class="card">
            <div class="seg">
              <button type="button" class="seg-btn${currentTheme() === 'dark' ? ' on' : ''}" data-theme="dark">어둡게</button>
              <button type="button" class="seg-btn${currentTheme() === 'light' ? ' on' : ''}" data-theme="light">밝게</button>
            </div>
            <p class="muted small" style="margin-top:10px">고르지 않으면 휴대폰 설정을 따라갑니다.</p>
          </div>
        </section>

        ${setup ? '' : `
        <section class="sec">
          <h3><span class="sec-icon">${icon('secAccount')}</span>계정<i class="rule"></i></h3>
          <div class="card">
            <button class="btn ghost" id="btn-logout">로그아웃</button>
            <p class="muted small" style="margin-top:10px">
              토큰과 지난 기록은 계정에 남아 있어요. 다시 로그인하면 그대로 쓰실 수 있습니다.
            </p>
          </div>
        </section>`}
        ${FOOTER}`;
      break;
    }

    case 'home': {
      const p = state.profile || {};
      html = `
        ${header()}
        ${(() => {
          const m = moonToday();
          const d = new Date(Date.now() + 9 * 3600000);
          return `
          <section class="hero">
            <div class="hero-sky"></div>
            <div class="hero-moon">${m.icon}</div>
            <div class="hero-text">
              <p class="hero-date">${d.getMonth() + 1}월 ${d.getDate()}일 · ${esc(m.name)}</p>
              <h2 class="hero-hi">${p.name ? `${esc(p.name)}님,<br>오늘은 어떤 기운일까요` : '오늘은 어떤 기운일까요'}</h2>
            </div>
          </section>`;
        })()}
        ${err}
        ${SECTIONS.map(sec => `
          <section class="sec">
            <h3><span class="sec-icon">${icon(sec.icon)}</span>${sec.title}<i class="rule"></i></h3>
            <div class="tiles">
              ${sec.items.map(it => `
                <button class="tile" data-item="${it.id}">
                  <span class="t-icon">${icon(it.icon)}</span>
                  <span class="t-label">${it.label}</span>
                  <span class="t-cost${it.cost ? '' : ' free'}">${it.cost ? `${it.cost} 토큰` : '무료'}</span>
                </button>`).join('')}
            </div>
          </section>`).join('')}
        <div class="ai-notice">${AI_NOTICE}</div>
        ${FOOTER}`;
      break;
    }

    case 'earn':
      html = `${header()}
        <section class="sec">
          <h3><span class="sec-icon">${icon('secGift')}</span>무료 토큰 받기<i class="rule"></i></h3>
          <p class="muted small" style="margin:-4px 0 12px">모두 하루에 한 번씩 하실 수 있어요</p>
        </section>
        ${err}
        <div class="tiles">
          <button class="tile" id="btn-checkin">
            <span class="t-icon">${icon('checkin')}</span><span class="t-label">출석 도장</span>
            <span class="t-cost">${state.checkin ? `${state.checkin.streak}일째` : '7일 개근 3토큰'}</span>
          </button>
          <button class="tile" id="btn-quiz">
            <span class="t-icon">${icon('quiz')}</span><span class="t-label">안도령의 오행 퀴즈</span>
            <span class="t-cost">2개 맞히면 1토큰</span>
          </button>
          <button class="tile" id="btn-pop">
            <span class="t-icon">${icon('pop')}</span><span class="t-label">안도령 부풀리기</span>
            <span class="t-cost">1토큰 · 하루 1번</span>
          </button>
          ${AD_UNIT_ID ? `<button class="tile" id="btn-ad">
            <span class="t-icon">${icon('ad')}</span><span class="t-label">광고 보기</span>
            <span class="t-cost">${AD_TOKENS}토큰 + 퀴즈·부풀리기 기회 1회</span>
          </button>` : ''}
        </div>
        <button class="btn ghost" id="btn-home2" style="margin-top:16px">홈으로</button>
        ${FOOTER}`;
      break;

    case 'need': {
      const it = state.item;
      html = `${header()}
        <div class="brand sm"><h1><span class="ic-title">${icon(it.icon)}</span> ${esc(it.label)}</h1>
          <p>${it.cost} 토큰</p></div>
        <div class="card">${needForm(it)}${err}
          <button class="btn" id="btn-run" style="margin-top:18px">보기</button>
        </div>
        ${FOOTER}`;
      break;
    }

    case 'loading':
      html = `${header()}
        <div class="loading">
          <div class="orbit-stage">
            <div class="orbit-halo"></div>
            <img src="${API}/andoryeong.svg" alt="" class="oracle" onerror="this.style.display='none'">
            ${ORBIT.map((o, i) => `<span class="orb" style="
                --a:${(360 / ORBIT.length) * i}deg; color:${o.color};
                animation-delay:${-i * 1.4}s">${o.ch}</span>`).join('')}
          </div>
          <p class="muted load-line" id="load-line">${esc(LOADING_LINES[0])}</p>
          <p class="muted small">${esc(state.item?.label || '')}</p>
          <p class="muted small" style="margin-top:14px">풀이는 지난 기록에도 저장돼요</p>
        </div>`;
      break;

    case 'result': {
      const r = state.result || {};
      // 카드를 뽑았으면 먼저 뒷면만 보여주고, 눌러서 뒤집게 한다.
      if (state.reveal) {
        html = `${header()}
          <div class="brand sm"><h1><span class="ic-title">${icon(r.item.icon)}</span> ${esc(r.item.label)}</h1>
            <p>카드를 눌러 뒤집어 보세요</p></div>
          <div class="card-stage">
            <button class="tarot" id="btn-reveal" aria-label="카드 뒤집기">
              <span class="tarot-back">✦</span>
            </button>
          </div>`;
        break;
      }
      const paras = String(r.body || '').split(/\n{2,}|\n/).filter(Boolean)
        .map(t => `<p>${esc(t)}</p>`).join('');
      html = `${header()}
        <section class="hero result">
          <div class="hero-sky"></div>
          <div class="hero-text">
            <p class="hero-date">안도령의 풀이</p>
            <h2 class="hero-hi"><span class="ic-title">${icon(r.item.icon)}</span>${esc(r.item.label)}</h2>
            ${r.extras?.length ? `<div class="mp-facts">${r.extras.map(e =>
              `<span><i>${esc(e.label)}</i>${esc(e.value)}</span>`).join('')}</div>` : ''}
          </div>
        </section>
        ${r.card ? `<div class="card-stage"><div class="tarot flipped">
            <span class="tarot-face">${esc(r.card.icon || '🔮')}<b>${esc(r.card.name || '')}</b>
            ${r.upright === false ? '<i>역방향</i>' : '<i>정방향</i>'}</span>
          </div></div>` : ''}
        <div class="card reading">${paras || '<p class="muted">내용을 불러오지 못했어요.</p>'}</div>
        <div class="row2">
          <button class="btn ghost" id="btn-share">이미지로 저장</button>
          <button class="btn ghost" id="btn-home2">홈으로</button>
        </div>
        <button class="btn ghost" id="btn-shareapp" style="margin-top:10px"
          ${state.busy ? 'disabled' : ''}>친구에게 알리기</button>
        <div class="ai-notice">${AI_NOTICE}</div>
        ${FOOTER}`;
      break;
    }

    case 'history':
      html = `${header()}
        <section class="sec">
          <h3><span class="sec-icon">${icon('saju')}</span>지난 기록<i class="rule"></i></h3>
          ${state.history.length
            ? '<p class="muted small" style="margin:-6px 0 12px">눌러서 전체를 볼 수 있어요</p>' : ''}
        </section>
        ${state.history.length ? state.history.map((h, i) => `
          <button class="card hist" data-hist="${i}">
            <div class="row"><b>${esc(h.title || h.feature || '')}</b>
              <span class="muted small">${esc(_histDate(h))}</span></div>
            <p class="muted">${esc(_preview(h))}</p>
            <span class="hist-more">전체 보기 ›</span>
          </button>`).join('')
        : '<div class="card"><p class="muted">아직 기록이 없어요.</p></div>'}
        <button class="btn ghost" id="btn-home2">홈으로</button>
        ${FOOTER}`;
      break;

    case 'histview': {
      const h = state.history[state.histIndex] || {};
      // 잘라서 보여주면 정작 다시 보려고 들어온 사람이 못 본다. 전부 그린다.
      const paras = String(h.content || h.reading || '').split(/\n{2,}|\n/).filter(Boolean)
        .map(t => `<p>${esc(t)}</p>`).join('');
      html = `${header()}
        <section class="hero result">
          <div class="hero-sky"></div>
          <div class="hero-text">
            <p class="hero-date">${esc(_histDate(h))}</p>
            <h2 class="hero-hi">${esc(h.title || h.feature || '')}</h2>
          </div>
        </section>
        <div class="card reading">${paras || '<p class="muted">내용이 없어요.</p>'}</div>
        <div class="row2">
          <button class="btn ghost" id="btn-hist-back">목록으로</button>
          <button class="btn ghost" id="btn-home2">홈으로</button>
        </div>
        <div class="ai-notice">${AI_NOTICE}</div>
        ${FOOTER}`;
      break;
    }

    case 'quiz': {
      const q = state.quiz;
      if (!q) { html = ''; break; }
      const done = q.done;
      html = `${header()}
        <div class="brand sm"><h1><span class="ic-title">${icon('quiz')}</span>안도령의 오행 퀴즈</h1>
          <p>${done ? '' : '안도령이 내는 문제예요. 두 개 이상 맞히면 토큰 1개'}</p></div>
        ${done || !q.tips?.length ? '' : `
          <div class="card hint">
            <button class="hint-toggle" id="btn-tips">
              ${state.showTips ? '▾' : '▸'} 안도령의 귀띔 ${state.showTips ? '' : '(모르겠으면 열어보세요)'}
            </button>
            ${state.showTips ? `<ul class="tips">${q.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
          </div>`}
        ${done ? `
          <div class="card"><p>${esc(done.message)}</p>
            ${!done.granted && done.allRight && AD_UNIT_ID
              ? '<p class="muted small" style="margin-top:8px">광고를 보면 한 번 더 도전할 수 있어요</p>' : ''}
          </div>
          ${q.questions.map((item, i) => `
            <div class="card">
              <p><b>${esc(item.q)}</b></p>
              <p class="mark ${done.results[i]?.correct ? 'ok' : 'no'}">
                ${done.results[i]?.correct
                  ? '<i>○</i>맞히셨어요'
                  : `<i>✕</i>정답은 &ldquo;${esc(item.c[done.results[i]?.answer] || '')}&rdquo;`}
              </p>
              <p class="muted small">${esc(done.results[i]?.why || '')}</p>
            </div>`).join('')}
          <button class="btn ghost" id="btn-home2">홈으로</button>
        ` : (() => {
          const i = q.step;
          const item = q.questions[i];
          const total = q.questions.length;
          return `
          <div class="quiz-progress">
            ${q.questions.map((_, k) => `<span class="dot${k < i ? ' done' : k === i ? ' now' : ''}"></span>`).join('')}
            <span class="muted small">${i + 1} / ${total}</span>
          </div>
          <div class="card">
            <p><b>${esc(item.q)}</b></p>
            <div class="choices">
              ${item.c.map((c, j) => `
                <button class="seg-btn${q.picked[i] === j ? ' on' : ''}"
                        data-a="${j}" ${state.busy ? 'disabled' : ''}>${esc(c)}</button>`).join('')}
            </div>
          </div>
          ${err}
          <div class="row2" style="margin-top:12px">
            ${i > 0
              ? '<button class="btn ghost" id="btn-quiz-prev">이전 문제</button>'
              : '<span></span>'}
            ${q.picked[i] == null ? '<span></span>'
              : i < total - 1
                ? '<button class="btn ghost" id="btn-quiz-next">다음 문제</button>'
                // 마지막 문제로 되돌아와 답을 바꾼 경우. 자동 제출하지 않으므로
                // 직접 낼 수 있는 버튼이 있어야 한다.
                : `<button class="btn" id="btn-quiz-submit" ${state.busy ? 'disabled' : ''}>제출하기</button>`}
          </div>
          <p class="muted small" style="text-align:center">
            ${i > 0 ? '이전 문제로 돌아가 답을 바꿀 수 있어요' : '고르면 다음 문제로 넘어가요'}
          </p>`;
        })()}
        ${FOOTER}`;
      break;
    }

    case 'pop': {
      const p = state.pop;
      if (!p) { html = ''; break; }
      html = `${header()}
        <div class="brand sm"><h1><span class="ic-title">${icon('pop')}</span>안도령 부풀리기</h1>
          <p>${p.done ? '' : `${p.taps}번 두드리면 펑!`}</p></div>
        ${p.done ? `
          <div class="card" style="text-align:center;padding:30px 22px">
            <div class="burst"><span>✦</span><span>✧</span><span>✦</span></div>
            <p>${esc(p.done.message)}</p>
            ${p.done.remainToday === 0 && AD_UNIT_ID
              ? '<p class="muted small" style="margin-top:10px">광고를 보면 한 번 더 할 수 있어요</p>' : ''}
          </div>
          <div class="row2">
            ${p.done.remainToday > 0
              ? '<button class="btn ghost" id="btn-pop">한 번 더</button>'
              : (AD_UNIT_ID ? '<button class="btn ghost" id="btn-ad">광고 보고 한 번 더</button>' : '<span></span>')}
            <button class="btn ghost" id="btn-home2">홈으로</button>
          </div>
        ` : `
          <div class="pop-stage">
            <button class="pop-btn" id="pop-tap" aria-label="두드리기">
              <img id="pop-oracle" src="${API}/andoryeong.svg" alt=""
                   onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🧙',style:'font-size:5rem'}))">
            </button>
          </div>
          <div class="pop-track"><div class="pop-fill" id="pop-bar"></div></div>
          <p class="muted small" style="text-align:center;margin-top:10px">화면을 두드려 주세요</p>
        `}
        ${FOOTER}`;
      break;
    }

    case 'stick': {
      const s = state.stick || {};
      html = `${header()}
        <div class="brand sm"><h1><span class="ic-title">${icon('stick')}</span>산가지</h1></div>
        <div class="card" style="text-align:center;padding:34px 22px">
          <div style="font-size:3.4rem;color:var(--gold-light);font-family:'Batang',serif">${esc(s.n || '')}</div>
          <div style="color:var(--gold);margin:10px 0 16px;font-size:1.1rem">${esc(s.t || '')}</div>
          <p>${esc(s.m || '')}</p>
        </div>
        <div class="row2">
          <button class="btn ghost" id="btn-stick">다시 뽑기</button>
          <button class="btn ghost" id="btn-home2">홈으로</button>
        </div>
        <div class="ai-notice">산가지는 재미로 보는 것이며, 토큰이 걸려 있지 않습니다.</div>
        ${FOOTER}`;
      break;
    }

    case 'charge': {
      // 콘솔에 등록된 상품을 우선 보여준다. 아직 못 받았으면 코드에 적어 둔 목록으로
      // 그린다(콘솔 등록 전에는 눌러도 실패하므로 그 사실을 함께 알린다).
      const list = state.catalog ?? PRODUCTS.map(p => ({ ...p, known: true }));
      html = `${header()}
        <div class="brand sm"><h1>토큰 충전</h1><p>현재 ${state.tokens} 토큰</p></div>
        ${err}
        ${state.catalogError ? `<div class="card"><p class="err">${esc(state.catalogError)}</p>
          <p class="muted small">앱인토스 콘솔에서 인앱 상품을 먼저 등록해야 결제가 열립니다.</p></div>` : ''}
        ${list.map(p => `
          <button class="tile wide" data-sku="${esc(p.sku)}"${p.known === false ? ' disabled' : ''}>
            <span class="t-label">${esc(p.label)}</span>
            <span class="t-cost">${p.known === false ? '서버 미등록' : esc(p.price || '토스로 결제')}</span>
          </button>`).join('')}
        ${state.catalog === null ? '' : `<p class="muted small" style="text-align:center;margin-top:6px">
          콘솔 등록 상품 ${state.catalog?.length ?? 0}개</p>`}
        <button class="btn ghost" id="btn-home2" style="margin-top:10px">돌아가기</button>
        ${FOOTER}`;
      break;
    }

    default:
      html = `<div class="loading"><div class="spinner"></div></div>`;
  }

  app.innerHTML = toast + html;
  // 로딩 화면에서만 문구를 돌린다. 다른 화면으로 넘어가면 타이머를 반드시 끈다 —
  // 안 그러면 없어진 요소를 계속 찾으며 돈다.
  if (state.screen === 'loading') startLoadingTicker(); else stopLoadingTicker();
  // 버튼 연결이 실패해도 화면은 이미 그려져 있다. 여기서 던지면 로딩 화면이
  // 그대로 남아 "결과가 안 뜬다"로 보인다.
  try { bind(); } catch (e) { console.error('[bind]', e); }
}

function needForm(it) {
  // 오류로 이 화면에 다시 왔을 때 방금 적은 게 남아 있어야 한다.
  const f = state.form || {};
  const p = f.partner || {};
  const sel = (list, cur) => list
    .map(t => `<option value="${t.v}"${t.v === cur ? ' selected' : ''}>${t.label}</option>`).join('');

  switch (it.need) {
    case 'text':
      return `<label>${it.prompt}</label>
        <textarea id="f-text" rows="3" placeholder="${esc(it.placeholder || '')}">${esc(f.text || '')}</textarea>`;
    case 'name':
      return `<label>풀이할 이름</label><input id="f-nm" value="${esc(f.name || '')}" placeholder="예: 안태현">`;
    case 'topic':
      return `<label>어떤 운이 궁금하세요?</label>
        <select id="f-topic">${sel(TOPICS, f.topic)}</select>`;
    case 'purpose': {
      // 언제부터 볼지 고르게 한다. 예전엔 오늘부터 30일로 고정이라
      // "날 고르는 곳이 없다"는 말을 들었다.
      const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);   // KST
      const range = f.days || 30;
      return `<label>무엇을 위한 날인가요?</label>
        <select id="f-purpose">${sel(PURPOSES, f.purpose)}</select>
        <label>언제부터 찾을까요?</label>
        <input id="f-from" type="date" value="${esc(f.from || today)}" min="${today}">
        <label>얼마나 볼까요?</label>
        <select id="f-days">
          ${[[30, '앞으로 한 달'], [60, '앞으로 두 달'], [90, '앞으로 석 달']]
            .map(([v, l]) => `<option value="${v}"${+range === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select>`;
    }
    case 'type':
      return `<label>나의 유형</label>
        <select id="f-my">${sel(OHAENG_TYPES, f.myType)}</select>
        <label>상대의 유형</label>
        <select id="f-pt">${sel(OHAENG_TYPES, f.partnerType)}</select>`;
    case 'partner':
      return `<label>상대방 생년월일</label>
        <div class="grid3">
          <input id="p-y" type="number" inputmode="numeric" placeholder="1990" value="${esc(p.year || '')}">
          <input id="p-m" type="number" inputmode="numeric" placeholder="5" value="${esc(p.month || '')}">
          <input id="p-d" type="number" inputmode="numeric" placeholder="15" value="${esc(p.day || '')}">
        </div>
        <label>태어난 시각 (선택)</label>
        <input id="p-h" placeholder="예: 오전 9시" value="${esc(p.hour || '')}">`;
    case 'photo':
      return `<label>무엇을 볼까요?</label>
        <select id="f-ptype"><option value="face">관상 (얼굴)</option><option value="palm">손금</option></select>
        <label>사진</label>
        <input id="f-photo" type="file" accept="image/*">
        <p class="muted" style="margin-top:8px">사진은 풀이에만 쓰이고, 저장을 원하실 때만 남습니다.</p>`;
    default:
      return '';
  }
}

function collectForm(it) {
  const v = (id) => document.getElementById(id)?.value.trim() || '';
  switch (it.need) {
    case 'text': {
      const t = v('f-text');
      if (it.required && !t) return { error: '내용을 입력해 주세요.' };
      return { text: t };
    }
    case 'name': {
      const n = v('f-nm');
      if (!n) return { error: '이름을 입력해 주세요.' };
      return { name: n };
    }
    case 'topic':   return { topic: v('f-topic') };
    case 'purpose': return { purpose: v('f-purpose'), from: v('f-from'), days: +v('f-days') || 30 };
    case 'type':    return { myType: v('f-my'), partnerType: v('f-pt') };
    case 'partner': {
      const y = v('p-y'), m = v('p-m'), d = v('p-d');
      if (!y || !m || !d) return { error: '상대방 생년월일을 모두 입력해 주세요.' };
      return { partner: { year: +y, month: +m, day: +d, hour: v('p-h') } };
    }
    default: return {};
  }
}

function bind() {
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };

  on('btn-login', doLogin);
  on('btn-charge', () => { state.catalog = undefined; state.catalogError = ''; go('charge'); loadProducts(); });
  on('btn-home', () => go(state.profile?.birthYear ? 'home' : 'profile'));
  on('btn-home2', () => go('home'));
  on('btn-editprofile', () => go('profile'));
  on('btn-history', loadHistory);
  on('btn-logout', () => {
    // 세션만 지운다. 토큰과 기록은 서버의 계정(userKey)에 남아 있어서
    // 다시 로그인하면 그대로 돌아온다.
    localStorage.removeItem(SESSION_KEY);
    Object.assign(state, { session: '', profile: null, tokens: 0, history: [], result: null, error: '' });
    go('login');
  });
  on('btn-menu', () => { state.menu = !state.menu; render(); });
  on('btn-menu-close', () => { state.menu = false; render(); });
  on('btn-earn', () => go('earn'));
  on('btn-earn2', () => go('earn'));      // 홈 토큰 줄의 작은 길잡이
  on('btn-share', shareCard);
  on('btn-shareapp', () => { state.menu = false; render(); shareApp(); });
  on('btn-checkin', doCheckin);
  on('btn-quiz', startQuiz);
  on('btn-stick', drawStick);
  on('btn-quiz-submit', submitQuiz);
  on('btn-quiz-prev', () => stepQuiz(-1));
  on('btn-quiz-next', () => stepQuiz(1));
  on('btn-tips', () => { state.showTips = !state.showTips; render(); });
  on('btn-pop', startPop);
  on('btn-hist-back', () => go('history'));
  for (const el of document.querySelectorAll('[data-hist]')) {
    el.onclick = () => { state.histIndex = +el.dataset.hist; go('histview'); };
  }
  const tap = document.getElementById('pop-tap');
  if (tap) {
    // click 은 모바일에서 300ms 가까이 늦는다. 연타에는 pointerdown 이 맞다.
    tap.onpointerdown = (e) => { e.preventDefault(); tapPop(); };
  }

  // 퀴즈 보기 선택 — 고르면 바로 다음 문제로
  for (const el of document.querySelectorAll('[data-a]')) {
    el.onclick = () => { state.error = ''; answerQuiz(+el.dataset.a); };
  }
  on('btn-ad', watchAd);
  on('btn-reveal', (e) => {
    // 뒤집는 애니메이션이 끝난 뒤에 결과를 보여준다.
    const el = e.currentTarget;
    el.classList.add('flipping');
    setTimeout(() => { state.reveal = false; render(); }, 620);
  });

  // 화면 밝기는 고르는 즉시 바꿔 보여준다 — 저장 버튼을 눌러야 바뀌면 확인이 안 된다.
  for (const el of document.querySelectorAll('[data-theme]')) {
    el.onclick = () => { applyTheme(el.dataset.theme); render(); };
  }

  // 성별은 선택 즉시 화면에 표시만 해 둔다(저장은 '저장하기'에서 한 번에).
  for (const el of document.querySelectorAll('[data-gender]')) {
    el.onclick = () => {
      state.profile = { ...(state.profile || {}), gender: el.dataset.gender };
      render();
    };
  }

  on('btn-save', () => {
    const v = (id) => document.getElementById(id)?.value.trim() || '';
    if (!v('f-y') || !v('f-m') || !v('f-d')) { state.error = '생년월일을 모두 입력해 주세요.'; render(); return; }
    saveProfile({
      name: v('f-name'), birthYear: v('f-y'), birthMonth: v('f-m'),
      birthDay: v('f-d'), birthHour: v('f-h'), gender: state.profile?.gender || '',
    });
  });

  on('btn-run', async () => {
    const it = state.item;
    const form = collectForm(it);
    if (form.error) { state.error = form.error; render(); return; }
    // 사진은 파일을 읽어 base64 로 넘긴다.
    if (it.need === 'photo') {
      const f = document.getElementById('f-photo')?.files?.[0];
      if (!f) { state.error = '사진을 선택해 주세요.'; render(); return; }
      form.photoType = document.getElementById('f-ptype')?.value || 'face';
      // 크다고 돌려보내지 않는다. 앱이 줄여서 보낸다.
      form.image = await shrinkImage(f).catch(() => null);
      if (!form.image) { state.error = '사진을 읽지 못했어요. 다른 사진으로 시도해 주세요.'; render(); return; }
    }
    state.form = form;
    runItem(it);
  });

  for (const el of document.querySelectorAll('[data-item]')) {
    el.onclick = () => { const it = itemById(el.dataset.item); if (it) openItem(it); };
  }
  for (const el of document.querySelectorAll('[data-sku]')) {
    el.onclick = () => { const p = PRODUCTS.find(x => x.sku === el.dataset.sku); if (p) buyTokens(p); };
  }
}

// 연출과 준비를 나란히 돌린다. 둘 중 늦은 쪽이 끝나면 화면이 바뀐다 —
// 연출이 끝났는데 아직 확인 중이면 기다리고, 반대면 연출을 끝까지 보여준다.
state.splashing = true;
Promise.all([showSplash(), boot().catch(() => { state.screen = 'login'; })])
  .finally(async () => {
    // 연출과 준비가 둘 다 끝난 지금에야 문을 닫는다. 준비가 늦으면 그동안
    // 여는 화면이 그대로 남아 있으므로 빈 화면을 볼 일이 없다.
    const el = document.getElementById('splash');
    if (el) {
      el.classList.add('done');
      await new Promise(r => setTimeout(r, 450));   // 사라지는 동안 기다린다
    }
    state.splashing = false;
    render();
  });
