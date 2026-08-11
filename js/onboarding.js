// M;Y 安 — onboarding.js (첫 방문자 튜토리얼)

function shouldShowOnboarding() {
  try {
    const shown = localStorage.getItem('myan_onboarding_shown');
    return !shown;
  } catch {
    return false;
  }
}

function markOnboardingShown() {
  try {
    localStorage.setItem('myan_onboarding_shown', 'true');
  } catch {}
}

function startOnboarding() {
  if (!shouldShowOnboarding()) return;

  const lang = getLang();
  const steps = getOnboardingSteps(lang);
  let currentStep = 0;

  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.innerHTML = `
    <div class="onboarding-content">
      <div class="onboarding-header">
        <div class="onboarding-progress">
          <div class="onboarding-progress-bar" style="width: 0%"></div>
        </div>
        <button class="onboarding-skip" onclick="window.skipOnboarding()">
          ${{ko:'건너뛰기',en:'Skip',zh:'跳过',ja:'スキップ'}[lang] || '건너뛰기'}
        </button>
      </div>
      <div class="onboarding-body">
        <div class="onboarding-icon"></div>
        <div class="onboarding-title"></div>
        <div class="onboarding-desc"></div>
      </div>
      <div class="onboarding-footer">
        <div class="onboarding-dots"></div>
        <button class="onboarding-next"></button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  function updateStep() {
    const step = steps[currentStep];
    const progress = ((currentStep + 1) / steps.length) * 100;

    overlay.querySelector('.onboarding-progress-bar').style.width = `${progress}%`;
    overlay.querySelector('.onboarding-icon').innerHTML = icon(step.icon);
    overlay.querySelector('.onboarding-title').textContent = step.title;
    overlay.querySelector('.onboarding-desc').textContent = step.desc;

    const dots = overlay.querySelector('.onboarding-dots');
    dots.innerHTML = steps.map((_, i) =>
      `<div class="onboarding-dot${i === currentStep ? ' active' : ''}"></div>`
    ).join('');

    const nextBtn = overlay.querySelector('.onboarding-next');
    const isLast = currentStep === steps.length - 1;
    nextBtn.textContent = isLast
      ? ({ko:'시작하기',en:'Get Started',zh:'开始',ja:'開始する'}[lang] || '시작하기')
      : ({ko:'다음',en:'Next',zh:'下一步',ja:'次へ'}[lang] || '다음');

    nextBtn.onclick = () => {
      if (isLast) {
        closeOnboarding();
      } else {
        currentStep++;
        updateStep();
      }
    };
  }

  function closeOnboarding() {
    markOnboardingShown();
    overlay.classList.add('onboarding-closing');
    setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = '';
      if (typeof hapticMedium === 'function') hapticMedium();
    }, 300);
  }

  window.skipOnboarding = closeOnboarding;

  updateStep();
  setTimeout(() => overlay.classList.add('active'), 50);
}

function getOnboardingSteps(lang) {
  const steps = {
    ko: [
      {
        icon: 'saju',
        title: 'M;Y 安에 오신 걸 환영합니다',
        desc: '매일 당신의 사주와 오행 기운을 분석하여 오늘 하면 좋은 것을 알려드립니다.'
      },
      {
        icon: 'compat',
        title: '두 가지 모드',
        desc: '혼자 보는 Solo 모드와 커플/친구와 함께 보는 Duo 모드가 있어요.'
      },
      {
        icon: 'secGift',
        title: '토큰 시스템',
        desc: '운세 확인에는 토큰이 필요해요. 가입하면 3토큰을 무료로 드립니다!'
      },
      {
        icon: 'checkin',
        title: '연속 방문 보너스',
        desc: '매일 방문하면 스트릭이 쌓이고, 7일마다 토큰을 드려요!'
      }
    ],
    en: [
      {
        icon: 'saju',
        title: 'Welcome to M;Y 安',
        desc: 'We analyze your Saju and Five Elements daily to guide your best actions.'
      },
      {
        icon: 'compat',
        title: 'Two Modes',
        desc: 'Solo mode for yourself, or Duo mode with your partner/friend.'
      },
      {
        icon: 'secGift',
        title: 'Token System',
        desc: 'Readings require tokens. Sign up to get 3 free tokens!'
      },
      {
        icon: 'checkin',
        title: 'Streak Bonus',
        desc: 'Visit daily to build your streak and earn tokens every 7 days!'
      }
    ],
    zh: [
      {
        icon: 'saju',
        title: '欢迎来到 M;Y 安',
        desc: '每天分析您的四柱和五行气运，告诉您今天适合做什么。'
      },
      {
        icon: 'compat',
        title: '两种模式',
        desc: '单人Solo模式和情侣/朋友Duo模式。'
      },
      {
        icon: 'secGift',
        title: '代币系统',
        desc: '查看运势需要代币。注册即送3个代币！'
      },
      {
        icon: 'checkin',
        title: '连续访问奖励',
        desc: '每天访问积累连续天数，每7天获得代币奖励！'
      }
    ],
    ja: [
      {
        icon: 'saju',
        title: 'M;Y 安へようこそ',
        desc: '毎日あなたの四柱と五行を分析し、今日すべきことをお伝えします。'
      },
      {
        icon: 'compat',
        title: '2つのモード',
        desc: '一人で見るSoloモードとカップル/友達と見るDuoモードがあります。'
      },
      {
        icon: 'secGift',
        title: 'トークンシステム',
        desc: '運勢確認にはトークンが必要です。登録すると3トークン無料！'
      },
      {
        icon: 'checkin',
        title: '連続訪問ボーナス',
        desc: '毎日訪問するとストリークが貯まり、7日毎にトークンがもらえます！'
      }
    ]
  };

  return steps[lang] || steps.ko;
}

// DOMContentLoaded 후 실행
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => startOnboarding(), 1500);
  });
} else {
  setTimeout(() => startOnboarding(), 1500);
}
