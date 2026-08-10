import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // ⚠️ 콘솔에 등록한 앱 이름과 정확히 같아야 한다. 딥링크(intoss://myan)에도 그대로 쓰인다.
  appName: 'myan',
  brand: {
    displayName: 'M;Y 安',
    primaryColor: '#c9a96e',
    // 콘솔에 올린 아이콘 URL. 웹 서비스가 정적 자산으로 그대로 서빙한다.
    icon: 'https://myan.riger7070.workers.dev/icon-app-600.png',
  },
  // 첫 버전은 카메라·위치·연락처를 하나도 안 쓴다. 안 쓰는 권한을 미리 넣으면
  // 심사에서 사유를 소명해야 하고 사용자에게도 불필요한 동의를 받게 된다.
  permissions: [],
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite dev',
      build: 'vite build',
    },
  },
  outdir: 'dist',
});
