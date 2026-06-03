# 보안 감사 보고서

**작성일**: 2026-06-03
**프로젝트**: M;Y 安 (myan)
**감사 도구**: npm audit

---

## 📊 요약

| 구분 | 개수 |
|------|------|
| 🔴 High | 15 |
| 🟡 Moderate | 13 |
| 🟢 Low | 1 |
| **총계** | **29** |

---

## 🎯 영향 범위

### ✅ 영향 없음
**웹 애플리케이션 (프로덕션)**
- 취약점은 모두 `myan-native` (React Native) 프로젝트에만 존재
- 웹 앱 (`index.html`, `worker.js`)은 **영향 없음**
- 즉시 조치 불필요

### ⚠️ 영향 있음
**모바일 앱 (myan-native)**
- Expo SDK 51 및 React Native 0.74.5의 하위 의존성
- 개발 환경에서만 사용 (아직 배포 전)

---

## 🔴 주요 취약점 분석

### 1. xmldom (High - 5개 취약점)
**패키지**: `@xmldom/xmldom@<=0.8.12`
**위험도**: High
**영향**: XML 인젝션, DoS

**영향받는 패키지**:
- `@expo/plist` → `@expo/cli` → `expo`

**실제 위험**:
- 개발 도구에서만 사용 (런타임 영향 없음)
- XML 파싱은 iOS/Android 빌드 시에만 사용

**조치 방법**:
```bash
# Expo SDK 56으로 업그레이드
cd myan-native
npm install expo@latest
```

### 2. fast-xml-parser (Moderate)
**패키지**: `fast-xml-parser@<5.7.0`
**위험도**: Moderate
**영향**: XML Comment/CDATA 인젝션

**영향받는 패키지**:
- `@react-native-community/cli-platform-android`
- React Native CLI 도구

**실제 위험**:
- 빌드 도구에서만 사용
- 사용자 데이터 처리 없음

### 3. tar (High - 6개 취약점)
**패키지**: `tar@<=7.5.10`
**위험도**: High
**영향**: 경로 순회, 심볼릭 링크 공격

**영향받는 패키지**:
- `cacache` (npm 캐시 도구)

**실제 위험**:
- 개발 환경에서만 사용
- 신뢰할 수 있는 패키지만 설치

### 4. uuid (Moderate)
**패키지**: `uuid@<11.1.1`
**위험도**: Moderate
**영향**: 버퍼 범위 체크 누락

**실제 위험**:
- 매우 낮음 (특정 사용 패턴에서만 발생)

### 5. postcss (Moderate)
**패키지**: `postcss@<8.5.10`
**위험도**: Moderate
**영향**: XSS via `</style>` 이스케이프 누락

**실제 위험**:
- 빌드 시에만 사용
- 사용자 입력 처리 안 함

### 6. send (Moderate)
**패키지**: `send@<0.19.0`
**위험도**: Moderate
**영향**: 템플릿 인젝션 → XSS

**실제 위험**:
- Expo 개발 서버에서만 사용
- 프로덕션 빌드에 포함 안 됨

---

## 🛠️ 권장 조치사항

### 우선순위 1: 즉시 (1일 내)
**현재 상태 유지 + 문서화**
- [x] 보안 감사 보고서 작성
- [ ] `.npmrc`에 audit 임계값 설정
```ini
# .npmrc
audit-level=high
```

### 우선순위 2: 단기 (1주 내)
**Expo SDK 업그레이드 테스트**

```bash
# 1. 별도 브랜치에서 테스트
git checkout -b upgrade/expo-sdk-56
cd myan-native

# 2. Expo SDK 56으로 업그레이드
npx expo upgrade 56

# 3. 빌드 테스트
npm run android
npm run ios

# 4. 취약점 재확인
npm audit

# 5. 정상 동작 확인 후 머지
```

**예상 효과**:
- 29개 → 0-5개로 감소 예상

### 우선순위 3: 중기 (1개월 내)
**의존성 자동 업데이트**

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/myan-native"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
```

### 우선순위 4: 장기 (분기별)
**정기 보안 감사**

```bash
# 월별 실행 (자동화)
npm audit --production
npm outdated
```

---

## 📝 실제 위험도 평가

### 웹 애플리케이션 (프로덕션)
**위험도**: 🟢 **없음**
- 취약점 0개
- 즉시 조치 불필요

### 모바일 앱 (개발 중)
**위험도**: 🟡 **낮음**

**이유**:
1. 대부분 빌드 도구/개발 도구
2. 런타임에 포함되지 않음
3. 사용자 데이터 처리 없음
4. 신뢰할 수 있는 환경에서만 실행

**실제 공격 시나리오**:
- ❌ 외부 공격자가 직접 익스플로잇 불가
- ❌ 사용자 데이터 유출 경로 없음
- ⚠️ 악의적 npm 패키지 설치 시에만 영향

---

## 🎯 즉시 적용 가능한 완화 조치

### 1. Audit Level 설정
```bash
cd myan-native
echo "audit-level=high" >> .npmrc
```

### 2. Lock 파일 검증
```bash
# package-lock.json 무결성 검증
npm ci --audit=false  # CI 환경에서 정확한 버전 설치
```

### 3. 신뢰할 수 있는 패키지만 설치
```bash
# 패키지 설치 전 확인
npm info <package-name>
npm view <package-name> repository
```

### 4. 개발 환경 격리
```bash
# Docker 사용 (선택사항)
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY myan-native/package*.json ./
RUN npm ci --production=false
```

---

## 📈 모니터링 계획

### 주간 체크리스트
- [ ] `npm audit` 실행
- [ ] GitHub Security 탭 확인
- [ ] Dependabot 알림 검토

### 월간 체크리스트
- [ ] `npm outdated` 검토
- [ ] Major 업데이트 테스트 브랜치 생성
- [ ] Breaking changes 문서 확인

### 분기별 체크리스트
- [ ] Expo SDK 최신 버전 업그레이드 검토
- [ ] React Native 버전 업그레이드 검토
- [ ] 전체 의존성 트리 리뷰

---

## 🔄 업그레이드 로드맵

### Phase 1: Expo SDK 56 (2주)
```json
{
  "expo": "~56.0.8",
  "react": "18.3.1",
  "react-native": "0.76.5"
}
```
**예상 작업**: 3-5일
**취약점 감소**: 29 → ~5개

### Phase 2: 의존성 정리 (1개월)
- 미사용 패키지 제거
- 중복 의존성 해결
- Bundle 크기 최적화

### Phase 3: 자동화 (2개월)
- GitHub Actions 보안 스캔
- Dependabot 자동 PR
- 주간 보안 리포트

---

## ✅ 결론

### 현재 상태
- **웹 앱**: 안전 ✅
- **모바일 앱**: 낮은 위험 ⚠️
- **즉시 조치**: 불필요 ✅

### 권장사항
1. ✅ **지금**: 현재 상태 유지 (프로덕션 영향 없음)
2. 📅 **1주 내**: Expo SDK 56 업그레이드 테스트
3. 🔄 **1개월 내**: Dependabot 설정
4. 📊 **정기**: 월간 보안 감사

### 우선순위
```
긴급도: 🟢 낮음
영향도: 🟡 중간 (모바일 앱만)
조치시기: 1-2주 내 계획된 업그레이드 시
```

---

**작성자**: Claude Sonnet 4.5
**검토**: 2026-06-03
**다음 검토 예정**: 2026-06-10
