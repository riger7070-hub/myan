// 빠른 모바일 테스트
const { chromium } = require('playwright');

(async () => {
  console.log('🚀 Playwright 시작...');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  });

  const page = await context.newPage();
  console.log('📱 모바일 컨텍스트 생성 (iPhone 12 Pro)');

  // 콘솔 로그 캡처
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') {
      console.log(`❌ 브라우저 에러: ${text}`);
    } else if (type === 'warn') {
      console.log(`⚠️ 브라우저 경고: ${text}`);
    }
  });

  // 페이지 에러 캡처
  page.on('pageerror', error => {
    console.log(`💥 페이지 에러: ${error.message}`);
  });

  try {
    console.log('📡 페이지 로드 시도 (캐시 무시)...');

    // 캐시 무시하고 새로 로드
    await page.goto('https://myan.riger7070.workers.dev/', {
      waitUntil: 'networkidle',
      timeout: 20000
    });

    // 강제 새로고침 (Ctrl+Shift+R)
    await page.reload({ waitUntil: 'networkidle' });
    console.log('✅ 페이지 로드 성공');

    await page.waitForTimeout(6000);

    await page.screenshot({ path: 'mobile-test-1-home.png', fullPage: true });
    console.log('📸 홈 화면 캡처: mobile-test-1-home.png');

    // 회원가입 링크 클릭
    const signupLink = await page.$('#signupLinkBtn');
    if (signupLink) {
      await signupLink.click();
      console.log('✏️ 회원가입 버튼 클릭');
      await page.waitForTimeout(1000);

      await page.screenshot({ path: 'mobile-test-2-signup.png', fullPage: true });
      console.log('📸 회원가입 화면 캡처: mobile-test-2-signup.png');

      // 라벨 체크
      const headline = await page.textContent('#signupHeadline').catch(() => 'NOT FOUND');
      const lblName = await page.textContent('#lblName').catch(() => 'NOT FOUND');
      const lblEmail = await page.textContent('#lblEmail').catch(() => 'NOT FOUND');

      console.log('\n📋 폼 라벨 확인:');
      console.log(`  제목: "${headline}"`);
      console.log(`  이름 라벨: "${lblName}"`);
      console.log(`  이메일 라벨: "${lblEmail}"`);
    }

    console.log('\n✨ 테스트 성공! 스크린샷을 확인하세요.');

  } catch (error) {
    console.error('❌ 에러:', error.message);
    await page.screenshot({ path: 'mobile-test-error.png' });
    console.log('📸 에러 화면 저장: mobile-test-error.png');
  }

  console.log('\n🔍 브라우저 창을 확인하세요. 20초 후 자동 종료됩니다...');
  await page.waitForTimeout(20000);
  await browser.close();
  console.log('✅ 테스트 완료');
})();
