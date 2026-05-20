# M;Y 安 — 아이콘 사용 가이드

## 📦 생성된 파일 (총 30개)

### 안드로이드 런처 (TWA APK용)
| 파일 | 사이즈 | 폴더에 넣을 곳 |
|---|---|---|
| `icon-mipmap-mdpi-48.png` | 48×48 | `res/mipmap-mdpi/ic_launcher.png` |
| `icon-mipmap-hdpi-72.png` | 72×72 | `res/mipmap-hdpi/ic_launcher.png` |
| `icon-mipmap-xhdpi-96.png` | 96×96 | `res/mipmap-xhdpi/ic_launcher.png` |
| `icon-mipmap-xxhdpi-144.png` | 144×144 | `res/mipmap-xxhdpi/ic_launcher.png` |
| `icon-mipmap-xxxhdpi-192.png` | 192×192 | `res/mipmap-xxxhdpi/ic_launcher.png` |

→ Bubblewrap 사용 중이시면 `twa-manifest.json`의 `iconUrl`을 192px PNG URL로 지정

### 안드로이드 적응형 아이콘 (Android 8.0+)
| 파일 | 용도 |
|---|---|
| `icon-foreground-432.png` | 전경 레이어 (글자·점) |
| `icon-background-432.png` | 배경 레이어 (그라데이션) |
| `icon-maskable-192.png` / `icon-maskable-512.png` | PWA 마스커블 |

→ `manifest.json`에 추가:
```json
{
  "icons": [
    { "src": "/icon-pwa-192-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-pwa-512-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png",
      "purpose": "maskable" }
  ]
}
```

### 스토어 등록
| 파일 | 용도 |
|---|---|
| `icon-play-store-512.png` | Google Play 앱 아이콘 (512×512 필수) |
| `icon-app-store-1024.png` | iOS App Store (앞으로 iOS 출시 시) |

### 웹사이트
| 파일 | HTML에 추가 |
|---|---|
| `favicon.ico` (multi-res) | `<link rel="icon" href="/favicon.ico">` |
| `icon-favicon-32-32.png` | `<link rel="icon" type="image/png" sizes="32x32" href="/icon-favicon-32-32.png">` |
| `icon-pwa-192-192.png` | `<link rel="apple-touch-icon" href="/icon-pwa-192-192.png">` |
| `icon-og-512-512.png` | `<meta property="og:image" content="https://myan-an.pages.dev/icon-og-512-512.png">` |

### 카카오톡 채널 / SNS
- `icon-kakao-profile-640.png` — 카카오톡 채널 프로필 이미지
- `icon-play-store-512.png` — 인스타그램·X·페이스북 프로필 (정사각 잘 맞음)

### 스플래시 스크린
- `splash-1200.png` / `splash-2048.png` — TWA 스플래시, PWA 시작 화면

### 원본 SVG (수정·재생성용)
- `master.svg` — 메인 아이콘
- `maskable.svg` — 마스커블
- `foreground.svg` / `background.svg` — 적응형 아이콘
- `splash.svg` — 스플래시

---

## 🚀 즉시 적용 — 우선순위

### 1. 웹사이트 favicon 교체 (5분)
```html
<head>
  <link rel="icon" href="/favicon.ico">
  <link rel="apple-touch-icon" sizes="192x192" href="/icon-pwa-192-192.png">
  <meta property="og:image" content="/icon-og-512-512.png">
  <meta property="og:title" content="M;Y 安 · 오행 기운 리딩">
  <meta property="og:description" content="명리학 기반 오늘의 사주와 일진 풀이">
</head>
```

→ Cloudflare Pages 루트에 아이콘 파일들 업로드 후 index.html 위 태그 추가

### 2. 카카오톡 채널 프로필 (3분)
[카카오톡 채널 관리자센터](https://center-pf.kakao.com) → 프로필 설정 → `icon-kakao-profile-640.png` 업로드

### 3. SNS 프로필 일괄 적용 (10분)
- X, 인스타그램, 페이스북, 유튜브 채널 → `icon-play-store-512.png` 업로드
- 모든 채널이 동일 아이콘 = 브랜드 인지도 향상

### 4. TWA 앱 재빌드 (1시간, 사업자등록증 받은 후)
Bubblewrap CLI에서:
```bash
bubblewrap update
# manifest.json의 iconUrl을 새 192px 아이콘 URL로 수정
bubblewrap build
```
→ 새 APK/AAB 빌드 → Google Play 새 버전 업로드

---

## 🔧 미세 조정이 필요하면

마음에 안 드는 부분이 있으면 `master.svg` 열어서 수정할 수 있어요:

```svg
<!-- 글자 크기 조정 -->
<g ... font-size="120" ...>  <!-- 더 크게: 140, 더 작게: 100 -->

<!-- 오행 점 크기 조정 -->
<circle ... r="8" ... />  <!-- 더 크게: 12, 더 작게: 6 -->

<!-- 골드 색상 조정 -->
fill="#c9a96e"  <!-- 더 밝게: #d4b87a, 더 어둡게: #b09454 -->
```

수정 후 [CloudConvert](https://cloudconvert.com/svg-to-png)나 [Convertio](https://convertio.co/svg-png/)에서 SVG→PNG 변환 가능.

---

## 📝 미리보기

ZIP 안에 `preview.html` 들어있어요. 더블클릭으로 열면 모든 사이즈가 한눈에 보입니다.
