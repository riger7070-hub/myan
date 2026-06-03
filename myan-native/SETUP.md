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

## 2. Google OAuth 설정

### Google Cloud Console (https://console.cloud.google.com)
1. 기존 마이안 프로젝트 선택 (또는 새 프로젝트)
2. **API 및 서비스 → 사용자 인증 정보 → + 만들기 → OAuth 2.0 클라이언트 ID**
3. 아래 3개 클라이언트 ID 생성:
   - **웹 애플리케이션** → Web Client ID
   - **Android** → 패키지: `com.myan.app`, SHA-1 지문 필요
   - **iOS** → 번들 ID: `com.myan.app`

### SHA-1 지문 추출 (Android용)
```bash
# EAS로 키스토어 생성 후 지문 확인
eas credentials --platform android
```

### src/constants.js 에 클라이언트 ID 입력
```js
export const GOOGLE_WEB_CLIENT_ID = 'xxx.apps.googleusercontent.com';
export const GOOGLE_IOS_CLIENT_ID = 'yyy.apps.googleusercontent.com';
```

## 3. Firebase 설정 (Google Sign-In 필수)

### Android
1. Firebase Console (https://console.firebase.google.com) → 프로젝트 → Android 앱 추가
2. 패키지: `com.myan.app`
3. `google-services.json` 다운로드 → `myan-native/` 폴더에 위치
4. SHA-1 지문 Firebase에도 등록

### iOS
1. Firebase Console → iOS 앱 추가
2. 번들 ID: `com.myan.app`
3. `GoogleService-Info.plist` 다운로드 → `myan-native/` 폴더에 위치

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
