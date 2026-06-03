// ── API ──────────────────────────────────────────────────────────────
export const API_BASE = 'https://myan.riger7070.workers.dev/api/';

// ── Google OAuth 클라이언트 ID ────────────────────────────────────────
// Google Cloud Console → 사용자 인증 정보 에서 발급
// Android: SHA-1 지문 등록 필요 (keytool 명령어로 추출)
// iOS: iOS 앱용 OAuth 2.0 클라이언트 ID
export const GOOGLE_WEB_CLIENT_ID     = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';
export const GOOGLE_IOS_CLIENT_ID     = 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com';

// ── 컬러 팔레트 ──────────────────────────────────────────────────────
export const COLORS = {
  bg:           '#060608',
  bgCard:       '#0e0e12',
  bgInput:      '#13131a',
  border:       'rgba(201,169,110,0.15)',
  gold:         '#c9a96e',
  goldLight:    '#e8c98e',
  goldDim:      'rgba(201,169,110,0.4)',
  text:         '#d4c5a9',
  textMuted:    '#6b6560',
  textSub:      '#9e9590',
  red:          '#e07070',
  white:        '#ffffff',
  bubble: {
    ai:         '#0e0e12',
    user:       'rgba(201,169,110,0.12)',
  },
};

// ── 오행 색상 ─────────────────────────────────────────────────────────
export const OHAENG_COLORS = {
  木: '#4a7c59',
  火: '#c0392b',
  土: '#b8860b',
  金: '#7f8c8d',
  水: '#2471a3',
};

// ── 타이포그래피 ─────────────────────────────────────────────────────
export const FONT = {
  brand:    'Serif',   // 추후 커스텀 폰트 교체
  body:     'System',
  size: {
    xs:  11,
    sm:  13,
    md:  15,
    lg:  17,
    xl:  20,
    xxl: 26,
  },
};
