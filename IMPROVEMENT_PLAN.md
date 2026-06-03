# M;Y 安 개선 제안서

## 📋 목차
1. [보안 및 안정성](#1-보안-및-안정성)
2. [사용자 경험 (UX)](#2-사용자-경험-ux)
3. [성능 최적화](#3-성능-최적화)
4. [개발자 경험 (DX)](#4-개발자-경험-dx)
5. [비즈니스 로직](#5-비즈니스-로직)
6. [우선순위 로드맵](#6-우선순위-로드맵)

---

## 1. 보안 및 안정성

### 🔴 긴급 (Critical)

#### 1.1 하드코딩된 민감 정보
**문제:**
```javascript
// js/app.js
const GOOGLE_CID = '806789036860-iu94f5ne93t2vh2mvfuqmi3mj95m8ick.apps.googleusercontent.com';
const ADMIN_EMAIL = 'riger7070@gmail.com';
const SHEETS_EP = 'https://script.google.com/macros/s/...';
```

**위험:**
- GitHub에 노출된 API 키 → 악용 가능
- Client ID 탈취 시 피싱 공격 가능
- Google Sheets 스크립트 URL 노출

**해결책:**
```javascript
// wrangler.toml에 환경변수로 관리
[vars]
GOOGLE_CLIENT_ID = "..." # public이므로 OK

# Secret으로 관리 (wrangler secret put)
ADMIN_EMAIL
SHEETS_WEBHOOK_URL
```

#### 1.2 의존성 보안 취약점
**문제:** GitHub에서 15개 취약점 경고 (11 high, 3 moderate, 1 low)

**해결책:**
```bash
# React Native 쪽 취약점 해결
cd myan-native
npm audit fix --force
npm outdated

# 주요 의존성 업데이트
expo-google-app-auth → @react-native-google-signin/google-signin (최신)
```

#### 1.3 에러 메시지 정보 노출
**문제:**
```javascript
catch(e) {
  return cors(JSON.stringify({ error: { message: e.message } }), 500);
}
```
→ 스택 트레이스, 파일 경로 등 노출 가능

**해결책:**
```javascript
catch(e) {
  console.error('[Server Error]', e); // 서버 로그
  return cors(JSON.stringify({ 
    error: { message: '일시적인 오류가 발생했습니다.' } 
  }), 500);
}
```

---

## 2. 사용자 경험 (UX)

### 🟡 중요 (High Priority)

#### 2.1 로딩 상태 피드백 부족
**문제:**
- 게스트 모드 "AI 분석 중..." 이후 아무 변화 없음
- 긴 AI 응답 대기 시간에 사용자 불안감

**해결책:**
```javascript
// 단계별 로딩 메시지
const loadingSteps = [
  { time: 0, msg: '사주의 흐름을 읽는 중...' },
  { time: 3000, msg: '오행의 기운을 분석하는 중...' },
  { time: 6000, msg: '최적의 처방을 구성하는 중...' }
];

// 프로그레스 바 추가
<div class="progress-bar">
  <div class="progress-fill" style="width: 0%"></div>
</div>
```

#### 2.2 모바일 입력 불편
**문제:**
- 생년월일 입력: `<input type="number">` 3개 → 불편
- 생시(시간) 선택: 드롭다운 24개 옵션

**해결책:**
```html
<!-- 생년월일 한 번에 입력 -->
<input type="date" max="2025-12-31" min="1920-01-01">

<!-- 생시 - 모바일 최적화 -->
<input type="time" step="3600"> <!-- 1시간 단위 -->
```

#### 2.3 토큰 부족 시 혼란
**문제:**
- "토큰이 부족합니다" → 어디서 충전? 얼마?
- 충전 페이지로 바로 이동 안 됨

**해결책:**
```javascript
// 토큰 부족 모달
function showTokenShortageModal() {
  return `
    <div class="modal">
      <h3>토큰이 부족합니다 💰</h3>
      <p>현재: 0개 | 필요: ${cost}개</p>
      <div class="package-quick">
        <button onclick="buyPackage('small')">
          30개 충전 (₩4,900)
        </button>
      </div>
    </div>
  `;
}
```

#### 2.4 게스트 모드 제한 안내 부족
**문제:**
- IP 제한 "이미 사용" 메시지만 → 언제 리셋되는지 모름

**해결책:**
```javascript
if (usage) {
  const resetTime = new Date(usage.used_date);
  resetTime.setDate(resetTime.getDate() + 1);
  const hours = Math.ceil((resetTime - Date.now()) / 3600000);
  
  return cors(JSON.stringify({
    error: { 
      message: `오늘의 무료 체험을 사용하셨습니다.\n${hours}시간 후 다시 이용 가능합니다.`,
      resetAt: resetTime.toISOString()
    }
  }), 429);
}
```

#### 2.5 오행 게이지 애니메이션 개선
**문제:**
- 갑자기 나타남 → 임팩트 부족
- 색상만으로 구분 → 접근성 낮음

**해결책:**
```css
/* 순차 애니메이션 */
.gauge-bar {
  animation: fillGauge 1s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  animation-delay: calc(var(--index) * 0.1s);
}

/* 숫자 카운팅 효과 */
@keyframes countUp {
  from { content: "0"; }
  to { content: attr(data-value); }
}
```

---

## 3. 성능 최적화

### 🟢 중간 (Medium Priority)

#### 3.1 불필요한 리렌더링
**문제:**
```javascript
// 매번 전체 드롭다운 재생성
function buildMypageDropdowns() {
  mSel.innerHTML = '<option value=""></option>';
  for (let i = 1; i <= 12; i++) { ... }
}
```

**해결책:**
```javascript
// 1회만 생성 후 캐싱
let _dropdownsBuilt = false;
function buildMypageDropdowns() {
  if (_dropdownsBuilt) return;
  // ... 드롭다운 생성
  _dropdownsBuilt = true;
}
```

#### 3.2 중복 API 호출
**문제:**
```javascript
// 토큰 조회 중복
await refreshTokens(); // 1번
updateAllTokenDisplays(); // 내부에서 또 조회
```

**해결책:**
```javascript
// 캐시 활용
const _tokenCache = { value: 0, expiry: 0 };

async function refreshTokens() {
  if (Date.now() < _tokenCache.expiry) {
    return _tokenCache.value;
  }
  // ... fetch
  _tokenCache = { value: tokens, expiry: Date.now() + 30000 };
}
```

#### 3.3 로컬 스토리지 과다 사용
**문제:**
```javascript
localStorage.setItem('myan_chat_html', innerHTML); // 전체 HTML 저장
```

**해결책:**
```javascript
// 필요한 데이터만 저장
localStorage.setItem('myan_chat_messages', JSON.stringify(hist));
// 복원 시 hist로부터 재생성
```

#### 3.4 이미지 최적화 미흡
**문제:**
- `icon-app-store-1024.png` → 1024x1024 원본 사용
- `splash-1200.png` → 압축 안 됨

**해결책:**
```bash
# WebP 변환 (50-80% 용량 감소)
cwebp icon-app-store-1024.png -o icon-app-store-1024.webp -q 80

# 반응형 이미지
<picture>
  <source srcset="icon-512.webp" type="image/webp">
  <img src="icon-512.png" alt="M;Y 安">
</picture>
```

---

## 4. 개발자 경험 (DX)

### 🔵 개선 (Nice to Have)

#### 4.1 코드 분리 부족
**문제:**
- `app.js` 3144줄 → 유지보수 어려움
- 모든 기능이 한 파일에

**해결책:**
```
js/
├── app.js (메인 엔트리)
├── modules/
│   ├── auth.js (인증 관련)
│   ├── chat.js (채팅 로직)
│   ├── payment.js (결제)
│   ├── screen-manager.js (화면 전환)
│   └── api-client.js (백엔드 통신)
└── utils/
    ├── storage.js (localStorage 래퍼)
    └── date.js (날짜 유틸)
```

#### 4.2 타입 안정성 부족
**문제:**
```javascript
const data = await res.json(); // any 타입
const ohaeng = data._ohaeng; // 오타 가능
```

**해결책 (JSDoc):**
```javascript
/**
 * @typedef {Object} OhaengData
 * @property {number} 木
 * @property {number} 火
 * @property {number} 土
 * @property {number} 金
 * @property {number} 水
 */

/**
 * @param {OhaengData} ohaeng
 */
function renderGauge(ohaeng) {
  // IDE 자동완성 + 오타 감지
}
```

#### 4.3 에러 로깅 시스템 부재
**문제:**
- 프로덕션 에러 추적 불가
- `console.error` → 사용자 브라우저에만 남음

**해결책:**
```javascript
// Sentry 또는 간단한 로깅
async function logError(error, context) {
  try {
    await fetch('/api/log-error', {
      method: 'POST',
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        context,
        userAgent: navigator.userAgent,
        timestamp: Date.now()
      })
    });
  } catch {}
}
```

#### 4.4 테스트 코드 부재
**문제:**
- 수동 테스트만 가능
- 리팩토링 시 regression 위험

**해결책:**
```javascript
// 간단한 단위 테스트
describe('ilchin', () => {
  it('should return correct 일진 for 2023-01-01', () => {
    const result = ilchin(new Date(2023, 0, 1));
    expect(result.ci).toBe(4); // 甲
    expect(result.ji).toBe(0); // 子
  });
});
```

---

## 5. 비즈니스 로직

### 💼 전략적 개선

#### 5.1 무료 토큰 남용 방지
**문제:**
- IP 기반 제한 → VPN으로 우회 가능
- 게스트 1회 → 무한 반복 가능

**해결책:**
```javascript
// 브라우저 핑거프린팅 추가
const fingerprint = await hash([
  navigator.userAgent,
  navigator.language,
  screen.width,
  screen.height,
  new Date().getTimezoneOffset()
].join('|'));

// IP + Fingerprint 조합으로 제한
await env.DB.prepare(
  `INSERT INTO guest_usage (ip, fingerprint, used_date, used_count) ...`
).bind(ip, fingerprint, today, 1);
```

#### 5.2 전환율 측정 부재
**문제:**
- 게스트 → 회원가입 전환율 모름
- 어떤 기능에서 이탈하는지 파악 안 됨

**해결책:**
```javascript
// 간단한 이벤트 트래킹
function trackEvent(event, data = {}) {
  fetch('/api/analytics', {
    method: 'POST',
    body: JSON.stringify({
      event,
      data,
      timestamp: Date.now(),
      session: getSessionId()
    })
  });
}

// 사용 예시
trackEvent('guest_complete'); // 게스트 완료
trackEvent('signup_from_guest'); // 게스트→가입
trackEvent('token_purchase', { package: 'small' }); // 결제
```

#### 5.3 재방문 유도 부족
**문제:**
- 일진이 매일 바뀌는데 알림 없음
- "내일 다시 오세요" → 잊어버림

**해결책:**
```javascript
// 웹 푸시 알림 개선
async function enableDailyReminder() {
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    // 매일 오전 8시 알림
    await subscribe({
      title: '오늘의 일진이 준비됐어요! 🌟',
      body: '오늘은 어떤 오행 기운이 흐를까요?',
      url: '/',
      schedule: '0 23 * * *' // UTC (KST 8AM)
    });
  }
}
```

#### 5.4 리텐션 전략
**문제:**
- 토큰 소진 후 이탈
- 재충전 유도 장치 없음

**해결책:**
```javascript
// 마지막 토큰 사용 시 특별 혜택
if (remainingTokens === 1) {
  showModal({
    title: '마지막 토큰입니다! 😱',
    message: '지금 충전하면 +3 보너스 토큰 제공',
    cta: '보너스 받고 충전하기'
  });
}

// 이탈 방지 팝업 (30일 미접속 시)
if (daysSinceLastVisit > 30) {
  offerComebackBonus(); // +5 토큰 지급
}
```

---

## 6. 우선순위 로드맵

### 🎯 1주차 (긴급)
- [ ] **보안**: API 키 환경변수 분리
- [ ] **보안**: 의존성 취약점 해결 (`npm audit fix`)
- [x] **UX**: 토큰 부족 시 충전 페이지 바로가기
- [x] **UX**: 게스트 제한 시 리셋 시간 표시

### 🎯 2주차 (중요)
- [x] **성능**: 이미지 WebP 변환
- [x] **성능**: 토큰 캐싱 (30초)
- [x] **UX**: 로딩 단계별 메시지 (이미 구현됨)
- [x] **UX**: 모바일 입력 개선 (`type="date"`)

### 🎯 1개월 (개선)
- [ ] **DX**: 코드 분리 (auth.js, chat.js 등) - 대규모 리팩토링 필요
- [x] **비즈니스**: 이벤트 트래킹 시스템
- [x] **비즈니스**: 재방문 푸시 알림 개선
- [ ] **성능**: 불필요한 리렌더링 최적화

### 🎯 분기별 (전략)
- [ ] **비즈니스**: A/B 테스트 (가격, 무료 토큰 개수)
- [ ] **DX**: TypeScript 또는 JSDoc 타입 추가
- [ ] **비즈니스**: 리텐션 프로그램 (출석 보상 강화)
- [ ] **성능**: Service Worker 캐싱 전략

---

## 📊 예상 효과

| 개선 항목 | 현재 | 목표 | 영향 |
|----------|------|------|------|
| 보안 취약점 | 15개 | 0개 | ⭐⭐⭐⭐⭐ |
| 모바일 전환율 | ? | +30% | ⭐⭐⭐⭐ |
| 페이지 로드 | ~2s | <1s | ⭐⭐⭐ |
| 코드 유지보수성 | 낮음 | 높음 | ⭐⭐⭐⭐ |
| 재방문율 | ? | +50% | ⭐⭐⭐⭐⭐ |

---

## 🔧 즉시 적용 가능한 Quick Wins

```bash
# 1. 의존성 업데이트 (5분)
cd myan-native && npm audit fix

# 2. 이미지 압축 (10분)
npm install -g webp-converter
find . -name "*.png" -exec cwebp -q 80 {} -o {}.webp \;

# 3. 환경변수 분리 (15분)
# wrangler.toml에 vars 섹션 추가

# 4. 에러 메시지 개선 (5분)
# catch 블록에서 e.message 제거
```

---

**작성일**: 2026-06-03
**작성자**: Claude Sonnet 4.5
**버전**: 1.0
