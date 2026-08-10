// M;Y 安 앱인토스 미니앱.
//
// 웹 서비스(myan.riger7070.workers.dev)와 **계정도 토큰도 완전히 분리된 별도 서비스**다.
// 여기서 산 토큰은 웹에서 못 쓰고 반대도 마찬가지다. 서버가 세션 subject 로 구분한다
// (웹은 이메일, 미니앱은 'mini:<userKey>'). test/mini-isolation.test.mjs 참고.
//
// 화면은 상태 하나(state.screen)로 갈아 끼운다. 화면이 다섯 개뿐이라 라우터를 두지 않았다.

import { appLogin, IAP } from '@apps-in-toss/web-framework';

const API = 'https://myan.riger7070.workers.dev';
const SESSION_KEY = 'myan_mini_session';

// 콘솔에 등록한 상품 ID 와 정확히 같아야 한다. 서버의 MINI_PRODUCTS 와도 맞춰야
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
  result: null,     // { title, body }
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

  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || '잠시 후 다시 시도해 주세요.');
    err.status = res.status;
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

// ── 부팅 ──────────────────────────────────────────────────

async function boot() {
  // 저장된 세션이 있으면 그대로 이어 간다. 매번 로그인 버튼을 누르게 하면 성가시다.
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
      if (e.status === 401) {
        localStorage.removeItem(SESSION_KEY);
        state.session = '';
      }
    }
  }
  go('login');
}

async function recoverPendingOrders() {
  try {
    const pending = await IAP.getPendingOrders();
    for (const order of pending || []) {
      const orderId = order?.orderId || order?.id;
      if (!orderId) continue;
      const r = await api('/mini/api/payment/grant', { method: 'POST', body: { orderId } });
      if (r?.ok) {
        state.tokens = r.balance ?? state.tokens;
        await IAP.completeProductGrant({ orderId });
      }
    }
    render();
  } catch { /* 복구는 실패해도 앱 사용을 막지 않는다. 다음 실행에서 다시 시도된다. */ }
}

// ── 동작 ──────────────────────────────────────────────────

async function doLogin() {
  await withBusy(async () => {
    const { authorizationCode, referrer } = await appLogin();
    const r = await api('/mini/api/auth/login', {
      method: 'POST', auth: false, body: { authorizationCode, referrer },
    });
    state.session = r.session;
    localStorage.setItem(SESSION_KEY, r.session);
    state.profile = r.profile;
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

async function freeReading() {
  await withBusy(async () => {
    const p = state.profile;
    const data = await api('/saju-reading', {
      method: 'POST', auth: false,
      body: {
        mode: 'solo', lang: 'ko',
        p1: { year: +p.birthYear, month: +p.birthMonth, day: +p.birthDay, hour: p.birthHour || '', name: p.name || '' },
      },
    });
    state.result = { title: '내 사주 풀이', body: data.reading, meta: data.saju1 };
    go('result');
  });
}

async function todayFortune() {
  await withBusy(async () => {
    try {
      const data = await api('/mini/api/today', { method: 'POST', body: {} });
      state.tokens = data.tokens ?? state.tokens;
      state.result = { title: '오늘의 운세', body: data.reading, meta: `${data.date} · 일진 ${data.dayElem}` };
      go('result');
    } catch (e) {
      // 토큰이 없어서 막힌 거면 오류로 끝내지 말고 충전 화면으로 안내한다.
      if (e.status === 402) { state.error = '토큰이 부족해요.'; go('charge'); return; }
      throw e;
    }
  });
}

function buyTokens(product) {
  state.error = '';
  state.busy = true;
  render();

  IAP.createOneTimePurchaseOrder({
    options: {
      productId: product.sku,   // 구버전 필드지만 타입상 필수라 함께 넣는다
      sku: product.sku,
      // 결제가 끝나면 토스가 이걸 부른다. 여기서 서버에 지급을 요청하고 성공 여부를 돌려준다.
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
    onEvent: () => {
      state.busy = false;
      state.error = '';
      go('home');
    },
    onError: (err) => {
      state.busy = false;
      // 사용자가 결제창을 닫은 것도 여기로 온다. 실패라고 겁주지 않는다.
      state.error = '결제가 완료되지 않았어요.';
      console.warn('[iap]', err);
      render();
    },
  });
}

async function withBusy(fn) {
  state.busy = true; state.error = ''; render();
  try {
    await fn();
  } catch (e) {
    state.error = e?.message || '오류가 발생했습니다.';
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
  <a href="${API}/terms" style="color:var(--gold-dim)">이용약관</a> ·
  <a href="${API}/privacy-policy" style="color:var(--gold-dim)">개인정보처리방침</a>
</p></footer>`;

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
          <input id="f-h" placeholder="예: 오전 9시 또는 09:00" value="${esc(p.birthHour || '')}">
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
      const greet = p.name ? `${esc(p.name)}님` : '반가워요';
      html = `
        <div class="brand"><h1>MY;安</h1></div>
        <div class="card row">
          <div><div class="muted">${greet}</div><div class="balance">${state.tokens} 토큰</div></div>
          <button class="btn ghost" id="btn-charge" style="width:auto;padding:11px 16px">충전</button>
        </div>
        <button class="tile" id="btn-free">
          <span class="cost">무료</span>
          <strong>내 사주 풀이</strong>
          <span class="muted">타고난 기운과 오행의 균형을 봅니다</span>
        </button>
        <button class="tile" id="btn-today">
          <span class="cost">1 토큰</span>
          <strong>오늘의 운세</strong>
          <span class="muted">오늘 일진과 내 사주가 만나는 자리</span>
        </button>
        <button class="btn ghost" id="btn-editprofile" style="margin-top:6px">생년월일 수정</button>
        ${err}
        <div class="ai-notice">${AI_NOTICE}</div>
        ${FOOTER}`;
      break;
    }

    case 'charge':
      html = `
        <div class="brand"><h1>토큰 충전</h1></div>
        <div class="card">
          <div class="row"><span class="muted">현재 잔액</span><span class="balance">${state.tokens}</span></div>
        </div>
        ${PRODUCTS.map((p) => `
          <button class="tile" data-sku="${p.sku}">
            <strong>${p.label}</strong>
            <span class="muted">토스로 간편하게 결제</span>
          </button>`).join('')}
        ${err}
        <button class="btn ghost" id="btn-back" style="margin-top:8px">돌아가기</button>
        ${FOOTER}`;
      break;

    case 'result': {
      const r = state.result || {};
      const paras = String(r.body || '').split(/\n{2,}|\n/).filter(Boolean)
        .map((t) => `<p>${esc(t)}</p>`).join('');
      html = `
        <div class="brand"><h1>${esc(r.title || '')}</h1>
          ${r.meta ? `<p>${esc(r.meta)}</p>` : ''}</div>
        <div class="card reading">${paras}</div>
        <button class="btn ghost" id="btn-back">돌아가기</button>
        <div class="ai-notice">${AI_NOTICE}</div>
        ${FOOTER}`;
      break;
    }

    default:
      html = `<div class="boot"><div class="spinner"></div></div>`;
  }

  app.innerHTML = html;
  bind();
}

function bind() {
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };

  on('btn-login', doLogin);
  on('btn-free', freeReading);
  on('btn-today', todayFortune);
  on('btn-charge', () => go('charge'));
  on('btn-editprofile', () => go('profile'));
  on('btn-back', () => go('home'));

  on('btn-save', () => {
    const v = (id) => document.getElementById(id)?.value.trim() || '';
    const y = v('f-y'), m = v('f-m'), d = v('f-d');
    if (!y || !m || !d) { state.error = '생년월일을 모두 입력해 주세요.'; render(); return; }
    saveProfile({ name: v('f-name'), birthYear: y, birthMonth: m, birthDay: d, birthHour: v('f-h') });
  });

  for (const el of document.querySelectorAll('[data-sku]')) {
    el.onclick = () => {
      const product = PRODUCTS.find((p) => p.sku === el.dataset.sku);
      if (product) buyTokens(product);
    };
  }
}

boot();
