// M;Y 安 — Analytics Module
// 사용자 행동 추적 및 분석

const ANALYTICS_CONFIG = {
  enabled: true, // 프로덕션에서만 true
  debug: false,  // 개발 시 true로 설정하면 콘솔에 로그
};

// 이벤트 타입 정의
const EVENT_TYPES = {
  // 사용자 행동
  PAGE_VIEW: 'page_view',
  MODE_SELECT: 'mode_select',
  CHAT_SEND: 'chat_send',

  // 인증
  LOGIN_START: 'login_start',
  LOGIN_SUCCESS: 'login_success',
  SIGNUP_SUCCESS: 'signup_success',
  LOGOUT: 'logout',

  // 결제
  PAYMENT_START: 'payment_start',
  PAYMENT_SUCCESS: 'payment_success',
  PAYMENT_FAIL: 'payment_fail',

  // 기능 사용
  CALENDAR_SAVE: 'calendar_save',
  SCREENSHOT_TAKE: 'screenshot_take',
  SHARE_CLICK: 'share_click',

  // 게스트
  GUEST_START: 'guest_start',
  GUEST_SUBMIT: 'guest_submit',
  GUEST_LIMIT: 'guest_limit_reached',

  // 토큰
  TOKEN_INSUFFICIENT: 'token_insufficient',
  TOKEN_CHARGE_CLICK: 'token_charge_click',

  // 에러
  ERROR_OCCURRED: 'error_occurred',
};

// 자체 트래킹 (서버 로그용)
async function trackEvent(eventType, properties = {}) {
  if (!ANALYTICS_CONFIG.enabled) return;

  const eventData = {
    event: eventType,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    ...properties
  };

  // 디버그 모드
  if (ANALYTICS_CONFIG.debug) {
    console.log('[Analytics]', eventType, properties);
  }

  // Google Analytics 4 (gtag.js가 로드되어 있을 경우)
  if (typeof gtag !== 'undefined') {
    gtag('event', eventType, properties);
  }

  // 서버로 이벤트 전송 (옵션)
  try {
    // 백엔드에 /analytics 엔드포인트 추가 필요
    // await fetch('/analytics', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(eventData)
    // });
  } catch (e) {
    // 트래킹 실패해도 사용자 경험에 영향 없도록 무시
  }
}

// 페이지뷰 트래킹
function trackPageView(pageName, properties = {}) {
  trackEvent(EVENT_TYPES.PAGE_VIEW, {
    page_name: pageName,
    page_path: window.location.pathname,
    ...properties
  });
}

// 모드 선택 트래킹
function trackModeSelect(mode) {
  trackEvent(EVENT_TYPES.MODE_SELECT, {
    mode: mode,
    is_logged_in: !!localStorage.getItem('myan_id_token')
  });
}

// 채팅 전송 트래킹
function trackChatSend(mode, messageLength, isFirstMessage) {
  trackEvent(EVENT_TYPES.CHAT_SEND, {
    mode: mode,
    message_length: messageLength,
    is_first_message: isFirstMessage
  });
}

// 로그인/회원가입 트래킹
function trackLogin(success = true) {
  trackEvent(success ? EVENT_TYPES.LOGIN_SUCCESS : EVENT_TYPES.LOGIN_START);
}

function trackSignup() {
  trackEvent(EVENT_TYPES.SIGNUP_SUCCESS);
}

function trackLogout() {
  trackEvent(EVENT_TYPES.LOGOUT);
}

// 결제 트래킹
function trackPayment(stage, amount = null, tokenAmount = null, error = null) {
  const eventType = stage === 'start' ? EVENT_TYPES.PAYMENT_START :
                   stage === 'success' ? EVENT_TYPES.PAYMENT_SUCCESS :
                   EVENT_TYPES.PAYMENT_FAIL;

  trackEvent(eventType, {
    amount: amount,
    token_amount: tokenAmount,
    error: error
  });
}

// 게스트 트래킹
function trackGuest(action) {
  const eventMap = {
    start: EVENT_TYPES.GUEST_START,
    submit: EVENT_TYPES.GUEST_SUBMIT,
    limit: EVENT_TYPES.GUEST_LIMIT
  };
  trackEvent(eventMap[action] || EVENT_TYPES.GUEST_START);
}

// 토큰 트래킹
function trackToken(action, currentBalance = null) {
  const eventType = action === 'insufficient' ? EVENT_TYPES.TOKEN_INSUFFICIENT :
                   EVENT_TYPES.TOKEN_CHARGE_CLICK;

  trackEvent(eventType, {
    current_balance: currentBalance
  });
}

// 기능 사용 트래킹
function trackFeature(featureName, properties = {}) {
  trackEvent(featureName, properties);
}

// 에러 트래킹
function trackError(errorType, errorMessage, context = {}) {
  trackEvent(EVENT_TYPES.ERROR_OCCURRED, {
    error_type: errorType,
    error_message: errorMessage,
    ...context
  });
}

// 전역 노출
window.Analytics = {
  track: trackEvent,
  trackPageView,
  trackModeSelect,
  trackChatSend,
  trackLogin,
  trackSignup,
  trackLogout,
  trackPayment,
  trackGuest,
  trackToken,
  trackFeature,
  trackError,
  EVENT_TYPES,
  config: ANALYTICS_CONFIG
};
