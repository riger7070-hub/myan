# M;Y 安 — React Native 앱 셋업 가이드

## 1. 필수 설치

```bash
# Node.js 20+ 필요 (https://nodejs.org)
# 패키지 설치
cd myan-native
npm install

# EAS CLI 설치 (빌드/배포용)
npm install -g eas-cli

# Expo CLI
npm install -g expo-cli
```

## 2. Google OAuth 설정 (2026-08-08 등록 완료)

**Firebase는 쓰지 않는다.** `@react-native-google-signin/google-signin` 은 Firebase 없이도 동작하며,
`app/index.jsx` 의 `GoogleSignin.configure({ webClientId })` 로 웹 클라이언트 ID 를 직접 넘긴다.
따라서 `google-services.json` / `GoogleService-Info.plist` 는 **필요 없다**(2026-08-07에 제거).

### 반드시 필요한 것: 웹과 **같은** 프로젝트에 Android OAuth 클라이언트 등록

현재 `app/index.jsx` 의 `WEB_CLIENT_ID` 는 프로젝트 **806789036860** 소속이다.
안드로이드 네이티브 로그인은 앱 서명(패키지명 + SHA-1)이 **webClientId 와 같은 프로젝트**에
Android 클라이언트로 등록돼 있어야 통과한다. 다른 프로젝트에 등록하면 `DEVELOPER_ERROR` 가 난다.

프로젝트 번호 806789036860 = 프로젝트 ID `caramel-source-494211-e8`(콘솔 표시명 "My Project 83531").
콘솔 URL 에 번호를 넣어도 이 ID 로 리다이렉트되는 게 정상이다 — 다른 프로젝트로 튕긴 게 아니다.

1. SHA-1 지문 — EAS 업로드 키(2026-08-07 기준, 키스토어를 새로 만들지 않는 한 그대로):
   ```
   1C:68:0A:F2:7A:38:80:64:FC:92:B0:80:FA:3D:80:EB:CB:E5:EF:4D
   ```
   다시 확인하려면 `eas credentials --platform android` (대화형 메뉴라 터미널에서 직접 실행해야 한다)
   또는 https://expo.dev/accounts/myansik/projects/myan/credentials
2. **[완료 2026-08-08]** 위 프로젝트에 Android 클라이언트 `myan Android (EAS upload key)` 등록
   (패키지 `com.myan.app` + 위 SHA-1). 클라이언트 ID 는
   `806789036860-jdeond92nr1fv4a987ejo9uinm7vt4hs.apps.googleusercontent.com`.
   이 ID 는 **코드에 넣지 않는다** — 구글이 앱 서명을 검증하는 용도로만 존재하고,
   코드는 계속 `webClientId` 만 쓴다.
3. **[완료 2026-08-08]** OAuth 동의 화면 게시 상태를 `테스트 중` → **`프로덕션`** 으로 전환.
   테스트 중이면 테스트 사용자 목록에 없는 계정이 막힐 수 있는데 목록이 비어 있었다.
   등록된 범위가 하나도 없어서(민감·제한 범위 0개) 구글 인증 심사 없이 즉시 전환됐다.
   → 콘솔 "Google 인증 플랫폼 → 대상" 에서 확인 가능.

### 아직 남은 것: Play Store 배포 시 Play 앱 서명 키 SHA-1 추가 등록

구글이 업로드 키를 자기 키로 다시 서명하므로, Play Console → 설정 → 앱 서명 에서
**Play 앱 서명 키**의 SHA-1 을 위 Android 클라이언트에 하나 더 넣어야 한다.
빠뜨리면 내부 테스트 APK 는 로그인되는데 스토어에서 받은 앱만 `DEVELOPER_ERROR` 가 난다.

### iOS 를 시작할 때 추가로 할 일
같은 프로젝트에서 **iOS** 클라이언트 ID(번들 `com.myan.app`)를 만든 뒤,
`app.json` 의 `plugins` 에 아래를 다시 넣는다(역방향 URL 스킴 등록용):
```json
["@react-native-google-signin/google-signin", { "iosUrlScheme": "com.googleusercontent.apps.806789036860-..." }]
```
그리고 `GoogleSignin.configure` 에 `iosClientId` 를 추가한다.

## 3. 웹 ↔ 네이티브 브릿지

앱은 웹사이트를 그대로 띄우는 WebView 셸이라, 로그인·외부링크는 양쪽이 메시지로 주고받는다.
한쪽만 고치면 조용히 죽으므로 **항상 짝으로** 수정할 것.

| 방향 | 이름 | 위치 |
|---|---|---|
| 네이티브 → 웹 | `window._isNativeApp` 플래그 주입 | `app/index.jsx` `INJECTED_JS_BEFORE` |
| 네이티브 → 웹 | `window.__nativeGoogleToken(idToken)` / `__nativeGoogleError(msg)` → `nativeGoogleSignIn` 이벤트 | 〃 |
| 웹 → 네이티브 | `GOOGLE_SIGNIN_REQUEST` | `js/app.js` `_nativeGoogleSignIn()` |
| 웹 → 네이티브 | `GOOGLE_SIGNOUT_REQUEST` | `js/app.js` `_signOut()` / `_withdrawAccount()` |
| 웹 → 네이티브 | `OPEN_EXTERNAL:<url>` | `js/app.js` `openExternal()` |

- 안드로이드 WebView 에서는 구글이 웹 로그인(GIS)을 차단하므로, 앱에서는 GIS 버튼 대신
  네이티브 버튼(`_renderNativeGoogleBtn`)을 띄우고 네이티브 SDK 로 위임한다.
- 네이티브가 돌려주는 것도 같은 구글 ID 토큰이라 웹의 기존 `handleGoogleCredential` 을 그대로 탄다.
- 토스 결제는 `successUrl` 로 앱에 돌아와야 하므로 **외부 브라우저로 보내지 않는다**(웹뷰 안에서 진행).
- `kakaotalk://` 같은 커스텀 스킴은 react-native-webview 가 `originWhitelist` 밖이라
  자동으로 `Linking` 에 넘긴다 — 따로 처리할 필요 없음.

## 4. 개발 서버 실행

```bash
# Expo Go로 테스트 (Google Sign-In은 개발 빌드 필요)
npx expo start

# 개발 빌드 생성 후 테스트 (Google Sign-In 포함)
eas build --profile development --platform android
eas build --profile development --platform ios
```

## 5. 앱 빌드 & 배포

### Android (Play Store)
```bash
# Preview APK (내부 테스트용)
eas build --profile preview --platform android

# 프로덕션 AAB (Play Store 업로드용)
eas build --profile production --platform android

# Google Play Console에 자동 업로드
eas submit --platform android
```

### iOS (App Store)
```bash
# 프로덕션 IPA
eas build --profile production --platform ios

# App Store Connect에 업로드
eas submit --platform ios
```

## 6. Play Store 등록 체크리스트

- [ ] Google Play Console 개발자 계정 ($25 완료)
- [ ] 앱 아이콘 (512×512 PNG)
- [ ] 스크린샷 (폰: 최소 2장, 태블릿: 선택)
- [ ] 앱 설명 (한국어, 필요시 다국어)
- [ ] 개인정보 처리방침 URL (필수)
- [ ] 콘텐츠 등급 설문 완료
- [ ] 대상 연령: 13세 이상

## 7. 주의 사항

### ⚠️ 인앱결제 정책
Play Store와 App Store는 앱 내 디지털 재화 판매 시 Google Play Billing / Apple IAP 필수.
현재 토큰 충전은 외부 웹사이트(myan.riger7070.workers.dev)로 연결하는 방식으로 구현.
추후 인앱결제 전환 시 `react-native-iap` 패키지 사용 권장.

### 📱 iOS 빌드
iOS 빌드는 Apple Developer Program ($99/년) 가입 필요.
EAS Build 클라우드 서비스로 Mac 없이도 빌드 가능.
