// M;Y 安 앱인토스 미니앱.
//
// 웹 서비스(myan.riger7070.workers.dev)와 **계정도 엽전도 완전히 분리된 별도 서비스**다.
// 여기서 산 엽전은 웹에서 못 쓰고 반대도 마찬가지다. 서버가 세션 subject 로 구분한다
// (웹은 이메일, 미니앱은 'mini:<userKey>'). test/mini-isolation.test.mjs 참고.
//
// 콘텐츠 자체는 웹과 같은 서버 엔드포인트를 쓴다. 서버의 계정 계층(resolveAccount)이
// 누가 불렀는지 알아서 각자의 원장에서 엽전을 뺀다.
//
// 화면은 상태 하나(state.screen)로 갈아 끼운다. 화면 수가 적어 라우터를 두지 않았다.

import {
  appLogin, TossAuth, Storage, IAP, getTossShareLink, share, GoogleAdMob,
  graniteEvent, closeView,
} from '@apps-in-toss/web-framework';
import {
  SECTIONS, itemById, OHAENG_TYPES, TOPICS, PURPOSES, RELATIONS, SIJI, GENDERS, SANGAJI,
  speakerOf,
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

// ── 세션 보관 ──────────────────────────────────────────────
//
// 토스 웹뷰의 localStorage 는 앱을 껐다 켜면 남아 있으리라는 보장이 없다. 실제로
// 나갔다 들어올 때마다 세션이 사라져서, 그때마다 인트로 → 로그인 → 토스 인증을
// 다시 거쳐야 했다. 프레임워크의 Storage 는 "앱이 종료되어도 유지되는" 네이티브
// 저장소라, 세션은 그쪽을 본다. localStorage 에도 같이 써 두는 건 다리가 없는
// 개발용 브라우저(vite dev) 때문이지, 앱에서 믿을 곳이어서가 아니다.
const SESSION_KEY = 'myan_mini_session';
// 로그인을 끝낸 적이 있는가. 세션이 없을 때 처음부터 다시 물어볼지(인트로+로그인),
// 조용히 받아 올지(자동 로그인)를 이 표식으로 가른다. 스스로 로그아웃하면 지운다.
const LINKED_KEY = 'myan_mini_linked';

const nativeGet = async (k) => { try { return await Storage.getItem(k); } catch { return null; } };
const nativeSet = async (k, v) => { try { await Storage.setItem(k, v); } catch { /* 브라우저면 그만 */ } };
const nativeDel = async (k) => { try { await Storage.removeItem(k); } catch { /* 위와 같다 */ } };

/** 저장된 세션을 꺼낸다. 네이티브가 먼저고, 없으면 예전에 localStorage 에 둔 걸 옮겨 온다. */
async function loadSession() {
  const saved = await nativeGet(SESSION_KEY);
  if (saved) return saved;
  // 이 판이 나오기 전에 로그인한 사람의 세션. 한 번 옮겨 두면 다음부터는 살아남는다.
  const legacy = localStorage.getItem(SESSION_KEY) || '';
  if (legacy) await nativeSet(SESSION_KEY, legacy);
  return legacy;
}

async function saveSession(token) {
  state.session = token;
  try { localStorage.setItem(SESSION_KEY, token); } catch { /* 못 써도 네이티브가 있다 */ }
  await nativeSet(SESSION_KEY, token);
  await nativeSet(LINKED_KEY, '1');
}

/** 세션을 지운다. keepLinked=false 면 자동 로그인 표식까지 지운다(스스로 나간 경우). */
async function forgetSession({ keepLinked = true } = {}) {
  state.session = '';
  try { localStorage.removeItem(SESSION_KEY); } catch { /* 없으면 그만 */ }
  await nativeDel(SESSION_KEY);
  if (!keepLinked) await nativeDel(LINKED_KEY);
}

// 값을 보여주기 위한 목록일 뿐, **결제에는 쓰이지 않는다.**
//
// 실제로 무엇을 파는지는 콘솔이 정하고(SKU 는 콘솔이 자동 생성한다), 그중 지급할 수 있는
// 것이 무엇인지는 서버가 정한다(worker.js 의 MINI_SKU_ALIAS). 앱은 두 곳에서 받아 그리기만
// 한다 — 여기 sku 는 콘솔 목록을 아직 못 받았을 때 값을 비워 두지 않으려는 자리표시다.
// 그러니 여기에 콘솔 번호를 적어 넣으려 하지 말 것. 맞춰야 할 곳은 시크릿이다.
//
// price 는 사용자가 실제로 내는 값(판매가)이다. 콘솔은 공급가를 받아
// 판매가 = 공급가 × 1.1 로 계산하므로 11 의 배수만 나온다.
// tokens 는 test/mini-price-parity.test.mjs 가 서버 MINI_PRODUCTS 와 대조한다.
const PRODUCTS = [
  { sku: 'token_10',  tokens: 10,  label: '엽전 10개',  price: '4,290원' },
  { sku: 'token_30',  tokens: 30,  label: '엽전 30개',  price: '9,900원' },
  { sku: 'token_100', tokens: 100, label: '엽전 100개', price: '27,500원' },
];


const AD_TOKENS = 1;

// ⚠️ 앱인토스 콘솔에서 발급받은 광고 단위 ID. 등록 전에는 광고가 열리지 않는다.
// 값이 비어 있으면 버튼 자체를 숨긴다 — 눌러도 실패하는 버튼을 보여주지 않는다.
const AD_UNIT_ID = 'ait.v2.live.6687c3d6badb4d70';
// 전면 광고. 사용자가 요청한 것이 아니라 앱이 트는 것이므로, 무엇을 보고 난
// **뒤에** 튼다(runAutoAdIfDue 참고). 무료로 받은 자리 — 엽전을 받았을 때와
// 무료 풀이를 봤을 때 — 마다 예약되고, 하루 몫(AD_DAILY_MAX)을 보상형과 나눠 쓴다.
const AD_AUTO_UNIT_ID = 'ait.v2.live.14d0826ccdad4c8d';

const state = {
  screen: 'boot',
  // 첫 짐작일 뿐이다. 진짜 값은 boot() 이 loadSession() 으로 다시 채운다.
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
  invite: null,     // 상대에게 보낸 궁합 초대 { id, url, answered }
  inviteChecked: false,  // 앱을 켠 뒤 답이 왔는지 한 번 확인했는가
};

const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// '엽전'이라는 낱말 앞에 붙이는 작은 엽전 글자. 재화 이름을 토큰에서 엽전으로 바꾸면서
// 화면에는 여전히 글자만 있어 그게 무엇인지 한 박자 늦게 읽혔다.
// 크기를 em 으로 잡아 두어(style.css 의 .coin-ic) 붙는 자리의 글자 크기를 그대로 따라간다.
const COIN = `<span class="coin-ic">${icon('yeopjeon')}</span>`;

// ── 서버 호출 ──────────────────────────────────────────────

// 풀이는 오래 걸린다(AI 가 글을 쓴다). 그래서 기본은 넉넉히 잡는다.
// 다만 앱을 켜자마자 하는 확인처럼 **기다릴 이유가 없는** 호출은 짧게 끊는다.
const API_TIMEOUT = 90000;
const BOOT_TIMEOUT = 8000;

async function api(path, { method = 'GET', body, auth = true, timeoutMs = API_TIMEOUT } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (auth && state.session) headers.Authorization = `Bearer ${state.session}`;

  let res;
  // 응답이 영영 안 오면 로딩 화면에 갇힌다. 실제로 그런 신고가 있었다 —
  // 무엇이 잘못됐는지도 모른 채 기다리게 두느니 끊고 알려주는 게 낫다.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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
      ? '응답이 너무 오래 걸려 중단했어요. 엽전을 쓰셨다면 지난 기록을 확인해 주세요.'
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
// 달 위상(0~7)을 덮개가 움직일 거리로 옮긴다. 삭은 다 덮이고, 보름은 덮개가 밖으로 나간다.
// 차오를 때(1~3)는 오른쪽부터 밝아지므로 덮개를 왼쪽으로 민다.
const MOON_SHIFT = ['0%', '-26%', '-52%', '-78%', '-150%', '78%', '52%', '26%'];
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
      <div class="moon" title="${moon.name}" aria-label="${moon.name}"
           style="--mshift:${MOON_SHIFT[moon.index] || '-150%'}"></div>
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
  state.session = await loadSession();
  if (state.session) {
    try {
      // ⚠️ 여기서는 짧게 끊는다. 기본값(90초)으로 두면 지하철이나 엘리베이터처럼
      // 신호가 약한 곳에서 앱을 켰을 때 첫 화면에 1분 넘게 갇힌다. 사용자는
      // 앱이 죽은 줄 안다. 확인이 안 되면 그냥 소개 화면을 보여주는 편이 낫다.
      const me = await api('/mini/api/me', { timeoutMs: BOOT_TIMEOUT });
      state.profile = me.profile;
      state.noAds = !!me.noAds;
      state.tokens = me.tokens;
      // 결제는 됐는데 지급 직전에 앱이 꺼진 주문을 여기서 마저 처리한다.
      // 이게 없으면 사용자는 돈만 내고 엽전을 못 받는다.
      recoverPendingOrders();
      go(state.profile?.birthYear ? 'home' : 'profile');
      return;
    } catch (e) {
      // 세션 만료(401)면 지운다. 그 외(네트워크·시간초과)는 **세션을 남겨 둔다** —
      // 신호가 돌아온 다음 실행에서 그대로 이어진다. 여기서 지워 버리면
      // 잠깐 끊긴 것 때문에 멀쩡한 사람을 다시 로그인시키게 된다.
      // (표식은 남긴다 — 만료됐을 뿐 연동은 살아 있으니 아래에서 조용히 다시 받는다.)
      if (e.status === 401) await forgetSession();
    }
  }
  // 세션이 없어도, 전에 로그인을 끝낸 사람이라면 다시 물어볼 게 없다. 동의는 이미
  // 받아 둔 상태라 동의 화면 없이 통과하고, 여는 화면이 도는 동안 끝난다.
  // 인트로를 건너뛰는 건 '처음 온 사람'이 아닐 때뿐이라 심사 조건은 그대로다.
  if (await canResumeLogin()) {
    try { await loginWithToss(); return; } catch { /* 안 되면 평소대로 인트로부터 */ }
  }
  // 로그인 전에 반드시 인트로를 거친다(심사 반려 사유였다).
  go('intro');
}

/**
 * 물어보지 않고 다시 로그인해도 되는가.
 *
 * 두 가지가 다 맞아야 한다 — (1) 전에 이 앱에서 로그인을 끝냈고, (2) 토스 쪽 연동이
 * 아직 살아 있다. 연동이 끊겼는데 부르면 사용자가 누르지도 않은 동의 화면이 튀어나온다.
 * isIntegrated 는 구버전 토스에서 undefined 를 준다 — 그건 '아니다'가 아니라
 * '못 물어봤다'는 뜻이므로, 그때는 우리 표식을 믿는다.
 */
async function canResumeLogin() {
  if (await nativeGet(LINKED_KEY) !== '1') return false;
  try {
    return (await TossAuth.isIntegrated()) !== false;
  } catch {
    return true;
  }
}

/**
 * 결제 다리를 미리 깨워 둔다.
 *
 * 앱을 켜자마자 충전 화면을 열면 상품 목록이 비어서 온다 — 네이티브 쪽이 스토어
 * 정보를 아직 못 받은 상태다. 미리 한 번 물어봐 두면 정작 사용자가 열 때는 채워져 있다.
 * 결과는 쓰지 않는다. 실패해도 조용히 넘어간다.
 */
function warmUpIAP() {
  try { IAP.getProductItemList()?.catch?.(() => {}); } catch { /* 없는 환경이면 그만 */ }
}

async function recoverPendingOrders() {
  warmUpIAP();
  try {
    // 이것도 배열이 아니라 { orders: [...] } 로 온다.
    const pending = (await IAP.getPendingOrders())?.orders || [];
    for (const order of pending) {
      const orderId = order?.orderId;
      if (!orderId) continue;
      const r = await api('/mini/api/payment/grant', { method: 'POST', body: { orderId } });
      if (r?.ok) {
        gainCoins(r.balance, { ad: false });   // 돈을 낸 사람에게 광고를 틀지 않는다
        await IAP.completeProductGrant({ orderId });
      }
    }
    render();
  } catch { /* 복구 실패가 앱 사용을 막지는 않는다. 다음 실행에서 다시 시도된다. */ }
}

// ── 인증·프로필 ────────────────────────────────────────────

/** 토스 인증 → 우리 세션. 로그인 화면의 버튼과 부팅 때의 자동 로그인이 함께 쓴다. */
async function loginWithToss() {
  // appLogin 은 deprecated 다. 새 이름이 있으면 그걸 쓰고, 구버전 SDK 면 예전 것으로.
  const { authorizationCode, referrer } = await (TossAuth?.login ? TossAuth.login() : appLogin());
  const r = await api('/mini/api/auth/login', {
    method: 'POST', auth: false, body: { authorizationCode, referrer },
  });
  await saveSession(r.session);
  const me = await api('/mini/api/me');
  state.tokens = me.tokens;
  state.profile = me.profile;
  state.noAds = !!me.noAds;
  go(state.profile?.birthYear ? 'home' : 'profile');
}

async function doLogin() {
  await withBusy(loginWithToss);
}

async function saveProfile(form) {
  await withBusy(async () => {
    // ⚠️ 저장 응답이 **방금 저장된 값**을 그대로 준다. 예전에는 저장한 뒤
    //    /mini/api/me 를 다시 불렀는데, 그 GET 이 웹뷰 캐시에 걸려 옛 값이 돌아왔다 —
    //    고치고 저장해도 화면에서 나갔다 들어와야 바뀐 것이 보이던 원인이다.
    //    서버에도 no-store 를 붙였지만, 다시 묻지 않는 편이 애초에 확실하다.
    const saved = await api('/mini/api/profile', { method: 'POST', body: form });
    if (saved?.profile) {
      state.profile = saved.profile;
    } else {
      // 서버가 아직 옛 버전일 때를 위한 길(앱과 워커의 배포 시차).
      const me = await api('/mini/api/me');
      state.profile = me.profile;
      state.noAds = !!me.noAds;
      state.tokens = me.tokens;
    }
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
    // 신살·전생·천직은 네 기둥을 다 쓰므로 생시까지 함께 보낸다.
    case 'wealth':     return { ...base, birth, gender: profile.gender || '' };
    case 'direction':  return { ...base, birth, gender: profile.gender || '', purpose: 'move' };
    case 'naming':     return { ...base, birth, gender: profile.gender || '', surname: form.surname || '' };
    case 'yearluck':   return { ...base, birth, gender: profile.gender || '' };
    case 'intimacy':   return { ...base, birth, partner: form.partner, gender: profile.gender || '' };
    case 'sinsal':     return { ...base, birth, gender: profile.gender || '' };
    case 'gwiin':       return { ...base, birth, gender: profile.gender || '' };
    case 'pastlife':   return { ...base, birth, gender: profile.gender || '' };
    case 'vocation':   return { ...base, birth, gender: profile.gender || '' };
    // 띠 순위는 생년만 있으면 내 띠를 짚어 준다. 없어도 순위는 볼 수 있다.
    case 'ttirank':    return { ...base, birth };
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
    case 'relation':   return { ...base, birth, partner: form.partner, relation: form.relation || '' };
    default:           return base;
  }
}

function openItem(item) {
  state.item = item;
  state.form = {};
  state.error = '';
  // 산가지는 서버도 AI 도 부르지 않는다. 콘텐츠 목록에 있지만 처리는 앱 안에서 끝난다.
  if (item.local) { drawStick(); return; }
  if (item.need) {
    go('need');
    // 링크를 보낸 뒤 앱을 껐다가 돌아왔을 수도 있다. 상대의 답이 이미 와 있으면
    // 다시 물어보게 하지 않는다. 앱을 켠 뒤 한 번만 확인한다(호출을 아낀다).
    if ((item.need === 'partner' || item.need === 'relation') && !state.inviteChecked) {
      state.inviteChecked = true;
      checkInvite({ quiet: true }).then(render);
    }
    return;
  }
  runItem(item);
}

// 풀이를 너무 빨리 돌려주면 값이 없어 보인다. 특히 캐시된 콘텐츠(타로·룬·띠운세)는
// 서버가 곧장 답해서, 누르자마자 결과가 튀어나온다 — 안도령이 헤아린 것이 아니라
// 미리 적어 둔 걸 꺼낸 것처럼 읽힌다. 그래서 최소 시간을 두되, 비싼 풀이일수록 길게
// 잡는다. 6엽전짜리 대운이 1엽전짜리 타로와 같은 속도로 나오면 그만큼 가벼워 보인다.
//
// 어디까지나 **최소**다. 실제 호출이 더 걸리면 그대로 기다리고 여기서 더 늘리지 않는다.
// 그래서 느린 쪽에는 아무 영향이 없고, 빨리 오는 경우에만 실제로 작동한다.
// 실패했을 때는 기다리지 않는다 — 오류를 늦게 알리는 건 연출이 아니라 그냥 답답함이다.
//
// 산가지(local:true)는 서버를 안 부르는 즉석 놀이라 제외한다. 뽑는 맛이 전부인데
// 기다리게 하면 그 맛이 죽는다.
//
// ⚠️ 웹에도 같은 장치가 있지만 상수가 다르다(js/app.js 의 oracleMinMs). 그쪽은 연출이
// 7.2초짜리 정해진 순서라 바닥이 더 높다. **일부러 다른 값이니 맞추려 들지 말 것.**
const READ_MIN_BASE_MS     = 5000;
const READ_MIN_PER_COST_MS = 1200;
const READ_MIN_CAP_MS      = 12000;

const readMinMs = (item) => item?.local ? 0 : Math.min(
  READ_MIN_CAP_MS,
  READ_MIN_BASE_MS + Math.max(0, Number(item?.cost) || 0) * READ_MIN_PER_COST_MS,
);

// 요청 세대. 뒤로가기로 로딩을 벗어난 뒤 응답이 도착하면 사용자를 결과 화면으로
// 끌고 가 버린다. 세대가 바뀌었으면 그 응답은 조용히 버린다.
let _runSeq = 0;

async function runItem(item) {
  const seq = ++_runSeq;
  const started = Date.now();
  state.item = item;
  state.screen = 'loading';
  state.error = '';
  // ⚠️ 여기서 state.loadingLine 을 뽑아 두던 줄이 있었는데, 읽는 곳이 없었다.
  //    로딩 문구는 화면이 loadingLines() 로 첫 줄을 깔고 티커가 차례로 넘긴다.
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
    // 엽전은 이미 나갔지만 결과는 '지난 기록'에 남으므로 잃어버리지 않는다.
    if (seq !== _runSeq || state.screen !== 'loading') return;

    // 최소 시간을 채운다(readMinMs 참고). 남았을 때만 기다린다.
    const remain = readMinMs(item) - (Date.now() - started);
    if (remain > 0) await new Promise(r => setTimeout(r, remain));
    // 기다리는 동안 나갔을 수 있다. 위와 같은 이유로 한 번 더 본다.
    if (seq !== _runSeq || state.screen !== 'loading') return;

    // 응답 모양이 예상과 달라 여기서 던지면 화면이 로딩에 갇힌다. 본문만이라도 띄운다.
    let parsed;
    try {
      parsed = extractResult(data);
    } catch (e) {
      console.error('[extract]', e);
      parsed = { body: data.reading || '', extras: [] };
    }
    // rows 는 띠 순위표다. 글만 보여주면 정작 순위를 못 본다 — 그게 이 콘텐츠의 전부다.
    state.result = {
      item, ...parsed,
      card: data.card, upright: data.upright,
      rows: Array.isArray(data.rows) ? data.rows : null,
      mine: data.mine || null,
    };
    // 카드를 뽑는 콘텐츠는 결과를 곧장 들이밀지 않는다. 뒤집는 순간이 재미의 절반이다.
    state.reveal = !!data.card;
    go('result');
    // 무료 풀이를 봤으면 전면 광고를 예약한다. 엽전을 낸 풀이에는 걸지 않는다 —
    // 돈을 낸 자리에까지 광고를 붙이면 낸 값이 무색해진다.
    //
    // ⚠️ go() **다음에** 세운다. go() 안에 광고를 트는 자리가 있어서, 먼저 세우면
    //    방금 띄운 결과를 광고가 덮는다. 결과 화면을 떠날 때 뜬다.
    if (item.free) state.autoAdPending = true;
  } catch (e) {
    if (seq !== _runSeq || state.screen !== 'loading') return;
    if (e.status === 402) { state.error = '엽전이 부족해요.'; go('charge'); return; }
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
  if (d.branch && d.sipsin) add('배우자궁', `${d.branch}(${d.elem || ''}) ${d.sipsin}`);
  // 신살 — 선 것들을 한 줄로. 없으면 없다고 적는 편이 낫다(빈 화면보다 낫다).
  if (Array.isArray(d.hits)) {
    add('신살', d.hits.length ? d.hits.map(h => h.name).join(', ') : '뚜렷한 신살 없음');
    if (d.samjae?.years?.length) {
      add(d.samjae.inSamjae ? '삼재 (지금)' : '다음 삼재',
        d.samjae.years.map(y => `${y.year}년`).join(', '));
    }
  }
  // 천직 — 가장 두터운 십신 셋
  if (Array.isArray(d.top) && d.top.length) add('두드러진 십신', d.top.join(', '));
  // 재물운 — 어떤 그림인지와 재물이 드는 해
  if (d.shape) add('재물의 결', d.shape);
  // 이사 방위 — 본명궁과 가장 좋은 쪽
  // 귀인 — 알맹이는 "누가 나에게 귀인인가"다. 그 줄이 요약 맨 앞에 와야 한다.
  if (Array.isArray(d.people) && d.people.length) {
    add('내 귀인', d.people.map(p => p.tti + '띠').join(', '));
  }
  if (Array.isArray(d.stars) && d.stars.length) {
    add('사주에 선 귀인', d.stars.map(x => x.name).join(', '));
  }
  if (Array.isArray(d.years) && d.years.length && d.people) {
    add('귀인이 드는 해', d.years.slice(0, 3).map(y => y.year + '년').join(', '));
  }
  if (d.gungName) add('본명궁', d.gungName + ' ' + (d.group || ''));
  if (Array.isArray(d.good) && d.good.length) add('좋은 쪽', d.good.map(x => x.dir).join(', '));
  if (Array.isArray(d.bad) && d.bad.length) add('꺼리는 쪽', d.bad.map(x => x.dir).join(', '));
  if (Array.isArray(d.wealthYears) && d.wealthYears.length) {
    add('재물이 드는 해', d.wealthYears.filter(y => !y.feeds).slice(0, 4).map(y => y.year + '년').join(', '));
  }
  // 띠 순위 — 내 띠가 몇 위인지가 제일 궁금한 값이다.
  if (d.mine?.name) add('내 띠', `${d.mine.name}띠 ${d.mine.rank}위`);
  if (d.dayBranch && Array.isArray(d.rows)) add('오늘 1위', `${d.rows[0].name}띠`);
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

// 누르면 **먼저** 화면을 바꾸고, 목록은 그 뒤에 채운다.
// 예전에는 응답을 다 받고서야 화면이 넘어가서, 누르고 한참 아무 일도 없는 것처럼 보였다.
async function loadHistory() {
  go('history');
  state.historyLoading = true;
  state.error = '';
  render();
  try {
    const r = await api('/api/feature-history?limit=30');
    state.history = r.history || [];
  } catch (e) {
    state.error = e?.message || '기록을 불러오지 못했어요.';
  }
  state.historyLoading = false;
  render();
}

// ── 결제 ──────────────────────────────────────────────────

/**
 * 콘솔에 등록된 상품 목록을 가져와, 서버가 지급할 수 있는 것만 열어 준다.
 *
 * 상품 번호(SKU)는 콘솔이 자동으로 만들어 주는 값이라 이 파일이 미리 알 수가 없다.
 * 예전엔 여기에 SKU 목록을 따로 들고 대조했는데, 같은 번호가 콘솔·앱·서버 세 곳에
 * 살면서 어긋났고 화면엔 '서버 미등록'만 떴다. 지급 가능 여부를 아는 것은 서버뿐이니
 * 서버에 묻는다 — 앱은 번호를 하나도 외우지 않는다.
 */
/**
 * 실패하면 잠시 뒤 다시 해 본다.
 * 네이티브 다리가 준비되기 전에 부른 경우처럼, 기다리면 되는 실패가 있다.
 */
async function retry(fn, times = 3, gapMs = 500) {
  let last;
  for (let i = 0; i < times; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (i < times - 1) await new Promise(r => setTimeout(r, gapMs * (i + 1)));
    }
  }
  throw last;
}

/**
 * 지금 할인 중인지 알아낸다. 할인율을 앱에 적어 두지 않고 두 값을 견주기만 한다 —
 * 기간이 지나도 글자만 남는 일을 막기 위해서다.
 *
 * ⚠️ 견주는 값이 바뀌었다. 예전에는 SDK 의 displayAmount 를 "이 사람이 낼 돈" 으로
 *    보고 서버 정가와 견줬는데, **토스는 소모품에 할인 전 가격을 준다.** 콘솔에
 *    50% 할인을 걸어 둔 상태에서 앱에는 9,900원, 결제창에는 4,950원이 떴다.
 *    그래서 지금은 서버가 아는 할인가(saleAmount)와 정가를 견준다.
 *    서버 쪽은 만료일이 지나면 saleAmount 를 아예 안 주므로 표시도 저절로 사라진다.
 */
function _discountOf(saleAmount, listed) {
  const paid = Number(String(saleAmount ?? '').replace(/[^\d]/g, ''));
  if (!(paid > 0) || !(listed > 0) || paid >= listed) return {};
  const off = Math.round((1 - paid / listed) * 100);
  // 1~2% 는 반올림이나 통화 표기 차이일 수 있다. 그런 걸로 "할인" 이라 떠들지 않는다.
  if (off < 5 || off > 95) return {};
  return { listPrice: listed.toLocaleString('ko-KR') + '원', off };
}

async function loadProducts() {
  state.catalogLoading = true;
  state.catalogError = '';
  render();

  // 서버가 지급할 수 있는 SKU. 이걸 못 받으면 무엇을 열어도 결제 뒤 지급이 안 된다.
  let sellable = new Map();
  try {
    const r = await retry(() => api('/mini/api/products', { auth: false }), 2, 600);
    for (const p of r?.products || []) sellable.set(p.sku, p);
  } catch (e) {
    console.warn('[products:server]', e?.message);
  }

  try {
    // ⚠️ 배열이 아니라 { products: [...] } 로 온다. 배열로 착각해 .map 을 부르면
    //    "map is not a function" 으로 죽는다(실제로 그랬다).
    //
    // 앱을 켜고 **처음** 충전 화면을 열면 목록이 비어서 온다. 네이티브 쪽이 스토어
    // 정보를 아직 못 받은 상태인데, 예외를 던지지 않고 빈 배열을 준다 —
    // 그래서 "실패하면 다시" 만으로는 안 걸리고 그대로 '상품 없음' 이 떠 버렸다.
    // 비어 있는 것도 아직 준비가 안 된 것으로 보고 다시 물어본다.
    const res = await retry(async () => {
      const r = await IAP.getProductItemList();
      if (!(r?.products || []).length) throw new Error('상품 목록이 아직 비어 있음');
      return r;
    }, 4, 600);
    const products = res?.products || [];
    state.catalog = products.map(p => {
      const srv = sellable.get(p.sku);
      const listed = srv?.amount || 0;
      const sale = srv?.saleAmount || 0;
      return {
        sku: p.sku,
        label: p.displayName || srv?.label || p.sku,
        // ⚠️ 할인 중이면 **서버가 아는 할인가**를 적는다. SDK 의 displayAmount 는
        //    할인 전 가격이라, 그대로 쓰면 화면은 9,900원인데 결제창은 4,950원이 된다.
        //    할인이 없으면(또는 기간이 끝났으면) 서버가 saleAmount 를 안 주므로
        //    예전처럼 SDK 값이 그대로 쓰인다.
        price: sale ? `${sale.toLocaleString('ko-KR')}원` : (p.displayAmount || ''),
        known: sellable.has(p.sku),
        ..._discountOf(sale, listed),
      };
    });
  } catch (e) {
    // 화면에는 "잠시 뒤 다시" 만 보여준다. SDK 내부 사정을 사용자가 읽을 이유가 없고,
    // 붉은 글씨는 살 수 있는데도 못 사는 줄 알게 만든다. 원인은 콘솔에 남긴다.
    console.warn('[products:iap]', e?.message);
    state.catalog = null;
  }
  state.catalogLoading = false;
  render();
}

// 결제창을 스스로 닫았을 때 토스가 주는 말들. 기기·SDK 판마다 문구가 갈려서
// 코드 하나로 못 짚는다.
const IAP_CANCEL_RE = /취소|닫|cancel|abort|dismiss|user_?deny|사용자가/i;

// 사람에게 보여줄 만큼만 남긴다. orderId 는 빼고, 길면 자른다.
const _iapReason = (s) => String(s)
  .replace(/\(?\s*orderId\s*:\s*[\w-]+\s*\)?/gi, '')
  .replace(/[()]\s*$/g, '')
  .replace(/\s{2,}/g, ' ')
  .trim()
  .slice(0, 90) || '알 수 없는 오류';

function buyTokens(product) {
  state.error = '';
  state.busy = true;
  render();

  // ⚠️ createOneTimePurchaseOrder 는 **정리 함수**를 돌려주고, SDK 문서는 결제 흐름이
  // 끝나면 반드시 부르라고 한다. 안 부르면 구독이 남아 다음 결제가 엉킨다.
  // 지금까지 반환값을 그냥 버리고 있었다.
  let cleanup = null;
  const finish = () => { try { cleanup?.(); } catch { /* 이미 정리됐으면 그만 */ } cleanup = null; };

  cleanup = IAP.createOneTimePurchaseOrder({
    options: {
      productId: product.sku,   // 구버전 필드지만 타입상 필수라 함께 넣는다
      sku: product.sku,
      // 결제가 끝나면 토스가 이걸 부른다. 서버에 지급을 요청하고 성공 여부를 돌려준다.
      // false 를 돌려주면 토스가 미완료 주문으로 남겨 두고, 다음 실행 때 복구된다.
      processProductGrant: async ({ orderId }) => {
        try {
          const r = await api('/mini/api/payment/grant', { method: 'POST', body: { orderId } });
          gainCoins(r.balance, { ad: false });   // 돈을 낸 사람에게 광고를 틀지 않는다
          return true;
        } catch (e) {
          console.error('[grant]', e?.message);
          return false;
        }
      },
    },
    onEvent: () => { finish(); state.busy = false; state.error = ''; go('home'); },
    onError: (err) => {
      finish();
      state.busy = false;
      const detail = String(err?.message || err?.code || (typeof err === 'string' ? err : ''));
      console.warn('[iap]', err);          // 원인은 콘솔에 그대로 남긴다

      // 사용자가 결제창을 닫은 것도 여기로 온다. 그건 실패가 아니다 —
      // 스스로 그만둔 사람에게 붉은 글씨로 겁줄 일이 아니라, 아무 일도 없었던 것처럼
      // 상품 목록으로 돌아가면 된다.
      if (!detail || IAP_CANCEL_RE.test(detail)) { state.error = ''; render(); return; }

      // 진짜 실패. 다시 해보라고 알려 주되 orderId 같은 내부 값은 빼고 보여준다 —
      // 사용자가 읽어서 할 수 있는 일이 없고, 붉은 글씨만 길어진다.
      state.error = `결제가 완료되지 않았어요. 잠시 후 다시 시도해 주세요.\n(${_iapReason(detail)})`;
      render();
    },
  });
}

// ── 친구에게 알리기 ─────────────────────────────────────────
// 엽전 보상은 붙이지 않는다. 공유창을 띄운 것만으로 줄 수밖에 없는데(실제로 보냈는지는
// 앱이 알 수 없다) 그러면 눌렀다 닫기만 반복해도 엽전이 나온다. 엽전은 출석·퀴즈·광고
// 처럼 확인 가능한 행동에만 붙인다.
// ⚠️ getTossShareLink 의 path 는 **intoss:// 로 시작하는 딥링크**여야 한다.
// '/' 를 넘기고 있었으니 링크가 만들어질 리 없었고, 그때마다 주소 없는 글이 나갔다.
// 받는 사람은 "토스에서 찾아보세요"라는 말만 보고 어디로 갈지 몰랐다.
const APP_DEEPLINK = 'intoss://myan';        // apps-in-toss.config.ts 의 appName 과 같아야 한다
const WEB_URL = 'https://myan.riger7070.workers.dev';

/** 앱으로 오는 길. 토스 링크를 못 만들면 웹 주소라도 남긴다. */
async function appLink() {
  try {
    const link = await getTossShareLink(APP_DEEPLINK);
    if (link) return link;
  } catch (e) { console.warn('[share:link]', e?.message); }
  return WEB_URL;
}

async function shareApp() {
  await withBusy(async () => {
    const link = await appLink();
    await share({
      message: `오늘 내 기운은 어떨까? 안도령이 사주로 풀어줘요.\n${link}`,
    });
  });
}

// ── 놀이: 출석 · 퀴즈 · 산가지 ───────────────────────────────

async function doCheckin() {
  await withBusy(async () => {
    const r = await api('/mini/api/checkin', { method: 'POST', body: {} });
    gainCoins(r.balance);
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
    gainCoins(r.balance);
    state.quiz = { ...q, done: r };
  });
}

// ── 안도령 부풀리기 ──
// 서버가 목표 횟수와 발급 시각을 서명해 준다. 다 두드리면 그걸 그대로 돌려주고,
// 서버가 서명과 걸린 시간을 확인한 뒤 엽전을 준다.
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
    gainCoins(r.balance);
    state.pop = { ...p, done: r };
  } catch (e) {
    state.pop = { ...p, done: { message: e?.message || '보상을 받지 못했어요.' } };
  }
  if (shown) await shown;
  render();
}

/** 산가지 뽑기. 서버를 부르지 않는 무료 재미다 — 결과에 엽전이 걸리면 사행성이 된다. */
function drawStick() {
  const s = SANGAJI[Math.floor(Math.random() * SANGAJI.length)];
  state.stick = s;
  go('stick');
  // 무료 풀이와 같은 규칙. go() 다음에 세워야 방금 뽑은 산가지를 광고가 덮지 않는다.
  // ⚠️ '다시 뽑기' 도 이 함수를 다시 부른다. 그래서 산가지 화면 자체가
  //    AD_QUIET_SCREENS 에 들어 있어야 뽑을 때마다 광고가 튀어나오지 않는다.
  state.autoAdPending = true;
}

// ── 엽전이 쏟아지는 효과 ────────────────────────────────────
//
// 엽전이 늘어난 순간에만 튼다. 숫자만 슬쩍 바뀌면 받은 줄도 모르고 지나간다.
function coinRain(count = 8) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const host = document.createElement('div');
  host.className = 'coin-rain';
  host.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const c = document.createElement('i');
    c.style.left = `${6 + Math.random() * 88}%`;
    c.style.animationDelay = `${(Math.random() * 0.45).toFixed(2)}s`;
    c.style.animationDuration = `${(1.25 + Math.random() * 0.6).toFixed(2)}s`;
    c.style.setProperty('--spin', `${Math.random() < 0.5 ? -1 : 1}`);
    c.innerHTML = COIN_SVG;
    host.appendChild(c);
  }
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 2400);
}

// 둥근 밖, 네모난 안 — 상품 그림과 같은 엽전이다.
const COIN_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
  <circle cx="12" cy="12" r="10"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/></svg>`;

/**
 * 엽전이 늘어난 것을 화면에 반영한다.
 *
 * 잔액을 여기저기서 직접 대입하면, 어디선 효과가 나고 어디선 안 나는 일이 생긴다.
 * 늘어남을 알아채는 자리를 하나로 둔다.
 *
 * @param {number} balance 서버가 알려준 잔액
 * @param {{ ad?: boolean }} opts ad=false 면 자동 광고 대상이 아니다(결제로 받은 경우).
 */
function gainCoins(balance, { ad = true } = {}) {
  const before = state.tokens;
  if (typeof balance === 'number') state.tokens = balance;
  if (state.tokens <= before) return;
  coinRain(Math.min(6 + (state.tokens - before), 14));
  if (ad) state.autoAdPending = true;
}

// ── 광고 ────────────────────────────────────────────────────
//
// 보상형(AD_UNIT_ID): 사용자가 눌러서 본다. 보상은 SDK 가 'userEarnedReward' 를
// 보낼 때만 준다 — 닫기만 한 경우(dismissed)에 주면 띄우고 바로 닫아도 엽전이 나온다.
// 하루 상한은 서버가 쥐고 있어 클라이언트를 고쳐도 넘길 수 없다.
//
// 전면(AD_AUTO_UNIT_ID): 앱이 튼다. **무료로 받은 자리마다** 예약된다 —
// 무료 엽전을 받았을 때, 그리고 무료 풀이(내 사주 풀이·산가지)를 봤을 때.
// 아래를 지킨다.
//   · 보고 난 **화면을 떠날 때** 튼다 — 방금 받은 것을 광고로 덮지 않는다
//   · 하루 몫을 보상형과 **나눠 쓴다**(AD_DAILY_MAX). 따로 세면 합쳐서 대여섯 번이
//     되고, 그쯤이면 앱을 지운다. 예약되는 자리는 다섯이지만 실제로 뜨는 것은 셋까지다
//   · 방금 다른 광고를 본 사람에게는 틀지 않는다(연달아 두 번은 최악이다)
//   · 돈을 낸 사람에게는 틀지 않는다
//   · 실패하면 아무 말 없이 넘어간다. 사용자가 요청한 일이 아니다
//
// ⚠️ 예전에는 여기에 "하루 한 번" 제한이 따로 있었다(AUTO_AD_DAY_KEY). 무료 풀이마다
//    틀라는 요청으로 그 제한만 걷어냈다. **하루 세 번 상한은 그대로 둔다** — 그것이
//    실제 안전판이고, 이것까지 풀면 하루에 다섯 번이 뜬다.

/**
 * 광고 하나를 띄운다. 보상 여부를 돌려준다.
 *
 * ⚠️ SDK 가 받는 이름은 **adGroupId** 다(adUnitId 가 아니다). 콘솔이 주는 값도
 * '광고 그룹 ID' 라 부른다. adUnitId 로 넣으면 SDK 는 아무 말 없이 아무것도 안 한다 —
 * 눌러도 광고가 안 뜨는데 오류도 없어서 원인을 찾기 어렵다.
 *
 * 한 번 켜지면 끝나야 한다. 응답이 영영 안 오면 busy 가 풀리지 않아 화면이 잠긴다.
 */
function showAd(groupId) {
  return new Promise((resolve, reject) => {
    // 토스 웹뷰에는 개발자 도구가 없다. 광고가 안 뜰 때 무엇이 오갔는지 남겨 두지
    // 않으면 알아낼 방법이 없어서, 받은 신호를 모아 실패 메시지에 함께 싣는다.
    const trail = [];
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const fail = (e) => {
      if (settled) return;
      settled = true;
      e.trail = trail.join('>') || '아무 신호도 없음';
      reject(e);
    };

    // SDK 가 이 기기·앱 버전에서 광고를 지원하는지부터 본다. 지원하지 않으면
    // 불러도 조용히 아무 일도 일어나지 않는다.
    try {
      if (GoogleAdMob.loadAppsInTossAdMob.isSupported?.() === false) {
        return fail(new Error('이 토스 앱 버전에서는 광고를 볼 수 없어요'));
      }
    } catch { /* isSupported 가 없으면 그냥 진행한다 */ }

    // 광고가 안 오면 20초 뒤 포기한다. 사용자를 무한정 기다리게 두지 않는다.
    const timer = setTimeout(() => fail(new Error('광고 응답이 없습니다')), 20000);
    const stop = (fn) => (...a) => { clearTimeout(timer); return fn(...a); };

    let shown = false;
    GoogleAdMob.loadAppsInTossAdMob({
      options: { adGroupId: groupId },
      onEvent: (e) => {
        trail.push(`load:${e?.type ?? '?'}`);
        if (e?.type !== 'loaded' || shown) return;   // onEvent 는 여러 번 올 수 있다
        shown = true;
        let rewarded = false;
        GoogleAdMob.showAppsInTossAdMob({
          options: { adGroupId: groupId },
          onEvent: (ev) => {
            trail.push(`show:${ev?.type ?? '?'}`);
            if (ev?.type === 'userEarnedReward') rewarded = true;
            if (ev?.type === 'dismissed' || ev?.type === 'failedToShow') stop(done)(rewarded);
          },
          onError: (err) => { console.warn('[ad:show]', err); stop(done)(rewarded); },
        });
      },
      onError: stop(fail),
    });
  });
}

// 하루에 볼 수 있는 광고는 셋까지. 보상형과 자동 광고가 이 수를 함께 쓴다 —
// 종류별로 따로 세면 합쳐서 하루 대여섯 번이 되고, 그쯤이면 앱을 지운다.
// 서버도 같은 수로 보상을 막는다(worker.js 의 MINI_AD_DAILY_MAX).
const AD_DAILY_MAX = 3;
const AD_DAY_KEY = 'myan_mini_ad_day';        // '2026-08-12:2' — 날짜와 본 횟수
// 광고와 광고 사이의 최소 간격. 무료 자리마다 예약되므로, 이것이 없으면
// 한 화면에서 다음 화면으로 넘어가는 사이에 두 편이 잇따라 뜬다.
const AD_GAP_MS = 3 * 60 * 1000;

// 광고를 틀지 않고 지나가는 화면.
//   loading  풀이를 기다리는 중이다. 여기서 틀면 무엇을 기다리는지도 모른 채 광고를 본다
//   result   방금 나온 풀이를 덮는다
//   stick    산가지도 결과 화면이다. '다시 뽑기' 가 같은 화면으로 다시 들어오므로
//            여기를 빼 두지 않으면 뽑을 때마다 광고가 튀어나온다
const AD_QUIET_SCREENS = new Set(['loading', 'result', 'stick']);
let _lastAdAt = 0;

const _kstDay = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

/** 오늘 몇 편이나 봤는지. 날짜가 바뀌면 0 부터 다시 센다. */
function adsSeenToday() {
  try {
    const [day, n] = String(localStorage.getItem(AD_DAY_KEY) || '').split(':');
    return day === _kstDay() ? (parseInt(n, 10) || 0) : 0;
  } catch { return 0; }
}

function markAdSeen() {
  _lastAdAt = Date.now();
  try { localStorage.setItem(AD_DAY_KEY, `${_kstDay()}:${adsSeenToday() + 1}`); } catch { /* 못 세도 서버가 막는다 */ }
}

const adsLeftToday = () => Math.max(0, AD_DAILY_MAX - adsSeenToday());

/** 무료 엽전을 받은 뒤, 그 화면을 떠날 때 한 번 튼다. */
async function runAutoAdIfDue() {
  if (!state.autoAdPending) return;
  state.autoAdPending = false;
  if (!AD_AUTO_UNIT_ID) return;
  if (state.noAds) return;                                  // 결제하신 분께는 틀지 않는다
  if (Date.now() - _lastAdAt < AD_GAP_MS) return;           // 방금 광고를 봤다
  if (!adsLeftToday()) return;                              // 오늘 몫을 다 썼다
  try {
    await showAd(AD_AUTO_UNIT_ID);
    markAdSeen();                                           // 실제로 뜬 것만 센다
  } catch (e) { console.warn('[autoad]', e?.message); }
}

async function watchAd() {
  if (!AD_UNIT_ID) { state.toast = '광고가 아직 준비되지 않았어요.'; render(); return; }
  if (!adsLeftToday()) {
    state.toast = `광고는 하루 ${AD_DAILY_MAX}번까지예요. 내일 다시 만나요.`; render(); return;
  }
  state.busy = true; state.error = ''; render();

  let rewarded = false;
  try {
    rewarded = await showAd(AD_UNIT_ID);
  } catch (e) {
    // 못 띄웠으면 하루 몫도 깎지 않는다. 보지도 못한 광고를 세면 억울하다.
    state.busy = false;
    // 무슨 신호가 오갔는지 함께 보여준다. 웹뷰엔 개발자 도구가 없어서, 화면이
    // 말해 주지 않으면 왜 안 뜨는지 알아낼 방법이 없다.
    state.error = `광고를 불러오지 못했어요.\n(${e?.message || e}${e?.trail ? ` ${e.trail}` : ''})`;
    console.warn('[ad]', e?.message, e?.trail);
    render();
    return;
  }
  markAdSeen();                              // 실제로 뜬 것만 센다

  state.busy = false;
  if (!rewarded) { render(); return; }     // 끝까지 안 봤으면 보상도 없다
  try {
    const r = await api('/mini/api/ad-reward', { method: 'POST', body: {} });
    // 광고를 보고 받은 것이니 그 보상으로 또 광고를 틀지 않는다.
    gainCoins(r.balance, { ad: false });
    state.toast = r.message || '';
  } catch (e) {
    state.error = e?.message || '보상 지급에 실패했어요.';
    render();
    return;
  }

  // 광고 보상은 엽전 하나로 끝이 아니다. 서버가 그날 놀이 기회도 함께 늘려 준다
  // (_miniAdBonusToday). 그런데 화면이 그 기회를 열어 주지 않아서, 광고를 다 보고도
  // 결과 화면에 그대로 서 있었다 — 한 번 더 하려고 본 사람에게는 속은 셈이다.
  // 광고를 본 그 자리에서 바로 다시 시작한다.
  if (state.screen === 'quiz') { await startQuiz(); return; }
  if (state.screen === 'pop') { await startPop(); return; }
  render();
}

// ── 공유 ──────────────────────────────────────────────────
//
// 예전에는 '이미지로 저장'과 '친구에게 알리기'가 따로 있었다. 저장은 앨범에 넣을 뿐
// 남에게 보내는 동작이 아니었고, 알리기는 앱 링크만 보내서 정작 방금 읽은 풀이가
// 빠졌다. 둘을 하나로 합쳐, 읽은 것을 그대로 보낸다.

async function shareResult() {
  const r = state.result;
  if (!r) return;
  await withBusy(async () => {
    await share({ message: _resultShareText(r, await appLink()) });
  });
}

/**
 * 공유할 글을 짓는다.
 *
 * 풀이는 **전문**을 싣는다. 앞부분만 보내고 "나머지는 앱에서"라고 하면 보낸 사람에게나
 * 맞는 말이다 — 받는 사람은 남의 계정 기록을 열 수 없으니, 잘라낸 만큼은 영영 못 본다.
 * 앱 링크는 맨 끝에 붙여, 읽고 나서 궁금하면 따라오게 한다.
 */
/**
 * 첫 문장을 떼어 낸다. 카톡 목록에는 앞 두 줄만 보이므로, 거기에 제목이 아니라
 * 풀이의 한 문장이 있어야 눌러 보게 된다.
 *
 * 너무 짧으면("그렇습니다.") 후크가 안 되고, 너무 길면 목록에서 잘린다.
 * 그 사이일 때만 떼고, 아니면 건드리지 않는다.
 */
function _pullQuote(body) {
  const m = body.match(/^(.+?(?:다|요)\.)\s*/);
  if (!m) return { hook: '', rest: body };
  let hook = m[1].trim();

  // 안도령은 "제가 기운을 살펴보니," 처럼 운을 떼고 시작한다. 마주 앉아 들을 때는
  // 좋은 도입이지만, 카톡 목록 첫 줄에서는 정작 할 말이 밀려나 잘린다.
  // 뒤에 남는 말이 충분할 때만 걷어낸다.
  const lead = hook.match(/^[^,]{0,20}(?:보니|보면|하니|살펴보니|들여다보니),\s*/);
  if (lead && hook.length - lead[0].length >= 16) {
    hook = hook.slice(lead[0].length).replace(/^./, c => c.toUpperCase());
  }

  if (hook.length < 12 || hook.length > 70) return { hook: '', rest: body };
  return { hook, rest: body.slice(m[0].length).trim() };
}

function _resultShareText(r, link) {
  const body = String(r.body || '')
    .replace(/[ \t]+\n/g, '\n')      // 줄 끝에 남은 공백
    .replace(/\n{3,}/g, '\n\n')      // 빈 줄은 하나까지만
    .trim();
  // 한 줄에 몰아 넣으면 "酉(金) 정재, 살펴볼 해 2027년, 2033년" 처럼 어디까지가 한
  // 항목인지 흐려진다. 항목마다 줄을 준다.
  const facts = (r.extras || []).map(e => `${e.label} ${e.value}`).join('\n');
  const { hook, rest } = _pullQuote(body);
  return [
    // 후크가 잡히면 그것이 첫 줄이고, 무엇을 본 것인지는 그 아래로 내린다.
    hook ? `"${hook}"` : `[${r.item.label}] ${speakerOf(r.item).name}의 풀이`,
    hook ? `${speakerOf(r.item).name}의 ${r.item.label}` : '',
    facts,
    hook ? rest : body,
    link || '토스에서 "오늘운빨"을 찾아보세요.',
  ].filter(Boolean).join('\n\n');
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

  // 무료로 무언가를 받았다면 그 화면을 **떠날 때** 광고를 튼다. 받은 자리에서 바로
  // 틀면 축하 화면이나 풀이를 덮어 버려서, 무엇을 받았는지 보지도 못한 채 광고부터
  // 보게 된다. 유료 풀이를 보러 가는 길목도 비켜 준다 — 돈을 쓰려는 사람을 막을
  // 이유가 없다.
  if (!AD_QUIET_SCREENS.has(screen)) runAutoAdIfDue();
}

function goBack() {
  // 메뉴가 열려 있으면 그것부터 닫는다. 화면을 넘기기 전에 덮인 것을 걷어내는 게
  // 사용자가 기대하는 순서다.
  if (state.menu) { state.menu = false; render(); return; }
  // 나가겠냐고 물어 놓은 상태라면 그 물음부터 거둔다.
  if (state.confirmExit) { state.confirmExit = false; render(); return; }
  state.error = '';                 // 떠나는 화면의 말은 두고 간다
  const prev = _stack.pop();
  if (prev) { go(prev, { fromBack: true }); return; }

  // 더 돌아갈 곳이 없다. 예전에는 여기서 곧장 닫았는데, 홈에서 뒤로가기를 한 번
  // 잘못 누르면 아무 확인도 없이 앱이 사라졌다. 한 번 물어본다.
  state.confirmExit = true;
  render();
}

function closeApp() {
  state.confirmExit = false;
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
// ⚠️ 첫 줄에만 이름이 들어간다. 받침에 따라 "안도령이 / 안낭자가" 로 갈리므로
//    조사를 손으로 적지 않는다.
const _iGa = (w) => ((w.charCodeAt(w.length - 1) - 0xac00) % 28 ? '이' : '가');
const LOADING_TAIL = [
  '오늘의 일진을 펼쳐 보는 중입니다',
  '사주의 오행을 헤아리는 중입니다',
  '기운의 결을 따라가는 중입니다',
  '풀이를 글로 옮기는 중입니다',
  '마지막으로 다듬는 중입니다',
];

/** 지금 보는 콘텐츠의 화자로 첫 줄을 맞춘다. */
function loadingLines() {
  const sp = speakerOf(state.item);
  return [`${sp.name}${_iGa(sp.name)} 붓을 고르는 중입니다`, ...LOADING_TAIL];
}

// 안도령 둘레를 도는 오행. 상생 순서(木火土金水)로 놓아 도는 방향에 뜻이 있게 했다.
const ORBIT = [
  { ch: '木', color: '#5d9e6f' }, { ch: '火', color: '#c0563f' },
  { ch: '土', color: '#c9a96e' }, { ch: '金', color: '#e6e2d8' },
  { ch: '水', color: '#4a7bb0' },
];

let _loadingTimer = null;

function startLoadingTicker() {
  stopLoadingTicker();
  const lines = loadingLines();
  let i = 0;
  _loadingTimer = setInterval(() => {
    // 마지막 문구에 닿으면 거기서 멈춘다. 계속 돌면 끝나지 않는 것처럼 보인다.
    if (i >= lines.length - 1) { stopLoadingTicker(); return; }
    i++;
    const el = document.getElementById('load-line');
    if (!el) { stopLoadingTicker(); return; }
    el.style.opacity = '0';
    setTimeout(() => { el.textContent = lines[i]; el.style.opacity = '1'; }, 260);
  }, 2600);
}

function stopLoadingTicker() {
  if (_loadingTimer) { clearInterval(_loadingTimer); _loadingTimer = null; }
}

// 메뉴에 담기는 것들. 홈 아래쪽에 흩어져 있던 것을 한자리에 모았다.
const MENU_ITEMS = [
  { id: 'btn-earn',        icon: 'secGift',  label: '무료 엽전 받기', sub: '출석, 퀴즈, 부풀리기' },
  { id: 'btn-history',     icon: 'saju',     label: '지난 기록',      sub: '풀이를 다시 볼 수 있어요' },
  { id: 'btn-editprofile', icon: 'secProfile', label: '내 정보',      sub: '이름, 생년월일, 화면 밝기' },
  { id: 'btn-shareapp',    icon: 'share',    label: '친구에게 알리기', sub: '' },
];

/**
 * 광고를 보면 엽전을 더 받는다는 자리.
 *
 * 예전에는 "광고를 보면 한 번 더 할 수 있어요"라고 글만 적어 두고, 정작 누를 곳은
 * 다른 데 있었다. 안내를 읽은 자리에서 바로 누를 수 있어야 한다 — 그 글이 곧 버튼이다.
 */
function adPrompt() {
  if (!AD_UNIT_ID || !adsLeftToday()) return '';   // 오늘 몫을 다 썼으면 아예 안 보인다
  return `<button class="ad-prompt" id="btn-ad" ${state.busy ? 'disabled' : ''}>
    <span class="ad-ic">${icon('ad')}</span>
    광고 시청 시 무료 엽전 +${AD_TOKENS}, 한 번 더
  </button>`;
}

function header() {
  // 좌우 칸의 폭을 같게 두어야 제목이 진짜 가운데에 온다. 예전에는 오른쪽에 엽전 // 알약이 있어서 그 폭만큼 제목이 왼쪽으로 밀렸다.
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
      <button class="tb-token" id="btn-charge">${COIN}${state.tokens} 엽전</button>
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
    ${state.confirmExit ? `
      <div class="menu-scrim" id="btn-exit-scrim"></div>
      <div class="exit-ask" role="alertdialog" aria-label="앱을 닫을까요">
        <p><b>오늘운빨을 닫을까요?</b></p>
        <p class="muted small">보던 풀이는 지난 기록에 남아 있어요.</p>
        <div class="row2" style="margin-top:14px">
          <button class="btn ghost" id="btn-exit-no">더 볼래요</button>
          <button class="btn" id="btn-exit-yes">닫기</button>
        </div>
      </div>` : ''}
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
    // ⚠️ 로그인보다 이 화면이 먼저다.
    //
    // 심사에서 한 번 반려됐다: "서비스 설명 없이 즉시 토스 로그인을 유도하고 있어
    // 인트로 페이지 추가가 필요해요." 처음 온 사람은 이게 무슨 앱인지도 모르는 채
    // 계정을 내주게 되는 셈이었다. 무엇을 해 주는 곳인지 먼저 보여주고,
    // 로그인은 그다음 화면에서 받는다.
    case 'intro':
      html = `
        <div class="brand"><h1>MY;安</h1><p>오늘운빨</p></div>

        <section class="hero">
          <div class="hero-sky"></div>
          <div class="hero-text">
            <p class="hero-date">명리학으로 보는 하루</p>
            <h2 class="hero-hi">안도령이<br>오늘의 기운을 풀어 드려요</h2>
          </div>
        </section>

        <section class="sec">
          <h3><span class="sec-icon">${icon('saju')}</span>무엇을 볼 수 있나요<i class="rule"></i></h3>
          ${/* 홈의 타일과 같은 모양이되 누르는 것이 아니다(.show).
                여기서 눌러 봐야 로그인 화면으로 튕길 뿐이라, 손가락을 부르지 않는다. */''}
          <div class="tiles">
            ${[
              ['today', '오늘의 기운', '그날 일진과 내 사주를 함께 봅니다'],
              ['saju', '사주 풀이', '타고난 네 기둥을 읽습니다'],
              ['compat', '궁합', '두 사람의 결이 어떻게 맞물리는지'],
              ['takil', '택일 · 신살 · 재물운', '스무 가지가 넘습니다'],
            ].map(([ic, label, desc]) => `
              <div class="tile show">
                <span class="t-icon">${icon(ic)}</span>
                <span class="t-label">${label}</span>
                <span class="t-cost">${desc}</span>
              </div>`).join('')}
          </div>
        </section>

        <section class="sec">
          <h3><span class="sec-icon">${icon('yeopjeon')}</span>엽전으로 봅니다<i class="rule"></i></h3>
          <div class="card">
            <p class="muted">풀이 하나에 ${COIN}엽전이 듭니다.
              출석하거나, 오행 퀴즈를 풀거나, 안도령을 터뜨리면
              날마다 무료로 받을 수 있어요. 모자라면 충전할 수도 있습니다.</p>
          </div>
        </section>

        <section class="sec">
          <h3><span class="sec-icon">${icon('lock')}</span>왜 로그인이 필요한가요<i class="rule"></i></h3>
          <div class="card">
            <p class="muted">받은 풀이와 엽전을 다음에도 그대로 쓰시려면 계정이 필요합니다.
              토스 계정을 그대로 쓰므로 따로 가입하거나 비밀번호를 만들지 않아요.
              생년월일은 사주를 세우는 데에만 씁니다.</p>
          </div>
        </section>

        <button class="btn" id="btn-intro-next">시작하기</button>
        <div class="ai-notice">${AI_NOTICE}</div>
        ${FOOTER}`;
      break;

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
          <button class="btn ghost sm" id="btn-login-back" style="margin-top:10px">다시 살펴보기</button>
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
            <div class="mp-token"><b>${state.tokens}</b><span>${COIN}엽전</span></div>
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
              ${COIN}엽전과 지난 기록은 계정에 남아 있어요. 다시 로그인하면 그대로 쓰실 수 있습니다.
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
              <p class="hero-date">${d.getMonth() + 1}월 ${d.getDate()}일 ${esc(m.name)}</p>
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
                  <span class="t-cost${it.cost ? '' : ' free'}">${it.cost ? `${COIN}${it.cost} 엽전` : '무료'}</span>
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
          <h3><span class="sec-icon">${icon('secGift')}</span>무료 ${COIN}엽전 받기<i class="rule"></i></h3>
          <p class="muted small" style="margin:-4px 0 12px">모두 하루에 한 번씩 하실 수 있어요</p>
        </section>
        ${err}
        <div class="tiles">
          <button class="tile" id="btn-checkin">
            <span class="t-icon">${icon('checkin')}</span><span class="t-label">출석 도장</span>
            <span class="t-cost">${state.checkin ? `${state.checkin.streak}일째` : `7일 개근 ${COIN}엽전 3개`}</span>
          </button>
          <button class="tile" id="btn-quiz">
            <span class="t-icon">${icon('quiz')}</span><span class="t-label">안도령의 오행 퀴즈</span>
            <span class="t-cost">2개 맞히면 ${COIN}엽전 1개</span>
          </button>
          <button class="tile" id="btn-pop">
            <span class="t-icon">${icon('pop')}</span><span class="t-label">안도령 부풀리기</span>
            <span class="t-cost">${COIN}엽전 1개, 하루 1번</span>
          </button>
        </div>
        <button class="btn ghost" id="btn-home2" style="margin-top:16px">홈으로</button>
        ${FOOTER}`;
      break;

    case 'need': {
      const it = state.item;
      html = `${header()}
        <div class="brand sm"><h1><span class="ic-title">${icon(it.icon)}</span> ${esc(it.label)}</h1>
          <p>${COIN}${it.cost} 엽전</p></div>
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
            <img src="${API}${speakerOf(state.item).file}" alt="" class="oracle" onerror="this.style.display='none'">
            ${ORBIT.map((o, i) => `<span class="orb" style="
                --a:${(360 / ORBIT.length) * i}deg; color:${o.color};
                animation-delay:${-i * 1.4}s">${o.ch}</span>`).join('')}
          </div>
          <p class="muted load-line" id="load-line">${esc(loadingLines()[0])}</p>
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
            <div class="hero-who">
              <img class="hero-face" src="${API}${speakerOf(r.item).file}" alt=""
                   onerror="this.style.display='none'">
              <span>
                <b>${esc(speakerOf(r.item).name)}의 풀이</b>
                <i>${esc(speakerOf(r.item).intro)}</i>
              </span>
            </div>
            <h2 class="hero-hi"><span class="ic-title">${icon(r.item.icon)}</span>${esc(r.item.label)}</h2>
            ${r.extras?.length ? `<div class="mp-facts">${r.extras.map(e =>
              `<span><i>${esc(e.label)}</i>${esc(e.value)}</span>`).join('')}</div>` : ''}
          </div>
        </section>
        ${r.card ? `<div class="card-stage"><div class="tarot flipped">
            <span class="tarot-face">${esc(r.card.icon || '🔮')}<b>${esc(r.card.name || '')}</b>
            ${r.upright === false ? '<i>역방향</i>' : '<i>정방향</i>'}</span>
          </div></div>` : ''}
        ${/* 띠 순위표. 이 콘텐츠는 표가 본문이다 — 글보다 먼저 보여준다. */''}
        ${r.rows?.length ? `<div class="card tti-board">
          ${r.rows.map(row => `
            <div class="tti-row${r.mine?.branch === row.branch ? ' mine' : ''}">
              <span class="tti-rank${row.rank <= 3 ? ' top' : ''}${row.rank >= 10 ? ' low' : ''}">${row.rank}</span>
              <span class="tti-name">${esc(row.name)}띠</span>
              <span class="tti-why">${esc((row.why || []).join(', '))}</span>
            </div>`).join('')}
        </div>` : ''}
        <div class="card reading">${paras || '<p class="muted">내용을 불러오지 못했어요.</p>'}</div>
        <div class="row2">
          <button class="btn" id="btn-share" ${state.busy ? 'disabled' : ''}>공유하기</button>
          <button class="btn ghost" id="btn-home2">홈으로</button>
        </div>
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
        ${err}
        ${state.history.length ? state.history.map((h, i) => `
          <button class="card hist" data-hist="${i}">
            <div class="row"><b>${esc(h.title || h.feature || '')}</b>
              <span class="muted small">${esc(_histDate(h))}</span></div>
            <p class="muted">${esc(_preview(h))}</p>
            <span class="hist-more">전체 보기 ›</span>
          </button>`).join('')
        : state.historyLoading
          // 불러오는 동안 자리를 잡아 둔다. 빈 화면을 보여주면 기록이 없는 줄 안다.
          ? Array.from({ length: 3 }, () => `<div class="card hist-skel">
              <div class="skel-line w40"></div><div class="skel-line"></div>
              <div class="skel-line w70"></div></div>`).join('')
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
          <p>${done ? '' : `안도령이 내는 문제예요. 두 개 이상 맞히면 ${COIN}엽전 1개`}</p></div>
        ${done || !q.tips?.length ? '' : `
          <div class="card hint">
            <button class="hint-toggle" id="btn-tips">
              ${state.showTips ? '▾' : '▸'} 안도령의 귀띔 ${state.showTips ? '' : '(모르겠으면 열어보세요)'}
            </button>
            ${state.showTips ? `<ul class="tips">${q.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
          </div>`}
        ${done ? `
          <div class="card"><p>${esc(done.message)}</p>
            ${adPrompt()}
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
            ${adPrompt()}
          </div>
          <div class="row2">
            ${p.done.remainToday > 0
              ? '<button class="btn ghost" id="btn-pop">한 번 더</button>' : '<span></span>'}
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
        <div class="ai-notice">산가지는 재미로 보는 것이며, ${COIN}엽전이 걸려 있지 않습니다.</div>
        ${FOOTER}`;
      break;
    }

    case 'charge': {
      // 콘솔에 등록된 상품을 우선 보여준다. 아직 못 받았으면 코드에 적어 둔 목록으로
      // 그린다(콘솔 등록 전에는 눌러도 실패하므로 그 사실을 함께 알린다).
      // 콘솔이 준 목록만 실제로 살 수 있다. SKU 를 콘솔이 만들어 주기 때문에
      // 코드에 적어 둔 PRODUCTS 로는 결제가 안 된다 — 그래서 못 받았으면 아예 안 그린다.
      const list = state.catalog || [];
      // 콘솔에는 있는데 서버가 아직 지급하지 못하는 상품들. 시크릿(MINI_SKU_ALIAS)에 그
      // 번호가 안 들어갔다는 뜻이다. 토스 웹뷰에는 개발자 도구가 없어서, 어느 번호를
      // 넣어야 하는지를 화면이 직접 말해 주지 않으면 알아낼 방법이 없다 —
      // 그래서 그대로 눌러 복사할 수 있게 번호를 적어 둔다.
      const unknown = (state.catalog || []).filter(p => p.known === false);
      html = `${header()}
        <div class="brand sm"><h1>${COIN}엽전 충전</h1><p>현재 ${COIN}${state.tokens} 엽전</p></div>
        ${err}
        ${/* 불러오는 중에는 자리만 잡아 둔다. 붉은 글씨를 먼저 보여주면
              살 수 있는데도 못 사는 줄 안다. */''}
        ${state.catalogLoading && !list.length
          ? PRODUCTS.map(() => `<div class="tile wide skel-tile">
              <div class="skel-line w40"></div></div>`).join('')
          : list.map(p => `
            <button class="tile wide" data-sku="${esc(p.sku)}"${p.known === false ? ' disabled' : ''}>
              <span class="t-label">${esc(p.label)}${p.off
                ? `<span class="t-off">${p.off}% 할인</span>` : ''}</span>
              <span class="t-cost">${p.known === false
                ? '준비 중'
                : `${p.off ? `<s class="t-was">${esc(p.listPrice)}</s>` : ''}${esc(p.price || '토스로 결제')}`}</span>
            </button>`).join('')}
        ${/* 할인은 기간이 정해져 있고 사람마다 다르다. 그래서 이 줄도 값에서 끌어낸다 -
              할인이 끝나면 두 값이 같아져 이 줄 자체가 사라진다. */''}
        ${list.some(p => p.off) ? `<p class="muted small" style="text-align:center;margin:4px 0 12px">
          지금은 첫 구매 할인 중이에요.</p>` : ''}
        ${/* 못 불러왔을 때. 사용자는 SDK 사정을 알 필요가 없다 —
              무엇을 하면 되는지만 담담히 적고, 자세한 원인은 콘솔에만 남긴다. */''}
        ${!state.catalogLoading && !list.length ? `<div class="card">
          <p class="muted">상품을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.</p>
          <button class="btn ghost" id="btn-retry-products" style="margin-top:12px">다시 시도</button>
          </div>` : ''}
        ${unknown.length ? `<div class="card">
          <p class="muted small">일부 상품이 아직 준비 중이에요.</p>
          ${unknown.map(p => `<p class="muted small" style="opacity:.6">${esc(p.label)} · ${esc(p.sku)}</p>`).join('')}
          </div>` : ''}
        ${/* 글은 한 덩어리(span)로 묶는다. 안 그러면 <b> 가 별도 칸이 되어
              "한 번만 결제하시면 / 자동으로 뜨는 광고가" 처럼 갈라진다. */''}
        ${state.noAds
          ? `<div class="perk done"><span class="perk-ic">${icon('ad')}</span>
               <span><b>광고가 사라졌습니다.</b> 고맙습니다.<br>
               <i>퀴즈·부풀리기에서 나오는 특별 무료 ${COIN}엽전 광고는 유지됩니다.</i></span></div>`
          : `<div class="perk"><span class="perk-ic">${icon('ad')}</span>
               <span>한 번만 결제하시면 <b>광고가 사라집니다.</b><br>
               <i>퀴즈·부풀리기에서 나오는 특별 무료 ${COIN}엽전 광고는 유지됩니다.</i></span></div>`}
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
    case 'surname':
      return `<label>성(姓)</label>
        <input id="f-sn" placeholder="예: 김" maxlength="2" value="${esc(p.surname || '')}">
        <p class="muted small" style="margin-top:8px">비워 두셔도 됩니다. 성을 적으면 소리의 어울림까지 함께 봅니다.</p>`;
    case 'partner':
      return `<label>상대방 생년월일</label>
        <div class="grid3">
          <input id="p-y" type="number" inputmode="numeric" placeholder="1990" value="${esc(p.year || '')}">
          <input id="p-m" type="number" inputmode="numeric" placeholder="5" value="${esc(p.month || '')}">
          <input id="p-d" type="number" inputmode="numeric" placeholder="15" value="${esc(p.day || '')}">
        </div>
        <label>태어난 시각 (선택)</label>
        <input id="p-h" placeholder="예: 오전 9시" value="${esc(p.hour || '')}">
        ${invitePanel()}`;
    case 'relation':
      // 상대 생일은 'partner' 와 같은 칸을 쓴다(collectForm 도 같은 id 를 읽는다).
      return `<label>어떤 사이인가요</label>
        <select id="f-rel">${RELATIONS.map(r =>
          `<option value="${r.v}"${r.v === (p.relation || '') ? ' selected' : ''}>${r.label}</option>`).join('')}</select>
        <label>상대방 생년월일</label>
        <div class="grid3">
          <input id="p-y" type="number" inputmode="numeric" placeholder="1990" value="${esc(p.year || '')}">
          <input id="p-m" type="number" inputmode="numeric" placeholder="5" value="${esc(p.month || '')}">
          <input id="p-d" type="number" inputmode="numeric" placeholder="15" value="${esc(p.day || '')}">
        </div>
        <label>태어난 시각 (선택)</label>
        <input id="p-h" placeholder="예: 오전 9시" value="${esc(p.hour || '')}">
        <p class="muted small" style="margin-top:8px">시각까지 넣으면 앞날을 그리는 자리(시의 기둥)까지 함께 봅니다.</p>
        ${invitePanel()}`;
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

// ── 상대에게 물어보기 ────────────────────────────────────────
//
// 남의 생년월일을 대신 적는 건 늘 자신이 없다. 기억이 어긋나면 풀이도 어긋난다.
// 링크를 보내 본인이 적게 하면 값도 맞고, 받은 사람도 이 앱을 한 번 열게 된다.
// 실제로 답이 왔을 때만 엽전 1개를 드린다(하루 3개까지) — 링크만 뿌려서는 안 준다.

function invitePanel() {
  const iv = state.invite;
  if (!iv) {
    return `<div class="invite">
      <button class="btn ghost sm" id="btn-invite">상대에게 직접 물어보기</button>
      <p class="muted small">링크를 보내면 상대가 자기 생년월일을 적어 줘요.
        답이 오면 ${COIN}1 엽전을 드려요.</p>
    </div>`;
  }
  if (iv.answered) {
    return `<div class="invite">
      <p class="small">상대가 답했어요. 생년월일을 채워 두었으니 보기를 눌러 주세요.</p>
    </div>`;
  }
  return `<div class="invite">
    <p class="muted small">보낸 링크의 답을 기다리고 있어요.</p>
    <button class="btn ghost sm" id="btn-invite-check">답이 왔는지 확인</button>
    <button class="btn ghost sm" id="btn-invite-again">링크 다시 보내기</button>
  </div>`;
}

/** withBusy 가 화면을 다시 그리므로, 적던 값은 미리 state 로 옮겨 둔다. */
function _keepPartnerInput() {
  const v = (id) => document.getElementById(id)?.value.trim() || '';
  const p = { year: v('p-y'), month: v('p-m'), day: v('p-d'), hour: v('p-h') };
  if (p.year || p.month || p.day || p.hour) state.form = { ...state.form, partner: p };
}

async function makeInvite() {
  _keepPartnerInput();
  await withBusy(async () => {
    let iv = state.invite;
    // 아직 답이 없는 초대가 있으면 그걸 다시 보낸다. 누를 때마다 새로 만들면
    // 상대는 링크를 두 개 받고, 우리 쪽에는 남의 생년월일 자리만 늘어난다.
    if (!iv || iv.answered) {
      const r = await api('/mini/api/invite', { method: 'POST', body: {} });
      iv = { id: r.id, url: r.url, answered: false };
      state.invite = iv;
    }
    const me = state.profile?.name ? `${state.profile.name}님이` : '누군가';
    await share({
      message: `${me} 우리 궁합을 물어봤어요.\n생년월일만 적으면 둘의 결이 나와요.\n${iv.url}`,
    });
  });
}

/** 답이 왔는지 본다. 왔으면 상대 생년월일 칸을 대신 채운다. */
async function checkInvite({ quiet = false } = {}) {
  const run = async () => {
    const r = await api('/mini/api/invite');
    // 답이 온 것 중 가장 최근 것. 내가 만든 초대만 오므로 남의 답은 섞이지 않는다.
    const done = (r.invites || []).find((x) => x.answered && x.partner);
    if (!done) {
      if (!quiet) state.toast = '아직 답이 오지 않았어요.';
      return;
    }
    state.invite = { id: done.id, url: done.url, answered: true };
    state.form = { ...state.form, partner: done.partner };
  };
  if (quiet) { await run().catch(() => {}); return; }
  await withBusy(run);
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
    case 'surname': return { surname: v('f-sn') };
    case 'partner': {
      const y = v('p-y'), m = v('p-m'), d = v('p-d');
      if (!y || !m || !d) return { error: '상대방 생년월일을 모두 입력해 주세요.' };
      return { partner: { year: +y, month: +m, day: +d, hour: v('p-h') } };
    }
    case 'relation': {
      const y = v('p-y'), m = v('p-m'), d = v('p-d');
      if (!y || !m || !d) return { error: '상대방 생년월일을 모두 입력해 주세요.' };
      return { relation: v('f-rel'), partner: { year: +y, month: +m, day: +d, hour: v('p-h') } };
    }
    default: return {};
  }
}

function bind() {
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };

  // ⚠️ 찾는 범위는 반드시 #app 안이다. document 전체로 찾으면 <html data-theme="dark">
  // 까지 걸린다 — 그러면 <html> 에 onclick 이 붙어, 화면 어디를 눌러도 그리로
  // 버블링돼 render() 가 돌고 #app 이 통째로 다시 그려진다. 입력칸이 새 요소로
  // 갈리니 포커스가 날아가고, 글자를 칠 수 없다("눌러도 무반응"의 정체).
  const all = (sel) => app.querySelectorAll(sel);

  on('btn-login', doLogin);
  // 지난 결제에서 남은 문구를 끌고 들어오지 않는다.
  on('btn-charge', () => {
    state.catalog = undefined; state.catalogError = ''; state.error = '';
    go('charge'); loadProducts();
  });
  // 화면을 스스로 떠나는 동작이다. 붙잡고 있던 오류 문구도 여기서 놓는다 —
  // 안 그러면 결제 화면에서 난 말이 홈까지 따라와 붉게 남는다.
  on('btn-home', () => { state.error = ''; go(state.profile?.birthYear ? 'home' : 'profile'); });
  on('btn-home2', () => { state.error = ''; go('home'); });
  on('btn-editprofile', () => go('profile'));
  on('btn-invite', makeInvite);
  on('btn-invite-again', makeInvite);
  on('btn-invite-check', () => checkInvite());
  on('btn-history', loadHistory);
  on('btn-logout', async () => {
    // 세션만 지운다. 엽전과 기록은 서버의 계정(userKey)에 남아 있어서
    // 다시 로그인하면 그대로 돌아온다.
    // 자동 로그인 표식도 함께 지운다 — 스스로 나간 사람을 다음 실행에서 도로
    // 밀어 넣으면 로그아웃 버튼이 아무 일도 안 한 것이 된다.
    await forgetSession({ keepLinked: false });
    Object.assign(state, { profile: null, tokens: 0, history: [], result: null, error: '' });
    go('login');
  });
  // 인트로 → 로그인. 이 순서를 지키는 것이 심사 조건이다.
  on('btn-intro-next', () => { state.error = ''; go('login'); });
  on('btn-login-back', () => { state.error = ''; go('intro'); });
  on('btn-menu', () => { state.menu = !state.menu; render(); });
  on('btn-retry-products', loadProducts);
  on('btn-exit-yes', closeApp);
  const stayIn = () => { state.confirmExit = false; render(); };
  on('btn-exit-no', stayIn);
  on('btn-exit-scrim', stayIn);        // 바깥을 눌러도 닫힌다
  on('btn-menu-close', () => { state.menu = false; render(); });
  on('btn-earn', () => go('earn'));
  on('btn-earn2', () => go('earn'));      // 홈 엽전 줄의 작은 길잡이
  on('btn-share', shareResult);
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
  for (const el of all('[data-hist]')) {
    el.onclick = () => { state.histIndex = +el.dataset.hist; go('histview'); };
  }
  const tap = document.getElementById('pop-tap');
  if (tap) {
    // click 은 모바일에서 300ms 가까이 늦는다. 연타에는 pointerdown 이 맞다.
    tap.onpointerdown = (e) => { e.preventDefault(); tapPop(); };
  }

  // 퀴즈 보기 선택 — 고르면 바로 다음 문제로
  for (const el of all('[data-a]')) {
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
  for (const el of all('[data-theme]')) {
    el.onclick = () => { applyTheme(el.dataset.theme); render(); };
  }

  // 성별은 선택 즉시 화면에 표시만 해 둔다(저장은 '저장하기'에서 한 번에).
  for (const el of all('[data-gender]')) {
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

  for (const el of all('[data-item]')) {
    el.onclick = () => { const it = itemById(el.dataset.item); if (it) openItem(it); };
  }
  for (const el of all('[data-sku]')) {
    // 타일에 박힌 SKU 를 그대로 쓴다. 예전엔 이걸 PRODUCTS 에서 다시 찾았는데, 콘솔 SKU 는
    // 자동 생성값이라 그 목록에 있을 리가 없어서 find 가 늘 undefined 였다 — 타일이 열려
    // 있어도 눌리지 않았다. 무엇을 파는지는 이미 서버가 정했고(loadProducts), 여기서 할
    // 일은 그 번호를 토스에 넘기는 것뿐이다.
    el.onclick = () => { if (el.dataset.sku) buyTokens({ sku: el.dataset.sku }); };
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
