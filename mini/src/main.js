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

import { appLogin, IAP, saveBase64Data } from '@apps-in-toss/web-framework';
import { SECTIONS, ALL_ITEMS, itemById, OHAENG_TYPES, TOPICS, PURPOSES, SIJI, GENDERS } from './contents.js';

const API = 'https://myan.riger7070.workers.dev';
const SESSION_KEY = 'myan_mini_session';

// ⚠️ 콘솔에 등록한 상품 ID 와 정확히 같아야 한다. 서버의 MINI_PRODUCTS 와도 맞춰야
// 결제가 지급으로 이어진다(worker.js 의 MINI_PRODUCTS 주석 참고).
const PRODUCTS = [
  { sku: 'token_30',  tokens: 30,  label: '토큰 30개' },
  { sku: 'token_100', tokens: 100, label: '토큰 100개' },
  { sku: 'token_300', tokens: 300, label: '토큰 300개' },
];

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
  try {
    res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    // fetch 가 던지면 브라우저는 이유를 안 알려준다("Failed to fetch"). 원인은 대개
    // CORS 아니면 네트워크인데, 토스 웹뷰엔 개발자 도구가 없어서 실제 오리진을
    // 함께 보여줘야 어느 쪽인지 판단할 수 있다.
    const err = new Error('서버에 연결하지 못했어요.');
    err.network = true;
    err.origin = location.origin;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || '잠시 후 다시 시도해 주세요.');
    err.status = res.status;
    throw err;
  }
  return data;
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
    for (const order of (await IAP.getPendingOrders()) || []) {
      const orderId = order?.orderId || order?.id;
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

    state.result = { item, ...extractResult(data), card: data.card, upright: data.upright };
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
      // 사용자가 결제창을 닫은 것도 여기로 온다. 실패라고 겁주지 않는다.
      state.error = '결제가 완료되지 않았어요.';
      console.warn('[iap]', err);
      render();
    },
  });
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
function go(screen, { fromPop = false } = {}) {
  state.screen = screen;
  if (!fromPop) {
    const entry = { screen, at: Date.now() };
    if (screen === 'loading' || history.state?.screen === screen) history.replaceState(entry, '');
    else history.pushState(entry, '');
  }
  render();
}

window.addEventListener('popstate', (e) => {
  const prev = e.state?.screen;
  if (!prev) return;            // 이력 바닥 — 기본 동작(앱 종료)에 맡긴다
  // 결과를 기다리는 중이었다면 그 요청은 그냥 버린다(runItem 이 화면을 확인하고 넘긴다).
  go(prev, { fromPop: true });
});

// ── 화면 ──────────────────────────────────────────────────

const AI_NOTICE =
  '이 콘텐츠는 생성형 AI(Google Gemini)가 만든 것으로, 재미로 보는 참고용입니다. '
  + '의학, 법률, 재무 등 중요한 결정의 근거로 삼지 마세요.';

const FOOTER = `<footer><p class="muted">
  사업자 마이안 · 대표 안태현 · 사업자등록번호 501-33-63980<br>
  <a href="${API}/terms">이용약관</a> · <a href="${API}/privacy-policy">개인정보처리방침</a>
</p></footer>`;

const LOADING_LINES = [
  '기운의 결을 살피는 중입니다',
  '오늘의 일진을 맞춰 보는 중입니다',
  '사주의 흐름을 따라가는 중입니다',
  '안도령이 붓을 고르는 중입니다',
];

function header() {
  // 홈에서는 돌아갈 곳이 없다. 빈 자리를 남겨 제목이 가운데에 그대로 있게 한다.
  const back = state.screen === 'home'
    ? '<span class="tb-spacer"></span>'
    : '<button class="tb-back" id="btn-home" aria-label="뒤로">‹</button>';
  return `<div class="topbar">
    ${back}
    <span class="tb-title">MY;安</span>
    <button class="tb-token" id="btn-charge">${state.tokens} 토큰</button>
  </div>`;
}

function render() {
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
      html = `
        <div class="brand"><h1>MY;安</h1></div>
        <div class="card">
          <h2>생년월일을 알려주세요</h2>
          <p class="muted">사주를 계산하는 데 필요해요. 태어난 시각까지 넣으면 더 정확해집니다.</p>
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
            ${state.busy ? '저장 중…' : '저장하고 시작하기'}
          </button>
          ${err}
        </div>
        ${state.profile?.birthYear ? `
          <button class="btn ghost" id="btn-logout">로그아웃</button>
          <p class="muted small" style="text-align:center;margin-top:10px">
            토큰은 계정에 남아 있어요. 다시 로그인하면 그대로 쓰실 수 있습니다.
          </p>` : ''}
        ${FOOTER}`;
      break;
    }

    case 'home': {
      const p = state.profile || {};
      html = `
        ${header()}
        <div class="hello">
          <span class="muted">${p.name ? `${esc(p.name)}님, 반가워요` : '반가워요'}</span>
        </div>
        ${err}
        ${SECTIONS.map(sec => `
          <section class="sec">
            <h3><span>${sec.icon}</span> ${sec.title}</h3>
            <div class="tiles">
              ${sec.items.map(it => `
                <button class="tile" data-item="${it.id}">
                  <span class="t-icon">${it.icon}</span>
                  <span class="t-label">${it.label}</span>
                  <span class="t-cost">${it.cost ? `${it.cost} 토큰` : '무료'}</span>
                </button>`).join('')}
            </div>
          </section>`).join('')}
        <div class="row2">
          <button class="btn ghost" id="btn-history">지난 기록</button>
          <button class="btn ghost" id="btn-editprofile">내 정보</button>
        </div>
        <div class="ai-notice">${AI_NOTICE}</div>
        ${FOOTER}`;
      break;
    }

    case 'need': {
      const it = state.item;
      html = `${header()}
        <div class="brand sm"><h1>${it.icon} ${esc(it.label)}</h1>
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
          <img src="${API}/andoryeong.svg" alt="" class="oracle" onerror="this.style.display='none'">
          <div class="spinner"></div>
          <p class="muted">${esc(state.loadingLine || LOADING_LINES[0])}</p>
          <p class="muted small">${esc(state.item?.label || '')}</p>
          <p class="muted small" style="margin-top:14px">풀이는 지난 기록에도 저장돼요</p>
        </div>`;
      break;

    case 'result': {
      const r = state.result || {};
      // 카드를 뽑았으면 먼저 뒷면만 보여주고, 눌러서 뒤집게 한다.
      if (state.reveal) {
        html = `${header()}
          <div class="brand sm"><h1>${r.item.icon} ${esc(r.item.label)}</h1>
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
        <div class="brand sm"><h1>${r.item.icon} ${esc(r.item.label)}</h1></div>
        ${r.card ? `<div class="card-stage"><div class="tarot flipped">
            <span class="tarot-face">${esc(r.card.icon || '🔮')}<b>${esc(r.card.name || '')}</b>
            ${r.upright === false ? '<i>역방향</i>' : '<i>정방향</i>'}</span>
          </div></div>` : ''}
        ${r.extras?.length ? `<div class="card extras">${r.extras.map(e =>
          `<div class="row"><span class="muted">${esc(e.label)}</span><b>${esc(e.value)}</b></div>`).join('')}</div>` : ''}
        <div class="card reading">${paras || '<p class="muted">내용을 불러오지 못했어요.</p>'}</div>
        <div class="row2">
          <button class="btn ghost" id="btn-share">이미지로 저장</button>
          <button class="btn ghost" id="btn-home2">홈으로</button>
        </div>
        <div class="ai-notice">${AI_NOTICE}</div>
        ${FOOTER}`;
      break;
    }

    case 'history':
      html = `${header()}
        <div class="brand sm"><h1>지난 기록</h1></div>
        ${state.history.length ? state.history.map(h => `
          <div class="card hist">
            <div class="row"><b>${esc(h.title || h.feature || '')}</b>
              <span class="muted">${esc((h.createdAt || '').toString().slice(0, 10))}</span></div>
            <p class="muted">${esc(String(h.content || h.reading || '').slice(0, 120))}…</p>
          </div>`).join('')
        : '<div class="card"><p class="muted">아직 기록이 없어요.</p></div>'}
        <button class="btn ghost" id="btn-home2">홈으로</button>
        ${FOOTER}`;
      break;

    case 'charge':
      html = `${header()}
        <div class="brand sm"><h1>토큰 충전</h1><p>현재 ${state.tokens} 토큰</p></div>
        ${err}
        ${PRODUCTS.map(p => `
          <button class="tile wide" data-sku="${p.sku}">
            <span class="t-label">${p.label}</span>
            <span class="t-cost">토스로 결제</span>
          </button>`).join('')}
        <button class="btn ghost" id="btn-home2" style="margin-top:10px">돌아가기</button>
        ${FOOTER}`;
      break;

    default:
      html = `<div class="loading"><div class="spinner"></div></div>`;
  }

  app.innerHTML = toast + html;
  bind();
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
  on('btn-charge', () => go('charge'));
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
  on('btn-share', shareCard);
  on('btn-reveal', (e) => {
    // 뒤집는 애니메이션이 끝난 뒤에 결과를 보여준다.
    const el = e.currentTarget;
    el.classList.add('flipping');
    setTimeout(() => { state.reveal = false; render(); }, 620);
  });

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

boot();
