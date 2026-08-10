import { defineConfig } from '@apps-in-toss/web-framework/config';

// SDK v3 설정. v1 의 granite.config.ts 와 스키마가 다르다 —
// displayName·icon 은 콘솔에서 관리하게 바뀌었고, 빌드 명령도 CLI 가 대신 돌려주지 않는다.
// (package.json 의 build 가 vite build 로 정적 파일을 만든 뒤 ait build 가 그걸 묶는다.)
export default defineConfig({
  // ⚠️ 콘솔에 등록한 앱 이름과 정확히 같아야 한다. 딥링크(intoss://myan)에도 그대로 쓰인다.
  appName: 'myan',
  brand: {
    primaryColor: '#c9a96e',
  },
  // 첫 버전은 카메라·위치·연락처를 하나도 안 쓴다. 안 쓰는 권한을 미리 넣으면
  // 심사에서 사유를 소명해야 하고 사용자에게도 불필요한 동의를 받게 된다.
  permissions: [],
  // vite 의 outDir 와 같아야 한다(vite.config.js 참고).
  webBundleDir: 'dist',
});
