// 모바일 환경에서 로그인 화면 테스트
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });

  // iPhone 12 Pro 시뮬레이션
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  });

  const page = await context.newPage();

  console.log('📱 모바일 브라우저 시작 (iPhone 12 Pro)');

  // 페이지 로드
  await page.goto('http://localhost:8787/', { waitUntil: 'domcontentloaded', timeout: 10000 });
  console.log('✅ 페이지 로드 완료');

  // 스플래시 화면이 사라질 때까지 대기
  await page.waitForTimeout(4000);

  // 홈 스크린샷
  await page.screenshot({ path: 'mobile-home.png', fullPage: true });
  console.log('📸 홈 화면 스크린샷 저장: mobile-home.png');

  // 메뉴 버튼 클릭 (햄버거 메뉴)
  const menuBtn = await page.$('.menu-btn');
  if (menuBtn) {
    await menuBtn.click();
    console.log('🍔 메뉴 버튼 클릭');
    await page.waitForTimeout(500);
  }

  // 회원가입 버튼 찾기 및 클릭
  const signupBtn = await page.$('#signupLinkBtn');
  if (signupBtn) {
    await signupBtn.click();
    console.log('✏️ 회원가입 버튼 클릭');
    await page.waitForTimeout(1000);
  }

  // 회원가입 화면 스크린샷
  await page.screenshot({ path: 'mobile-signup.png', fullPage: true });
  console.log('📸 회원가입 화면 스크린샷 저장: mobile-signup.png');

  // 폼 라벨 확인
  const labels = await page.$$eval('label', labels => labels.map(l => l.textContent));
  console.log('\n📋 폼 라벨 확인:');
  labels.forEach(label => {
    if (label.trim()) {
      console.log(`  - ${label.trim()}`);
    }
  });

  // 구글 버튼 확인
  const googleBtn = await page.$('#googleBtnEl');
  const hasGoogleBtn = googleBtn !== null;
  console.log(`\n🔍 구글 로그인 버튼: ${hasGoogleBtn ? '✅ 있음' : '❌ 없음'}`);

  // 제목 확인
  const headline = await page.$eval('#signupHeadline', el => el.textContent).catch(() => '');
  console.log(`📌 페이지 제목: "${headline}"`);

  // 입력 필드 확인
  const inputs = await page.$$eval('input[type="text"], input[type="email"], input[type="number"]',
    inputs => inputs.map(i => ({
      id: i.id,
      placeholder: i.placeholder,
      visible: i.offsetHeight > 0
    }))
  );
  console.log('\n📝 입력 필드:');
  inputs.forEach(input => {
    console.log(`  - ${input.id}: ${input.visible ? '✅ 표시됨' : '❌ 숨김'} ${input.placeholder ? `(placeholder: ${input.placeholder})` : ''}`);
  });

  // 뒤로가기 버튼 클릭
  const backBtn = await page.$('#backBtn');
  if (backBtn) {
    await backBtn.click();
    console.log('\n⬅️ 뒤로가기 버튼 클릭');
    await page.waitForTimeout(500);
  }

  // 로그인이 필요한 모드 선택 (나만의 리딩)
  const soloCard = await page.$('.card');
  if (soloCard) {
    await soloCard.click();
    console.log('☯ "나만의 리딩" 카드 클릭');
    await page.waitForTimeout(1000);
  }

  // 로그인 화면으로 이동했는지 확인
  const loginTitle = await page.$eval('#loginTitle', el => el.textContent).catch(() => '');
  console.log(`\n🔐 로그인 화면 제목: "${loginTitle}"`);

  // 로그인 화면 스크린샷
  await page.screenshot({ path: 'mobile-login.png', fullPage: true });
  console.log('📸 로그인 화면 스크린샷 저장: mobile-login.png');

  // 구글 로그인 버튼 확인
  const loginGoogleBtn = await page.$('#loginGoogleBtnEl');
  const hasLoginGoogleBtn = loginGoogleBtn !== null;
  console.log(`🔍 로그인 구글 버튼: ${hasLoginGoogleBtn ? '✅ 있음' : '❌ 없음'}`);

  console.log('\n✨ 테스트 완료! 스크린샷을 확인하세요.');
  console.log('브라우저를 닫으려면 아무 키나 누르세요...');

  // 30초 대기 후 자동 종료
  await page.waitForTimeout(30000);
  await browser.close();
})();
