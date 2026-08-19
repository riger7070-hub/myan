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
| 웹 → 네이티브 | `LANG:<ko\|en\|zh\|ja>` | `js/app.js` `setLang` 래퍼 (앱의 종료 안내 토스트용) |

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

### ⚠️ Dependabot 취약점 — 남은 3건은 고치지 않는다 (2026-08-19 확인)

한때 4건(high 3 · moderate 1)이었다. 그중 `nanoid` 하나는 `overrides` 로 올려서 없앴고
(아래 참고), 남은 3건(high 2 · moderate 1)은 고치지 않는다. **전부 이 폴더 것이다.** 루트와
`mini/` 는 0건이라, 워커와 미니앱 클라이언트에는 해당 사항이 없다.

| 심각도 | 패키지 | 내용 | 어디서 오나 | 앱에 실리나 |
|---|---|---|---|---|
| HIGH ×2 | `image-size` 1.2.1 | ICNS · JXL/HEIF 파서가 무한루프에 빠진다(DoS) | `metro` | 아니오(빌드 도구) |
| ~~HIGH~~ 해결 | `nanoid` 3.3.17 → **3.3.18** | 커스텀 생성기에 size 0 을 주면 무한루프 | `expo-router`, `postcss` | **예** |
| MODERATE | `uuid` 7.0.3 | v3/v5/v6 에 `buf` 를 넘길 때 경계 검사 누락 | `@expo/config-plugins` → `xcode` | 아니오(빌드 도구) |

`npm audit` 는 22건이라고 하지만 고유 권고는 남은 3개고 나머지는 그것이 의존성 트리로 퍼진 것이다.

**`npm audit fix --force` 를 실행하지 말 것.** npm 이 내놓는 "수정"은 이렇다:

```
expo          57.0.10 → 53.0.27
react-native   0.86.2 → 0.72.17
```

업그레이드가 아니라 대규모 다운그레이드다. 취약 권고에 안 걸리는 옛 버전을 찾아낸 것뿐이라,
돌리면 2026-08-05 에 EAS 빌드와 실기기까지 확인한 Expo 51→57 작업이 통째로 되돌아간다.

#### `image-size` · `uuid` — 빌드 머신에서만 도는 코드

둘 다 **내 빌드 머신에서 내 자산 파일을 읽을 때만** 도는 코드다. 성립하려면 악성 이미지를 이
저장소에 심을 수 있어야 하고, 앱은 웹뷰 셸이라 실행 중 공격면은 웹사이트지 이 패키지들이
아니다. `overrides` 로 `image-size@2` · `uuid@14` 를 억지로 끼우는 것도 답이 아니다 — 둘 다
메이저 API 변경이라 빌드가 깨질 쪽이 크다.

진짜 해결은 Expo 가 자기 `metro` / `config-plugins` 를 올릴 때 따라온다.

#### `nanoid` — 3.3.18 로 올렸다 (overrides)

⚠️ 위 둘과 묶어서 "전부 빌드 도구"라고 적으면 틀린다. `nanoid` 는 `expo-router` 가
런타임에 쓰므로 **앱 번들에 실제로 실린다**(`expo-router/build/fork/createMemoryHistory.js`).
그런데도 고치지 않는 근거는 따로 있다 — 3.3.17 과 3.3.18 을 직접 받아 비교한 결과다.

3.3.18 이 바꾼 코드는 **파일 하나뿐**이다(나머지는 README 와 버전):

```
async/index.native.js:  return size => tick('', size)
                     →  return (size = defaultSize) => {
                          if (size <= 0) return Promise.resolve('')
                          return tick('', size)
                        }
```

그 파일은 이 트리에서 **아무도 부르지 않는다**. `nanoid/async` 를 import 하는 코드가 없고,
그 파일이 의존하는 `expo-random` 은 설치조차 안 돼 있어 불러도 로드가 안 된다.

우리가 실제로 쓰는 경로는 둘 다 `nanoid/non-secure` 다:

| 부르는 곳 | 호출 | 실행 시점 |
|---|---|---|
| `expo-router` (createMemoryHistory) | `nanoid()` — 인자 없음(21자) | 런타임 |
| `postcss` (input.js) | `nanoid(6)` — 고정 크기 | 빌드 |

`non-secure` 는 루프가 `while (i-- > 0)` 라 size 가 0 이어도 그냥 빈 문자열을 반환하고 끝난다.
애초에 무한루프가 성립하는 구조가 아니고, 취약 함수인 `customAlphabet`/`customRandom` 을
부르는 곳은 트리 전체에 하나도 없다. 메인 진입점(`index.cjs`/`index.js`/`index.browser.js`)은
3.3.17 에 이미 `if (size <= 0) return ''` 가 들어 있다.

**그래서 이건 보안 수정이 아니라 배너 정리다.** 다른 셋과 달리 메이저가 아니라 패치 한 칸
(3.3.17 → 3.3.18)이라 Expo 를 건드리지 않아서, `package.json` 에 이렇게 넣어 올려 뒀다:

```json
"overrides": { "nanoid": "^3.3.18" }
```

확인한 것: `npm ls nanoid` 가 두 자리 모두 3.3.18, `npm audit` 에서 권고가 사라짐(23 → 22),
잠금파일 변화는 nanoid 한 항목 6줄뿐(다른 패키지는 안 딸려 왔다), `npm ci` 재현됨,
`npx expo export --platform android` 번들 성공.

⚠️ **대신 전이 의존성을 하나 고정한 상태가 됐다.** Expo 를 올릴 때 `nanoid@4` 나 `5` 를 요구하는
패키지가 들어오면 이 `overrides` 가 그걸 막아 설치가 깨진다. 그때는 고민하지 말고 이 항목을
지우면 된다 — 애초에 보안상 얻은 게 없으므로 지켜야 할 이유도 없다.

#### 다시 확인하려면

`npm audit --prefix myan-native`. 알림이 거슬리면 GitHub 에서
**Dismiss → "Vulnerable code is not actually used"** 로 닫아 둔다.

### ⚠️ 인앱결제 정책
Play Store와 App Store는 앱 내 디지털 재화 판매 시 Google Play Billing / Apple IAP 필수.
현재 토큰 충전은 외부 웹사이트(myan.riger7070.workers.dev)로 연결하는 방식으로 구현.
추후 인앱결제 전환 시 `react-native-iap` 패키지 사용 권장.

### 📱 iOS 빌드
iOS 빌드는 Apple Developer Program ($99/년) 가입 필요.
EAS Build 클라우드 서비스로 Mac 없이도 빌드 가능.
