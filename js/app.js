// M;Y 安 — app.js  (API·채팅·결제·마이페이지 메인 로직)
async function callGemini(contents) {
  if (!getGoogleIdToken()) throw { refund: false, noLogin: true };

  const doFetch = () => fetch(EP + 'chat', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      mode: mode,
      lang: lang,
      contents: contents
    }),
  });

  let res  = await doFetch();
  let data = await res.json();

  // 토큰 부족 (서버에서 차감 실패)
  if (res.status === 402 || res.status === 403) throw { refund: false, noToken: true };

  // 인증 실패 → 토큰 폐기
  if (res.status === 401) {
    _googleIdToken = ''; _googleIdTokenExp = 0;
    localStorage.removeItem('myan_id_token');
    throw { refund: false, noLogin: true };
  }

  // 속도 제한 → 1회 재시도 (3초 대기)
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 3500));
    res  = await doFetch();
    data = await res.json();
    // 재시도 후에도 429이면 rate-limit 전용 에러 (토큰 미차감이므로 refund: true로 잔액 동기화)
    if (res.status === 429) throw { refund: true, rateLimited: true };
  }

  if (data?.error) throw { refund: true, code: data.error.code, msg: data.error.message };
  if (data?.promptFeedback?.blockReason) throw { refund: true, blocked: true };

  // 서버가 현재 잔액을 함께 내려줌 → 캐시 갱신
  if (data._tokens !== undefined) {
    _tokenCache = parseInt(data._tokens, 10) || 0;
    updateAllTokenDisplays();
  }

  return data;
}

async function autoAnalyze() {
  // 1. 토큰 차감 전 잔액 확인
  if (!checkAndDeductToken()) {
    addBubble(TX[lang].noToken, 'ai');
    return;
  }
  
  const inp = document.getElementById('inp');
  const btn = document.getElementById('send');
  btn.disabled = true; inp.disabled = true;
  const loader = addLoader();

  try {
    const data = await callGemini(trimmedHist());
    const cand = data?.candidates?.[0];
    const raw  = cand?.content?.parts?.[0]?.text;
    
    // 안전 필터 / 빈 응답 → 에러로 간주하여 throw
    if (!raw) throw { refund: true, reason: cand?.finishReason };
    
    hist.push({ role: 'model', parts: [{ text: raw }] });
    const clean = raw.replace(/#[木火土金水]\s*/g, '').replace(/\*\*/g, '').trim();
    addBubble(clean, 'ai');

    const tag = ['木','火','土','金','水'].find(k => raw.includes('#' + k));
    if (tag) addRxCard(tag);

    // solo 모드: 클리프행어 연출 — 타이핑 시간 + 여유 500ms 후 게이지 페이드인
    if (mode === 'solo' && data._ohaeng) {
      try { localStorage.setItem('myan_ohaeng', JSON.stringify(data._ohaeng)); } catch {}
      const revealMs = clean.length <= 300
        ? clean.length * 22 + 500   // 타이핑 완료 직후 리빌
        : 1800;                      // 긴 텍스트는 즉시 표시 후 1.8초 딜레이
      _renderSajuGaugeFromGemini(data._ohaeng, revealMs);
    }
    showSuggestChips();

  } catch(e) {
    // 2. 에러 발생 시 토큰 복구 및 즉시 화면 동기화
    if (e?.noLogin) {
        addTokens(1);
        updateAllTokenDisplays();
        showLogin();
        return;
    }
    if (e?.noToken) {
        await refreshTokens();
        updateAllTokenDisplays();
        addBubble(TX[lang].noToken, 'ai');
        return;
    }
    if (e?.rateLimited) {
        await refreshTokens();
        updateAllTokenDisplays();
        addBubble({ko:'요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',en:'Too many requests. Please try again shortly.',zh:'请求过于频繁，请稍后再试。',ja:'リクエストが多すぎます。しばらくしてから再試行してください。'}[lang]||'잠시 후 다시 시도해 주세요.', 'ai');
        showSuggestChips();
        return;
    }
    if (e?.refund) {
        addTokens(1);
        updateAllTokenDisplays();
    }

    // 3. 에러 메시지 세분화 (Safety 관련인지 여부)
    const msg = (e?.blocked || e?.reason === 'SAFETY') ? TX[lang].errSafety : TX[lang].err;
    addBubble(msg, 'ai');
    showSuggestChips();

    if (hist.length > 0 && hist[hist.length-1].role === 'model') hist.pop();
    
  } finally {
    // 4. 로딩 제거 및 입력창 상태 복구
    loader.remove(); 
    btn.disabled = false; 
    inp.disabled = false;
    inp.focus(); 
    cw().scrollTop = 99999;
  }
}

function saveChatState() {
  if (!mode || !hist.length) return;
  try {
    localStorage.setItem('myan_chat_mode', mode);
    localStorage.setItem('myan_chat_hist', JSON.stringify(hist));
    localStorage.setItem('myan_chat_html', document.getElementById('chat-window').innerHTML);
  } catch(e) {}
}

function clearChatState() {
  localStorage.removeItem('myan_chat_mode');
  localStorage.removeItem('myan_chat_hist');
  localStorage.removeItem('myan_chat_html');
}

function clearAndRestartChat() {
  clearChatState();
  const m = mode;
  const user = getUser();
  hist = [];
  document.getElementById('chat-window').innerHTML = '';
  document.getElementById('newChatBtn').style.display = 'none';
  _enterMode(m, user);
}

function goBack() {
  saveChatState(); // 채팅 상태 저장
  document.getElementById('screen-chat').style.display   = 'none';
  document.getElementById('screen-signup').style.display = 'none';
  document.getElementById('screen-login').style.display  = 'none';
  document.getElementById('screen-mode').style.display   = 'flex';
  document.getElementById('backBtn').style.display       = 'none';
  mode = null; hist = [];
  // 모드 화면 복귀 시 userBtn / signupLinkBtn 복원
  const u = getUser();
  const _userBtn = document.getElementById('userBtn');
  if (u && isLoggedIn()) {
    updateUserBtn(u);
    document.getElementById('signupLinkBtn').style.display = 'none';
  } else if (u && !isLoggedIn()) {
    if (_userBtn) _userBtn.style.display = 'none';
    document.getElementById('signupLinkBtn').style.display = 'none';
  } else {
    if (_userBtn) _userBtn.style.display = 'none';
    document.getElementById('signupLinkBtn').style.display = '';
  }
  // 무료 배너 상태 업데이트 + 오브 색상 초기화
  updateFreeBanner();
  _resetOrbTheme();
}

/* DOM 헬퍼 */
const cw = () => document.getElementById('chat-window');

function addBubble(text, who) {
  const d = document.createElement('div');
  d.className = `bubble bubble-${who}`;
  if (who === 'ai') {
    // 텍스트 노드를 별도 관리 → 타이핑 효과 적용 & 복사 버튼 충돌 방지
    const tn = document.createTextNode('');
    d.appendChild(tn);
    const btn = document.createElement('button');
    btn.className = 'bubble-copy-btn';
    btn.title = '복사';
    btn.textContent = '⎘';
    btn.onclick = () => _copyBubble(btn, text);
    d.addEventListener('click', () => {
      btn.classList.add('visible');
      clearTimeout(btn._hideTimer);
      btn._hideTimer = setTimeout(() => btn.classList.remove('visible'), 2500);
    });
    d.appendChild(btn);
    cw().appendChild(d);
    cw().scrollTop = 99999;
    // 이전 타이핑 중단 후 새 타이핑 시작
    if (_typingAbort) _typingAbort.abort();
    _typeIntoNode(tn, text, 22);
  } else {
    d.textContent = text;
    cw().appendChild(d);
    cw().scrollTop = 99999;
  }
  return d;
}

function _copyBubble(btn, text) {
  navigator.clipboard?.writeText(text).then(() => {
    btn.textContent = '✓';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '⎘'; btn.classList.remove('copied'); }, 2000);
  }).catch(() => {});
}

// ── 로딩 문구 사이클 (AI 분석 중 심리적 몰입 유도) ──
const _LOAD_MSGS = {
  ko: [
    '사주의 흐름을 읽는 중입니다…',
    '오행의 기운을 탐색하고 있습니다…',
    '일진과 사주의 조화를 분석하는 중입니다…',
    '부족한 오행 에너지를 계산하는 중입니다…',
    '최적의 처방을 구성하는 중입니다…',
  ],
  en: [
    'Reading your Saju flow…',
    'Exploring your Five Elements…',
    'Analyzing the Ilchin harmony…',
    'Calculating deficient energies…',
    'Composing your energy prescription…',
  ],
  zh: [
    '正在解读您的四柱流动…',
    '探索五行气运中…',
    '分析日辰与四柱的调和…',
    '构建最佳能量处方中…',
  ],
  ja: [
    '四柱の流れを読み取っています…',
    '五行の気運を探索しています…',
    '日辰との調和を分析しています…',
    '最適な処方を構成しています…',
  ],
};

function addLoader() {
  const d = document.createElement('div');
  d.className = 'bubble bubble-ai loading-msg';

  const msgs = _LOAD_MSGS[lang] || _LOAD_MSGS.ko;
  let idx = 0;
  const span = document.createElement('span');
  span.className = 'loader-text';
  span.textContent = msgs[0];
  d.appendChild(span);

  // 1.8초마다 문구 교체 (loader.remove() 시 자동 정리)
  d._msgTimer = setInterval(() => {
    idx = (idx + 1) % msgs.length;
    span.style.opacity = '0';
    setTimeout(() => {
      span.textContent = msgs[idx];
      span.style.opacity = '1';
    }, 250);
  }, 1800);

  cw().appendChild(d);
  cw().scrollTop = 99999;

  // 원본 remove 래핑 — 타이머도 함께 정리
  const _origRemove = d.remove.bind(d);
  d.remove = () => { clearInterval(d._msgTimer); _origRemove(); };

  return d;
}

function addRxCard(o) {
  // 처방 카드 등장 시 해당 오행 파티클 버스트
  window.M_Effect?.spawnParticles('chat-window', o);

  const dk  = DK[lang][o];
  const col = OC[o];
  const bg  = OBG[o];
  const t   = TX[lang];

  // 오행 한자 + 한국명 (예: 木 / 목(木))
  const hanja   = o;                      // 木 火 土 金 水
  const kiName  = ON[lang][o];            // 목(木) / Wood / 木气 / 木(もく)

  const wrap = document.createElement('div');
  wrap.className = 'rx-duo';
  wrap.innerHTML = `
    <div class="rx-ki-card" style="border-color:${col}50">
      <div class="rx-ki-eyebrow">${t.kiLabel || '오늘의 강한 기운'}</div>
      <div class="rx-ki-hanja" style="color:${col}">${hanja}</div>
      <div class="rx-ki-name" style="color:${col}">${kiName}</div>
    </div>
    <div class="rx-act-card" style="border-color:${col}30;background:${bg}">
      <div class="rx-act-eyebrow">${t.actLabel || '오늘 하면 좋은 것'}</div>
      <div class="rx-act-icon">${dk.icon}</div>
      <div class="rx-act-name" style="color:${col}">${dk.name}</div>
      <div class="rx-act-desc">${dk.desc}</div>
    </div>`;
  cw().appendChild(wrap);
  setTimeout(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
  _setOrbTheme(o);
  _saveCalEntry(o); // 오늘 기운 캘린더에 저장
}

// 오행 오브 색상 팔레트 (각 오브별 강도 차등)
const _ORB_PALETTE = {
  木: ['rgba(75,200,122,0.13)','rgba(75,200,122,0.07)','rgba(75,200,122,0.09)','rgba(75,200,122,0.05)','rgba(75,200,122,0.04)'],
  火: ['rgba(224,90,74,0.13)', 'rgba(224,90,74,0.07)', 'rgba(224,90,74,0.09)', 'rgba(224,90,74,0.05)', 'rgba(224,90,74,0.04)'],
  土: ['rgba(212,160,64,0.13)','rgba(212,160,64,0.07)','rgba(212,160,64,0.09)','rgba(212,160,64,0.05)','rgba(212,160,64,0.04)'],
  金: ['rgba(160,170,180,0.11)','rgba(160,170,180,0.06)','rgba(160,170,180,0.08)','rgba(160,170,180,0.04)','rgba(160,170,180,0.04)'],
  水: ['rgba(90,168,224,0.13)', 'rgba(90,168,224,0.07)', 'rgba(90,168,224,0.09)', 'rgba(90,168,224,0.05)', 'rgba(90,168,224,0.04)'],
};
const _ORB_DEFAULT = [
  'rgba(75,200,122,0.07)','rgba(224,90,74,0.07)',
  'rgba(90,168,224,0.07)','rgba(212,160,64,0.06)','rgba(160,170,180,0.05)',
];
function _setOrbTheme(o) {
  const palette = o ? (_ORB_PALETTE[o] || _ORB_DEFAULT) : _ORB_DEFAULT;
  for (let i = 1; i <= 5; i++) {
    const el = document.querySelector(`.orb-${i}`);
    if (el) el.style.background = palette[i-1];
  }
}
function _resetOrbTheme() { _setOrbTheme(null); }

// ── 처방 카드 공유 ──
function _shareRxCard({ o, name, desc }) {
  const text = `✦ M;Y 安 · 오늘의 오행 처방\n[${ON.ko[o] || o}] ${name}\n${desc}\n\nmyan.riger7070.workers.dev`;
  if (navigator.share) {
    navigator.share({ title: 'M;Y 安 · 오늘의 처방', text }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.querySelector('.rx-share-btn');
      if (btn) { btn.textContent = '✓ 클립보드에 복사됨'; setTimeout(() => { btn.textContent = '🌟 오늘의 처방 공유하기'; }, 2000); }
    });
  }
}

// ── 캘린더 저장 ──
function _saveCalEntry(element) {
  const today = new Date().toISOString().slice(0, 10);
  let cal = {};
  try { cal = JSON.parse(localStorage.getItem('myan_cal') || '{}'); } catch {}
  cal[today] = element;
  // 365일 이상된 항목 정리 (localStorage 무한 증가 방지)
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  Object.keys(cal).forEach(k => { if (k < cutoffStr) delete cal[k]; });
  localStorage.setItem('myan_cal', JSON.stringify(cal));
}

// ── 오행 캘린더 모달 ──
let _calYear = new Date().getFullYear();
let _calMonth = new Date().getMonth(); // 0-based

function openCalModal() {
  _calYear = new Date().getFullYear();
  _calMonth = new Date().getMonth();
  _renderCalendar();
  document.getElementById('cal-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function closeCalModal() {
  document.getElementById('cal-modal').style.display = 'none';
  document.body.style.overflow = '';
}
function _calPrevMonth() { _calMonth--; if (_calMonth < 0) { _calMonth = 11; _calYear--; } _renderCalendar(); }
function _calNextMonth() { _calMonth++; if (_calMonth > 11) { _calMonth = 0; _calYear++; } _renderCalendar(); }

function _renderCalendar() {
  const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  document.getElementById('calTitle').textContent = `${_calYear}년 ${monthNames[_calMonth]}`;

  let cal = {};
  try { cal = JSON.parse(localStorage.getItem('myan_cal') || '{}'); } catch {}

  const today = new Date().toISOString().slice(0, 10);
  const firstDay = new Date(_calYear, _calMonth, 1).getDay();
  const daysInMonth = new Date(_calYear, _calMonth + 1, 0).getDate();

  const grid = document.getElementById('calGrid');
  let html = '';
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';
  const VALID_OHAENG = new Set(['木','火','土','金','水']);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${_calYear}-${String(_calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const rawElem = cal[key];
    // XSS 방지: 알려진 오행 값만 허용
    const elem = VALID_OHAENG.has(rawElem) ? rawElem : null;
    const isToday = key === today;
    const bg = elem ? `background:${OC[elem]}33` : 'background:rgba(255,255,255,0.03)';
    const border = elem ? `border:1.5px solid ${OC[elem]}66` : 'border:1px solid rgba(255,255,255,0.06)';
    html += `<div class="cal-cell${elem ? ' has-entry' : ''}${isToday ? ' today' : ''}" style="${bg};${border}" title="${elem ? ON.ko[elem] : ''}">${d}${elem ? `<span style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);font-size:0.45rem;opacity:0.8">${elem}</span>` : ''}</div>`;
  }
  grid.innerHTML = html;

  // 범례
  const legend = document.getElementById('calLegend');
  legend.innerHTML = Object.entries(OC).map(([e,col]) =>
    `<div class="cal-legend-item"><div class="cal-legend-dot" style="background:${col}"></div>${ON.ko[e]||e}</div>`
  ).join('');
}

// ── 사주 오행 분포 계산 ──


/* 전송 */
async function send() {
  const inp = document.getElementById('inp');
  const btn = document.getElementById('send');
  const txt = inp.value.trim();
  if (!txt || btn.disabled) return;

  // solo 모드에서 사주 미입력 시 우회 차단
  const _sendUser = getUser();
  if (mode === 'solo' && !_sendUser?.birthYear && hist.length === 0 && !txt.includes('일생')) {
    addBubble('오늘 하루의 오행 기운을 정확히 처방하기 위해, 먼저 성함과 생년월일을 입력해 주세요. 🙏', 'ai');
    showFirstInputForm();
    return;
  }

  // 토큰 차감
  if (!checkAndDeductToken()) {
    addBubble(TX[lang].noToken, 'ai');
    return;
  }

  // [Gemini 교대 규칙 준수] solo 모드 첫 질문에 사주 프로필을 결합하여 1개의 turn으로 전송
  let processedTxt = txt;
  if (mode === 'solo' && _sendUser?.birthYear && hist.length === 0) {
    processedTxt = `[사용자 사주 정보: ${buildUserProfile(_sendUser)}]\n\n질문: ${txt}`;
  }

  btn.disabled = true; inp.disabled = true;
  addBubble(txt, 'user'); inp.value = '';
  hist.push({role:'user', parts:[{text:processedTxt}]});
  const loader = addLoader();

  try {
    const data = await callGemini(trimmedHist());
    const cand = data?.candidates?.[0];
    const raw  = cand?.content?.parts?.[0]?.text;
    if (!raw) throw { refund: true, reason: cand?.finishReason };
    hist.push({role:'model', parts:[{text:raw}]});
    const clean = raw.replace(/#[木火土金水]\s*/g,'').replace(/\*\*/g,'').trim();
    addBubble(clean, 'ai');
    const tag = ['木','火','土','金','水'].find(k => raw.includes('#'+k));
    if (tag) addRxCard(tag);
    // solo 모드: 클리프행어 연출
    if (mode === 'solo' && data._ohaeng) {
      try { localStorage.setItem('myan_ohaeng', JSON.stringify(data._ohaeng)); } catch {}
      const revealMs = clean.length <= 300 ? clean.length * 22 + 500 : 1800;
      _renderSajuGaugeFromGemini(data._ohaeng, revealMs);
    }
    showSuggestChips();
 } catch(e) {
    // ✨ 에러 발생 시 사용자가 썼던 텍스트를 입력창에 복구
    inp.value = txt;

    if (e?.noLogin) { addTokens(1); updateAllTokenDisplays(); showLogin(); return; }
    if (e?.noToken) { await refreshTokens(); updateAllTokenDisplays(); addBubble(TX[lang].noToken, 'ai'); return; }
    if (e?.rateLimited) {
      await refreshTokens(); updateAllTokenDisplays();
      addBubble({ko:'요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',en:'Too many requests. Please try again shortly.',zh:'请求过于频繁，请稍后再试。',ja:'リクエストが多すぎます。しばらくしてから再試行してください。'}[lang]||'잠시 후 다시 시도해 주세요.', 'ai');
      hist.pop(); showSuggestChips(); return;
    }
    if (e?.refund)  { addTokens(1); updateAllTokenDisplays(); }
    const msg = (e?.blocked || e?.reason === 'SAFETY') ? TX[lang].errSafety : TX[lang].err;
    addBubble(msg, 'ai');
    hist.pop();
    showSuggestChips();
  } finally {
    loader.remove(); btn.disabled = false; inp.disabled = false;
    inp.focus(); cw().scrollTop = 99999;
  }
}

document.getElementById('send').addEventListener('click', send);
document.getElementById('inp').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
document.getElementById('backBtn').addEventListener('click', () => {
  if      (document.getElementById('screen-mypage').style.display === 'flex') closeMyPage();
  else if (document.getElementById('screen-signup').style.display === 'flex') goBackFromSignup();
  else if (document.getElementById('screen-login').style.display  === 'flex') goBackFromLogin();
  else goBack();
});

/* ── 회원가입 ── */
const SHEETS_EP  = 'https://script.google.com/macros/s/AKfycbyJEDLW1Ohx9rQYrkSxFUNNl8LmRtUK-WkXg4sgtLBLfpPJcYfpXMJXQH9Ya2k36j3l/exec';
const GOOGLE_CID = '806789036860-iu94f5ne93t2vh2mvfuqmi3mj95m8ick.apps.googleusercontent.com';


let selGender = '';
let selGenderMp = '';

/* ── 토큰 시스템 (서버 기반) ── */
let _tokenCache = 0;

function getTokens() { return _tokenCache; }

// 클라이언트는 더 이상 토큰을 직접 차감하지 않음.
// 서버(/chat)가 호출 시 자동 차감/검증/환불 처리.
// 이 함수는 호환을 위해 남겨두지만 항상 true를 반환 — 실제 차감은 서버에서.
function checkAndDeductToken() {
  if (_tokenCache <= 0) return false;
  // 낙관적 UI: 캐시는 미리 -1, 서버 응답으로 정확한 값 동기화
  _tokenCache = Math.max(0, _tokenCache - 1);
  updateAllTokenDisplays();
  _spawnTokenPop();
  return true;
}

function _spawnTokenPop() {
  const chip = document.getElementById('tokenChip');
  if (!chip) return;
  const rect = chip.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'token-pop';
  el.textContent = '−1';
  el.style.left = (rect.left + rect.width / 2 - 10) + 'px';
  el.style.top  = (rect.top - 4) + 'px';
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// 결제 승인·환불 후 서버 잔액으로 다시 맞추기
async function addTokens(_amount) {
  await refreshTokens();
}

async function refreshTokens() {
  if (!getGoogleIdToken()) {
    // 세션 토큰 만료. 실제 로그아웃과 구별:
    // myan_logged_in이 남아있으면 → 만료된 것이므로 조용히 silent refresh 시도, 캐시 유지
    // myan_logged_in이 없으면 → 실제 로그아웃 상태이므로 0으로 초기화
    if (isLoggedIn()) {
      _silentTokenRefresh();       // 새 ID 토큰 백그라운드 발급 시도
      updateAllTokenDisplays();    // 기존 캐시 값 그대로 표시 (0으로 안 만듦)
      return _tokenCache;
    }
    _tokenCache = 0;
    updateAllTokenDisplays();
    return 0;
  }
  try {
    const res = await fetch(EP + 'user-tokens', { headers: authHeaders() });
    if (!res.ok) { updateAllTokenDisplays(); return _tokenCache; }
    const data = await res.json();
    _tokenCache = parseInt(data.tokens, 10) || 0;
    // localStorage 표시값 동기화 (옛 코드 호환)
    try {
      const u = JSON.parse(localStorage.getItem('myan_user') || 'null');
      if (u) { u.tokens = _tokenCache; localStorage.setItem('myan_user', JSON.stringify(u)); }
    } catch {}
    // 기존 사용자 1회 마이그레이션
    if (!data.migrated) await migrateLocalTokens();
  } catch {}
  updateAllTokenDisplays();
  return _tokenCache;
}

async function migrateLocalTokens() {
  try {
    const u = JSON.parse(localStorage.getItem('myan_user') || 'null');
    const local = u && u.tokens ? parseInt(u.tokens, 10) : 0;
    if (local <= 0) return;
    const res = await fetch(EP + 'migrate-tokens', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ tokens: local }),
    });
    if (res.ok) {
      const data = await res.json();
      _tokenCache = parseInt(data.tokens, 10) || _tokenCache;
    }
  } catch {}
}

function updateAllTokenDisplays() {
  const t = _tokenCache;
  const count = document.getElementById('chatTokenCount');
  const chip  = document.getElementById('tokenChip');
  const num   = document.getElementById('mypageTokenNum');
  const tmNum = document.getElementById('tmBalanceNum');
  if (count) count.textContent = t;
  if (chip)  chip.classList.toggle('low', t > 0 && t <= 5);
  if (num)   num.textContent = t;
  if (tmNum) tmNum.textContent = t;
  // 토큰 0 안내 표시
  const zeroNote = document.getElementById('mpZeroNote');
  if (zeroNote) {
    const msg = (TX[lang] || TX.ko).mpZeroNote;
    zeroNote.textContent = msg || '';
    zeroNote.style.display = (t === 0) ? 'block' : 'none';
  }
}

let _adminTab       = 'pending';
let _adminPayments  = [];

// 관리자 인증: 구글 로그인 이메일이 ADMIN_EMAIL과 일치하면 허용 (서버에서 검증)
const ADMIN_EMAIL  = 'riger7070@gmail.com';

/* ── Google ID Token 관리 ── */
let _googleIdToken = '';
let _googleIdTokenExp = 0;

// ── Silent Token Refresh ──
// Google ID 토큰은 1시간 유효. 만료 전 자동 재발급하여 토큰이 0이 되는 현상 방지.
let _silentRefreshTimer  = null;
let _silentRefreshActive = false;

function _scheduleTokenRefresh() {
  if (_silentRefreshTimer) clearTimeout(_silentRefreshTimer);
  if (!_googleIdTokenExp) return;
  // 만료 10분 전에 silent refresh 실행 (50분 후)
  const delay = _googleIdTokenExp - Date.now() - 10 * 60 * 1000;
  if (delay <= 0) { _silentTokenRefresh(); return; }
  _silentRefreshTimer = setTimeout(_silentTokenRefresh, delay);
}

function _silentTokenRefresh() {
  // 명시적 로그아웃/비로그인 상태면 갱신하지 않음
  if (localStorage.getItem('myan_signed_out') === 'true') return;
  if (!isLoggedIn()) return;
  if (_silentRefreshActive) return;
  _silentRefreshActive = true;
  try {
    _ensureGisInit(); // GIS 초기화 보장
    google.accounts.id.prompt(notification => {
      _silentRefreshActive = false;
      // 'skipped' / 'dismissed': 자동 갱신 불가 (사용자가 구글에서 로그아웃한 경우 등)
      // 이 경우도 기존 캐시를 유지하고, 다음 채팅 요청 시 서버가 401 반환하면 로그인 유도
    });
  } catch(e) {
    _silentRefreshActive = false;
  }
}

function setGoogleIdToken(token) {
  _googleIdToken = token;
  try {
    const p = token.split('.')[1];
    const pad = '='.repeat((4 - p.length % 4) % 4);
    const payload = JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/') + pad));
    _googleIdTokenExp = (payload.exp || 0) * 1000;
    localStorage.setItem('myan_id_token', token);
    _scheduleTokenRefresh(); // 만료 10분 전 자동 재발급 예약
  } catch {}
}
function getGoogleIdToken() {
  if (!_googleIdToken) _googleIdToken = localStorage.getItem('myan_id_token') || '';
  if (!_googleIdToken) return '';
  if (_googleIdTokenExp && Date.now() > _googleIdTokenExp - 5*60*1000) {
    _googleIdToken = ''; _googleIdTokenExp = 0;
    localStorage.removeItem('myan_id_token');
    return '';
  }
  // exp를 한 번 더 파싱 (페이지 새로고침 직후)
  if (!_googleIdTokenExp) {
    try {
      const p = _googleIdToken.split('.')[1];
      const pad = '='.repeat((4 - p.length % 4) % 4);
      const payload = JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/') + pad));
      _googleIdTokenExp = (payload.exp || 0) * 1000;
      if (Date.now() > _googleIdTokenExp - 5*60*1000) {
        _googleIdToken = ''; localStorage.removeItem('myan_id_token'); return '';
      }
      _scheduleTokenRefresh(); // 새로고침 후 복원된 토큰에도 타이머 예약
    } catch {}
  }
  return _googleIdToken;
}
function authHeaders(extra) {
  const h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
  const t = getGoogleIdToken();
  if (t) h['Authorization'] = 'Bearer ' + t;
  return h;
}

// 어드민 전용 헤더 — Google ID 토큰만으로 인증 (서버에서 Google 서버 검증)
function adminAuthHeaders(extra) {
  return authHeaders(extra);
}


// ── 토스페이먼츠 결제 확인 (백엔드 승인 요청) ──
async function _confirmTossPayment({ paymentKey, orderId, amount }) {
  try {
    const res = await fetch(`${EP}api/payment/verify`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) })
    });
    const result = await res.json();
    if (result.success) {
      await refreshTokens();
      alert('✦ 토큰이 충전되었습니다!');
    } else {
      alert(`결제 검증 실패: ${result.error?.message || '고객센터(riger7070@naver.com)로 문의해 주세요.'}`);
    }
  } catch {
    alert('결제 확인 중 오류가 발생했습니다. 고객센터(riger7070@naver.com)로 문의 바랍니다.');
  }
}

// ── 토스페이먼츠 직접 결제창 호출 ──
const TOSS_CLIENT_KEY = 'test_ck_lpP2YxJ4K877JAdv7KX8RGZwXLOb';

async function buyToken(pkg) {
  const user = getUser();
  if (!user || !isLoggedIn()) { showLogin(); return; }

  const pkgs = {
    'S': { name: '마이안 토큰 30개',  amount: 4900  },
    'M': { name: '마이안 토큰 100개', amount: 12900 },
    'L': { name: '마이안 토큰 300개', amount: 29900 }
  };
  const selected = pkgs[pkg];
  if (!selected) return;

  const orderId = `myan_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;

  try {
    const tossPayments = TossPayments(TOSS_CLIENT_KEY);
    const payment = tossPayments.payment({ customerKey: user.email });

    await payment.requestPayment({
      method: 'CARD',
      amount: { currency: 'KRW', value: selected.amount },
      orderId,
      orderName:     selected.name,
      customerEmail: user.email,
      customerName:  user.name || '고객',
      // 결제 후 돌아올 URL — 토스가 ?paymentKey=&orderId=&amount= 를 자동으로 붙여줌
      successUrl: 'https://myan.riger7070.workers.dev/',
      failUrl:    'https://myan.riger7070.workers.dev/?payFailed=1',
    });
    // requestPayment는 항상 페이지 이동 — 아래 코드는 실행되지 않음
  } catch (err) {
    if (err?.code === 'USER_CANCEL') return;
    console.error('[buyToken]', err);
    alert('결제 오류가 발생했습니다. 고객센터(riger7070@naver.com)로 문의 바랍니다.');
  }
}

// ── 관리자 패널 ──
async function openAdminPanel() {
  const user = getUser();
  if (!user || user.email !== ADMIN_EMAIL) return;
  document.getElementById('admin-panel').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  await renderAdminPanel();
}

function closeAdminPanel() {
  document.getElementById('admin-panel').style.display = 'none';
  document.body.style.overflow = '';
}

function setAdminTab(tab) {
  _adminTab = tab;
  ['pending','approved','all','grant'].forEach(t => {
    document.getElementById('adminTab' + t.charAt(0).toUpperCase() + t.slice(1))
      .classList.toggle('on', t === tab);
  });
  const isGrant = tab === 'grant';
  document.getElementById('adminPaymentList').style.display = isGrant ? 'none' : '';
  document.getElementById('adminGrantPanel').style.display  = isGrant ? 'block' : 'none';
  if (!isGrant) _renderAdminList();
}

async function adminGrantTokens() {
  const email  = document.getElementById('adminGrantEmail').value.trim();
  const tokens = parseInt(document.getElementById('adminGrantTokens').value, 10);
  const note   = document.getElementById('adminGrantNote').value.trim() || '관리자 지급';
  const msgEl  = document.getElementById('adminGrantMsg');

  if (!email || !tokens || tokens <= 0) {
    msgEl.style.color = '#e05a4a';
    msgEl.textContent = '이메일과 토큰 수를 입력해주세요.';
    return;
  }

  msgEl.style.color = '#888';
  msgEl.textContent = '처리 중...';

  try {
    const res = await fetch(EP + 'admin/grant-tokens', {
      method: 'POST',
      headers: adminAuthHeaders(),
      body: JSON.stringify({ email, tokens, note }),
    });
    if (!res.ok) throw new Error('fail');
    msgEl.style.color = '#7de8a8';
    msgEl.textContent = `✓ ${email} 님께 ${tokens}토큰 지급 완료!`;
    document.getElementById('adminGrantEmail').value  = '';
    document.getElementById('adminGrantTokens').value = '';
    document.getElementById('adminGrantNote').value   = '';
  } catch(e) {
    msgEl.style.color = '#e05a4a';
    msgEl.textContent = '지급 실패. 다시 시도해주세요.';
  }
}

async function renderAdminPanel() {
  const listEl = document.getElementById('adminPaymentList');
  listEl.innerHTML = '<div class="admin-empty">불러오는 중...</div>';
  try {
    const res = await fetch(EP + 'admin/payments', {
      headers: adminAuthHeaders(),
    });
    if (!res.ok) throw new Error('auth');
    const data = await res.json();
    _adminPayments = data.results || data || [];
    _renderAdminList();
    _refreshAdminBadge();
  } catch(e) {
    listEl.innerHTML = '<div class="admin-empty">불러오기 실패. Worker 설정을 확인하세요.</div>';
  }
}

function _renderAdminList() {
  const listEl = document.getElementById('adminPaymentList');
  let filtered = _adminPayments;
  if (_adminTab === 'pending')  filtered = filtered.filter(p => p.status === 'pending');
  if (_adminTab === 'approved') filtered = filtered.filter(p => p.status === 'approved');

  if (!filtered.length) {
    listEl.innerHTML = '<div class="admin-empty">' +
      (_adminTab === 'pending' ? '대기 중인 결제가 없습니다 ✓' : '내역이 없습니다') + '</div>';
    return;
  }

  const PKG_NAME = { small:'소 (30토큰)', medium:'중 (100토큰)', large:'대 (300토큰)' };

  // innerHTML에 직접 사용자 데이터 삽입 방지 — DOM 빌더 방식으로 교체
  listEl.innerHTML = '';
  filtered.forEach(p => {
    const d = new Date(p.created_at * 1000);
    const timeStr = d.toLocaleDateString('ko-KR') + ' ' + d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
    const approved = p.status === 'approved';
    const card = document.createElement('div'); card.className = 'admin-card';
    const info = document.createElement('div'); info.className = 'admin-card-info';
    const emailEl = document.createElement('div'); emailEl.className = 'admin-card-email';
    emailEl.textContent = p.user_email;
    const detail = document.createElement('div'); detail.className = 'admin-card-detail';
    detail.textContent = (PKG_NAME[p.pkg] || p.pkg) + ' · ' + (p.amount || 0).toLocaleString() + '원';
    const timeEl = document.createElement('div'); timeEl.className = 'admin-card-time';
    timeEl.textContent = timeStr;
    info.append(emailEl, detail, timeEl);
    card.appendChild(info);
    if (approved) {
      const tag = document.createElement('span'); tag.className = 'admin-approved-tag';
      tag.textContent = '✓ 완료'; card.appendChild(tag);
    } else {
      const btn = document.createElement('button'); btn.className = 'admin-approve-btn';
      btn.textContent = '승인';
      btn.onclick = () => approvePayment(p.id, btn);
      card.appendChild(btn);
    }
    listEl.appendChild(card);
  });
}

async function approvePayment(id, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }
  try {
    const res = await fetch(EP + 'admin/approve', {
      method: 'POST',
      headers: adminAuthHeaders(),
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error('fail');
    // 로컬 상태 업데이트
    const p = _adminPayments.find(x => x.id === id);
    if (p) p.status = 'approved';
    _renderAdminList();
    _refreshAdminBadge();
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = '승인'; }
    alert('승인 실패. 다시 시도해 주세요.');
  }
}

function _refreshAdminBadge() {
  const pending = (_adminPayments || []).filter(p => p.status === 'pending').length;
  const dot = document.getElementById('adminHdDot');
  if (dot) dot.classList.toggle('on', pending > 0);
}

async function _checkAdminBadge() {
  const user = getUser();
  if (!user || user.email !== ADMIN_EMAIL) return;
  document.getElementById('adminHdBtn').style.display = 'flex';
  try {
    const res = await fetch(EP + 'admin/payments', {
      headers: adminAuthHeaders(),
    });

    if (!res.ok) return;
    const data = await res.json();
    _adminPayments = data.results || data || [];
    _refreshAdminBadge();
  } catch(e) {}
}


function goSignup() {
  document.getElementById('screen-mode').style.display   = 'none';
  document.getElementById('screen-signup').style.display = 'flex';
  document.getElementById('backBtn').style.display       = 'flex';
  renderSignup();
  // 구글 버튼 초기화 (스크립트 로드 대기)
  const tryInit = (attempts) => {
    if (typeof google !== 'undefined' && GOOGLE_CID) {
      initGoogleSignin();
    } else if (!GOOGLE_CID) {
      document.getElementById('googleBtnWrap').style.display = 'none';
      document.getElementById('orDivider').style.display     = 'none';
    } else if (attempts > 0) {
      setTimeout(() => tryInit(attempts - 1), 300);
    }
  };
  tryInit(10);
}

/* ── 구글 로그인 ── */
let _gisInited = false;
function _ensureGisInit() {
  if (_gisInited) return;
  const wasSignedOut = localStorage.getItem('myan_signed_out') === 'true';
  google.accounts.id.initialize({
    client_id: GOOGLE_CID,
    callback: handleGoogleCredential,
    auto_select: !wasSignedOut, // 명시적 로그아웃 후엔 자동 선택 차단
    cancel_on_tap_outside: true,
  });
  _gisInited = true;
}

function initGoogleSignin() {
  const wrap = document.getElementById('googleBtnEl');
  if (!wrap) return;
  wrap.innerHTML = ''; // 재렌더 시 초기화
  _ensureGisInit();
  const localeMap = { ko:'ko', en:'en', zh:'zh-CN', ja:'ja' };
  google.accounts.id.renderButton(wrap, {
    type: 'standard',
    theme: 'filled_black',
    size: 'large',
    text: 'signup_with',
    shape: 'rectangular',
    width: Math.min(Math.max(window.innerWidth - 64, 280), 480),
    locale: localeMap[lang] || 'ko',
  });
}

function handleGoogleCredential(response) {
  try {
    localStorage.removeItem('myan_signed_out'); // 명시적 로그인 → 자동로그인 차단 해제
    setGoogleIdToken(response.credential);  // ⭐ ID Token 저장
    // JWT 페이로드 디코딩 — UTF-8(한글 포함) 안전 처리
    const b64  = response.credential.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    const pad  = b64.length % 4 === 0 ? '' : '='.repeat(4 - b64.length % 4);
    const raw  = atob(b64 + pad);
    const utf8 = decodeURIComponent(
      raw.split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    const pl = JSON.parse(utf8);

    const name  = pl.name  || '';
    const email = pl.email || '';
    if (!name && !email) return;

    // 기존 프로필 유지하면서 이름/이메일 업데이트
    let existing = {};
    try { existing = JSON.parse(localStorage.getItem('myan_user') || '{}'); } catch {}

    const isReturning = existing.email && existing.email === email;

    const profile = {
      ...existing,
      name:       name  || existing.name  || '',
      email:      email || existing.email || '',
      phone:      existing.phone      || '',
      birthYear:  existing.birthYear  || '',
      birthMonth: existing.birthMonth || '',
      birthDay:   existing.birthDay   || '',
      birthHour:  existing.birthHour  || '',
      gender:     existing.gender     || '',
      region:     existing.region     || '',
      tokens:     existing.tokens !== undefined ? existing.tokens : 3,
    };
    localStorage.setItem('myan_user', JSON.stringify(profile));
    localStorage.setItem('myan_logged_in', 'true');

    // Sheets 저장 — 신규 가입 시만 저장 (재로그인·로그아웃 후 재로그인은 스킵)
    if (SHEETS_EP && !isReturning) {
      fetch(SHEETS_EP, {
        method: 'POST', mode: 'no-cors',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({...profile, timestamp: new Date().toISOString(), lang, source: 'google_signup'})
      });
    }

    // 유저 버튼 업데이트
    updateUserBtn(profile);
    refreshTokens();  // 서버 토큰 잔액 동기화

    // 관리자 배지 확인
    _checkAdminBadge();

    // 어느 화면에서 왔든 모든 auth 화면 닫고 앱으로 이동
    document.getElementById('screen-login').style.display     = 'none';
    document.getElementById('screen-signup').style.display    = 'none';
    document.getElementById('signupLinkBtn').style.display    = 'none';
    document.getElementById('backBtn').style.display          = 'none';
    document.getElementById('signup-form-wrap').style.display = '';
    document.getElementById('signup-success').style.display   = 'none';

    if (pendingMode) {
      const m = pendingMode; pendingMode = null;
      _enterMode(m, profile);
    } else {
      document.getElementById('screen-mode').style.display = 'flex';
    }

    // 토스 결제 후 리다이렉트 시 로그인이 늦은 경우 → pending 결제 확인
    const _pendingToss = sessionStorage.getItem('myan_pending_toss_payment');
    if (_pendingToss) {
      sessionStorage.removeItem('myan_pending_toss_payment');
      try {
        const _td = JSON.parse(_pendingToss);
        setTimeout(() => _confirmTossPayment(_td), 600);
      } catch {}
    }
  } catch(e) {
    console.error('Google 자격증명 파싱 오류:', e);
  }
}

function goBackFromSignup() {
  document.getElementById('screen-signup').style.display = 'none';
  document.getElementById('screen-mode').style.display   = 'flex';
  document.getElementById('backBtn').style.display       = 'none';
  document.getElementById('signup-form-wrap').style.display = '';
  document.getElementById('signup-success').style.display   = 'none';
}

function setGender(g) {
  selGender = g; // signup 폼에서 성별 선택은 제거됨 (My Page에서 입력)
}

function buildSignupDropdowns() {
  const mSel = document.getElementById('fMonth');
  const mSuf = {ko:'월', en:'', zh:'月', ja:'月'}[lang] || '';
  mSel.innerHTML = '<option value=""></option>';
  for (let i = 1; i <= 12; i++) {
    const o = document.createElement('option'); o.value = i; o.textContent = i + mSuf; mSel.appendChild(o);
  }
}

function renderSignup() {
  const s = TX[lang];
  buildSignupDropdowns();
  document.getElementById('signupHeadline').textContent  = s.sgHeadline;
  document.getElementById('signupSub').textContent       = s.sgSub;
  document.getElementById('signupLinkText').textContent  = s.sgLink;
  document.getElementById('lblName').textContent         = s.sgName;
  document.getElementById('fName').placeholder           = s.sgName;
  document.getElementById('lblEmail').textContent        = s.sgEmail;
  document.getElementById('lblYear').textContent         = s.sgYear;
  document.getElementById('lblMonth').textContent        = s.sgMonth;
  document.getElementById('lblDay').textContent          = s.sgDay;
  document.getElementById('lblUsername').textContent     = s.sgUsername;
  document.getElementById('fUsername').placeholder       = s.sgUsername;
  document.getElementById('lblPassword').textContent     = s.sgPassword;
  document.getElementById('fPassword').placeholder       = s.sgPassword;
  document.getElementById('lblConfirmPw').textContent    = s.sgConfirmPw;
  document.getElementById('fConfirmPw').placeholder      = s.sgConfirmPw;
  document.getElementById('submitBtn').textContent       = s.sgSubmit;
  document.getElementById('signupNotice').textContent    = s.sgNotice;
  document.getElementById('successTitle').textContent    = s.sgSuccTitle;
  document.getElementById('successDesc').textContent     = s.sgSuccDesc;
  document.getElementById('successBackBtn').textContent  = s.sgBack;
  document.getElementById('orDividerText').textContent   = s.sgOr;
}

let _sgErrTimer = null;
function showSignupError(msg) {
  const notice = document.getElementById('signupNotice');
  if (_sgErrTimer) clearTimeout(_sgErrTimer);
  notice.style.color = '#e07070';
  notice.textContent = '⚠ ' + msg;
  _sgErrTimer = setTimeout(() => {
    notice.style.color = '';
    notice.textContent = TX[lang].sgNotice;
    _sgErrTimer = null;
  }, 3500);
}

async function submitSignup() {
  const s    = TX[lang];
  const name = document.getElementById('fName').value.trim();
  const email = document.getElementById('fEmail').value.trim();
  const year  = document.getElementById('fYear').value.trim();
  const mon   = document.getElementById('fMonth').value;
  const day   = document.getElementById('fDay').value.trim();
  // 선택 정보는 마이페이지에서 입력
  const phone = ''; const hour = ''; const region = '';

  // 필수 항목 검사
  if (!name || !email || !year || !mon || !day) {
    const msg = {ko:'이름, 이메일, 생년월일을 입력해 주세요.', en:'Please fill in name, email, and date of birth.',
                 zh:'请填写姓名、邮箱和出生日期。', ja:'お名前、メールアドレス、生年月日を入力してください。'};
    showSignupError(msg[lang] || msg.ko); return;
  }
  // 이메일 형식 간단 검사
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const msg = {ko:'올바른 이메일 주소를 입력해 주세요.', en:'Please enter a valid email address.',
                 zh:'请输入有效的电子邮件地址。', ja:'正しいメールアドレスを入力してください。'};
    showSignupError(msg[lang] || msg.ko); return;
  }
  // 생년 범위 검사
  const yearNum = parseInt(year, 10);
  if (yearNum < 1900 || yearNum > new Date().getFullYear()) {
    const msg = {ko:'올바른 생년을 입력해 주세요.', en:'Please enter a valid birth year.',
                 zh:'请输入有效的出生年份。', ja:'正しい生年を入力してください。'};
    showSignupError(msg[lang] || msg.ko); return;
  }

  const btn = document.getElementById('submitBtn');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = {ko:'저장 중…', en:'Saving…', zh:'保存中…', ja:'保存中…'}[lang] || '…';

  const payload = {
    timestamp: new Date().toISOString(),
    name, email, phone, birthYear: year, birthMonth: mon, birthDay: day,
    birthHour: hour, gender: selGender, region, lang, source: 'signup'
  };

  try {
    if (SHEETS_EP) {
      await fetch(SHEETS_EP, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    localStorage.setItem('myan_user', JSON.stringify({
      name, email, phone,
      birthYear: year, birthMonth: mon, birthDay: day,
      birthHour: hour, gender: selGender, region,
      tokens: 3   // 신규 가입 무료 토큰
    }));
    localStorage.setItem('myan_logged_in', 'true');
    document.getElementById('signup-form-wrap').style.display = 'none';
    document.getElementById('signup-success').style.display   = 'flex';
  } catch(e) {
    showSignupError(s.sgErr);
    btn.disabled = false;
    btn.textContent = origText;
  }
}

/* ── 마이페이지 ── */
function updateUserBtn(user) {
  const btn = document.getElementById('userBtn');
  if (!btn) return; // 엘리먼트가 없으면 안전하게 리턴 (크래시 방지)
  if (!user) { btn.style.display = 'none'; return; }
  btn.textContent = TX[lang].mpLink || '마이페이지';
  btn.style.display = 'flex';
}

// ── Change 1: 무료 토큰 배너 표시 (비로그인 시에만) ──
function updateFreeBanner() {
  const banner = document.getElementById('freeBanner');
  if (!banner) return;
  const loggedIn = isLoggedIn();
  banner.style.display = loggedIn ? 'none' : 'flex';
}

function openMyPage() {
  // 비로그인 유저 진입 차단 — 로그인 완료 후 마이페이지로 돌아오도록 예약
  const u = getUser();
  if (!u || !isLoggedIn()) {
    pendingMode = '_token';
    showLogin();
    return;
  }

  document.getElementById('screen-mode').style.display   = 'none';
  document.getElementById('screen-chat').style.display   = 'none';
  document.getElementById('screen-signup').style.display = 'none';
  document.getElementById('screen-login').style.display  = 'none';
  document.getElementById('screen-mypage').style.display = 'flex';
  document.getElementById('backBtn').style.display       = 'flex';
  const _ub = document.getElementById('userBtn');
  if (_ub) _ub.style.display = 'none';
  renderMyPage();
}

function closeMyPage() {
  document.getElementById('screen-mypage').style.display = 'none';
  document.getElementById('screen-mode').style.display   = 'flex';
  document.getElementById('backBtn').style.display       = 'none';
  // 로그인 상태에 맞게 userBtn / signupLinkBtn 복원
  const u = getUser();
  const _userBtn = document.getElementById('userBtn');
  if (u && isLoggedIn()) {
    updateUserBtn(u);
    document.getElementById('signupLinkBtn').style.display = 'none';
  } else {
    if (_userBtn) _userBtn.style.display = 'none';
    document.getElementById('signupLinkBtn').style.display = u ? 'none' : '';
  }
}

function buildMypageDropdowns() {
  const t    = TX[lang];
  const mSel = document.getElementById('mpMonth');
  const hSel = document.getElementById('mpHour');
  const mSuf = {ko:'월', en:'', zh:'月', ja:'月'}[lang] || '';
  // mpMonth가 select일 때만 옵션 생성 (input type="number"로 교체된 경우 건너뜀)
  if (mSel && mSel.tagName === 'SELECT') {
    mSel.innerHTML = '<option value=""></option>';
    for (let i = 1; i <= 12; i++) {
      const o = document.createElement('option'); o.value = i; o.textContent = i + mSuf; mSel.appendChild(o);
    }
  }
  const hrs = [['子','23-01'],['丑','01-03'],['寅','03-05'],['卯','05-07'],
               ['辰','07-09'],['巳','09-11'],['午','11-13'],['未','13-15'],
               ['申','15-17'],['酉','17-19'],['戌','19-21'],['亥','21-23']];
  hSel.innerHTML = `<option value="">${t.sgUnknown}</option>`;
  hrs.forEach(([c, r]) => {
    const o = document.createElement('option'); o.value = c; o.textContent = `${c}時 (${r})`; hSel.appendChild(o);
  });
}

function renderMyPage() {
  const t    = TX[lang];
  const user = (() => { try { return JSON.parse(localStorage.getItem('myan_user')); } catch { return null; } })();
  if (!user) return;

  buildMypageDropdowns();

  // 프로필 표시
  document.getElementById('mypageAvatar').textContent   = (user.name || '?').charAt(0);
  document.getElementById('mypageNameDisp').textContent  = user.name  || '';
  document.getElementById('mypageEmailDisp').textContent = user.email || '';
  document.getElementById('mypageSectionLabel').textContent  = t.mpSection;
  document.getElementById('mypageDetailLabel').textContent   = t.mpDetailSection;
  document.getElementById('mypageDetailNotice').textContent  = t.mpDetailNotice;

  // 라벨
  document.getElementById('mpLblYear').textContent    = t.sgYear;
  document.getElementById('mpLblMonth').textContent   = t.sgMonth;
  document.getElementById('mpLblDay').textContent     = t.sgDay;
  document.getElementById('mpLblHour').innerHTML      = t.sgHour + ` <span style="opacity:.4;font-size:.6rem">${t.sgOpt}</span>`;
  document.getElementById('mpLblGender').innerHTML    = t.sgGender + ` <span style="opacity:.4;font-size:.6rem">${t.sgOpt}</span>`;
  document.getElementById('mpLblPhone').innerHTML     = t.sgPhone + ` <span style="opacity:.4;font-size:.6rem">${t.sgOpt}</span>`;
  document.getElementById('mpLblRegion').innerHTML    = t.sgRegion + ` <span style="opacity:.4;font-size:.6rem">${t.sgOpt}</span>`;
  document.getElementById('mpGbM').textContent        = t.sgM;
  document.getElementById('mpGbF').textContent        = t.sgF;
  document.getElementById('mypageSaveBtn').textContent    = t.mpSave;
  document.getElementById('mypageNotice').textContent     = '';
  document.getElementById('mypageLogoutBtn').textContent  = t.mpLogout;
  document.getElementById('mypageWithdrawBtn').textContent = t.mpWithdraw;
  // 알림 버튼 현재 상태 반영
  const notifBtn = document.getElementById('notifToggleBtn');
  if (notifBtn) {
    const notifOn = localStorage.getItem('myan_notif_enabled') === 'true';
    notifBtn.textContent = notifOn ? '알림 끄기 🔕' : '알림 켜기 🔔';
    notifBtn.classList.toggle('notif-on', notifOn);
  }

  // 저장된 값 채우기
  document.getElementById('mpYear').value  = user.birthYear  || '';
  document.getElementById('mpMonth').value = user.birthMonth || '';
  document.getElementById('mpDay').value   = user.birthDay   || '';
  document.getElementById('mpHour').value  = user.birthHour  || '';
  document.getElementById('mpPhone').value = user.phone      || '';
  document.getElementById('mpRegion').value = user.region    || '';
  document.getElementById('mpRegion').placeholder = t.sgRegion;

  // 성별 버튼
  selGenderMp = user.gender || '';
  document.getElementById('mpGbM').classList.toggle('active', selGenderMp === 'M');
  document.getElementById('mpGbF').classList.toggle('active', selGenderMp === 'F');

  // ── 토큰 섹션 ──
  document.getElementById('tkSectionLbl').textContent      = t.tkSection;
  document.getElementById('mypageTokenUnitLbl').textContent = t.tkUnit;
  document.getElementById('mypageTokenNum').textContent    = getTokens();

  // 오행 분포 게이지 — AI 정밀 분석 데이터 우선, 없으면 JS 계산 값 표시
  const _savedOhaeng = (() => {
    try { const s = localStorage.getItem('myan_ohaeng'); return s ? JSON.parse(s) : null; } catch { return null; }
  })();
  if (_savedOhaeng) _renderSajuGaugeFromGemini(_savedOhaeng);
  else _renderSajuGauge(user);
}

function setGenderMp(g) {
  selGenderMp = g;
  document.getElementById('mpGbM').classList.toggle('active', g === 'M');
  document.getElementById('mpGbF').classList.toggle('active', g === 'F');
}

async function saveMyPage() {
  const user = (() => { try { return JSON.parse(localStorage.getItem('myan_user')); } catch { return null; } })();
  if (!user) return;

  const year   = document.getElementById('mpYear').value.trim();
  const mon    = document.getElementById('mpMonth').value;
  const day    = document.getElementById('mpDay').value.trim();
  const hour   = document.getElementById('mpHour').value;
  const phone  = document.getElementById('mpPhone').value.trim();
  const region = document.getElementById('mpRegion').value.trim();

  // 생년 범위 검사
  if (year) {
    const y = parseInt(year, 10);
    if (y < 1900 || y > new Date().getFullYear()) {
      const notice = document.getElementById('mypageNotice');
      notice.style.color = '#e07070';
      notice.textContent = {ko:'올바른 생년을 입력해 주세요.', en:'Enter a valid birth year.',
                            zh:'请输入有效出生年份。', ja:'正しい生年を入力してください。'}[lang] || '';
      setTimeout(() => { notice.style.color = ''; notice.textContent = ''; }, 3000);
      return;
    }
  }

  const updated = {
    ...user,
    phone, birthYear: year, birthMonth: mon, birthDay: day,
    birthHour: hour, gender: selGenderMp, region,
  };
  localStorage.setItem('myan_user', JSON.stringify(updated));

  if (SHEETS_EP) {
    fetch(SHEETS_EP, {
      method: 'POST', mode: 'no-cors',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({...updated, timestamp: new Date().toISOString(), lang, source: 'mypage_update'})
    });
  }

  const btn = document.getElementById('mypageSaveBtn');
  btn.textContent = TX[lang].mpSaved;
  btn.style.background = 'rgba(75,200,122,0.25)';
  setTimeout(() => {
    btn.textContent = TX[lang].mpSave;
    btn.style.background = '';
  }, 2200);
}

function _signOut() {
  // 로그아웃: 세션 키 + 채팅 캐시 제거 — myan_user(프로필/생년월일)는 유지
  // 다음 로그인 시 기존 프로필을 그대로 복원하기 위함
  localStorage.removeItem('myan_logged_in');
  localStorage.removeItem('myan_id_token');
  // 채팅 캐시 제거 → 재로그인 시 이전 대화가 다시 뜨는 현상 방지
  localStorage.removeItem('myan_chat_html');
  localStorage.removeItem('myan_chat_hist');
  localStorage.removeItem('myan_chat_mode');
  localStorage.setItem('myan_signed_out', 'true'); // Google One-Tap 자동 재로그인 차단
  _googleIdToken = ''; _googleIdTokenExp = 0;
  _tokenCache = 0;
  updateAllTokenDisplays();
  try { google.accounts.id.disableAutoSelect(); } catch(e) {}
  try { google.accounts.id.cancel(); } catch(e) {}
  // GIS 초기화 상태 리셋 — 다음 로그인 시 auto_select:false로 재초기화
  _gisInited = false;
  selGender = ''; selGenderMp = '';
  document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
  const _userBtnSO = document.getElementById('userBtn');
  if (_userBtnSO) _userBtnSO.style.display = 'none';
  document.getElementById('signupLinkBtn').style.display = ''; // 로그아웃 후 가입/로그인 링크 표시
  // 사이런트 리프레시 타이머 즉시 취소
  if (_silentRefreshTimer) { clearTimeout(_silentRefreshTimer); _silentRefreshTimer = null; }
  // 어떤 화면에서 로그아웃해도 홈(모드 선택)으로 복귀 — closeMyPage()는 screen-chat을 숨기지 않음
  ['screen-chat', 'screen-mypage', 'screen-signup', 'screen-login'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('screen-mode').style.display = 'flex';
  document.getElementById('backBtn').style.display = 'none';
  mode = null; hist = [];
  history.replaceState({ screen: 'home' }, '');
}

async function _withdrawAccount() {
  // ① 세션 토큰 확인 — 만료됐으면 서버 삭제 불가하므로 중단
  const token = getGoogleIdToken();
  if (!token) {
    const t = TX[lang] || TX.ko;
    alert(t.wdSessionExpired || '세션이 만료됐습니다. 다시 로그인 후 탈퇴해 주세요.');
    return;
  }

  // ② 서버 DB 완전 삭제 — 실패 시 localStorage도 건드리지 않고 중단
  try {
    const res = await fetch(EP + 'withdraw', {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      let msg = '탈퇴 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
      try { const d = await res.json(); msg = d.error?.message || msg; } catch {}
      alert(msg);
      return;
    }
  } catch(e) {
    alert('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    return;
  }

  // ③ 서버 삭제 성공 후에만 로컬 데이터 전체 정리
  [
    'myan_logged_in', 'myan_user', 'myan_id_token',
    'myan_ohaeng', 'myan_chat_html', 'myan_chat_hist', 'myan_chat_mode',
    'myan_cal', 'myan_adm_key', 'myan_notif_enabled',
    'myan_pending_pay_id', 'myan_signed_out',
  ].forEach(k => localStorage.removeItem(k));

  localStorage.setItem('myan_signed_out', 'true'); // 구글 원탭 자동 로그인 방지
  _googleIdToken = ''; _googleIdTokenExp = 0;
  _tokenCache = 0;
  updateAllTokenDisplays();
  try { google.accounts.id.disableAutoSelect(); } catch(e) {}
  try { google.accounts.id.cancel(); } catch(e) {}
  _gisInited = false;
  selGender = ''; selGenderMp = '';
  document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
  const _userBtnWD = document.getElementById('userBtn');
  if (_userBtnWD) _userBtnWD.style.display = 'none';
  document.getElementById('signupLinkBtn').style.display = '';
  if (_silentRefreshTimer) { clearTimeout(_silentRefreshTimer); _silentRefreshTimer = null; }
  ['screen-chat', 'screen-mypage', 'screen-signup', 'screen-login'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('screen-mode').style.display = 'flex';
  document.getElementById('backBtn').style.display = 'none';
  mode = null; hist = [];
  history.replaceState({ screen: 'home' }, '');
}

function _confirmAction(btnId, confirmText, action) {
  const btn = document.getElementById(btnId);
  if (btn.dataset.confirm === '1') { action(); return; }
  btn.dataset.confirm = '1';
  const orig = btn.textContent;
  const origColor = btn.style.color;
  btn.textContent = confirmText;
  btn.style.color = '#e07070';
  btn.style.borderColor = 'rgba(224,112,112,0.4)';
  setTimeout(() => {
    if (btn.dataset.confirm === '1') {
      btn.dataset.confirm = '';
      btn.textContent = orig;
      btn.style.color = origColor;
      btn.style.borderColor = '';
    }
  }, 3000);
}

function openTokenModal() {
  document.getElementById('token-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  updateAllTokenDisplays(); // 잔액 최신화
  if (typeof _renderTokenModal === 'function') _renderTokenModal(); // 다국어 라벨 갱신
}

function closeTokenModal() {
  document.getElementById('token-modal').style.display = 'none';
}

function openSupport() {
  // 카카오 채널 1:1 채팅으로 바로 연결
  window.open('https://pf.kakao.com/_xigAbX/chat', '_blank', 'noopener,noreferrer');
}

function logout() {
  _confirmAction('mypageLogoutBtn', TX[lang].mpLogoutQ, _signOut);
}

// 드로어 메뉴에서 로그아웃 — 별도 확인 후 직접 실행 (_confirmAction은 마이페이지 전용)
function drawerLogout() {
  closeDrawer();
  const q = (TX[lang] || TX.ko).mpLogoutQ || '로그아웃 할까요?';
  if (!window.confirm(q)) return;
  _signOut();
}

/* ── 법적 모달 ── */
const LEGAL_CONTENT = {
  privacy: {
    ko: {
      title: '개인정보처리방침',
      body: `
<h3>제1조 (개인정보의 처리 목적)</h3>
<p><b>M;Y 安 (마이안)</b>(이하 "회사")은 이용자의 사주 기운 리딩 서비스 제공, 맞춤형 처방 솔루션 매칭, 회원 식별 및 서비스 개선, 유료 콘텐츠(토큰) 정산 및 결제 관리 목적으로 최소한의 개인정보를 처리합니다.</p>

<h3>제2조 (처리하는 개인정보 항목)</h3>
<p>• 필수항목: 이름(성함), 생년월일, 성별, 이메일 주소 (구글 OAuth 2.0 연동 식별 데이터 포함)</p>
<p>• 선택항목: 태어난 시간(생시), 거주지역, 전화번호, 결제 및 거래 이력</p>

<h3>제3조 (개인정보의 보유 및 이용 기간)</h3>
<p>이용자의 개인정보는 원칙적으로 <b>회원 탈퇴 시 즉시 파기</b>됩니다. 단, 전자상거래 등에서의 소비자보호에 관한 법률 등 관계 법령의 규정에 의하여 보존할 필요가 있는 경우, 회사는 아래와 같이 일정 기간 회원 정보를 보관합니다.</p>
<p>• 계약 또는 청약철회 등에 관한 기록: 5년 (전자상거래법)</p>
<p>• 대금결제 및 재화 등의 공급에 관한 기록: 5년 (전자상거래법)</p>
<p>• 소비자의 불만 또는 분쟁처리에 관한 기록: 3년 (전자상거래법)</p>

<h3>제4조 (개인정보의 제3자 제공 및 위탁)</h3>
<p>회사는 이용자의 개인정보를 명시한 목적 범위 내에서만 처리하며, 이용자의 사전 동의 없이는 원칙적으로 외부에 제공하지 않습니다. 다만, 법령에 따른 구체적 요청이 있는 경우 등 예외적인 법적 의무가 발생할 때에 한하여 제공될 수 있습니다.</p>

<h3>제5조 (개인정보 국외 이전 및 클라우드 인프라 위탁)</h3>
<p>회사는 안정적인 전산 인프라 및 보안 시스템 운영을 위해 아래와 같이 글로벌 전문 클라우드 법인에 데이터 관리를 위탁하며, 이는 개인정보보호법에 따른 안전 조치를 준수합니다.</p>
<table style="width:100%; border-collapse:collapse; margin-top:12px; font-size:0.85rem;">
<tr style="border-bottom:1px solid rgba(201,169,110,0.2); text-align:left;"><th style="padding:8px; color:var(--gold);">이전받는 자</th><td style="padding:8px;">Google LLC (미국) 및 Cloudflare, Inc. (미국)</td></tr>
<tr style="border-bottom:1px solid rgba(201,169,110,0.2); text-align:left;"><th style="padding:8px; color:var(--gold);">이전 목적</th><td style="padding:8px;">OAuth 2.0 보안 인증 및 전산 데이터베이스(D1) 클라우드 시스템 운영·백업</td></tr>
<tr style="border-bottom:1px solid rgba(201,169,110,0.2); text-align:left;"><th style="padding:8px; color:var(--gold);">이전 항목</th><td style="padding:8px;">이름, 이메일 주소, 생년월일시 등 서비스 가입·이용 정보</td></tr>
<tr style="border-bottom:1px solid rgba(201,169,110,0.2); text-align:left;"><th style="padding:8px; color:var(--gold);">보유 기간</th><td style="padding:8px;">회원 탈퇴 시 또는 서비스 종료 시까지</td></tr>
</table>

<h3>제6조 (이용자의 권리와 그 행사방법)</h3>
<p>이용자는 언제든지 마이페이지 내 전산 시스템을 통해 본인의 개인정보를 열람, 정정할 수 있으며 회원 탈퇴(동의 철회)를 통해 즉시 삭제를 요청할 수 있습니다.</p>

<h3>제7조 (개인정보 보호책임자 및 사업자 정보)</h3>
<p>회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 이용자의 불만처리 및 피해구제 등을 위하여 아래와 같이 개인정보 보호책임자 및 사업자 신원을 지정하고 있습니다.</p>
<div style="background:rgba(255,255,255,0.02); padding:16px; border-radius:12px; border:1px solid rgba(201,169,110,0.15); line-height:2; margin-top:12px;">
  • 상호(서비스명): M;Y 安 (마이안)<br>
  • 대표자 성명: <b>안태현</b><br>
  • 사업자등록번호: <b>501-33-63980</b><br>
  • 주소: <b>부산광역시 수영구 망미동 현대한누리타운 101-1101</b><br>
  • 개인정보 보호책임자: <b>안태현</b><br>
  • 연락처/이메일: riger7070@naver.com
</div>

<h3>제8조 (개인정보처리방침 변경)</h3>
<p>본 개인정보처리방침은 시행일로부터 적용되며, 법령 및 방침에 따른 변경 내용의 추가, 삭제 및 정정이 있는 경우에는 변경사항의 시행 7일 전부터 웹 화면을 통해 고지할 것입니다.</p>
<p style="margin-top:12px; color:var(--text-dim);">• 공고일자: 2026년 5월 21일 / 시행일자: 2026년 5월 21일</p>
`
    }
  },
  refund: {
    ko: {
      title: '환불정책',
      body: `
<h3>제1조 (환불의 기본 원칙)</h3>
<p>사용자는 구매한 충전형 토큰 중 <b>미사용 잔여 분</b>에 대하여 전자상거래 등에서의 소비자보호에 관한 법률 제17조에 의거하여 청약철회 및 환불을 요청할 수 있습니다.</p>

<h3>제2조 (청약철회 및 환불 조건)</h3>
<p>• 사용자는 유료 결제일로부터 <b>7일 이내</b>에 미사용된 토큰 전체 또는 일부에 대해 환불 신청이 가능합니다.</p>
<p>• 환불 금액은 사용자가 실제 결제한 금액을 기준으로 하며, 패키지 할인 상품의 경우 기 사용된 토큰의 단가를 정상가 기준으로 역산하여 제외한 후 잔액을 정산합니다.</p>

<h3>제3조 (청약철회 및 환불의 제한)</h3>
<p>다음 각 호에 해당하는 경우 환불이 제한될 수 있습니다.</p>
<p>• 유료 결제 후 7일을 초과하여 청약철회 기간이 경과한 경우</p>
<p>• 결제를 통해 지급된 토큰을 이미 대화 및 기운 리딩 서비스에 소비하여 사용이 완료된 경우 (디지털 콘텐츠의 개시)</p>
<p>• 이벤트, 프로모션, 회원가입 보너스 등 서비스 내에서 무상으로 지급된 토큰(무료 대화권)</p>

<h3>제4조 (자동 환불 및 정산 예외 보장 시스템)</h3>
<p>AI 통신 서버의 일시적 장애, 구글 API 네트워크 단절, 혹은 시스템 세이프티 필터 작동으로 인하여 사용자의 질문에 대하여 <b>AI의 리딩 답변 문장이 정상적으로 도출되지 않고 공백으로 종료된 경우</b>, 선차감되었던 토큰 1개는 데이터베이스 전산 트랜잭션에 의해 사용되지 않은 것으로 판정되어 <b>실시간으로 즉시 복구(자동 환불)</b> 처리되며 과금되지 않습니다.</p>

<h3>제5조 (환불 신청 절차)</h3>
<p>환불을 원하시는 사용자는 1:1 고객센터 이메일(riger7070@naver.com)을 통해 결제 일시, 결제 ID, 가입 이메일 주소를 기재하여 신청해 주셔야 합니다. 전산망 대조 확인 후 영업일 기준 3~5일 이내에 지정하신 계좌로 대금이 반환됩니다.</p>
`
    }
  },
  terms: {
    ko: {
      title: '이용약관',
      body: `
<h3>제1조 (목적)</h3>
<p>본 약관은 <b>M;Y 安 (마이안)</b>(이하 "회사")이 운영하는 AI 오행 기운 리딩 플랫폼 웹사이트 및 프로그레시브 웹앱(PWA) 서비스(이하 "서비스")의 이용 조건, 절차 및 회사와 회원 간의 권리, 의무, 책임 사항을 규정함을 목적으로 합니다.</p>

<h3>제2조 (서비스의 명리 이론적 면책 선언)</h3>
<p>• 본 서비스는 전통 명리학(四柱命理學) 이론 및 오행 데이터베이스를 현대적 소프트웨어로 알고리즘화하여 구현한 <b>문화·힐링 체험 콘텐츠</b>입니다.</p>
<p>• 대화형 AI(Gemini API)를 통해 도출되는 기운 분석, 조화(궁합) 풀이, 음료 처방 매칭 등의 모든 결과물은 절대적인 미래 예측이나 결정론적 운명을 의미하지 않으며, 사용자의 일상 속 마음가짐을 위한 <b>단순 참고용 데이터</b>입니다.</p>
<p>• 본 서비스의 결과물은 전문적인 의료적 진단, 법률적 자문, 금융 및 투자 조언을 절대 대체할 수 없으며, 이를 근거로 사용자가 행한 모든 주관적 결정 및 행동에 대한 책임은 이용자 본인에게 있습니다.</p>

<h3>제3조 (회원 가입 및 계정 관리)</h3>
<p>• 사용자는 회사가 정한 양식에 따라 사주 정보(이름, 생년월일시, 성별)를 입력하거나 구글 간편 인증을 통해 회원이 될 수 있습니다.</p>
<p>• 이용자는 본인의 고유 이메일 및 로그인 세션을 안전하게 관리해야 하며, 타인의 명의나 개인정보를 도용하여 전산망을 무단 교란하는 행위를 엄격히 금지합니다.</p>

<h3>제4조 (유료 서비스 및 토큰 이용 규정)</h3>
<p>• 본 서비스는 가상 재화인 '토큰(Token)' 차감제로 운영됩니다. 질문 1회당 정상 답변이 완결될 때 1토큰이 차감됩니다.</p>
<p>• 유료 토큰의 가격, 지급 수량 및 정산 방식은 회사가 홈페이지 결제 창에 고지한 내용을 따르며, 회사는 투명한 거래를 위해 모든 결제 요청의 로그를 관계형 데이터베이스(D1)에 영구 기록합니다.</p>

<h3>제5조 (서비스의 중단 및 제한)</h3>
<p>회사는 시스템 점검, 서버 증설, AI 공급처(Google)의 기술적 장애 등 불가항력적인 사유가 발생한 경우 서비스의 전부 또는 일부를 일시적으로 제한하거나 중단할 수 있습니다. 다만, 이 과정에서 전산 오류로 소실된 유료 토큰은 회사의 관리자 기능을 통해 즉시 재지급 보상 처리됩니다.</p>

<h3>제6조 (관할 법원)</h3>
<p>본 약관의 해석 및 회사와 회원 간에 발생한 분쟁에 대한 소송은 회사의 본점 소재지를 관할하는 법원을 전속 관할 법원으로 합니다.</p>

<p style="margin-top:24px; font-size:0.75rem; color:var(--text-dim);">• 시행일자: 2026년 5월 21일</p>
`
    }
  }
};

function openLegal(type) {
  const data = LEGAL_CONTENT[type]?.ko;
  if (!data) return;
  document.getElementById('legalModalTitle').textContent = data.title;
  document.getElementById('legalModalBody').innerHTML = data.body;
  document.getElementById('legal-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeLegal() {
  document.getElementById('legal-modal').style.display = 'none';
  document.body.style.overflow = '';
}

function withdraw() {
  _confirmAction('mypageWithdrawBtn', TX[lang].mpWithdrawQ, _withdrawAccount);
}

/* ── 로그인 시스템 ── */
async function hashPassword(password, salt) {
  const enc  = new TextEncoder();
  const data = enc.encode(salt + password);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isLoggedIn() {
  return localStorage.getItem('myan_logged_in') === 'true';
}

function getUser() {
  try { return JSON.parse(localStorage.getItem('myan_user')); } catch { return null; }
}

function togglePwVis(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (inp.type === 'password') { inp.type = 'text';     btn.textContent = '🙈'; }
  else                         { inp.type = 'password'; btn.textContent = '👁'; }
}

function renderLogin() {
  const t = TX[lang];
  document.getElementById('loginTitle').textContent      = t.loginTitle;
  document.getElementById('lblLoginId').textContent      = t.loginId;
  document.getElementById('lblLoginPw').textContent      = t.loginPw;
  document.getElementById('loginSubmitBtn').textContent  = t.loginBtn;
  document.getElementById('loginErr').textContent        = '';
  document.getElementById('loginOrText').textContent     = t.sgOr;
}

function showLogin() {
  document.getElementById('screen-mode').style.display   = 'none';
  document.getElementById('screen-signup').style.display = 'none';
  document.getElementById('screen-login').style.display  = 'flex';
  document.getElementById('backBtn').style.display       = 'flex';
  renderLogin();
  // Google 버튼 초기화 (로그인용)
  const tryInit = (attempts) => {
    if (typeof google !== 'undefined' && GOOGLE_CID) {
      initGoogleLoginBtn();
    } else if (!GOOGLE_CID) {
      document.getElementById('loginGoogleBtnWrap').style.display = 'none';
      document.getElementById('loginOrDivider').style.display     = 'none';
    } else if (attempts > 0) {
      setTimeout(() => tryInit(attempts - 1), 300);
    }
  };
  tryInit(10);
}

function initGoogleLoginBtn() {
  const wrap = document.getElementById('loginGoogleBtnEl');
  if (!wrap) return;
  wrap.innerHTML = '';
  _ensureGisInit();
  const localeMap = { ko:'ko', en:'en', zh:'zh-CN', ja:'ja' };
  google.accounts.id.renderButton(wrap, {
    type: 'standard', theme: 'filled_black', size: 'large',
    text: 'signin_with', shape: 'rectangular',
    width: Math.min(Math.max(window.innerWidth - 64, 280), 480),
    locale: localeMap[lang] || 'ko',
  });
}

function goBackFromLogin() {
  pendingMode = null;
  document.getElementById('screen-login').style.display = 'none';
  document.getElementById('screen-mode').style.display  = 'flex';
  document.getElementById('backBtn').style.display      = 'none';
}

async function doLogin() {
  const id    = (document.getElementById('loginIdInp').value || '').trim();
  const pw    = (document.getElementById('loginPwInp').value || '');
  const errEl = document.getElementById('loginErr');
  errEl.textContent = '';

  const user = getUser();
  if (!user || !user.passwordHash || !user.salt) {
    errEl.textContent = TX[lang].loginFail;
    return;
  }
  if (user.username !== id) {
    errEl.textContent = TX[lang].loginFail;
    return;
  }

  const hash = await hashPassword(pw, user.salt);
  if (hash !== user.passwordHash) {
    errEl.textContent = TX[lang].loginFail;
    return;
  }

  // 로그인 성공
  localStorage.setItem('myan_logged_in', 'true');
  document.getElementById('screen-login').style.display = 'none';
  document.getElementById('backBtn').style.display      = 'none';
  updateUserBtn(user);
  document.getElementById('signupLinkBtn').style.display = 'none';
  _checkAdminBadge();

  // 로그인 전 클릭했던 모드가 있으면 바로 진입
  if (pendingMode) {
    const m = pendingMode; pendingMode = null;
    _enterMode(m, user);
  } else {
    document.getElementById('screen-mode').style.display = 'flex';
  }
}

/* ── 인증 게이트 ── 항상 모드 화면 먼저 */
function checkAuth() {
  document.getElementById('screen-mode').style.display   = 'flex';
  document.getElementById('screen-signup').style.display = 'none';
  document.getElementById('screen-login').style.display  = 'none';
  document.getElementById('screen-mypage').style.display = 'none';
  document.getElementById('backBtn').style.display       = 'none';

  const user = getUser();
  const loggedIn = isLoggedIn();

  const _userBtnCA = document.getElementById('userBtn');
  if (user && loggedIn) {
    document.getElementById('signupLinkBtn').style.display = 'none';
    updateUserBtn(user);
  }
  else if (user && !loggedIn) {
    document.getElementById('signupLinkBtn').style.display = 'none';
    if (_userBtnCA) _userBtnCA.style.display = 'none';
  }
  else {
    document.getElementById('signupLinkBtn').style.display = '';
    if (_userBtnCA) _userBtnCA.style.display = 'none';
  }

  if (user && loggedIn) _checkAdminBadge();
}

function goToApp() {
  localStorage.setItem('myan_logged_in', 'true');
  document.getElementById('screen-signup').style.display   = 'none';
  document.getElementById('signup-form-wrap').style.display = '';
  document.getElementById('signup-success').style.display  = 'none';
  document.getElementById('backBtn').style.display         = 'none';
  selGender = '';
  document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));

  const u = getUser();
  updateUserBtn(u);
  document.getElementById('signupLinkBtn').style.display = u ? 'none' : '';
  _checkAdminBadge();

  if (pendingMode) {
    const m = pendingMode; pendingMode = null;
    _enterMode(m, u);
  } else {
    document.getElementById('screen-mode').style.display = 'flex';
  }
}

render();
schedMidnightRefresh();
checkAuth();
refreshTokens();

// ── PWA 뒤로가기 처리 — 앱이 꺼지는 대신 이전 화면으로 이동 ──
(function initAppHistory() {
  history.replaceState({ screen: 'home' }, '');

  // 각 화면 진입 함수에 직접 pushState 연결 (startMode는 제외 — 내부에서 goSignup/showLogin으로 분기됨)
  const _origGoSignup = goSignup;
  goSignup = function() {
    history.pushState({ screen: 'signup' }, '');
    _origGoSignup();
  };

  const _origShowLogin = showLogin;
  showLogin = function() {
    history.pushState({ screen: 'login' }, '');
    _origShowLogin();
  };

  const _origOpenMyPage = openMyPage;
  openMyPage = function() {
    history.pushState({ screen: 'mypage' }, '');
    _origOpenMyPage();
  };

  // _enterMode (채팅 화면 진입) 에서만 chat pushState
  const _origEnterMode = _enterMode;
  _enterMode = function(m, user) {
    if (m !== '_token') history.pushState({ screen: 'chat', mode: m }, '');
    _origEnterMode(m, user);
  };

  // 브라우저/OS 뒤로가기 버튼 가로채기
  window.addEventListener('popstate', () => {
    // 모달 우선 닫기
    if (document.getElementById('admin-panel')?.style.display !== 'none') {
      closeAdminPanel(); history.pushState({ screen: 'mypage' }, ''); return;
    }
    if (document.getElementById('guide-modal')?.style.display !== 'none') {
      closeGuideModal(); return;
    }
    // 화면별 뒤로가기
    if (document.getElementById('screen-mypage').style.display === 'flex') {
      closeMyPage(); return;
    }
    if (document.getElementById('screen-chat').style.display === 'flex') {
      goBack(); return;
    }
    if (document.getElementById('screen-signup').style.display === 'flex') {
      goBackFromSignup(); return;
    }
    if (document.getElementById('screen-login').style.display === 'flex') {
      goBackFromLogin(); return;
    }
    // 홈에서 뒤로가기 → OS 기본 동작 (앱 종료) 허용
  });
})();

// 페이지 로드 시 미완료 결제 자동 복구 (창 닫아도 승인 시 지급)
(async function resumePendingPayment() {
  const pendingId = localStorage.getItem('myan_pending_pay_id');
  if (!pendingId || !EP) return;
  try {
    const res  = await fetch(`${EP}payment-status?id=${pendingId}`);
    const data = await res.json();
    if (data.status === 'approved') {
      await refreshTokens();  // 서버에서 새 잔액 가져오기
      localStorage.removeItem('myan_pending_pay_id');
      
      // UX 개선: 복구 성공 시 사용자에게 알림 띄우기
      setTimeout(() => {
        alert(TX[lang]?.tkRedeemOk ? TX[lang].tkRedeemOk(data.tokens || 0) : '결제하신 토큰이 정상 지급되었습니다.');
      }, 1000);
    }
  } catch {}
})();

// ══════════════════════════════════════
// ── 사이드 드로어 메뉴 ──
// ══════════════════════════════════════
function openDrawer() {
  _syncDrawerState();
  document.getElementById('menu-overlay').classList.add('open');
  document.getElementById('side-drawer').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  document.getElementById('menu-overlay').classList.remove('open');
  document.getElementById('side-drawer').classList.remove('open');
  document.body.style.overflow = '';
}

// 드로어 열릴 때 현재 상태 동기화
function _syncDrawerState() {
  const user = getUser();
  const loggedIn = isLoggedIn();

  // 프로필
  if (user && loggedIn) {
    document.getElementById('drawerProfile').style.display = 'flex';
    document.getElementById('drawerLoginPrompt').style.display = 'none';
    document.getElementById('drawerAvatar').textContent = (user.name || '?').charAt(0);
    document.getElementById('drawerName').textContent   = user.name  || '—';
    document.getElementById('drawerEmail').textContent  = user.email || '—';
    document.getElementById('drawerTokens').textContent = _tokenCache;
    document.getElementById('drawerMypageBtn').style.display = 'flex';
    document.getElementById('drawerCalBtn').style.display    = 'flex';
    document.getElementById('drawerAccountSection').style.display = 'block';
  } else {
    document.getElementById('drawerProfile').style.display = 'none';
    document.getElementById('drawerLoginPrompt').style.display = 'block';
    document.getElementById('drawerMypageBtn').style.display = 'none';
    document.getElementById('drawerCalBtn').style.display    = 'none';
    document.getElementById('drawerAccountSection').style.display = 'none';
  }

  _syncDrawerLangs();
  _syncDrawerTheme();
}

function _syncDrawerLangs() {
  const t = TX[lang] || TX.ko;

  // ── 언어 버튼 활성화 동기화 (드로어 + 메인화면) ──
  ['ko','en','zh','ja'].forEach(l => {
    document.getElementById('dlb-' + l)?.classList.toggle('on', lang === l);
    document.getElementById('mlb-' + l)?.classList.toggle('on', lang === l);
  });

  // ── 드로어 텍스트 다국어 업데이트 ──
  const _t = (id, txt) => { const el = document.getElementById(id); if (el && txt) el.textContent = txt; };
  _t('drLblNav',     t.drNav);
  _t('drLblLang',    t.drLangLabel);
  _t('drLblTheme',   t.drThemeLabel);
  _t('drLblAccount', t.drAccountLabel);
  _t('drTxtHome',    t.drHome);      _t('drSubHome',   t.drHomeSub);
  _t('drTxtSolo',    t.drSoloTitle); _t('drSubSolo',   t.drSoloSub);
  _t('drTxtCouple',  t.drCoupleTitle); _t('drSubCouple', t.drCoupleSub);
  _t('drTxtMypage',  t.drMypageTitle); _t('drSubMypage', t.drMypageSub);
  _t('drTxtCal',     t.drCalTitle);  _t('drSubCal',    t.drCalSub);
  _t('drTxtTheme',   t.drThemeTitle);
  _t('drTxtSupport', t.drSupportTitle);
  _t('drTxtLogout',  t.drLogoutTitle);

  // ── firstInputForm 라벨 다국어 ──
  _t('fifLblName',   t.fifLblName);
  _t('fifLblYear',   t.fifLblYear);
  _t('fifLblMonth',  t.fifLblMonth);
  _t('fifLblDay',    t.fifLblDay);
  _t('fifLblTime',   t.fifLblTime);   // span은 별도 처리
  const fifTimeOptEl = document.getElementById('fifTimeOpt');
  if (fifTimeOptEl) fifTimeOptEl.textContent = t.fifTimeOpt || '(선택)';
  _t('fifOptNote',   t.fifOptNote);
  _t('fifSubmitBtn', t.fifSubmitBtn);
  const fifNameEl = document.getElementById('fifName');
  if (fifNameEl) fifNameEl.placeholder = t.fifNamePh || '홍길동';

  // fifTime 옵션 목록 다국어 (시진은 한국어 고정, 첫 항목만 번역)
  const fifTimeEl = document.getElementById('fifTime');
  if (fifTimeEl && fifTimeEl.options[0]) {
    fifTimeEl.options[0].textContent = t.fifTimeUnknown || '모름 / 선택 안 함';
  }

  // ── 추천 칩 다국어 ──
  if (t.suggestChips) {
    t.suggestChips.forEach((txt, i) => {
      const chip = document.getElementById('chip' + i);
      if (chip) chip.textContent = txt;
    });
  }

  // ── 마이페이지 하단 카드 다국어 ──
  _t('mpBotChargeTitle',  t.mpBotCharge);
  _t('mpBotChargeDesc',   t.mpBotChargeDesc);
  _t('mpBotSupportTitle', t.mpBotSupport);
  _t('mpBotSupportDesc',  t.mpBotSupportDesc);
}

function _syncDrawerTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  document.getElementById('drawerThemeDark')?.classList.toggle('on', !isLight);
  document.getElementById('drawerThemeLight')?.classList.toggle('on', isLight);
  // 기존 테마 버튼 아이콘 동기화
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) themeBtn.textContent = isLight ? '☀️' : '🌙';
}

// 홈으로 이동 (채팅/마이페이지에서도 동작)
function _goHome() {
  if (document.getElementById('screen-chat').style.display === 'flex') goBack();
  else if (document.getElementById('screen-mypage').style.display === 'flex') closeMyPage();
  else if (document.getElementById('screen-signup').style.display === 'flex') goBackFromSignup();
  else if (document.getElementById('screen-login').style.display === 'flex') goBackFromLogin();
}

// ESC 키로 드로어도 닫기
// ESC 키로 모달/드로어 닫기
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('side-drawer').classList.contains('open')) { closeDrawer(); return; }
    const tokenModal  = document.getElementById('token-modal');
    const calModal    = document.getElementById('cal-modal');
    const adminPanel  = document.getElementById('admin-panel');
    if (adminPanel   && adminPanel.style.display   !== 'none') { closeAdminPanel(); return; }
    if (calModal     && calModal.style.display     !== 'none') { closeCalModal(); return; }
    if (tokenModal   && tokenModal.style.display   !== 'none') { closeTokenModal(); return; }
  }
});

// ══════════════════════════════════════════════
// ── PWA · 앱 기능 ──
// ══════════════════════════════════════════════

// ── 1. 스플래시 화면 ──
window.addEventListener('load', () => {
  const splash = document.getElementById('splash');
  if (!splash) return;
  // 폰트 + 리소스 로딩 후 1.2초 뒤 페이드아웃
  setTimeout(() => {
    splash.classList.add('fade-out');
    setTimeout(() => splash.remove(), 650);
  }, 1200);
});

// ── 2. Service Worker 등록 ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => {}).catch(() => {});
  });
}

// ── 3. 햅틱 피드백 ──
function haptic(type = 'light') {
  if (!navigator.vibrate) return;
  const patterns = {
    light:   [20],
    medium:  [40],
    heavy:   [60],
    success: [20, 30, 20],
    error:   [50, 30, 50],
  };
  navigator.vibrate(patterns[type] || [20]);
}

// 모든 버튼/카드 클릭에 햅틱 적용
document.addEventListener('click', e => {
  const target = e.target.closest('button, .card, .quick-box, .pkg-card, .lb');
  if (!target) return;
  if (target.classList.contains('card') || target.classList.contains('quick-box')) {
    haptic('medium');
  } else {
    haptic('light');
  }
}, { passive: true });

// ── 4. 푸시 알림 권한 요청 ──
async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    // 환영 알림
    new Notification('M;Y 安', {
      body: '일진 알림이 설정되었습니다. 매일 기운을 전해드릴게요.',
      icon: '/icon-pwa-192-192.png',
      badge: '/icon-pwa-192-192.png',
      tag: 'myan-welcome',
    });
    scheduleLocalNotification();
    return true;
  }
  return false;
}

// 로컬 알림 스케줄링 (오전 8시 알림)
function scheduleLocalNotification() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now  = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next - now;

  // 기존 타이머 클리어
  if (window._notifTimer) clearTimeout(window._notifTimer);

  window._notifTimer = setTimeout(() => {
    new Notification('M;Y 安 · 오늘의 기운', {
      body: '오늘의 일진과 오행 기운을 확인해 보세요.',
      icon:  '/icon-pwa-192-192.png',
      badge: '/icon-pwa-192-192.png',
      tag: 'myan-daily',
      renotify: true,
    });
    scheduleLocalNotification(); // 내일도 반복
  }, delay);

  localStorage.setItem('myan_notif_enabled', 'true');
}

// 앱 진입 시 알림 재스케줄
if (localStorage.getItem('myan_notif_enabled') === 'true') {
  scheduleLocalNotification();
}

// ── 5. 알림 설정 버튼 (마이페이지에서 호출) ──
async function toggleNotification() {
  const btn = document.getElementById('notifToggleBtn');
  if (!btn) return;
  const enabled = localStorage.getItem('myan_notif_enabled') === 'true';

  if (enabled) {
    // 알림 끄기
    if (window._notifTimer) clearTimeout(window._notifTimer);
    localStorage.removeItem('myan_notif_enabled');
    btn.textContent = '알림 켜기 🔔';
    btn.classList.remove('notif-on');
  } else {
    // 알림 켜기 — 권한 허용 후 저장소·스케줄러 동기화
    const ok = await requestNotificationPermission();
    if (ok) {
      localStorage.setItem('myan_notif_enabled', 'true');
      scheduleLocalNotification();
      btn.textContent = '알림 끄기 🔕';
      btn.classList.add('notif-on');
    }
  }
}
window.addEventListener('load', () => {
  const btn = document.getElementById('notifToggleBtn');
  if (btn && localStorage.getItem('myan_notif_enabled') === 'true') {
    btn.textContent = '알림 끄기 🔕';
    btn.classList.add('notif-on');
  }
});

// ── 6. theme-color 메타 태그 동기화 ──
function syncThemeColorMeta() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const meta = document.getElementById('metaThemeColor');
  if (meta) meta.setAttribute('content', isLight ? '#f5f0e8' : '#c9a96e');
}

// ── 7. 앱 설치 배너 (A2HS) ──
let _deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  // 3초 뒤 설치 배너 표시
  setTimeout(showInstallBanner, 3000);
});

function showInstallBanner() {
  if (!_deferredInstallPrompt) return;
  if (localStorage.getItem('myan_install_dismissed')) return;

  const banner = document.createElement('div');
  banner.id = 'install-banner';
  banner.style.cssText = `
    position:fixed; bottom:calc(20px + env(safe-area-inset-bottom)); left:50%;
    transform:translateX(-50%); z-index:8000;
    background:rgba(20,18,14,0.97); border:1px solid rgba(201,169,110,0.4);
    border-radius:16px; padding:14px 20px; display:flex; align-items:center;
    gap:14px; box-shadow:0 8px 32px rgba(0,0,0,0.6); max-width:340px; width:90%;
    animation:pop .35s ease;
  `;
  banner.innerHTML = `
    <img src="/icon-pwa-192-192.png" style="width:40px;height:40px;border-radius:10px;flex-shrink:0">
    <div style="flex:1">
      <div style="color:#c9a96e;font-size:0.9rem;font-weight:600">M;Y 安 앱 설치</div>
      <div style="color:#999;font-size:0.75rem;margin-top:2px">홈 화면에 추가하면 더 편리해요</div>
    </div>
    <button onclick="installApp()" style="background:rgba(201,169,110,0.15);border:1px solid rgba(201,169,110,0.4);color:#c9a96e;border-radius:8px;padding:6px 12px;font-size:0.8rem;cursor:pointer;white-space:nowrap">설치</button>
    <button onclick="dismissInstallBanner()" style="background:none;border:none;color:#666;font-size:1.2rem;cursor:pointer;padding:0 4px;line-height:1">×</button>
  `;
  document.body.appendChild(banner);
}

async function installApp() {
  if (!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  const { outcome } = await _deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') {
    localStorage.setItem('myan_install_dismissed', 'true');
  }
  _deferredInstallPrompt = null;
  document.getElementById('install-banner')?.remove();
}

function dismissInstallBanner() {
  localStorage.setItem('myan_install_dismissed', 'true');
  document.getElementById('install-banner')?.remove();
}

window.addEventListener('appinstalled', () => {
  _deferredInstallPrompt = null;
  document.getElementById('install-banner')?.remove();
  localStorage.setItem('myan_install_dismissed', 'true');
});

// ── 오행 파티클 필드 ──────────────────────────────────────────────

// ── 오행 파티클 필드 ──────────────────────────────────────────────
class ParticleField {
  static COLORS = ['#4bc87a','#e05a4a','#d4a040','#a0aab4','#5aa8e0'];

  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx    = this.canvas.getContext('2d');
    this.particles = [];
    this._raf   = null;
    this._resize = this._resize.bind(this);
    window.addEventListener('resize', this._resize);
    this._resize();
    this._populate();
    this._animate();
  }

  _resize() {
    if (!this.canvas) return;
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  _populate() {
    const count = window.innerWidth < 480 ? 28 : 50;
    this.particles = Array.from({ length: count }, () => ({
      x:    Math.random() * this.canvas.width,
      y:    Math.random() * this.canvas.height,
      vx:   (Math.random() - 0.5) * 1.2,
      vy:   (Math.random() - 0.5) * 1.2,
      r:    Math.random() * 1.8 + 0.8,
      alpha:Math.random() * 0.5 + 0.25,
      color:ParticleField.COLORS[Math.floor(Math.random() * 5)],
    }));
  }

  _animate() {
    const { ctx, canvas, particles } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    this._raf = requestAnimationFrame(() => this._animate());
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._resize);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ParticleField('bg-canvas');

  // ── 토스페이먼츠 결제 후 리다이렉트 처리 ──
  // 결제 성공: ?paymentKey=xxx&orderId=yyy&amount=4900
  // 결제 실패: ?payFailed=1&orderId=yyy  (또는 Toss 자체 failUrl)
  const _rsp = new URLSearchParams(window.location.search);
  const _paymentKey = _rsp.get('paymentKey');
  const _orderId    = _rsp.get('orderId');
  const _amount     = _rsp.get('amount');
  const _payFailed  = _rsp.get('payFailed');

  if (_paymentKey && _orderId && _amount) {
    // ✅ 결제 성공 리다이렉트
    history.replaceState({}, '', window.location.pathname);
    const _tossData = { paymentKey: _paymentKey, orderId: _orderId, amount: Number(_amount) };

    setTimeout(async () => {
      if (getGoogleIdToken()) {
        await _confirmTossPayment(_tossData);
      } else {
        // 로그인 토큰 아직 없으면 sessionStorage에 보관 → 로그인 후 처리
        sessionStorage.setItem('myan_pending_toss_payment', JSON.stringify(_tossData));
      }
    }, 800);

  } else if (_payFailed) {
    // ❌ 결제 실패 or 취소 (별도 안내 없이 URL만 정리)
    history.replaceState({}, '', window.location.pathname);
  }
});

// ── AI 답변 타이핑 효과 ──────────────────────────────────────────
let _typingAbort = null;

async function _typeIntoNode(textNode, text, speed = 22) {
  if (text.length > 300) { textNode.nodeValue = text; return; }
  const ctrl = new AbortController();
  _typingAbort = ctrl;
  textNode.nodeValue = '';

  for (let i = 0; i < text.length; i++) {
    if (ctrl.signal.aborted) { textNode.nodeValue = text; return; }
    await new Promise(r => setTimeout(r, speed));
    if (ctrl.signal.aborted) { textNode.nodeValue = text; return; }
    textNode.nodeValue = text.slice(0, i + 1);
    try { const w = cw(); if (w) w.scrollTop = w.scrollHeight; } catch {}
  }
}

// 페이지가 백그라운드로 가면 진행 중인 타이핑 즉시 완료
document.addEventListener('visibilitychange', () => {
  if (document.hidden && _typingAbort) _typingAbort.abort();
});
