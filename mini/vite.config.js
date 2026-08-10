import { defineConfig } from 'vite';

export default defineConfig({
  // 앱인토스는 빌드 산출물을 그대로 .ait 로 묶는다. 정적 파일이 웹뷰에서 file/상대경로로
  // 로드되므로 절대경로(/assets/...)를 쓰면 안 된다.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 번들이 100MB 를 넘으면 콘솔 업로드가 막힌다. 지금은 한참 아래지만 경고 기준을 낮춰 둔다.
    chunkSizeWarningLimit: 600,
  },
  server: { host: 'localhost', port: 5173 },
});
