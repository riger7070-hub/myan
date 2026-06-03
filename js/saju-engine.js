// M;Y 安 — saju-engine.js  (사주 오행 계산·게이지 렌더)

// 메모이제이션된 사주 계산 (같은 입력에 대해 캐시 사용)
const _sajuCache = new Map();

function calcSajuElements(user) {
  // 캐시 키 생성
  const cacheKey = `${user.birthYear}-${user.birthMonth}-${user.birthDay}-${user.birthHour || 'none'}`;

  // 캐시에 있으면 바로 반환
  if (_sajuCache.has(cacheKey)) {
    return _sajuCache.get(cacheKey);
  }

  const year  = parseInt(user.birthYear)  || 2000;
  const month = parseInt(user.birthMonth) || 1;
  const day   = parseInt(user.birthDay)   || 1;
  const time  = user.birthHour || '';

  const SIJI_IDX = {'자시':0,'축시':1,'인시':2,'묘시':3,'진시':4,'사시':5,'오시':6,'미시':7,'신시':8,'유시':9,'술시':10,'해시':11};

  // 년주
  const yearIdx = ((year - 4) % 60 + 60) % 60;
  const yStem   = yearIdx % 10;
  const yBranch = yearIdx % 12;

  // 월주 (절기 미반영 간략화)
  const mBranchArr = [1,2,3,4,5,6,7,8,9,10,11,0];
  const mBranch    = mBranchArr[month - 1];
  const mStem      = ((yStem % 5) * 2 + mBranch) % 10;

  // 일주
  const ref    = new Date(2023, 0, 1);
  const birth  = new Date(year, month - 1, day);
  const diff   = Math.round((birth - ref) / 864e5);
  const dayIdx = ((44 + diff) % 60 + 60) % 60;
  const dStem   = dayIdx % 10;
  const dBranch = dayIdx % 12;

  // 시주
  const siBranch = SIJI_IDX[time] ?? -1;
  const siStem   = siBranch >= 0 ? ((dStem % 5) * 2 + siBranch) % 10 : -1;

  const count = {木:0,火:0,土:0,金:0,水:0};
  [yStem, mStem, dStem, ...(siStem >= 0 ? [siStem] : [])].forEach(s => count[CGO[s]]++);
  [yBranch, mBranch, dBranch, ...(siBranch >= 0 ? [siBranch] : [])].forEach(b => count[JJO[b]]++);

  const total = Object.values(count).reduce((a, b) => a + b, 0);
  const result = { count, total };

  // 캐시에 저장 (최대 50개 유지)
  if (_sajuCache.size > 50) {
    const firstKey = _sajuCache.keys().next().value;
    _sajuCache.delete(firstKey);
  }
  _sajuCache.set(cacheKey, result);

  return result;
}

function _renderSajuGauge(user) {
  const section  = document.getElementById('saju-gauge-section');
  const divider  = document.getElementById('sajuGaugeDivider');
  if (!user?.birthYear) { section.style.display = 'none'; if (divider) divider.style.display = 'none'; return; }
  section.style.display = ''; if (divider) divider.style.display = '';
  const lbl = {ko:'내 사주 오행 분포', en:'My Five Elements', zh:'五行分布', ja:'五行分布'};
  document.getElementById('sajuGaugeLbl').textContent = lbl[lang] || lbl.ko;
  const { count, total } = calcSajuElements(user);
  const nameMap = {ko:{木:'목(木)',火:'화(火)',土:'토(土)',金:'금(金)',水:'수(水)'}, en:{木:'Wood',火:'Fire',土:'Earth',金:'Metal',水:'Water'}, zh:{木:'木',火:'火',土:'土',金:'金',水:'水'}, ja:{木:'木気',火:'火気',土:'土気',金:'金気',水:'水気'}};
  const names = nameMap[lang] || nameMap.ko;
  const wrap = document.getElementById('sajuGaugeWrap');
  wrap.innerHTML = ['木','火','土','金','水'].map(e => {
    const pct = total > 0 ? Math.round((count[e] / total) * 100) : 0;
    return `<div class="saju-gauge-row">
      <div class="saju-gauge-label">${names[e]}</div>
      <div class="saju-gauge-bar-bg"><div class="saju-gauge-bar" data-pct="${pct}" style="width:0;background:${OC[e]};--glow-color:${OC[e]}"></div></div>
      <div class="saju-gauge-pct">${pct}%</div>
    </div>`;
  }).join('');
  // 애니메이션: 다음 프레임에 width 적용
  requestAnimationFrame(() => {
    wrap.querySelectorAll('.saju-gauge-bar').forEach(bar => {
      bar.style.width = bar.dataset.pct + '%';
    });
  });
}

// AI 정밀 분석 오행 분포 게이지 렌더 (Gemini _ohaeng 데이터 기반)
// revealDelay > 0 이면 클리프행어 연출: 지정 ms 후 페이드인 + 바 애니메이션
function _renderSajuGaugeFromGemini(ohaeng, revealDelay = 0) {
  const section = document.getElementById('saju-gauge-section');
  const divider = document.getElementById('sajuGaugeDivider');
  const lbl = {ko:'내 사주 오행 분포 ✦ AI 정밀 분석', en:'My Five Elements ✦ AI Analysis', zh:'五行分布 ✦ AI精析', ja:'五行分布 ✦ AI精析'};
  document.getElementById('sajuGaugeLbl').textContent = lbl[lang] || lbl.ko;
  const nameMap = {ko:{木:'목(木)',火:'화(火)',土:'토(土)',金:'금(金)',水:'수(水)'}, en:{木:'Wood',火:'Fire',土:'Earth',金:'Metal',水:'Water'}, zh:{木:'木',火:'火',土:'土',金:'金',水:'水'}, ja:{木:'木気',火:'火気',土:'土気',金:'金気',水:'水気'}};
  const names = nameMap[lang] || nameMap.ko;
  const wrap = document.getElementById('sajuGaugeWrap');
  wrap.innerHTML = ['木','火','土','金','水'].map(e => {
    const pct = ohaeng[e] || 0;
    return `<div class="saju-gauge-row">
      <div class="saju-gauge-label">${names[e]}</div>
      <div class="saju-gauge-bar-bg"><div class="saju-gauge-bar" data-pct="${pct}" style="width:0;background:${OC[e]};--glow-color:${OC[e]}"></div></div>
      <div class="saju-gauge-pct">${pct}%</div>
    </div>`;
  }).join('');

  if (revealDelay > 0) {
    // 클리프행어 연출: 먼저 숨기고, revealDelay 후 페이드인
    section.style.display = '';
    if (divider) divider.style.display = '';
    section.style.opacity = '0';
    section.style.transform = 'translateY(14px)';
    section.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
    setTimeout(() => {
      section.style.opacity = '1';
      section.style.transform = 'translateY(0)';
      requestAnimationFrame(() => {
        wrap.querySelectorAll('.saju-gauge-bar').forEach(bar => {
          bar.style.width = bar.dataset.pct + '%';
        });
      });
    }, revealDelay);
  } else {
    section.style.display = '';
    if (divider) divider.style.display = '';
    section.style.opacity = '';
    section.style.transform = '';
    section.style.transition = '';
    requestAnimationFrame(() => {
      wrap.querySelectorAll('.saju-gauge-bar').forEach(bar => {
        bar.style.width = bar.dataset.pct + '%';
      });
    });
  }
}
