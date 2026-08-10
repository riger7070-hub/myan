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

import { appLogin, IAP } from '@apps-in-toss/web-framework';
import { SECTIONS, ALL_ITEMS, itemById, OHAENG_TYPES, TOPICS, PURPOSES } from './contents.js';

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
    case 'takil':      return { ...base, purpose: form.purpose, birth, days: 30 };
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

async function runItem(item) {
  state.item = item;
  state.screen = 'loading';
  state.error = '';
  render();
  try {
    const data = await api(item.path, {
      method: 'POST',
      auth: !item.free || item.id !== 'saju',   // 무료 사주는 인증 없이도 되지만 있어도 무방
      body: bodyFor(item, state.profile, state.form),
    });
    if (typeof data.tokens === 'number') state.tokens = data.tokens;
    else if (typeof data.remainingTokens === 'number') state.tokens = data.remainingTokens;
    else if (!item.free) refreshTokens();

    state.result = { item, ...extractResult(data) };
    go('result');
  } catch (e) {
    if (e.status === 402) { state.error = '토큰이 부족해요.'; go('charge'); return; }
    state.error = e?.message || '오류가 발생했습니다.';
    if (e?.network && e.origin) state.error += `\n(요청 출처: ${e.origin})`;
    go('home');
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
  if (d.card?.name) extras.push({ label: '뽑은 카드', value: `${d.card.name}${d.upright === false ? ' (역방향)' : ''}` });
  if (d.rune?.name) extras.push({ label: '룬', value: d.rune.name });
  if (d.hexagram?.name) extras.push({ label: '괘', value: d.hexagram.name });
  if (d.lifePath) extras.push({ label: '라이프패스 넘버', value: String(d.lifePath) });
  if (d.saju1 || d.saju) extras.push({ label: '사주', value: d.saju1 || d.saju });
  if (d.dayElem) extras.push({ label: '오늘의 기운', value: d.dayElem });
  if (d.picks && typeof d.picks === 'object') {
    for (const [k, v] of Object.entries(d.picks)) {
      if (typeof v === 'string') extras.push({ label: k, value: v });
    }
  }
  if (Array.isArray(d.days)) {
    extras.push({ label: '좋은 날', value: d.days.slice(0, 5).map(x => x.ymd || x.date || x).join(', ') });
  }
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

  c.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `myan-${r.item.id}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
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

function go(screen) { state.screen = screen; render(); }

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
  const p = state.profile || {};
  return `<div class="topbar">
    <button class="tb-back" id="btn-home" aria-label="홈">‹</button>
    <span class="tb-title">MY;安</span>
    <button class="tb-token" id="btn-charge">${state.tokens} 토큰</button>
  </div>`;
}

function render() {
  const err = state.error ? `<p class="err">${esc(state.error)}</p>` : '';
  let html;

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
          <label>태어난 시각 (선택)</label>
          <input id="f-h" placeholder="예: 오전 9시" value="${esc(p.birthHour || '')}">
          <button class="btn" id="btn-save" style="margin-top:20px" ${state.busy ? 'disabled' : ''}>
            ${state.busy ? '저장 중…' : '저장하고 시작하기'}
          </button>
          ${err}
        </div>
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
          <p class="muted">${LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)]}</p>
        </div>`;
      break;

    case 'result': {
      const r = state.result || {};
      const paras = String(r.body || '').split(/\n{2,}|\n/).filter(Boolean)
        .map(t => `<p>${esc(t)}</p>`).join('');
      html = `${header()}
        <div class="brand sm"><h1>${r.item.icon} ${esc(r.item.label)}</h1></div>
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

  app.innerHTML = html;
  bind();
}

function needForm(it) {
  switch (it.need) {
    case 'text':
      return `<label>${it.prompt}</label>
        <textarea id="f-text" rows="3" placeholder="${esc(it.placeholder || '')}"></textarea>`;
    case 'name':
      return `<label>풀이할 이름</label><input id="f-nm" placeholder="예: 안태현">`;
    case 'topic':
      return `<label>어떤 운이 궁금하세요?</label>
        <select id="f-topic">${TOPICS.map(t => `<option value="${t.v}">${t.label}</option>`).join('')}</select>`;
    case 'purpose':
      return `<label>무엇을 위한 날인가요?</label>
        <select id="f-purpose">${PURPOSES.map(t => `<option value="${t.v}">${t.label}</option>`).join('')}</select>`;
    case 'type':
      return `<label>나의 유형</label>
        <select id="f-my">${OHAENG_TYPES.map(t => `<option value="${t.v}">${t.label}</option>`).join('')}</select>
        <label>상대의 유형</label>
        <select id="f-pt">${OHAENG_TYPES.map(t => `<option value="${t.v}">${t.label}</option>`).join('')}</select>`;
    case 'partner':
      return `<label>상대방 생년월일</label>
        <div class="grid3">
          <input id="p-y" type="number" inputmode="numeric" placeholder="1990">
          <input id="p-m" type="number" inputmode="numeric" placeholder="5">
          <input id="p-d" type="number" inputmode="numeric" placeholder="15">
        </div>
        <label>태어난 시각 (선택)</label><input id="p-h" placeholder="예: 오전 9시">`;
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
    case 'purpose': return { purpose: v('f-purpose') };
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
  on('btn-share', shareCard);

  on('btn-save', () => {
    const v = (id) => document.getElementById(id)?.value.trim() || '';
    if (!v('f-y') || !v('f-m') || !v('f-d')) { state.error = '생년월일을 모두 입력해 주세요.'; render(); return; }
    saveProfile({
      name: v('f-name'), birthYear: v('f-y'), birthMonth: v('f-m'),
      birthDay: v('f-d'), birthHour: v('f-h'),
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
      if (f.size > 4 * 1024 * 1024) { state.error = '사진이 너무 커요. 4MB 이하로 올려 주세요.'; render(); return; }
      form.photoType = document.getElementById('f-ptype')?.value || 'face';
      form.image = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).split(',')[1]);
        fr.onerror = rej;
        fr.readAsDataURL(f);
      }).catch(() => null);
      if (!form.image) { state.error = '사진을 읽지 못했어요.'; render(); return; }
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
