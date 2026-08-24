// M;Y 安 — app.js  (API·채팅·결제·마이페이지 메인 로직)

// ══════════════════════════════════════════════════════════════════════
//  사운드 효과 (Web Audio API)
// ══════════════════════════════════════════════════════════════════════
let audioEnabled = true; // localStorage에서 불러오기
try {
  const saved = localStorage.getItem('myan_audio_enabled');
  if (saved !== null) audioEnabled = saved === 'true';
} catch {}

function toggleAudio() {
  audioEnabled = !audioEnabled;
  try { localStorage.setItem('myan_audio_enabled', audioEnabled); } catch {}
  return audioEnabled;
}

// 🔔 종소리 효과
function playBellSound() {
  if (!audioEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  } catch {}
}

// 📜 페이지 넘기는 소리
function playPageFlipSound() {
  if (!audioEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 300;
    osc.type = 'triangle';
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch {}
}

// ✨ 성공 소리
function playSuccessSound() {
  if (!audioEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.1;
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  } catch {}
}

// ══════════════════════════════════════════════════════════════════════
//  연속 방문 스트릭 배너 (서버 검증 스트릭 — fetchStreak()/_streakCache 기반)
// ══════════════════════════════════════════════════════════════════════
function showStreakBanner(count) {
  const banner = document.getElementById('streakBanner');
  const text = document.getElementById('streakText');
  if (!banner || !text || !count || count < 1) {
    if (banner) banner.style.display = 'none';
    return;
  }

  const messages = {
    ko: count === 1 ? '오늘 첫 방문!' : `${count}일 연속 방문 중!`,
    en: count === 1 ? 'First visit today!' : `${count} day streak!`,
    zh: count === 1 ? '今日首次访问!' : `连续访问${count}天!`,
    ja: count === 1 ? '今日初訪問!' : `${count}日連続!`
  };
  const lang = getLang();
  text.textContent = messages[lang] || messages.ko;
  banner.style.display = 'flex';

  celebrateStreakMilestone(count);
}

// 마일스톤(3/7/14/30/100일) 도달 시 순수 축하 연출만 한다.
// 실제 엽전 지급 여부는 서버 체크인 응답의 bonus 플래그(doCheckin())로만 안내한다 —
// 여기서 클라이언트가 임의로 "🎁 엽전 +N"을 약속하지 않는다.
function celebrateStreakMilestone(count) {
  const milestones = [3, 7, 14, 30, 100];
  if (!milestones.includes(count)) return;
  try {
    const key = 'myan_streak_celebrated';
    const celebrated = JSON.parse(localStorage.getItem(key) || '{}');
    if (celebrated[count]) return;
    celebrated[count] = true;
    localStorage.setItem(key, JSON.stringify(celebrated));
  } catch { return; }

  const messages = {
    ko: { 3: '🔥 3일 연속!', 7: '🔥 일주일 달성!', 14: '🔥 2주 연속!', 30: '🎉 한 달 달성!', 100: '👑 100일 달성!' },
    en: { 3: '🔥 3 days!', 7: '🔥 1 week!', 14: '🔥 2 weeks!', 30: '🎉 1 month!', 100: '👑 100 days!' },
    zh: { 3: '🔥 连续3天!', 7: '🔥 连续一周!', 14: '🔥 连续两周!', 30: '🎉 连续一月!', 100: '👑 连续100天!' },
    ja: { 3: '🔥 3日連続!', 7: '🔥 1週間達成!', 14: '🔥 2週間連続!', 30: '🎉 1ヶ月達成!', 100: '👑 100日達成!' }
  };
  const lang = getLang();
  const msg = messages[lang]?.[count] || messages.ko[count];
  if (!msg) return;
  setTimeout(() => {
    showToast(msg, 4000);
    hapticSuccess();
    playSuccessSound();
    if (window.M_Effect) {
      const colors = ['木', '火', '土', '金', '水'];
      window.M_Effect.spawnParticles(null, colors[Math.floor(Math.random() * colors.length)]);
    }
  }, 1000);
}

// ══════════════════════════════════════════════════════════════════════
//  햅틱 피드백
// ══════════════════════════════════════════════════════════════════════
function hapticLight() {
  try {
    if (navigator.vibrate) navigator.vibrate(10);
  } catch {}
}

function hapticMedium() {
  try {
    if (navigator.vibrate) navigator.vibrate(20);
  } catch {}
}

function hapticHeavy() {
  try {
    if (navigator.vibrate) navigator.vibrate([30, 10, 30]);
  } catch {}
}

function hapticSuccess() {
  try {
    if (navigator.vibrate) navigator.vibrate([10, 30, 20, 30, 30]);
  } catch {}
}

// ══════════════════════════════════════════════════════════════════════
//  공유 카드 생성 (Canvas)
// ══════════════════════════════════════════════════════════════════════
async function shareOhaengCard(ohaeng) {
  const lang = getLang();
  const t = TX[lang];
  const dk = DK[lang][ohaeng];
  const col = OC[ohaeng];
  const kiName = ON[lang][ohaeng];
  const today = new Date().toLocaleDateString(lang === 'ko' ? 'ko-KR' : lang === 'ja' ? 'ja-JP' : lang === 'zh' ? 'zh-CN' : 'en-US');

  // 🎁 공유 보너스 체크 (일 1회)
  const canGetBonus = await checkShareBonus();

  // 캔버스 생성
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');

  // 배경 그라데이션
  const gradient = ctx.createLinearGradient(0, 0, 0, 630);
  gradient.addColorStop(0, '#0d0e12');
  gradient.addColorStop(1, '#1a1b20');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 630);

  // 오행 색깔 글로우
  const glowGrad = ctx.createRadialGradient(600, 315, 50, 600, 315, 400);
  glowGrad.addColorStop(0, `${col}40`);
  glowGrad.addColorStop(1, `${col}00`);
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, 1200, 630);

  // 제목
  ctx.fillStyle = '#c9a96e';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('M;Y 安', 600, 100);

  // 날짜
  ctx.fillStyle = '#8a8479';
  ctx.font = '24px sans-serif';
  ctx.fillText(today, 600, 140);

  // 오행 한자 (큰 글씨)
  ctx.fillStyle = col;
  ctx.font = 'bold 180px serif';
  ctx.fillText(ohaeng, 600, 320);

  // 오행 이름
  ctx.fillStyle = '#e8dcc8';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText(kiName, 600, 380);

  // 아이콘
  ctx.font = '80px sans-serif';
  ctx.fillText(dk.icon, 600, 480);

  // 활동 이름
  ctx.fillStyle = col;
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText(dk.name, 600, 540);

  // URL
  ctx.fillStyle = '#6a6a5a';
  ctx.font = '20px sans-serif';
  ctx.fillText('myan.riger7070.workers.dev', 600, 600);

  // 이미지로 변환
  canvas.toBlob(async (blob) => {
    if (!blob) {
      showToast(t.err || '오류가 발생했습니다');
      return;
    }

    try {
      // Web Share API 지원 확인
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], 'myan-ohaeng.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: `M;Y 安 - ${kiName}`,
              text: `오늘(${today})의 오행 기운은 ${kiName}입니다!`,
              files: [file]
            });
            hapticLight();

            // 🎁 공유 보너스 지급 (서버가 실제로 지급을 확정한 경우에만 안내)
            if (canGetBonus && await grantShareBonus()) {
              showToast({ko:'🎁 공유 보너스 엽전 +1',en:'🎁 +1 Share Bonus Token',zh:'🎁 分享奖励代币+1',ja:'🎁 共有ボーナス トークン+1'}[lang]);
            }

            return;
          } catch (shareErr) {
            // 사용자가 공유 시트를 취소한 경우 — 실패가 아니므로 조용히 종료
            if (shareErr?.name === 'AbortError') return;
            // 그 외 오류(권한 거부 등)는 아래 다운로드 폴백으로 계속 진행
          }
        }
      }

      // 폴백: 다운로드
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `myan-${ohaeng}-${new Date().toISOString().slice(0,10)}.png`;
      a.click();
      URL.revokeObjectURL(url);

      // 🎁 공유 보너스 지급 — 서버가 실제로 지급을 확정한 경우에만 문구에 반영
      const granted = canGetBonus && await grantShareBonus();
      const msg = granted
        ? {ko:'이미지가 저장되었습니다! 🎁 엽전 +1',en:'Image saved! 🎁 +1 Token',zh:'图片已保存! 🎁 代币+1',ja:'画像を保存しました! 🎁 トークン+1'}[lang]
        : {ko:'이미지가 저장되었습니다!',en:'Image saved!',zh:'图片已保存!',ja:'画像を保存しました!'}[lang];

      showToast(msg || '이미지가 저장되었습니다!');
      hapticMedium();
    } catch (err) {
      console.error(err);
      showToast(t.err || '공유에 실패했습니다');
    }
  }, 'image/png');
}

// 재미 콘텐츠 모달의 오류 표시 공통 헬퍼.
// 엽전 부족(402)이면 안내에서 끝내지 않고 바로 충전으로 이어지게 버튼을 붙인다.
function _resultErrorHtml(res, data) {
  const msg = data?.error?.message || '오류가 발생했습니다.';
  const base = `<div style="font-size:0.85rem;color:var(--text-dim);text-align:center">${msg}</div>`;
  if (res?.status !== 402) return base;

  const label = { ko:'✦ 엽전 충전하기', en:'✦ Get Tokens', zh:'✦ 充值代币', ja:'✦ トークン購入' }[getLang()] || '✦ 엽전 충전하기';
  return base + `<button class="fif-submit" style="width:100%;margin-top:14px;padding:12px" onclick="_goCharge()">${label}</button>`;
}

// 충전 모달로 이동. #token-modal은 z-index 200이라 재미 콘텐츠 오버레이(1200) 아래에 깔린다.
// 따라서 열려 있는 오버레이를 먼저 닫아야 충전 모달이 실제로 보인다.
function _goCharge() {
  if (typeof Analytics !== 'undefined') Analytics.trackToken('charge_click');
  document.querySelectorAll('.modal-overlay.active').forEach(el => el.remove());
  document.getElementById('photo-gallery-modal')?.remove();
  openTokenModal();
}

// 범용 결과 공유 카드 — 타로/주역/수비학/토정비결/룬/꿈해몽/로또 등 모든 재미 콘텐츠 결과에서 재사용.
// shareOhaengCard()와 같은 톤(어두운 배경+골드 글로우)이지만 임의의 아이콘·제목·부제를 그린다.
async function shareResultCard({ icon, title, subtitle, filename }) {
  const lang = getLang();
  const t = TX[lang];
  const today = new Date().toLocaleDateString(lang === 'ko' ? 'ko-KR' : lang === 'ja' ? 'ja-JP' : lang === 'zh' ? 'zh-CN' : 'en-US');

  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, 630);
  gradient.addColorStop(0, '#0d0e12');
  gradient.addColorStop(1, '#1a1b20');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 630);

  const glowGrad = ctx.createRadialGradient(600, 315, 50, 600, 315, 400);
  glowGrad.addColorStop(0, '#c9a96e40');
  glowGrad.addColorStop(1, '#c9a96e00');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, 1200, 630);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#c9a96e';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('M;Y 安', 600, 96);

  ctx.fillStyle = '#8a8479';
  ctx.font = '22px sans-serif';
  ctx.fillText(today, 600, 134);

  ctx.font = '140px sans-serif';
  ctx.fillText(icon || '✨', 600, 330);

  ctx.fillStyle = '#e8dcc8';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText((title || '').slice(0, 24), 600, 420);

  if (subtitle) {
    ctx.fillStyle = '#a89a80';
    ctx.font = '26px sans-serif';
    ctx.fillText(subtitle.slice(0, 34), 600, 470);
  }

  ctx.fillStyle = '#6a6a5a';
  ctx.font = '20px sans-serif';
  ctx.fillText('myan.riger7070.workers.dev', 600, 600);

  canvas.toBlob(async (blob) => {
    if (!blob) { showToast(t.err || '오류가 발생했습니다'); return; }
    try {
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], `${filename || 'myan-result'}.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ title: `M;Y 安 - ${title}`, text: title, files: [file] });
            hapticLight();
            return;
          } catch (shareErr) {
            if (shareErr?.name === 'AbortError') return;
          }
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename || 'myan-result'}-${new Date().toISOString().slice(0,10)}.png`;
      a.click();
      URL.revokeObjectURL(url);
      showToast({ko:'이미지가 저장되었습니다!',en:'Image saved!',zh:'图片已保存!',ja:'画像を保存しました!'}[lang] || '이미지가 저장되었습니다!');
      hapticMedium();
    } catch (err) {
      console.error(err);
      showToast(t.err || '공유에 실패했습니다');
    }
  }, 'image/png');
}

async function checkShareBonus() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const stored = localStorage.getItem('myan_last_share_bonus');
    return stored !== today;
  } catch {
    return true;
  }
}

// 실제로 엽전이 지급됐을 때만 true를 반환한다 — 호출부는 이 값으로만 보상 문구를 노출해야 한다.
async function grantShareBonus() {
  const token = getGoogleIdToken();
  if (!token) return false;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(EP + 'api/share-bonus', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today })
    });

    if (!res.ok) return false;

    localStorage.setItem('myan_last_share_bonus', today);
    await refreshTokens();
    updateAllTokenDisplays();

    // 공유 횟수 증가
    const shareCount = parseInt(localStorage.getItem('myan_share_count') || '0') + 1;
    localStorage.setItem('myan_share_count', shareCount);

    // 공유 10회 업적
    if (shareCount >= 10) {
      unlockAchievement('share_10');
    }
    return true;
  } catch (e) {
    console.error('Share bonus grant failed:', e);
    return false;
  }
}

window.shareOhaengCard = shareOhaengCard;

// ══════════════════════════════════════════════════════════════════════
//  유틸리티 함수
// ══════════════════════════════════════════════════════════════════════

function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(201, 169, 110, 0.95);
    color: #060608;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 0.9rem;
    z-index: 10000;
    animation: fadeIn 0.3s ease;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ══════════════════════════════════════════════════════════════════════
//  화면 전환 통합 관리 시스템
// ══════════════════════════════════════════════════════════════════════

const SCREENS = {
  MODE: 'screen-mode',
  CHAT: 'screen-chat',
  SIGNUP: 'screen-signup',
  LOGIN: 'screen-login',
  MYPAGE: 'screen-mypage',
  GUEST: 'screen-guest',
  GUEST_RESULT: 'screen-guest-result'
};

function hideAllScreens() {
  Object.values(SCREENS).forEach(screenId => {
    const el = document.getElementById(screenId);
    if (el) el.style.display = 'none';
  });
}

function showScreen(screenName, hideBack = false) {
  hideAllScreens();
  const screenId = SCREENS[screenName];
  const el = document.getElementById(screenId);
  if (el) {
    el.style.display = screenName === 'MODE' ? '' : 'flex';
  }

  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.style.display = hideBack ? 'none' : 'flex';
  }

  // 페이지뷰 트래킹
  if (typeof Analytics !== 'undefined') {
    Analytics.trackPageView(screenName);
  }
}

function getCurrentScreen() {
  for (const [name, id] of Object.entries(SCREENS)) {
    const el = document.getElementById(id);
    if (el && el.style.display !== 'none' && el.style.display !== '') {
      return name;
    }
  }
  return 'MODE'; // 기본값
}

// ══════════════════════════════════════════════════════════════════════

async function callGemini(contents) {
  if (!getGoogleIdToken()) throw { refund: false, noLogin: true };

  // solo 모드: 정확한 만세력 계산을 위해 생년월일시를 구조화해 함께 전송 (서버가 사주 4기둥 산출)
  const _u = (typeof getUser === 'function') ? getUser() : null;
  const birth = (mode === 'solo' && _u?.birthYear) ? {
    year:  _u.birthYear,
    month: _u.birthMonth,
    day:   _u.birthDay,
    hour:  _u.birthHour || ''   // 한글 시진명('자시'~'해시') 또는 빈값 — 서버에서 지지로 매핑
  } : undefined;

  const doFetch = () => fetch(EP + 'chat', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      mode: mode,
      lang: lang,
      contents: contents,
      birth: birth
    }),
  });

  let res  = await doFetch();
  let data = await res.json();

  // 엽전 부족 (서버에서 차감 실패)
  if (res.status === 402 || res.status === 403) throw { refund: false, noToken: true };

  // 인증 실패 → 엽전 폐기
  if (res.status === 401) {
    _googleIdToken = ''; _googleIdTokenExp = 0;
    localStorage.removeItem('myan_id_token');
    localStorage.removeItem('myan_session');
    throw { refund: false, noLogin: true };
  }

  // 속도 제한 → 1회 재시도 (3초 대기)
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 3500));
    res  = await doFetch();
    data = await res.json();
    // 재시도 후에도 429이면 rate-limit 전용 에러 (엽전 미차감이므로 refund: true로 잔액 동기화)
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

// 대화 복원 기능이 사라지면서(채팅 방식 제거) 저장한 값을 읽는 곳이 없어졌다.
// 화면 전체 innerHTML을 뒤로가기·재로그인마다 localStorage에 쓰기만 하고 있었으므로 제거.
// clearChatState()는 기존 사용자에게 남은 키를 지우기 위해 유지한다.

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
  const currentScreen = getCurrentScreen();

  if (currentScreen === 'CHAT') {
    mode = null;
    hist = [];
  }

  // 홈 화면으로 복귀
  showScreen('MODE', true);

  // 모드 화면 복귀 시 userBtn / signupLinkBtn 복원
  const u = getUser();
  const _userBtn = document.getElementById('userBtn');
  const signupBtn = document.getElementById('signupLinkBtn');

  if (u && isLoggedIn()) {
    updateUserBtn(u);
    if (signupBtn) signupBtn.style.display = 'none';
  } else if (u && !isLoggedIn()) {
    if (_userBtn) _userBtn.style.display = 'none';
    if (signupBtn) signupBtn.style.display = 'none';
  } else {
    if (_userBtn) _userBtn.style.display = 'none';
    if (signupBtn) signupBtn.style.display = '';
  }

  // 무료 배너 상태 업데이트 + 오브 색상 초기화
  updateFreeBanner();
  _resetOrbTheme();
}

/* DOM 헬퍼 */
const cw = () => document.getElementById('chat-window');

// 스크롤 최적화 래퍼 (throttle 적용)
const scrollToBottom = (() => {
  let scheduled = false;
  return (smooth = false) => {
    if (scheduled) return;
    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;
      const chatWindow = cw();
      if (chatWindow) {
        if (smooth) {
          chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });
        } else {
          chatWindow.scrollTop = chatWindow.scrollHeight;
        }
      }
    });
  };
})();

function addBubble(text, who, { sentenceReveal = false } = {}) {
  const d = document.createElement('div');
  d.className = `bubble bubble-${who}`;
  if (who === 'ai') {
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

    if (sentenceReveal) {
      // 첫 리딩 전달 — 오라클 연출(대기)이 끝나면 리딩 전문을 한 번에 페이드인 (stagger:0 = 문장 순차공개 없이 동시 표시)
      const contentEl = document.createElement('div');
      contentEl.className = 'bubble-reveal-content';
      d.appendChild(contentEl);
      d.appendChild(btn);
      cw().appendChild(d);
      scrollToBottom();
      revealSentences(contentEl, text, getLang(), { scrollEl: cw(), stagger: 0 });
    } else {
      // 텍스트 노드를 별도 관리 → 타이핑 효과 적용 & 복사 버튼 충돌 방지
      const tn = document.createTextNode('');
      d.appendChild(tn);
      d.appendChild(btn);
      cw().appendChild(d);
      scrollToBottom();
      // 이전 타이핑 중단 후 새 타이핑 시작
      if (_typingAbort) _typingAbort.abort();
      _typeIntoNode(tn, text, 22);
    }
  } else {
    d.textContent = text;
    cw().appendChild(d);
    scrollToBottom();
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
    '고요히 기운의 흐름을 살피고 있습니다…',
    '오늘의 일진과 사주를 견주어 봅니다…',
    '오행의 균형을 가늠하고 있습니다…',
    '천지의 기운을 헤아리고 있습니다…',
    '사주 네 기둥을 정성껏 세우고 있습니다…',
    '만세력을 살펴 결을 찾고 있습니다…',
    '오늘에 맞는 처방을 다듬고 있습니다…',
  ],
  en: [
    'Quietly tracing the flow of your energy…',
    'Comparing today\'s day-pillar with your Saju…',
    'Weighing the balance of the Five Elements…',
    'Discerning the energy of heaven and earth…',
    'Carefully raising the Four Pillars…',
    'Consulting the ten-thousand-year calendar…',
    'Refining today\'s prescription…',
  ],
  zh: [
    '静静地探寻气运的流动…',
    '比对今日日干与四柱…',
    '权衡五行的平衡…',
    '体察天地之气…',
    '细致地排列四柱…',
    '查阅万年历，寻找脉络…',
    '为今日调配处方…',
  ],
  ja: [
    '静かに気の流れを見つめています…',
    '今日の日干と四柱を照らし合わせています…',
    '五行のバランスを見極めています…',
    '天地の気運を察しています…',
    '四柱を丁寧に立てています…',
    '万歳暦を紐解いています…',
    '今日の処方を仕上げています…',
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

  // 프로그레스 바 추가
  const progressWrap = document.createElement('div');
  progressWrap.className = 'loader-progress';
  const progressBar = document.createElement('div');
  progressBar.className = 'loader-progress-bar';
  progressWrap.appendChild(progressBar);
  d.appendChild(progressWrap);

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

// ══════════════════════════════════════════
//  신탁 연출 — 사주집 방문 오버레이 + 문장 단위 순차 공개
// ══════════════════════════════════════════
const minDelay = (ms) => new Promise(r => setTimeout(r, ms));

// 값이 큰 풀이일수록 오래 뜸을 들인다. 1토큰짜리와 3토큰짜리가 같은 속도로 나오면
// 비싼 쪽이 그만큼 가벼워 보인다. 어디까지나 **최소**라, 실제 호출이 더 걸리면
// 그대로 기다린다(여기서 더 늘리지 않는다). 그래서 느린 사람에게는 아무 영향이 없고,
// 캐시가 즉시 답하는 콘텐츠에서만 실제로 작동한다.
//
// 바닥이 5초가 아니라 7.5초인 이유: 위 연출(oracle-beat)의 마지막 장면이 7.2초에
// 시작한다. 그보다 먼저 닫으면 기둥을 세우다 만 채로 화면이 바뀐다. 연출 일정을
// 손대면 이 값도 같이 봐야 한다.
//
// ⚠️ 미니앱에도 같은 장치가 있지만 상수가 다르다(mini/src/main.js 의 readMinMs).
// 그쪽은 연출이 정해진 순서가 아니라 계속 도는 애니메이션이라 바닥이 더 낮다.
// **일부러 다른 값이니 맞추려 들지 말 것.**
const READ_MIN_BASE_MS     = 5000;    // 어떤 풀이든 최소 5초
const READ_MIN_PER_COST_MS = 1200;    // 토큰 하나당 더 얹는 시간
const READ_MIN_CAP_MS      = 12000;   // 아무리 비싸도 여기까지
const readMinMs = (cost = 0) => Math.min(
  READ_MIN_CAP_MS,
  READ_MIN_BASE_MS + Math.max(0, Number(cost) || 0) * READ_MIN_PER_COST_MS,
);

// 전체화면 신탁 연출(openOracleOverlay)만 바닥이 더 높다. 마지막 장면이 7.2초에
// 시작하므로 그보다 먼저 닫으면 기둥을 세우다 만 채로 화면이 바뀐다. 기울기는 위와 같다.
const ORACLE_MIN_BASE_MS = 7500;
const oracleMinMs = (cost = 0) => Math.min(
  READ_MIN_CAP_MS,
  ORACLE_MIN_BASE_MS + Math.max(0, Number(cost) || 0) * READ_MIN_PER_COST_MS,
);

// apiPromise를 넘기면: 최소 6초 연출 + API 응답을 함께 기다린 뒤 resolve/reject.
// contained:true + target 지정 시 전체화면이 아닌 해당 요소 내부에 축소 렌더(상세 풀이 모달용).
function openOracleOverlay({ apiPromise, contained = false, target = null, cost = 0 } = {}) {
  const t = getT();
  const langNow = getLang();
  const allMsgs = _LOAD_MSGS[langNow] || _LOAD_MSGS.ko;

  // 🎲 문구 랜덤 섞기
  const msgs = [...allMsgs].sort(() => Math.random() - 0.5);

  // 🕯️ 문구별 아이콘 매핑 (차분하고 정제된 이미지로 통일)
  const msgIcons = ['🕯️', '☯️', '⚖️', '🌌', '🏛️', '📜', '✨'];

  const wrap = document.createElement('div');
  wrap.className = contained ? 'oracle-stage' : 'oracle-overlay active';
  wrap.innerHTML = `
    <div class="oracle-inner">
      <button class="oracle-audio-toggle" title="${audioEnabled ? '🔊 음소거' : '🔇 소리켜기'}">${icon(audioEnabled ? 'sound' : 'mute')}</button>
      <div class="oracle-beat show">
        <div class="oracle-door opening">
          <div class="oracle-door-frame">
            <div class="oracle-door-left"></div>
            <div class="oracle-door-right"></div>
          </div>
        </div>
      </div>
      <div class="oracle-beat">
        <div class="oracle-character clickable"><img src="/andoryeong.svg" alt="안도령"></div>
        <div class="oracle-caption">${t.oracleEnter || '문을 엽니다…'}</div>
      </div>
      <div class="oracle-beat">
        <div class="oracle-pages">
          <div class="oracle-page"></div><div class="oracle-page"></div><div class="oracle-page"></div>
        </div>
        <div class="oracle-caption">${t.oracleFlip || '만세력을 넘깁니다…'}</div>
      </div>
      <div class="oracle-beat">
        <div class="oracle-pillars">
          <div class="oracle-pillar"></div><div class="oracle-pillar"></div><div class="oracle-pillar"></div><div class="oracle-pillar"></div>
        </div>
        <div class="oracle-caption">${t.oraclePillars || '사주 네 기둥을 세웁니다…'}</div>
      </div>
      <div class="oracle-beat">
        <div class="oracle-effect-icon">🔔</div>
        <span class="oracle-loop-text">${msgs[0]}</span>
        <div class="loader-progress">
          <div class="loader-progress-bar oracle-loop-bar" style="width: 0%"></div>
        </div>
        <button class="oracle-skip-btn">${{ko:'⏩ 건너뛰기',en:'⏩ Skip',zh:'⏩ 跳过',ja:'⏩ スキップ'}[langNow] || '⏩ 건너뛰기'}</button>
      </div>
    </div>`;

  const targetEl = (contained && target)
    ? (typeof target === 'string' ? document.querySelector(target) : target)
    : null;
  if (targetEl) {
    targetEl.innerHTML = '';
    targetEl.appendChild(wrap);
  } else {
    document.body.appendChild(wrap);
    document.body.style.overflow = 'hidden';
  }

  const beats = wrap.querySelectorAll('.oracle-beat');
  const schedule = [0, 1800, 3500, 5500, 7200];
  const beatTimers = schedule.map((delay, i) => setTimeout(() => {
    beats.forEach((b, j) => b.classList.toggle('show', j === i));
    // 🔊 단계별 사운드 & 햅틱
    if (i === 1) { playBellSound(); hapticLight(); } // 안도령 등장
    if (i === 2) { playPageFlipSound(); hapticLight(); } // 만세력 넘김
    if (i === 3) { playBellSound(); hapticMedium(); } // 기둥 세움
  }, delay));

  // 🎭 안도령 클릭 반응
  const charEl = wrap.querySelector('.oracle-character');
  if (charEl) {
    charEl.addEventListener('click', () => {
      playBellSound(); // 클릭 시 종소리
      hapticLight(); // 가벼운 진동
      charEl.style.transform = 'scale(1.15) rotate(5deg)';
      setTimeout(() => { charEl.style.transform = ''; }, 200);
    });
  }

  let loopIdx = 0;
  const loopSpan = wrap.querySelector('.oracle-loop-text');
  const iconSpan = wrap.querySelector('.oracle-effect-icon');
  const loopTimer = setInterval(() => {
    loopIdx = (loopIdx + 1) % msgs.length;
    if (!loopSpan) return;
    loopSpan.style.opacity = '0';
    if (iconSpan) iconSpan.style.opacity = '0';
    setTimeout(() => {
      loopSpan.textContent = msgs[loopIdx];
      loopSpan.style.opacity = '1';
      if (iconSpan) {
        iconSpan.textContent = msgIcons[loopIdx % msgIcons.length];
        iconSpan.style.opacity = '1';
      }
      // 🔊 문구 변경 시 작은 소리
      if (loopIdx === 0) playPageFlipSound();
    }, 250);
  }, 1800);

  // ⏱️ 실제 프로그레스 바 (0% → 100%)
  const MIN_MS = oracleMinMs(cost);
  const started = Date.now();
  const progressBar = wrap.querySelector('.oracle-loop-bar');
  let progressInterval;
  if (progressBar) {
    progressInterval = setInterval(() => {
      const elapsed = Date.now() - started;
      const progress = Math.min(100, (elapsed / MIN_MS) * 100);
      progressBar.style.width = `${progress}%`;
    }, 50);
  }

  // ⏩ 스킵 버튼
  let skipRequested = false;
  const skipBtn = wrap.querySelector('.oracle-skip-btn');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      skipRequested = true;
      playSuccessSound();
      hapticMedium();
      close();
    });
  }

  // 🔊 오디오 토글 버튼
  const audioBtn = wrap.querySelector('.oracle-audio-toggle');
  if (audioBtn) {
    audioBtn.addEventListener('click', () => {
      const enabled = toggleAudio();
      audioBtn.innerHTML = icon(enabled ? 'sound' : 'mute');
      audioBtn.title = enabled ? '🔊 음소거' : '🔇 소리켜기';
      if (enabled) playBellSound();
      hapticLight();
    });
  }

  function cleanup() {
    beatTimers.forEach(clearTimeout);
    clearInterval(loopTimer);
    if (progressInterval) clearInterval(progressInterval);
  }
  function close() {
    cleanup();
    wrap.classList.add('oracle-closing');
    setTimeout(() => {
      wrap.remove();
      if (!targetEl) document.body.style.overflow = '';
    }, 300);
  }

  return (async () => {
    let ok = true, payload;
    try { payload = await apiPromise; }
    catch (e) { ok = false; payload = e; }

    // 스킵 안 했으면 최소 시간 대기
    if (!skipRequested) {
      const remain = MIN_MS - (Date.now() - started);
      if (remain > 0) await minDelay(remain);
    }

    // 🎉 완료 시 성공 사운드 & 파티클 & 햅틱
    if (ok) {
      playSuccessSound();
      hapticSuccess(); // 성공 진동 패턴
      // 랜덤 오행 색깔로 축하 파티클
      const colors = ['木', '火', '土', '金', '水'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      if (window.M_Effect) {
        window.M_Effect.spawnParticles(null, randomColor);
      }
    }

    close();
    if (ok) return payload;
    throw payload;
  })();
}

// 문장 분리 — 전각 구두점(중국어/일본어)은 공백 없이 바로 다음 문장이 이어지므로 즉시 분할,
// 반각 구두점(한국어/영어)은 소수점·약어 보호를 위해 다음 글자가 공백/닫는 괄호/끝일 때만 분할
function _splitSentences(text, langNow) {
  if (!text) return [];
  const paragraphs = String(text).split('\n').map(p => p.trim()).filter(Boolean);
  const wideEnders = new Set(['。', '！', '？']);
  const halfEnders = new Set(['.', '!', '?']);
  const out = [];
  for (const p of paragraphs) {
    let buf = '';
    for (let i = 0; i < p.length; i++) {
      const ch = p[i];
      buf += ch;
      const next = p[i + 1];
      if (wideEnders.has(ch)) {
        if (next && /\d/.test(next)) continue; // 소수점 보호
        out.push(buf.trim());
        buf = '';
        continue;
      }
      if (halfEnders.has(ch)) {
        if (next && /\d/.test(next)) continue; // 소수점 보호
        if (next && !/[\s"'）」』)\]]/.test(next)) continue; // 약어 등 — 공백/닫는 괄호/끝이 아니면 계속 이어붙임
        out.push(buf.trim());
        buf = '';
      }
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out.length ? out : [String(text).trim()].filter(Boolean);
}

// 문장 단위 순차 공개 — 기존 fadeIn 키프레임 재사용, animation-delay로 stagger
function revealSentences(container, text, langNow, { stagger = 1700, onComplete, scrollEl } = {}) {
  if (!container) { if (onComplete) onComplete(); return; }
  container.innerHTML = '';
  const sentences = _splitSentences(text, langNow);
  if (!sentences.length) { if (onComplete) onComplete(); return; }

  let done = false;
  const scroller = scrollEl || container;
  const onVisChange = () => {
    if (!document.hidden || done) return;
    container.querySelectorAll('.reveal-sentence').forEach(el => {
      el.style.animation = 'none';
      el.style.opacity = '1';
    });
  };
  document.addEventListener('visibilitychange', onVisChange);

  // 모든 문장을 한번에 표시 (delay 0으로 설정)
  sentences.forEach((sentence, i) => {
    const el = document.createElement('div');
    el.className = 'reveal-sentence';
    el.textContent = sentence;
    el.style.animationDelay = '0s';  // 모든 문장 즉시 표시
    el.style.opacity = '1';           // 즉시 보이도록
    container.appendChild(el);
  });

  // 즉시 스크롤
  setTimeout(() => { try { scroller.scrollTop = scroller.scrollHeight; } catch {} }, 50);

  // 즉시 완료
  setTimeout(() => {
    done = true;
    document.removeEventListener('visibilitychange', onVisChange);
    if (onComplete) onComplete();
  }, 100);
}

// 문장 리빌 총 소요 시간(ms) — 게이지 등 후행 연출 타이밍 계산용.
// revealSentences()가 문장을 즉시(약 100ms) 전부 표시하므로, 여기도 그에 맞춰
// 텍스트를 잠깐 읽을 시간만 준 뒤 게이지가 나타나는 짧은 고정 지연을 쓴다.
function _sentenceRevealMs() {
  return 700;
}

function addRxCard(o) {
  // 처방 카드 등장 시 해당 오행 파티클 버스트
  window.M_Effect?.spawnParticles('chat-window', o);

  const dk  = DK[lang][o];
  const col = OC[o];
  const bg  = OBG[o];
  const t   = TX[lang];

  // 오행 이름 — 한글 중심 표시
  const hanja  = o;                 // 木 火 土 金 水
  const kiName = ON[lang][o];        // 목(木) / Wood / 木气 / 木(もく)

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

  // 공유 / 상세풀이 버튼 행
  const today = _todayKST ? _todayKST() : new Date().toISOString().slice(0,10);
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;margin:6px 0 2px;flex-wrap:wrap;';
  btnRow.innerHTML = DETAIL_CATS.map(c => `
    <button class="rx-detail-btn" onclick="_openDetailReading('${today}','${o}','${c.key}')">
      ${c.icon} ${t.detailCardTitle?.[c.key] || c.key}
    </button>`).join('') + `
    <button class="rx-share-btn" onclick="shareOhaengCard('${o}')">
      📤 ${{ko:'공유하기',en:'Share',zh:'分享',ja:'共有'}[lang] || '공유하기'}
    </button>`;
  cw().appendChild(btnRow);

  // 피드백 행 제거됨

  // 홈 프리뷰 / 행운 아이템 갱신
  _refreshHomeExtras(o);

  // 오행 히스토리 저장 (D1)
  const _fbToken = getGoogleIdToken();
  if (_fbToken) {
    fetch(EP + 'api/ohaeng-history', {
      method: 'POST',
      headers: { Authorization: `Bearer ${_fbToken}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ date: today, ohaeng: o })
    }).catch(()=>{});
  }
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

  // 채팅 전송 트래킹
  if (typeof Analytics !== 'undefined') {
    Analytics.trackChatSend(mode, txt.length, hist.length === 0);
  }

  // solo 모드에서 사주 미입력 시 우회 차단
  const _sendUser = getUser();
  if (mode === 'solo' && !_sendUser?.birthYear && hist.length === 0 && !txt.includes('일생')) {
    addBubble('오늘 하루의 오행 기운을 정확히 처방하기 위해, 먼저 성함과 생년월일을 입력해 주세요. 🙏', 'ai');
    showFirstInputForm();
    return;
  }

  // 엽전 차감
  if (!checkAndDeductToken()) {
    // 엽전 부족 트래킹
    if (typeof Analytics !== 'undefined') {
      Analytics.trackToken('insufficient', getTokens());
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble bubble-ai';
    bubble.innerHTML = `
      <div style="margin-bottom: 12px">${TX[lang].noToken}</div>
      <button onclick="(function(){
        if (typeof Analytics !== 'undefined') Analytics.trackToken('charge_click');
        openMyPage();
        setTimeout(() => {
          const tokenSection = document.querySelector('.mypage-token-display');
          if (tokenSection) tokenSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      })()" style="
        width: 100%;
        padding: 12px;
        background: linear-gradient(135deg, var(--gold), #d4a574);
        color: var(--bg);
        border: none;
        border-radius: 10px;
        font-weight: 600;
        cursor: pointer;
        font-size: 0.95rem;
        transition: transform 0.2s;
      " onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
        💰 엽전 충전하러 가기
      </button>
    `;
    cw().appendChild(bubble);
    scrollToBottom();
    return;
  }

  // [Gemini 교대 규칙 준수] solo 모드 첫 질문에 사주 프로필을 결합하여 1개의 turn으로 전송
  let processedTxt = txt;
  if (mode === 'solo' && _sendUser?.birthYear && hist.length === 0) {
    processedTxt = `[사용자 사주 정보: ${buildUserProfile(_sendUser)}]\n\n질문: ${txt}`;
  }

  btn.disabled = true; inp.disabled = true;
  const isFirstTurn = hist.length === 0; // 첫 리딩만 신탁 연출(전체화면 오버레이 + 문장 리빌) 적용
  addBubble(txt, 'user'); inp.value = '';
  hist.push({role:'user', parts:[{text:processedTxt}]});
  const loader = isFirstTurn ? null : addLoader();
  const oracleReady = isFirstTurn ? openOracleOverlay({ apiPromise: callGemini(trimmedHist()), cost: mode === 'duo' ? 2 : 1 }) : null;

  try {
    const data = isFirstTurn ? await oracleReady : await callGemini(trimmedHist());
    const cand = data?.candidates?.[0];
    const raw  = cand?.content?.parts?.[0]?.text;
    if (!raw) throw { refund: true, reason: cand?.finishReason };
    hist.push({role:'model', parts:[{text:raw}]});
    const clean = raw.replace(/#[木火土金水]\s*/g,'').replace(/\*\*/g,'').trim();
    addBubble(clean, 'ai', { sentenceReveal: isFirstTurn });
    const tag = ['木','火','土','金','水'].find(k => raw.includes('#'+k));
    if (tag) addRxCard(tag);
    // solo 모드: 클리프행어 연출
    if (mode === 'solo' && data._ohaeng) {
      try { localStorage.setItem('myan_ohaeng', JSON.stringify(data._ohaeng)); } catch {}
      const revealMs = isFirstTurn
        ? _sentenceRevealMs(clean, getLang(), 0)
        : (clean.length <= 300 ? clean.length * 22 + 500 : 1800);
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
    if (loader) loader.remove();
    btn.disabled = false; inp.disabled = false;
    inp.focus(); cw().scrollTop = 99999;
  }
}

document.getElementById('send').addEventListener('click', send);
document.getElementById('inp').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
// 화면 안의 뒤로가기 버튼.
//
// 화면을 직접 바꾸지 않고 history.back() 만 부른다 — 실제 전환은 popstate 핸들러가 한다.
// 예전엔 여기서 화면만 바꾸고 히스토리는 그대로 뒀는데, 그러면 홈으로 돌아온 뒤에도
// 항목이 남아 있어서 OS 뒤로가기 첫 번째는 아무 일도 안 하고(팝만 되고 매칭되는 화면이 없음)
// 두 번째에 앱이 꺼졌다. 사용자 입장에선 "뒤로가기를 눌렀더니 앱이 죽었다"로 보인다.
// 이제 버튼과 OS 뒤로가기가 같은 경로를 타므로 둘이 어긋나지 않는다.
document.getElementById('backBtn').addEventListener('click', () => {
  // 홈에는 쌓아둔 항목이 없다. 여기서 history.back() 을 부르면 사이트 밖으로 나가버린다.
  if (history.state?.screen && history.state.screen !== 'home') {
    history.back();
    return;
  }

  // 히스토리가 없는 예외 상황(딥링크 진입 등)에서는 예전처럼 화면을 직접 되돌린다.
  switch (getCurrentScreen()) {
    case 'MYPAGE':      closeMyPage();       break;
    case 'SIGNUP':      goBackFromSignup();  break;
    case 'LOGIN':       goBackFromLogin();   break;
    case 'GUEST':
    case 'GUEST_RESULT': backToHome();       break;
    default:            goBack();
  }
});

/* ── 회원가입 ── */
// 환경변수 또는 wrangler.toml의 vars에서 가져옴
const SHEETS_EP  = window.ENV?.SHEETS_ENDPOINT || 'https://script.google.com/macros/s/AKfycbyJEDLW1Ohx9rQYrkSxFUNNl8LmRtUK-WkXg4sgtLBLfpPJcYfpXMJXQH9Ya2k36j3l/exec';
const GOOGLE_CID = window.ENV?.GOOGLE_CLIENT_ID || '806789036860-iu94f5ne93t2vh2mvfuqmi3mj95m8ick.apps.googleusercontent.com';

/* ── 네이티브 앱(WebView) 브릿지 ──
   myan-native/app/index.jsx 가 페이지 로드 전에 주입하는 값들과 짝을 이룬다.
     주입되는 것: window._isNativeApp, window.__nativeGoogleToken(idToken), window.__nativeGoogleError(msg)
     앱이 받는 메시지: 'GOOGLE_SIGNIN_REQUEST' | 'GOOGLE_SIGNOUT_REQUEST' | 'OPEN_EXTERNAL:<url>'
   안드로이드 WebView 에서는 구글이 웹 로그인(GIS)을 차단하므로 로그인은 네이티브 SDK 에 위임해야 한다. */
// 앱 여부는 앱이 직접 심어준 플래그만 보고 판단한다. ReactNativeWebView 객체 유무를 여기서 함께
// 따지면, 주입 순서가 어긋난 순간에 GIS 버튼으로 폴백해버리는데 그건 앱에서 어차피 막혀 있다.
const IS_NATIVE_APP = !!window._isNativeApp;

function _nativePost(msg) {
  try { window.ReactNativeWebView.postMessage(msg); return true; }
  catch (e) { console.warn('[native bridge] postMessage 실패:', e); return false; }
}

// 새 창으로 열어야 하는 외부 링크(공유·카카오 상담 등).
// 앱 안에서는 window.open 이 보이지 않는 WebView 만 만들고 끝나므로 네이티브에 넘겨 외부 브라우저로 연다.
function openExternal(url, target) {
  if (IS_NATIVE_APP && _nativePost('OPEN_EXTERNAL:' + url)) return;
  window.open(url, target || '_blank', 'noopener,noreferrer');
}

let _nativeSignInBusy = false;
let _nativeSignInTimer = null;
function _nativeGoogleSignIn() {
  if (_nativeSignInBusy) return;
  _nativeSignInBusy = true;
  // 구형 앱 빌드 등 응답이 영영 안 오는 경우에도 버튼이 영구히 잠기지 않도록 해제 타이머를 건다.
  _nativeSignInTimer = setTimeout(() => { _nativeSignInBusy = false; }, 90000);
  if (!_nativePost('GOOGLE_SIGNIN_REQUEST')) {
    _nativeSignInBusy = false;
    clearTimeout(_nativeSignInTimer);
    showToast(getT().googleSignInFail);
  }
}

// 앱에 현재 언어를 알려준다. 네이티브가 직접 띄우는 문구(뒤로가기 종료 안내 토스트)가
// 사용자가 고른 언어를 따르게 하려면 네이티브도 언어를 알아야 한다.
// setLang 은 locales.js 의 전역 함수라 여기서 감싼다(같은 전역 스코프의 클래식 스크립트).
if (IS_NATIVE_APP) {
  const _origSetLang = setLang;
  setLang = function(l) {
    _origSetLang(l);
    _nativePost('LANG:' + l);
  };
  _nativePost('LANG:' + getLang());   // 저장된 언어로 시작하는 경우를 위해 최초 1회
}

window.addEventListener('nativeGoogleSignIn', (ev) => {
  _nativeSignInBusy = false;
  clearTimeout(_nativeSignInTimer);
  const d = ev.detail || {};
  if (d.idToken) {
    // 네이티브가 준 것도 구글 ID 토큰이라 웹 GIS 응답과 형태가 같다 → 기존 경로 그대로 재사용
    handleGoogleCredential({ credential: d.idToken });
    return;
  }
  // 사용자가 계정 선택창을 닫은 것은 오류가 아니므로 조용히 넘어간다
  const msg = String(d.error || '');
  if (/cancel|SIGN_IN_CANCELLED|-5\b/i.test(msg)) return;
  console.warn('[native bridge] 구글 로그인 실패:', msg);
  showToast(getT().googleSignInFail);
});


let selGender = '';
let selGenderMp = '';

/* ── 엽전 시스템 (서버 기반) ── */
let _tokenCache = 0;
let _tokenCacheExpiry = 0;
const TOKEN_CACHE_TTL = 30000; // 30초

function getTokens() { return _tokenCache; }

// 클라이언트는 더 이상 엽전을 직접 차감하지 않음.
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
  _tokenCacheExpiry = 0; // 캐시 무효화 (엽전 변경됨)
  await refreshTokens();
}

async function refreshTokens() {
  // 캐시가 유효하면 재사용
  if (Date.now() < _tokenCacheExpiry && _tokenCache >= 0) {
    return _tokenCache;
  }

  if (!getGoogleIdToken()) {
    // 세션 토큰 만료. 실제 로그아웃과 구별:
    // myan_logged_in이 남아있으면 -> 만료된 것이므로 조용히 silent refresh 시도, 캐시 유지
    // myan_logged_in이 없으면 -> 실제 로그아웃 상태이므로 0으로 초기화
    if (isLoggedIn()) {
      _silentTokenRefresh();       // 새 ID 토큰 백그라운드 발급 시도
      updateAllTokenDisplays();    // 기존 캐시 값 그대로 표시 (0으로 안 만듦)
      return _tokenCache;
    }
    _tokenCache = 0;
    _tokenCacheExpiry = 0;
    updateAllTokenDisplays();
    return 0;
  }
  try {
    const res = await fetch(EP + 'user-tokens', { headers: authHeaders() });
    if (!res.ok) { updateAllTokenDisplays(); return _tokenCache; }
    const data = await res.json();
    _tokenCache = parseInt(data.tokens, 10) || 0;
    _tokenCacheExpiry = Date.now() + TOKEN_CACHE_TTL; // 30초 후 만료

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
  // Performance 모듈의 최적화된 업데이트 사용
  if (typeof Performance !== 'undefined' && Performance.scheduleTokenUpdate) {
    Performance.scheduleTokenUpdate(_tokenCache);
  } else {
    // 폴백: 기존 방식
    _updateTokenDisplaysLegacy();
  }
}

// 레거시 업데이트 함수 (Performance 모듈 로드 실패 시 폴백)
function _updateTokenDisplaysLegacy() {
  const t = _tokenCache;
  const count = document.getElementById('chatTokenCount');
  const chip  = document.getElementById('tokenChip');
  const num   = document.getElementById('mypageTokenNum');
  const tmNum = document.getElementById('tmBalanceNum');
  if (count) count.textContent = t;
  if (chip)  chip.classList.toggle('low', t > 0 && t <= 5);
  if (num)   num.textContent = t;
  if (tmNum) tmNum.textContent = t;
  // 엽전 0 안내 표시
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
const ADMIN_EMAIL = window.ENV?.ADMIN_EMAIL || 'riger7070@gmail.com';

/* ── Google ID Token 관리 ── */
let _googleIdToken = '';
let _googleIdTokenExp = 0;

// ── Silent Token Refresh ──
// Google ID 토큰은 1시간 유효. 만료 전 자동 재발급하여 엽전이 0이 되는 현상 방지.
let _silentRefreshTimer  = null;
let _silentRefreshActive = false;

function _scheduleTokenRefresh() {
  if (_silentRefreshTimer) clearTimeout(_silentRefreshTimer);
  if (!_googleIdTokenExp) return;
  // 만료 10분 전에 silent refresh 실행 (50분 후)
  const delay = _googleIdTokenExp - Date.now() - 10 * 60 * 1000;
  // 자체 세션 토큰(30일 등 장기)은 주기 갱신 불필요 + setTimeout 오버플로(>24.8일) 방지
  if (delay > 2 * 60 * 60 * 1000) return;
  if (delay <= 0) { _silentTokenRefresh(); return; }
  _silentRefreshTimer = setTimeout(_silentTokenRefresh, delay);
}

let _gisRetryCount = 0;
function _silentTokenRefresh() {
  // 명시적 로그아웃/비로그인 상태면 갱신하지 않음
  if (localStorage.getItem('myan_signed_out') === 'true') return;
  if (!isLoggedIn()) return;
  if (_silentRefreshActive) return;
  // 앱에서는 GIS 무음 갱신이 불가능하다. 정상 경로에선 30일 세션 토큰을 받아 이 타이머 자체가 해제되고,
  // 세션 교환이 실패해 여기까지 온 경우엔 401 → _reauthExpired 로 로그인 화면(네이티브 버튼)에서 복구한다.
  if (IS_NATIVE_APP) return;
  _silentRefreshActive = true;
  try {
    _ensureGisInit(); // GIS 초기화 보장
    // Google API 로드 체크 — 아직 안 떴으면 잠시 후 재시도 (async defer 로드 경쟁 대비)
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
      _silentRefreshActive = false;
      if (_gisRetryCount++ < 10) setTimeout(_silentTokenRefresh, 3000);
      return;
    }
    _gisRetryCount = 0;
    google.accounts.id.prompt(notification => {
      _silentRefreshActive = false;
      // 'skipped' / 'dismissed': 자동 갱신 불가 (사용자가 구글에서 로그아웃한 경우 등)
      // 이 경우 기존 캐시를 유지하고, 인증 요청이 401을 받으면 _reauthExpired로 재로그인 유도
    });
  } catch(e) {
    _silentRefreshActive = false;
  }
}

// 엽전/세션 만료로 401을 받았을 때 재로그인 유도 → 로그인 화면(구글 버튼)으로 안내.
// (FedCM 모드에선 isNotDisplayed/isSkippedMoment가 폐기되어 사용하지 않음)
let _reauthPrompting = false;
function _reauthExpired() {
  if (_reauthPrompting) return;
  _reauthPrompting = true;
  setTimeout(() => { _reauthPrompting = false; }, 8000);
  try { showToast('세션이 만료되었습니다. 다시 로그인해 주세요.'); } catch(e) {}
  try { closeAdminPanel(); } catch(e) {}
  try { showScreen('LOGIN'); } catch(e) {}
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

// 자체 세션 토큰 저장 (Google 토큰 대체, 30일 장기)
function setSessionToken(token, expSec) {
  _googleIdToken    = token;
  _googleIdTokenExp = expSec ? expSec * 1000 : 0;
  try {
    localStorage.setItem('myan_session', token);
    localStorage.removeItem('myan_id_token'); // 구 Google 토큰 캐시 제거
  } catch {}
  // 세션은 장기 → 주기 refresh 타이머 해제 (만료 시엔 401 → _reauthExpired로 재로그인)
  if (_silentRefreshTimer) { clearTimeout(_silentRefreshTimer); _silentRefreshTimer = null; }
}

// Google ID 토큰을 서버에서 자체 세션 토큰으로 교환 (로그인 직후 1회)
// 반환값: 서버 응답 data(세션 발급 성공 시 profile 포함) 또는 null(실패)
async function _exchangeSession(googleCredential) {
  try {
    const res = await fetch(EP + 'auth/login', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + googleCredential },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.session) { setSessionToken(data.session, data.exp); return data; }
    }
  } catch (e) {}
  // 폴백: 세션 발급 실패 시 Google 토큰을 그대로 사용 (서버가 둘 다 수용)
  return null;
}

// 생년월일 프로필을 서버에 저장 (기기 변경·스토리지 초기화 후에도 로그인 시 복원할 수 있도록)
function _syncProfileToServer(user) {
  const token = getGoogleIdToken();
  if (!token || !user) return;
  fetch(EP + 'api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      birthYear: user.birthYear || '', birthMonth: user.birthMonth || '',
      birthDay: user.birthDay || '', birthHour: user.birthHour || '',
      gender: user.gender || '', region: user.region || '',
    }),
  }).catch(() => {});
}

function getGoogleIdToken() {
  if (!_googleIdToken) _googleIdToken = localStorage.getItem('myan_session') || localStorage.getItem('myan_id_token') || '';
  if (!_googleIdToken) return '';
  if (_googleIdTokenExp && Date.now() > _googleIdTokenExp - 5*60*1000) {
    _googleIdToken = ''; _googleIdTokenExp = 0;
    localStorage.removeItem('myan_id_token');
    localStorage.removeItem('myan_session');
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
        _googleIdToken = ''; localStorage.removeItem('myan_id_token'); localStorage.removeItem('myan_session'); return '';
      }
      _scheduleTokenRefresh(); // 새로고침 후 복원된 엽전에도 타이머 예약
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

      // 결제 성공 트래킹
      if (typeof Analytics !== 'undefined') {
        Analytics.trackPayment('success', amount, result.tokensAdded);
      }

      alert('✦ 엽전이 충전되었습니다!');
    } else {
      // 결제 실패 트래킹
      if (typeof Analytics !== 'undefined') {
        Analytics.trackPayment('fail', amount, null, result.error?.message);
      }

      alert(`결제 검증 실패: ${result.error?.message || '고객센터(riger7070@naver.com)로 문의해 주세요.'}`);
    }
  } catch (e) {
    // 결제 에러 트래킹
    if (typeof Analytics !== 'undefined') {
      Analytics.trackPayment('fail', amount, null, e.message);
    }

    alert('결제 확인 중 오류가 발생했습니다. 고객센터(riger7070@naver.com)로 문의 바랍니다.');
  }
}

// ── 토스페이먼츠 직접 결제창 호출 ──
// 클라이언트 키는 worker.js가 index.html에 주입한다(window.ENV).
// 주입 실패 시 테스트 키로 조용히 넘어가면 정식 오픈 후 위험하다.
// 결제창은 정상적으로 뜨는데 실제 결제가 안 되거나, 서버의 라이브 시크릿과
// 짝이 맞지 않아 승인 단계에서 실패한다. 그래서 폴백 없이 명시적으로 막는다.
const TOSS_CLIENT_KEY = window.ENV?.TOSS_CLIENT_KEY || '';

// 실결제를 받을 수 있는 상태인가.
//
// 키가 test_ck_ 로 시작하면 결제창은 떠도 실제로 돈이 오가지 않는다. 그 상태에서
// 결제 버튼을 그대로 두면 사려는 사람이 오류만 보고 떠난다 — 그게 제일 나쁘다.
// 대신 토스 미니앱으로 안내한다(거기는 인앱결제라 PG 계약 없이 실결제가 된다).
//
// ⚠️ 키 앞자리로 판단하는 이유: 라이브 키(live_ck_)로 바꾸는 순간 이 함수가 저절로
//    true 가 되어 웹 결제가 되살아난다. 따로 켜 줄 스위치를 두면 그걸 잊는다.
function _webPayLive() {
  return /^live_ck_/.test(TOSS_CLIENT_KEY);
}

// 결제 시작 전 키가 있는지 확인. 없으면 결제창을 띄우지 않는다.
function _ensureTossKey() {
  if (TOSS_CLIENT_KEY) return true;
  showToast({
    ko: '결제 설정을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.',
    en: 'Could not load payment settings. Please refresh and try again.',
    zh: '无法加载支付设置，请刷新后重试。',
    ja: '決済設定を読み込めませんでした。更新して再度お試しください。',
  }[getLang()] || '결제 설정을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
  return false;
}

/**
 * 웹에서 실결제를 못 받는 동안 띄우는 안내.
 *
 * ⚠️ "이어서 결제하기" 라고 쓰지 않는다. 웹과 미니앱은 **계정도 엽전도 완전히 별개**다
 *    (worker.js 의 _LEDGERS, test/mini-isolation.test.mjs). 미니앱에서 충전하면
 *    웹 잔액은 그대로다. 이어진다고 말해 놓고 안 이어지면 그게 제일 나쁜 거짓말이다.
 *    그래서 "토스 앱에서 이용하세요" 로 쓰고, 별개라는 점을 그 자리에서 밝힌다.
 */
function _showMiniPayGuide() {
  const T = {
    ko: {
      title: '토스 앱에서 이용해 주세요',
      body: '웹 결제는 준비 중입니다. 지금은 토스 앱의 <b>오늘운빨</b>에서 엽전을 충전하고 모든 풀이를 보실 수 있습니다.',
      warn: '토스 앱의 오늘운빨은 <b>별개의 계정</b>입니다. 웹에서 쓰시던 엽전과 기록은 웹에 그대로 남아 있고, 토스 쪽에서 충전한 엽전은 토스에서 쓰입니다.',
      free: '웹에서는 <a href="/tti">오늘의 띠 순위</a>와 <a href="/calc">무료 계산기</a>를 가입 없이 보실 수 있습니다.',
      go: '토스 앱에서 열기', close: '닫기',
    },
    en: {
      title: 'Please use the Toss app',
      body: 'Web payments are not open yet. For now you can top up and read everything in <b>오늘운빨</b> inside the Toss app.',
      warn: 'That is a <b>separate account</b>. Your tokens and history here stay here; tokens bought in Toss are used in Toss.',
      free: 'On the web you can still open <a href="/tti">today\u2019s zodiac ranking</a> and the <a href="/calc">free calculators</a> without signing in.',
      go: 'Open in Toss', close: 'Close',
    },
    zh: {
      title: '请在 Toss 应用中使用',
      body: '网页支付尚未开放。目前可在 Toss 应用的 <b>오늘운빨</b> 中充值并查看全部解读。',
      warn: '那是<b>独立的账户</b>。您在网页的代币和记录仍保留在网页，在 Toss 充值的代币在 Toss 使用。',
      free: '网页上仍可免费查看<a href="/tti">今日生肖运势排名</a>和<a href="/calc">免费计算器</a>。',
      go: '在 Toss 中打开', close: '关闭',
    },
    ja: {
      title: 'Toss アプリでご利用ください',
      body: 'ウェブ決済は準備中です。今は Toss アプリの <b>오늘운빨</b> でトークンを購入し、すべての鑑定をご覧いただけます。',
      warn: 'そちらは<b>別のアカウント</b>です。ウェブのトークンと履歴はウェブに残り、Toss で購入したトークンは Toss で使われます。',
      free: 'ウェブでは<a href="/tti">今日の干支ランキング</a>と<a href="/calc">無料計算機</a>をログインなしでご覧いただけます。',
      go: 'Toss で開く', close: '閉じる',
    },
  };
  const t = T[getLang()] || T.ko;

  document.getElementById('mini-pay-guide')?.remove();
  const el = document.createElement('div');
  el.id = 'mini-pay-guide';
  el.className = 'modal-overlay';
  el.innerHTML = `
    <div class="modal-box mpg-box">
      <div class="modal-title">${t.title}</div>
      <p class="mpg-body">${t.body}</p>
      <div class="mpg-warn">${t.warn}</div>
      <p class="mpg-free">${t.free}</p>
      <a class="mpg-go" href="${MINI_APP_LINK}">${t.go}</a>
      <button class="mpg-close">${t.close}</button>
    </div>`;
  // 안내를 본 사람을 센다. 이것과 /app 도착 수를 견주면
  // 몇이 도중에 떠났는지가 보이고, 그게 웹에 PG 를 붙일 가치가 있는가에 대한 답이 된다.
  try { navigator.sendBeacon('/api/hit?ref=web-charge&p=guide'); } catch (e) {}
  document.body.appendChild(el);
  // .modal-overlay 는 기본이 display:none 이다(다른 모달도 JS 로 켠다).
  // 붙이기만 하고 켜지 않으면 화면에 아무것도 안 보인다 — 실제로 그랬다.
  el.style.display = 'flex';

  const close = () => el.remove();
  el.querySelector('.mpg-close').onclick = close;
  el.onclick = (e) => { if (e.target === el) close(); };
}

// 토스 미니앱으로 가는 주소. worker.js 의 MINI_SHARE_LINK 와 같은 값이다 —
// 딥링크가 아니라 토스가 만들어 준 공유 주소라 PC 에서도 열린다.
const MINI_APP_LINK = 'https://myan.riger7070.workers.dev/app?ref=web-charge';

async function buyToken(pkg) {
  const user = getUser();
  if (!user || !isLoggedIn()) { showLogin(); return; }

  // 실결제를 받을 수 없는 동안은 결제창을 띄우지 않고 미니앱으로 안내한다.
  if (!_webPayLive()) { _showMiniPayGuide(); return; }

  const pkgs = {
    'S': { name: '마이안 엽전 30개',  amount: 4900, tokens: 30  },
    'M': { name: '마이안 엽전 100개', amount: 12900, tokens: 100 },
    'L': { name: '마이안 엽전 300개', amount: 29900, tokens: 300 }
  };
  const selected = pkgs[pkg];
  if (!selected) return;

  // 결제 시작 트래킹
  if (typeof Analytics !== 'undefined') {
    Analytics.trackPayment('start', selected.amount, selected.tokens);
  }

  if (!_ensureTossKey()) return;

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

// ── 멤버십 구독 (토스 빌링/정기결제) ──
const SUB_PLANS_FE = {
  basic:   { name: '마이안 베이직 멤버십',   amount: 9900,  tokens: 120 },
  premium: { name: '마이안 프리미엄 멤버십', amount: 19900, tokens: 280 },
};
let _subState = null;

// 구독 신청 — 빌링 인증창 호출 (성공 시 ?subAuth=1&authKey=&customerKey= 로 복귀)
async function subscribeMembership(plan) {
  const user = getUser();
  if (!user || !isLoggedIn()) { showLogin(); return; }
  const info = SUB_PLANS_FE[plan];
  if (!info) return;

  // 충전과 같다 — 실결제를 못 받는 동안은 결제창을 띄우지 않는다.
  if (!_webPayLive()) { _showMiniPayGuide(); return; }
  if (typeof Analytics !== 'undefined') Analytics.trackPayment('start', info.amount, info.tokens);

  if (!_ensureTossKey()) return;

  sessionStorage.setItem('myan_pending_sub_plan', plan);
  try {
    const tossPayments = TossPayments(TOSS_CLIENT_KEY);
    const payment = tossPayments.payment({ customerKey: user.email });
    await payment.requestBillingAuth({
      method: 'CARD',
      successUrl: 'https://myan.riger7070.workers.dev/?subAuth=1',
      failUrl:    'https://myan.riger7070.workers.dev/?payFailed=1',
      customerEmail: user.email,
      customerName:  user.name || '고객',
    });
    // requestBillingAuth는 항상 페이지 이동 — 아래 코드는 실행되지 않음
  } catch (err) {
    if (err?.code === 'USER_CANCEL') return;
    console.error('[subscribeMembership]', err);
    alert('구독 신청 중 오류가 발생했습니다. 고객센터(riger7070@naver.com)로 문의 바랍니다.');
  }
}

// 빌링 인증 복귀 후 서버에 구독 확정 요청
async function _confirmSubscription({ authKey, customerKey, plan }) {
  try {
    const res = await fetch(`${EP}api/subscription/confirm`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ authKey, customerKey, plan })
    });
    const result = await res.json();
    if (result.success) {
      await refreshTokens();
      await refreshSubscription();
      if (typeof Analytics !== 'undefined') Analytics.trackPayment('success', SUB_PLANS_FE[plan]?.amount, result.tokens);
      const t = getT();
      alert(t.subStartedMsg || '✦ 구독이 시작되었습니다! 매월 엽전이 자동 지급됩니다.');
    } else {
      if (typeof Analytics !== 'undefined') Analytics.trackPayment('fail', SUB_PLANS_FE[plan]?.amount, null, result.error?.message);
      alert(`${(getT().subFailMsg || '구독 처리 실패')}: ${result.error?.message || '고객센터(riger7070@naver.com)로 문의해 주세요.'}`);
    }
  } catch (e) {
    alert('구독 확인 중 오류가 발생했습니다. 고객센터(riger7070@naver.com)로 문의 바랍니다.');
  }
}

// 현재 구독 상태 조회 + UI 갱신
async function refreshSubscription() {
  if (!getGoogleIdToken()) { _subState = null; _renderSubUI(); return; }
  try {
    const res = await fetch(`${EP}api/subscription`, { headers: authHeaders() });
    _subState = await res.json();
  } catch { _subState = null; }
  _renderSubUI();
}

// 구독 영역 렌더 (활성: 상태 박스 / 미구독: 상품 카드)
function _renderSubUI() {
  const box   = document.getElementById('sub-active-box');
  const plans = document.getElementById('sub-plans');
  if (!box || !plans) return;
  const t = getT();
  if (_subState && _subState.active) {
    const planName = (t.subPlanNames && t.subPlanNames[_subState.plan]) || _subState.plan;
    const date = _subState.currentPeriodEnd
      ? new Date(_subState.currentPeriodEnd * 1000).toLocaleDateString(getLang() === 'ko' ? 'ko-KR' : getLang())
      : '';
    document.getElementById('subActivePlan').textContent =
      `✦ ${planName} (${(t.subTokensPerMonth || '매월 {n} 엽전').replace('{n}', _subState.monthlyTokens)})`;
    document.getElementById('subActiveNext').textContent =
      (t.subNextBilling || '다음 결제일: {date}').replace('{date}', date);
    document.getElementById('subCancelBtn').textContent = t.subCancelBtn || '구독 해지';
    box.style.display = 'flex';
    plans.style.display = 'none';
  } else {
    box.style.display = 'none';
    plans.style.display = '';
  }
}

// 구독 해지
async function cancelSubscription() {
  const t = getT();
  if (!confirm(t.subCancelConfirm || '정말 구독을 해지하시겠어요? 다음 결제일부터 자동 결제가 중단됩니다.')) return;
  try {
    const res = await fetch(`${EP}api/subscription/cancel`, { method: 'POST', headers: authHeaders() });
    const r = await res.json();
    if (r.success) {
      showToast(t.subCanceledToast || '구독이 해지되었습니다.');
      await refreshSubscription();
    } else {
      showToast(r.error?.message || (t.subFailMsg || '해지에 실패했습니다.'));
    }
  } catch {
    showToast(t.subFailMsg || '해지 중 오류가 발생했습니다.');
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
  ['pending','approved','all','grant','users','usage'].forEach(t => {
    document.getElementById('adminTab' + t.charAt(0).toUpperCase() + t.slice(1))
      ?.classList.toggle('on', t === tab);
  });
  const isGrant = tab === 'grant';
  const isUsers = tab === 'users';
  const isUsage = tab === 'usage';
  const isList  = !isGrant && !isUsers && !isUsage;
  document.getElementById('adminPaymentList').style.display = isList ? '' : 'none';
  document.getElementById('adminGrantPanel').style.display  = isGrant ? 'block' : 'none';
  document.getElementById('adminUsersPanel').style.display  = isUsers ? 'block' : 'none';
  const usageEl = document.getElementById('adminUsagePanel');
  if (usageEl) usageEl.style.display = isUsage ? 'block' : 'none';
  if (isList) _renderAdminList();
  if (isUsers) renderAdminUsers();
  if (isUsage) renderAdminUsage();
}

// HTML 이스케이프 (관리자 화면에 사용자 입력 표시 시 XSS 방지)
function _escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function renderAdminUsers() {
  const el = document.getElementById('adminUsersPanel');
  if (!el) return;
  el.innerHTML = '<div class="admin-empty">불러오는 중...</div>';
  try {
    const res = await fetch(EP + 'admin/users', { headers: adminAuthHeaders() });
    if (res.status === 401) {
      el.innerHTML = '<div class="admin-empty">세션이 만료되었습니다.<br><button onclick="_reauthExpired()" style="margin-top:12px;background:rgba(201,169,110,0.2);border:1px solid rgba(201,169,110,0.4);border-radius:8px;color:#c9a96e;padding:8px 16px;cursor:pointer">🔄 다시 로그인</button></div>';
      _reauthExpired();
      return;
    }
    if (!res.ok) throw new Error('auth');
    const data = await res.json();
    const s = data.stats || {};
    const fmt = (ts) => ts
      ? new Date(ts * 1000).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '-';

    const statCards = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(82px,1fr));gap:8px;margin-bottom:16px">
        ${[['전체 회원', s.totalUsers], ['오늘 접속', s.dau], ['7일 활성', s.wau], ['오늘 가입', s.newToday], ['누적 로그인', s.totalLogins]]
          .map(([label, val]) => `<div style="background:rgba(201,169,110,0.06);border:1px solid rgba(201,169,110,0.15);border-radius:8px;padding:10px 6px;text-align:center"><div style="font-size:1.3rem;font-weight:700;color:#c9a96e">${val ?? 0}</div><div style="font-size:0.66rem;color:#999;margin-top:2px">${label}</div></div>`).join('')}
      </div>`;

    const users = data.users || [];
    const userRows = users.length ? users.map(u => `
      <div style="padding:10px 12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div style="min-width:0">
            <div style="font-weight:600;font-size:0.85rem;color:#e8dcc8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.name ? _escHtml(u.name) : '(이름 없음)'}</div>
            <div style="font-size:0.72rem;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escHtml(u.email)}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:0.72rem;color:#c9a96e">${u.login_count ?? 0}회</div>
            <div style="font-size:0.68rem;color:#777">${fmt(u.last_login_at)}</div>
          </div>
        </div>
      </div>`).join('') : '<div class="admin-empty">회원이 없습니다</div>';

    const logins = data.logins || [];
    const loginRows = logins.length ? logins.map(l => `
      <div style="padding:8px 12px;background:rgba(255,255,255,0.02);border-radius:6px;margin-bottom:4px;font-size:0.72rem">
        <div style="display:flex;justify-content:space-between;gap:8px">
          <span style="color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escHtml(l.email)}</span>
          <span style="color:#777;flex-shrink:0">${fmt(l.at)}</span>
        </div>
        <div style="color:#666;margin-top:2px">${l.country ? _escHtml(l.country) + ' · ' : ''}${_escHtml(l.ip || '-')}</div>
      </div>`).join('') : '<div class="admin-empty">접속 기록이 없습니다</div>';

    el.innerHTML = statCards
      + '<div style="font-size:0.75rem;color:#999;margin:6px 0 8px;letter-spacing:1px">회원 목록 (최근 접속순)</div>'
      + userRows
      + '<div style="font-size:0.75rem;color:#999;margin:18px 0 8px;letter-spacing:1px">최근 로그인 기록</div>'
      + loginRows;
  } catch (e) {
    el.innerHTML = '<div class="admin-empty">불러올 수 없습니다 (권한 확인)</div>';
  }
}

// pkg 값 → 사람이 읽을 라벨. 백엔드 각 핸들러의 pkg 문자열과 키를 맞출 것.
const ADMIN_PKG_LABELS = {
  gemini_use:        '☯ 메인 리딩',
  detail_use:        '🔍 상세 풀이',
  tarot_use:         '🔮 타로',
  zodiac_use:        '🐉 띠·별자리',
  lucky_use:         '🍀 럭키 아이템',
  typecompat_use:    '🔯 오행 유형·궁합',
  fortune_use:       '✨ 오늘의 운세 모음',
  iching_use:        '🀄 주역',
  numerology_use:    '🔢 수비학',
  tojeong_use:       '🧧 토정비결풍',
  photo_reading_use: '🖐️ 관상·손금',
  dream_use:         '🌙 꿈해몽',
  lotto_use:         '🎱 로또번호',
  rune_use:          'ᚱ 룬 문자',
};
const _pkgLabel = (pkg) => ADMIN_PKG_LABELS[pkg] || _escHtml(String(pkg || '').replace(/_(use|refund)$/, ''));

let _adminUsageDays = 30;
function setAdminUsageDays(d) { _adminUsageDays = d; renderAdminUsage(); }

async function renderAdminUsage() {
  const el = document.getElementById('adminUsagePanel');
  if (!el) return;
  el.innerHTML = '<div class="admin-empty">불러오는 중...</div>';
  try {
    const res = await fetch(EP + `admin/usage?days=${_adminUsageDays}`, { headers: adminAuthHeaders() });
    if (res.status === 401) {
      el.innerHTML = '<div class="admin-empty">세션이 만료되었습니다.<br><button onclick="_reauthExpired()" style="margin-top:12px;background:rgba(201,169,110,0.2);border:1px solid rgba(201,169,110,0.4);border-radius:8px;color:#c9a96e;padding:8px 16px;cursor:pointer">🔄 다시 로그인</button></div>';
      _reauthExpired();
      return;
    }
    if (!res.ok) throw new Error('auth');
    const data = await res.json();
    const usage = data.usage || [];
    const tot   = data.totals || {};

    const periodBtns = [[7, '7일'], [30, '30일'], [0, '전체']].map(([d, label]) =>
      `<button onclick="setAdminUsageDays(${d})" style="flex:1;padding:7px;border-radius:7px;cursor:pointer;font-size:0.75rem;border:1px solid ${_adminUsageDays === d ? 'rgba(201,169,110,0.5)' : 'rgba(255,255,255,0.1)'};background:${_adminUsageDays === d ? 'rgba(201,169,110,0.18)' : 'transparent'};color:${_adminUsageDays === d ? '#c9a96e' : '#888'}">${label}</button>`
    ).join('');

    const statCards = `
      <div style="display:flex;gap:6px;margin-bottom:12px">${periodBtns}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">
        ${[['총 이용', tot.uses], ['소모 엽전', tot.spent], ['이용자', tot.users]]
          .map(([label, val]) => `<div style="background:rgba(201,169,110,0.06);border:1px solid rgba(201,169,110,0.15);border-radius:8px;padding:10px 6px;text-align:center"><div style="font-size:1.3rem;font-weight:700;color:#c9a96e">${val ?? 0}</div><div style="font-size:0.66rem;color:#999;margin-top:2px">${label}</div></div>`).join('')}
      </div>`;

    // 사용 횟수 기준 막대 — 가장 많이 쓰인 기능을 100%로 잡아 상대 비교
    const maxUses = usage.reduce((m, r) => Math.max(m, r.uses || 0), 0) || 1;
    const rows = usage.length ? usage.map(r => {
      const pct = Math.max(2, Math.round((r.uses / maxUses) * 100));
      return `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px">
          <span style="font-size:0.8rem;color:#e8dcc8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_pkgLabel(r.pkg)}</span>
          <span style="font-size:0.72rem;color:#c9a96e;flex-shrink:0">${r.uses}회 · ${r.users}명 · ${r.spent}엽전</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,rgba(201,169,110,0.55),#c9a96e);border-radius:3px"></div>
        </div>
      </div>`;
    }).join('') : '<div class="admin-empty">해당 기간에 사용 기록이 없습니다</div>';

    // 환불(=AI 응답 실패) 건수. 특정 기능만 많으면 그 기능에 문제가 있다는 신호.
    const refunds = data.refunds || [];
    const refundRows = refunds.length ? refunds.map(r => `
      <div style="display:flex;justify-content:space-between;padding:7px 10px;background:rgba(224,90,74,0.06);border-radius:6px;margin-bottom:4px;font-size:0.75rem">
        <span style="color:#ddb0a8">${_pkgLabel(r.pkg)}</span>
        <span style="color:#e08a7a;flex-shrink:0">${r.cnt}건</span>
      </div>`).join('') : '<div style="font-size:0.75rem;color:#666;padding:6px 2px">실패 없음 👍</div>';

    el.innerHTML = statCards
      + '<div style="font-size:0.75rem;color:#999;margin:6px 0 10px;letter-spacing:1px">콘텐츠별 이용 (많은 순)</div>'
      + rows
      + '<div style="font-size:0.75rem;color:#999;margin:18px 0 8px;letter-spacing:1px">AI 실패·환불</div>'
      + refundRows;
  } catch (e) {
    el.innerHTML = '<div class="admin-empty">불러올 수 없습니다 (권한 확인)</div>';
  }
}

async function adminGrantTokens() {
  const email  = document.getElementById('adminGrantEmail').value.trim();
  const tokens = parseInt(document.getElementById('adminGrantTokens').value, 10);
  const note   = document.getElementById('adminGrantNote').value.trim() || '관리자 지급';
  const msgEl  = document.getElementById('adminGrantMsg');

  if (!email || !tokens || tokens <= 0) {
    msgEl.style.color = '#e05a4a';
    msgEl.textContent = '이메일과 엽전 수를 입력해주세요.';
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
    msgEl.textContent = `✓ ${email} 님께 ${tokens}엽전 지급 완료!`;
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
    if (res.status === 401) {
      listEl.innerHTML = '<div class="admin-empty">세션이 만료되었습니다.<br><button onclick="_reauthExpired()" style="margin-top:12px;background:rgba(201,169,110,0.2);border:1px solid rgba(201,169,110,0.4);border-radius:8px;color:#c9a96e;padding:8px 16px;cursor:pointer">🔄 다시 로그인</button></div>';
      _reauthExpired();
      return;
    }
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

  const PKG_NAME = { small:'소 (엽전 30개)', medium:'중 (엽전 100개)', large:'대 (엽전 300개)' };

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
  showScreen('SIGNUP');
  renderSignup();
  if (IS_NATIVE_APP) { _renderNativeGoogleBtn('googleBtnEl', getT().googleSignUp); return; }
  // 구글 버튼 초기화 (스크립트 로드 대기)
  const tryInit = (attempts) => {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id && GOOGLE_CID) {
      initGoogleSignin();
    } else if (!GOOGLE_CID) {
      document.getElementById('googleBtnWrap').style.display = 'none';
    } else if (attempts > 0) {
      setTimeout(() => tryInit(attempts - 1), 300);
    } else {
      // 타임아웃 후에도 로드 안 됨 - 폴백 표시
      const wrap = document.getElementById('googleBtnEl');
      if (wrap) _renderGoogleFallbackBtn(wrap);
    }
  };
  tryInit(15); // 더 많은 재시도 (모바일 느린 네트워크 대응)
}

/* ── 구글 로그인 ── */
let _gisInited = false;
function _ensureGisInit() {
  if (_gisInited) return;
  if (IS_NATIVE_APP) return; // 앱에서는 네이티브 SDK 로 로그인한다
  // Google API 로드 체크
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
    console.warn('Google Identity Services not available');
    return;
  }
  const wasSignedOut = localStorage.getItem('myan_signed_out') === 'true';
  try {
    google.accounts.id.initialize({
      client_id: GOOGLE_CID,
      callback: handleGoogleCredential,
      auto_select: !wasSignedOut, // 명시적 로그아웃 후엔 자동 선택 차단
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: true, // 브라우저 네이티브 FedCM 사용 → 팝업/postMessage 제거(COOP 경고 해소)
    });
    _gisInited = true;
  } catch(e) {
    console.error('Failed to initialize Google Identity Services:', e);
  }
}

// 자동 로그인: 로그인/로그아웃 상태가 애매한 첫 진입 시점에 사용자가 아무것도 클릭하지 않아도
// 브라우저에 활성 구글 세션이 남아있으면 조용히 로그인시킨다(Google One Tap silent sign-in).
// 이미 로그인돼 있거나(myan_logged_in) 명시적으로 로그아웃한 경우(myan_signed_out)는 시도하지 않음.
function _tryAutoLogin(attempts) {
  if (isLoggedIn()) return;
  if (localStorage.getItem('myan_signed_out') === 'true') return;
  if (!GOOGLE_CID) return;
  if (IS_NATIVE_APP) return; // One Tap 은 WebView 에서 동작하지 않음 — 사용자가 버튼을 누르면 네이티브로 간다
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
    if (attempts > 0) setTimeout(() => _tryAutoLogin(attempts - 1), 300);
    return;
  }
  _ensureGisInit();
  try { google.accounts.id.prompt(); } catch (e) {}
}

function initGoogleSignin() {
  const wrap = document.getElementById('googleBtnEl');
  if (!wrap) return;
  wrap.innerHTML = '';
  _ensureGisInit();
  const localeMap = { ko:'ko', en:'en', zh:'zh-CN', ja:'ja' };

  const parentW = wrap.parentElement?.getBoundingClientRect().width || window.innerWidth - 64;
  const btnW = Math.min(Math.max(parentW, 280), 400);
  wrap.style.width = btnW + 'px';

  requestAnimationFrame(() => {
    setTimeout(() => {
      try {
        google.accounts.id.renderButton(wrap, {
          type: 'standard', theme: 'filled_black', size: 'large',
          text: 'signup_with', shape: 'rectangular',
          width: btnW, locale: localeMap[lang] || 'ko',
        });
        setTimeout(() => {
          if (!wrap.querySelector('iframe') && !wrap.querySelector('div[role]')) {
            _renderGoogleFallbackBtn(wrap);
          }
        }, 800);
      } catch(e) {
        _renderGoogleFallbackBtn(wrap);
      }
    }, 150);
  });
}

async function handleGoogleCredential(response) {
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

    // Google 토큰 → 자체 세션 토큰 교환 (로그인 기록 + 30일 세션 발급)
    // 성공 시 setSessionToken이 myan_session으로 교체 → 이후 요청은 로컬 검증
    // 서버에 저장된 생년월일 프로필이 있으면(기기 변경·스토리지 초기화로 로컬이 비어있는 경우) 복원
    const sessionData = await _exchangeSession(response.credential);
    if (sessionData?.profile) {
      const sp = sessionData.profile;
      let restored = false;
      ['birthYear', 'birthMonth', 'birthDay', 'birthHour', 'gender', 'region'].forEach(k => {
        if (!profile[k] && sp[k]) { profile[k] = sp[k]; restored = true; }
      });
      if (restored) localStorage.setItem('myan_user', JSON.stringify(profile));
    }

    // 유저 버튼 업데이트
    updateUserBtn(profile);
    refreshTokens();  // 서버 엽전 잔액 동기화

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
      _enterMode(m, profile); // 로그인 전 고른 모드로 복귀(대화 복원 기능은 없음)
    } else if (!profile.birthYear && !profile.profileSkipped) {
      // 신규 가입(생년월일 미입력) → 프로필 입력 단계로 이동
      ['screen-chat', 'screen-mypage'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      showScreen('SIGNUP', true);
      renderSignup();
    } else {
      // 어느 화면도 남아있지 않도록 전부 정리 후 홈 표시
      ['screen-chat', 'screen-signup', 'screen-mypage'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      document.getElementById('screen-mode').style.display = '';
    }

    // 로그인 완료 후 대기 중인 프로모 코드 처리
    setTimeout(() => {
      if (typeof _processPendingPromo === 'function') _processPendingPromo();
    }, 800);

    // 토스 결제 후 리다이렉트 시 로그인이 늦은 경우 → pending 결제 확인
    const _pendingToss = sessionStorage.getItem('myan_pending_toss_payment');
    if (_pendingToss) {
      sessionStorage.removeItem('myan_pending_toss_payment');
      try {
        const _td = JSON.parse(_pendingToss);
        setTimeout(() => _confirmTossPayment(_td), 600);
      } catch {}
    }

    // 구독 빌링 인증 후 로그인이 늦은 경우 → pending 구독 확인
    const _pendingSub = sessionStorage.getItem('myan_pending_sub_confirm');
    if (_pendingSub) {
      sessionStorage.removeItem('myan_pending_sub_confirm');
      try {
        const _sd = JSON.parse(_pendingSub);
        setTimeout(() => _confirmSubscription(_sd), 600);
      } catch {}
    }
  } catch(e) {
    console.error('Google 자격증명 파싱 오류:', e);
  }
}

function goBackFromSignup() {
  showScreen('MODE', true);
  const formWrap = document.getElementById('signup-form-wrap');
  const successWrap = document.getElementById('signup-success');
  if (formWrap) formWrap.style.display = '';
  if (successWrap) successWrap.style.display = 'none';
}

function buildSignupDropdowns() {
  const monthSelect = document.getElementById('fMonth');
  if (!monthSelect) return;

  // 언어 변경에 대응하기 위해 매번 현재 언어로 재구성
  const mSuf = ({ko:'월', en:'', zh:'月', ja:'月'})[lang] ?? '월';
  const prev = monthSelect.value;
  monthSelect.innerHTML = '';
  for (let i = 1; i <= 12; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = i + mSuf;
    monthSelect.appendChild(option);
  }
  if (prev) monthSelect.value = prev;
}

function renderSignup() {
  const s = TX[lang];
  buildSignupDropdowns();
  document.getElementById('signupLinkText').textContent  = s.sgLink;
  document.getElementById('lblYear').textContent         = s.sgYear;
  document.getElementById('lblMonth').textContent        = s.sgMonth;
  document.getElementById('lblDay').textContent          = s.sgDay;
  document.getElementById('submitBtn').textContent       = s.sgPfSave;
  document.getElementById('profileSkipBtn').textContent  = s.sgPfSkip;
  document.getElementById('signupNotice').textContent    = s.sgNotice;
  document.getElementById('successTitle').textContent    = s.sgSuccTitle;
  document.getElementById('successDesc').textContent     = s.sgSuccDesc;
  document.getElementById('successBackBtn').textContent  = s.sgBack;

  // Google 로그인 완료 + 생년월일 미입력 → 프로필 입력 단계 / 그 외 → Google 가입 버튼
  let user = null;
  try { user = JSON.parse(localStorage.getItem('myan_user') || 'null'); } catch {}
  const profileMode = isLoggedIn() && user && user.email && !user.birthYear;
  document.getElementById('profile-step').style.display  = profileMode ? '' : 'none';
  document.getElementById('googleBtnWrap').style.display = profileMode ? 'none' : '';
  document.getElementById('signupHeadline').textContent  = profileMode ? s.sgPfHeadline : s.sgHeadline;
  document.getElementById('signupSub').textContent       = profileMode ? s.sgPfSub : s.sgSub;
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

// Google 로그인 후 생년월일 입력 단계 (가입 자체는 Google 로그인으로만 가능)
async function submitProfile() {
  const s    = TX[lang];
  const year = document.getElementById('fYear').value.trim();
  const mon  = document.getElementById('fMonth').value;
  const day  = document.getElementById('fDay').value.trim();

  const yearNum = parseInt(year, 10);
  const dayNum  = parseInt(day, 10);
  if (!year || !mon || !day || yearNum < 1900 || yearNum > new Date().getFullYear() || dayNum < 1 || dayNum > 31) {
    showSignupError(s.sgPfErrBirth); return;
  }

  let user = {};
  try { user = JSON.parse(localStorage.getItem('myan_user') || '{}'); } catch {}
  user.birthYear  = year;
  user.birthMonth = mon;
  user.birthDay   = day;
  localStorage.setItem('myan_user', JSON.stringify(user));
  _syncProfileToServer(user);

  // Sheets에 프로필 완성 기록 (백그라운드, 실패해도 무시)
  if (SHEETS_EP) {
    fetch(SHEETS_EP, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...user, timestamp: new Date().toISOString(), lang, source: 'profile_complete' })
    }).catch(() => {});
  }

  document.getElementById('signup-form-wrap').style.display = 'none';
  document.getElementById('signup-success').style.display   = 'flex';
}

function skipProfile() {
  // 다음 로그인 때 다시 묻지 않도록 기록
  let user = {};
  try { user = JSON.parse(localStorage.getItem('myan_user') || '{}'); } catch {}
  user.profileSkipped = true;
  localStorage.setItem('myan_user', JSON.stringify(user));
  goToApp();
}

/* ── 마이페이지 ── */
function updateUserBtn(user) {
  const btn = document.getElementById('userBtn');
  if (!btn) return; // 엘리먼트가 없으면 안전하게 리턴 (크래시 방지)
  if (!user) { btn.style.display = 'none'; return; }
  btn.textContent = TX[lang].mpLink || '마이페이지';
  btn.style.display = 'flex';
}

// ── Change 1: 무료 엽전 배너 표시 (비로그인 시에만) ──
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

  showScreen('MYPAGE');
  const _ub = document.getElementById('userBtn');
  if (_ub) _ub.style.display = 'none';
  renderMyPage();
}

function closeMyPage() {
  showScreen('MODE', true);

  // 로그인 상태에 맞게 userBtn / signupLinkBtn 복원
  const u = getUser();
  const _userBtn = document.getElementById('userBtn');
  const signupBtn = document.getElementById('signupLinkBtn');

  if (u && isLoggedIn()) {
    updateUserBtn(u);
    if (signupBtn) signupBtn.style.display = 'none';
  } else {
    if (_userBtn) _userBtn.style.display = 'none';
    if (signupBtn) signupBtn.style.display = u ? 'none' : '';
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
  // 알림 버튼 상태: Web Push 구독 여부로 결정
  const notifBtn = document.getElementById('notifToggleBtn');
  if (notifBtn && 'serviceWorker' in navigator && 'PushManager' in window) {
    navigator.serviceWorker.ready.then(sw => sw.pushManager.getSubscription()).then(sub => {
      const on = !!sub;
      const t2 = getT();
      notifBtn.classList.toggle('active', on);
      const spans = notifBtn.querySelectorAll('span');
      if (spans[0]) spans[0].textContent = on ? '🔕' : '🔔';
      if (spans[1]) spans[1].textContent = on ? (t2.notifOff2||'알림 끄기') : (t2.notifOn||'알림 켜기');
    }).catch(()=>{});
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

  // ── 엽전 섹션 ──
  document.getElementById('tkSectionLbl').textContent      = t.tkSection;
  document.getElementById('mypageTokenUnitLbl').textContent = t.tkUnit;
  document.getElementById('mypageTokenNum').textContent    = getTokens();

  // 오행 분포 게이지 — AI 정밀 분석 데이터 우선, 없으면 JS 계산 값 표시
  const _savedOhaeng = (() => {
    try { const s = localStorage.getItem('myan_ohaeng'); return s ? JSON.parse(s) : null; } catch { return null; }
  })();
  if (_savedOhaeng) _renderSajuGaugeFromGemini(_savedOhaeng);
  else _renderSajuGauge(user);

  // ── 새 engagement 기능 ──
  fetchStreak();
  renderOhaengHeatmap();
  renderReferralSection();
  renderTokenHistory();

  // ── 알림 설정 버튼 이벤트 리스너 ──
  const notifSettingsBtn = document.getElementById('notifSettingsBtn');
  if (notifSettingsBtn) {
    // 기존 리스너 제거 후 새로 추가 (중복 방지)
    notifSettingsBtn.replaceWith(notifSettingsBtn.cloneNode(true));
    const newBtn = document.getElementById('notifSettingsBtn');
    newBtn.addEventListener('click', function() {
      if (typeof Notifications !== 'undefined' && typeof Notifications.showNotificationSettingsModal === 'function') {
        Notifications.showNotificationSettingsModal();
      } else {
        alert('알림 시간 설정 기능을 불러오는 중입니다.\n잠시 후 다시 시도해주세요.');
        console.error('Notifications module not loaded:', typeof Notifications);
      }
    });
  }
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
  _syncProfileToServer(updated);

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
  localStorage.removeItem('myan_session');
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
  if (IS_NATIVE_APP) _nativePost('GOOGLE_SIGNOUT_REQUEST'); // 네이티브 SDK 세션도 함께 끊기
  // 재초기화 불필요: disableAutoSelect가 세션 내 자동선택을 차단하고,
  // 다음 페이지 로드에선 myan_signed_out 플래그로 auto_select:false 초기화됨
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
  document.getElementById('screen-mode').style.display = '';
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
    'myan_logged_in', 'myan_user', 'myan_id_token', 'myan_session',
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
  if (IS_NATIVE_APP) _nativePost('GOOGLE_SIGNOUT_REQUEST'); // 네이티브 SDK 세션도 함께 끊기
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
  document.getElementById('screen-mode').style.display = '';
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

// 충전 화면에 "이 엽전으로 뭘 얼마에 쓰나"를 보여 준다.
//
// 엽전 30개을 사는 사람은 그게 몇 번인지 모른 채 산다. 기능이 18개에 0~엽전 3개이 섞여 있어
// 더 그렇다. 값은 _homeSections() 에서 그대로 가져온다 — 여기에 가격표를 따로 적으면
// 홈에는 2, 안내에는 1 이라고 뜨는 날이 반드시 온다.
function renderTokenCostGuide() {
  const host = document.getElementById('tmCostGuide');
  if (!host || typeof _homeSections !== 'function') return;
  const t = getT();
  const lang = getLang();
  const freeLabel = { ko:'무료', en:'FREE', zh:'免费', ja:'無料' }[lang] || '무료';

  const byCost = new Map();
  for (const sec of _homeSections()) {
    for (const item of sec.items) {
      if (!byCost.has(item.cost)) byCost.set(item.cost, []);
      byCost.get(item.cost).push(item.label);
    }
  }
  const costs = [...byCost.keys()].sort((a, b) => b - a);   // 비싼 것부터 — 값을 먼저 보게

  host.innerHTML = `
    <div class="cost-guide-title">${_escHtml(t.tmCostTitle || '엽전으로 할 수 있는 것')}</div>
    ${costs.map(c => `
      <div class="cost-guide-row">
        <span class="cost-guide-badge${c ? '' : ' cs-free'}">${c ? '✦' + c : _escHtml(freeLabel)}</span>
        <span class="cost-guide-items">${byCost.get(c).map(l => _escHtml(l)).join(' · ')}</span>
      </div>`).join('')}
    <div class="cost-guide-note">${_escHtml(t.tmCostNote || '')}</div>`;
}

/**
 * 실결제를 못 받는 동안 충전 입구의 문구를 바꾼다.
 *
 * ⚠️ "충전" 이라 써 두면 누른 사람은 여기서 충전이 된다고 믿는다. 그런데 지금은
 *    토스 앱으로 보내는 것이 전부이고, 거기서 산 엽전은 **웹 잔액에 안 들어온다**
 *    (계정이 별개다). 그러면 버튼이 못 지킬 약속을 한 셈이 된다.
 *
 *    라이브 키로 바꾸면 이 함수가 아무것도 안 하므로 원래 문구가 그대로 나온다.
 */
function _relabelChargeEntries() {
  if (_webPayLive()) return;
  const T = {
    ko: { title: '토스 앱에서 보기', desc: '엽전 충전은 토스 앱에서' },
    en: { title: 'Open in Toss', desc: 'Tokens are sold in the Toss app' },
    zh: { title: '在 Toss 中打开', desc: '代币在 Toss 应用中购买' },
    ja: { title: 'Toss アプリで見る', desc: 'トークンは Toss アプリで' },
  };
  const t = T[getLang()] || T.ko;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('quickTokenTitle', t.title);   set('quickTokenDesc', t.desc);
  set('mpBotChargeTitle', t.title);  set('mpBotChargeDesc', t.desc);
}

function openTokenModal() {
  // ⚠️ 웹에서 실결제를 못 받는 동안은 충전 화면 자체를 안 열어야 한다.
  // 상품 카드를 보여 주면 사려는 사람은 '여기서 살 수 있다'고 읽는다 —
  // 그런데 사면 웹 잔액은 그대로다(계정이 별개). 그것이 약속을 어기는 것이다.
  if (!_webPayLive()) { _showMiniPayGuide(); return; }
  document.getElementById('token-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  updateAllTokenDisplays(); // 잔액 최신화
  if (typeof _renderTokenModal === 'function') _renderTokenModal(); // 다국어 라벨 갱신
  renderTokenCostGuide();   // 언어가 바뀌어도 열 때마다 다시 그린다
  if (typeof refreshSubscription === 'function') refreshSubscription(); // 구독 상태 갱신
}

function closeTokenModal() {
  document.getElementById('token-modal').style.display = 'none';
  document.body.style.overflow = ''; // openTokenModal에서 건 스크롤 잠금 해제
}

function openSupport() {
  // 카카오 채널 1:1 채팅으로 바로 연결
  openExternal('https://pf.kakao.com/_xigAbX/chat');
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
<p><b>M;Y 安 (마이안)</b>(이하 "회사")은 이용자의 사주 기운 리딩 서비스 제공, 맞춤형 처방 솔루션 매칭, 회원 식별 및 서비스 개선, 유료 콘텐츠(엽전) 정산 및 결제 관리 목적으로 최소한의 개인정보를 처리합니다.</p>

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
<p>사용자는 구매한 충전형 엽전 중 <b>미사용 잔여 분</b>에 대하여 전자상거래 등에서의 소비자보호에 관한 법률 제17조에 의거하여 청약철회 및 환불을 요청할 수 있습니다.</p>

<h3>제2조 (청약철회 및 환불 조건)</h3>
<p>• 사용자는 유료 결제일로부터 <b>7일 이내</b>에 미사용된 엽전 전체 또는 일부에 대해 환불 신청이 가능합니다.</p>
<p>• 환불 금액은 사용자가 실제 결제한 금액을 기준으로 하며, 패키지 할인 상품의 경우 기 사용된 엽전의 단가를 정상가 기준으로 역산하여 제외한 후 잔액을 정산합니다.</p>

<h3>제3조 (청약철회 및 환불의 제한)</h3>
<p>다음 각 호에 해당하는 경우 환불이 제한될 수 있습니다.</p>
<p>• 유료 결제 후 7일을 초과하여 청약철회 기간이 경과한 경우</p>
<p>• 결제를 통해 지급된 엽전을 이미 대화 및 기운 리딩 서비스에 소비하여 사용이 완료된 경우 (디지털 콘텐츠의 개시)</p>
<p>• 이벤트, 프로모션, 회원가입 보너스 등 서비스 내에서 무상으로 지급된 엽전(무료 대화권)</p>

<h3>제4조 (자동 환불 및 정산 예외 보장 시스템)</h3>
<p>AI 통신 서버의 일시적 장애, 구글 API 네트워크 단절, 혹은 시스템 세이프티 필터 작동으로 인하여 사용자의 질문에 대하여 <b>AI의 리딩 답변 문장이 정상적으로 도출되지 않고 공백으로 종료된 경우</b>, 선차감되었던 엽전 1개는 데이터베이스 전산 트랜잭션에 의해 사용되지 않은 것으로 판정되어 <b>실시간으로 즉시 복구(자동 환불)</b> 처리되며 과금되지 않습니다.</p>

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

<h3>제4조 (유료 서비스 및 엽전 이용 규정)</h3>
<p>• 본 서비스는 가상 재화인 '엽전(Token)' 차감제로 운영됩니다. 질문 1회당 정상 답변이 완결될 때 엽전 1개이 차감됩니다.</p>
<p>• 유료 엽전의 가격, 지급 수량 및 정산 방식은 회사가 홈페이지 결제 창에 고지한 내용을 따르며, 회사는 투명한 거래를 위해 모든 결제 요청의 로그를 관계형 데이터베이스(D1)에 영구 기록합니다.</p>

<h3>제5조 (서비스의 중단 및 제한)</h3>
<p>회사는 시스템 점검, 서버 증설, AI 공급처(Google)의 기술적 장애 등 불가항력적인 사유가 발생한 경우 서비스의 전부 또는 일부를 일시적으로 제한하거나 중단할 수 있습니다. 다만, 이 과정에서 전산 오류로 소실된 유료 엽전은 회사의 관리자 기능을 통해 즉시 재지급 보상 처리됩니다.</p>

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
  if (inp.type === 'password') { inp.type = 'text';     btn.innerHTML = icon('eyeOff'); }
  else                         { inp.type = 'password'; btn.innerHTML = icon('eye'); }
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
  // 리딩 중 엽전 만료로 재로그인이 필요한 경우 → 재로그인 후 같은 모드로 복귀
  // (대화 내용 저장은 복원하는 곳이 없어져 제거됨. pendingMode만 유지)
  if (getCurrentScreen() === 'CHAT' && mode) {
    pendingMode = mode;
  }

  showScreen('LOGIN');
  renderLogin();
  if (IS_NATIVE_APP) { _renderNativeGoogleBtn('loginGoogleBtnEl', getT().googleSignIn); return; }
  // Google 버튼 초기화 (로그인용)
  const tryInit = (attempts) => {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id && GOOGLE_CID) {
      initGoogleLoginBtn();
    } else if (!GOOGLE_CID) {
      document.getElementById('loginGoogleBtnWrap').style.display = 'none';
      document.getElementById('loginOrDivider').style.display     = 'none';
    } else if (attempts > 0) {
      setTimeout(() => tryInit(attempts - 1), 300);
    } else {
      console.warn('Google Login failed to load after retries');
      const wrap = document.getElementById('loginGoogleBtnEl');
      if (wrap) _renderGoogleFallbackBtn(wrap);
    }
  };
  tryInit(15); // 더 많은 재시도 (모바일 대응)
}

function initGoogleLoginBtn() {
  const wrap = document.getElementById('loginGoogleBtnEl');
  if (!wrap) return;
  wrap.innerHTML = '';
  _ensureGisInit();
  const localeMap = { ko:'ko', en:'en', zh:'zh-CN', ja:'ja' };

  const parentW = wrap.parentElement?.getBoundingClientRect().width || window.innerWidth - 64;
  const btnW = Math.min(Math.max(parentW, 280), 400);
  wrap.style.width = btnW + 'px';

  requestAnimationFrame(() => {
    setTimeout(() => {
      try {
        google.accounts.id.renderButton(wrap, {
          type: 'standard', theme: 'filled_black', size: 'large',
          text: 'signin_with', shape: 'rectangular',
          width: btnW, locale: localeMap[lang] || 'ko',
        });
        setTimeout(() => {
          if (!wrap.querySelector('iframe') && !wrap.querySelector('div[role]')) {
            _renderGoogleFallbackBtn(wrap);
          }
        }, 800);
      } catch(e) {
        _renderGoogleFallbackBtn(wrap);
      }
    }, 150);
  });
}

// 구글 공식 버튼(iframe)을 못 쓰는 경우에 쓰는 자체 버튼. GIS 폴백과 네이티브 앱 양쪽이 공유한다.
function _renderGoogleBtn(wrap, label, onClick) {
  wrap.innerHTML = '';
  const btn = document.createElement('button');
  btn.style.cssText = 'width:100%;max-width:480px;padding:14px 20px;border-radius:8px;' +
    'background:#fff;color:#1f1f1f;border:1px solid #dadce0;font-size:0.95rem;font-weight:500;' +
    'cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;';
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/><path fill="#FBBC05" d="M3.964 10.706c-.18-.54-.282-1.117-.282-1.706s.102-1.166.282-1.706V4.962H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.038l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"/></svg>` +
    `<span></span>`;
  btn.querySelector('span').textContent = label;
  btn.onclick = onClick;
  wrap.appendChild(btn);
}

function _renderGoogleFallbackBtn(wrap) {
  _renderGoogleBtn(wrap, getT().googleSignIn, () => {
    try { google.accounts.id.prompt(); } catch(e) {
      showToast(getT().googleSignInFail);
    }
  });
}

// 앱 안에서는 GIS 대신 이 버튼을 띄우고, 누르면 네이티브 구글 로그인 SDK 를 호출한다.
function _renderNativeGoogleBtn(wrapId, label) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  _renderGoogleBtn(wrap, label, _nativeGoogleSignIn);
}

function goBackFromLogin() {
  pendingMode = null;
  showScreen('MODE', true);
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
    document.getElementById('screen-mode').style.display = '';
  }
}

/* ── 인증 게이트 ── 항상 모드 화면 먼저 */
function checkAuth() {
  document.getElementById('screen-mode').style.display   = '';
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
    document.getElementById('screen-mode').style.display = '';
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

  // 게스트 모드는 입력 화면 → 결과 화면이 이어지지만 항목은 하나만 쌓는다.
  // 화면 안의 뒤로가기 버튼도 두 화면 모두 backToHome() 으로 처리하므로(1323행 근처)
  // 결과 화면에서 한 번 누르면 바로 홈으로 가는 동작을 OS 뒤로가기와 맞춘 것.
  const _origStartGuestMode = startGuestMode;
  startGuestMode = function() {
    history.pushState({ screen: 'guest' }, '');
    _origStartGuestMode();
  };

  // 게스트 결과 화면의 '지금 가입하기' — 게스트 항목을 회원가입 항목으로 갈아끼운다.
  // 여기서 항목을 하나 더 쌓으면 회원가입에서 뒤로가기가 홈을 띄운 뒤에도 게스트 항목이
  // 남아, 앱을 나가려면 뒤로가기를 한 번 더 눌러야 한다.
  goSignupFromGuest = function() {
    history.replaceState({ screen: 'signup' }, '');
    _origGoSignup();
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
    if (document.getElementById('screen-guest').style.display === 'flex' ||
        document.getElementById('screen-guest-result').style.display === 'flex') {
      backToHome(); return;
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
        alert(TX[lang]?.tkRedeemOk ? TX[lang].tkRedeemOk(data.tokens || 0) : '결제하신 엽전이 정상 지급되었습니다.');
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
  _t('drTxtTarot',   t.drTarotTitle); _t('drSubTarot', t.drTarotSub);
  _t('drTxtZodiac',  t.drZodiacTitle); _t('drSubZodiac', t.drZodiacSub);
  _t('drTxtLucky',   t.drLuckyTitle);  _t('drSubLucky', t.drLuckySub);
  _t('drTxtType',    t.drTypeTitle);   _t('drSubType', t.drTypeSub);
  _t('drTxtFortune', t.drFortuneTitle); _t('drSubFortune', t.drFortuneSub);
  _t('drTxtIching',    t.drIchingTitle);    _t('drSubIching', t.drIchingSub);
  _t('drTxtNumerology', t.drNumerologyTitle); _t('drSubNumerology', t.drNumerologySub);
  _t('drTxtTojeong',   t.drTojeongTitle);   _t('drSubTojeong', t.drTojeongSub);
  _t('drTxtPhoto',    t.drPhotoTitle);      _t('drSubPhoto', t.drPhotoSub);
  _t('drTxtDream',    t.drDreamTitle);      _t('drSubDream', t.drDreamSub);
  _t('drTxtLotto',    t.drLottoTitle);      _t('drSubLotto', t.drLottoSub);
  _t('drTxtRune',     t.drRuneTitle);       _t('drSubRune', t.drRuneSub);
  _t('photoGalleryBtnText', t.photoGalleryTitle);
  _t('sajuHistoryBtnText', t.histTitle);
  _t('quickExperienceTitle', t.quickExperienceTitle); _t('quickExperienceDesc', t.quickExperienceDesc);
  renderHomeSections(); // 홈 타일은 JS로 그리므로 언어 전환 시 다시 렌더해야 반영됨
  renderMoonToday();    // 헤더의 오늘의 달도 언어별 이름이라 함께 갱신
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

  // 위에서 원래 문구를 다시 칠했으므로, 안 되는 동안은 다시 덮어쓴다.
  _relabelChargeEntries();
}

function _syncDrawerTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  document.getElementById('drawerThemeDark')?.classList.toggle('on', !isLight);
  document.getElementById('drawerThemeLight')?.classList.toggle('on', isLight);
  // 기존 테마 버튼 아이콘 동기화
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) themeBtn.innerHTML = icon('secScreen');
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

// ── 2. Service Worker 등록 (업데이트 감지) ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {

        // 업데이트 감지
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // 새 버전 발견 - 사용자에게 알림
              if (confirm('새로운 버전이 있습니다. 페이지를 새로고침하시겠어요?')) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
                window.location.reload();
              }
            }
          });
        });

        // 주기적으로 업데이트 확인 (1시간마다)
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);
      })
      .catch(() => {});
  });

  // Service Worker 제어권 변경 시 새로고침
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
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

// ── 4. 푸시 알림 — notifications.js 모듈로 이동됨 ──
// 하위 호환성을 위한 래퍼 함수
async function requestNotificationPermission() {
  return window.Notifications?.requestPermission() || false;
}

function scheduleLocalNotification(hour, minute) {
  return window.Notifications?.scheduleDailyNotification(hour, minute);
}

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
  // 충전 입구 문구를 첫 그림에서부터 맞춰 둔다.
  // 언어를 바꿀 때만 불리는 곳에 두면, 처음 들어온 사람은 여전히 '충전' 을 본다.
  try { _relabelChargeEntries(); } catch (e) {}
  new ParticleField('bg-canvas');
  _restoreOhaengIndicator();
  // ?promo= URL 파라미터 감지
  _checkPromoParam();

  renderHomeSections(); // 홈 계열별 콘텐츠 타일 초기 렌더
  renderMoonToday();    // 헤더 오늘의 달 초기 렌더

  // 🔥 서버 검증 스트릭을 불러와 배너에 반영 (로그인 전이면 조용히 스킵)
  fetchStreak(true);

  // 자동 로그인 시도 (로그인 화면 진입 없이도 활성 구글 세션이면 조용히 로그인)
  _tryAutoLogin(15);

  // ── 토스페이먼츠 결제 후 리다이렉트 처리 ──
  // 결제 성공: ?paymentKey=xxx&orderId=yyy&amount=4900
  // 결제 실패: ?payFailed=1&orderId=yyy  (또는 Toss 자체 failUrl)
  const _rsp = new URLSearchParams(window.location.search);
  const _paymentKey = _rsp.get('paymentKey');
  const _orderId    = _rsp.get('orderId');
  const _amount     = _rsp.get('amount');
  const _payFailed  = _rsp.get('payFailed');
  const _subAuth     = _rsp.get('subAuth');
  const _authKey     = _rsp.get('authKey');
  const _customerKey = _rsp.get('customerKey');

  if (_subAuth && _authKey && _customerKey) {
    // ✅ 구독 빌링 인증 성공 리다이렉트
    history.replaceState({}, '', window.location.pathname);
    const _plan = sessionStorage.getItem('myan_pending_sub_plan') || 'basic';
    sessionStorage.removeItem('myan_pending_sub_plan');
    const _subData = { authKey: _authKey, customerKey: _customerKey, plan: _plan };

    setTimeout(async () => {
      if (getGoogleIdToken()) {
        await _confirmSubscription(_subData);
      } else {
        sessionStorage.setItem('myan_pending_sub_confirm', JSON.stringify(_subData));
      }
    }, 800);

  } else if (_paymentKey && _orderId && _amount) {
    // ✅ 결제 성공 리다이렉트
    history.replaceState({}, '', window.location.pathname);
    const _tossData = { paymentKey: _paymentKey, orderId: _orderId, amount: Number(_amount) };

    setTimeout(async () => {
      if (getGoogleIdToken()) {
        await _confirmTossPayment(_tossData);
      } else {
        // 로그인 엽전 아직 없으면 sessionStorage에 보관 → 로그인 후 처리
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


// ════════════════════════════════════════════
//  홈 프리뷰 + 행운 아이템 + 스트릭 배지
// ════════════════════════════════════════════
// ── 새 기능 헬퍼 ──
function getT() { return TX[lang] || TX.ko; }
function getLang() { return lang || 'ko'; }

const HEATMAP_COLORS = {
  '木': '#4caf7d', '火': '#e05a5a', '土': '#c8a06a',
  '金': '#9e9e9e', '水': '#5b9bd5'
};


let _streakCache = null;


function renderStreakBadge(current) {
  const el = document.getElementById('streak-badge-home');
  if (!el) return;
  if (!current || current < 1) { el.style.display = 'none'; return; }
  el.innerHTML = `<span class="streak-badge">🔥 ${current}일 연속</span>`;
  el.style.display = '';
}

function _refreshHomeExtras(ohaeng) {
  if (ohaeng) {
    // renderLuckyItems 제거됨
    renderOhaengIndicator(ohaeng);
  }
  if (_streakCache) renderStreakBadge(_streakCache.current);
}


// ════════════════════════════════════════════
//  스트릭 UI
// ════════════════════════════════════════════
async function fetchStreak(silent = false) {
  const token = getGoogleIdToken();
  if (!token) {
    if (!silent) showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    showStreakBanner(0);
    return;
  }
  try {
    const r = await fetch(EP + 'api/streak', { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return;
    _streakCache = await r.json();
    renderStreakUI(_streakCache);
    renderStreakBadge(_streakCache.current);
    showStreakBanner(_streakCache.current);
    if (typeof checkAchievements === 'function') checkAchievements();
  } catch {}
}

function renderStreakUI(data) {
  const section = document.getElementById('streak-section');
  if (!section) return;
  section.style.display = '';
  const t = getT();
  const today = _todayKST();
  const alreadyDone = data.lastCheckin === today;

  section.innerHTML = `
    <div class="streak-section-title">${t.streakTitle||'출석 스트릭'}</div>
    <div class="streak-stats">
      <div class="streak-stat">
        <div class="streak-stat-num">🔥${data.current||0}</div>
        <div class="streak-stat-label">${t.streakCurrent||'현재'}</div>
      </div>
      <div class="streak-stat">
        <div class="streak-stat-num">🏆${data.max||0}</div>
        <div class="streak-stat-label">${t.streakMax||'최고'}</div>
      </div>
      <div class="streak-stat">
        <div class="streak-stat-num">📅${data.total||0}</div>
        <div class="streak-stat-label">${t.streakTotal||'총 출석'}</div>
      </div>
    </div>
    <button class="streak-checkin-btn" id="streak-checkin-btn" ${alreadyDone?'disabled':''} onclick="doCheckin()">
      ${alreadyDone ? (t.streakDone||'오늘 출석 완료 ✓') : (t.streakCheckin||'오늘 출석 체크')}
    </button>
    <div class="streak-bonus-msg" id="streak-bonus-msg" style="display:none">${t.streakBonus||'🎉 7일 보너스! +엽전 5개'}</div>`;
}

async function doCheckin() {
  const token = getGoogleIdToken();
  if (!token) return;
  const btn = document.getElementById('streak-checkin-btn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const r = await fetch(EP + 'api/streak/checkin', { method:'POST', headers:{ Authorization:`Bearer ${token}` } });
    const d = await r.json();
    _streakCache = d;
    renderStreakUI(d);
    renderStreakBadge(d.current);
    showStreakBanner(d.current);
    if (d.bonus) {
      const msg = document.getElementById('streak-bonus-msg');
      if (msg) { msg.style.display = ''; setTimeout(()=>{ msg.style.display='none'; }, 3000); }
    }
  } catch {}
}

function _todayKST() {
  return new Date(Date.now() + 9*3600000).toISOString().slice(0,10);
}

// ════════════════════════════════════════════
//  오행 히트맵
// ════════════════════════════════════════════
async function renderOhaengHeatmap() {
  const section = document.getElementById('heatmap-section');
  if (!section) return;
  const token = getGoogleIdToken();
  if (!token) { section.style.display = 'none'; return; }
  try {
    const r = await fetch(EP + 'api/ohaeng-history', { headers:{ Authorization:`Bearer ${token}` } });
    if (!r.ok) return;
    const { history } = await r.json();
    const t = getT();
    const map = {};
    for (const h of history) map[h.date] = h.ohaeng;
    // 최근 90일 표시
    const cells = [];
    const today = _todayKST();
    for (let i = 89; i >= 0; i--) {
      const d = new Date(Date.now() + 9*3600000 - i*86400000).toISOString().slice(0,10);
      const o = map[d];
      const color = o ? HEATMAP_COLORS[o] : null;
      cells.push(`<div class="heatmap-cell${o?'':' heatmap-empty'}" title="${d}${o?' ('+o+')':''}" style="${color?'background:'+color+';':''}"></div>`);
    }
    section.innerHTML = `
      <div class="heatmap-section-title">${t.heatmapTitle||'90일 오행 기록'}</div>
      <div class="heatmap-grid">${cells.join('')}</div>
      <button class="calendar-toggle-btn" onclick="toggleMonthlyCalendar()" style="margin-top:16px">
        📅 ${{ko:'월간 캘린더 보기',en:'Monthly Calendar',zh:'月历',ja:'月間カレンダー'}[getLang()] || '월간 캘린더 보기'}
      </button>
      <div id="monthly-calendar" style="display:none; margin-top:16px"></div>
    `;
    section.style.display = '';
    renderMonthlyCalendar(map); // 캘린더 미리 생성 (숨김 상태)
  } catch { section.style.display = 'none'; }
}


// ════════════════════════════════════════════
//  월간 캘린더
// ════════════════════════════════════════════
function toggleMonthlyCalendar() {
  const cal = document.getElementById('monthly-calendar');
  if (!cal) return;
  cal.style.display = cal.style.display === 'none' ? 'block' : 'none';
  hapticLight();
}

function renderMonthlyCalendar(ohaengMap) {
  const cal = document.getElementById('monthly-calendar');
  if (!cal) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11
  const lang = getLang();

  // 월 이름
  const monthNames = {
    ko: ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'],
    en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    zh: ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
    ja: ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
  };
  const monthName = (monthNames[lang] || monthNames.ko)[month];

  // 요일 이름
  const dayNames = {
    ko: ['일','월','화','수','목','금','토'],
    en: ['Su','Mo','Tu','We','Th','Fr','Sa'],
    zh: ['日','一','二','三','四','五','六'],
    ja: ['日','月','火','水','木','金','土']
  };
  const days = dayNames[lang] || dayNames.ko;

  // 이번 달 첫날, 마지막날
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const firstWeekday = firstDay.getDay(); // 0=일요일
  const daysInMonth = lastDay.getDate();

  let html = `
    <div class="calendar-header">${year} ${monthName}</div>
    <div class="calendar-weekdays">
      ${days.map(d => `<div class="calendar-weekday">${d}</div>`).join('')}
    </div>
    <div class="calendar-days">
  `;

  // 빈 칸 (이전 달)
  for (let i = 0; i < firstWeekday; i++) {
    html += '<div class="calendar-day calendar-day-empty"></div>';
  }

  // 날짜 칸
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const ohaeng = ohaengMap[dateStr];
    const color = ohaeng ? HEATMAP_COLORS[ohaeng] : null;
    const isToday = dateStr === _todayKST();

    html += `
      <div class="calendar-day${isToday ? ' calendar-day-today' : ''}${ohaeng ? ' calendar-day-has-ohaeng' : ''}"
           title="${dateStr}${ohaeng ? ' ('+ohaeng+')' : ''}"
           style="${color ? 'background:'+color+';' : ''}">
        <div class="calendar-day-num">${day}</div>
        ${ohaeng ? `<div class="calendar-day-ohaeng">${ohaeng}</div>` : ''}
      </div>
    `;
  }

  html += '</div>';
  cal.innerHTML = html;
}

window.toggleMonthlyCalendar = toggleMonthlyCalendar;

// ════════════════════════════════════════════
//  주간 리포트
// ════════════════════════════════════════════
async function showWeeklyReport() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast({ko:'로그인이 필요합니다',en:'Login required',zh:'需要登录',ja:'ログインが必要です'}[getLang()] || '로그인이 필요합니다');
    return;
  }

  try {
    const res = await fetch(EP + 'api/weekly-report', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to fetch report');

    const data = await res.json();
    displayWeeklyReport(data);
  } catch (e) {
    console.error('Weekly report error:', e);
    showToast({ko:'리포트를 불러올 수 없습니다',en:'Cannot load report',zh:'无法加载报告',ja:'レポートを読み込めません'}[getLang()] || '리포트를 불러올 수 없습니다');
  }
}

function displayWeeklyReport(data) {
  const lang = getLang();
  const { mostFrequent, distribution, totalDays, streak } = data;

  const ohaengNames = {
    ko: { '木':'목(木)', '火':'화(火)', '土':'토(土)', '金':'금(金)', '水':'수(水)' },
    en: { '木':'Wood', '火':'Fire', '土':'Earth', '金':'Metal', '水':'Water' },
    zh: { '木':'木气', '火':'火气', '土':'土气', '金':'金气', '水':'水气' },
    ja: { '木':'木(もく)', '火':'火(ひ)', '土':'土(つち)', '金':'金(きん)', '水':'水(すい)' }
  };

  const titles = {
    ko: '📊 이번 주 리포트',
    en: '📊 Weekly Report',
    zh: '📊 本周报告',
    ja: '📊 今週のレポート'
  };

  const mostText = mostFrequent ? {
    ko: `가장 많이 나온 오행: <strong>${ohaengNames[lang][mostFrequent] || mostFrequent}</strong>`,
    en: `Most frequent: <strong>${ohaengNames[lang][mostFrequent] || mostFrequent}</strong>`,
    zh: `最常见的五行: <strong>${ohaengNames[lang][mostFrequent] || mostFrequent}</strong>`,
    ja: `最も多い五行: <strong>${ohaengNames[lang][mostFrequent] || mostFrequent}</strong>`
  } : {
    ko: '아직 기록이 없어요',
    en: 'No records yet',
    zh: '暂无记录',
    ja: 'まだ記録がありません'
  };

  const daysText = {
    ko: `총 ${totalDays}일 기록`,
    en: `${totalDays} days recorded`,
    zh: `共${totalDays}天记录`,
    ja: `合計${totalDays}日記録`
  };

  // 모달 생성
  const modal = document.createElement('div');
  modal.className = 'weekly-report-modal';
  modal.innerHTML = `
    <div class="weekly-report-content">
      <div class="weekly-report-header">
        <div class="weekly-report-title">${titles[lang] || titles.ko}</div>
        <button class="weekly-report-close" onclick="this.closest('.weekly-report-modal').remove()">✕</button>
      </div>
      <div class="weekly-report-body">
        <div class="weekly-report-stat">
          <div class="weekly-report-icon">🔥</div>
          <div class="weekly-report-label">${{ko:'연속 방문',en:'Streak',zh:'连续访问',ja:'連続訪問'}[lang]}</div>
          <div class="weekly-report-value">${streak}일</div>
        </div>
        <div class="weekly-report-stat">
          <div class="weekly-report-icon">📅</div>
          <div class="weekly-report-label">${daysText[lang] || daysText.ko}</div>
          <div class="weekly-report-value">${totalDays}</div>
        </div>
        <div class="weekly-report-most">
          ${mostText[lang] || mostText.ko}
        </div>
        <div class="weekly-report-chart">
          ${Object.entries(distribution).map(([o, count]) => {
            const pct = totalDays > 0 ? Math.round((count / totalDays) * 100) : 0;
            const color = HEATMAP_COLORS[o] || '#888';
            return `
              <div class="weekly-report-bar">
                <div class="weekly-report-bar-label">${o}</div>
                <div class="weekly-report-bar-bg">
                  <div class="weekly-report-bar-fill" style="width: ${pct}%; background: ${color}"></div>
                </div>
                <div class="weekly-report-bar-pct">${pct}%</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      <button class="weekly-report-btn" onclick="this.closest('.weekly-report-modal').remove()">
        ${{ko:'닫기',en:'Close',zh:'关闭',ja:'閉じる'}[lang] || '닫기'}
      </button>
    </div>
  `;

  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('active'), 50);

  hapticMedium();
  playBellSound();
}

window.showWeeklyReport = showWeeklyReport;

// ════════════════════════════════════════════
//  업적 시스템
// ════════════════════════════════════════════
const ACHIEVEMENTS = {
  first_visit: { icon: '🎉', ko: '첫 방문', en: 'First Visit', zh: '首次访问', ja: '初訪問' },
  all_elements: { icon: '☯️', ko: '오행 마스터', en: 'Element Master', zh: '五行大师', ja: '五行マスター' },
  streak_7: { icon: '🔥', ko: '일주일 연속', en: '7-Day Streak', zh: '连续一周', ja: '7日連続' },
  streak_30: { icon: '💪', ko: '한 달 연속', en: '30-Day Streak', zh: '连续一月', ja: '30日連続' },
  streak_100: { icon: '👑', ko: '백일 달성', en: '100-Day Streak', zh: '百日达成', ja: '百日達成' },
  share_10: { icon: '📤', ko: '공유 전문가', en: 'Share Expert', zh: '分享专家', ja: '共有エキスパート' },
  tokens_50: { icon: '💰', ko: '엽전 부자', en: 'Token Rich', zh: '代币富翁', ja: 'トークン富豪' }
};

function getAchievements() {
  try {
    const stored = localStorage.getItem('myan_achievements');
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function unlockAchievement(key) {
  const achievements = getAchievements();
  if (achievements[key]) return; // 이미 달성

  achievements[key] = Date.now();
  try {
    localStorage.setItem('myan_achievements', JSON.stringify(achievements));
  } catch {}

  showAchievementToast(key);
}

function showAchievementToast(key) {
  const achievement = ACHIEVEMENTS[key];
  if (!achievement) return;

  const lang = getLang();
  const name = achievement[lang] || achievement.ko;

  const toast = document.createElement('div');
  toast.className = 'achievement-toast';
  toast.innerHTML = `
    <div class="achievement-icon">${achievement.icon}</div>
    <div class="achievement-content">
      <div class="achievement-label">${{ko:'업적 달성!',en:'Achievement!',zh:'成就达成!',ja:'実績解除!'}[lang]}</div>
      <div class="achievement-name">${name}</div>
    </div>
  `;

  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('active'), 50);

  hapticSuccess();
  playSuccessSound();
  if (window.M_Effect) {
    const colors = ['木', '火', '土', '金', '水'];
    window.M_Effect.spawnParticles(null, colors[Math.floor(Math.random() * colors.length)]);
  }

  setTimeout(() => {
    toast.classList.remove('active');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function checkAchievements() {
  // 첫 방문
  unlockAchievement('first_visit');

  // 오행 마스터 (모든 오행 경험)
  try {
    const history = JSON.parse(localStorage.getItem('myan_ohaeng_history') || '{}');
    const uniqueElements = new Set(Object.values(history));
    if (uniqueElements.size >= 5) {
      unlockAchievement('all_elements');
    }
  } catch {}

  // 스트릭 업적 (서버 검증 스트릭 캐시 기준)
  const streak = _streakCache?.current || 0;
  if (streak >= 7) unlockAchievement('streak_7');
  if (streak >= 30) unlockAchievement('streak_30');
  if (streak >= 100) unlockAchievement('streak_100');
}

function showAchievementsModal() {
  const lang = getLang();
  const unlocked = getAchievements();
  const total = Object.keys(ACHIEVEMENTS).length;
  const count = Object.keys(unlocked).length;

  const modal = document.createElement('div');
  modal.className = 'achievements-modal';
  modal.innerHTML = `
    <div class="achievements-content">
      <div class="achievements-header">
        <div class="achievements-title">🏆 ${{ko:'업적',en:'Achievements',zh:'成就',ja:'実績'}[lang]}</div>
        <button class="achievements-close" onclick="this.closest('.achievements-modal').remove()">✕</button>
      </div>
      <div class="achievements-progress">
        <div class="achievements-progress-text">${count} / ${total}</div>
        <div class="achievements-progress-bar">
          <div class="achievements-progress-fill" style="width: ${(count/total)*100}%"></div>
        </div>
      </div>
      <div class="achievements-grid">
        ${Object.entries(ACHIEVEMENTS).map(([key, ach]) => {
          const isUnlocked = unlocked[key];
          const name = ach[lang] || ach.ko;
          return `
            <div class="achievement-card${isUnlocked ? ' unlocked' : ''}">
              <div class="achievement-card-icon">${isUnlocked ? ach.icon : '🔒'}</div>
              <div class="achievement-card-name">${name}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('active'), 50);
  hapticMedium();
}

window.showAchievementsModal = showAchievementsModal;

// 페이지 로드 시 업적 체크
setTimeout(() => checkAchievements(), 2000);

// ════════════════════════════════════════════
//  레퍼럴 섹션
// ════════════════════════════════════════════
async function loadTokenHistory() {
  const list = document.getElementById('token-history-list');
  if (!list) return;
  const token = getGoogleIdToken();
  if (!token) return;

  list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-dim);">불러오는 중...</div>';

  try {
    const res = await fetch(EP + 'api/token-history', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-dim);">내역을 불러올 수 없습니다.</div>';
      return;
    }

    const data = await res.json();
    const history = data.history || [];

    if (history.length === 0) {
      list.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-dim);">아직 엽전 내역이 없습니다.</div>';
      return;
    }

    // 예전에는 여기 인라인 스타일로 색을 박아 두었다. 배경이 rgba(255,255,255,0.05)
    // 라 밝은 화면에서는 크림색 위 흰색이 되어 칸이 안 보였고, 종류별 색도
    // 보라·초록·빨강·파랑이라 금·먹 팔레트 밖으로 튀었다. 모양은 CSS 로 옮긴다.
    list.innerHTML = history.map(h => {
      const date = new Date(h.timestamp * 1000).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const kind = { charge: '충전', event: '이벤트', referral: '추천', promo: '혜택' }[h.type] || '';

      return `
        <div class="th-row">
          <div class="th-main">
            <div class="th-desc">${_escHtml(h.desc)}${kind ? `<span class="th-kind">${kind}</span>` : ''}</div>
            <div class="th-date">${date}</div>
          </div>
          <div class="th-amount">+${h.tokens}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('[TOKEN HISTORY]', e);
    list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-dim);">오류가 발생했습니다.</div>';
  }
}

async function renderTokenHistory() {
  // 버튼만 표시
  const btn = document.getElementById('token-history-btn');
  if (!btn) return;
  const token = getGoogleIdToken();
  if (!token) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = 'block';
}

function openTokenHistoryModal() {
  const modal = document.getElementById('tokenHistoryModal');
  if (!modal) return;
  modal.style.display = 'flex';
  loadTokenHistory();
}

function closeTokenHistoryModal() {
  const modal = document.getElementById('tokenHistoryModal');
  if (!modal) return;
  modal.style.display = 'none';
}

async function renderReferralSection() {
  const section = document.getElementById('referral-section');
  if (!section) return;
  const token = getGoogleIdToken();
  if (!token) { section.style.display = 'none'; return; }
  try {
    const r = await fetch(EP + 'api/referral', { headers:{ Authorization:`Bearer ${token}` } });
    if (!r.ok) return;
    const { myCode, used } = await r.json();
    const t = getT();
    section.innerHTML = `
      <div class="referral-title">${t.referralTitle||'친구 초대'}</div>
      <div class="referral-desc">${t.referralDesc||'친구가 코드를 입력하면 양쪽 모두 +엽전 3개!'}</div>
      ${myCode ? `
        <div class="referral-code-row">
          <div class="referral-code-box">${myCode}</div>
          <button class="referral-copy-btn" onclick="_copyReferralCode('${myCode}')">${t.referralCopy||'복사'}</button>
        </div>
        <div class="referral-used-count">${(t.referralUsed||'초대 성공: {n}명').replace('{n}', used)}</div>
      ` : `
        <button class="referral-generate-btn" onclick="_generateReferralCode()">${t.referralGenerate||'내 초대 코드 생성'}</button>
      `}
      <div class="referral-claim-row">
        <input class="referral-claim-input" id="referral-claim-input" placeholder="${t.referralInputPlaceholder||'초대 코드 입력'}">
        <button class="referral-claim-btn" onclick="_claimReferral()">${t.referralClaimBtn||'적용'}</button>
      </div>`;
    section.style.display = '';
  } catch { section.style.display = 'none'; }
}

async function _generateReferralCode() {
  const token = getGoogleIdToken();
  if (!token) return;
  try {
    const r = await fetch(EP + 'api/referral/generate', { method:'POST', headers:{ Authorization:`Bearer ${token}` } });
    if (r.ok) renderReferralSection();
  } catch {}
}

function _copyReferralCode(code) {
  navigator.clipboard.writeText(code).catch(()=>{});
  const t = getT();
  showToast(t.shareCopied || '복사되었습니다!');
}

async function _claimReferral() {
  const token = getGoogleIdToken();
  if (!token) return;
  const input = document.getElementById('referral-claim-input');
  const code = input?.value?.trim();
  if (!code) return;
  try {
    const r = await fetch(EP + 'api/referral/claim', {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ code })
    });
    const d = await r.json();
    const t = getT();
    if (d.success) {
      showToast((t.referralClaimed||'🎉 코드 적용! +{n} 엽전').replace('{n}', d.bonus));
      renderReferralSection();
    } else {
      showToast(d.error?.message || '오류가 발생했습니다.');
    }
  } catch {}
}


// ════════════════════════════════════════════
//  사주 입력 → 로컬 간단 풀이 → 상세풀이 (대화 없음)
// ════════════════════════════════════════════
const _SIJI_OPTIONS = [
  ['', '모름 / 선택 안 함'],
  ['자시','🌑 자시 (23~01시)'],['축시','🌒 축시 (01~03시)'],['인시','🌓 인시 (03~05시)'],
  ['묘시','🌅 묘시 (05~07시)'],['진시','🌤 진시 (07~09시)'],['사시','☀️ 사시 (09~11시)'],
  ['오시','🌞 오시 (11~13시)'],['미시','🌇 미시 (13~15시)'],['신시','🌆 신시 (15~17시)'],
  ['유시','🌇 유시 (17~19시)'],['술시','🌃 술시 (19~21시)'],['해시','🌙 해시 (21~23시)']
];
let _lastSaju = null; // {mode, p1, p2, dayElem}

function _personFieldsHtml(idx, title) {
  const opts = _SIJI_OPTIONS.map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
  const currentYear = new Date().getFullYear();
  return `
    <div style="background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:16px">
      ${title ? `<div style="font-size:1rem;color:var(--gold);margin-bottom:14px;letter-spacing:1px;font-weight:500">${title}</div>` : ''}
      <input class="fif-input sj-name" data-p="${idx}" type="text" placeholder="이름 (선택)" maxlength="50" style="width:100%;margin-bottom:12px;padding:12px;font-size:1rem;box-sizing:border-box">
      <div style="display:flex;gap:10px;margin-bottom:12px">
        <input class="fif-input sj-year" data-p="${idx}" type="number" placeholder="1990" min="1920" max="${currentYear}" inputmode="numeric" style="flex:1.6;padding:12px;font-size:1rem;box-sizing:border-box">
        <input class="fif-input sj-month" data-p="${idx}" type="number" placeholder="월" min="1" max="12" inputmode="numeric" style="flex:1;padding:12px;font-size:1rem;box-sizing:border-box">
        <input class="fif-input sj-day" data-p="${idx}" type="number" placeholder="일" min="1" max="31" inputmode="numeric" style="flex:1;padding:12px;font-size:1rem;box-sizing:border-box">
      </div>
      <select class="fif-input sj-time" data-p="${idx}" style="width:100%;padding:12px;font-size:1rem;box-sizing:border-box">${opts}</select>
    </div>`;
}

function showSajuInput(m) {
  const cw = document.getElementById('chat-window');
  if (!cw) return;
  const isDuo = m === 'duo';
  const title = isDuo ? '💞 우리의 조화' : '☯ 나만의 리딩';
  const sub = isDuo ? '두 분의 생년월일·생시를 입력해 주세요' : '생년월일과 태어난 시간을 입력해 주세요';
  cw.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100%;padding:36px 20px">
      <div style="max-width:580px;width:100%;margin:0 auto">
        <div style="text-align:center;margin-bottom:12px;font-size:1.4rem;color:var(--gold);letter-spacing:1px">${title}</div>
        <div style="text-align:center;margin-bottom:28px;font-size:0.95rem;color:var(--text-dim)">${sub}</div>
        ${isDuo ? _personFieldsHtml(1,'첫 번째 분') + _personFieldsHtml(2,'두 번째 분') : _personFieldsHtml(1,'')}
        <div style="font-size:0.8rem;color:var(--text-dim);text-align:center;margin:8px 0 16px">태어난 시간을 모르시면 비워두셔도 됩니다</div>
        <button onclick="submitSajuInput('${m}')" class="fif-submit" style="width:100%;padding:14px;font-size:1rem" id="sjSubmitBtn">간단 풀이 보기 ›</button>
        <div id="sjErr" style="color:#e05a4a;font-size:0.9rem;text-align:center;margin-top:12px;display:none"></div>
      </div>
    </div>`;
  cw.scrollTop = 0;

  // 프로필 생년월일 자동 입력
  _autoFillBirthData(m);
}

function _readPerson(idx) {
  const q = (cls) => document.querySelector(`.${cls}[data-p="${idx}"]`);
  return {
    name: (q('sj-name')?.value || '').trim(),
    year: parseInt(q('sj-year')?.value, 10),
    month: parseInt(q('sj-month')?.value, 10),
    day: parseInt(q('sj-day')?.value, 10),
    hour: q('sj-time')?.value || ''
  };
}
function _validPerson(p) {
  const cy = new Date().getFullYear();
  return p.year>=1920 && p.year<=cy && p.month>=1 && p.month<=12 && p.day>=1 && p.day<=31;
}

async function submitSajuInput(m) {
  const err = document.getElementById('sjErr');
  const showErr = (msg) => { if(err){ err.textContent=msg; err.style.display='block'; } };
  const p1 = _readPerson(1);
  if (!_validPerson(p1)) return showErr('생년월일을 정확히 입력해 주세요.');
  let p2 = null;
  if (m === 'duo') {
    p2 = _readPerson(2);
    if (!_validPerson(p2)) return showErr('두 번째 분의 생년월일을 정확히 입력해 주세요.');
  }
  if (err) err.style.display = 'none';
  const btn = document.getElementById('sjSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = '계산 중...'; }

  const headers = {'Content-Type':'application/json'};
  const token = getGoogleIdToken();
  const body = { mode:m, lang, p1, p2 };

  // 로그인한 사용자는 기록 저장
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    body.save = true;
  }

  const apiPromise = fetch(EP + 'saju-reading', { method:'POST', headers, body: JSON.stringify(body) })
    .then(res => res.json())
    .then(data => {
      if (!data.ok) throw new Error(data.error?.message || '풀이 생성에 실패했습니다.');
      return data;
    });

  try {
    const data = await openOracleOverlay({ apiPromise, cost: m === 'duo' ? 2 : 1 });
    _lastSaju = { mode:m, p1, p2, dayElem: data.dayElem };
    renderSajuResult(data, m);
  } catch(e) {
    if (btn) { btn.disabled=false; btn.textContent='간단 풀이 보기 ›'; }
    showErr(e.message || '풀이 생성에 실패했습니다. 다시 시도해 주세요.');
  }
}

function _ohaengGaugeHtml(ohaeng) {
  const COL = {木:'#4bc87a',火:'#e05a4a',土:'#d4a040',金:'#a0aab4',水:'#5aa8e0'};
  return `<div style="display:flex;gap:6px;margin:14px 0">` + ['木','火','土','金','水'].map(k=>{
    const v = ohaeng[k]||0;
    return `<div style="flex:1;text-align:center">
      <div style="height:60px;display:flex;align-items:flex-end;justify-content:center">
        <div style="width:60%;height:${Math.max(v,3)}%;background:${COL[k]};border-radius:4px 4px 0 0"></div>
      </div>
      <div style="font-size:0.7rem;color:${COL[k]};margin-top:4px">${k}</div>
      <div style="font-size:0.65rem;color:var(--text-dim)">${v}%</div>
    </div>`;
  }).join('') + `</div>`;
}

function renderSajuResult(data, m) {
  const cw = document.getElementById('chat-window');
  if (!cw) return;
  const t = getT();
  const today = new Date().toISOString().slice(0,10);
  const ohaeng = data.dayElem || '土';
  const detailBtnsHtml = DETAIL_CATS.map(c => `
    <button class="rx-detail-btn" onclick="_detailFromSaju('${today}','${ohaeng}','${c.key}')">${c.icon} ${t.detailCardTitle?.[c.key] || c.key}</button>`).join('') + `
    <button class="rx-share-btn" onclick="shareOhaengCard('${ohaeng}')">📤 ${{ko:'공유하기',en:'Share',zh:'分享',ja:'共有'}[getLang()] || '공유하기'}</button>`;
  cw.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100%;padding:36px 20px">
      <div style="max-width:640px;width:100%;margin:0 auto">
        <div style="text-align:center;font-size:1.4rem;color:var(--gold);letter-spacing:1px;margin-bottom:26px">✨ 간단 풀이</div>
        ${_ohaengGaugeHtml(data.ohaeng||{})}
        <div id="sjReadingBody" style="background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:16px;padding:32px 24px;margin-top:22px"></div>
        <div style="font-size:0.72rem;color:var(--text-dim);margin:26px 0 10px">${t.detailTitle||'상세 풀이'} (엽전 2)</div>
        <div id="sjDetailBtns" style="display:flex;gap:8px;flex-wrap:wrap;opacity:0.4;pointer-events:none;transition:opacity .3s">${detailBtnsHtml}</div>
        <button id="sjRetryBtn" onclick="showSajuInput('${m}')" style="width:100%;margin-top:20px;padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text-dim);cursor:pointer;font-size:0.95rem;opacity:0.4;pointer-events:none;transition:opacity .3s">다시 입력</button>
      </div>
    </div>`;
  cw.scrollTop = 0;
  revealSentences(document.getElementById('sjReadingBody'), data.reading || '', getLang(), {
    scrollEl: cw,
    onComplete: () => {
      ['sjDetailBtns', 'sjRetryBtn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.style.opacity = '1'; el.style.pointerEvents = 'auto'; }
      });
    }
  });
}

function _detailFromSaju(date, ohaeng, category) {
  if (!_lastSaju) return;
  if (!getGoogleIdToken()) { showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.'); return; }
  _openDetailReading(date, ohaeng, category, _lastSaju.p1, _lastSaju.mode==='duo' ? _lastSaju.p2 : null);
}

// ════════════════════════════════════════════
//  상세 풀이 모달
// ════════════════════════════════════════════
async function _openDetailReading(date, ohaeng, category, birthOverride, p2) {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return;
  }
  const t = getT();
  const lang = getLang();
  const catMeta = DETAIL_CATS.find(c => c.key === category);
  const catLabel = t.detailCardTitle?.[category] || category;

  // 모달 열기
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:420px;padding:28px 22px">
      <div class="modal-title">${catMeta?.icon || '🔍'} ${catLabel}</div>
      <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:16px">${t.detailSub||date}</div>
      <div id="detail-loading"></div>
      <div id="detail-content" style="display:none"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  // 사용자 사주 계산용 생년월일시 (입력폼에서 넘어온 값 우선, 없으면 프로필)
  let birth = birthOverride;
  if (!birth) {
    const _u = (typeof getUser === 'function') ? getUser() : null;
    birth = _u?.birthYear
      ? { year:_u.birthYear, month:_u.birthMonth, day:_u.birthDay, hour:_u.birthHour||'' }
      : undefined;
  }

  // 모달 내부에 축소 렌더되는 신탁 연출(전체화면 오버레이는 이미 열린 모달과 중첩되므로 contained 모드 사용)
  const apiPromise = fetch('/chat-detail', {
    method: 'POST',
    headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ date, ohaeng, lang, birth, p2, category })
  }).then(r => r.json());

  try {
    const data = await openOracleOverlay({ apiPromise, contained: true, target: '#detail-loading', cost: 2 });
    const loadEl = document.getElementById('detail-loading');
    const contEl = document.getElementById('detail-content');
    if (loadEl) loadEl.style.display = 'none';
    if (contEl && data.reading) {
      contEl.innerHTML = `<div class="detail-area-card"><div class="detail-area-body" id="detailBody-${category}"></div></div>`;
      if (data.remaining !== undefined) {
        contEl.innerHTML += `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${t.tokenUnit||'잔여 엽전'}: ${data.remaining}</div>`;
      }
      contEl.innerHTML += `<button class="oracle-skip-btn" style="width:100%;margin-top:10px" onclick='shareResultCard({icon:${JSON.stringify(catMeta?.icon || "🔍")},title:${JSON.stringify(catLabel)},filename:"myan-detail"})'>📤 ${{ko:"공유하기",en:"Share",zh:"分享",ja:"共有"}[lang] || "공유하기"}</button>`;
      contEl.style.display = '';
      // 오라클 연출로 이미 충분히 기다렸으므로 stagger:0(한 번에 페이드인)
      const bodyEl = document.getElementById(`detailBody-${category}`);
      if (bodyEl) revealSentences(bodyEl, data.reading, lang, { scrollEl: contEl, stagger: 0 });

      // 상세 풀이 저장 (나중에 다시 보기 위해)
      try {
        const saved = JSON.parse(localStorage.getItem('myan_detail_readings') || '[]');
        saved.unshift({ date, ohaeng, category, reading: data.reading, timestamp: Date.now() });
        // 최근 10개만 보관
        if (saved.length > 10) saved.splice(10);
        localStorage.setItem('myan_detail_readings', JSON.stringify(saved));
      } catch(e) { /* Ignore save error */ }
    } else if (data.error) {
      if (loadEl) { loadEl.style.display = ''; loadEl.textContent = data.error.message; }
    }
  } catch(e) {
    const loadEl = document.getElementById('detail-loading');
    if (loadEl) loadEl.textContent = '오류가 발생했습니다.';
  }
}

// ════════════════════════════════════════════
//  저장된 상세 풀이 다시 보기
// ════════════════════════════════════════════
function showSavedDetailReading(index) {
  const t = getT();
  const saved = JSON.parse(localStorage.getItem('myan_detail_readings') || '[]');
  const item = saved[index];
  if (!item) return;

  let bodyHtml;
  if (item.category && item.reading) {
    // 신규 포맷 — 카테고리 단독
    const catMeta = DETAIL_CATS.find(c => c.key === item.category);
    const label = t.detailCardTitle?.[item.category] || item.category;
    bodyHtml = `<div class="detail-area-card"><div class="detail-area-title">${catMeta?.icon || '🔍'} ${label}</div><div class="detail-area-body">${item.reading}</div></div>`;
  } else if (item.detail) {
    // 구 포맷(4영역 통합) — 저장된 과거 기록 호환용
    const legacyAreas = [
      { key:'health',        icon:'🏥', label: t.detailCardTitle?.health || '건강' },
      { key:'wealth',        icon:'💰', label: t.detailCardTitle?.wealth || '재물' },
      { key:'relationships', icon:'💝', label: '관계' },
      { key:'fortune',       icon:'🎯', label: '행운' }
    ];
    bodyHtml = legacyAreas.map(a => `
      <div class="detail-area-card">
        <div class="detail-area-title">${a.icon} ${a.label}</div>
        <div class="detail-area-body">${item.detail[a.key]||''}</div>
      </div>`).join('');
  } else {
    bodyHtml = '';
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:420px;padding:28px 22px">
      <div class="modal-title">${t.detailTitle||'상세 풀이'} — ${item.ohaeng}</div>
      <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:16px">${item.date}</div>
      <div id="detail-content">${bodyHtml}</div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function showDetailReadingHistory() {
  const t = getT();
  const saved = JSON.parse(localStorage.getItem('myan_detail_readings') || '[]');

  if (saved.length === 0) {
    showToast('저장된 상세 풀이가 없습니다.');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:420px;padding:28px 22px">
      <div class="modal-title"><span class="ic-title">${icon('saju')}</span>상세 풀이 기록</div>
      <div style="max-height:400px;overflow-y:auto;margin:16px 0">
        ${saved.map((item, i) => {
          const catMeta = DETAIL_CATS.find(c => c.key === item.category);
          const label = catMeta ? `${catMeta.icon} ${t.detailCardTitle?.[item.category] || item.category}` : (t.detailTitle || '상세 풀이');
          return `
          <div onclick="showSavedDetailReading(${i}); this.closest('.modal-overlay').remove();"
               style="padding:12px;margin-bottom:8px;border-radius:8px;background:var(--card);border:1px solid var(--border);cursor:pointer">
            <div style="font-weight:600;color:var(--gold)">${label} · ${item.ohaeng}</div>
            <div style="font-size:0.75rem;color:var(--text-dim);margin-top:4px">${item.date}</div>
          </div>`;
        }).join('')}
      </div>
      <button onclick="this.closest('.modal-overlay').remove()" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);cursor:pointer">닫기</button>
    </div>`;
  document.body.appendChild(overlay);
}

// ════════════════════════════════════════════
//  타로카드 뽑기 (재미 콘텐츠, 엽전 1개)
// ════════════════════════════════════════════
let _tarotPicking = false;

function openTarotDraw() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return;
  }
  const t = getT();
  _tarotPicking = false;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:380px;padding:32px 24px;text-align:center">
      <div class="modal-title"><span class="ic-title">${icon('tarot')}</span>${t.tarotTitle || '오늘의 타로'}</div>
      <div style="font-size:0.8rem;color:var(--text-dim);margin:8px 0 22px">${t.tarotPickCard || '마음에 드는 카드를 한 장 골라보세요'}</div>
      <div id="tarotSpread" style="display:flex;justify-content:center;align-items:flex-end;gap:10px">
        <div class="tarot-card-back tarot-spread-card" style="transform:rotate(-8deg)" onclick="_tarotPick(0)">🂠</div>
        <div class="tarot-card-back tarot-spread-card" onclick="_tarotPick(1)">🂠</div>
        <div class="tarot-card-back tarot-spread-card" style="transform:rotate(8deg)" onclick="_tarotPick(2)">🂠</div>
      </div>
      <div id="tarotStatus" style="display:none;font-size:0.8rem;color:var(--text-dim);margin-top:14px"></div>
      <div id="tarotResult" style="display:none;text-align:left;margin-top:18px"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function _tarotPick(idx) {
  if (_tarotPicking) return;
  _tarotPicking = true;
  const t = getT();
  const lang = getLang();
  const token = getGoogleIdToken();

  const spreadEl = document.getElementById('tarotSpread');
  const statusEl = document.getElementById('tarotStatus');
  let backEl = null;
  if (spreadEl) {
    Array.from(spreadEl.children).forEach((el, i) => {
      el.onclick = null;
      if (i === idx) {
        el.style.transform = 'rotate(0deg) scale(1.08)';
        el.id = 'tarotCardBack';
        backEl = el;
      } else {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
      }
    });
  }
  if (statusEl) { statusEl.style.display = ''; statusEl.textContent = t.tarotShuffling || '카드를 섞는 중...'; }

  const started = Date.now();
  const MIN_MS = readMinMs(1); // 오라클 연출보다 훨씬 짧게 — 재미 콘텐츠는 즉각적인 만족감이 중요
  try {
    const res = await fetch('/api/tarot-draw', {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ lang })
    });
    const data = await res.json();
    const remain = MIN_MS - (Date.now() - started);
    if (remain > 0) await new Promise(r => setTimeout(r, remain));

    const resultEl = document.getElementById('tarotResult');
    if (!data.success) {
      if (statusEl) statusEl.innerHTML = _resultErrorHtml(res, data);
      return;
    }
    if (backEl) {
      backEl.classList.add('tarot-flipped');
      backEl.textContent = data.card.icon;
    }
    if (statusEl) statusEl.style.display = 'none';
    if (resultEl) {
      resultEl.style.display = '';
      resultEl.innerHTML = `
        <div style="text-align:center;font-weight:700;color:var(--gold);font-size:1.05rem">${data.card.name}${data.upright ? '' : ` (${t.tarotReversed || '역방향'})`}</div>
        <div class="detail-area-card" style="margin-top:12px"><div class="detail-area-body" id="tarotReadingBody"></div></div>
        ${data.remaining !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${t.tokenUnit||'잔여 엽전'}: ${data.remaining}</div>` : ''}
        <button class="oracle-skip-btn" style="width:100%;margin-top:10px" onclick='shareResultCard({icon:${JSON.stringify(data.card.icon)},title:${JSON.stringify(data.card.name + (data.upright ? "" : " (" + (t.tarotReversed||"역방향") + ")"))},filename:"myan-tarot"})'>📤 ${{ko:"공유하기",en:"Share",zh:"分享",ja:"共有"}[lang] || "공유하기"}</button>
      `;
      const bodyEl = document.getElementById('tarotReadingBody');
      if (bodyEl) revealSentences(bodyEl, data.reading, lang, { scrollEl: resultEl, stagger: 0 });
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = '오류가 발생했습니다.';
  }
}

// ════════════════════════════════════════════
//  띠·별자리 운세 (재미 콘텐츠, 엽전 1개)
// ════════════════════════════════════════════
// 천궁도 트랜싯 — 실제 행성 위치로 보는 오늘.
// 다른 콘텐츠와 달리 AI 글만 보여주지 않고 **근거가 된 하늘**을 함께 띄운다.
// "실제 계산"이 이 기능의 핵심이라 숫자를 감추면 다른 운세와 구별되지 않는다.
function _astroChartHtml(chart, lang, t) {
  return ASTRO_BODY_ORDER.map(b => {
    const c = chart[b];
    if (!c) return '';
    const sign = ASTRO_SIGN_NAMES[lang]?.[c.signIndex] || c.sign;
    const marks = [
      c.retrograde ? `<span style="color:#e08a7a">℞ ${_escHtml(t.astroRetro)}</span>` : '',
      c.nearCusp   ? `<span style="color:var(--text-dim)">·${_escHtml(t.astroCusp)}</span>` : '',
    ].filter(Boolean).join(' ');
    return `
      <div style="display:flex;align-items:baseline;gap:6px;font-size:0.8rem;padding:3px 0">
        <span style="color:var(--gold);width:1.2em;text-align:center">${ASTRO_BODY_ICONS[b]}</span>
        <span style="width:3.6em;color:var(--text-dim)">${_escHtml(ASTRO_BODY_NAMES[lang]?.[b] || b)}</span>
        <span>${_escHtml(sign)} <span style="color:var(--text-dim)">${c.degInSign}°</span></span>
        ${marks}
      </div>`;
  }).join('');
}

function _astroTransitHtml(transits, lang, t) {
  if (!transits?.length) {
    return `<div style="font-size:0.8rem;color:var(--text-dim)">${_escHtml(t.astroNoTransit)}</div>`;
  }
  const B = ASTRO_BODY_NAMES[lang] || ASTRO_BODY_NAMES.ko;
  const A = ASTRO_ASPECT_NAMES[lang] || ASTRO_ASPECT_NAMES.ko;
  return transits.map(tr => `
    <div style="display:flex;align-items:center;gap:6px;font-size:0.8rem;padding:3px 0">
      <span style="color:var(--gold)">${ASTRO_ASPECT_ICONS[tr.name] || '·'}</span>
      <span>${_escHtml(B[tr.transit] || tr.transit)} → ${_escHtml(B[tr.natal] || tr.natal)}</span>
      <span style="color:var(--text-dim)">${_escHtml(A[tr.name] || tr.name)} ${tr.orb}°</span>
    </div>`).join('');
}

async function openAstroTransit() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return;
  }
  const t = getT();
  const _u = (typeof getUser === 'function') ? getUser() : null;
  if (!_u?.birthYear) {
    showToast(t.zodiacNeedBirth || '먼저 마이페이지에서 생년월일을 등록해 주세요.');
    openMyPage();
    return;
  }
  const lang = getLang();
  const birth = { year:_u.birthYear, month:_u.birthMonth, day:_u.birthDay };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:420px;padding:32px 24px;text-align:center">
      <div class="modal-title"><span class="ic-title">${icon('astro')}</span>${_escHtml(t.astroTitle)}</div>
      <div id="astroStatus" style="font-size:0.8rem;color:var(--text-dim);margin-top:14px">${_escHtml(t.astroLoading)}</div>
      <div id="astroResult" style="display:none;text-align:left;margin-top:18px"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const started = Date.now();
  const MIN_MS = readMinMs(1);
  try {
    const res = await fetch('/api/astro-transit', {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ lang, birth })
    });
    const data = await res.json();
    const remain = MIN_MS - (Date.now() - started);
    if (remain > 0) await new Promise(r => setTimeout(r, remain));

    const statusEl = document.getElementById('astroStatus');
    const resultEl = document.getElementById('astroResult');
    if (!data.success) {
      if (statusEl) statusEl.innerHTML = _resultErrorHtml(res, data);
      return;
    }
    if (statusEl) statusEl.style.display = 'none';
    if (!resultEl) return;

    const sunSign = ASTRO_SIGN_NAMES[lang]?.[data.today?.sun?.signIndex] || '';
    resultEl.style.display = '';
    resultEl.innerHTML = `
      <div style="text-align:center;font-weight:700;color:var(--gold);font-size:1.05rem">☉ ${_escHtml(sunSign)}</div>
      ${data.moon ? `<div style="text-align:center;font-size:0.75rem;color:var(--text-dim);margin-top:6px">${MOON_PHASE_ICONS[data.moon.index]} ${_escHtml(MOON_PHASE_NAMES[lang]?.[data.moon.index] || '')} · ${data.moon.illumination}%</div>` : ''}

      <div class="detail-area-card" style="margin-top:14px">
        <div style="font-size:0.78rem;color:var(--gold);margin-bottom:6px">${_escHtml(t.astroTransits)}</div>
        ${_astroTransitHtml(data.transits, lang, t)}
      </div>

      <div class="detail-area-card" style="margin-top:10px">
        <div style="font-size:0.78rem;color:var(--gold);margin-bottom:6px">${_escHtml(t.astroSkyToday)}</div>
        ${_astroChartHtml(data.today, lang, t)}
      </div>

      <div class="detail-area-card" style="margin-top:10px">
        <div style="font-size:0.78rem;color:var(--gold);margin-bottom:6px">${_escHtml(t.astroNatal)}</div>
        ${_astroChartHtml(data.natal, lang, t)}
      </div>

      <div class="detail-area-card" style="margin-top:10px"><div class="detail-area-body" id="astroReadingBody"></div></div>
      <div style="font-size:0.68rem;color:var(--text-dim);margin-top:8px;line-height:1.5">${_escHtml(t.astroNote)}</div>
      ${data.remaining !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${t.tokenUnit||'잔여 엽전'}: ${data.remaining}</div>` : ''}
      <button class="oracle-skip-btn" style="width:100%;margin-top:10px" onclick='shareResultCard({icon:"🪐",title:${JSON.stringify(t.astroTitle + " · " + sunSign)},filename:"myan-astro"})'>📤 ${{ko:"공유하기",en:"Share",zh:"分享",ja:"共有"}[lang] || "공유하기"}</button>
    `;
    const bodyEl = document.getElementById('astroReadingBody');
    if (bodyEl) revealSentences(bodyEl, data.reading, lang, { scrollEl: resultEl, stagger: 0 });
    refreshTokens();
  } catch (e) {
    const statusEl = document.getElementById('astroStatus');
    if (statusEl) statusEl.textContent = getT().netErr || '네트워크 오류가 발생했습니다.';
  }
}

// ════════════════════════════════════════════
//  택일 — 목적을 고르면 만세력에서 좋은 날을 골라 준다 (엽전 2개)
//
//  길흉 판단은 전부 서버(worker.js 의 pickAuspiciousDays)가 역서 데이터로 끝낸다.
//  여기에 규칙을 한 줄이라도 두면 서버가 고른 날과 화면에 뜨는 설명이 어긋나므로,
//  이 파일은 받은 날짜를 그리기만 한다. 길신·흉살 이름도 서버가 자국어로 보내 준다.
// ════════════════════════════════════════════
const TAKIL_PURPOSE_ICONS = {
  wedding:'💍', moving:'📦', opening:'🏪', contract:'📝', travel:'✈️',
  medical:'🩺', build:'🔨', meeting:'🤝', ritual:'🕯️',
};

function _takilDayHtml(d, lang, t, best) {
  let weekday = '';
  try {
    weekday = new Date(`${d.ymd}T00:00:00Z`)
      .toLocaleDateString(lang, { weekday:'short', timeZone:'UTC' });
  } catch { weekday = ''; }

  return `
    <div class="detail-area-card" style="margin-top:8px">
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
        <span style="font-weight:700;color:var(--gold);font-size:${best ? '1.12rem' : '0.98rem'}">${_escHtml(d.ymd)}</span>
        <span style="font-size:0.74rem;color:var(--text-dim)">${_escHtml(weekday)} · ${_escHtml(t.takilLunarShort)} ${d.lunarMonth}.${d.lunarDay} · ${_escHtml(d.ganzhi)}</span>
      </div>
      ${d.jishen?.length ? `<div style="font-size:0.75rem;margin-top:6px"><span style="color:var(--gold)">${_escHtml(t.takilGood)}</span> ${_escHtml(d.jishen.join(', '))}</div>` : ''}
      ${d.xiongsha?.length ? `<div style="font-size:0.75rem;margin-top:3px;color:var(--text-dim)"><span style="color:#e08a7a">${_escHtml(t.takilBad)}</span> ${_escHtml(d.xiongsha.join(', '))}</div>` : ''}
      <div style="font-size:0.71rem;margin-top:3px;color:var(--text-dim)">${_escHtml(t.takilChong)} ${_escHtml(d.chongAnimal || '')}</div>
    </div>`;
}

async function openAuspiciousDays() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return;
  }
  const t = getT();
  const lang = getLang();
  // 생년월일은 있으면 본명 충을 걸러 주고, 없어도 택일 자체는 된다 — 여기서 막지 않는다.
  const _u = (typeof getUser === 'function') ? getUser() : null;
  const birth = _u?.birthYear ? { year:_u.birthYear, month:_u.birthMonth, day:_u.birthDay } : null;

  // 서버는 KST 기준 오늘부터 2년까지만 받는다(worker.js handleAuspiciousDays) — 입력 칸도
  // 같은 KST 로 맞춘다. 브라우저 로컬 시간으로 잡으면 한국 밖에서, 또는 UTC 로 잡으면
  // 00:00~09:00 KST 에 서버가 400 을 내는 날짜를 달력이 고르게 해 준다.
  const _kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const todayStr = _kstToday();
  const [_ty, _tm, _td] = todayStr.split('-').map(n => parseInt(n, 10));
  const maxStr = new Date(Date.UTC(_ty + 2, _tm - 1, _td)).toISOString().slice(0, 10);
  const purposes = Object.keys(TAKIL_PURPOSE_ICONS);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:440px;padding:28px 22px;text-align:center">
      <div class="modal-title"><span class="ic-title">${icon('takil')}</span>${_escHtml(t.takilTitle)}</div>
      <div id="takilForm" style="margin-top:16px">
        <div style="font-size:0.84rem;color:var(--text-dim);margin-bottom:10px">${_escHtml(t.takilPurposeAsk)}</div>
        <div class="takil-grid" id="takilPurposes">
          ${purposes.map(p => `
            <button class="takil-tile" type="button" data-purpose="${p}">
              <span class="takil-ico">${TAKIL_PURPOSE_ICONS[p]}</span>
              <span class="takil-label">${_escHtml(t['takilP_' + p] || p)}</span>
            </button>`).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;text-align:left">
          <label style="flex:1;font-size:0.73rem;color:var(--text-dim)">${_escHtml(t.takilFromLabel)}
            <input type="date" id="takilFrom" class="takil-field" value="${todayStr}" min="${todayStr}" max="${maxStr}">
          </label>
          <label style="width:36%;font-size:0.73rem;color:var(--text-dim)">${_escHtml(t.takilRangeLabel)}
            <select id="takilDays" class="takil-field">
              <option value="30">30</option>
              <option value="60" selected>60</option>
              <option value="90">90</option>
            </select>
          </label>
        </div>
      </div>
      <div id="takilStatus" style="display:none;font-size:0.8rem;color:var(--text-dim);margin-top:14px"></div>
      <div id="takilResult" style="display:none;text-align:left;margin-top:16px"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const run = async (purpose) => {
    const formEl   = overlay.querySelector('#takilForm');
    const statusEl = overlay.querySelector('#takilStatus');
    const resultEl = overlay.querySelector('#takilResult');
    const from = overlay.querySelector('#takilFrom')?.value || undefined;
    const days = parseInt(overlay.querySelector('#takilDays')?.value, 10) || 60;

    if (formEl) formEl.style.display = 'none';
    if (statusEl) { statusEl.style.display = ''; statusEl.textContent = t.takilLoading; }

    const started = Date.now();
    const MIN_MS = readMinMs(2);
    try {
      const res = await fetch('/api/auspicious-days', {
        method: 'POST',
        headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ lang, purpose, birth, from, days })
      });
      const data = await res.json();
      const remain = MIN_MS - (Date.now() - started);
      if (remain > 0) await new Promise(r => setTimeout(r, remain));

      if (!data.success) {
        if (statusEl) statusEl.innerHTML = _resultErrorHtml(res, data);
        // 404 는 "그 기간엔 마땅한 날이 없다 — 기간을 넓혀 보라"는 뜻이고 400 은 입력 문제다.
        // 둘 다 토큰을 쓰지 않았으니, 안내대로 다시 시도할 수 있게 입력칸을 되살린다.
        // (되살리지 않으면 기간을 넓히라는 말만 남고 넓힐 방법이 없다.)
        if ((res.status === 404 || res.status === 400) && formEl) formEl.style.display = '';
        return;
      }
      if (statusEl) statusEl.style.display = 'none';
      if (!resultEl) return;

      const [best, ...rest] = data.picks;
      resultEl.style.display = '';
      resultEl.innerHTML = `
        <div style="text-align:center;font-weight:700;color:var(--gold)">${TAKIL_PURPOSE_ICONS[purpose] || '📅'} ${_escHtml(data.purposeLabel || '')}</div>

        <div style="font-size:0.76rem;color:var(--gold);margin-top:14px">${_escHtml(t.takilBest)}</div>
        ${_takilDayHtml(best, lang, t, true)}

        ${rest.length ? `
          <div style="font-size:0.76rem;color:var(--gold);margin-top:14px">${_escHtml(t.takilAlso)}</div>
          ${rest.map(d => _takilDayHtml(d, lang, t, false)).join('')}` : ''}

        <div class="detail-area-card" style="margin-top:12px"><div class="detail-area-body" id="takilReadingBody"></div></div>
        <div style="font-size:0.68rem;color:var(--text-dim);margin-top:8px;line-height:1.5">${_escHtml(t.takilNote)}</div>
        ${data.remaining !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${t.tokenUnit || '잔여 엽전'}: ${data.remaining}</div>` : ''}
        <button class="oracle-skip-btn" id="takilShare" style="width:100%;margin-top:10px">📤 ${{ko:'공유하기',en:'Share',zh:'分享',ja:'共有'}[lang] || '공유하기'}</button>
      `;

      const bodyEl = overlay.querySelector('#takilReadingBody');
      if (bodyEl) revealSentences(bodyEl, data.reading, lang, { scrollEl: resultEl, stagger: 0 });
      const shareBtn = overlay.querySelector('#takilShare');
      if (shareBtn) shareBtn.addEventListener('click', () => shareResultCard({
        icon: '📅',
        title: `${t.takilTitle} · ${data.purposeLabel} · ${best.ymd}`,
        filename: 'myan-takil',
      }));
      refreshTokens();
    } catch (e) {
      if (statusEl) statusEl.textContent = getT().netErr || '네트워크 오류가 발생했습니다.';
    }
  };

  overlay.querySelectorAll('#takilPurposes [data-purpose]').forEach(btn => {
    btn.addEventListener('click', () => run(btn.dataset.purpose));
  });
}

// ════════════════════════════════════════════
//  대운 — 10년마다 바뀌는 운의 흐름 (엽전 3개)
//
//  방향(순행·역행)과 기운(起運) 시점은 성별과 절기 거리로 정해지는 계산값이라
//  전부 서버가 낸다. 여기서는 받은 구간을 시간순으로 그리고 지금 자리만 강조한다.
// ════════════════════════════════════════════
function _daeunRowHtml(p, lang, t) {
  const on  = (typeof ON !== 'undefined' ? (ON[lang] || ON.ko) : {});
  const col = (typeof OC !== 'undefined' ? OC : {});
  const age = String(t.daeunAge || '{a}~{b}').replace('{a}', p.startAge).replace('{b}', p.endAge);
  return `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:9px;margin-top:3px;${
      p.current ? 'background:rgba(201,169,110,0.10);border:1px solid rgba(201,169,110,0.35)' : ''}">
      <span style="width:8px;height:8px;border-radius:50%;flex:none;background:${col[p.ganElem] || '#888'}"></span>
      <span style="width:5.4em;font-size:0.74rem;color:var(--text-dim)">${p.startYear}~${String(p.endYear).slice(2)}</span>
      <span style="font-weight:700;font-size:0.95rem;color:${p.current ? 'var(--gold)' : 'var(--text)'}">${_escHtml(p.ganzhi)}</span>
      <span style="font-size:0.71rem;color:var(--text-dim)">${_escHtml(on[p.ganElem] || '')}·${_escHtml(on[p.zhiElem] || '')}</span>
      <span style="margin-left:auto;font-size:0.69rem;color:var(--text-dim)">${_escHtml(age)}</span>
    </div>`;
}

async function openDaeun() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return;
  }
  const t = getT();
  const lang = getLang();
  const _u = (typeof getUser === 'function') ? getUser() : null;
  if (!_u?.birthYear) {
    showToast(t.zodiacNeedBirth || '먼저 마이페이지에서 생년월일을 등록해 주세요.');
    openMyPage();
    return;
  }
  // 대운은 방향이 성별로 갈려서 성별 없이는 세울 수 없다 — 엽전을 쓰기 전에 여기서 막는다.
  if (_u.gender !== 'M' && _u.gender !== 'F') {
    showToast(t.daeunNeedGender || '마이페이지에서 성별을 등록해 주세요.');
    openMyPage();
    return;
  }
  const birth = { year:_u.birthYear, month:_u.birthMonth, day:_u.birthDay, hour:_u.birthHour || '' };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:440px;padding:32px 24px;text-align:center">
      <div class="modal-title"><span class="ic-title">${icon('daeun')}</span>${_escHtml(t.daeunTitle)}</div>
      <div id="daeunStatus" style="font-size:0.8rem;color:var(--text-dim);margin-top:14px">${_escHtml(t.daeunLoading)}</div>
      <div id="daeunResult" style="display:none;text-align:left;margin-top:18px"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const started = Date.now();
  const MIN_MS = readMinMs(6);
  try {
    const res = await fetch('/api/daeun', {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ lang, birth, gender: _u.gender })
    });
    const data = await res.json();
    const remain = MIN_MS - (Date.now() - started);
    if (remain > 0) await new Promise(r => setTimeout(r, remain));

    const statusEl = overlay.querySelector('#daeunStatus');
    const resultEl = overlay.querySelector('#daeunResult');
    if (!data.success) {
      if (statusEl) statusEl.innerHTML = _resultErrorHtml(res, data);
      return;
    }
    if (statusEl) statusEl.style.display = 'none';
    if (!resultEl) return;

    const on = (typeof ON !== 'undefined' ? (ON[lang] || ON.ko) : {});
    const qiyun = String(t.daeunQiyun || '')
      .replace('{y}', data.qiyun?.years ?? 0).replace('{m}', data.qiyun?.months ?? 0);
    const p = data.pillars || {};

    resultEl.style.display = '';
    resultEl.innerHTML = `
      <div style="text-align:center">
        <div style="font-weight:700;color:var(--gold);font-size:1.05rem">
          ${data.current ? _escHtml(data.current.ganzhi) : _escHtml(t.daeunNotStarted)}
          ${data.current ? `<span style="font-size:0.74rem;color:var(--text-dim);font-weight:400"> · ${_escHtml(t.daeunNow)}</span>` : ''}
        </div>
        <div style="font-size:0.72rem;color:var(--text-dim);margin-top:5px">
          ${_escHtml(data.forward ? t.daeunForward : t.daeunBackward)} · ${_escHtml(qiyun)}
        </div>
      </div>

      <div class="detail-area-card" style="margin-top:14px">
        <div style="font-size:0.76rem;color:var(--gold);margin-bottom:5px">${_escHtml(t.daeunPillars)}</div>
        <div style="font-size:0.84rem;letter-spacing:1px">${_escHtml([p.yp, p.mp, p.dp, p.hp].filter(Boolean).join('  '))}</div>
      </div>

      <div class="detail-area-card" style="margin-top:10px">
        ${(data.periods || []).map(x => _daeunRowHtml(x, lang, t)).join('')}
      </div>

      ${data.liunian ? `
        <div class="detail-area-card" style="margin-top:10px;font-size:0.8rem">
          <span style="color:var(--gold)">${_escHtml(t.daeunThisYear)}</span>
          ${data.liunian.year} ${_escHtml(data.liunian.ganzhi)}
          <span style="font-size:0.72rem;color:var(--text-dim)">${_escHtml(on[data.liunian.ganElem] || '')}·${_escHtml(on[data.liunian.zhiElem] || '')}</span>
        </div>` : ''}

      <div class="detail-area-card" style="margin-top:10px"><div class="detail-area-body" id="daeunReadingBody"></div></div>
      <div style="font-size:0.68rem;color:var(--text-dim);margin-top:8px;line-height:1.5">${_escHtml(t.daeunNote)}</div>
      ${data.remaining !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${t.tokenUnit || '잔여 엽전'}: ${data.remaining}</div>` : ''}
      <button class="oracle-skip-btn" id="daeunShare" style="width:100%;margin-top:10px">📤 ${{ko:'공유하기',en:'Share',zh:'分享',ja:'共有'}[lang] || '공유하기'}</button>
    `;

    const bodyEl = overlay.querySelector('#daeunReadingBody');
    if (bodyEl) revealSentences(bodyEl, data.reading, lang, { scrollEl: resultEl, stagger: 0 });
    const shareBtn = overlay.querySelector('#daeunShare');
    if (shareBtn) shareBtn.addEventListener('click', () => shareResultCard({
      icon: '🌊',
      title: `${t.daeunTitle}${data.current ? ' · ' + data.current.ganzhi : ''}`,
      filename: 'myan-daeun',
    }));
    refreshTokens();
  } catch (e) {
    const statusEl = overlay.querySelector('#daeunStatus');
    if (statusEl) statusEl.textContent = getT().netErr || '네트워크 오류가 발생했습니다.';
  }
}

// ════════════════════════════════════════════
//  이름 풀이 — 한글 초성의 발음오행 (엽전 2개)
//
//  오행 배정과 상생·상극 판정은 서버가 한다. 같은 표를 여기에 또 두면 화면과 본문이
//  어긋나므로, 이 파일은 서버가 준 글자별 오행을 색으로 그리기만 한다.
// ════════════════════════════════════════════
function _nameCharsHtml(chars, pairs, lang, t) {
  const on  = (typeof ON !== 'undefined' ? (ON[lang] || ON.ko) : {});
  const col = (typeof OC !== 'undefined' ? OC : {});
  const REL = { saeng: t.nameSaeng, geuk: t.nameGeuk, bihwa: t.nameBihwa };
  const ARROW = { saeng: '→', geuk: '⊣', bihwa: '·' };

  return `<div style="display:flex;align-items:flex-start;justify-content:center;gap:2px;flex-wrap:wrap">
    ${chars.map((c, i) => `
      ${i > 0 ? `<div style="text-align:center;padding-top:14px;min-width:2.4em">
        <div style="font-size:0.9rem;color:${pairs[i-1]?.relation === 'geuk' ? '#e08a7a' : 'var(--gold)'}">${ARROW[pairs[i-1]?.relation] || '·'}</div>
        <div style="font-size:0.6rem;color:var(--text-dim)">${_escHtml(REL[pairs[i-1]?.relation] || '')}</div>
      </div>` : ''}
      <div style="text-align:center;min-width:3.1em">
        <div style="font-size:1.5rem;font-weight:700;color:${col[c.elem] || 'var(--text)'}">${_escHtml(c.ch)}</div>
        <div style="font-size:0.62rem;color:var(--text-dim);margin-top:2px">${_escHtml(c.choseong)}</div>
        <div style="font-size:0.66rem;color:var(--text-dim)">${_escHtml(on[c.elem] || c.elem)}</div>
      </div>`).join('')}
  </div>`;
}

async function openNameReading() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return;
  }
  const t = getT();
  const lang = getLang();
  // 생년월일은 있으면 사주와 대조해 주고, 없어도 이름만으로 풀린다 — 여기서 막지 않는다.
  const _u = (typeof getUser === 'function') ? getUser() : null;
  const birth = _u?.birthYear ? { year:_u.birthYear, month:_u.birthMonth, day:_u.birthDay, hour:_u.birthHour || '' } : null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:430px;padding:30px 24px;text-align:center">
      <div class="modal-title"><span class="ic-title">${icon('name')}</span>${_escHtml(t.nameTitle)}</div>
      <div id="nameForm" style="margin-top:16px">
        <div style="font-size:0.84rem;color:var(--text-dim);margin-bottom:10px">${_escHtml(t.nameAsk)}</div>
        <input type="text" id="nameInput" class="takil-field" maxlength="6" autocomplete="off"
               placeholder="${_escHtml(t.namePlaceholder)}" style="text-align:center;font-size:1rem">
        <button class="oracle-skip-btn" id="nameRunBtn" style="width:100%;margin-top:12px">${_escHtml(t.nameRun)}</button>
      </div>
      <div id="nameStatus" style="display:none;font-size:0.8rem;color:var(--text-dim);margin-top:14px"></div>
      <div id="nameResult" style="display:none;text-align:left;margin-top:16px"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#nameInput')?.focus();

  const run = async () => {
    const name = (overlay.querySelector('#nameInput')?.value || '').trim();
    if (!name) return;
    const formEl   = overlay.querySelector('#nameForm');
    const statusEl = overlay.querySelector('#nameStatus');
    const resultEl = overlay.querySelector('#nameResult');

    if (formEl) formEl.style.display = 'none';
    if (statusEl) { statusEl.style.display = ''; statusEl.textContent = t.nameLoading; }

    const started = Date.now();
    const MIN_MS = readMinMs(4);
    try {
      const res = await fetch('/api/name-reading', {
        method: 'POST',
        headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ lang, name, birth })
      });
      const data = await res.json();
      const remain = MIN_MS - (Date.now() - started);
      if (remain > 0) await new Promise(r => setTimeout(r, remain));

      if (!data.success) {
        // 이름을 잘못 적은 경우가 흔하다 — 다시 적을 수 있게 입력칸을 되살린다.
        if (statusEl) statusEl.innerHTML = _resultErrorHtml(res, data);
        if (res.status === 400 && formEl) { formEl.style.display = ''; overlay.querySelector('#nameInput')?.focus(); }
        return;
      }
      if (statusEl) statusEl.style.display = 'none';
      if (!resultEl) return;

      const on = (typeof ON !== 'undefined' ? (ON[lang] || ON.ko) : {});
      resultEl.style.display = '';
      resultEl.innerHTML = `
        <div class="detail-area-card">
          <div style="font-size:0.76rem;color:var(--gold);margin-bottom:8px;text-align:center">${_escHtml(t.nameFlow)}</div>
          ${_nameCharsHtml(data.chars, data.pairs, lang, t)}
        </div>

        ${(data.fills?.length || data.overs?.length) ? `
          <div class="detail-area-card" style="margin-top:10px;font-size:0.78rem">
            ${data.fills?.length ? `<div><span style="color:var(--gold)">${_escHtml(t.nameFills)}</span> ${_escHtml(data.fills.map(e => on[e] || e).join(', '))}</div>` : ''}
            ${data.overs?.length ? `<div style="margin-top:4px;color:var(--text-dim)">${_escHtml(t.nameOvers)} ${_escHtml(data.overs.map(e => on[e] || e).join(', '))}</div>` : ''}
          </div>` : ''}

        <div class="detail-area-card" style="margin-top:10px"><div class="detail-area-body" id="nameReadingBody"></div></div>
        <div style="font-size:0.68rem;color:var(--text-dim);margin-top:8px;line-height:1.5">${_escHtml(t.nameNote)}</div>
        ${data.remaining !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${t.tokenUnit || '잔여 엽전'}: ${data.remaining}</div>` : ''}
        <button class="oracle-skip-btn" id="nameShare" style="width:100%;margin-top:10px">📤 ${{ko:'공유하기',en:'Share',zh:'分享',ja:'共有'}[lang] || '공유하기'}</button>
      `;

      const bodyEl = overlay.querySelector('#nameReadingBody');
      if (bodyEl) revealSentences(bodyEl, data.reading, lang, { scrollEl: resultEl, stagger: 0 });
      const shareBtn = overlay.querySelector('#nameShare');
      if (shareBtn) shareBtn.addEventListener('click', () => shareResultCard({
        icon: '✍️',
        title: `${t.nameTitle} · ${data.name}`,
        filename: 'myan-name',
      }));
      refreshTokens();
    } catch (e) {
      if (statusEl) statusEl.textContent = getT().netErr || '네트워크 오류가 발생했습니다.';
    }
  };

  overlay.querySelector('#nameRunBtn')?.addEventListener('click', run);
  overlay.querySelector('#nameInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
}

// ════════════════════════════════════════════
//  궁합 시기 — 두 사람에게 언제가 좋은 해인지 (엽전 3개)
//
//  합·충 판정과 좋은 해 선별은 서버가 끝낸다. 여기서는 연도별 관계를 표로 그린다.
// ════════════════════════════════════════════
function _ctRowHtml(row, lang, t, meName, youName) {
  const REL = { yukhap: t.ctYukhap, samhap: t.ctSamhap, chung: t.ctChung, none: t.ctNone };
  const tone = r => r === 'chung' ? '#e08a7a' : (r === 'none' ? 'var(--text-dim)' : 'var(--gold)');
  const cell = side => `<span style="color:${tone(side.relation)};font-size:0.72rem">${_escHtml(REL[side.relation] || '')}</span>`
    + (side.daeun ? `<span style="color:var(--text-dim);font-size:0.62rem"> ${_escHtml(side.daeun)}</span>` : '');

  return `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:8px;margin-top:2px;${
      row.best ? 'background:rgba(201,169,110,0.10);border:1px solid rgba(201,169,110,0.35)' : ''}">
      <span style="width:3.2em;font-size:0.78rem;font-weight:${row.best ? '700' : '400'};color:${row.best ? 'var(--gold)' : 'var(--text)'}">${row.year}</span>
      <span style="width:2.6em;font-size:0.72rem;color:var(--text-dim)">${_escHtml(row.ganzhi)}</span>
      <span style="flex:1">${cell(row.a)}</span>
      <span style="flex:1">${cell(row.b)}</span>
    </div>`;
}

async function openCompatTiming() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return;
  }
  const t = getT();
  const lang = getLang();
  const _u = (typeof getUser === 'function') ? getUser() : null;
  if (!_u?.birthYear) {
    showToast(t.ctNeedBirth || '먼저 마이페이지에서 생년월일을 등록해 주세요.');
    openMyPage();
    return;
  }
  const me = {
    year:_u.birthYear, month:_u.birthMonth, day:_u.birthDay,
    hour:_u.birthHour || '', gender:_u.gender || '', name:_u.name || '',
  };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:440px;padding:30px 22px;text-align:center">
      <div class="modal-title"><span class="ic-title">${icon('compat')}</span>${_escHtml(t.ctTitle)}</div>
      <div id="ctForm" style="margin-top:16px">
        <div style="font-size:0.84rem;color:var(--text-dim);margin-bottom:10px">${_escHtml(t.ctAsk)}</div>
        <input type="text" id="ctName" class="takil-field" maxlength="12" autocomplete="off"
               placeholder="${_escHtml(t.ctPartnerName)}" style="text-align:center">
        <input type="date" id="ctBirth" class="takil-field" style="margin-top:8px">
        <div style="display:flex;gap:8px;margin-top:8px">
          <select id="ctHour" class="takil-field" style="flex:1"></select>
          <select id="ctGender" class="takil-field" style="width:38%">
            <option value="">-</option>
            <option value="M">${{ko:'남',en:'M',zh:'男',ja:'男'}[lang] || '남'}</option>
            <option value="F">${{ko:'여',en:'F',zh:'女',ja:'女'}[lang] || '여'}</option>
          </select>
        </div>
        <button class="oracle-skip-btn" id="ctRunBtn" style="width:100%;margin-top:12px">${_escHtml(t.ctRun)}</button>
      </div>
      <div id="ctStatus" style="display:none;font-size:0.8rem;color:var(--text-dim);margin-top:14px"></div>
      <div id="ctResult" style="display:none;text-align:left;margin-top:16px"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  // 시진 선택지는 마이페이지와 같은 목록을 쓴다 — 모르면 비워 두면 된다.
  const hourSel = overlay.querySelector('#ctHour');
  if (hourSel) {
    const unknown = { ko:'시간 모름', en:'Hour unknown', zh:'时辰不详', ja:'時刻不明' }[lang] || '시간 모름';
    const hours = ['자시','축시','인시','묘시','진시','사시','오시','미시','신시','유시','술시','해시'];
    hourSel.innerHTML = `<option value="">${_escHtml(unknown)}</option>`
      + hours.map(h => `<option value="${h}">${h}</option>`).join('');
  }

  const run = async () => {
    const birthVal = overlay.querySelector('#ctBirth')?.value || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthVal)) {
      showToast(t.ctAsk || '상대방의 생년월일을 알려 주세요');
      return;
    }
    const [py, pm, pd] = birthVal.split('-').map(n => parseInt(n, 10));
    const partner = {
      year: py, month: pm, day: pd,
      hour: overlay.querySelector('#ctHour')?.value || '',
      gender: overlay.querySelector('#ctGender')?.value || '',
      name: (overlay.querySelector('#ctName')?.value || '').trim(),
    };

    const formEl   = overlay.querySelector('#ctForm');
    const statusEl = overlay.querySelector('#ctStatus');
    const resultEl = overlay.querySelector('#ctResult');
    if (formEl) formEl.style.display = 'none';
    if (statusEl) { statusEl.style.display = ''; statusEl.textContent = t.ctLoading; }

    const started = Date.now();
    const MIN_MS = readMinMs(6);
    try {
      const res = await fetch('/api/compat-timing', {
        method: 'POST',
        headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ lang, p1: me, p2: partner })
      });
      const data = await res.json();
      const remain = MIN_MS - (Date.now() - started);
      if (remain > 0) await new Promise(r => setTimeout(r, remain));

      if (!data.success) {
        if (statusEl) statusEl.innerHTML = _resultErrorHtml(res, data);
        if (res.status === 400 && formEl) formEl.style.display = '';
        return;
      }
      if (statusEl) statusEl.style.display = 'none';
      if (!resultEl) return;

      const bestYears = new Set((data.best || []).map(b => b.year));
      const rows = (data.timeline || []).map(r => ({ ...r, best: bestYears.has(r.year) }));
      const meLabel = data.nameA && data.nameA !== 'A' ? data.nameA : t.ctMe;
      const youLabel = data.nameB && data.nameB !== 'B' ? data.nameB : t.ctPartner;

      resultEl.style.display = '';
      resultEl.innerHTML = `
        <div style="text-align:center;font-weight:700;color:var(--gold)">
          ${_escHtml(t.ctBest)} · ${(data.best || []).map(b => b.year).join(', ')}
        </div>

        <div class="detail-area-card" style="margin-top:12px">
          <div style="display:flex;align-items:center;gap:8px;padding:0 8px 4px;font-size:0.68rem;color:var(--gold)">
            <span style="width:3.2em">${_escHtml(t.ctTimeline)}</span>
            <span style="width:2.6em"></span>
            <span style="flex:1">${_escHtml(meLabel)}</span>
            <span style="flex:1">${_escHtml(youLabel)}</span>
          </div>
          ${rows.map(r => _ctRowHtml(r, lang, t, meLabel, youLabel)).join('')}
        </div>

        <div class="detail-area-card" style="margin-top:10px"><div class="detail-area-body" id="ctReadingBody"></div></div>
        <div style="font-size:0.68rem;color:var(--text-dim);margin-top:8px;line-height:1.5">${_escHtml(t.ctNote)}</div>
        ${data.remaining !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${t.tokenUnit || '잔여 엽전'}: ${data.remaining}</div>` : ''}
        <button class="oracle-skip-btn" id="ctShare" style="width:100%;margin-top:10px">📤 ${{ko:'공유하기',en:'Share',zh:'分享',ja:'共有'}[lang] || '공유하기'}</button>
      `;

      const bodyEl = overlay.querySelector('#ctReadingBody');
      if (bodyEl) revealSentences(bodyEl, data.reading, lang, { scrollEl: resultEl, stagger: 0 });
      const shareBtn = overlay.querySelector('#ctShare');
      if (shareBtn) shareBtn.addEventListener('click', () => shareResultCard({
        icon: '💞',
        title: `${t.ctTitle} · ${(data.best || []).map(b => b.year).join(', ')}`,
        filename: 'myan-compat-timing',
      }));
      refreshTokens();
    } catch (e) {
      if (statusEl) statusEl.textContent = getT().netErr || '네트워크 오류가 발생했습니다.';
    }
  };

  overlay.querySelector('#ctRunBtn')?.addEventListener('click', run);
}

async function openZodiacFortune() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return;
  }
  const t = getT();
  const _u = (typeof getUser === 'function') ? getUser() : null;
  if (!_u?.birthYear) {
    showToast(t.zodiacNeedBirth || '먼저 마이페이지에서 생년월일을 등록해 주세요.');
    openMyPage();
    return;
  }
  const lang = getLang();
  const birth = { year:_u.birthYear, month:_u.birthMonth, day:_u.birthDay };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:380px;padding:32px 24px;text-align:center">
      <div class="modal-title"><span class="ic-title">${icon('zodiac')}</span>${t.zodiacTitle || '띠·별자리 운세'}</div>
      <div id="zodiacStatus" style="font-size:0.8rem;color:var(--text-dim);margin-top:14px">${t.zodiacLoading || '운세를 계산하는 중...'}</div>
      <div id="zodiacResult" style="display:none;text-align:left;margin-top:18px"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const started = Date.now();
  const MIN_MS = readMinMs(1);
  try {
    const res = await fetch('/api/zodiac-fortune', {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ lang, birth })
    });
    const data = await res.json();
    const remain = MIN_MS - (Date.now() - started);
    if (remain > 0) await new Promise(r => setTimeout(r, remain));

    const statusEl = document.getElementById('zodiacStatus');
    const resultEl = document.getElementById('zodiacResult');
    if (!data.success) {
      if (statusEl) statusEl.innerHTML = _resultErrorHtml(res, data);
      return;
    }
    if (statusEl) statusEl.style.display = 'none';
    if (resultEl) {
      resultEl.style.display = '';
      const animalLabel = ZODIAC_ANIMAL_NAMES[lang]?.[data.animalIndex] || data.animal;
      const zodiacLabel = WESTERN_ZODIAC_NAMES[lang]?.[data.zodiacIndex] || data.zodiac;
      const animalSuffix = lang === 'ko' ? '띠' : '';
      resultEl.innerHTML = `
        <div style="text-align:center;font-weight:700;color:var(--gold);font-size:1.05rem">${animalLabel}${animalSuffix} · ${zodiacLabel}</div>
        ${data.moon ? `<div style="text-align:center;font-size:0.75rem;color:var(--text-dim);margin-top:6px">${MOON_PHASE_ICONS[data.moon.index]} ${MOON_PHASE_NAMES[lang]?.[data.moon.index] || ''} · ${data.moon.illumination}%${data.mercury?.retrograde ? ` &nbsp;·&nbsp; <span style="color:#e08a7a">☿ ${t.mercuryRetro || '수성 역행'}</span>` : ''}</div>` : ''}
        <div class="detail-area-card" style="margin-top:12px"><div class="detail-area-body" id="zodiacReadingBody"></div></div>
        ${data.remaining !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${t.tokenUnit||'잔여 엽전'}: ${data.remaining}</div>` : ''}
        <button class="oracle-skip-btn" style="width:100%;margin-top:10px" onclick='shareResultCard({icon:"🐉",title:${JSON.stringify(animalLabel + animalSuffix + " · " + zodiacLabel)},filename:"myan-zodiac"})'>📤 ${{ko:"공유하기",en:"Share",zh:"分享",ja:"共有"}[lang] || "공유하기"}</button>
      `;
      const bodyEl = document.getElementById('zodiacReadingBody');
      if (bodyEl) revealSentences(bodyEl, data.reading, lang, { scrollEl: resultEl, stagger: 0 });
    }
  } catch (e) {
    const statusEl = document.getElementById('zodiacStatus');
    if (statusEl) statusEl.textContent = '오류가 발생했습니다.';
  }
}

// ════════════════════════════════════════════
//  오늘의 럭키 컬러·음식·노래 (재미 콘텐츠, 엽전 1개)
// ════════════════════════════════════════════
async function openLuckyPicks() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return;
  }
  const t = getT();
  const lang = getLang();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:380px;padding:32px 24px;text-align:center">
      <div class="modal-title"><span class="ic-title">${icon('lucky')}</span>${t.luckyTitle || '오늘의 럭키 아이템'}</div>
      <div id="luckyStatus" style="font-size:0.8rem;color:var(--text-dim);margin-top:14px">${t.luckyLoading || '오늘의 행운을 찾는 중...'}</div>
      <div id="luckyResult" style="display:none;text-align:left;margin-top:18px"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const started = Date.now();
  const MIN_MS = readMinMs(1);
  try {
    const res = await fetch('/api/lucky-picks', {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ lang })
    });
    const data = await res.json();
    const remain = MIN_MS - (Date.now() - started);
    if (remain > 0) await new Promise(r => setTimeout(r, remain));

    const statusEl = document.getElementById('luckyStatus');
    const resultEl = document.getElementById('luckyResult');
    if (!data.success) {
      if (statusEl) statusEl.innerHTML = _resultErrorHtml(res, data);
      return;
    }
    if (statusEl) statusEl.style.display = 'none';
    if (resultEl) {
      const p = data.picks || {};
      resultEl.style.display = '';
      resultEl.innerHTML = `
        <div class="detail-area-card"><div class="detail-area-title">🎨 ${t.luckyColor||'럭키 컬러'}${p.color?.name ? ' · ' + p.color.name : ''}</div><div class="detail-area-body">${p.color?.reason||''}</div></div>
        <div class="detail-area-card" style="margin-top:10px"><div class="detail-area-title">🍽️ ${t.luckyFood||'럭키 음식'}${p.food?.name ? ' · ' + p.food.name : ''}</div><div class="detail-area-body">${p.food?.reason||''}</div></div>
        <div class="detail-area-card" style="margin-top:10px"><div class="detail-area-title">🎵 ${t.luckySong||'럭키 무드'}${p.song?.name ? ' · ' + p.song.name : ''}</div><div class="detail-area-body">${p.song?.reason||''}</div></div>
        ${data.remaining !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${t.tokenUnit||'잔여 엽전'}: ${data.remaining}</div>` : ''}
        <button class="oracle-skip-btn" style="width:100%;margin-top:10px" onclick='shareResultCard({icon:"🍀",title:${JSON.stringify(t.luckyTitle || "오늘의 럭키 아이템")},subtitle:${JSON.stringify([p.color?.name,p.food?.name,p.song?.name].filter(Boolean).join(" · ").replace(/'/g, "’"))},filename:"myan-lucky"})'>📤 ${{ko:"공유하기",en:"Share",zh:"分享",ja:"共有"}[lang] || "공유하기"}</button>
      `;
    }
  } catch (e) {
    const statusEl = document.getElementById('luckyStatus');
    if (statusEl) statusEl.textContent = '오류가 발생했습니다.';
  }
}

// ════════════════════════════════════════════
//  오행 유형 궁합 테스트 (재미 콘텐츠) — 퀴즈는 무료, 궁합 해석만 엽전 1개
// ════════════════════════════════════════════
let _typeTestState = null;

function openTypeTest() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return;
  }
  const t = getT();
  const questions = t.typeQ || [];
  if (!questions.length) return;

  _typeTestState = { scores: { 木:0, 火:0, 土:0, 金:0, 水:0 }, qIdx: 0, questions, myType: null };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `<div class="modal-box" style="max-width:400px;padding:32px 24px" id="typeTestBox"></div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  _renderTypeQuestion();
}

function _renderTypeQuestion() {
  const s = _typeTestState;
  const box = document.getElementById('typeTestBox');
  if (!s || !box) return;
  const t = getT();
  const q = s.questions[s.qIdx];
  const progress = (t.typeProgress || '{n} / {total}').replace('{n}', s.qIdx + 1).replace('{total}', s.questions.length);
  box.innerHTML = `
    <div class="modal-title" style="text-align:center">🔯 ${t.typeTitle || '오행 유형 테스트'}</div>
    <div style="text-align:center;font-size:0.72rem;color:var(--text-dim);margin:4px 0 18px">${progress}</div>
    <div style="text-align:center;font-weight:600;margin-bottom:16px">${q.q}</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${q.opts.map((opt, i) => `<button class="rx-detail-btn" style="justify-content:center;padding:12px 14px" onclick="_typeTestAnswer(${i})">${opt}</button>`).join('')}
    </div>`;
}

function _typeTestAnswer(i) {
  const s = _typeTestState;
  if (!s) return;
  s.scores[TYPE_ORDER[i]] += 1;
  s.qIdx++;
  if (s.qIdx < s.questions.length) {
    _renderTypeQuestion();
  } else {
    let best = TYPE_ORDER[0];
    TYPE_ORDER.forEach(k => { if (s.scores[k] > s.scores[best]) best = k; });
    s.myType = best;
    _renderTypeResult();
  }
}

function _renderTypeResult() {
  const s = _typeTestState;
  const box = document.getElementById('typeTestBox');
  if (!s || !box) return;
  const t = getT();
  const lg = getLang();
  const desc = t.typeDesc?.[s.myType] || '';
  const elemLabel = ON[lg]?.[s.myType] || s.myType;
  box.innerHTML = `
    <div class="modal-title" style="text-align:center">${t.typeResultTitle || '당신의 유형은'}</div>
    <div style="text-align:center;font-size:1.6rem;font-weight:700;color:var(--gold);margin:12px 0 8px">${elemLabel}</div>
    <div class="detail-area-card" style="margin-bottom:18px"><div class="detail-area-body" style="text-align:center">${desc}</div></div>
    <div style="text-align:center;font-size:0.85rem;font-weight:600;margin-bottom:10px">${t.typePickPartner || '궁합 볼 상대의 유형을 골라주세요'}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:14px">
      ${TYPE_ORDER.map(el => `<button class="rx-detail-btn" onclick="_typeTestPickPartner('${el}')">${ON[lg]?.[el] || el}</button>`).join('')}
    </div>
    <button onclick="openTypeTest()" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text-dim);cursor:pointer;font-size:0.85rem">${t.typeRetake || '다시 하기'}</button>
    <div id="typeCompatArea" style="margin-top:16px"></div>`;
}

async function _typeTestPickPartner(partnerType) {
  const s = _typeTestState;
  if (!s) return;
  const t = getT();
  const lang = getLang();
  const token = getGoogleIdToken();
  const areaEl = document.getElementById('typeCompatArea');
  if (!areaEl) return;
  areaEl.innerHTML = `<div style="font-size:0.8rem;color:var(--text-dim);text-align:center">${t.typeCompatLoading || '궁합을 분석하는 중...'}</div>`;

  const started = Date.now();
  const MIN_MS = readMinMs(2);
  try {
    const res = await fetch('/api/type-compat', {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ lang, myType: s.myType, partnerType })
    });
    const data = await res.json();
    const remain = MIN_MS - (Date.now() - started);
    if (remain > 0) await new Promise(r => setTimeout(r, remain));

    if (!data.success) {
      areaEl.innerHTML = _resultErrorHtml(res, data);
      return;
    }
    areaEl.innerHTML = `
      <div class="detail-area-card"><div class="detail-area-body" id="typeCompatBody"></div></div>
      ${data.remaining !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${t.tokenUnit||'잔여 엽전'}: ${data.remaining}</div>` : ''}
      <button class="oracle-skip-btn" style="width:100%;margin-top:10px" onclick='shareResultCard({icon:"🔯",title:${JSON.stringify((ON_KR[s.myType]||s.myType) + " × " + (ON_KR[partnerType]||partnerType))},filename:"myan-typecompat"})'>📤 ${{ko:"공유하기",en:"Share",zh:"分享",ja:"共有"}[lang] || "공유하기"}</button>
    `;
    const bodyEl = document.getElementById('typeCompatBody');
    if (bodyEl) revealSentences(bodyEl, data.reading, lang, { scrollEl: areaEl, stagger: 0 });
  } catch (e) {
    areaEl.innerHTML = `<div style="font-size:0.8rem;color:var(--text-dim);text-align:center">오류가 발생했습니다.</div>`;
  }
}

// ════════════════════════════════════════════
//  오늘의 운세 모음 (재미 콘텐츠, 엽전 1개)
//  짝사랑 / 관계 신뢰 / 가족 / 미래 / 학업 / 성격 / 인상 / 성공
// ════════════════════════════════════════════
function openFortuneTopics() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return;
  }
  const t = getT();
  const _u = (typeof getUser === 'function') ? getUser() : null;
  const hasBirth = !!_u?.birthYear;
  const overlay = document.createElement('div');
  overlay.id = 'fortuneTopicsOverlay';
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  const topicBtnsHtml = FORTUNE_TOPICS.map(f => `
    <button class="fortune-topic-btn" onclick="_fortuneTopicPick('${f.key}')">
      <span class="fortune-topic-icon">${f.icon}</span>
      <span class="fortune-topic-label">${t.fortuneTopicTitle?.[f.key] || f.key}</span>
    </button>`).join('');
  const birthHint = hasBirth ? '' : `
    <div onclick="document.getElementById('fortuneTopicsOverlay')?.remove(); openMyPage();"
      style="font-size:0.75rem;color:var(--gold-light);background:rgba(201,169,110,0.08);border:1px solid rgba(201,169,110,0.25);border-radius:8px;padding:10px 12px;margin-bottom:14px;cursor:pointer;text-align:center">
      ${t.fortuneNeedBirthHint || '생년월일을 등록하면 사주를 반영한 더 정확한 풀이를 받을 수 있어요 →'}
    </div>`;
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:420px;padding:28px 22px">
      <div class="modal-title"><span class="ic-title">${icon('topic')}</span>${t.fortuneModalTitle || '오늘의 운세 모음'}</div>
      <div style="font-size:0.8rem;color:var(--text-dim);margin:6px 0 18px">${t.fortuneModalSub || '궁금한 주제를 골라보세요'}</div>
      ${birthHint}
      <div id="fortuneTopicGrid" class="fortune-topic-grid">${topicBtnsHtml}</div>
      <div id="fortuneTopicResult" style="display:none;text-align:left;margin-top:18px"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

let _fortunePicking = false;
async function _fortuneTopicPick(key) {
  if (_fortunePicking) return;
  _fortunePicking = true;
  const t = getT();
  const lang = getLang();
  const token = getGoogleIdToken();
  const grid = document.getElementById('fortuneTopicGrid');
  const resultEl = document.getElementById('fortuneTopicResult');
  if (!grid || !resultEl) { _fortunePicking = false; return; }

  grid.style.display = 'none';
  resultEl.style.display = '';
  resultEl.innerHTML = `<div style="font-size:0.8rem;color:var(--text-dim);text-align:center">${t.fortuneLoading || '기운을 살펴보는 중...'}</div>`;

  // 프로필에 생년월일이 있으면 개인 맞춤(사주 반영), 없어도 오늘의 기운만으로 동작
  const _u = (typeof getUser === 'function') ? getUser() : null;
  const birth = _u?.birthYear ? { year:_u.birthYear, month:_u.birthMonth, day:_u.birthDay, hour:_u.birthHour||'' } : undefined;

  const started = Date.now();
  const MIN_MS = readMinMs(1);
  try {
    const res = await fetch('/api/fortune-topic', {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ lang, topic: key, birth })
    });
    const data = await res.json();
    const remain = MIN_MS - (Date.now() - started);
    if (remain > 0) await new Promise(r => setTimeout(r, remain));

    if (!data.success) {
      resultEl.innerHTML = _resultErrorHtml(res, data);
      _fortunePicking = false;
      return;
    }
    const topicLabel = t.fortuneTopicTitle?.[key] || data.title;
    const backLabel = { ko:'‹ 다른 주제 보기', en:'‹ Pick another topic', zh:'‹ 选择其他主题', ja:'‹ 他のテーマを見る' }[lang] || '‹ 다른 주제 보기';
    resultEl.innerHTML = `
      <div style="text-align:center;font-weight:700;color:var(--gold);font-size:1.05rem">${data.icon || ''} ${topicLabel}</div>
      <div class="detail-area-card" style="margin-top:12px"><div class="detail-area-body" id="fortuneTopicBody"></div></div>
      ${data.remaining !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${t.tokenUnit||'잔여 엽전'}: ${data.remaining}</div>` : ''}
      <button class="oracle-skip-btn" style="width:100%;margin-top:10px" onclick='shareResultCard({icon:${JSON.stringify(data.icon || "✨")},title:${JSON.stringify(topicLabel)},filename:"myan-fortune"})'>📤 ${{ko:"공유하기",en:"Share",zh:"分享",ja:"共有"}[lang] || "공유하기"}</button>
      <button class="oracle-skip-btn" style="width:100%;margin-top:8px" onclick="_fortuneTopicBack()">${backLabel}</button>
    `;
    const bodyEl = document.getElementById('fortuneTopicBody');
    if (bodyEl) revealSentences(bodyEl, data.reading, lang, { scrollEl: resultEl, stagger: 0 });
  } catch (e) {
    resultEl.innerHTML = `<div style="font-size:0.8rem;color:var(--text-dim);text-align:center">오류가 발생했습니다.</div>`;
  }
  _fortunePicking = false;
}

function _fortuneTopicBack() {
  const grid = document.getElementById('fortuneTopicGrid');
  const resultEl = document.getElementById('fortuneTopicResult');
  if (grid) grid.style.display = '';
  if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
}

// ════════════════════════════════════════════
//  주역(周易) 괘 풀이 (재미 콘텐츠, 엽전 1개)
// ════════════════════════════════════════════
function openIching() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return;
  }
  const t = getT();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:400px;padding:28px 22px;text-align:center">
      <div class="modal-title"><span class="ic-title">${icon('iching')}</span>${t.ichingTitle || '주역 괘 풀이'}</div>
      <textarea id="ichingQuestion" placeholder="${t.ichingAskPlaceholder || '궁금한 것을 적어보세요 (선택)'}" maxlength="200" style="width:100%;margin-top:14px;padding:12px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,0.03);color:var(--text);font-size:0.9rem;box-sizing:border-box;min-height:64px;resize:vertical"></textarea>
      <button class="fif-submit" style="width:100%;margin-top:14px;padding:12px" id="ichingCastBtn" onclick="_ichingCast()">${t.ichingCastBtn || '괘 뽑기'}</button>
      <div id="ichingResult" style="display:none;text-align:left;margin-top:18px"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function _ichingCast() {
  const t = getT();
  const lang = getLang();
  const token = getGoogleIdToken();
  const btn = document.getElementById('ichingCastBtn');
  const question = (document.getElementById('ichingQuestion')?.value || '').trim();
  const resultEl = document.getElementById('ichingResult');
  if (!btn || !resultEl) return;
  btn.disabled = true;
  btn.textContent = t.ichingCasting || '괘를 뽑는 중...';
  resultEl.style.display = '';
  resultEl.innerHTML = `<div style="font-size:0.8rem;color:var(--text-dim);text-align:center">${t.ichingCasting || '괘를 뽑는 중...'}</div>`;

  const started = Date.now();
  const MIN_MS = readMinMs(1);
  try {
    const res = await fetch('/api/iching', {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ lang, question })
    });
    const data = await res.json();
    const remain = MIN_MS - (Date.now() - started);
    if (remain > 0) await new Promise(r => setTimeout(r, remain));

    if (!data.success) {
      resultEl.innerHTML = _resultErrorHtml(res, data);
      btn.disabled = false; btn.textContent = t.ichingCastBtn || '괘 뽑기';
      return;
    }
    // 괘 시각화 (위에서 아래로 그리는 관례에 맞춰 배열을 뒤집어 표시)
    const barsHtml = [...data.lines].reverse().map(l => `
      <div style="display:flex;justify-content:center;align-items:center;gap:6px;margin:3px 0">
        ${l.yang
          ? `<div style="width:70px;height:8px;background:var(--gold);border-radius:2px"></div>`
          : `<div style="width:70px;height:8px;display:flex;gap:10px"><div style="flex:1;background:var(--gold);border-radius:2px"></div><div style="flex:1;background:var(--gold);border-radius:2px"></div></div>`}
        ${l.changing ? `<span style="font-size:0.65rem;color:var(--text-dim)">${t.ichingChanging || '변효'}</span>` : ''}
      </div>`).join('');
    document.getElementById('ichingQuestion')?.remove();
    btn.style.display = 'none';
    resultEl.innerHTML = `
      <div style="margin-bottom:14px">${barsHtml}</div>
      <div class="detail-area-card"><div class="detail-area-body" id="ichingReadingBody"></div></div>
      ${data.remaining !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${t.tokenUnit||'잔여 엽전'}: ${data.remaining}</div>` : ''}
      <button class="oracle-skip-btn" style="width:100%;margin-top:10px" onclick='shareResultCard({icon:"🀄",title:${JSON.stringify(t.ichingTitle || "주역 괘 풀이")},filename:"myan-iching"})'>📤 ${{ko:"공유하기",en:"Share",zh:"分享",ja:"共有"}[lang] || "공유하기"}</button>
    `;
    const bodyEl = document.getElementById('ichingReadingBody');
    if (bodyEl) revealSentences(bodyEl, data.reading, lang, { scrollEl: resultEl, stagger: 0 });
  } catch (e) {
    resultEl.innerHTML = `<div style="font-size:0.8rem;color:var(--text-dim);text-align:center">오류가 발생했습니다.</div>`;
    btn.disabled = false; btn.textContent = t.ichingCastBtn || '괘 뽑기';
  }
}

// ════════════════════════════════════════════
//  수비학(數秘學) 라이프패스 넘버 (재미 콘텐츠, 엽전 1개)
// ════════════════════════════════════════════
async function openNumerology() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return;
  }
  const t = getT();
  const _u = (typeof getUser === 'function') ? getUser() : null;
  if (!_u?.birthYear) {
    showToast(t.numerologyNeedBirth || '먼저 마이페이지에서 생년월일을 등록해 주세요.');
    openMyPage();
    return;
  }
  const lang = getLang();
  const birth = { year:_u.birthYear, month:_u.birthMonth, day:_u.birthDay };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:380px;padding:32px 24px;text-align:center">
      <div class="modal-title"><span class="ic-title">${icon('numerology')}</span>${t.numerologyTitle || '라이프패스 넘버'}</div>
      <div id="numerologyStatus" style="font-size:0.8rem;color:var(--text-dim);margin-top:14px">${t.numerologyLoading || '숫자를 계산하는 중...'}</div>
      <div id="numerologyResult" style="display:none;text-align:left;margin-top:18px"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const started = Date.now();
  const MIN_MS = readMinMs(2);
  try {
    const res = await fetch('/api/numerology', {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ lang, birth })
    });
    const data = await res.json();
    const remain = MIN_MS - (Date.now() - started);
    if (remain > 0) await new Promise(r => setTimeout(r, remain));

    const statusEl = document.getElementById('numerologyStatus');
    const resultEl = document.getElementById('numerologyResult');
    if (!data.success) {
      if (statusEl) statusEl.innerHTML = _resultErrorHtml(res, data);
      return;
    }
    if (statusEl) statusEl.style.display = 'none';
    if (resultEl) {
      resultEl.style.display = '';
      resultEl.innerHTML = `
        <div style="text-align:center;font-weight:700;color:var(--gold);font-size:1.6rem">${data.lifePath}</div>
        <div style="text-align:center;font-size:0.78rem;color:var(--text-dim);margin-bottom:10px">${t.numerologyYourNumber || '당신의 라이프패스 넘버'}</div>
        <div class="detail-area-card"><div class="detail-area-body" id="numerologyReadingBody"></div></div>
        ${data.remaining !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${t.tokenUnit||'잔여 엽전'}: ${data.remaining}</div>` : ''}
        <button class="oracle-skip-btn" style="width:100%;margin-top:10px" onclick='shareResultCard({icon:"🔢",title:${JSON.stringify((t.numerologyYourNumber || "라이프패스 넘버") + " " + data.lifePath)},filename:"myan-numerology"})'>📤 ${{ko:"공유하기",en:"Share",zh:"分享",ja:"共有"}[lang] || "공유하기"}</button>
      `;
      const bodyEl = document.getElementById('numerologyReadingBody');
      if (bodyEl) revealSentences(bodyEl, data.reading, lang, { scrollEl: resultEl, stagger: 0 });
    }
  } catch (e) {
    const statusEl = document.getElementById('numerologyStatus');
    if (statusEl) statusEl.textContent = '오류가 발생했습니다.';
  }
}

// ════════════════════════════════════════════
//  토정비결풍 신년운세 (재미 콘텐츠, 엽전 2개)
// ════════════════════════════════════════════
async function openTojeong() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return;
  }
  const t = getT();
  const _u = (typeof getUser === 'function') ? getUser() : null;
  if (!_u?.birthYear) {
    showToast(t.tojeongNeedBirth || '먼저 마이페이지에서 생년월일을 등록해 주세요.');
    openMyPage();
    return;
  }
  const lang = getLang();
  const birth = { year:_u.birthYear, month:_u.birthMonth, day:_u.birthDay, hour:_u.birthHour||'' };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:420px;padding:28px 22px;text-align:center;max-height:80vh;overflow-y:auto">
      <div class="modal-title"><span class="ic-title">${icon('tojeong')}</span>${t.tojeongTitle || '토정비결풍 신년운세'}</div>
      <div style="font-size:0.72rem;color:var(--text-dim);margin-top:8px;opacity:0.85">${t.tojeongNotice || ''}</div>
      <div id="tojeongStatus" style="font-size:0.8rem;color:var(--text-dim);margin-top:14px">${t.tojeongLoading || '한 해의 신수를 살펴보는 중...'}</div>
      <div id="tojeongResult" style="display:none;text-align:left;margin-top:18px"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const started = Date.now();
  const MIN_MS = readMinMs(4);
  try {
    const res = await fetch('/api/tojeong', {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ lang, birth })
    });
    const data = await res.json();
    const remain = MIN_MS - (Date.now() - started);
    if (remain > 0) await new Promise(r => setTimeout(r, remain));

    const statusEl = document.getElementById('tojeongStatus');
    const resultEl = document.getElementById('tojeongResult');
    if (!data.success) {
      if (statusEl) statusEl.innerHTML = _resultErrorHtml(res, data);
      return;
    }
    if (statusEl) statusEl.style.display = 'none';
    if (resultEl) {
      resultEl.style.display = '';
      resultEl.innerHTML = `
        <div class="detail-area-card"><div class="detail-area-body" id="tojeongReadingBody"></div></div>
        ${data.remaining !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${t.tokenUnit||'잔여 엽전'}: ${data.remaining}</div>` : ''}
        <button class="oracle-skip-btn" style="width:100%;margin-top:10px" onclick='shareResultCard({icon:"🧧",title:${JSON.stringify((data.year || "") + " " + (t.tojeongTitle || "토정비결풍 신년운세"))},filename:"myan-tojeong"})'>📤 ${{ko:"공유하기",en:"Share",zh:"分享",ja:"共有"}[lang] || "공유하기"}</button>
      `;
      const bodyEl = document.getElementById('tojeongReadingBody');
      if (bodyEl) revealSentences(bodyEl, data.reading, lang, { scrollEl: resultEl, stagger: 0 });
    }
  } catch (e) {
    const statusEl = document.getElementById('tojeongStatus');
    if (statusEl) statusEl.textContent = '오류가 발생했습니다.';
  }
}

// ════════════════════════════════════════════
//  미니앱에만 있던 콘텐츠 11종 — 웹으로 옮긴 것
//
//  서버 핸들러도 프롬프트도 이미 있었다. 없던 것은 웹 화면뿐이라, 같은 기능이
//  미니앱에서는 팔리는데 웹에서는 살 수조차 없었다(재물운·신살·귀인·전생·천직·
//  작명·이사 방위·올해 세운·속궁합·배우자궁·띠 순위).
//
//  아홉은 흐름이 완전히 같다: 로그인 → 생년월일 → 모달 → /api/* → 최소 대기 →
//  풀이. openTojeong 을 아홉 번 복사하면 700줄이 늘고, 고칠 일이 생기면 아홉
//  군데를 고쳐야 한다. 다른 것은 스펙뿐이라 표로 두고 openReading 이 공통을 맡는다.
//  (미니앱도 같은 구조다 — mini/src/main.js 의 bodyFor / extractResult)
//
//  ⚠️ cost 는 여기가 아니라 _homeSections() 에 적힌다. home-sections.test.mjs 가
//     그 값을 서버의 accountSpend 와 대조하므로, 값을 바꿀 때는 서버부터 볼 것.
// ════════════════════════════════════════════
const _READINGS = {
  wealth:    { icon:'wealth',    path:'/api/wealth',        titleKey:'wealthTitle' },
  sinsal:    { icon:'sinsal',    path:'/api/sinsal',        titleKey:'sinsalTitle' },
  gwiin:     { icon:'gwiin',     path:'/api/gwiin',         titleKey:'gwiinTitle' },
  pastlife:  { icon:'pastlife',  path:'/api/past-life',     titleKey:'pastlifeTitle' },
  vocation:  { icon:'vocation',  path:'/api/vocation',      titleKey:'vocationTitle' },
  // 이사 방위는 목적을 함께 받는다. 웹에서는 '이사'로 고정한다 — 목적 고르기는
  // 택일(openAuspiciousDays)이 이미 맡고 있어 두 화면이 겹칠 이유가 없다.
  direction: { icon:'direction', path:'/api/direction',     titleKey:'directionTitle', extra:{ purpose:'move' } },
  yearluck:  { icon:'yearluck',  path:'/api/year-luck',     titleKey:'yearluckTitle' },
  spouse:    { icon:'spouse',    path:'/api/spouse-palace', titleKey:'spouseTitle' },
  // 띠 순위는 생년만 본다 — 서버도 성별을 읽지 않으므로 보내지 않는다.
  ttirank:   { icon:'ttirank',   path:'/api/tti-ranking',   titleKey:'ttirankTitle', noGender:true },
};

/**
 * 풀이와 함께 오는 "값"들을 한 줄씩 뽑는다.
 *
 * 서버는 산문(reading) 말고도 계산 결과를 함께 준다 — 신살 목록, 귀인의 띠,
 * 좋은 방위 같은 것들이다. 산문만 보여 주면 그 화면의 알맹이가 본문에 묻힌다
 * ("당신의 귀인은 소띠와 양띠입니다" 가 그렇다).
 *
 * 모르는 필드는 조용히 버린다 — 서버가 필드를 늘려도 화면이 깨지지 않는다.
 * 미니앱에서 같은 일을 하는 것은 mini/src/main.js 의 extractResult 다.
 */
function _readingFacts(d, t) {
  const out = [];
  const add = (label, value) => { if (label && value) out.push([label, String(value)]); };
  // 목록을 한 줄로 잇는다. 서버가 필드 이름을 바꾸면 map 이 undefined 를 뱉는데,
  // 그대로 join 하면 "undefined, undefined" 라는 멀쩡해 보이는 문자열이 되어
  // 화면에 그대로 뜬다. 값이 없으면 줄 자체가 없는 편이 맞다.
  const list = (arr, pick) => (arr || []).map(pick).filter(v => v != null && v !== '').join(', ');

  // 신살 — 없으면 "없다"고 적는 편이 빈 화면보다 낫다.
  if (Array.isArray(d.hits)) {
    add(t.factSinsal, d.hits.length ? list(d.hits, h => h.name) : t.factNoSinsal);
    if (d.samjae?.years?.length) {
      add(d.samjae.inSamjae ? t.factSamjaeNow : t.factSamjaeNext,
          list(d.samjae.years, y => y.year));
    }
  }
  // 귀인 — 알맹이는 "누가 나에게 귀인인가"다. 그 줄이 맨 앞에 와야 한다.
  if (Array.isArray(d.people) && d.people.length) add(t.factGwiinPeople, list(d.people, p => p.tti));
  if (Array.isArray(d.stars) && d.stars.length)   add(t.factGwiinStars,  list(d.stars, x => x.name));
  if (Array.isArray(d.years) && d.years.length && d.people) {
    add(t.factGwiinYears, list(d.years.slice(0, 3), y => y.year));
  }
  // 이사 방위
  if (d.gungName) add(t.factGung, `${d.gungName} ${d.group || ''}`.trim());
  if (Array.isArray(d.good) && d.good.length) add(t.factGoodDir, list(d.good, x => x.dir));
  if (Array.isArray(d.bad) && d.bad.length)   add(t.factBadDir,  list(d.bad, x => x.dir));
  // 재물운
  if (d.shape) add(t.factWealthShape, d.shape);
  if (Array.isArray(d.wealthYears) && d.wealthYears.length) {
    add(t.factWealthYears, list(d.wealthYears.filter(y => !y.feeds).slice(0, 4), y => y.year));
  }
  // 천직 — 가장 두터운 십신 셋
  if (Array.isArray(d.top) && d.top.length) add(t.factSipsinTop, list(d.top, x => x));
  // 배우자궁
  if (d.branch && d.sipsin) add(t.factSpouseGung, `${d.branch}(${d.elem || ''}) ${d.sipsin}`);
  // 띠 순위 — 내 띠가 몇 위인지가 제일 궁금한 값이다.
  if (d.mine?.name) add(t.factMyTti, `${d.mine.name} ${d.mine.rank}`);

  if (!out.length) return '';
  return `<div class="detail-area-card" style="margin-bottom:10px;font-size:0.78rem">${
    out.map(([k, v]) =>
      `<div style="display:flex;gap:8px;margin:3px 0"><span style="color:var(--gold);flex:0 0 auto">${_escHtml(k)}</span><span>${_escHtml(v)}</span></div>`
    ).join('')}</div>`;
}

/** _READINGS 의 한 항목을 연다. 차감도 안내도 서버가 하므로 여기서는 값을 모른다. */
async function openReading(id) {
  const spec = _READINGS[id];
  if (!spec) return;
  const ctx = _readingContext();
  if (!ctx) return;
  const { token, t, lang, birth, user } = ctx;
  const title = t[spec.titleKey] || '';

  const overlay = _readingOverlay(spec.icon, title, '', t);
  const body = { lang, birth, ...(spec.noGender ? {} : { gender:user.gender || '' }), ...(spec.extra || {}) };
  await _runReading(overlay, spec, body, token, t, lang, title);
}

/** 모달 껍데기. formHtml 이 있으면 먼저 입력을 받고, 없으면 바로 부르는 모양이 된다. */
function _readingOverlay(iconName, title, formHtml, t) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:420px;padding:28px 22px;text-align:center;max-height:80vh;overflow-y:auto">
      <div class="modal-title"><span class="ic-title">${icon(iconName)}</span>${_escHtml(title)}</div>
      ${formHtml ? `<div id="rdForm" style="margin-top:16px">${formHtml}</div>` : ''}
      <div id="rdStatus" style="${formHtml ? 'display:none;' : ''}font-size:0.8rem;color:var(--text-dim);margin-top:14px">${formHtml ? '' : _escHtml(t.readingLoading || '')}</div>
      <div id="rdResult" style="display:none;text-align:left;margin-top:18px"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  return overlay;
}

/** 호출·최소 대기·그리기. 입력을 먼저 받는 콘텐츠(작명·속궁합)도 이 뒤를 함께 쓴다. */
async function _runReading(overlay, spec, body, token, t, lang, title) {
  const statusEl = overlay.querySelector('#rdStatus');
  const resultEl = overlay.querySelector('#rdResult');
  const started = Date.now();
  const MIN_MS = readMinMs(4);
  try {
    const res = await fetch(spec.path, {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const remain = MIN_MS - (Date.now() - started);
    if (remain > 0) await new Promise(r => setTimeout(r, remain));

    if (!data.success) {
      if (statusEl) { statusEl.style.display = ''; statusEl.innerHTML = _resultErrorHtml(res, data); }
      return false;
    }
    if (statusEl) statusEl.style.display = 'none';
    if (!resultEl) return true;
    resultEl.style.display = '';
    resultEl.innerHTML = `
      ${_readingFacts(data, t)}
      <div class="detail-area-card"><div class="detail-area-body" id="rdBody"></div></div>
      ${data.remaining !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${_escHtml(t.tokenUnit || '잔여 엽전')}: ${data.remaining}</div>` : ''}
      <button class="oracle-skip-btn" style="width:100%;margin-top:10px" onclick='shareResultCard({icon:"✦",title:${JSON.stringify(title)},filename:"myan-reading"})'>📤 ${{ ko:'공유하기', en:'Share', zh:'分享', ja:'共有' }[lang] || '공유하기'}</button>`;
    const bodyEl = overlay.querySelector('#rdBody');
    if (bodyEl) revealSentences(bodyEl, data.reading, lang, { scrollEl: resultEl, stagger: 0 });
    return true;
  } catch (e) {
    if (statusEl) { statusEl.style.display = ''; statusEl.textContent = '오류가 발생했습니다.'; }
    return false;
  }
}

// 타일은 동작을 fn:'openXxx()' 라는 **문자열**로 들고 있다가 onclick 에 그대로 박는다.
// 인자를 넘기는 형태로 두면 home-sections.test.mjs 의 "그 함수가 실제로 있는가"
// 검사를 빠져나가므로, 이름 있는 함수로 하나씩 둔다.
function openWealth()       { return openReading('wealth'); }
function openSinsal()       { return openReading('sinsal'); }
function openGwiin()        { return openReading('gwiin'); }
function openPastLife()     { return openReading('pastlife'); }
function openVocation()     { return openReading('vocation'); }
function openDirection()    { return openReading('direction'); }
function openYearLuck()     { return openReading('yearluck'); }
function openSpousePalace() { return openReading('spouse'); }
function openTtiRanking()   { return openReading('ttirank'); }

/** 작명 — 성(姓)을 먼저 받는다. */
async function openNaming() {
  const ctx = _readingContext();
  if (!ctx) return;
  const { token, t, lang, birth, user } = ctx;
  const spec = { icon:'naming', path:'/api/naming' };
  const title = t.namingTitle || '';
  const overlay = _readingOverlay('naming', title, `
    <div style="font-size:0.84rem;color:var(--text-dim);margin-bottom:10px">${_escHtml(t.namingAsk || '')}</div>
    <input type="text" id="rdSurname" class="takil-field" maxlength="2" autocomplete="off"
           placeholder="${_escHtml(t.namingPlaceholder || '')}" style="text-align:center;font-size:1rem">
    <button class="oracle-skip-btn" id="rdRun" style="width:100%;margin-top:12px">${_escHtml(t.namingRun || '')}</button>`, t);
  overlay.querySelector('#rdSurname')?.focus();

  const run = async () => {
    const surname = (overlay.querySelector('#rdSurname')?.value || '').trim();
    if (!surname) return;
    _readingStartWait(overlay, t);
    await _runReading(overlay, spec, { lang, birth, gender:user.gender || '', surname }, token, t, lang, title);
  };
  overlay.querySelector('#rdRun')?.addEventListener('click', run);
  overlay.querySelector('#rdSurname')?.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
}

/** 속궁합 — 상대의 생년월일을 먼저 받는다(궁합 시기와 같은 입력 문구를 쓴다). */
async function openIntimacy() {
  const ctx = _readingContext();
  if (!ctx) return;
  const { token, t, lang, birth, user } = ctx;
  const spec = { icon:'intimacy', path:'/api/intimacy' };
  const title = t.intimacyTitle || '';
  const overlay = _readingOverlay('intimacy', title, `
    <div style="font-size:0.84rem;color:var(--text-dim);margin-bottom:10px">${_escHtml(t.ctAsk || '')}</div>
    <input type="date" id="rdPartnerBirth" class="takil-field">
    <button class="oracle-skip-btn" id="rdRun" style="width:100%;margin-top:12px">${_escHtml(t.ctRun || '')}</button>`, t);

  overlay.querySelector('#rdRun')?.addEventListener('click', async () => {
    const m = (overlay.querySelector('#rdPartnerBirth')?.value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return;
    _readingStartWait(overlay, t);
    const partner = { year:+m[1], month:+m[2], day:+m[3], hour:'' };
    await _runReading(overlay, spec, { lang, birth, partner, gender:user.gender || '' }, token, t, lang, title);
  });
}

/** 로그인·생년월일을 확인하고 공통 값을 돌려준다. 못 갖추면 안내하고 null. */
function _readingContext() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return null;
  }
  const t = getT();
  const user = (typeof getUser === 'function') ? getUser() : null;
  if (!user?.birthYear) {
    showToast(t.tojeongNeedBirth || '먼저 마이페이지에서 생년월일을 등록해 주세요.');
    openMyPage();
    return null;
  }
  return {
    token, t, lang: getLang(), user,
    birth: { year:user.birthYear, month:user.birthMonth, day:user.birthDay, hour:user.birthHour || '' },
  };
}

/** 입력칸을 접고 기다리는 표시로 넘어간다. */
function _readingStartWait(overlay, t) {
  const form = overlay.querySelector('#rdForm');
  if (form) form.style.display = 'none';
  const st = overlay.querySelector('#rdStatus');
  if (st) { st.style.display = ''; st.textContent = t.readingLoading || ''; }
}

// ════════════════════════════════════════════
//  관상·손금 사진 분석 (재미 콘텐츠, 엽전 2개)
// ════════════════════════════════════════════
let _photoReadingType = null;
let _photoReadingDataUrl = null;

function openPhotoReading() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return;
  }
  const t = getT();
  _photoReadingType = null;
  _photoReadingDataUrl = null;
  const overlay = document.createElement('div');
  overlay.id = 'photoReadingOverlay';
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:400px;padding:28px 22px;text-align:center">
      <div class="modal-title"><span class="ic-title">${icon('photo')}</span>${t.photoModalTitle || '관상·손금 보기'}</div>
      <div style="font-size:0.85rem;color:var(--text-dim);margin:14px 0">${t.photoPickType || '어떤 것을 볼까요?'}</div>
      <div style="display:flex;gap:10px">
        <button class="fortune-topic-btn" style="flex:1" onclick="_photoReadingPickType('face')">
          <span class="fortune-topic-icon">🙂</span><span class="fortune-topic-label">${t.photoTypeFace || '관상'}</span>
        </button>
        <button class="fortune-topic-btn" style="flex:1" onclick="_photoReadingPickType('palm')">
          <span class="fortune-topic-icon">🖐️</span><span class="fortune-topic-label">${t.photoTypePalm || '손금'}</span>
        </button>
      </div>
      <div id="photoReadingBody" style="display:none;text-align:left;margin-top:18px"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function _photoReadingPickType(type) {
  _photoReadingType = type;
  _photoReadingDataUrl = null;
  const t = getT();
  const box = document.querySelector('#photoReadingOverlay .modal-box');
  if (!box) return;
  box.innerHTML = `
    <div class="modal-title">${type === 'face' ? '🙂' : '🖐️'} ${t[type === 'face' ? 'photoTypeFace' : 'photoTypePalm']}</div>
    <div style="font-size:0.7rem;color:var(--text-dim);margin:12px 0;opacity:0.85">${t.photoUploadNotice || ''}</div>
    <div id="photoPreviewWrap" style="margin:12px 0"></div>
    <input type="file" id="photoFileInput" accept="image/*" capture="environment" style="display:none" onchange="_photoReadingFileChange(event)">
    <button class="fif-submit" style="width:100%;padding:12px" id="photoChooseBtn" onclick="document.getElementById('photoFileInput').click()">${t.photoChooseFile || '사진 선택'}</button>
    <button class="fif-submit" style="width:100%;padding:12px;margin-top:8px;display:none;opacity:0.5;pointer-events:none" id="photoSubmitBtn" onclick="_photoReadingSubmit()">${t.photoSubmitBtn || '분석 시작'}</button>
    <div id="photoReadingBody" style="display:none;text-align:left;margin-top:18px"></div>
  `;
}

function _photoReadingFileChange(evt) {
  const file = evt.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // 클라이언트에서 리사이즈(최대 640px) + JPEG 압축 후 전송 — 업로드 용량·비용 절감
      const MAX_DIM = 640;
      let { width, height } = img;
      if (width > height && width > MAX_DIM) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
      else if (height > MAX_DIM) { width = Math.round(width * MAX_DIM / height); height = MAX_DIM; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      _photoReadingDataUrl = canvas.toDataURL('image/jpeg', 0.75);

      const t = getT();
      const previewWrap = document.getElementById('photoPreviewWrap');
      if (previewWrap) previewWrap.innerHTML = `<img src="${_photoReadingDataUrl}" style="max-width:100%;max-height:220px;border-radius:12px;border:1px solid var(--border)">`;
      const chooseBtn = document.getElementById('photoChooseBtn');
      if (chooseBtn) chooseBtn.textContent = t.photoRetake || '다시 선택';
      const submitBtn = document.getElementById('photoSubmitBtn');
      if (submitBtn) { submitBtn.style.display = ''; submitBtn.style.opacity = '1'; submitBtn.style.pointerEvents = 'auto'; }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

async function _photoReadingSubmit() {
  if (!_photoReadingDataUrl || !_photoReadingType) return;
  const t = getT();
  const lang = getLang();
  const token = getGoogleIdToken();
  const box = document.querySelector('#photoReadingOverlay .modal-box');
  if (!box) return;
  const submitBtn = document.getElementById('photoSubmitBtn');
  const chooseBtn = document.getElementById('photoChooseBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = t.photoAnalyzing || '사진을 분석하는 중...'; }
  if (chooseBtn) chooseBtn.style.display = 'none';

  const bodyEl = document.getElementById('photoReadingBody');
  if (bodyEl) {
    bodyEl.style.display = '';
    bodyEl.innerHTML = `<div style="font-size:0.8rem;color:var(--text-dim);text-align:center">${t.photoAnalyzing || '사진을 분석하는 중...'}</div>`;
  }

  const started = Date.now();
  const MIN_MS = readMinMs(4);
  try {
    const res = await fetch('/api/photo-reading', {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ lang, type: _photoReadingType, image: _photoReadingDataUrl })
    });
    const data = await res.json();
    const remain = MIN_MS - (Date.now() - started);
    if (remain > 0) await new Promise(r => setTimeout(r, remain));

    if (!data.success) {
      if (bodyEl) bodyEl.innerHTML = _resultErrorHtml(res, data);
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = t.photoSubmitBtn || '분석 시작'; }
      if (chooseBtn) chooseBtn.style.display = '';
      return;
    }
    document.getElementById('photoFileInput')?.remove();
    if (submitBtn) submitBtn.remove();
    if (chooseBtn) chooseBtn.remove();
    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="detail-area-card"><div class="detail-area-body" id="photoReadingText"></div></div>
        ${data.remaining !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${t.tokenUnit||'잔여 엽전'}: ${data.remaining}</div>` : ''}
      `;
      const textEl = document.getElementById('photoReadingText');
      if (textEl) revealSentences(textEl, data.reading, lang, { scrollEl: bodyEl, stagger: 0 });
    }
  } catch (e) {
    if (bodyEl) bodyEl.innerHTML = `<div style="font-size:0.8rem;color:var(--text-dim);text-align:center">오류가 발생했습니다.</div>`;
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = t.photoSubmitBtn || '분석 시작'; }
    if (chooseBtn) chooseBtn.style.display = '';
  }
}

// 마이페이지 — 저장된 관상·손금 기록 갤러리
async function showPhotoGallery() {
  const token = getGoogleIdToken();
  if (!token) { showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.'); return; }
  const t = getT();
  const modal = document.createElement('div');
  modal.id = 'photo-gallery-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.8); z-index: 9999;
    display: flex; align-items: center; justify-content: center;
    padding: 20px; animation: fadeIn 0.3s ease;
  `;
  modal.innerHTML = `
    <div style="background: var(--card); border: 1px solid var(--border); border-radius: 16px; max-width: 600px; width: 100%; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column;">
      <div style="padding: 24px 24px 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 1.3rem; color: var(--gold); letter-spacing: 1px;">🖐️ ${t.photoGalleryTitle || '관상·손금 기록'}</div>
        <button onclick="document.getElementById('photo-gallery-modal').remove()" style="background: none; border: none; color: var(--text-dim); font-size: 1.5rem; cursor: pointer; padding: 0; width: 32px; height: 32px;">×</button>
      </div>
      <div id="photo-gallery-content" style="flex: 1; overflow-y: auto; padding: 20px;">
        <div style="text-align: center; padding: 40px; color: var(--text-dim);"><div style="font-size: 2rem; margin-bottom: 12px;">⏳</div></div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  try {
    const res = await fetch('/api/photo-readings?limit=20', { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    const content = document.getElementById('photo-gallery-content');
    if (!data.ok || !data.items || data.items.length === 0) {
      content.innerHTML = `<div style="text-align: center; padding: 60px 20px; color: var(--text-dim);"><div style="font-size: 3rem; margin-bottom: 16px; opacity: 0.3;">🖐️</div><div>${t.photoGalleryEmpty || '아직 기록이 없습니다'}</div></div>`;
      return;
    }
    content.innerHTML = data.items.map(item => {
      const date = new Date(item.createdAt * 1000);
      const dateStr = `${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}`;
      const typeLabel = t[item.type === 'face' ? 'photoTypeFace' : 'photoTypePalm'] || item.type;
      return `
        <div style="display:flex;gap:12px;background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 12px;">
          <img src="${item.image}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0">
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:start">
              <div style="font-size:0.85rem;color:var(--gold)">${item.type === 'face' ? '🙂' : '🖐️'} ${typeLabel} · ${dateStr}</div>
              <button onclick="_deletePhotoReading(${item.id})" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:0.75rem">✕</button>
            </div>
            <div style="font-size:0.78rem;color:var(--text-dim);margin-top:4px;white-space:pre-wrap;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${item.reading}</div>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    const content = document.getElementById('photo-gallery-content');
    if (content) content.innerHTML = `<div style="text-align: center; padding: 60px 20px; color: #e05a4a;">⚠️ 기록을 불러오는데 실패했습니다</div>`;
  }
}

async function _deletePhotoReading(id) {
  const t = getT();
  if (!confirm(t.photoDeleteConfirm || '이 기록을 삭제할까요?')) return;
  const token = getGoogleIdToken();
  try {
    await fetch(`/api/photo-reading?id=${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    showToast(t.photoDeleted || '삭제되었습니다');
    document.getElementById('photo-gallery-modal')?.remove();
    showPhotoGallery();
  } catch (e) {}
}

// ════════════════════════════════════════════
//  꿈해몽 (재미 콘텐츠, 엽전 1개)
// ════════════════════════════════════════════
function openDreamInterpretation() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return;
  }
  const t = getT();
  const overlay = document.createElement('div');
  overlay.id = 'dreamOverlay';
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:400px;padding:28px 22px;text-align:center">
      <div class="modal-title"><span class="ic-title">${icon('dream')}</span>${t.dreamTitle || '꿈해몽'}</div>
      <textarea id="dreamInput" placeholder="${t.dreamPlaceholder || '어떤 꿈을 꾸셨나요?'}" maxlength="500" style="width:100%;margin-top:14px;padding:12px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,0.03);color:var(--text);font-size:0.9rem;box-sizing:border-box;min-height:90px;resize:vertical"></textarea>
      <button class="fif-submit" style="width:100%;margin-top:14px;padding:12px" id="dreamSubmitBtn" onclick="_dreamSubmit()">${t.dreamSubmitBtn || '해몽 보기'}</button>
      <div id="dreamResult" style="display:none;text-align:left;margin-top:18px"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function _dreamSubmit() {
  const t = getT();
  const lang = getLang();
  const token = getGoogleIdToken();
  const btn = document.getElementById('dreamSubmitBtn');
  const dream = (document.getElementById('dreamInput')?.value || '').trim();
  const resultEl = document.getElementById('dreamResult');
  if (!btn || !resultEl) return;
  if (!dream) { showToast(t.dreamPlaceholder || '꿈 내용을 입력해 주세요.'); return; }
  btn.disabled = true;
  btn.textContent = t.dreamLoading || '꿈을 해몽하는 중...';
  resultEl.style.display = '';
  resultEl.innerHTML = `<div style="font-size:0.8rem;color:var(--text-dim);text-align:center">${t.dreamLoading || '꿈을 해몽하는 중...'}</div>`;

  const started = Date.now();
  const MIN_MS = readMinMs(1);
  try {
    const res = await fetch('/api/dream-interpretation', {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ lang, dream })
    });
    const data = await res.json();
    const remain = MIN_MS - (Date.now() - started);
    if (remain > 0) await new Promise(r => setTimeout(r, remain));

    if (!data.success) {
      resultEl.innerHTML = _resultErrorHtml(res, data);
      btn.disabled = false; btn.textContent = t.dreamSubmitBtn || '해몽 보기';
      return;
    }
    document.getElementById('dreamInput')?.remove();
    btn.style.display = 'none';
    resultEl.innerHTML = `
      <div class="detail-area-card"><div class="detail-area-body" id="dreamReadingBody"></div></div>
      ${data.remaining !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${t.tokenUnit||'잔여 엽전'}: ${data.remaining}</div>` : ''}
      <button class="oracle-skip-btn" style="width:100%;margin-top:10px" onclick='shareResultCard({icon:"🌙",title:${JSON.stringify(t.dreamTitle || "꿈해몽")},filename:"myan-dream"})'>📤 ${{ko:"공유하기",en:"Share",zh:"分享",ja:"共有"}[lang] || "공유하기"}</button>
    `;
    const bodyEl = document.getElementById('dreamReadingBody');
    if (bodyEl) revealSentences(bodyEl, data.reading, lang, { scrollEl: resultEl, stagger: 0 });
  } catch (e) {
    resultEl.innerHTML = `<div style="font-size:0.8rem;color:var(--text-dim);text-align:center">오류가 발생했습니다.</div>`;
    btn.disabled = false; btn.textContent = t.dreamSubmitBtn || '해몽 보기';
  }
}

// ════════════════════════════════════════════
//  오늘의 로또번호 추천 (재미 콘텐츠, 엽전 1개)
// ════════════════════════════════════════════
async function openLottoNumbers() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return;
  }
  const t = getT();
  const lang = getLang();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:400px;padding:32px 24px;text-align:center">
      <div class="modal-title"><span class="ic-title">${icon('lotto')}</span>${t.lottoTitle || '오늘의 로또번호'}</div>
      <div id="lottoStatus" style="font-size:0.8rem;color:var(--text-dim);margin-top:14px">${t.lottoLoading || '번호를 뽑는 중...'}</div>
      <div id="lottoResult" style="display:none;text-align:center;margin-top:18px"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const started = Date.now();
  const MIN_MS = readMinMs(1);
  try {
    const res = await fetch('/api/lotto-numbers', {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ lang })
    });
    const data = await res.json();
    const remain = MIN_MS - (Date.now() - started);
    if (remain > 0) await new Promise(r => setTimeout(r, remain));

    const statusEl = document.getElementById('lottoStatus');
    const resultEl = document.getElementById('lottoResult');
    if (!data.success) {
      if (statusEl) statusEl.innerHTML = _resultErrorHtml(res, data);
      return;
    }
    if (statusEl) statusEl.style.display = 'none';
    if (resultEl) {
      resultEl.style.display = '';
      const ballsHtml = data.numbers.map(n => `
        <div style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:linear-gradient(180deg,var(--gold),var(--gold-dim));color:#1a1410;font-weight:700;font-size:0.95rem;margin:4px">${n}</div>`).join('');
      resultEl.innerHTML = `
        <div>${ballsHtml}</div>
        <div class="detail-area-card" style="margin-top:14px;text-align:left"><div class="detail-area-body" id="lottoReadingBody"></div></div>
        <div style="font-size:0.68rem;color:var(--text-dim);margin-top:10px">${t.lottoDisclaimer || '재미로 보는 참고용입니다. 당첨을 보장하지 않아요.'}</div>
        ${data.remaining !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${t.tokenUnit||'잔여 엽전'}: ${data.remaining}</div>` : ''}
        <button class="oracle-skip-btn" style="width:100%;margin-top:10px" onclick='shareResultCard({icon:"🎱",title:${JSON.stringify(t.lottoTitle || "오늘의 로또번호")},subtitle:${JSON.stringify(data.numbers.join(" · "))},filename:"myan-lotto"})'>📤 ${{ko:"공유하기",en:"Share",zh:"分享",ja:"共有"}[lang] || "공유하기"}</button>
      `;
      const bodyEl = document.getElementById('lottoReadingBody');
      if (bodyEl) revealSentences(bodyEl, data.reading, lang, { scrollEl: resultEl, stagger: 0 });
    }
  } catch (e) {
    const statusEl = document.getElementById('lottoStatus');
    if (statusEl) statusEl.textContent = '오류가 발생했습니다.';
  }
}

// ════════════════════════════════════════════
//  룬 문자 점 (재미 콘텐츠, 엽전 1개)
// ════════════════════════════════════════════
function openRuneReading() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().loginRequired || '로그인 후 이용할 수 있습니다.');
    return;
  }
  const t = getT();
  const overlay = document.createElement('div');
  overlay.id = 'runeOverlay';
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:380px;padding:32px 24px;text-align:center">
      <div class="modal-title">ᚦ ${t.runeTitle || '룬 문자 점'}</div>
      <div class="tarot-card-back" id="runeCardBack" style="margin:20px auto;font-size:2.4rem;display:flex;align-items:center;justify-content:center">ᚱ</div>
      <button class="fif-submit" style="width:100%;padding:12px" id="runeDrawBtn" onclick="_runeDraw()">${t.runeDrawBtn || '룬 뽑기'}</button>
      <div id="runeResult" style="display:none;text-align:left;margin-top:18px"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

let _runeDrawing = false;
async function _runeDraw() {
  if (_runeDrawing) return;
  _runeDrawing = true;
  const t = getT();
  const lang = getLang();
  const token = getGoogleIdToken();
  const btn = document.getElementById('runeDrawBtn');
  const resultEl = document.getElementById('runeResult');
  if (!btn || !resultEl) { _runeDrawing = false; return; }
  btn.disabled = true;
  btn.textContent = t.runeDrawing || '룬을 뽑는 중...';
  document.getElementById('runeCardBack')?.classList.add('tarot-flipped');

  const started = Date.now();
  const MIN_MS = readMinMs(1);
  try {
    const res = await fetch('/api/rune-reading', {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ lang })
    });
    const data = await res.json();
    const remain = MIN_MS - (Date.now() - started);
    if (remain > 0) await new Promise(r => setTimeout(r, remain));

    if (!data.success) {
      resultEl.style.display = '';
      resultEl.innerHTML = _resultErrorHtml(res, data);
      btn.disabled = false; btn.textContent = t.runeDrawBtn || '룬 뽑기';
      _runeDrawing = false;
      return;
    }
    btn.style.display = 'none';
    resultEl.style.display = '';
    resultEl.innerHTML = `
      <div style="text-align:center;font-weight:700;color:var(--gold);font-size:1.05rem">${data.name}(${data.nameKo})${data.upright ? '' : ` · ${t.runeReversed || '역방향'}`}</div>
      <div class="detail-area-card" style="margin-top:12px"><div class="detail-area-body" id="runeReadingBody"></div></div>
      ${data.remaining !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:right;margin-top:4px">${t.tokenUnit||'잔여 엽전'}: ${data.remaining}</div>` : ''}
      <button class="oracle-skip-btn" style="width:100%;margin-top:10px" onclick='shareResultCard({icon:"ᚱ",title:${JSON.stringify(data.name + "(" + data.nameKo + ")" + (data.upright ? "" : " · " + (t.runeReversed||"역방향")))},filename:"myan-rune"})'>📤 ${{ko:"공유하기",en:"Share",zh:"分享",ja:"共有"}[lang] || "공유하기"}</button>
    `;
    const bodyEl = document.getElementById('runeReadingBody');
    if (bodyEl) revealSentences(bodyEl, data.reading, lang, { scrollEl: resultEl, stagger: 0 });
  } catch (e) {
    resultEl.style.display = '';
    resultEl.innerHTML = `<div style="font-size:0.8rem;color:var(--text-dim);text-align:center">오류가 발생했습니다.</div>`;
    btn.disabled = false; btn.textContent = t.runeDrawBtn || '룬 뽑기';
  }
  _runeDrawing = false;
}

// ════════════════════════════════════════════
//  각종 체험 허브 — 홈 화면 카드에서 모든 재미 콘텐츠를 한곳에서 고르는 진입점
//  (각 항목은 이미 존재하는 open* 함수를 그대로 호출 — 신규 백엔드 없음)
// ════════════════════════════════════════════
// ════════════════════════════════════════════
//  홈 콘텐츠 섹션 — 18개 콘텐츠를 홈에 전부 노출.
//
//  묶는 기준을 계열(동양/서양)에서 "무엇을 하러 왔는지"로 바꿨다. 콘텐츠가 늘면서
//  동양 칸에만 9개가 몰려 한 화면을 채우는데, 정작 사용자는 사주와 타로 중에 고르는 게
//  아니라 "나를 알고 싶다 / 날을 잡아야 한다 / 뭘 물어보고 싶다 / 오늘 뭐지"로 온다.
//  천궁도가 서양 점술이라는 사실보다 그게 오늘을 보는 것이라는 게 고를 때 쓰는 정보다.
//
//  라벨은 각 콘텐츠 모달이 이미 쓰는 i18n 키를 그대로 재사용해 번역을 중복 정의하지 않는다.
//  JS로 그리므로 언어를 바꾸면 _syncDrawerLangs()에서 다시 렌더돼 자동 반영된다.
// ════════════════════════════════════════════
function _homeSections() {
  const t = getT();
  // 묶음은 계열이 아니라 **사람이 찾는 이유**로 나눈다. 콘텐츠가 29종이 되면서
  // 넷으로는 한 칸이 열넷까지 부풀어 아무것도 못 찾는 상태가 됐다.
  //
  // 특히 궁합을 밖으로 뺐다. 다른 사주 서비스가 예외 없이 '궁합'을 최상위에
  // 두는 이유가 있다 — 궁합은 목적이 뚜렷해서 그것만 보러 오는 사람이 있고,
  // 예전처럼 '때를 고르다' 안에 궁합 시기와 속궁합이 섞여 있으면 그 사람은
  // 못 찾는다. 이름·인상도 같은 이유로 따로 뺐다(작명은 목적이 분명하다).
  //
  // 한 묶음이 일곱을 넘으면 다시 나눌 때다 — home-sections.test.mjs 가 그 선을 지킨다.
  return [
    // icon 은 js/icons.js 의 이름이다(이모지가 아니다). 기기마다 모양·색이 갈리던 것을
    // 직접 그린 선화로 바꿨다 — currentColor 라 밝은 화면에서도 저절로 맞는다.
    { icon:'secMe', title: t.csMe || '사주로 보는 나', items: [
      { icon:'wealth',     label: t.wealthTitle     || '재물운',            cost:4, fn:'openWealth()' },
      { icon:'sinsal',     label: t.sinsalTitle     || '신살 풀이',         cost:3, fn:'openSinsal()' },
      { icon:'gwiin',      label: t.gwiinTitle      || '귀인 찾기',         cost:4, fn:'openGwiin()' },
      { icon:'vocation',   label: t.vocationTitle   || '천직과 적성',       cost:4, fn:'openVocation()' },
      { icon:'daeun',      label: t.daeunTitle      || '대운 · 10년의 흐름', cost:6, fn:'openDaeun()' },
      { icon:'pastlife',   label: t.pastlifeTitle   || '전생 이야기',       cost:4, fn:'openPastLife()' },
    ]},
    { icon:'secLove', title: t.csLove || '궁합과 인연', items: [
      { icon:'compat',     label: t.ctTitle         || '궁합 시기',         cost:6, fn:'openCompatTiming()' },
      { icon:'intimacy',   label: t.intimacyTitle   || '속궁합',            cost:5, fn:'openIntimacy()' },
      { icon:'typecompat', label: t.typeTitle       || '오행 유형 테스트',   cost:2, fn:'openTypeTest()' },
      { icon:'spouse',     label: t.spouseTitle     || '배우자궁 풀이',      cost:3, fn:'openSpousePalace()' },
    ]},
    { icon:'secName', title: t.csName || '이름과 인상', items: [
      { icon:'name',       label: t.nameTitle       || '이름 풀이',         cost:4, fn:'openNameReading()' },
      { icon:'naming',     label: t.namingTitle     || '작명에 참고할 결',   cost:4, fn:'openNaming()' },
      { icon:'photo',      label: t.photoModalTitle || '관상·손금',         cost:4, fn:'openPhotoReading()' },
      { icon:'numerology', label: t.numerologyTitle || '라이프패스 넘버',    cost:2, fn:'openNumerology()' },
    ]},
    { icon:'secTiming', title: t.csTiming || '때와 방위', items: [
      { icon:'takil',      label: t.takilTitle      || '택일 · 좋은 날 고르기', cost:2, fn:'openAuspiciousDays()' },
      { icon:'direction',  label: t.directionTitle  || '이사 방위',         cost:3, fn:'openDirection()' },
      { icon:'yearluck',   label: t.yearluckTitle   || '올해 세운',         cost:4, fn:'openYearLuck()' },
      { icon:'tojeong',    label: t.tojeongTitle    || '토정비결풍 신년운세', cost:4, fn:'openTojeong()' },
    ]},
    { icon:'secDaily', title: t.csDaily || '오늘의 운세', items: [
      { icon:'ttirank',      label: t.ttirankTitle      || '오늘의 띠 순위',   cost:1, fn:'openTtiRanking()' },
      { icon:'zodiac',       label: t.zodiacTitle       || '띠·별자리 운세',    cost:1, fn:'openZodiacFortune()' },
      { icon:'topic',        label: t.fortuneModalTitle || '오늘의 운세 모음',  cost:1, fn:'openFortuneTopics()' },
      { icon:'lucky',        label: t.luckyTitle        || '오늘의 럭키 아이템', cost:1, fn:'openLuckyPicks()' },
      { icon:'astro',        label: t.astroTitle        || '천궁도 트랜싯',    cost:1, fn:'openAstroTransit()' },
      { icon:'lotto',        label: t.lottoTitle        || '오늘의 로또번호',   cost:1, fn:'openLottoNumbers()' },
      { icon:'quickFortune', label: t.quickFortuneTitle || '오늘의 행운',      cost:0, fn:'openFortuneModal()' },
    ]},
    { icon:'secAsk', title: t.csAsk || '물어보는 점', items: [
      { icon:'tarot',  label: t.tarotTitle  || '오늘의 타로',   cost:1, fn:'openTarotDraw()' },
      { icon:'iching', label: t.ichingTitle || '주역 괘 풀이',  cost:1, fn:'openIching()' },
      { icon:'rune',   label: t.runeTitle   || '룬 문자 점',    cost:1, fn:'openRuneReading()' },
      { icon:'dream',  label: t.dreamTitle  || '꿈해몽',        cost:1, fn:'openDreamInterpretation()' },
    ]},
  ];
}

// 헤더에 오늘의 달 위상 표시 — 매일 바뀌므로 사이트가 살아있다는 신호가 된다.
// 서버 왕복 없이 constants.js의 moonPhaseLocal()로 즉시 계산(서버와 동일한 식).
function renderMoonToday() {
  const el = document.getElementById('moonToday');
  if (!el || typeof moonPhaseLocal !== 'function') return;
  const m = moonPhaseLocal();
  const name = MOON_PHASE_NAMES[getLang()]?.[m.index] || MOON_PHASE_NAMES.ko[m.index];
  el.textContent = `${MOON_PHASE_ICONS[m.index]} ${name}`;
  el.title = `월령 ${m.age.toFixed(1)}일 · 밝기 ${Math.round(m.illumination * 100)}%`;

  // 수성 역행은 1년에 3~4번, 각 3주뿐인 '사건'이라 그때만 배지를 띄운다.
  // 평소에도 표시하면 정보가 아니라 잡음이 된다.
  const badge = document.getElementById('mercuryBadge');
  if (!badge || typeof mercuryRetrogradeLocal !== 'function') return;
  const merc = mercuryRetrogradeLocal();
  if (!merc.retrograde) {
    badge.style.display = 'none';
    badge.textContent = '';   // 숨길 때 이전 문구·툴팁도 비운다(다음 표시 때 옛 날짜가 남지 않도록)
    badge.title = '';
    return;
  }
  const t = getT();
  badge.style.display = '';
  badge.textContent = `☿ ${t.mercuryRetro || '수성 역행'}`;
  badge.title = merc.endsAt ? `${merc.endsAt}까지` : '';
}

function renderHomeSections() {
  const host = document.getElementById('homeSections');
  if (!host) return;
  const freeLabel = { ko:'무료', en:'FREE', zh:'免费', ja:'無料' }[getLang()] || '무료';
  host.innerHTML = _homeSections().map(sec => `
    <section class="content-section">
      <div class="cs-title"><span>${icon(sec.icon)}</span>${sec.title}</div>
      <div class="cs-grid">
        ${sec.items.map(it => `
          <button class="cs-tile" onclick="${it.fn}">
            <span class="cs-cost${it.cost ? '' : ' cs-free'}">${it.cost ? '✦' + it.cost : freeLabel}</span>
            <span class="cs-ico">${icon(it.icon)}</span>
            <span class="cs-label">${it.label}</span>
          </button>`).join('')}
      </div>
    </section>`).join('');
}

function openExperienceHub() {
  const t = getT();
  const items = [
    { icon:'astro', label: t.astroTitle || '천궁도 트랜싯', fn: openAstroTransit },
    { icon:'tarot', label: t.tarotTitle || '오늘의 타로', fn: openTarotDraw },
    { icon:'zodiac', label: t.zodiacTitle || '띠·별자리 운세', fn: openZodiacFortune },
    { icon:'lucky', label: t.luckyTitle || '오늘의 럭키 아이템', fn: openLuckyPicks },
    { icon:'typecompat', label: t.typeTitle || '오행 유형·궁합', fn: openTypeTest },
    { icon:'topic', label: t.fortuneModalTitle || '오늘의 운세 모음', fn: openFortuneTopics },
    { icon:'iching', label: t.ichingTitle || '주역 괘 풀이', fn: openIching },
    { icon:'numerology', label: t.numerologyTitle || '수비학', fn: openNumerology },
    { icon:'tojeong', label: t.tojeongTitle || '토정비결풍 신년운세', fn: openTojeong },
    { icon:'photo', label: t.photoModalTitle || '관상·손금', fn: openPhotoReading },
    { icon:'dream', label: t.dreamTitle || '꿈해몽', fn: openDreamInterpretation },
    { icon:'lotto', label: t.lottoTitle || '오늘의 로또번호', fn: openLottoNumbers },
    { icon:'rune', label: t.runeTitle || '룬 문자 점', fn: openRuneReading },
    { icon:'takil', label: t.takilTitle || '택일 · 좋은 날 고르기', fn: openAuspiciousDays },
    { icon:'daeun', label: t.daeunTitle || '대운 · 10년의 흐름', fn: openDaeun },
    { icon:'name', label: t.nameTitle || '이름 풀이', fn: openNameReading },
    { icon:'compat', label: t.ctTitle || '궁합 시기', fn: openCompatTiming },
  ];
  const overlay = document.createElement('div');
  overlay.id = 'experienceHubOverlay';
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '1200';
  const itemsHtml = items.map((it, i) => `
    <button class="fortune-topic-btn" onclick="_experienceHubPick(${i})">
      <span class="fortune-topic-icon">${icon(it.icon)}</span>
      <span class="fortune-topic-label">${it.label}</span>
    </button>`).join('');
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:440px;padding:28px 22px">
      <div class="modal-title"><span class="ic-title">${icon('secAsk')}</span>${t.experienceHubTitle || '재미로 보는 운세'}</div>
      <div style="font-size:0.8rem;color:var(--text-dim);margin:6px 0 18px">${t.experienceHubSub || '궁금한 콘텐츠를 골라보세요'}</div>
      <div class="fortune-topic-grid">${itemsHtml}</div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  _experienceHubItems = items;
}
let _experienceHubItems = [];
function _experienceHubPick(i) {
  document.getElementById('experienceHubOverlay')?.remove();
  const fn = _experienceHubItems[i]?.fn;
  if (typeof fn === 'function') fn();
}

// ════════════════════════════════════════════
//  푸시 알림 토글
// ════════════════════════════════════════════
async function togglePushNotif(btn) {
  const t = getT();

  // 브라우저 지원 확인
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast(t.notifDenied || '이 브라우저는 알림을 지원하지 않습니다.');
    return;
  }
  if (Notification.permission === 'denied') {
    showToast(t.notifDenied || '알림이 차단되어 있습니다. 브라우저 설정에서 허용해 주세요.');
    return;
  }

  // 버튼 UI 업데이트
  function _updateBtn(isOn) {
    if (!btn) return;
    const iconEl = btn.querySelector('.notif-icon');
    const textEl = btn.querySelectorAll('span')[1] || btn.querySelector('span:last-child');
    btn.classList.toggle('active', isOn);
    if (iconEl) iconEl.textContent = isOn ? '🔕' : '🔔';
    if (textEl) textEl.textContent = isOn ? (t.notifOff2 || '알림 끄기') : (t.notifOn || '알림 켜기');
  }

  // 서비스워커 준비 (5초 타임아웃)
  let sw;
  try {
    sw = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, rej) => setTimeout(() => rej(new Error('SW timeout')), 5000))
    ]);
  } catch {
    showToast('페이지를 새로고침 후 다시 시도해 주세요.');
    return;
  }

  const existing = await sw.pushManager.getSubscription();
  const token = getGoogleIdToken();
  const userLang = getLang();

  if (existing) {
    // 구독 해제
    await existing.unsubscribe();
    if (token) fetch(EP + 'api/push/unsubscribe', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: existing.endpoint })
    }).catch(() => {});
    _updateBtn(false);
    showToast(t.notifOff || '알림이 해제되었습니다.');
  } else {
    // 권한 요청 → 구독
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        showToast(t.notifDenied || '알림 권한이 거부되었습니다.');
        return;
      }

      const vr = await fetch(EP + 'api/push/vapid-key');
      if (!vr.ok) {
        showToast('알림 설정에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }

      const { publicKey } = await vr.json();
      if (!publicKey) {
        showToast('알림 키 설정에 문제가 있습니다.');
        return;
      }

      const appKey = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      const sub = await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });

      if (token) {
        const res = await fetch(EP + 'api/push/subscribe', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub, lang: userLang })
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          console.error('[PUSH] Subscribe error:', errorData);
        }
      }

      _updateBtn(true);
      showToast(t.notifEnabled || '알림이 설정되었습니다! 🌟');
    } catch (err) {
      showToast('알림 설정 중 오류가 발생했습니다.');
    }
  }
}

// ════════════════════════════════════════════
//  프로필 공유 모달
// ════════════════════════════════════════════
function _closeProfileShareModal() {
  const el = document.getElementById('profileShareModal');
  if (el) el.style.display = 'none';
}

function _shareProfileCard() {
  // 프로필 카드 이미지로 저장
  _saveProfileImage();
}

// ════════════════════════════════════════════
//  프로필 이미지 저장 (html2canvas)
// ════════════════════════════════════════════
async function _saveProfileImage() {
  const t = getT();
  // 프로필 모달 열고 스탯 채우기
  if (_streakCache) {
    const numEl = document.getElementById('profile-share-streak-num');
    if (numEl) numEl.textContent = _streakCache.current || 0;
    const totEl = document.getElementById('profile-share-total-num');
    if (totEl) totEl.textContent = _streakCache.total || 0;
  }
  const nameEl = document.getElementById('profileShareName');
  if (nameEl && window._fbUser?.displayName) nameEl.textContent = window._fbUser.displayName;

  // html2canvas 로드 확인
  if (typeof html2canvas === 'undefined') {
    showToast('이미지 저장 기능을 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
    return;
  }

  // 카드 요소 찾기
  const modal = document.getElementById('profileShareModal');
  const card = modal ? modal.querySelector('.profile-share-card') : null;
  if (!card) { showToast(t.errorGeneric || '오류가 발생했습니다.'); return; }

  // 카드 화면 밖에 렌더링 후 캡처
  const wasHidden = modal.style.display === 'none';
  if (wasHidden) {
    modal.style.cssText += '; display:flex; position:fixed; left:-9999px; opacity:0; pointer-events:none;';
  }

  showToast(t.savingImage || '이미지 저장 중...');

  try {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); // 렌더 대기
    const canvas = await html2canvas(card, {
      backgroundColor: '#1a1610',
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: card.offsetWidth,
      height: card.offsetHeight
    });
    // PNG 다운로드 (DOM에 추가해야 iOS 등에서 동작)
    const link = document.createElement('a');
    link.download = 'myan-profile.png';
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(t.imageSaved || '이미지가 저장되었습니다! 📸');
  } catch(e) {
    console.error('html2canvas error:', e);
    showToast(t.errorGeneric || '저장 중 오류가 발생했습니다.');
  } finally {
    if (wasHidden) {
      modal.style.display = 'none';
      modal.style.position = '';
      modal.style.left = '';
      modal.style.opacity = '';
      modal.style.pointerEvents = '';
    }
  }
}

// ════════════════════════════════════════════
//  오행 인디케이터 (메인화면)
// ════════════════════════════════════════════
function renderOhaengIndicator(activeO) {
  ['木','火','土','金','水'].forEach(o => {
    const el = document.getElementById('chip-' + o);
    if (!el) return;
    if (o === activeO) {
      el.classList.add('chip-active');
    } else {
      el.classList.remove('chip-active');
    }
  });
}

// 앱 시작 시 로컬 캐시에서 오늘 오행 복원
function _restoreOhaengIndicator() {
  // 1) 일진 계산으로 오늘 오행 바로 활성화
  try {
    const todayO = ilchin().o;
    if (todayO) renderOhaengIndicator(todayO);
  } catch {}
  // 2) localStorage 리딩 이력으로 덮어쓰기 (일진과 같으면 유지)
  const today = _todayKST();
  try {
    const cal = JSON.parse(localStorage.getItem('myan_cal') || '{}');
    if (cal[today]) renderOhaengIndicator(cal[today]);
  } catch {}
}


function _doShareSNS(type, date, ohaeng) {
  document.querySelector('.share-sheet-overlay')?.remove();
  const t   = getT();
  const url = location.origin;
  const text = (t.shareMsg || '오늘({d})의 오행 기운은 {o}입니다! M;Y 安에서 확인하세요.')
    .replace('{d}', date).replace('{o}', ohaeng);
  const fullText = text + '\n' + url;
  const enc  = encodeURIComponent;

  switch (type) {
    case 'kakao':
      // 카카오링크 공유 (앱/웹 모두 작동)
      // kakaotalk://send 딥링크 → 설치된 경우 앱으로 직접 공유
      // 미설치/데스크탑 → 링크 복사 후 안내
      (function() {
        const copied = navigator.clipboard
          ? navigator.clipboard.writeText(fullText).then(() => true).catch(() => false)
          : Promise.resolve(false);
        copied.then(() => {
          // 카카오톡 딥링크 시도 (모바일)
          if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            const t1 = Date.now();
            try { window.location.href = 'kakaotalk://msg/send?text=' + enc(fullText); } catch(e) {}
            setTimeout(() => {
              if (Date.now() - t1 < 2000) {
                // 앱 없으면 스토어로
                showToast('링크가 복사됐어요! 카카오톡 앱에서 붙여넣기 하세요 💬');
              }
            }, 1500);
          } else {
            // 데스크탑: 링크 복사 + 카카오 오픈채팅 안내
            showToast('링크가 복사됐어요! 카카오톡에서 붙여넣기해 공유하세요 💬');
          }
        });
      })();
      break;

    case 'instagram':
      // Instagram Web Share API 미지원 → 텍스트 복사 + 앱/웹 유도
      navigator.clipboard.writeText(fullText).then(() => {
        showToast(t.instaToast || '텍스트가 복사되었습니다! Instagram 앱에서 새 게시물에 붙여넣기 하세요 📸');
        // 모바일 앱 딥링크 시도
        setTimeout(() => {
          try {
            if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
              window.location.href = 'instagram://';
            } else {
              openExternal('https://www.instagram.com/');
            }
          } catch {}
        }, 600);
      }).catch(() => {
        openExternal('https://www.instagram.com/');
      });
      break;

    case 'facebook':
      openExternal(`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}&quote=${enc(text)}`);
      break;

    case 'twitter':
      openExternal(`https://x.com/intent/tweet?text=${enc(text + ' ')}&url=${enc(url)}`);
      break;

    case 'copy':
      navigator.clipboard.writeText(fullText)
        .then(() => showToast(t.shareCopied || '링크가 복사되었습니다! 📋'))
        .catch(() => showToast(url));
      break;

    default:
      if (navigator.share) {
        navigator.share({ title: 'M;Y 安', text, url }).catch(() => {});
      } else {
        navigator.clipboard.writeText(fullText).then(() => showToast(t.shareCopied || '복사되었습니다!')).catch(() => {});
      }
  }
}

// ════════════════════════════════════════════
//  프로모 QR 코드 클레임
// ════════════════════════════════════════════
function _checkPromoParam() {
  const params = new URLSearchParams(location.search);
  const code = params.get('promo');
  const dynToken = params.get('promo_token');
  if (!code && !dynToken) return;

  history.replaceState({}, '', location.pathname);

  setTimeout(() => {
    if (isLoggedIn && isLoggedIn()) {
      if (dynToken) _showDynamicPromoModal(dynToken);
      else _showPromoModal(code.toUpperCase());
    } else {
      try {
        if (dynToken) localStorage.setItem('myan_pending_promo_token', dynToken);
        else localStorage.setItem('myan_pending_promo', code.toUpperCase());
      } catch {}
    }
  }, 1200);
}

function _showPromoModal(code) {
  // 기존 모달 제거
  document.querySelector('#promo-modal')?.remove();

  const t = getT();
  const overlay = document.createElement('div');
  overlay.id = 'promo-modal';
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '2000';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:360px;text-align:center;padding:32px 24px">
      <div style="font-size:2.5rem;margin-bottom:12px">☕</div>
      <div class="modal-title" style="margin-bottom:8px">M;Y 安 카페 혜택</div>
      <div style="font-size:0.88rem;color:var(--text-dim);margin-bottom:20px;line-height:1.7">
        방문해 주셔서 감사합니다!<br>
        <strong style="color:var(--gold)">무료 엽전 3개</strong>를 드립니다.<br>
        <span style="font-size:0.78rem;opacity:0.6">계정당 1회 사용 가능</span>
      </div>
      <button id="promo-claim-btn" style="width:100%;padding:14px;border-radius:12px;background:var(--gold);color:#1a1610;font-weight:700;font-size:1rem;border:none;cursor:pointer">
        🎁 엽전 3개 받기
      </button>
      <button onclick="document.getElementById('promo-modal').remove()" style="margin-top:10px;width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--text-dim);cursor:pointer;font-size:0.85rem">
        닫기
      </button>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('promo-claim-btn').addEventListener('click', async () => {
    const btn = document.getElementById('promo-claim-btn');
    btn.disabled = true;
    btn.textContent = '처리 중...';

    const token = getGoogleIdToken();
    if (!token) {
      showToast('로그인 후 이용해 주세요.');
      overlay.remove();
      return;
    }

    try {
      const r = await fetch(EP + 'api/promo/claim', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await r.json();
      overlay.remove();
      if (data.success) {
        showToast(`🎉 엽전 ${data.tokensGiven}개 지급! 잔여: ${data.remaining}개`);
        if (typeof refreshTokens === 'function') refreshTokens();
        if (typeof updateAllTokenDisplays === 'function') updateAllTokenDisplays();
      } else {
        showToast(data.error || '오류가 발생했습니다.');
      }
    } catch {
      overlay.remove();
      showToast('네트워크 오류가 발생했습니다.');
    }
  });
}

// 로그인 완료 후 대기 중인 프로모 코드 처리
function _processPendingPromo() {
  try {
    const dynToken = localStorage.getItem('myan_pending_promo_token');
    if (dynToken) {
      localStorage.removeItem('myan_pending_promo_token');
      setTimeout(() => _showDynamicPromoModal(dynToken), 800);
      return;
    }
    const code = localStorage.getItem('myan_pending_promo');
    if (code) {
      localStorage.removeItem('myan_pending_promo');
      setTimeout(() => _showPromoModal(code), 800);
    }
  } catch {}
}
function _showDynamicPromoModal(token) {
  document.querySelector('#promo-modal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'promo-modal';
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '2000';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:360px;text-align:center;padding:32px 24px">
      <div style="font-size:2.5rem;margin-bottom:12px">☕</div>
      <div class="modal-title" style="margin-bottom:8px">M;Y 安 카페 혜택</div>
      <div style="font-size:0.88rem;color:var(--text-dim);margin-bottom:20px;line-height:1.7">
        방문해 주셔서 감사합니다!<br>
        <strong style="color:var(--gold)">무료 엽전 3개</strong>를 드립니다.<br>
        <span style="font-size:0.78rem;opacity:0.6">1회용 코드 · 계정당 1회</span>
      </div>
      <button id="promo-claim-btn" style="width:100%;padding:14px;border-radius:12px;background:var(--gold);color:#1a1610;font-weight:700;font-size:1rem;border:none;cursor:pointer">
        🎁 엽전 5개 받기
      </button>
      <button onclick="document.getElementById('promo-modal').remove()" style="margin-top:10px;width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--text-dim);cursor:pointer;font-size:0.85rem">닫기</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('promo-claim-btn').addEventListener('click', async () => {
    const btn = document.getElementById('promo-claim-btn');
    btn.disabled = true; btn.textContent = '처리 중...';
    const authToken = getGoogleIdToken();
    if (!authToken) { showToast('로그인 후 이용해 주세요.'); overlay.remove(); return; }
    try {
      const r = await fetch(EP + 'api/promo/claim', {
        method:'POST',
        headers:{Authorization:`Bearer ${authToken}`,'Content-Type':'application/json'},
        body: JSON.stringify({ promo_token: token })
      });
      const data = await r.json();
      overlay.remove();
      if (data.success) {
        showToast(`🎉 엽전 ${data.tokensGiven}개 지급! 잔여: ${data.remaining}개`);
        if (typeof refreshTokens === 'function') refreshTokens();
        if (typeof updateAllTokenDisplays === 'function') updateAllTokenDisplays();
      } else {
        showToast(data.error || '오류가 발생했습니다.');
      }
    } catch { overlay.remove(); showToast('네트워크 오류가 발생했습니다.'); }
  });
}

// ══════════════════════════════════════════════════════════════════════
//  게스트 모드 함수
// ══════════════════════════════════════════════════════════════════════

function startGuestMode() {
  // 게스트 모드 시작 트래킹
  if (typeof Analytics !== 'undefined') {
    Analytics.trackGuest('start');
  }

  showScreen('GUEST');
  const t = TX[lang];
  const backLabel = document.getElementById('backLabel');
  if (backLabel) backLabel.textContent = t.back || '뒤로';
}

async function submitGuestReading() {
  const birthInput = document.getElementById('guestBirthInput');
  const nameInput = document.getElementById('guestNameInput');
  const submitBtn = document.getElementById('guestSubmitBtn');
  const errDiv = document.getElementById('guestErr');

  const birth = birthInput.value.trim();
  const name = (nameInput?.value || '').trim() || '손님';
  if (!birth) {
    errDiv.textContent = '생년월일을 입력해주세요.';
    errDiv.style.display = 'block';
    return;
  }

  errDiv.style.display = 'none';
  submitBtn.disabled = true;

  // 게스트 제출 트래킹
  if (typeof Analytics !== 'undefined') {
    Analytics.trackGuest('submit');
  }

  // URL 파라미터에서 ref 확인
  const urlParams = new URLSearchParams(window.location.search);
  const ref = urlParams.get('ref');

  const apiPromise = fetch(EP + 'chat-guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ birth, name, lang, ref })
  }).then(async res => ({ status: res.status, ok: res.ok, data: await res.json() }));

  try {
    const { status, ok, data } = await openOracleOverlay({ apiPromise, cost: 0 });

    if (status === 429 && data.error?.code === 'GUEST_LIMIT') {
      // 게스트 제한 도달 트래킹
      if (typeof Analytics !== 'undefined') {
        Analytics.trackGuest('limit');
      }
      const resetHours = data.error.resetIn || 24;
      const now = new Date();
      const resetTime = new Date(now.getTime() + resetHours * 60 * 60 * 1000);
      const resetStr = resetTime.toLocaleString('ko-KR', {
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      errDiv.innerHTML = `
        오늘의 무료 체험은 이미 사용하셨습니다.<br>
        <strong style="color: var(--gold)">${resetStr}</strong>에 다시 이용 가능합니다.<br>
        <span style="font-size: 0.85rem; color: var(--text-dim); margin-top: 4px; display: inline-block;">
          (약 ${resetHours}시간 후)
        </span><br>
        <span style="color: var(--gold); margin-top: 8px; display: inline-block;">
          💡 회원가입하면 무제한 이용 가능!
        </span>
      `;
      errDiv.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'AI 풀이 받기';
      return;
    }

    if (!ok || !data.success) {
      throw new Error(data.error?.message || 'AI 연결 실패');
    }

    // 결과 화면으로 전환
    showScreen('GUEST_RESULT');
    const readingContent = document.getElementById('guestReadingContent');
    if (readingContent) {
      revealSentences(readingContent, data.reading || '풀이 결과를 가져오지 못했습니다.', lang);
    }

    // 운기 푸딩 카드 표시
    if (data.isUngi && data.ohaeng) {
      renderUngiPuddingCard(data.ohaeng);
    }

  } catch (e) {
    errDiv.textContent = e.message || '오류가 발생했습니다. 다시 시도해주세요.';
    errDiv.style.display = 'block';
    submitBtn.disabled = false;
    submitBtn.textContent = 'AI 풀이 받기';
  }
}

function goSignupFromGuest() {
  goSignup();
}

function backToHome() {
  showScreen('MODE', true);

  // 입력 필드 초기화
  const birthInput = document.getElementById('guestBirthInput');
  const nameInput = document.getElementById('guestNameInput');
  const errDiv = document.getElementById('guestErr');
  const submitBtn = document.getElementById('guestSubmitBtn');

  if (birthInput) birthInput.value = '';
  if (nameInput) nameInput.value = '';
  if (errDiv) errDiv.style.display = 'none';
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'AI 풀이 받기';
  }

  // 푸딩 카드 숨기기
  const card = document.getElementById('ungiPuddingCard');
  if (card) card.style.display = 'none';
}

// 운기 푸딩 추천 카드 렌더링
function renderUngiPuddingCard(ohaeng) {
  console.log('[UNGI] renderUngiPuddingCard called with:', ohaeng);
  const card = document.getElementById('ungiPuddingCard');
  if (!card) {
    console.error('[UNGI] ungiPuddingCard element not found!');
    return;
  }

  // 상위 2개 오행 찾기
  const entries = Object.entries(ohaeng).sort((a, b) => b[1] - a[1]);
  const top2 = entries.slice(0, 2);

  const puddingMap = {
    '木': { name: '말차 푸딩', color: '#4bc87a', emoji: '🍵', desc: '상큼한 성장 에너지' },
    '火': { name: '우베 푸딩', color: '#e05a4a', emoji: '🍠', desc: '열정의 불꽃 에너지' },
    '土': { name: '커스타드 푸딩', color: '#d4a040', emoji: '🥚', desc: '든든한 안정 에너지' },
    '金': { name: '바닐라 푸딩', color: '#a0aab4', emoji: '🤍', desc: '깔끔한 정리 에너지' },
    '水': { name: '초코 푸딩', color: '#5aa8e0', emoji: '🍫', desc: '유연한 지혜 에너지' }
  };

  // 상위 2개 푸딩 정보
  const pudding1 = puddingMap[top2[0][0]];
  const pudding2 = puddingMap[top2[1][0]];

  if (!pudding1) return;

  const isTie = top2[0][1] === top2[1][1]; // 같은 퍼센트인지

  card.innerHTML = `
    <div style="background: linear-gradient(135deg, ${pudding1.color}22, ${pudding2.color}22);
                border: 1px solid ${pudding1.color}44;
                border-radius: 12px;
                padding: 20px;
                margin: 20px 0;
                text-align: center;">
      <div style="font-size: 2.5rem; margin-bottom: 8px;">🍮</div>
      <div style="font-size: 1.2rem; font-weight: bold; color: ${pudding1.color}; margin-bottom: 12px;">
        오늘의 추천 푸딩
      </div>

      <div style="display: flex; gap: 12px; justify-content: center; margin-bottom: 12px;">
        <div style="flex: 1; background: white; border-radius: 8px; padding: 12px; border: 2px solid ${pudding1.color}44;">
          <div style="font-size: 1.8rem; margin-bottom: 4px;">${pudding1.emoji}</div>
          <div style="font-size: 1.1rem; font-weight: bold; margin-bottom: 4px;">${pudding1.name}</div>
          <div style="color: var(--text-dim); font-size: 0.85rem;">${pudding1.desc}</div>
          <div style="color: ${pudding1.color}; font-weight: bold; margin-top: 4px;">${top2[0][1]}%</div>
        </div>

        <div style="flex: 1; background: white; border-radius: 8px; padding: 12px; border: 2px solid ${pudding2.color}44;">
          <div style="font-size: 1.8rem; margin-bottom: 4px;">${pudding2.emoji}</div>
          <div style="font-size: 1.1rem; font-weight: bold; margin-bottom: 4px;">${pudding2.name}</div>
          <div style="color: var(--text-dim); font-size: 0.85rem;">${pudding2.desc}</div>
          <div style="color: ${pudding2.color}; font-weight: bold; margin-top: 4px;">${top2[1][1]}%</div>
        </div>
      </div>

      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e0e0e0; color: var(--text-dim); font-size: 0.85rem;">
        💡 운기 매장에서 오행 에너지를 담은 푸딩을 만나보세요
      </div>
    </div>
  `;
  card.style.display = 'block';
}

// ref=ungi 파라미터 감지하여 게스트 화면 문구 변경
(function checkUngiParam() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('ref') === 'ungi') {
    const defaultSubtitle = document.getElementById('guestSubtitleText');
    const ungiSubtitle = document.getElementById('guestSubtitleUngi');
    if (defaultSubtitle && ungiSubtitle) {
      defaultSubtitle.style.display = 'none';
      ungiSubtitle.style.display = 'block';
    }
  }
})();


// ════════════════════════════════════════════
//  사주 기록 조회 UI
// ════════════════════════════════════════════
// 기록 본문에는 사용자가 입력한 이름과 AI 응답이 그대로 들어가므로,
// innerHTML 로 그리기 전에 반드시 이스케이프한다.
// _escHtml 은 위(사주 기록 조회 UI 위쪽)에 한 벌만 둔다. 여기에도 같은 함수가
// 하나 더 있었는데, 함수 선언은 뒤엣것이 이기므로 위를 고쳐도 반영되지 않았다 —
// 이스케이프처럼 안전에 걸린 함수가 두 벌인 것은 그 자체로 위험하다.

// 펼침 상태를 innerHTML 재생성 없이 토글한다(본문은 이미 DOM 에 들어있고 CSS 로만 접는다).
function toggleHistoryEntry(idx) {
  const body = document.getElementById(`hist-body-${idx}`);
  const btn  = document.getElementById(`hist-toggle-${idx}`);
  if (!body || !btn) return;
  // 높이는 CSS 가 data-open 을 보고 정한다. 여기서 인라인으로 다시 쓰면
  // 두 군데가 같은 값을 들고 있게 되어 한쪽만 고쳤을 때 어긋난다.
  const open = body.dataset.open === '1';
  body.dataset.open = open ? '0' : '1';
  btn.textContent = open ? getT().histExpand : getT().histCollapse;
}

async function showSajuHistory() {
  const token = getGoogleIdToken();
  if (!token) {
    showToast(getT().noLogin);
    return;
  }
  const t = getT();

  // 모달 생성
  const modal = document.createElement('div');
  modal.id = 'saju-history-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.8); z-index: 9999;
    display: flex; align-items: center; justify-content: center;
    padding: 20px; animation: fadeIn 0.3s ease;
  `;

  modal.innerHTML = `
    <div style="background: var(--card); border: 1px solid var(--border); border-radius: 16px; max-width: 600px; width: 100%; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column;">
      <div style="padding: 24px 24px 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 1.3rem; color: var(--gold); letter-spacing: 1px;">☯️ ${_escHtml(t.histTitle)}</div>
        <button onclick="document.getElementById('saju-history-modal').remove()" style="background: none; border: none; color: var(--text-dim); font-size: 1.5rem; cursor: pointer; padding: 0; width: 32px; height: 32px;">×</button>
      </div>
      <div id="saju-history-content" style="flex: 1; overflow-y: auto; padding: 20px;">
        <div style="text-align: center; padding: 40px; color: var(--text-dim);">
          <div style="font-size: 2rem; margin-bottom: 12px;">⏳</div>
          <div>${_escHtml(t.histLoading)}</div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 사주 기록 + 유료 콘텐츠(상세풀이/타로/띠·별자리/럭키/궁합) 기록을 함께 조회해 하나의 타임라인으로 합침
  try {
    const [sajuRes, featureRes] = await Promise.all([
      fetch(EP + 'api/saju-history?limit=20', { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch(EP + 'api/feature-history?limit=20', { headers: { 'Authorization': `Bearer ${token}` } }),
    ]);
    const sajuData    = await sajuRes.json().catch(() => ({}));
    const featureData = await featureRes.json().catch(() => ({}));

    const entries = [];

    (sajuData.history || []).forEach(h => {
      const modeIcon = h.mode === 'duo' ? 'compat' : 'saju';   // js/icons.js 의 선화 이름
      const modeText = h.mode === 'duo' ? t.s2 : t.s1;   // 홈 타일과 같은 이름을 재사용
      const names = h.mode === 'duo'
        ? `${h.p1.name || t.histP1} & ${h.p2?.name || t.histP2}`
        : (h.p1.name || t.histMe);
      entries.push({
        createdAt: h.createdAt, icon: modeIcon, title: modeText, sub: names,
        body: h.reading,
      });
    });

    // 라벨은 각 콘텐츠 화면에서 쓰는 기존 번역 키를 그대로 재사용한다 —
    // 기록 목록에만 따로 번역을 두면 화면과 이름이 어긋난다.
    // ⚠️ 이모지가 아니라 js/icons.js 의 선화 이름이다. 홈 타일과 같은 그림을 쓴다 —
    //    기록 목록만 이모지로 남아 있어 여기만 결이 달랐다(이모지는 기기마다 모양·색이
    //    갈려 금빛 화면에서 겉돈다. 홈에서 이미 겪고 바꾼 문제다).
    const FEATURE_META = {
      detail:     { icon: 'saju',       label: t.detailTitle },
      tarot:      { icon: 'tarot',      label: t.tarotTitle },
      zodiac:     { icon: 'zodiac',     label: t.zodiacTitle },
      lucky:      { icon: 'lucky',      label: t.luckyTitle },
      typecompat: { icon: 'typecompat', label: t.drTypeTitle },
      astro:      { icon: 'astro',      label: t.astroTitle },
      takil:      { icon: 'takil',      label: t.takilTitle },
      daeun:      { icon: 'daeun',      label: t.daeunTitle },
      name:       { icon: 'name',       label: t.nameTitle },
      compat:     { icon: 'compat',     label: t.ctTitle },
    };
    (featureData.history || []).forEach(h => {
      const fm = FEATURE_META[h.feature] || { icon: 'saju', label: h.feature };
      // ⚠️ 이름을 icon 으로 두면 전역 icon() 함수를 가린다. 여기서는 안 쓰지만
      //    나중에 이 블록에서 아이콘을 그리려다 "icon is not a function" 을 만난다.
      const iconName = fm.icon;
      let title = h.title ? `${fm.label} · ${h.title}` : fm.label;
      let body = h.content;

      if (h.feature === 'detail') {
        // 갈래 이름은 제목에 붙인다. 갈래마다 그림을 따로 두면 선화를 열 개 더 그려야 한다.
        const cat = (typeof DETAIL_CATS !== 'undefined' ? DETAIL_CATS : []).find(c => c.key === h.meta?.category);
        if (cat?.label && !h.title) title = `${fm.label} · ${cat.label}`;
      } else if (h.feature === 'lucky') {
        try {
          const picks = JSON.parse(h.content);
          body = [
            picks.color ? `🎨 ${picks.color.name} — ${picks.color.reason}` : '',
            picks.food  ? `🍽 ${picks.food.name} — ${picks.food.reason}`  : '',
            picks.song  ? `🎵 ${picks.song.name} — ${picks.song.reason}`  : '',
          ].filter(Boolean).join('\n');
        } catch { body = h.content; }
      } else if (h.feature === 'tarot' && h.meta?.upright === false) {
        title += ` (${t.tarotReversed})`;
      }

      entries.push({ createdAt: h.createdAt, icon: iconName, title, sub: null, body });
    });

    entries.sort((a, b) => b.createdAt - a.createdAt);

    const content = document.getElementById('saju-history-content');
    if (entries.length === 0) {
      content.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: var(--text-dim);">
          <div style="font-size: 3rem; margin-bottom: 16px; opacity: 0.3;">📜</div>
          <div style="font-size: 1.1rem; margin-bottom: 8px;">${_escHtml(t.histEmpty)}</div>
          <div style="font-size: 0.9rem; opacity: 0.7;">${_escHtml(t.histEmptySub)}</div>
        </div>
      `;
      return;
    }

    // 기록 렌더링.
    // 예전엔 본문을 2줄로 잘라 보여주기만 하고 펼칠 방법이 없어서, 엽전을 쓰고 받은 풀이를
    // 다시 읽을 수가 없었다. 본문은 이미 응답에 다 들어있으므로 접힌 상태로 전부 심어두고
    // 버튼으로 max-height 만 토글한다(다시 fetch 하지 않는다).
    content.innerHTML = entries.map((en, i) => {
      const date = new Date(en.createdAt * 1000);
      const dateStr = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
      const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

      const body = (en.body || '').trim();
      // 2줄(약 3.4em)을 넘길 때만 펼치기 버튼을 붙인다
      const needsToggle = body.split('\n').length > 2 || body.length > 80;

      return `
        ${/* 모양은 CSS(.hist-card) 로 옮겼다. 예전엔 배경을 rgba(255,255,255,0.03) 으로
              박아 두었는데, 밝은 화면에서는 크림색 위 흰색이라 칸이 아예 안 보였다. */''}
        <div class="hist-card">
          <div class="hist-head">
            <div class="hist-title-wrap">
              <div class="hist-title"><span class="hist-ic">${icon(en.icon)}</span>${_escHtml(en.title)}</div>
              ${en.sub ? `<div class="hist-sub">${_escHtml(en.sub)}</div>` : ''}
            </div>
            <div class="hist-when"><div>${dateStr}</div><div>${timeStr}</div></div>
          </div>
          <div id="hist-body-${i}" data-open="0" class="hist-body">${_escHtml(body)}</div>
          ${needsToggle ? `
            <button id="hist-toggle-${i}" class="hist-toggle" onclick="toggleHistoryEntry(${i})">
              ${_escHtml(t.histExpand)}
            </button>` : ''}
        </div>
      `;
    }).join('');
  } catch (e) {
    const content = document.getElementById('saju-history-content');
    content.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: #e05a4a;">
        <div style="font-size: 2rem; margin-bottom: 12px;">⚠️</div>
        <div>${_escHtml(getT().histFailed)}</div>
      </div>
    `;
  }
}

// 프로필 생년월일 자동 입력
function _autoFillBirthData(mode) {
  const user = getUser();
  if (!user || !user.birthYear) return;

  setTimeout(() => {
    // Solo 모드 또는 Duo 모드의 첫 번째 분에만 자동 입력
    const nameInput = document.querySelector('.sj-name[data-p="1"]');
    const yearInput = document.querySelector('.sj-year[data-p="1"]');
    const monthInput = document.querySelector('.sj-month[data-p="1"]');
    const dayInput = document.querySelector('.sj-day[data-p="1"]');
    const timeSelect = document.querySelector('.sj-time[data-p="1"]');

    if (nameInput && user.name) nameInput.value = user.name;
    if (yearInput && user.birthYear) yearInput.value = user.birthYear;
    if (monthInput && user.birthMonth) monthInput.value = user.birthMonth;
    if (dayInput && user.birthDay) dayInput.value = user.birthDay;
    if (timeSelect && user.birthHour) {
      // birthHour는 한글 시진명 (예: '오시') 형태로 저장되어 있음
      timeSelect.value = user.birthHour;
    }
  }, 100);
}

// ══════════════════════════════════════════════════════════════════════
//  오늘의 행운 모달
// ══════════════════════════════════════════════════════════════════════


// 전체 메시지를 1차원 배열로 평탄화 (FORTUNES는 js/fortunes.js에서 로드)
function getAllFortuneMessages() {
  const all = [];
  FORTUNES.forEach(cat => {
    cat.messages.forEach(msg => {
      all.push({ category: cat.category, message: msg });
    });
  });
  return all;
}

function getRandomFortune() {
  const allMessages = getAllFortuneMessages();

  // 이미 본 메시지 인덱스 가져오기
  let seen = [];
  try {
    const saved = localStorage.getItem('fortune_seen');
    if (saved) seen = JSON.parse(saved);
  } catch {}

  // 전부 다 봤으면 리셋
  if (seen.length >= allMessages.length) {
    seen = [];
  }

  // 아직 안 본 메시지 인덱스만 필터링
  const available = [];
  for (let i = 0; i < allMessages.length; i++) {
    if (!seen.includes(i)) {
      available.push(i);
    }
  }

  // 랜덤 선택
  const randomIdx = available[Math.floor(Math.random() * available.length)];
  const fortune = allMessages[randomIdx];

  // 본 메시지로 기록
  seen.push(randomIdx);
  localStorage.setItem('fortune_seen', JSON.stringify(seen));

  return fortune;
}

function openFortuneModal() {
  // 비로그인 → 회원 전용 안내 (로그인 유도)
  if (!isLoggedIn()) {
    const L = {
      ko: { title: '오늘의 행운은 회원 혜택이에요', desc: '로그인하시면 매일 새로운<br>행운 메시지를 드려요 💛', btn: '🔑 로그인하고 행운 받기' },
      en: { title: "Today's fortune is a member perk", desc: 'Log in to receive a new<br>fortune message every day 💛', btn: '🔑 Log in & get your fortune' },
      zh: { title: '今日幸运是会员专属福利', desc: '登录后每天都能收到<br>新的幸运讯息 💛', btn: '🔑 登录领取幸运' },
      ja: { title: '今日の幸運は会員特典です', desc: 'ログインすると毎日新しい<br>幸運メッセージが届きます 💛', btn: '🔑 ログインして幸運を受け取る' }
    }[lang] || {
      title: '오늘의 행운은 회원 혜택이에요', desc: '로그인하시면 매일 새로운<br>행운 메시지를 드려요 💛', btn: '🔑 로그인하고 행운 받기'
    };
    document.getElementById('fortune-content').innerHTML = `
      <div style="background:white; border-radius:16px; padding:32px 20px; box-shadow:0 4px 16px rgba(212,165,116,0.15); margin-bottom:16px; text-align:center;">
        <div style="font-size:2.5rem; margin-bottom:12px;">🔒</div>
        <div style="font-size:1.1rem; font-weight:600; color:#4a3520; margin-bottom:10px; word-break:keep-all;">${L.title}</div>
        <div style="font-size:0.9rem; line-height:1.7; color:#4a3520; opacity:0.7; margin-bottom:20px; word-break:keep-all;">${L.desc}</div>
        <button onclick="closeFortuneModal();showLogin()" style="
          background:linear-gradient(135deg, #d4a574, #e8b88a);
          color:white;
          border:none;
          padding:12px 28px;
          border-radius:25px;
          font-weight:600;
          font-size:0.9rem;
          cursor:pointer;
          box-shadow:0 4px 12px rgba(212,165,116,0.3);
        ">${L.btn}</button>
      </div>
    `;
    document.getElementById('fortuneModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const lastVisit = localStorage.getItem('fortune_date');
  const savedFortune = localStorage.getItem('fortune_today');

  let fortune;
  let isRevisit = false;

  if (lastVisit === today && savedFortune) {
    // 오늘 이미 확인함
    fortune = JSON.parse(savedFortune);
    isRevisit = true;
  } else {
    // 새로운 행운 생성
    fortune = getRandomFortune();
    localStorage.setItem('fortune_date', today);
    localStorage.setItem('fortune_today', JSON.stringify(fortune));
  }

  const content = document.getElementById('fortune-content');
  content.innerHTML = `
    <div style="background:white; border-radius:16px; padding:28px 20px; box-shadow:0 4px 16px rgba(212,165,116,0.15); margin-bottom:16px;">
      <div style="font-size:0.75rem; color:#d4a574; font-weight:600; margin-bottom:12px; text-transform:uppercase; letter-spacing:1.5px; text-align:center;">
        ${isRevisit ? '오늘의 행운 (재확인)' : 'Today\'s Fortune'}
      </div>
      <div style="font-size:1.2rem; line-height:1.8; color:#4a3520; font-weight:500; margin-bottom:16px; word-break:keep-all; text-align:center;">
        ${fortune.message}
      </div>
      <div style="text-align:center;">
        <span style="display:inline-block; background:linear-gradient(135deg, #d4a574, #e8b88a); color:white; padding:6px 16px; border-radius:20px; font-size:0.75rem; font-weight:600; letter-spacing:0.5px;">
          ${fortune.category}
        </span>
      </div>
    </div>
    <div style="background:rgba(255,255,255,0.6); border-radius:12px; padding:16px; text-align:center;">
      <div style="font-size:0.9rem; font-weight:600; color:#4a3520; margin-bottom:10px;">더 정확한 운세가 궁금하신가요?</div>
      <button onclick="closeFortuneModal();startMode('solo')" style="
        background:linear-gradient(135deg, #d4a574, #e8b88a);
        color:white;
        border:none;
        padding:12px 28px;
        border-radius:25px;
        font-weight:600;
        font-size:0.9rem;
        cursor:pointer;
        box-shadow:0 4px 12px rgba(212,165,116,0.3);
      ">✨ AI 사주 풀이 받기</button>
    </div>
    <div style="margin-top:16px; font-size:0.7rem; color:#4a3520; opacity:0.5; text-align:center;">
      매일 새로운 행운 메시지가 준비됩니다 💛
    </div>
  `;

  document.getElementById('fortuneModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeFortuneModal() {
  document.getElementById('fortuneModal').style.display = 'none';
  document.body.style.overflow = '';
}
