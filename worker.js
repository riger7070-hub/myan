// ============================================================================
// [D1 초기화 안내] 최초 1회 아래 쿼리를 Cloudflare D1 콘솔이나 Wrangler를 통해 실행하세요.
// 
// CREATE TABLE IF NOT EXISTS payment_requests (
//   id          TEXT    PRIMARY KEY,
//   user_email  TEXT    NOT NULL,
//   pkg         TEXT    NOT NULL,
//   amount      INTEGER NOT NULL DEFAULT 0,
//   tokens      INTEGER NOT NULL DEFAULT 0,
//   status      TEXT    NOT NULL DEFAULT 'pending',
//   created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
//   approved_at INTEGER
// );
// ============================================================================

import LunarPkg from 'lunar-javascript';
const { Solar } = LunarPkg;

const CG   = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const JJ   = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const CGO  = ['木','木','火','火','土','土','金','金','水','水'];
const JJO  = ['水','土','木','木','土','火','火','土','金','金','土','水'];

const ON = {
  ko:{木:'목(木)',火:'화(火)',土:'토(土)',金:'금(金)',水:'수(水)'},
  en:{木:'Wood',火:'Fire',土:'Earth',金:'Metal',水:'Water'},
  zh:{木:'木气',火:'火气',土:'土气',金:'金气',水:'水气'},
  ja:{木:'木(もく)',火:'火(か)',土:'土(ど)',金:'金(きん)',水:'水(すい)'},
};

function ilchin() {
  const ref = new Date(2023,0,1); ref.setHours(0,0,0,0);
  const now = new Date(); now.setHours(0,0,0,0);
  const idx = ((44 + Math.round((now-ref)/864e5)) % 60 + 60) % 60;
  return { ci: idx%10, ji: idx%12, o: CGO[idx%10], jo: JJO[idx%12] };
}

// ── 달의 위상(월령) — 실제 천문 계산 ──
// 별자리 운세가 생일만 보고 판정돼 1년 내내 톤이 같던 문제를 보완하려고 도입.
// 달은 매일 바뀌므로 "오늘"이 달라지는 실제 근거가 된다.
// 평균 삭망월 모델이라 실제 삭·망 대비 최대 ±0.5일 오차가 있으나,
// 8단계 위상은 한 단계가 약 3.7일이라 위상 판정에는 충분하다.
const SYNODIC_MONTH = 29.530588853;   // 삭망월(일) — 천문 표준값
const NEW_MOON_JD   = 2451550.09766;  // 기준 삭(Meeus): 2000-01-06
const UNIX_EPOCH_JD = 2440587.5;

// 0=삭 1=초승 2=상현 3=상현망간 4=보름 5=하현망간 6=하현 7=그믐
function moonPhase(date = new Date()) {
  const jd = date.getTime() / 86400000 + UNIX_EPOCH_JD;
  let age = (jd - NEW_MOON_JD) % SYNODIC_MONTH;
  if (age < 0) age += SYNODIC_MONTH;
  // 조도(0~1): 삭에서 0, 망에서 1
  const illumination = (1 - Math.cos(2 * Math.PI * age / SYNODIC_MONTH)) / 2;
  // 각 구간 중앙을 기준으로 반올림해야 삭(0일)과 그믐(29.5일)이 갈리지 않는다
  const index = Math.floor((age / SYNODIC_MONTH) * 8 + 0.5) % 8;
  return { age, illumination, index };
}

// 프롬프트에 넣을 한국어 표기 (AI가 각 언어로 번역해 설명한다)
const MOON_PHASE_KO = ['삭(신월)', '초승달', '상현달', '차오르는 달', '보름달', '기우는 달', '하현달', '그믐달'];

// 한글 시진명 → 지지(시지) 매핑
const SIJI_TO_JJ = {
  '자시':'子','축시':'丑','인시':'寅','묘시':'卯','진시':'辰','사시':'巳',
  '오시':'午','미시':'未','신시':'申','유시':'酉','술시':'戌','해시':'亥'
};

// ── 정확한 사주 4기둥(만세력) 계산 — 절기 반영. AI 환각 방지: 서버에서 코드로 산출 후 AI엔 해석만 시킴 ──
// hourInput: 한글 시진명('자시'~'해시') 또는 지지 글자('子'~'亥') 또는 빈값(출생시 모름)
function computeSaju(year, month, day, hourInput) {
  try {
    const y = parseInt(year), m = parseInt(month), d = parseInt(day);
    if (!y || !m || !d) return null;
    const ec = Solar.fromYmd(y, m, d).getLunar().getEightChar();
    const yp = ec.getYear();   // 예: '己巳'
    const mp = ec.getMonth();  // 예: '丁丑' (절기 기준 월주)
    const dp = ec.getDay();    // 예: '乙酉'
    const dayGan = dp[0];
    const dayGanIdx = CG.indexOf(dayGan);

    // 시주: 일간 + 시지로 五鼠遁(오서둔) 계산
    let hp = null;
    const raw = (hourInput || '').trim();
    const hourBranch = SIJI_TO_JJ[raw] || raw; // 한글 시진명이면 지지로 변환
    const hbIdx = JJ.indexOf(hourBranch);
    if (hbIdx >= 0 && dayGanIdx >= 0) {
      const hourGanIdx = ((dayGanIdx % 5) * 2 + hbIdx) % 10;
      hp = CG[hourGanIdx] + JJ[hbIdx];
    }

    // 오행 분포 (천간 4 + 지지 4)
    const elem = { 木:0, 火:0, 土:0, 金:0, 水:0 };
    [yp, mp, dp, ...(hp ? [hp] : [])].forEach(p => {
      const si = CG.indexOf(p[0]); if (si >= 0) elem[CGO[si]]++;
      const bi = JJ.indexOf(p[1]); if (bi >= 0) elem[JJO[bi]]++;
    });
    const elemStr = Object.entries(elem).map(([k, v]) => `${k}${v}`).join(' ');
    const dayElem = dayGanIdx >= 0 ? CGO[dayGanIdx] : '';

    const text = `年柱 ${yp} / 月柱 ${mp} / 日柱 ${dp} / 時柱 ${hp || '미상(출생시각 모름)'}`
      + ` · 일간(日干) ${dayGan}${dayElem} · 오행분포 ${elemStr}${hp ? '' : ' (시주 제외)'}`;

    return { yp, mp, dp, hp, dayGan, dayElem, elem, text };
  } catch (e) {
    return null;
  }
}

// ════════════════════════════
//  로컬(무료) 간단 사주 풀이 — Gemini 미호출, 토큰 미차감. 코드로 생성
// ════════════════════════════
const _GAN_TRAIT = {
  ko:{甲:'곧게 뻗는 큰 나무처럼 추진력과 리더십이 있어요',乙:'유연한 화초처럼 섬세하고 적응력이 좋아요',丙:'밝은 태양처럼 열정적이고 표현력이 풍부해요',丁:'따뜻한 촛불처럼 세심하고 헌신적이에요',戊:'든든한 산처럼 포용력 있고 안정적이에요',己:'비옥한 밭처럼 현실감각과 보살핌이 있어요',庚:'단단한 쇠처럼 결단력 있고 의리가 있어요',辛:'빛나는 보석처럼 예리하고 자존심이 강해요',壬:'큰 강물처럼 지혜롭고 포용력이 커요',癸:'맑은 이슬처럼 직관적이고 순수해요'},
  en:{甲:'driven with leadership, like a tall straight tree',乙:'delicate and adaptable, like a graceful plant',丙:'passionate and expressive, like the bright sun',丁:'attentive and devoted, like a warm candle',戊:'embracing and stable, like a solid mountain',己:'practical and nurturing, like fertile soil',庚:'decisive and loyal, like firm metal',辛:'sharp and proud, like a shining jewel',壬:'wise and generous, like a great river',癸:'intuitive and pure, like clear dew'},
  zh:{甲:'像高大的树木一样，具有推动力和领导力',乙:'像柔韧的花草一样，细腻且适应力强',丙:'像明亮的太阳一样，热情且表现力丰富',丁:'像温暖的烛光一样，细心且充满奉献',戊:'像稳固的山一样，包容且稳定',己:'像肥沃的田地一样，务实且善于照顾',庚:'像坚硬的金属一样，果断且讲义气',辛:'像闪耀的宝石一样，敏锐且自尊心强',壬:'像宽广的江河一样，智慧且包容',癸:'像清澈的露水一样，直觉且纯粹'},
  ja:{甲:'まっすぐ伸びる大木のように推進力とリーダーシップがある',乙:'しなやかな草花のように繊細で適応力が高い',丙:'明るい太陽のように情熱的で表現力が豊か',丁:'温かいろうそくのように細やかで献身的',戊:'どっしりした山のように包容力があり安定的',己:'肥沃な畑のように現実感覚と思いやりがある',庚:'硬い金属のように決断力があり義理堅い',辛:'輝く宝石のように鋭く自尊心が強い',壬:'大きな川のように知恵があり包容力が大きい',癸:'澄んだ露のように直感的で純粋'}
};
const _OHAENG_ADVICE = {
  ko:{木:'산책과 독서로 성장의 기운(木)을 채워보세요 🌱',火:'사람들과의 만남과 가벼운 운동으로 열정(火)을 더해보세요 🔥',土:'규칙적인 식사와 정리정돈으로 안정(土)을 다져보세요 🏔️',金:'계획과 마무리로 결단력(金)을 키워보세요 ⚙️',水:'충분한 수분과 사색·휴식으로 지혜(水)를 채워보세요 🌊'},
  en:{木:'Walk and read to nurture growth (Wood) 🌱',火:'Meet people and move to add passion (Fire) 🔥',土:'Eat regularly and tidy up for stability (Earth) 🏔️',金:'Plan and finish tasks to sharpen resolve (Metal) ⚙️',水:'Hydrate, rest and reflect for wisdom (Water) 🌊'},
  zh:{木:'通过散步和阅读来补充成长的木气 🌱',火:'通过社交和轻度运动来增加火的热情 🔥',土:'通过规律饮食和整理来稳固土气 🏔️',金:'通过计划和完成来培养金的决断力 ⚙️',水:'通过充足水分、思考和休息来补充水的智慧 🌊'},
  ja:{木:'散歩と読書で成長の木気を補う 🌱',火:'人との交流と軽い運動で火の情熱を加える 🔥',土:'規則正しい食事と整理整頓で土の安定を固める 🏔️',金:'計画と完了で金の決断力を育てる ⚙️',水:'十分な水分と思索・休息で水の知恵を満たす 🌊'}
};
const _ELEM_FR = { ko:{木:'목(나무)',火:'화(불)',土:'토(흙)',金:'금(쇠)',水:'수(물)'}, en:{木:'Wood',火:'Fire',土:'Earth',金:'Metal',水:'Water'}, zh:{木:'木',火:'火',土:'土',金:'金',水:'水'}, ja:{木:'木',火:'火',土:'土',金:'金',水:'水'} };
const _GEN  = {木:'火',火:'土',土:'金',金:'水',水:'木'};   // 상생
const _CTRL = {木:'土',土:'水',水:'火',火:'金',金:'木'};   // 상극

// 십성(十星) - 오행 관계에 따른 의미 (일간 기준)
const _SIPSEONG = {
  same: {ko:'비견(比肩) - 형제/동료', en:'Equal - Siblings/Peers', zh:'比肩 - 兄弟/同事', ja:'比肩 - 兄弟/同僚'},
  gen: {ko:'식신(食神) - 표현/자유', en:'Food God - Expression/Freedom', zh:'食神 - 表达/自由', ja:'食神 - 表現/自由'},
  birth: {ko:'정재(正財) - 안정/재물', en:'Proper Wealth - Stability/Money', zh:'正财 - 稳定/财物', ja:'正財 - 安定/財物'},
  ctrl: {ko:'정관(正官) - 직장/명예', en:'Proper Officer - Career/Honor', zh:'正官 - 职位/名誉', ja:'正官 - 職位/名誉'},
  ctrlme: {ko:'정인(正印) - 학문/지혜', en:'Proper Seal - Study/Wisdom', zh:'正印 - 学问/智慧', ja:'正印 - 学問/知恵'}
};

// 용신(用神) - 필요한 기운에 따른 추천 행동
const _YONGSIN_ADVICE = {
  ko: {
    木: '나무 기운이 부족합니다. 아침 산책, 식물 키우기, 독서와 학습이 도움됩니다. 동쪽 방향이 길합니다.',
    火: '불 기운이 부족합니다. 사람들과의 교류, 운동, 밝은 색상 옷이 도움됩니다. 남쪽 방향이 길합니다.',
    土: '흙 기운이 부족합니다. 규칙적인 생활, 정리정돈, 명상이 도움됩니다. 중앙이나 남서쪽 방향이 길합니다.',
    金: '쇠 기운이 부족합니다. 계획 세우기, 정리, 금속 액세서리 착용이 도움됩니다. 서쪽 방향이 길합니다.',
    水: '물 기운이 부족합니다. 충분한 수면과 휴식, 물 자주 마시기, 사색 시간이 도움됩니다. 북쪽 방향이 길합니다.'
  },
  en: {
    木: 'Wood energy is lacking. Morning walks, growing plants, reading help. East direction is favorable.',
    火: 'Fire energy is lacking. Social interactions, exercise, bright colors help. South direction is favorable.',
    土: 'Earth energy is lacking. Regular routines, organizing, meditation help. Center or southwest is favorable.',
    金: 'Metal energy is lacking. Planning, organizing, metal accessories help. West direction is favorable.',
    水: 'Water energy is lacking. Rest, hydration, reflection time help. North direction is favorable.'
  },
  zh: {
    木: '木气不足。晨间散步、养植物、阅读学习有帮助。东方为吉方。',
    火: '火气不足。社交活动、运动、明亮色衣服有帮助。南方为吉方。',
    土: '土气不足。规律生活、整理、冥想有帮助。中央或西南方为吉方。',
    金: '金气不足。制定计划、整理、佩戴金属饰品有帮助。西方为吉方。',
    水: '水气不足。充足睡眠休息、多喝水、思考时间有帮助。北方为吉方。'
  },
  ja: {
    木: '木の気が不足しています。朝の散歩、植物を育てる、読書と学習が助けになります。東の方角が吉です。',
    火: '火の気が不足しています。人との交流、運動、明るい色の服が助けになります。南の方角が吉です。',
    土: '土の気が不足しています。規則正しい生活、整理整頓、瞑想が助けになります。中央または南西の方角が吉です。',
    金: '金の気が不足しています。計画を立てる、整理、金属アクセサリーの着用が助けになります。西の方角が吉です。',
    水: '水の気が不足しています。十分な睡眠と休息、水をよく飲む、思索の時間が助けになります。北の方角が吉です。'
  }
}

function _ohaengPct(elem) {
  const order = ['木','火','土','金','水'];
  const total = order.reduce((a,k)=>a+(elem[k]||0),0) || 1;
  const p = order.map(k => Math.round((elem[k]||0)/total*100));
  const diff = 100 - p.reduce((a,b)=>a+b,0);
  if (diff !== 0) { let mi=0; for(let i=1;i<5;i++) if(p[i]>p[mi]) mi=i; p[mi]+=diff; }
  const out={}; order.forEach((k,i)=>out[k]=p[i]); return out;
}
function _strongElem(elem){ let b='木'; ['火','土','金','水'].forEach(k=>{ if((elem[k]||0)>(elem[b]||0)) b=k; }); return b; }
function _needElem(elem){ const zero=['木','火','土','金','水'].find(k=>(elem[k]||0)===0); if(zero)return zero; let b='木'; ['火','土','金','水'].forEach(k=>{ if((elem[k]||0)<(elem[b]||0)) b=k; }); return b; }

// 십성 해석 (년월일시 기둥의 의미)
function _pillarMeaning(L) {
  if (L==='ko') return {
    year: '조상·부모님으로부터 물려받은 기질과 초년 운세',
    month: '청년기 운세와 직장·사회생활의 방향',
    day: '본인의 핵심 성격과 배우자·가정 관계',
    hour: '노년 운세와 자녀·말년의 복'
  };
  if (L==='zh') return {
    year: '从祖先·父母继承的气质和早年运势',
    month: '青年时期运势和职场·社会生活方向',
    day: '本人核心性格和配偶·家庭关系',
    hour: '晚年运势和子女·晚年之福'
  };
  if (L==='ja') return {
    year: '先祖·両親から受け継いだ気質と初年運',
    month: '青年期運勢と職場·社会生活の方向',
    day: '本人の核心性格と配偶者·家庭関係',
    hour: '晩年運勢と子女·晩年の福'
  };
  return {
    year: 'Inherited traits from ancestors and early life fortune',
    month: 'Youth fortune and career/social direction',
    day: 'Core personality and spouse/family relations',
    hour: 'Late life fortune and children/elderly blessings'
  };
}

function _todayRel(todayElem, me, ef, lang) {
  const L = ['ko','en','zh','ja'].includes(lang) ? lang : 'en';

  if (todayElem===me) {
    if (L==='ko') return `오늘은 ${ef[todayElem]} 기운이 같은 기운을 더해 힘이 솟는 날이에요.`;
    if (L==='zh') return `今天是${ef[todayElem]}气相同之气相加，充满力量的一天。`;
    if (L==='ja') return `今日は${ef[todayElem]}の気が同じ気を加えて力が湧く日です。`;
    return `Today's ${ef[todayElem]} energy reinforces yours — an energizing day.`;
  }
  if (_GEN[todayElem]===me) {
    if (L==='ko') return `오늘은 ${ef[todayElem]} 기운이 당신을 도와주는(생) 날이라 일이 수월해요.`;
    if (L==='zh') return `今天是${ef[todayElem]}气帮助您(相生)的日子，事情会很顺利。`;
    if (L==='ja') return `今日は${ef[todayElem]}の気があなたを助ける(相生)日なので、物事がスムーズです。`;
    return `Today's ${ef[todayElem]} energy supports you — things flow smoothly.`;
  }
  if (_GEN[me]===todayElem) {
    if (L==='ko') return `오늘은 당신이 ${ef[todayElem]} 기운에 베푸는 날이라 에너지를 아끼는 게 좋아요.`;
    if (L==='zh') return `今天是您给予${ef[todayElem]}气的日子，需要节省能量。`;
    if (L==='ja') return `今日はあなたが${ef[todayElem]}の気に与える日なので、エネルギーを節約するのが良いです。`;
    return `Today you give to the ${ef[todayElem]} energy — pace yourself.`;
  }
  if (_CTRL[todayElem]===me) {
    if (L==='ko') return `오늘은 ${ef[todayElem]} 기운이 당신을 누르는(극) 날이라 무리하지 마세요.`;
    if (L==='zh') return `今天是${ef[todayElem]}气压制您(相克)的日子，不要勉强。`;
    if (L==='ja') return `今日は${ef[todayElem]}の気があなたを抑える(相克)日なので、無理しないでください。`;
    return `Today's ${ef[todayElem]} energy presses on you — don't overdo it.`;
  }
  if (L==='ko') return `오늘은 당신이 ${ef[todayElem]} 기운을 다스리는 날이라 주도권을 쥐기 좋아요.`;
  if (L==='zh') return `今天是您掌控${ef[todayElem]}气的日子，适合掌握主导权。`;
  if (L==='ja') return `今日はあなたが${ef[todayElem]}の気を制する日なので、主導権を握るのに良いです。`;
  return `Today you control the ${ef[todayElem]} energy — a good day to lead.`;
}

// solo 간단 풀이
function buildLocalReading(saju, lang, il, name) {
  const L = ['ko','en','zh','ja'].includes(lang) ? lang : 'en';
  const isKo = L==='ko';
  const ef = _ELEM_FR[L];
  const trait = _GAN_TRAIT[L][saju.dayGan] || '';
  const need = _needElem(saju.elem);
  const strong = _strongElem(saju.elem);
  const pillars = `年 ${saju.yp} / 月 ${saju.mp} / 日 ${saju.dp} / 時 ${saju.hp || (L==='ko'?'미상':L==='zh'?'不明':L==='ja'?'不明':'unknown')}`;
  const rel = _todayRel(il.o, saju.dayElem, ef, L);
  const adv = _OHAENG_ADVICE[L][need];

  // 오행 비율 설명
  const ohaengPct = _ohaengPct(saju.elem);
  let elemDesc;
  if (L === 'ko') elemDesc = `목${ohaengPct['木']}% 화${ohaengPct['火']}% 토${ohaengPct['土']}% 금${ohaengPct['金']}% 수${ohaengPct['水']}%`;
  else if (L === 'zh') elemDesc = `木${ohaengPct['木']}% 火${ohaengPct['火']}% 土${ohaengPct['土']}% 金${ohaengPct['金']}% 水${ohaengPct['水']}%`;
  else if (L === 'ja') elemDesc = `木${ohaengPct['木']}% 火${ohaengPct['火']}% 土${ohaengPct['土']}% 金${ohaengPct['金']}% 水${ohaengPct['水']}%`;
  else elemDesc = `Wood${ohaengPct['木']}% Fire${ohaengPct['火']}% Earth${ohaengPct['土']}% Metal${ohaengPct['金']}% Water${ohaengPct['水']}%`;

  // 용신(필요한 기운) 조언
  const yongsinAdv = _YONGSIN_ADVICE[L][need];

  // 사주 4기둥 해석
  const pm = _pillarMeaning(L);
  const pillarInterpret = L==='ko'
    ? `\n\n📜 사주 4기둥의 의미\n年柱: ${pm.year}\n月柱: ${pm.month}\n日柱: ${pm.day}\n時柱: ${pm.hour}`
    : L==='zh'
    ? `\n\n📜 四柱含义\n年柱: ${pm.year}\n月柱: ${pm.month}\n日柱: ${pm.day}\n时柱: ${pm.hour}`
    : L==='ja'
    ? `\n\n📜 四柱の意味\n年柱: ${pm.year}\n月柱: ${pm.month}\n日柱: ${pm.day}\n時柱: ${pm.hour}`
    : `\n\n📜 Four Pillars Meaning\nYear: ${pm.year}\nMonth: ${pm.month}\nDay: ${pm.day}\nHour: ${pm.hour}`;

  let reading;
  if (L === 'ko') {
    reading = `📅 사주 원국 (만세력)\n${pillars}${pillarInterpret}\n\n🎯 당신의 본질 (일간)\n${saju.dayGan}${ef[saju.dayElem]} — ${trait}\n\n⚖️ 오행 에너지 분포\n${elemDesc}\n가장 강한 기운: ${ef[strong]}\n부족한 기운: ${ef[need]}\n\n🔮 용신 (필요한 기운)\n${yongsinAdv}\n\n☀️ 오늘의 기운 (${CG[il.ci]}${JJ[il.ji]}日)\n${rel}\n\n💡 오늘의 조언\n${adv}`;
  } else if (L === 'zh') {
    reading = `📅 四柱命盘 (万年历)\n${pillars}${pillarInterpret}\n\n🎯 您的本质 (日干)\n${saju.dayGan}${ef[saju.dayElem]} — ${trait}\n\n⚖️ 五行能量分布\n${elemDesc}\n最强之气: ${ef[strong]}\n不足之气: ${ef[need]}\n\n🔮 用神 (所需之气)\n${yongsinAdv}\n\n☀️ 今日之气 (${CG[il.ci]}${JJ[il.ji]}日)\n${rel}\n\n💡 今日建议\n${adv}`;
  } else if (L === 'ja') {
    reading = `📅 四柱命式 (万年暦)\n${pillars}${pillarInterpret}\n\n🎯 あなたの本質 (日干)\n${saju.dayGan}${ef[saju.dayElem]} — ${trait}\n\n⚖️ 五行エネルギー分布\n${elemDesc}\n最も強い気: ${ef[strong]}\n不足している気: ${ef[need]}\n\n🔮 用神 (必要な気)\n${yongsinAdv}\n\n☀️ 今日の気 (${CG[il.ci]}${JJ[il.ji]}日)\n${rel}\n\n💡 今日のアドバイス\n${adv}`;
  } else {
    reading = `📅 Four Pillars\n${pillars}${pillarInterpret}\n\n🎯 Your Essence (Day Master)\n${saju.dayGan} (${ef[saju.dayElem]}) — ${trait}\n\n⚖️ Five Elements Distribution\n${elemDesc}\nStrongest: ${ef[strong]}\nWeakest: ${ef[need]}\n\n🔮 Beneficial Element\n${yongsinAdv}\n\n☀️ Today's Energy (${CG[il.ci]}${JJ[il.ji]})\n${rel}\n\n💡 Today's Advice\n${adv}`;
  }
  return { reading, ohaeng: _ohaengPct(saju.elem), need };
}

// duo(2인) 간단 풀이
function buildLocalReadingDuo(s1, s2, lang, il, n1, n2) {
  const L = ['ko','en','zh','ja'].includes(lang) ? lang : 'en';
  const isKo = L==='ko';
  const ef = _ELEM_FR[L];
  const A = n1 || (isKo?'첫 번째 분':'Person A');
  const B = n2 || (isKo?'두 번째 분':'Person B');
  const m1 = s1.dayElem, m2 = s2.dayElem;
  let rel;
  if (m1===m2) rel = isKo?`두 분 모두 ${ef[m1]} 일간 — 비슷한 결을 가진, 서로를 잘 이해하는 사이예요.`:`Both share a ${ef[m1]} Day Master — kindred spirits who understand each other.`;
  else if (_GEN[m1]===m2) rel = isKo?`${A}(${ef[m1]})이 ${B}(${ef[m2]})를 북돋아주는(생) 관계 — 챙겨주고 이끌어주는 사이예요.`:`${A} (${ef[m1]}) nourishes ${B} (${ef[m2]}) — a caring, guiding bond.`;
  else if (_GEN[m2]===m1) rel = isKo?`${B}(${ef[m2]})이 ${A}(${ef[m1]})를 북돋아주는(생) 관계 — 서로 기대고 채워주는 사이예요.`:`${B} (${ef[m2]}) nourishes ${A} (${ef[m1]}) — mutually supportive.`;
  else if (_CTRL[m1]===m2) rel = isKo?`${A}(${ef[m1]})이 ${B}(${ef[m2]})를 다스리는(극) 관계 — 균형을 잡아주되 배려가 필요해요.`:`${A} (${ef[m1]}) controls ${B} (${ef[m2]}) — balancing, but needs care.`;
  else rel = isKo?`${B}(${ef[m2]})이 ${A}(${ef[m1]})를 다스리는(극) 관계 — 서로 자극을 주는 사이예요.`:`${B} (${ef[m2]}) controls ${A} (${ef[m1]}) — a stimulating pair.`;
  const need1 = _needElem(s1.elem), need2 = _needElem(s2.elem);
  const comp = (need1===m2 || need2===m1)
    ? (isKo?'서로의 부족한 기운을 채워줄 수 있는 좋은 짝이에요. 🤝':'You fill each other\'s lacking energy — a great match. 🤝')
    : (isKo?'서로 다른 기운을 가져 새로운 자극을 주고받아요.':'Different energies that bring fresh stimulation.');
  // 합산 오행
  const merged = {木:0,火:0,土:0,金:0,水:0};
  ['木','火','土','金','水'].forEach(k=>{ merged[k]=(s1.elem[k]||0)+(s2.elem[k]||0); });

  // 합산 오행 비율
  const ohaengPct = _ohaengPct(merged);
  const elemDesc = isKo
    ? `목${ohaengPct['木']}% 화${ohaengPct['火']}% 토${ohaengPct['土']}% 금${ohaengPct['金']}% 수${ohaengPct['水']}%`
    : `Wood${ohaengPct['木']}% Fire${ohaengPct['火']}% Earth${ohaengPct['土']}% Metal${ohaengPct['金']}% Water${ohaengPct['水']}%`;

  const reading = isKo
    ? `👥 두 분의 일간 (본질)\n${A}: ${s1.dayGan}${ef[m1]}\n${B}: ${s2.dayGan}${ef[m2]}\n\n💞 두 기운의 관계\n${rel}\n\n🤝 궁합\n${comp}\n\n⚖️ 합산 오행 분포\n${elemDesc}\n\n☀️ 오늘의 기운 (${CG[il.ci]}${JJ[il.ji]}日)\n오늘은 ${ef[il.o]} 기운의 날입니다.\n함께 ${_OHAENG_ADVICE.ko[il.o].replace(/\s*[🌱🔥🏔️⚙️🌊]\s*$/,'')}면 좋아요.`
    : `👥 Your Essences\n${A}: ${s1.dayGan} (${ef[m1]})\n${B}: ${s2.dayGan} (${ef[m2]})\n\n💞 Relationship\n${rel}\n\n🤝 Compatibility\n${comp}\n\n⚖️ Combined Elements\n${elemDesc}\n\n☀️ Today's Energy (${CG[il.ci]}${JJ[il.ji]})\nToday carries ${ef[il.o]} energy.\nA good day to ${_OHAENG_ADVICE.en[il.o].replace(/\s*[🌱🔥🏔️⚙️🌊]\s*$/,'').toLowerCase()} together.`;
  return { reading, ohaeng: _ohaengPct(merged), need: need1 };
}

// 이름 새니타이즈 (XSS 방지, 길이 제한)
function sanitizeName(name) {
  if (!name) return '';
  return String(name).trim().replace(/[<>'"&]/g, '').slice(0, 50);
}

// 무료 간단 풀이 엔드포인트 (Gemini 미호출 · 토큰 미차감)
async function handleSajuReading(request, env) {
  try {
    // Body 크기 제한 (10KB)
    const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (contentLength > 10240) {
      return cors(JSON.stringify({ error:{ message:'요청 크기가 너무 큽니다.' } }), 413);
    }

    const { mode='solo', lang='ko', p1, p2, save=false } = await request.json().catch(()=>({}));
    if (!p1 || !p1.year) return cors(JSON.stringify({ error:{ message:'생년월일이 필요합니다.' } }), 400);

    // 이름 새니타이즈
    if (p1.name) p1.name = sanitizeName(p1.name);
    if (p2?.name) p2.name = sanitizeName(p2.name);

    const il = ilchin();
    const s1 = computeSaju(p1.year, p1.month, p1.day, p1.hour);
    if (!s1) return cors(JSON.stringify({ error:{ message:'사주 계산에 실패했습니다.' } }), 400);

    let out, result;
    if (mode === 'duo' && p2 && p2.year) {
      const s2 = computeSaju(p2.year, p2.month, p2.day, p2.hour);
      if (!s2) return cors(JSON.stringify({ error:{ message:'두 번째 분 사주 계산 실패' } }), 400);
      out = buildLocalReadingDuo(s1, s2, lang, il, p1.name, p2.name);
      result = { ok:true, mode:'duo', ...out, saju1:s1.text, saju2:s2.text, dayElem: il.o };
    } else {
      out = buildLocalReading(s1, lang, il, p1.name);
      result = { ok:true, mode:'solo', ...out, saju1:s1.text, dayElem: il.o };
    }

    // 로그인한 사용자이고 save=true면 기록 저장 (백그라운드)
    if (save) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const idToken = authHeader.slice(7);
        const email = await getEmailFromToken(idToken, env).catch(() => null);
        if (email) {
          // 비동기로 저장 (응답 블로킹 안 함)
          saveSajuHistory(env, email, mode, p1, p2, out.reading, out.ohaeng, il.o).catch(() => {});
        }
      }
    }

    return cors(JSON.stringify(result), 200);
  } catch (e) {
    return cors(JSON.stringify({ error:{ message:'오류가 발생했습니다.' } }), 500);
  }
}

// ════════════════════════════
//  사주 기록 저장 및 관리
// ════════════════════════════

// 사주 기록 저장 (비동기)
async function saveSajuHistory(env, email, mode, p1, p2, reading, ohaeng, dayElem) {
  try {
    const p1Birth = `${p1.year}-${String(p1.month).padStart(2, '0')}-${String(p1.day).padStart(2, '0')}`;
    const p2Birth = (mode === 'duo' && p2?.year)
      ? `${p2.year}-${String(p2.month).padStart(2, '0')}-${String(p2.day).padStart(2, '0')}`
      : null;

    await env.DB.prepare(`
      INSERT INTO saju_history (user_email, mode, p1_name, p1_birth, p1_hour, p2_name, p2_birth, p2_hour, reading, ohaeng, day_elem)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      email, mode,
      p1.name || null, p1Birth, p1.hour || null,
      p2?.name || null, p2Birth, p2?.hour || null,
      reading, JSON.stringify(ohaeng), dayElem
    ).run();

    // 용량 관리: 사용자당 최대 100개 기록만 유지 (오래된 것부터 삭제)
    await cleanOldHistory(env, email, 100);
  } catch (e) {
    console.error('Failed to save saju history:', e);
  }
}

// 오래된 기록 자동 삭제 (사용자당 최대 N개 유지)
async function cleanOldHistory(env, email, maxRecords = 100) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT id FROM saju_history
      WHERE user_email = ?
      ORDER BY created_at DESC
      LIMIT 1 OFFSET ?
    `).bind(email, maxRecords).all();

    if (results && results.length > 0) {
      const oldestId = results[0].id;
      await env.DB.prepare(`
        DELETE FROM saju_history
        WHERE user_email = ? AND id < ?
      `).bind(email, oldestId).run();
    }
  } catch (e) {
    console.error('Failed to clean old history:', e);
  }
}

// 사주 기록 조회 (최신순, 페이징)
async function handleGetSajuHistory(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return cors(JSON.stringify({ error: { message: '인증이 필요합니다.' } }), 401);
  }

  const idToken = authHeader.slice(7);
  const email = await getEmailFromToken(idToken, env);
  if (!email) {
    return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  try {
    const { results } = await env.DB.prepare(`
      SELECT id, mode, p1_name, p1_birth, p1_hour, p2_name, p2_birth, p2_hour,
             reading, ohaeng, day_elem, created_at
      FROM saju_history
      WHERE user_email = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(email, limit, offset).all();

    const history = results.map(row => ({
      id: row.id,
      mode: row.mode,
      p1: {
        name: row.p1_name,
        birth: row.p1_birth,
        hour: row.p1_hour
      },
      p2: row.p2_birth ? {
        name: row.p2_name,
        birth: row.p2_birth,
        hour: row.p2_hour
      } : null,
      reading: row.reading,
      ohaeng: JSON.parse(row.ohaeng),
      dayElem: row.day_elem,
      createdAt: row.created_at
    }));

    return cors(JSON.stringify({ ok: true, history, count: history.length }), 200);
  } catch (e) {
    return cors(JSON.stringify({ error: { message: '기록 조회에 실패했습니다.' } }), 500);
  }
}

// 유료 콘텐츠(상세풀이/타로/띠·별자리/럭키/궁합) 기록 저장 (비동기, 비차단)
async function saveFeatureHistory(env, email, feature, title, content, meta) {
  try {
    await env.DB.prepare(
      `INSERT INTO feature_history (user_email, feature, title, content, meta) VALUES (?, ?, ?, ?, ?)`
    ).bind(email, feature, title || null, content, meta ? JSON.stringify(meta) : null).run();

    // 용량 관리: 사용자당 최대 200개 기록만 유지
    const { results } = await env.DB.prepare(
      `SELECT id FROM feature_history WHERE user_email = ? ORDER BY created_at DESC LIMIT 1 OFFSET 200`
    ).bind(email).all();
    if (results && results.length > 0) {
      await env.DB.prepare(`DELETE FROM feature_history WHERE user_email = ? AND id < ?`).bind(email, results[0].id).run();
    }
  } catch (e) {
    console.error('Failed to save feature history:', e);
  }
}

// 유료 콘텐츠 기록 조회 (최신순, 페이징)
async function handleGetFeatureHistory(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return cors(JSON.stringify({ error: { message: '인증이 필요합니다.' } }), 401);
  }
  const idToken = authHeader.slice(7);
  const email = await getEmailFromToken(idToken, env);
  if (!email) {
    return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  try {
    const { results } = await env.DB.prepare(`
      SELECT id, feature, title, content, meta, created_at
      FROM feature_history
      WHERE user_email = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(email, limit, offset).all();

    const history = results.map(row => ({
      id: row.id,
      feature: row.feature,
      title: row.title,
      content: row.content,
      meta: row.meta ? JSON.parse(row.meta) : null,
      createdAt: row.created_at,
    }));

    return cors(JSON.stringify({ ok: true, history, count: history.length }), 200);
  } catch (e) {
    return cors(JSON.stringify({ error: { message: '기록 조회에 실패했습니다.' } }), 500);
  }
}

// ════════════════════════════
//  보안 헬퍼 함수
// ════════════════════════════

// HTML 이스케이프 (XSS 방지)
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// HMAC-SHA256 서명 생성 (Telegram URL 보안)
async function hmacSign(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// HMAC-SHA256 서명 검증 (타이밍 공격 방지: 상수시간 비교)
async function hmacVerify(secret, data, signature) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  let sigBytes;
  try {
    sigBytes = new Uint8Array(signature.match(/.{2}/g).map(b => parseInt(b, 16)));
  } catch { return false; }
  const dataBytes = new TextEncoder().encode(data);
  return crypto.subtle.verify('HMAC', key, sigBytes, dataBytes);
}

// (인메모리 속도 제한 checkRateLimit은 /chat 핸들러 전용이었어서 함께 제거.
//  현재 속도 제한은 Cloudflare 분산 방식 cfRateLimit만 사용한다.)

// Cloudflare Workers 분산 Rate Limiting (전 세계 인스턴스 통합 제한)
// 바인딩 없으면(로컬 개발 등) 항상 통과 처리
async function cfRateLimit(limiter, key) {
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit({ key });
    return success;
  } catch { return true; }
}

// DB 초기화 (워커 인스턴스 당 최초 1회만 실행)
let _dbReady = false;
async function ensureDB(env) {
  if (_dbReady || !env.DB) return;
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS payment_requests (
      id          TEXT    PRIMARY KEY,
      user_email  TEXT    NOT NULL,
      pkg         TEXT    NOT NULL,
      amount      INTEGER NOT NULL DEFAULT 0,
      tokens      INTEGER NOT NULL DEFAULT 0,
      status      TEXT    NOT NULL DEFAULT 'pending',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      approved_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_pr_email_status ON payment_requests (user_email, status);
    CREATE INDEX IF NOT EXISTS idx_pr_created ON payment_requests (created_at DESC);
  `).catch(() => {});
  _dbReady = true;
}

// ── ensureDB 확장: 신규 기능 테이블 ──
let _dbExtReady = false;
async function ensureDBExt(env) {
  if (_dbExtReady || !env.DB) return;
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, p256dh TEXT NOT NULL,
      auth TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'ko',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS user_streaks (
      user_email TEXT PRIMARY KEY, current_streak INTEGER NOT NULL DEFAULT 0,
      max_streak INTEGER NOT NULL DEFAULT 0, last_checkin TEXT,
      total_checkins INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_share_bonus TEXT
    );
    CREATE TABLE IF NOT EXISTS ohaeng_history (
      id TEXT PRIMARY KEY, user_email TEXT NOT NULL, date TEXT NOT NULL,
      ohaeng TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(user_email, date)
    );
    CREATE INDEX IF NOT EXISTS idx_oh_email_date ON ohaeng_history (user_email, date DESC);
    CREATE TABLE IF NOT EXISTS reading_feedback (
      id TEXT PRIMARY KEY, user_email TEXT NOT NULL, date TEXT NOT NULL,
      ohaeng TEXT NOT NULL, is_correct INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()), UNIQUE(user_email, date)
    );
    CREATE TABLE IF NOT EXISTS guest_uses (
      ip TEXT NOT NULL,
      used_date TEXT NOT NULL,
      used_at INTEGER NOT NULL,
      PRIMARY KEY (ip, used_date)
    );
    CREATE TABLE IF NOT EXISTS guest_usage (
      ip TEXT NOT NULL,
      used_date TEXT NOT NULL,
      used_count INTEGER DEFAULT 1,
      PRIMARY KEY (ip, used_date)
    );
    CREATE TABLE IF NOT EXISTS ungi_guest_usage (
      ip TEXT NOT NULL,
      used_date TEXT NOT NULL,
      used_count INTEGER DEFAULT 1,
      PRIMARY KEY (ip, used_date)
    );
    CREATE TABLE IF NOT EXISTS ungi_token_gifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      tokens_given INTEGER NOT NULL,
      gifted_by TEXT,
      gifted_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS ungi_admin_attempts (
      ip TEXT NOT NULL,
      attempt_at INTEGER NOT NULL,
      success INTEGER DEFAULT 0,
      PRIMARY KEY (ip, attempt_at)
    );
    CREATE TABLE IF NOT EXISTS ungi_admin_whitelist (
      ip TEXT PRIMARY KEY,
      description TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS dynamic_promo_tokens (
      token TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      used_at INTEGER,
      used_by TEXT,
      tokens_given INTEGER NOT NULL DEFAULT 5
    );
    CREATE TABLE IF NOT EXISTS fortune_codes (
      code TEXT PRIMARY KEY,
      batch_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      used_at INTEGER,
      fortune_seed INTEGER
    );
    CREATE TABLE IF NOT EXISTS promo_claims (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      promo_code TEXT NOT NULL,
      claimed_at INTEGER NOT NULL,
      tokens_given INTEGER NOT NULL DEFAULT 5
    );
    CREATE TABLE IF NOT EXISTS referrals (
      code TEXT PRIMARY KEY, referrer_email TEXT NOT NULL, referee_email TEXT,
      rewarded_at INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_ref_referrer ON referrals (referrer_email);
    CREATE TABLE IF NOT EXISTS users (
      email         TEXT PRIMARY KEY,
      name          TEXT,
      picture       TEXT,
      locale        TEXT,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      last_login_at INTEGER NOT NULL DEFAULT (unixepoch()),
      login_count   INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS login_events (
      id         TEXT PRIMARY KEY,
      email      TEXT NOT NULL,
      at         INTEGER NOT NULL DEFAULT (unixepoch()),
      ip         TEXT,
      country    TEXT,
      user_agent TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_login_events_email ON login_events (email, at DESC);
    CREATE INDEX IF NOT EXISTS idx_login_events_at ON login_events (at DESC);
    CREATE TABLE IF NOT EXISTS subscriptions (
      user_email           TEXT PRIMARY KEY,
      plan                 TEXT NOT NULL,                 -- 'basic' | 'premium'
      billing_key          TEXT NOT NULL,                 -- 토스 빌링키 (정기결제 수단)
      customer_key         TEXT NOT NULL,                 -- 토스 customerKey
      status               TEXT NOT NULL DEFAULT 'active',-- active | canceled | past_due
      amount               INTEGER NOT NULL,              -- 월 결제 금액(원)
      monthly_tokens       INTEGER NOT NULL,              -- 매월 지급 토큰 수
      created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
      current_period_start INTEGER NOT NULL,
      current_period_end   INTEGER NOT NULL,              -- 다음 결제 예정일(이 시점 이후 cron이 재결제)
      last_charged_at      INTEGER,
      fail_count           INTEGER NOT NULL DEFAULT 0,    -- 연속 결제 실패 횟수 (dunning)
      canceled_at          INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_sub_status_due ON subscriptions (status, current_period_end);
    CREATE TABLE IF NOT EXISTS feature_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      feature TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      meta TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_fh_email_created ON feature_history (user_email, created_at DESC);
    CREATE TABLE IF NOT EXISTS photo_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      type TEXT NOT NULL,
      image_b64 TEXT NOT NULL,
      reading TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_pr2_email_created ON photo_readings (user_email, created_at DESC);
  `).catch(() => {});
  // user_streaks.last_share_bonus: 기존 배포 DB에 컬럼이 없을 수 있어 별도 ALTER로 보정.
  // 이미 컬럼이 있으면 매 콜드스타트마다 에러가 나지만 위 배치와 분리돼 있어 다른 테이블 생성에 영향 없음.
  await env.DB.exec(`ALTER TABLE user_streaks ADD COLUMN last_share_bonus TEXT;`).catch(() => {});

  // users 테이블 확장: 생년월일 프로필(서버 저장) — 기존 프로덕션 테이블이라 ALTER TABLE로 개별 추가.
  // 이미 컬럼이 있으면 각각 개별 실패(중복 컬럼)하지만 .catch로 무시되고 다음 컬럼은 계속 진행됨.
  await env.DB.exec(`ALTER TABLE users ADD COLUMN birth_year INTEGER`).catch(() => {});
  await env.DB.exec(`ALTER TABLE users ADD COLUMN birth_month INTEGER`).catch(() => {});
  await env.DB.exec(`ALTER TABLE users ADD COLUMN birth_day INTEGER`).catch(() => {});
  await env.DB.exec(`ALTER TABLE users ADD COLUMN birth_hour TEXT`).catch(() => {});
  await env.DB.exec(`ALTER TABLE users ADD COLUMN gender TEXT`).catch(() => {});
  await env.DB.exec(`ALTER TABLE users ADD COLUMN region TEXT`).catch(() => {});

  _dbExtReady = true;
}

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname.replace(/\/$/, '') || '/';
    const method = request.method;

    if (method === 'OPTIONS') {
      return cors(null, 204);
    }

    await ensureDB(env);

    if (path === '/user-tokens' && method === 'GET') return handleUserTokens(request, env);
    if (path === '/migrate-tokens' && method === 'POST') return handleMigrateTokens(request, env);
    if (path === '/signup-grant' && method === 'POST') return handleSignupGrant(request, env);
    if (path === '/admin/payments' && method === 'GET') return handleAdminPayments(request, env);
    if (path === '/admin/approve' && method === 'POST') return handleAdminApprove(request, env);
    if (path === '/admin/telegram-approve' && method === 'GET') return handleTelegramApprove(request, env);
    if (path === '/admin/grant-tokens' && method === 'POST') return handleAdminGrantTokens(request, env);
    // /chat(대화형 리딩) 라우트·핸들러 제거됨. '채팅 방식 제거' 리뉴얼 이후
    // 프론트에서 도달할 수 없는 경로였다(_enterMode가 입력창을 숨기고 showSajuInput으로 보냄).
    // 되살리려면 git 이력에서 handleGeminiChat을 참고할 것.
    if (path === '/api/payment/verify' && method === 'POST') return handlePaymentVerify(request, env);
    if (path === '/withdraw' && method === 'DELETE') return handleWithdraw(request, env);
    if (path === '/delete-account'  && method === 'GET') return handleDeleteAccountPage();
    if (path === '/privacy-policy'  && method === 'GET') return handlePrivacyPage();
    if (path === '/terms'           && method === 'GET') return handleTermsPage();

    // ── 상세 풀이 ──
    if (path === '/chat-detail' && method === 'POST') { await ensureDBExt(env); return handleDetailReading(request, env); }
    // ── 타로카드 뽑기 (재미 콘텐츠) ──
    if (path === '/api/tarot-draw' && method === 'POST') { await ensureDBExt(env); return handleTarotDraw(request, env); }
    // ── 띠·별자리 운세 (재미 콘텐츠) ──
    if (path === '/api/zodiac-fortune' && method === 'POST') { await ensureDBExt(env); return handleZodiacFortune(request, env); }
    // ── 오늘의 럭키 컬러·음식·노래 (재미 콘텐츠) ──
    if (path === '/api/lucky-picks' && method === 'POST') { await ensureDBExt(env); return handleLuckyPicks(request, env); }
    // ── 오행 유형 궁합 테스트 (재미 콘텐츠) ──
    if (path === '/api/type-compat' && method === 'POST') { await ensureDBExt(env); return handleTypeCompat(request, env); }
    if (path === '/api/fortune-topic' && method === 'POST') { await ensureDBExt(env); return handleFortuneTopic(request, env); }
    if (path === '/api/iching' && method === 'POST') { await ensureDBExt(env); return handleIching(request, env); }
    if (path === '/api/numerology' && method === 'POST') { await ensureDBExt(env); return handleNumerology(request, env); }
    if (path === '/api/tojeong' && method === 'POST') { await ensureDBExt(env); return handleTojeong(request, env); }
    if (path === '/api/photo-reading' && method === 'POST') { await ensureDBExt(env); return handlePhotoReading(request, env); }
    if (path === '/api/photo-readings' && method === 'GET') { await ensureDBExt(env); return handleGetPhotoReadings(request, env); }
    if (path === '/api/photo-reading' && method === 'DELETE') { await ensureDBExt(env); return handleDeletePhotoReading(request, env); }
    if (path === '/api/dream-interpretation' && method === 'POST') { await ensureDBExt(env); return handleDreamInterpretation(request, env); }
    if (path === '/api/lotto-numbers' && method === 'POST') { await ensureDBExt(env); return handleLottoNumbers(request, env); }
    if (path === '/api/rune-reading' && method === 'POST') { await ensureDBExt(env); return handleRuneReading(request, env); }
    // ── 게스트 체험 ──
    if (path === '/chat-guest' && method === 'POST') { await ensureDBExt(env); return handleGuestChat(request, env); }
    // ── 무료 간단 사주 풀이 (로컬 계산, Gemini 미호출) ──
    if (path === '/saju-reading' && method === 'POST') {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.RL_API.limit({ key: `saju:${ip}` });
      if (!success) return cors(JSON.stringify({ error: { message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' } }), 429);
      return handleSajuReading(request, env);
    }
    // ── 사주 기록 조회 ──
    if (path === '/api/saju-history' && method === 'GET') { await ensureDBExt(env); return handleGetSajuHistory(request, env); }
    // ── 유료 콘텐츠(상세풀이/타로/띠·별자리/럭키/궁합) 통합 기록 조회 ──
    if (path === '/api/feature-history' && method === 'GET') { await ensureDBExt(env); return handleGetFeatureHistory(request, env); }
    // ── 생년월일 프로필 서버 저장 ──
    if (path === '/api/profile' && method === 'POST') { await ensureDBExt(env); return handleSaveProfile(request, env); }
    // ── 푸시 알림 API ──
    if (path === '/api/push/vapid-key'   && method === 'GET')  { await ensureDBExt(env); return handlePushVapidKey(env); }
    if (path === '/api/push/subscribe'   && method === 'POST') { await ensureDBExt(env); return handlePushSubscribe(request, env); }
    if (path === '/api/push/unsubscribe' && method === 'POST') { await ensureDBExt(env); return handlePushUnsubscribe(request, env); }
    // ── 스트릭 ──
    if (path === '/api/streak/checkin'   && method === 'POST') { await ensureDBExt(env); return handleStreakCheckin(request, env); }
    if (path === '/api/streak'           && method === 'GET')  { await ensureDBExt(env); return handleGetStreak(request, env); }
    // ── 오행 히스토리 ──
    if (path === '/api/ohaeng-history'   && method === 'GET')  { await ensureDBExt(env); return handleOhaengHistory(request, env); }
    if (path === '/api/ohaeng-history'   && method === 'POST') { await ensureDBExt(env); return handleOhaengHistorySave(request, env); }
    // ── 주간 리포트 & 공유 보너스 ──
    if (path === '/api/weekly-report'    && method === 'GET')  { await ensureDBExt(env); return handleWeeklyReport(request, env); }
    if (path === '/api/share-bonus'      && method === 'POST') { await ensureDBExt(env); return handleShareBonus(request, env); }
    // ── 프로모 & 피드백 ──
    if (path === '/api/promo/claim'      && method === 'POST') { await ensureDBExt(env); return handlePromoClaim(request, env); }
    if (path === '/api/promo/generate'   && method === 'POST') { await ensureDBExt(env); return handlePromoGenerate(request, env); }
    if (path === '/api/promo/current'    && method === 'GET')  { await ensureDBExt(env); return handlePromoCurrent(request, env); }
    if (path === '/promo-display'        && method === 'GET')  { return handlePromoDisplay(request, env); }
    if (path === '/api/feedback'         && method === 'POST') { await ensureDBExt(env); return handleFeedback(request, env); }
    // ── 구독(멤버십) ──
    if (path === '/api/subscription'         && method === 'GET')  { await ensureDBExt(env); return handleSubscriptionGet(request, env); }
    if (path === '/api/subscription/confirm' && method === 'POST') { await ensureDBExt(env); return handleSubscriptionConfirm(request, env); }
    if (path === '/api/subscription/cancel'  && method === 'POST') { await ensureDBExt(env); return handleSubscriptionCancel(request, env); }
    // ── 추천인 ──
    if (path === '/api/referral/generate' && method === 'POST') { await ensureDBExt(env); return handleReferralGenerate(request, env); }
    if (path === '/api/referral/claim'    && method === 'POST') { await ensureDBExt(env); return handleReferralClaim(request, env); }
    if (path === '/api/referral'          && method === 'GET')  { await ensureDBExt(env); return handleGetReferral(request, env); }

    if (path === '/api/admin/ungi/give-tokens' && method === 'POST') { await ensureDBExt(env); return handleUngiGiveTokens(request, env); }
    if (path === '/api/admin/ungi/login' && method === 'POST') { await ensureDBExt(env); return handleUngiAdminLogin(request, env); }
    if (path === '/api/token-history' && method === 'GET') { await ensureDBExt(env); return handleTokenHistory(request, env); }
    // ── 로그인 기록 ──
    if (path === '/auth/login' && method === 'POST') { await ensureDBExt(env); return handleAuthLogin(request, env); }
    if (path === '/admin/users' && method === 'GET') { await ensureDBExt(env); return handleAdminUsers(request, env); }
    if (path === '/admin/usage' && method === 'GET') { await ensureDBExt(env); return handleAdminUsage(request, env); }

    // ── 운기 푸딩 행운 페이지 ──
    if (path === '/pudding-fortune' && method === 'GET') {
      return env.SITE_ASSETS.fetch(new Request(new URL('/pudding-fortune.html', request.url)));
    }
    if (path === '/pudding-qr' && method === 'GET') {
      return env.SITE_ASSETS.fetch(new Request(new URL('/pudding-qr-generator.html', request.url)));
    }
    // ── 운기 푸딩 일회용 QR (스티커 라벨) ──
    if (path === '/pudding-qr-batch' && method === 'GET') {
      return env.SITE_ASSETS.fetch(new Request(new URL('/pudding-qr-batch.html', request.url)));
    }
    if (path === '/api/fortune-qr/generate' && method === 'POST') { await ensureDBExt(env); return handleFortuneQrGenerate(request, env); }
    if (path === '/api/fortune-qr/redeem'   && method === 'POST') { await ensureDBExt(env); return handleFortuneQrRedeem(request, env); }

    // 서비스워커 스크립트: 배포마다 고유한 CF_VERSION_METADATA.id를 VERSION 상수에 주입해
    // 캐시 이름이 배포마다 확실히 바뀌게 하고, 응답 자체도 캐시되지 않게 강제.
    // (CI에서 sw.js 파일을 sed로 직접 고치는 방식은 CDN 엣지 캐시 때문에 반영이 안 되는 문제가 있었음)
    if (path === '/sw.js' && method === 'GET') {
      const raw = await env.SITE_ASSETS.fetch(request);
      let text = await raw.text();
      const deployId = env.CF_VERSION_METADATA?.id || 'dev';
      text = text.replace(/const VERSION = '[^']*';/, `const VERSION = '${deployId}';`);
      return new Response(text, {
        status: raw.status,
        headers: {
          'Content-Type': 'text/javascript; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      });
    }

    // 루트 경로: Worker Assets에서 index.html 직접 서빙 (보안 헤더 주입 + ENV 주입)
    if (method === 'GET') {
      const res = await env.SITE_ASSETS.fetch(request);

      // HTML 파일인 경우 ENV 주입
      const contentType = res.headers.get('content-type') || '';
      if (path === '/' || path === '/index.html' || contentType.includes('text/html')) {
        try {
          let html = await res.text();

          // 환경변수 주입 스크립트 추가 (</head> 앞에 삽입)
          const envScript = `
<script>
  window.ENV = {
    GOOGLE_CLIENT_ID: ${JSON.stringify(env.GOOGLE_CLIENT_ID || '')},
    ADMIN_EMAIL: ${JSON.stringify(env.ADMIN_EMAIL || '')},
    TOSS_CLIENT_KEY: ${JSON.stringify(env.TOSS_CLIENT_KEY || '')}
  };
</script>`;

          html = html.replace('</head>', envScript + '</head>');

          return addSecurityHeaders(new Response(html, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers
          }));
        } catch (e) {
          // 파싱 실패 시 원본 반환
          return addSecurityHeaders(res);
        }
      }

      return addSecurityHeaders(res);
    }

    return cors(JSON.stringify({ error: { message: 'Not Found' } }), 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDailyPush(env));
    ctx.waitUntil((async () => { await ensureDBExt(env); await processSubscriptionRenewals(env); })());
  }
};

// ════════════════════════════
//  토큰 핸들러 & 헬퍼 함수
// ════════════════════════════

// ── 자체 세션 토큰 (HS256 JWT, 30일) ──
// Google ID 토큰은 1시간 만료라 매 요청 검증/재로그인 부담이 큼.
// 로그인 시 1회 Google 검증 후 자체 세션을 발급하고, 이후 요청은 로컬 HMAC 검증(네트워크 0회).
const SESSION_TTL = 30 * 24 * 60 * 60; // 30일(초)

function _sessionSecret(env) {
  return env.SESSION_SECRET || env.ADMIN_SECRET || env.GEMINI_API_KEY || 'myan-dev-secret';
}
function _b64urlFromObj(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function _objFromB64url(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function createSessionToken(email, env) {
  const header  = _b64urlFromObj({ alg: 'HS256', typ: 'JWT' });
  const now     = Math.floor(Date.now() / 1000);
  const payload = _b64urlFromObj({ email, iat: now, exp: now + SESSION_TTL, t: 's' });
  const sig     = await hmacSign(_sessionSecret(env), `${header}.${payload}`);
  return `${header}.${payload}.${sig}`;
}
async function verifySessionToken(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header;
  try { header = _objFromB64url(parts[0]); } catch { return null; }
  if (!header || header.alg !== 'HS256') return null;
  if (!await hmacVerify(_sessionSecret(env), `${parts[0]}.${parts[1]}`, parts[2])) return null;
  let payload;
  try { payload = _objFromB64url(parts[1]); } catch { return null; }
  if (!payload || !payload.email) return null;
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
  return payload.email;
}

async function getEmailFromToken(idToken, env) {
  try {
    // 1) 만료일 선행 체크 (빠른 거부 — 네트워크 절약)
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;

    // 1-a) 자체 세션 토큰(HS256)이면 로컬 HMAC 검증으로 즉시 처리 (Google 호출 없음)
    try {
      const header = _objFromB64url(parts[0]);
      if (header && header.alg === 'HS256') return await verifySessionToken(idToken, env);
    } catch {}

    let b64 = parts[1].replace(/-/g,'+').replace(/_/g,'/');
    while (b64.length % 4) b64 += '=';
    const payload = JSON.parse(atob(b64));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;

    // 2) Google tokeninfo API로 서명 검증 (위변조 방지 핵심)
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
    );
    if (!res.ok) return null;
    const info = await res.json();

    // 이메일 인증 여부 확인
    if (!info.email || info.email_verified !== 'true') return null;

    return info.email;
  } catch { return null; }
}

// 로그인 기록: Google 토큰 검증 후 users upsert + login_events 기록 (로그인 직후 1회 호출)
async function handleAuthLogin(request, env) {
  const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!idToken) return cors(JSON.stringify({ error: '로그인이 필요합니다.' }), 401);
  // Google tokeninfo로 서명 검증 + 프로필(name/picture/locale) 추출
  let info;
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    if (!res.ok) return cors(JSON.stringify({ error: '유효하지 않은 토큰입니다.' }), 401);
    info = await res.json();
  } catch {
    return cors(JSON.stringify({ error: '토큰 검증 실패' }), 401);
  }
  if (!info.email || info.email_verified !== 'true') {
    return cors(JSON.stringify({ error: '이메일 인증되지 않은 계정입니다.' }), 401);
  }

  const email   = info.email;
  const name    = info.name || null;
  const picture = info.picture || null;
  const locale  = info.locale || null;
  const ip      = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  const country = request.cf?.country || null;
  const ua      = request.headers.get('User-Agent') || null;

  // 로그인 기록 (DB 있을 때만, 실패해도 세션 발급은 진행)
  let profile = null;
  if (env.DB) {
    try {
      // users upsert: 최초면 생성(가입), 재로그인이면 last_login/count 갱신 + 프로필 최신화
      await env.DB.prepare(
        `INSERT INTO users (email, name, picture, locale, login_count)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(email) DO UPDATE SET
           name = excluded.name,
           picture = excluded.picture,
           locale = excluded.locale,
           last_login_at = unixepoch(),
           login_count = login_count + 1`
      ).bind(email, name, picture, locale).run();

      // 감사 로그 (append-only)
      await env.DB.prepare(
        `INSERT INTO login_events (id, email, ip, country, user_agent) VALUES (?, ?, ?, ?, ?)`
      ).bind(crypto.randomUUID(), email, ip, country, ua).run();

      // 서버에 저장된 생년월일 프로필 조회 — 새 기기/스토리지 초기화 후에도 복원할 수 있도록 로그인 응답에 포함
      const row = await env.DB.prepare(
        `SELECT birth_year, birth_month, birth_day, birth_hour, gender, region FROM users WHERE email = ?`
      ).bind(email).first().catch(() => null);
      if (row && (row.birth_year || row.gender || row.region)) {
        profile = {
          birthYear:  row.birth_year  || '',
          birthMonth: row.birth_month || '',
          birthDay:   row.birth_day   || '',
          birthHour:  row.birth_hour  || '',
          gender:     row.gender      || '',
          region:     row.region      || '',
        };
      }
    } catch (e) {
      console.error('[AUTH LOGIN]', e); // 로깅 실패는 무시
    }
  }

  // 자체 세션 토큰 발급 (이후 요청은 이 토큰으로 로컬 검증)
  const session = await createSessionToken(email, env);
  return cors(JSON.stringify({
    ok: true,
    session,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
    profile,
  }), 200);
}

// 생년월일 프로필 서버 저장 (마이페이지/온보딩에서 호출 — 로그아웃·기기 변경 후에도 복원 가능하게)
async function handleSaveProfile(request, env) {
  const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
  const email = await getEmailFromToken(idToken, env);
  if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);
  if (!env.DB) return cors(JSON.stringify({ error: { message: '데이터베이스 연결 실패' } }), 500);

  const body = await request.json().catch(() => ({}));
  const birthYear  = body.birthYear  ? parseInt(body.birthYear, 10)  : null;
  const birthMonth = body.birthMonth ? parseInt(body.birthMonth, 10) : null;
  const birthDay   = body.birthDay   ? parseInt(body.birthDay, 10)   : null;
  const birthHour  = body.birthHour  || null;
  const gender     = body.gender     || null;
  const region      = body.region    || null;

  try {
    await env.DB.prepare(
      `UPDATE users SET birth_year = ?, birth_month = ?, birth_day = ?, birth_hour = ?, gender = ?, region = ? WHERE email = ?`
    ).bind(birthYear, birthMonth, birthDay, birthHour, gender, region, email).run();
    return cors(JSON.stringify({ ok: true }), 200);
  } catch (e) {
    return cors(JSON.stringify({ error: { message: '프로필 저장에 실패했습니다.' } }), 500);
  }
}

// 관리자: 회원/로그인 기록 조회 (통계 + 회원 목록 + 최근 접속 로그)
async function handleAdminUsers(request, env) {
  if (!await isAdmin(request, env)) return cors(JSON.stringify({ error: { message: '관리자 권한이 필요합니다.' } }), 401);
  if (!env.DB) return cors(JSON.stringify({ error: { message: '데이터베이스 연결 실패' } }), 500);

  const now    = Math.floor(Date.now() / 1000);
  const dayAgo  = now - 86400;
  const weekAgo = now - 7 * 86400;

  const total       = await env.DB.prepare('SELECT COUNT(*) AS c FROM users').first().catch(() => null);
  const dau         = await env.DB.prepare('SELECT COUNT(*) AS c FROM users WHERE last_login_at >= ?').bind(dayAgo).first().catch(() => null);
  const wau         = await env.DB.prepare('SELECT COUNT(*) AS c FROM users WHERE last_login_at >= ?').bind(weekAgo).first().catch(() => null);
  const newToday    = await env.DB.prepare('SELECT COUNT(*) AS c FROM users WHERE created_at >= ?').bind(dayAgo).first().catch(() => null);
  const totalLogins = await env.DB.prepare('SELECT COALESCE(SUM(login_count), 0) AS c FROM users').first().catch(() => null);

  const users = await env.DB.prepare(
    'SELECT email, name, locale, created_at, last_login_at, login_count FROM users ORDER BY last_login_at DESC LIMIT 200'
  ).all().catch(() => ({ results: [] }));

  const logins = await env.DB.prepare(
    'SELECT email, at, ip, country, user_agent FROM login_events ORDER BY at DESC LIMIT 100'
  ).all().catch(() => ({ results: [] }));

  return cors(JSON.stringify({
    stats: {
      totalUsers:  total?.c || 0,
      dau:         dau?.c || 0,
      wau:         wau?.c || 0,
      newToday:    newToday?.c || 0,
      totalLogins: totalLogins?.c || 0,
    },
    users:  users.results || [],
    logins: logins.results || [],
  }));
}

// 관리자: 콘텐츠별 사용 통계.
// payment_requests에 기능별 pkg('tarot_use' 등)가 이미 쌓이고 있었으나 이를 집계해서
// 보는 곳이 없어, 어떤 콘텐츠가 실제로 쓰이는지 알 수 없었다.
async function handleAdminUsage(request, env) {
  if (!await isAdmin(request, env)) return cors(JSON.stringify({ error: { message: '관리자 권한이 필요합니다.' } }), 401);
  if (!env.DB) return cors(JSON.stringify({ error: { message: '데이터베이스 연결 실패' } }), 500);

  const url = new URL(request.url);
  const daysRaw = parseInt(url.searchParams.get('days') || '30', 10);
  const days = (Number.isFinite(daysRaw) && daysRaw > 0) ? Math.min(daysRaw, 365) : 0; // 0 = 전체 기간
  const since = days > 0 ? Math.floor(Date.now() / 1000) - days * 86400 : 0;

  // 소비 집계(tokens < 0) — 기능별 사용 횟수·소모 토큰·이용자 수.
  // 지급/환불 행은 tokens > 0 이라 자연히 제외된다.
  const usage = await env.DB.prepare(`
    SELECT pkg,
           COUNT(*) AS uses,
           COALESCE(SUM(-tokens), 0) AS spent,
           COUNT(DISTINCT user_email) AS users
    FROM payment_requests
    WHERE status = 'approved' AND tokens < 0
      AND COALESCE(approved_at, created_at) >= ?
    GROUP BY pkg
    ORDER BY uses DESC
  `).bind(since).all().catch(() => ({ results: [] }));

  // 환불 집계 — 어떤 기능이 자주 실패하는지(AI 응답 실패 시 환불 행이 쌓임)
  const refunds = await env.DB.prepare(`
    SELECT pkg, COUNT(*) AS cnt
    FROM payment_requests
    WHERE status = 'approved' AND tokens > 0 AND pkg LIKE '%refund%'
      AND COALESCE(approved_at, created_at) >= ?
    GROUP BY pkg
    ORDER BY cnt DESC
  `).bind(since).all().catch(() => ({ results: [] }));

  const totals = await env.DB.prepare(`
    SELECT COUNT(*) AS uses,
           COALESCE(SUM(-tokens), 0) AS spent,
           COUNT(DISTINCT user_email) AS users
    FROM payment_requests
    WHERE status = 'approved' AND tokens < 0
      AND COALESCE(approved_at, created_at) >= ?
  `).bind(since).first().catch(() => null);

  return cors(JSON.stringify({
    days,
    totals:  { uses: totals?.uses || 0, spent: totals?.spent || 0, users: totals?.users || 0 },
    usage:   usage.results || [],
    refunds: refunds.results || [],
  }));
}

async function handleUserTokens(request, env) {
  const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!idToken) return cors(JSON.stringify({ tokens: 0 }));

  const email = await getEmailFromToken(idToken, env);
  if (!email) return cors(JSON.stringify({ tokens: 0 }));
  if (!env.DB) return cors(JSON.stringify({ tokens: 0, migrated: true }));

  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(tokens), 0) as total FROM payment_requests WHERE user_email = ? AND status = 'approved'`
  ).bind(email).first();

  return cors(JSON.stringify({ tokens: row?.total || 0, migrated: true }));
}

async function handleMigrateTokens(request, env) {
  const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);

  const email = await getEmailFromToken(idToken, env);
  if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 유저 세션입니다.' } }), 401);
  if (!await cfRateLimit(env.RL_API, email)) {
    return cors(JSON.stringify({ error: { message: '요청 한도를 초과했습니다.' } }), 429);
  }
  if (!env.DB) return cors(JSON.stringify({ error: { message: '데이터베이스 연결 실패' } }), 500);

  let body;
  try { body = await request.json(); } catch { return cors(JSON.stringify({ error: { message: '올바르지 않은 JSON 요청 형식입니다.' } }), 400); }

  const localTokens = Math.min(parseInt(body.tokens, 10) || 0, 30); // 최대 30개 상한
  if (localTokens <= 0) return cors(JSON.stringify({ ok: true, tokens: 0, migrated: true }));

  const existing = await env.DB.prepare(
    `SELECT id FROM payment_requests WHERE user_email = ? AND pkg = 'migration' LIMIT 1`
  ).bind(email).first();
  if (existing) {
    const row = await env.DB.prepare(
      `SELECT COALESCE(SUM(tokens),0) as total FROM payment_requests WHERE user_email=? AND status='approved'`
    ).bind(email).first();
    return cors(JSON.stringify({ ok: true, tokens: row?.total || 0, migrated: true }));
  }

  const id = `mig_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  await env.DB.prepare(
    `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status) VALUES (?, ?, 'migration', 0, ?, 'approved')`
  ).bind(id, email, localTokens).run();

  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(tokens),0) as total FROM payment_requests WHERE user_email=? AND status='approved'`
  ).bind(email).first();

  return cors(JSON.stringify({ ok: true, tokens: row?.total || localTokens, migrated: true }));
}

async function handleSignupGrant(request, env) {
  const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);

  const email = await getEmailFromToken(idToken, env);
  if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 유저 세션입니다.' } }), 401);
  if (!await cfRateLimit(env.RL_API, email)) {
    return cors(JSON.stringify({ error: { message: '요청 한도를 초과했습니다.' } }), 429);
  }
  if (!env.DB) return cors(JSON.stringify({ error: { message: '데이터베이스 연결 실패' } }), 500);

  const existing = await env.DB.prepare(
    `SELECT id FROM payment_requests WHERE user_email = ? LIMIT 1`
  ).bind(email).first();
  if (existing) {
    const row = await env.DB.prepare(
      `SELECT COALESCE(SUM(tokens),0) as total FROM payment_requests WHERE user_email=? AND status='approved'`
    ).bind(email).first();
    return cors(JSON.stringify({ ok: true, tokens: row?.total || 0, already: true }));
  }

  const id = `signup_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  await env.DB.prepare(
    `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status) VALUES (?, ?, 'signup_grant', 0, 3, 'approved')`
  ).bind(id, email).run();

  return cors(JSON.stringify({ ok: true, tokens: 3 }));
}

// ════════════════════════════
//  관리자 기능 구성
// ════════════════════════════

const ADMIN_EMAIL = 'riger7070@gmail.com';

async function isAdmin(request, env) {
  // Google ID 토큰을 Google 서버에서 직접 검증 → 이메일 일치 확인
  // x-admin-secret 헤더 의존 제거 (브라우저에 공유 비밀키 저장 = 보안 취약)
  const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!idToken) return false;
  const email = await getEmailFromToken(idToken, env);
  return email === ADMIN_EMAIL;
}

async function handleAdminPayments(request, env) {
  if (!await isAdmin(request, env)) return cors(JSON.stringify({ error: { message: '관리자 권한이 필요합니다.' } }), 401);
  if (!env.DB) return cors(JSON.stringify({ error: { message: '데이터베이스 연결 실패' } }), 500);

  const rows = await env.DB.prepare(
    'SELECT * FROM payment_requests ORDER BY created_at DESC LIMIT 100'
  ).all();

  return cors(JSON.stringify(rows.results || []));
}

async function handleAdminApprove(request, env) {
  if (!await isAdmin(request, env)) return cors(JSON.stringify({ error: { message: '관리자 권한이 필요합니다.' } }), 401);
  if (!env.DB) return cors(JSON.stringify({ error: { message: '데이터베이스 연결 실패' } }), 500);

  let body;
  try { body = await request.json(); } catch { return cors(JSON.stringify({ error: { message: '올바르지 않은 JSON 요청 형식입니다.' } }), 400); }

  const { id } = body;
  if (!id) return cors(JSON.stringify({ error: { message: '결제 ID가 누락되었습니다.' } }), 400);

  const row = await env.DB.prepare(
    'SELECT status FROM payment_requests WHERE id = ?'
  ).bind(id).first();

  if (!row) return cors(JSON.stringify({ error: { message: '해당 결제 내역을 찾을 수 없습니다.' } }), 404);
  if (row.status === 'approved') return cors(JSON.stringify({ ok: true, already: true }));

  await env.DB.prepare(
    'UPDATE payment_requests SET status = ?, approved_at = unixepoch() WHERE id = ?'
  ).bind('approved', id).run();

  return cors(JSON.stringify({ ok: true }));
}

async function handleAdminGrantTokens(request, env) {
  if (!await isAdmin(request, env)) return cors(JSON.stringify({ error: { message: '관리자 권한이 필요합니다.' } }), 401);
  if (!env.DB) return cors(JSON.stringify({ error: { message: '데이터베이스 연결 실패' } }), 500);

  let body;
  try { body = await request.json(); } catch { return cors(JSON.stringify({ error: { message: '올바르지 않은 JSON 요청 형식입니다.' } }), 400); }

  const { email, tokens, note } = body;
  
  const tokenCount = parseInt(tokens, 10);
  if (!email || isNaN(tokenCount) || tokenCount <= 0 || tokenCount > 9999) {
    return cors(JSON.stringify({ error: { message: '올바른 이메일과 1개 이상의 토큰 수량을 입력해주세요.' } }), 400);
  }

  const id = `grant_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  await env.DB.prepare(
    `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
     VALUES (?, ?, ?, 0, ?, 'approved', unixepoch())`
  ).bind(id, email, note || 'admin_grant', tokenCount).run();

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: `🎁 관리자 직접 충전\n👤 ${email}\n✦ ${tokenCount}토큰 지급 완료\n📝 ${note || '사유 없음'}`,
      }),
    }).catch(() => {});
  }

  return cors(JSON.stringify({ ok: true, id, email, tokens: tokenCount }));
}

async function handleTelegramApprove(request, env) {
  const url    = new URL(request.url);
  const id    = url.searchParams.get('id');
  const token = url.searchParams.get('token');

  // HMAC 서명 검증 — URL에서 ADMIN_SECRET 완전 제거
  if (!id || !token || !await hmacVerify(env.ADMIN_SECRET, id, token)) {
    return htmlPage('❌ 인증 실패', '올바르지 않은 접근입니다.');
  }
  if (!env.DB) return htmlPage('❌ 오류', 'DB가 연결되지 않았습니다.');

  const row = await env.DB.prepare(
    'SELECT status, user_email, pkg, tokens FROM payment_requests WHERE id = ?'
  ).bind(id).first();

  if (!row) return htmlPage('❌ 없음', '해당 결제를 찾을 수 없습니다.');
  if (row.status === 'approved') {
    return htmlPage('✅ 이미 승인됨', `${row.user_email} 님은 이미 처리되었습니다.`);
  }

  await env.DB.prepare(
    'UPDATE payment_requests SET status = ?, approved_at = unixepoch() WHERE id = ?'
  ).bind('approved', id).run();

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: `✅ 승인 완료!\n👤 ${row.user_email}\n🎁 ${row.tokens}토큰 지급됨`,
      }),
    }).catch(() => {});
  }

  return htmlPage('✅ 승인 완료!', `${row.user_email} 님께 ${row.tokens}토큰이 지급됩니다.`);
}

function htmlPage(title, desc) {
  const t = escapeHtml(title);
  const d = escapeHtml(desc);
  return new Response(
    `<!DOCTYPE html><html><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${t}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:-apple-system,'Pretendard',sans-serif;background:#060608;color:#c9a96e;
           display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
      .box{text-align:center;padding:48px 36px;border:1px solid rgba(201,169,110,0.2);
           border-radius:20px;background:rgba(255,255,255,0.03);max-width:360px;width:100%}
      h1{font-size:1.6rem;margin-bottom:16px;font-weight:400}
      p{color:#888;font-size:0.9rem;line-height:1.7}
      .brand{margin-top:32px;font-size:0.7rem;letter-spacing:4px;color:rgba(201,169,110,0.4)}
    </style>
    </head><body>
    <div class="box"><h1>${t}</h1><p>${d}</p><div class="brand">M ; Y 安</div></div>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8', 'X-Content-Type-Options': 'nosniff' } }
  );
}

// ════════════════════════════
//  토스페이먼츠 직접 결제 검증 + 승인 핸들러
// ════════════════════════════
async function handlePaymentVerify(request, env) {
  try {
    // 0. 인증 토큰에서 이메일 추출 (클라이언트 body 값 신뢰 X)
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);
    if (!await cfRateLimit(env.RL_PAYMENT, email)) {
      return cors(JSON.stringify({ error: { message: '결제 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' } }), 429);
    }

    // 1. 클라이언트에서 paymentKey, orderId, amount 수신
    let body;
    try { body = await request.json(); } catch {
      return cors(JSON.stringify({ error: { message: '올바르지 않은 JSON 요청 형식입니다.' } }), 400);
    }
    const { paymentKey, orderId, amount } = body;
    if (!paymentKey || typeof paymentKey !== 'string' || paymentKey.length > 300) {
      return cors(JSON.stringify({ error: { message: '올바르지 않은 결제 키입니다.' } }), 400);
    }
    if (!orderId || typeof orderId !== 'string' || orderId.length > 200 || !/^myan_\d+_[a-z0-9]+$/.test(orderId)) {
      return cors(JSON.stringify({ error: { message: '올바르지 않은 주문 ID입니다.' } }), 400);
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      return cors(JSON.stringify({ error: { message: '올바르지 않은 결제 금액입니다.' } }), 400);
    }

    // 2. 금액 → pkg/tokens 매핑 (서버에서 결정 — 클라이언트 조작 원천 차단)
    const VERIFY_PKG_TABLE = {
      4900:  { pkg: 'small',  tokens: 30  },
      12900: { pkg: 'medium', tokens: 100 },
      29900: { pkg: 'large',  tokens: 300 },
    };
    const pkgEntry = VERIFY_PKG_TABLE[amount];
    if (!pkgEntry) {
      return cors(JSON.stringify({ error: { message: '유효하지 않은 결제 금액입니다.' } }), 400);
    }
    const { pkg: serverPkg, tokens: serverTokens } = pkgEntry;

    // 3. 중복 결제 방지 (orderId 기준)
    if (!env.DB) return cors(JSON.stringify({ error: { message: '데이터베이스 연결 실패' } }), 500);
    const dupCheck = await env.DB.prepare(
      'SELECT id FROM payment_requests WHERE id = ?'
    ).bind(orderId).first();
    if (dupCheck) {
      return cors(JSON.stringify({ error: { message: '이미 처리된 결제입니다.' } }), 409);
    }

    // 4. 토스페이먼츠 서버에 결제 승인 요청 (위변조 방지 — amount 불일치 시 Toss가 거절)
    if (!env.TOSS_SECRET_KEY) {
      return cors(JSON.stringify({ error: { message: '결제 서버 설정 오류' } }), 500);
    }
    const tossCredential = btoa(env.TOSS_SECRET_KEY + ':');
    const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${tossCredential}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });

    if (!tossRes.ok) {
      let errMsg = '결제 승인 실패';
      try {
        const tossErr = await tossRes.json();
        errMsg = tossErr.message || errMsg;
      } catch {}
      return cors(JSON.stringify({ error: { message: errMsg } }), 400);
    }

    const tossPayment = await tossRes.json();

    // 5. 토스 응답 검증 — 실제 결제 금액·상태 재확인
    if (tossPayment.status !== 'DONE') {
      return cors(JSON.stringify({ error: { message: '결제가 완료되지 않았습니다.' } }), 400);
    }
    if (tossPayment.totalAmount !== amount) {
      return cors(JSON.stringify({ error: { message: '결제 금액 불일치 — 보안 거부' } }), 400);
    }

    // 6. 승인 통과 → D1 DB에 approved 상태로 기록
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`
      INSERT INTO payment_requests
        (id, user_email, pkg, amount, tokens, status, created_at, approved_at)
      VALUES (?, ?, ?, ?, ?, 'approved', ?, ?)
    `).bind(orderId, email, serverPkg, amount, serverTokens, now, now).run();

    // 7. 최신 잔액 계산 후 반환
    const balRes = await env.DB.prepare(`
      SELECT COALESCE(SUM(tokens), 0) AS balance
      FROM payment_requests
      WHERE user_email = ? AND status = 'approved'
    `).bind(email).first();

    return cors(JSON.stringify({
      success: true,
      tokens:  serverTokens,
      balance: balRes ? balRes.balance : serverTokens
    }));

  } catch (err) {
    return cors(JSON.stringify({ error: { message: '결제 처리 중 오류가 발생했습니다.' } }), 500);
  }
}

// ════════════════════════════
//  구독(멤버십) — 토스 빌링(정기결제)
// ════════════════════════════
// 요금제: 금액·지급 토큰은 서버에서 결정 (클라이언트 조작 차단)
const SUB_PLANS = {
  basic:   { amount: 9900,  tokens: 120, name: '마이안 베이직 멤버십' },
  premium: { amount: 19900, tokens: 280, name: '마이안 프리미엄 멤버십' },
};
const SUB_PERIOD_SEC = 30 * 24 * 60 * 60; // 결제 주기(30일)
const SUB_MAX_FAILS  = 3;                  // 연속 결제 실패 허용 횟수 (이후 past_due)

// 구독 토큰 지급 — 기존 잔액 계산(payment_requests, status='approved')과 동일 경로로 적립
async function grantSubscriptionTokens(env, email, plan, tokens, amount, orderId) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(`
    INSERT INTO payment_requests
      (id, user_email, pkg, amount, tokens, status, created_at, approved_at)
    VALUES (?, ?, ?, ?, ?, 'approved', ?, ?)
  `).bind(orderId, email, `sub_${plan}`, amount, tokens, now, now).run();
}

// 토스 빌링키로 정기결제 1회 실행
async function tossBillingCharge(env, { billingKey, customerKey, amount, orderId, orderName, email }) {
  const cred = btoa(env.TOSS_SECRET_KEY + ':');
  const res = await fetch(`https://api.tosspayments.com/v1/billing/${billingKey}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${cred}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerKey, amount, orderId, orderName, customerEmail: email }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.status === 'DONE', data };
}

// 구독 신청·승인 (authKey → billingKey 발급 후 첫 결제)
async function handleSubscriptionConfirm(request, env) {
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);
    if (!await cfRateLimit(env.RL_PAYMENT, email)) {
      return cors(JSON.stringify({ error: { message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' } }), 429);
    }
    if (!env.DB) return cors(JSON.stringify({ error: { message: '데이터베이스 연결 실패' } }), 500);
    if (!env.TOSS_SECRET_KEY) return cors(JSON.stringify({ error: { message: '결제 서버 설정 오류' } }), 500);

    let body;
    try { body = await request.json(); } catch {
      return cors(JSON.stringify({ error: { message: '올바르지 않은 JSON 요청 형식입니다.' } }), 400);
    }
    const { authKey, customerKey, plan } = body;
    if (!authKey || typeof authKey !== 'string' || authKey.length > 300) {
      return cors(JSON.stringify({ error: { message: '올바르지 않은 인증 키입니다.' } }), 400);
    }
    if (!customerKey || typeof customerKey !== 'string' || customerKey.length > 300) {
      return cors(JSON.stringify({ error: { message: '올바르지 않은 고객 키입니다.' } }), 400);
    }
    const planInfo = SUB_PLANS[plan];
    if (!planInfo) return cors(JSON.stringify({ error: { message: '유효하지 않은 구독 상품입니다.' } }), 400);

    // 이미 활성 구독이 있으면 중복 결제 차단
    const existing = await env.DB.prepare(
      'SELECT status FROM subscriptions WHERE user_email = ?'
    ).bind(email).first();
    if (existing && existing.status === 'active') {
      return cors(JSON.stringify({ error: { message: '이미 활성화된 구독이 있습니다.' } }), 409);
    }

    // 1. authKey → billingKey 발급 (정기결제 수단 등록)
    const cred = btoa(env.TOSS_SECRET_KEY + ':');
    const issueRes = await fetch('https://api.tosspayments.com/v1/billing/authorizations/issue', {
      method: 'POST',
      headers: { Authorization: `Basic ${cred}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey, customerKey }),
    });
    if (!issueRes.ok) {
      let m = '결제 수단 등록에 실패했습니다.';
      try { m = (await issueRes.json()).message || m; } catch {}
      return cors(JSON.stringify({ error: { message: m } }), 400);
    }
    const billing = await issueRes.json();
    const billingKey = billing.billingKey;
    if (!billingKey) return cors(JSON.stringify({ error: { message: '빌링키 발급에 실패했습니다.' } }), 400);

    // 2. 첫 회 결제
    const orderId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const charge = await tossBillingCharge(env, {
      billingKey, customerKey, amount: planInfo.amount, orderId,
      orderName: planInfo.name, email,
    });
    if (!charge.ok) {
      return cors(JSON.stringify({ error: { message: charge.data.message || '구독 결제에 실패했습니다.' } }), 400);
    }

    // 3. 구독 레코드 저장(있으면 갱신) + 토큰 지급
    const now = Math.floor(Date.now() / 1000);
    const periodEnd = now + SUB_PERIOD_SEC;
    await env.DB.prepare(`
      INSERT INTO subscriptions
        (user_email, plan, billing_key, customer_key, status, amount, monthly_tokens,
         created_at, current_period_start, current_period_end, last_charged_at, fail_count, canceled_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, 0, NULL)
      ON CONFLICT(user_email) DO UPDATE SET
        plan=excluded.plan, billing_key=excluded.billing_key, customer_key=excluded.customer_key,
        status='active', amount=excluded.amount, monthly_tokens=excluded.monthly_tokens,
        current_period_start=excluded.current_period_start, current_period_end=excluded.current_period_end,
        last_charged_at=excluded.last_charged_at, fail_count=0, canceled_at=NULL
    `).bind(email, plan, billingKey, customerKey, planInfo.amount, planInfo.tokens,
            now, now, periodEnd, now).run();

    await grantSubscriptionTokens(env, email, plan, planInfo.tokens, planInfo.amount, orderId);

    const bal = await env.DB.prepare(`
      SELECT COALESCE(SUM(tokens), 0) AS balance
      FROM payment_requests WHERE user_email = ? AND status = 'approved'
    `).bind(email).first();

    return cors(JSON.stringify({
      success: true, plan, tokens: planInfo.tokens,
      balance: bal ? bal.balance : planInfo.tokens,
      currentPeriodEnd: periodEnd,
    }));
  } catch (err) {
    return cors(JSON.stringify({ error: { message: '구독 처리 중 오류가 발생했습니다.' } }), 500);
  }
}

// 현재 구독 상태 조회
async function handleSubscriptionGet(request, env) {
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 필요' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 토큰' } }), 401);
    if (!env.DB) return cors(JSON.stringify({ active: false }));
    const sub = await env.DB.prepare(
      'SELECT plan, status, amount, monthly_tokens, current_period_end FROM subscriptions WHERE user_email = ?'
    ).bind(email).first();
    if (!sub || sub.status !== 'active') {
      return cors(JSON.stringify({ active: false, status: sub ? sub.status : null }));
    }
    return cors(JSON.stringify({
      active: true,
      plan: sub.plan,
      status: sub.status,
      amount: sub.amount,
      monthlyTokens: sub.monthly_tokens,
      currentPeriodEnd: sub.current_period_end,
    }));
  } catch (e) {
    return cors(JSON.stringify({ error: { message: '구독 조회 중 오류가 발생했습니다.' } }), 500);
  }
}

// 구독 해지 (이미 지급된 토큰은 유지, 다음 주기부터 자동결제 중단)
async function handleSubscriptionCancel(request, env) {
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 필요' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 토큰' } }), 401);
    if (!env.DB) return cors(JSON.stringify({ error: { message: '데이터베이스 연결 실패' } }), 500);
    const now = Math.floor(Date.now() / 1000);
    const res = await env.DB.prepare(
      "UPDATE subscriptions SET status='canceled', canceled_at=? WHERE user_email=? AND status='active'"
    ).bind(now, email).run();
    if (!(res.meta && res.meta.changes)) {
      return cors(JSON.stringify({ error: { message: '활성 구독이 없습니다.' } }), 404);
    }
    return cors(JSON.stringify({ success: true }));
  } catch (e) {
    return cors(JSON.stringify({ error: { message: '구독 해지 중 오류가 발생했습니다.' } }), 500);
  }
}

// cron: 만기 도래한 활성 구독 자동 재결제 + dunning(실패 재시도)
async function processSubscriptionRenewals(env) {
  if (!env.DB || !env.TOSS_SECRET_KEY) return;
  const now = Math.floor(Date.now() / 1000);
  const due = await env.DB.prepare(
    "SELECT * FROM subscriptions WHERE status='active' AND current_period_end <= ?"
  ).bind(now).all().catch(() => ({ results: [] }));

  for (const sub of due.results || []) {
    const planInfo = SUB_PLANS[sub.plan];
    if (!planInfo) continue;
    const orderId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let charge;
    try {
      charge = await tossBillingCharge(env, {
        billingKey: sub.billing_key, customerKey: sub.customer_key,
        amount: sub.amount, orderId, orderName: planInfo.name, email: sub.user_email,
      });
    } catch { charge = { ok: false, data: {} }; }

    if (charge.ok) {
      const periodEnd = now + SUB_PERIOD_SEC;
      await env.DB.prepare(
        "UPDATE subscriptions SET current_period_start=?, current_period_end=?, last_charged_at=?, fail_count=0 WHERE user_email=?"
      ).bind(now, periodEnd, now, sub.user_email).run();
      await grantSubscriptionTokens(env, sub.user_email, sub.plan, sub.monthly_tokens, sub.amount, orderId);
    } else {
      const fails = (sub.fail_count || 0) + 1;
      if (fails >= SUB_MAX_FAILS) {
        await env.DB.prepare(
          "UPDATE subscriptions SET status='past_due', fail_count=? WHERE user_email=?"
        ).bind(fails, sub.user_email).run();
      } else {
        // 다음 날 재시도 (cron이 매일 실행되므로 current_period_end를 하루 뒤로)
        await env.DB.prepare(
          "UPDATE subscriptions SET fail_count=?, current_period_end=? WHERE user_email=?"
        ).bind(fails, now + 86400, sub.user_email).run();
      }
    }
  }
}

// ════════════════════════════
//  보안 헤더 (정적 파일 응답에 주입)
// ════════════════════════════
function addSecurityHeaders(response) {
  const h = new Headers(response.headers);

  // HTTPS 강제 (1년, 서브도메인 포함)
  h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // 클릭재킹 방지 (iframe 삽입 차단)
  h.set('X-Frame-Options', 'DENY');

  // MIME 스니핑 방지
  h.set('X-Content-Type-Options', 'nosniff');

  // Referrer: 같은 출처끼리만 전체 URL, 외부엔 도메인만
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 불필요한 브라우저 기능 차단
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // Google OAuth를 위한 COOP 헤더
  h.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  // Content-Security-Policy (XSS 브라우저 차단)
  h.set('Content-Security-Policy', [
    "default-src 'self'",
    // 구글 로그인 + 토스페이먼츠 + QR 라이브러리 스크립트
    "script-src 'self' 'unsafe-inline' https://accounts.google.com https://cdnjs.cloudflare.com https://js.tosspayments.com",
    // 인라인 스타일 + 구글 폰트 + GIS(구글 로그인) 스타일시트(gsi/style)
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
    // 구글 폰트 파일
    "font-src 'self' https://fonts.gstatic.com",
    // 이미지: self, data URI
    "img-src 'self' data: https:",
    // API 통신 허용 출처 (토스페이먼츠 API + GIS gsi 엔드포인트 + Google Fonts)
    "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://generativelanguage.googleapis.com https://api.tosspayments.com https://script.google.com https://fonts.gstatic.com",
    // 구글 로그인 팝업 + 토스 결제 페이지 iframe 허용
    "frame-src https://accounts.google.com https://tosspayments.com https://*.tosspayments.com",
  ].join('; '));

  return new Response(response.body, { status: response.status, headers: h });
}

function cors(body, status = 200) {
  return new Response(body || null, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'https://myan.riger7070.workers.dev',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
}

// ════════════════════════════
//  공통 법적 페이지 스타일
// ════════════════════════════
function legalPageWrapper(title, bodyHtml) {
  return new Response(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} — M;Y 安</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,'Pretendard',sans-serif;background:#060608;color:#c9a96e;
         min-height:100vh;padding:40px 20px 80px}
    .wrap{max-width:680px;margin:0 auto}
    .brand{font-size:0.7rem;letter-spacing:4px;color:rgba(201,169,110,0.4);margin-bottom:8px}
    h1{font-size:1.4rem;font-weight:400;letter-spacing:2px;margin-bottom:6px}
    .date{font-size:0.75rem;color:rgba(201,169,110,0.35);margin-bottom:40px}
    h2{font-size:0.95rem;color:#c9a96e;font-weight:500;margin:32px 0 10px;letter-spacing:1px}
    p,li{font-size:0.88rem;color:#9e9590;line-height:1.9}
    ul,ol{padding-left:20px;margin-bottom:8px}
    li{margin-bottom:4px}
    .box{background:rgba(201,169,110,0.05);border:1px solid rgba(201,169,110,0.15);
         border-radius:10px;padding:18px 20px;margin:12px 0}
    .box p{color:#aaa}
    a{color:#c9a96e}
    hr{border:none;border-top:1px solid rgba(201,169,110,0.1);margin:32px 0}
    .back{display:inline-block;margin-bottom:32px;color:rgba(201,169,110,0.5);
          font-size:0.8rem;text-decoration:none;letter-spacing:1px}
  </style>
</head>
<body>
<div class="wrap">
  <a class="back" href="/">← 홈으로</a>
  <div class="brand">M ; Y 安</div>
  ${bodyHtml}
</div>
</body>
</html>`, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'public, max-age=86400' },
  });
}

// ════════════════════════════
//  개인정보처리방침
// ════════════════════════════
function handlePrivacyPage() {
  return legalPageWrapper('개인정보처리방침', `
<h1>개인정보처리방침</h1>
<div class="date">시행일: 2026년 1월 1일 &nbsp;|&nbsp; 최종 수정: 2026년 6월 5일</div>

<p>마이안(M;Y 安, 이하 "회사")은 이용자의 개인정보를 소중히 여기며, 「개인정보 보호법」 및 관련 법령을 준수합니다.</p>

<h2>1. 수집하는 개인정보</h2>
<div class="box">
  <p><strong>Google 로그인 시 수집:</strong></p>
  <ul>
    <li>이메일 주소 (서비스 식별 및 토큰 관리, 서버 저장)</li>
    <li>이름 (리딩 서비스 제공 및 계정 표시, 서버 저장)</li>
    <li>프로필 사진 (선택, 화면 표시용, 서버 저장)</li>
    <li>언어 설정(locale) (서비스 언어 제공, 서버 저장)</li>
  </ul>
  <p style="margin-top:10px"><strong>로그인 시 자동 수집 (접속 기록):</strong></p>
  <ul>
    <li>로그인 일시 및 누적 로그인 횟수 (부정 이용 방지·서비스 운영, 서버 저장)</li>
    <li>IP 주소 (보안·부정 이용 방지, 서버 저장)</li>
    <li>접속 국가 (보안·통계, 서버 저장)</li>
    <li>브라우저/기기 정보(User-Agent) (보안·오류 대응, 서버 저장)</li>
  </ul>
  <p style="margin-top:10px"><strong>서비스 이용 중 수집:</strong></p>
  <ul>
    <li>생년월일 (사주 풀이 서비스 제공, 기기에만 저장)</li>
    <li>성별·거주지역 (선택, 정밀 풀이 목적, 기기에만 저장)</li>
    <li>결제 기록 (토큰 잔액 관리, 서버 저장)</li>
  </ul>
  <p style="margin-top:10px"><strong>게스트(비회원) 체험 시 수집:</strong></p>
  <ul>
    <li>IP 주소 (1일 1회 무료 체험 횟수 제한 목적, 서버 저장)</li>
  </ul>
</div>

<h2>2. 개인정보 이용 목적</h2>
<ul>
  <li>AI 사주 리딩 서비스 제공</li>
  <li>토큰 잔액 관리 및 결제 처리</li>
  <li>서비스 이용 내역 관리 및 오류 대응</li>
  <li>로그인·접속 기록을 통한 보안 및 부정 이용(어뷰징) 방지</li>
  <li>서비스 이용 통계 분석 및 품질 개선</li>
  <li>법령상 의무 이행</li>
</ul>

<h2>3. 개인정보 보유 및 파기</h2>
<p>회원 탈퇴 시 서버에 저장된 모든 데이터(이메일, 이름·프로필·언어 설정, 토큰 잔액, 결제 기록, 로그인·접속 기록)를 즉시 파기합니다. 생년월일 등 기기 로컬 데이터는 앱 삭제 또는 회원 탈퇴 시 파기됩니다. 게스트 체험 기록은 횟수 제한 목적 달성 후 일정 기간 경과 시 파기됩니다.</p>

<h2>4. 개인정보 제3자 제공</h2>
<p>회사는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 단, 법령에 의한 요청이 있는 경우는 예외로 합니다.</p>

<h2>5. 개인정보 처리 위탁</h2>
<div class="box">
  <p><strong>Cloudflare, Inc.</strong> — 서버 인프라 및 데이터 저장 (미국)</p>
  <p><strong>Google LLC</strong> — 소셜 로그인 인증 (미국)</p>
  <p><strong>Google LLC (Gemini API)</strong> — AI 리딩 서비스 제공 (미국)</p>
</div>

<h2>6. 이용자의 권리</h2>
<ul>
  <li>개인정보 열람, 정정, 삭제 요청 가능</li>
  <li>앱 내 마이페이지 → 회원 탈퇴로 즉시 삭제 가능</li>
  <li>이메일 요청 시 영업일 3일 이내 처리: <a href="mailto:riger7070@naver.com">riger7070@naver.com</a></li>
</ul>

<h2>7. 개인정보 보호책임자</h2>
<div class="box">
  <p>성명: 안태현 &nbsp;|&nbsp; 이메일: <a href="mailto:riger7070@naver.com">riger7070@naver.com</a></p>
  <p>전화: 010-6466-5717</p>
</div>

<h2>8. 국제 데이터 이전</h2>
<p>서비스 제공을 위해 일부 데이터가 미국(Cloudflare, Google)에 저장될 수 있으며, 해당 국가의 법령에 따라 보호됩니다.</p>

<h2>9. 쿠키 및 추적</h2>
<p>본 서비스는 광고 목적의 쿠키나 행동 추적을 사용하지 않습니다. 로그인 상태 유지를 위한 필수 로컬 저장소만 사용합니다.</p>

<hr>
<p style="font-size:0.8rem;color:rgba(201,169,110,0.35)">문의: 마이안 &nbsp;·&nbsp; riger7070@naver.com &nbsp;·&nbsp; 010-6466-5717</p>
`);
}

// ════════════════════════════
//  이용약관
// ════════════════════════════
function handleTermsPage() {
  return legalPageWrapper('이용약관', `
<h1>이용약관</h1>
<div class="date">시행일: 2026년 1월 1일 &nbsp;|&nbsp; 최종 수정: 2026년 5월 26일</div>

<h2>제1조 (목적)</h2>
<p>본 약관은 마이안(M;Y 安, 이하 "회사")이 제공하는 AI 사주 리딩 서비스(이하 "서비스")의 이용 조건 및 절차에 관한 사항을 규정함을 목적으로 합니다.</p>

<h2>제2조 (서비스 내용)</h2>
<ul>
  <li>명리학 기반 AI 사주·일진 리딩 서비스</li>
  <li>나만의 리딩 (1인 사주 분석)</li>
  <li>우리의 조화 (2인 궁합·관계 분석)</li>
  <li>위 서비스는 토큰(이용권)을 소비하여 이용합니다</li>
</ul>

<h2>제3조 (회원가입 및 로그인)</h2>
<p>본 서비스는 Google 소셜 로그인을 통해 가입 및 이용이 가능합니다. 가입 시 신규 이용자에게 무료 토큰이 지급됩니다.</p>

<h2>제4조 (토큰 및 결제)</h2>
<div class="box">
  <ul>
    <li>토큰은 AI 리딩 서비스 이용에 사용되는 디지털 이용권입니다</li>
    <li>결제 완료 즉시 토큰이 지급됩니다</li>
    <li>토큰은 현금으로 환급되지 않습니다</li>
    <li>미사용 토큰은 회원 탈퇴 시 소멸됩니다</li>
  </ul>
</div>

<h2>제5조 (환불 정책)</h2>
<ul>
  <li>결제 후 7일 이내, 미사용 토큰에 한해 환불 가능합니다</li>
  <li>토큰을 1개 이상 사용한 경우 부분 환불이 적용될 수 있습니다</li>
  <li>환불 요청: <a href="mailto:riger7070@naver.com">riger7070@naver.com</a> 또는 010-6466-5717</li>
  <li>「콘텐츠산업진흥법」 및 「전자상거래법」에 따라 처리됩니다</li>
</ul>

<h2>제6조 (면책사항)</h2>
<div class="box">
  <p>본 서비스는 명리학 이론 기반의 체험형 콘텐츠입니다.<br>
  의학적·법적·재정적 조언을 대체하지 않으며, 모든 풀이 결과는 참고용으로만 활용하시기 바랍니다.<br>
  서비스 이용으로 발생한 직접적·간접적 손해에 대해 회사는 책임을 지지 않습니다.</p>
</div>

<h2>제7조 (금지 행위)</h2>
<ul>
  <li>서비스의 무단 크롤링, 자동화 이용</li>
  <li>타인의 계정 도용 또는 허위 정보 입력</li>
  <li>서비스 운영을 방해하는 행위</li>
</ul>

<h2>제8조 (서비스 변경 및 중단)</h2>
<p>회사는 서비스 내용 변경, 일시 중단, 종료 시 사전 고지합니다. 단, 불가피한 경우 사후 고지할 수 있습니다.</p>

<h2>제9조 (준거법 및 분쟁 해결)</h2>
<p>본 약관은 대한민국 법령에 따르며, 분쟁 발생 시 부산지방법원을 관할법원으로 합니다.</p>

<hr>
<p style="font-size:0.8rem;color:rgba(201,169,110,0.35)">사업자: 마이안 &nbsp;·&nbsp; 대표: 안태현 &nbsp;·&nbsp; 사업자등록번호: 501-33-63980<br>
부산광역시 수영구 망미동 현대한누리타운 101-1101 &nbsp;·&nbsp; riger7070@naver.com</p>
`);
}

// ════════════════════════════
//  계정 삭제 안내 페이지 (Play Store / App Store 정책 요구사항)
// ════════════════════════════
function handleDeleteAccountPage() {
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>계정 삭제 요청 — M;Y 安</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,'Pretendard',sans-serif;background:#060608;color:#c9a96e;
         min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{max-width:480px;width:100%;border:1px solid rgba(201,169,110,0.2);border-radius:20px;
          background:rgba(255,255,255,0.02);padding:48px 36px}
    h1{font-size:1.4rem;font-weight:400;letter-spacing:2px;margin-bottom:8px}
    .brand{font-size:0.75rem;letter-spacing:4px;color:rgba(201,169,110,0.5);margin-bottom:32px}
    h2{font-size:1rem;font-weight:500;color:#d4c5a9;margin:28px 0 10px}
    p{color:#888;font-size:0.9rem;line-height:1.8}
    ol{color:#888;font-size:0.9rem;line-height:2;padding-left:20px}
    .box{background:rgba(201,169,110,0.06);border:1px solid rgba(201,169,110,0.15);
         border-radius:12px;padding:20px;margin:20px 0}
    .box p{color:#aaa}
    a{color:#c9a96e;text-decoration:underline}
    .note{margin-top:32px;padding-top:24px;border-top:1px solid rgba(201,169,110,0.1)}
    .note p{font-size:0.8rem;color:#555;line-height:1.7}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">M ; Y 安</div>
    <h1>계정 및 데이터 삭제</h1>
    <p style="margin-top:12px">Account &amp; Data Deletion Request</p>

    <h2>앱에서 직접 삭제 (권장)</h2>
    <ol>
      <li>앱 실행 후 로그인</li>
      <li>우측 상단 메뉴(☰) → 마이페이지</li>
      <li>하단 <strong>회원 탈퇴</strong> 버튼 클릭</li>
      <li>확인 후 즉시 삭제 처리됩니다</li>
    </ol>

    <h2>이메일로 요청</h2>
    <div class="box">
      <p>앱 접근이 어려운 경우 아래 이메일로 연락해 주세요.<br>
      가입하신 이메일 주소와 함께 삭제 요청을 보내주시면<br>
      <strong>영업일 기준 3일 이내</strong> 처리해 드립니다.</p>
      <p style="margin-top:12px">
        📧 <a href="mailto:riger7070@gmail.com">riger7070@gmail.com</a>
      </p>
    </div>

    <h2>삭제되는 데이터</h2>
    <ol>
      <li>서버에 저장된 토큰 잔액 및 결제 기록</li>
      <li>사용자 식별 이메일 정보</li>
      <li>앱 내 로컬 저장 데이터 (이름, 생년월일 등)</li>
    </ol>

    <div class="note">
      <p>※ Google 계정 자체는 삭제되지 않습니다. Google 계정 관리는 <a href="https://myaccount.google.com" target="_blank">myaccount.google.com</a>에서 하실 수 있습니다.</p>
      <p style="margin-top:8px">※ This page is also available in English. For deletion requests in English, please email <a href="mailto:riger7070@gmail.com">riger7070@gmail.com</a> with your registered email address.</p>
    </div>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

// ════════════════════════════
//  회원탈퇴 핸들러
// ════════════════════════════
async function handleWithdraw(request, env) {
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);

    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    if (!env.DB) return cors(JSON.stringify({ error: { message: '데이터베이스가 연결되지 않았습니다.' } }), 500);

    await ensureDBExt(env);

    // 해당 이메일의 모든 결제/토큰 기록 삭제
    await env.DB.prepare(
      'DELETE FROM payment_requests WHERE user_email = ?'
    ).bind(email).run();

    // 로그인 기록(계정 정보 + 접속 로그)도 함께 파기
    await env.DB.prepare('DELETE FROM users WHERE email = ?').bind(email).run().catch(() => {});
    await env.DB.prepare('DELETE FROM login_events WHERE email = ?').bind(email).run().catch(() => {});

    return cors(JSON.stringify({ success: true, message: '회원 탈퇴가 완료되었습니다.' }), 200);
  } catch (e) {
    return cors(JSON.stringify({ error: { message: '탈퇴 처리 중 오류가 발생했습니다.' } }), 500);
  }
}


// ════════════════════════════
//  상세 풀이 핸들러
// ════════════════════════════
// 상세 풀이 개별 카테고리 — 프론트 js/locales.js의 detailCardTitle과 키를 맞출 것
const DETAIL_CATEGORIES = {
  wealth: { icon:'💰', title:'재물운', guide:'오늘 돈·투자·지출과 관련해 주의할 점과 좋은 기회' },
  love:   { icon:'💕', title:'연애운', guide:'오늘 연인·이성 관계·소개팅 등에서 특히 신경 쓸 점과 좋은 기회' },
  career: { icon:'💼', title:'직장·사업운', guide:'오늘 직장·이직·사업과 관련해 주의할 점과 좋은 기회' },
  health: { icon:'🏥', title:'건강운', guide:'오늘 몸과 마음을 어떻게 챙기면 좋을지 구체적인 행동 조언' },
};

async function handleDetailReading(request, env) {
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { date, ohaeng, lang = 'ko', birth, p2, category } = await request.json().catch(() => ({}));
    if (!date || !ohaeng) return cors(JSON.stringify({ error: { message: 'date, ohaeng 필수' } }), 400);
    const cat = DETAIL_CATEGORIES[category];
    if (!cat) return cors(JSON.stringify({ error: { message: '올바르지 않은 카테고리입니다.' } }), 400);

    // 사용자 사주 원국(만세력) — 생년월일시가 오면 서버에서 정확히 계산 (AI 재계산 금지)
    const saju  = (birth && birth.year) ? computeSaju(birth.year, birth.month, birth.day, birth.hour) : null;
    const saju2 = (p2 && p2.year)       ? computeSaju(p2.year, p2.month, p2.day, p2.hour) : null;
    let sajuBlock = '';
    if (saju && saju2) {
      // 우리의 조화(2인) 상세풀이 — 두 사람의 확정 사주 기반 관계 풀이
      sajuBlock = `\n\n[두 사람의 사주 원국 — 서버 만세력 계산 확정값. 재계산·추측 금지]\n첫 번째 분: ${saju.text}\n두 번째 분: ${saju2.text}\n반드시 두 사람의 일간(본질)과 오행 분포를 비교·반영하여, 오늘(${date}) 기운 속에서 두 사람의 관계를 개인 맞춤으로 풀어주세요. 아래 주제를 '두 사람의 관계' 관점으로 해석하세요.`;
    } else if (saju) {
      sajuBlock = `\n\n[이 사람의 사주 원국 — 서버에서 만세력(절기 반영)으로 계산한 확정값. 절대 재계산·추측하지 말고 이 값만 사용]\n${saju.text}\n반드시 위 사주의 일간(日干=본질)과 오행 분포를 반영하여, 오늘(${date})의 ${ohaeng} 기운이 이 사람에게 어떻게 작용하는지 개인 맞춤으로 풀어주세요.`;
    }

    // 2토큰 차감 (atomic INSERT — 잔액 >= 2 일 때만 삽입)
    const detailUseId = `detail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const deductDetail = await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       SELECT ?, ?, 'detail_use', 0, -2, 'approved', unixepoch()
       WHERE (SELECT COALESCE(SUM(tokens), 0) FROM payment_requests WHERE user_email = ? AND status = 'approved') >= 2`
    ).bind(detailUseId, email, email).run();
    if (!deductDetail.meta?.rows_written) {
      return cors(JSON.stringify({ error: { message: '상세 풀이는 토큰 2개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    // 차감 후 잔여 토큰 계산
    const remainRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(tokens), 0) AS bal FROM payment_requests WHERE user_email = ? AND status = 'approved'`
    ).bind(email).first();
    const remainingTokens = remainRow?.bal ?? 0;

    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const prompt = `당신은 오늘의 기운을 친근하게 안내해주는 상담사입니다. 오늘(${date})의 기운은 "${ohaeng}"(${ohaeng==='木'?'나무':ohaeng==='火'?'불':ohaeng==='土'?'흙':ohaeng==='金'?'쇠':'물'} 기운)입니다.${sajuBlock}

아래 주제 하나에 대해서만 ${langLabel}로 조언해주세요. 250자 이상, 따뜻하고 친근한 말투로 작성하고 마지막엔 오늘 바로 실천할 수 있는 구체적인 행동 하나를 제안하세요.
주제: ${cat.icon} ${cat.title} — ${cat.guide}

중요: 한자나 어려운 사주 용어(예: 甲木, 天干, 地支, 相生 등)를 쓸 경우 반드시 바로 옆에 괄호로 뜻을 써주세요. 예) 甲木(갑목, 강한 나무 기운), 相生(상생, 서로 돕는 관계). 일상적인 쉬운 단어는 풀이 불필요.

JSON이나 마크다운, 코드블록 없이 조언 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사(그리고, 다만, 특히 등)로 편하게 이어서 사람이 말하듯 써주세요.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ temperature:0.8 } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

    if (!resp.ok || !reading) {
      const refundId = `detail_refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.prepare(
        `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'detail_refund', 0, 2, 'approved', unixepoch())`
      ).bind(refundId, email).run();
      return cors(JSON.stringify({ error: { message: '상세 풀이를 생성하지 못했습니다. 토큰은 환불되었습니다.' } }), 422);
    }

    saveFeatureHistory(env, email, 'detail', cat.title, reading, { category, date, ohaeng }).catch(() => {});

    return cors(JSON.stringify({ success:true, category, categoryTitle: cat.title, reading, remaining: remainingTokens }), 200);
  } catch(e) {
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  타로카드 뽑기 (재미 콘텐츠, 1토큰)
// ════════════════════════════════════════════
// key는 프론트 js/constants.js의 TAROT_CARDS와 순서를 맞출 것
const TAROT_CARDS = [
  { name:'광대',           icon:'🃏' }, { name:'마법사',           icon:'🎩' },
  { name:'여사제',         icon:'🌙' }, { name:'여황제',           icon:'👑' },
  { name:'황제',           icon:'♚' }, { name:'교황',             icon:'🔔' },
  { name:'연인',           icon:'💞' }, { name:'전차',             icon:'🏇' },
  { name:'힘',             icon:'🦁' }, { name:'은둔자',           icon:'🏮' },
  { name:'운명의 수레바퀴', icon:'🎡' }, { name:'정의',             icon:'⚖️' },
  { name:'매달린 사람',    icon:'🙃' }, { name:'죽음(변화)',       icon:'🦋' },
  { name:'절제',           icon:'⚗️' }, { name:'악마',             icon:'😈' },
  { name:'탑',             icon:'🗼' }, { name:'별',               icon:'⭐' },
  { name:'달',             icon:'🌕' }, { name:'태양',             icon:'☀️' },
  { name:'심판',           icon:'📯' }, { name:'세계',             icon:'🌍' },
];

async function handleTarotDraw(request, env) {
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko' } = await request.json().catch(() => ({}));

    // 1토큰 차감 (atomic INSERT — 잔액 >= 1 일 때만 삽입)
    const useId = `tarot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const deduct = await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       SELECT ?, ?, 'tarot_use', 0, -1, 'approved', unixepoch()
       WHERE (SELECT COALESCE(SUM(tokens), 0) FROM payment_requests WHERE user_email = ? AND status = 'approved') >= 1`
    ).bind(useId, email, email).run();
    if (!deduct.meta?.rows_written) {
      return cors(JSON.stringify({ error: { message: '타로카드 뽑기는 토큰 1개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    const remainRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(tokens), 0) AS bal FROM payment_requests WHERE user_email = ? AND status = 'approved'`
    ).bind(email).first();
    const remainingTokens = remainRow?.bal ?? 0;

    const cardIdx = Math.floor(Math.random() * TAROT_CARDS.length);
    const card = TAROT_CARDS[cardIdx];
    const upright = Math.random() < 0.65; // 정방향에 약간 더 무게 — 지나치게 부정적인 결과가 잦지 않도록

    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const prompt = `당신은 오늘의 기운을 친근하게 안내해주는 타로 마스터입니다. 오늘 뽑힌 카드는 "${card.name}" — ${upright ? '정방향' : '역방향'}입니다.

이 카드가 오늘 하루에 어떤 의미인지 ${langLabel}로 3~4문장, 따뜻하고 재미있게 해석해주세요. 딱딱한 예언이 아니라 오늘 하루를 대하는 마음가짐이나 작은 실천 팁으로 풀어주세요. 역방향이거나 다소 무거운 카드여도 균형을 찾는 조언으로 전환해서 표현하세요.

JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사(그리고, 다만, 특히 등)로 편하게 이어서 사람이 말하듯 써주세요.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ temperature:0.9 } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

    if (!resp.ok || !reading) {
      const refundId = `tarot_refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.prepare(
        `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'tarot_refund', 0, 1, 'approved', unixepoch())`
      ).bind(refundId, email).run();
      return cors(JSON.stringify({ error: { message: '카드 해석을 생성하지 못했습니다. 토큰은 환불되었습니다.' } }), 422);
    }

    saveFeatureHistory(env, email, 'tarot', card.name, reading, { cardIndex: cardIdx, upright }).catch(() => {});

    return cors(JSON.stringify({
      success:true,
      card: { index: cardIdx, name: card.name, icon: card.icon },
      upright, reading, remaining: remainingTokens
    }), 200);
  } catch(e) {
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  띠·별자리 운세 (재미 콘텐츠, 1토큰)
// ════════════════════════════════════════════
// 인덱스는 프론트 js/constants.js의 ZODIAC_ANIMAL_NAMES/WESTERN_ZODIAC_NAMES와 순서를 맞출 것
const ZODIAC_ANIMALS_KO = ['원숭이','닭','개','돼지','쥐','소','호랑이','토끼','용','뱀','말','양'];
function _getZodiacAnimalIndex(year) {
  return ((year % 12) + 12) % 12;
}
const WESTERN_ZODIAC_KO = ['염소자리','물병자리','물고기자리','양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리','천칭자리','전갈자리','사수자리'];
function _getWesternZodiacIndex(month, day) {
  const md = month * 100 + day;
  if (md >= 1222 || md <= 119) return 0;  // 염소자리
  if (md <= 218) return 1;                // 물병자리
  if (md <= 320) return 2;                // 물고기자리
  if (md <= 419) return 3;                // 양자리
  if (md <= 520) return 4;                // 황소자리
  if (md <= 621) return 5;                // 쌍둥이자리
  if (md <= 722) return 6;                // 게자리
  if (md <= 822) return 7;                // 사자자리
  if (md <= 922) return 8;                // 처녀자리
  if (md <= 1023) return 9;               // 천칭자리
  if (md <= 1122) return 10;              // 전갈자리
  return 11;                              // 사수자리
}

async function handleZodiacFortune(request, env) {
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', birth } = await request.json().catch(() => ({}));
    const by = birth ? parseInt(birth.year, 10) : NaN;
    const bm = birth ? parseInt(birth.month, 10) : NaN;
    const bd = birth ? parseInt(birth.day, 10) : NaN;
    if (!by || !bm || !bd) {
      return cors(JSON.stringify({ error: { message: '생년월일이 필요합니다.' } }), 400);
    }

    const animalIndex = _getZodiacAnimalIndex(by);
    const animal = ZODIAC_ANIMALS_KO[animalIndex];
    const zodiacIndex = _getWesternZodiacIndex(bm, bd);
    const zodiac = WESTERN_ZODIAC_KO[zodiacIndex];
    const il = ilchin();
    const on = ON[lang] || ON.ko;

    // 1토큰 차감 (atomic INSERT — 잔액 >= 1 일 때만 삽입)
    const useId = `zodiac_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const deduct = await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       SELECT ?, ?, 'zodiac_use', 0, -1, 'approved', unixepoch()
       WHERE (SELECT COALESCE(SUM(tokens), 0) FROM payment_requests WHERE user_email = ? AND status = 'approved') >= 1`
    ).bind(useId, email, email).run();
    if (!deduct.meta?.rows_written) {
      return cors(JSON.stringify({ error: { message: '띠·별자리 운세는 토큰 1개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    const remainRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(tokens), 0) AS bal FROM payment_requests WHERE user_email = ? AND status = 'approved'`
    ).bind(email).first();
    const remainingTokens = remainRow?.bal ?? 0;

    // 실제 달의 위상을 함께 넘겨, 같은 별자리라도 날마다 해석이 달라지게 한다
    const moon = moonPhase();
    const moonName = MOON_PHASE_KO[moon.index];
    const moonPct = Math.round(moon.illumination * 100);

    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const prompt = `당신은 오늘의 기운을 친근하게 안내해주는 상담사입니다. 이 사람은 "${animal}띠"이고 서양 별자리는 "${zodiac}"입니다. 오늘의 오행 기운은 "${on[il.o]}"입니다.

[오늘 실제 하늘의 달 — 천문 계산값이니 그대로 사용하고 임의로 바꾸지 마세요]
달의 위상: ${moonName} (월령 ${moon.age.toFixed(1)}일, 밝기 약 ${moonPct}%)

띠와 별자리, 오늘의 오행 기운, 그리고 위 달의 위상을 재미있게 엮어서 ${langLabel}로 3~4문장의 짧고 유쾌한 오늘의 운세를 알려주세요. 달이 차오르는 중이면 시작·확장의 기운으로, 기우는 중이면 정리·마무리의 기운으로 자연스럽게 풀어주세요. 진지한 예언이 아니라 가볍게 웃으며 읽을 수 있는 톤으로, 마지막엔 오늘 실천하면 좋을 작은 팁 하나를 더해주세요.

JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사(그리고, 다만, 특히 등)로 편하게 이어서 사람이 말하듯 써주세요.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ temperature:0.9 } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

    if (!resp.ok || !reading) {
      const refundId = `zodiac_refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.prepare(
        `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'zodiac_refund', 0, 1, 'approved', unixepoch())`
      ).bind(refundId, email).run();
      return cors(JSON.stringify({ error: { message: '운세를 생성하지 못했습니다. 토큰은 환불되었습니다.' } }), 422);
    }

    saveFeatureHistory(env, email, 'zodiac', `${animal}띠·${zodiac}`, reading, { animalIndex, zodiacIndex }).catch(() => {});

    return cors(JSON.stringify({
      success:true, animal, animalIndex, zodiac, zodiacIndex, reading,
      moon: { index: moon.index, illumination: moonPct }, // 프론트는 index로 자국어 이름을 찾는다
      remaining: remainingTokens
    }), 200);
  } catch(e) {
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  오늘의 럭키 컬러·음식·노래 (재미 콘텐츠, 1토큰)
// ════════════════════════════════════════════
async function handleLuckyPicks(request, env) {
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko' } = await request.json().catch(() => ({}));
    const il = ilchin();
    const on = ON[lang] || ON.ko;

    // 1토큰 차감 (atomic INSERT — 잔액 >= 1 일 때만 삽입)
    const useId = `lucky_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const deduct = await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       SELECT ?, ?, 'lucky_use', 0, -1, 'approved', unixepoch()
       WHERE (SELECT COALESCE(SUM(tokens), 0) FROM payment_requests WHERE user_email = ? AND status = 'approved') >= 1`
    ).bind(useId, email, email).run();
    if (!deduct.meta?.rows_written) {
      return cors(JSON.stringify({ error: { message: '오늘의 럭키 아이템은 토큰 1개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    const remainRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(tokens), 0) AS bal FROM payment_requests WHERE user_email = ? AND status = 'approved'`
    ).bind(email).first();
    const remainingTokens = remainRow?.bal ?? 0;

    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const prompt = `당신은 오늘의 기운을 바탕으로 행운 아이템을 추천해주는 재미있는 상담사입니다. 오늘의 오행 기운은 "${on[il.o]}"입니다.

이 기운에 어울리는 오늘의 행운 아이템 3가지를 ${langLabel}로 추천해주세요. 각 항목은 이름과 짧고 유쾌한 이유(1~2문장)로 구성하세요.
1. 럭키 컬러 — 구체적인 색깔 이름
2. 럭키 음식 — 구체적인 음식 이름
3. 럭키 무드 — 음악 장르나 분위기 (실제 곡 강요보다는 무드 위주)

JSON 형식으로만 답하세요, 다른 텍스트 없이:
{"color":{"name":"...","reason":"..."},"food":{"name":"...","reason":"..."},"song":{"name":"...","reason":"..."}}`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ responseMimeType:'application/json', temperature:0.9 } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let picks;
    try { picks = JSON.parse(raw); } catch { picks = {}; }

    // 이 핸들러는 JSON 응답이라 파싱이 깨져도 picks={}로 흘러가 빈 카드 3장이 나갔다.
    // 세 항목 중 하나도 이름이 없으면 실패로 보고 환불한다.
    const hasPick = !!(picks?.color?.name || picks?.food?.name || picks?.song?.name);
    if (!resp.ok || !hasPick) {
      const refundId = `lucky_refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.prepare(
        `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'lucky_refund', 0, 1, 'approved', unixepoch())`
      ).bind(refundId, email).run();
      return cors(JSON.stringify({ error: { message: '행운 아이템을 생성하지 못했습니다. 토큰은 환불되었습니다.' } }), 422);
    }

    saveFeatureHistory(env, email, 'lucky', null, JSON.stringify(picks), null).catch(() => {});

    return cors(JSON.stringify({ success:true, picks, remaining: remainingTokens }), 200);
  } catch(e) {
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  오행 유형 궁합 테스트 (재미 콘텐츠, 1토큰)
//  유형 판정(퀴즈)은 프론트에서 무료로 처리, 궁합 해석만 여기서 1토큰
// ════════════════════════════════════════════
const TYPE_ELEMENTS = ['木','火','土','金','水'];

async function handleTypeCompat(request, env) {
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', myType, partnerType } = await request.json().catch(() => ({}));
    if (!TYPE_ELEMENTS.includes(myType) || !TYPE_ELEMENTS.includes(partnerType)) {
      return cors(JSON.stringify({ error: { message: '올바르지 않은 유형입니다.' } }), 400);
    }

    // 1토큰 차감 (atomic INSERT — 잔액 >= 1 일 때만 삽입)
    const useId = `typecompat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const deduct = await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       SELECT ?, ?, 'typecompat_use', 0, -1, 'approved', unixepoch()
       WHERE (SELECT COALESCE(SUM(tokens), 0) FROM payment_requests WHERE user_email = ? AND status = 'approved') >= 1`
    ).bind(useId, email, email).run();
    if (!deduct.meta?.rows_written) {
      return cors(JSON.stringify({ error: { message: '궁합 보기는 토큰 1개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    const remainRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(tokens), 0) AS bal FROM payment_requests WHERE user_email = ? AND status = 'approved'`
    ).bind(email).first();
    const remainingTokens = remainRow?.bal ?? 0;

    const on = ON[lang] || ON.ko;
    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const prompt = `당신은 재미있는 궁합 상담사입니다. 오행 성격 유형 테스트에서 한 사람은 "${on[myType]}" 유형, 다른 사람은 "${on[partnerType]}" 유형이 나왔습니다.

두 유형의 궁합을 ${langLabel}로 3~4문장, 가볍고 유쾌하게 풀어주세요. 두 사람이 함께하면 어떤 케미가 나는지, 서로에게 좋은 점이나 함께 하면 좋을 활동을 재미있게 알려주세요. 안 맞는 조합처럼 보여도 유쾌하게 표현하세요(예: "티격태격하지만 그게 매력!").

JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사(그리고, 다만, 특히 등)로 편하게 이어서 사람이 말하듯 써주세요.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ temperature:0.9 } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

    if (!resp.ok || !reading) {
      const refundId = `typecompat_refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.prepare(
        `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'typecompat_refund', 0, 1, 'approved', unixepoch())`
      ).bind(refundId, email).run();
      return cors(JSON.stringify({ error: { message: '궁합 해석을 생성하지 못했습니다. 토큰은 환불되었습니다.' } }), 422);
    }

    saveFeatureHistory(env, email, 'typecompat', `${on[myType]}×${on[partnerType]}`, reading, { myType, partnerType }).catch(() => {});

    return cors(JSON.stringify({ success:true, myType, partnerType, reading, remaining: remainingTokens }), 200);
  } catch(e) {
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  오늘의 운세 모음 (재미 콘텐츠, 1토큰)
//  짝사랑 / 관계 신뢰 / 가족 / 미래 / 학업 / 성격 / 인상 / 성공
//  key는 프론트 js/constants.js의 FORTUNE_TOPICS와 순서를 맞출 것
//  ※ '외도'는 관계 신뢰 기운으로 순화 — 단정적 의심/예언 대신 신뢰를 키우는 방향으로 안내(브랜드 원칙 준수)
// ════════════════════════════════════════════
const FORTUNE_TOPICS = {
  crush:       { icon:'💌', title:'짝사랑운',      guide:'짝사랑 중인 상대와의 오늘 기운 흐름, 다가가기 좋은 타이밍이나 자연스러운 방법' },
  trust:       { icon:'🕊️', title:'관계 신뢰 기운', guide:'연인·배우자와의 신뢰와 소통 기운. 오늘 관계를 더 단단하게 만들 수 있는 대화나 행동 — 의심이나 단정적 예언이 아니라 신뢰를 키우는 방향으로' },
  family:      { icon:'👪', title:'가족운',        guide:'가족과의 관계에서 오늘 신경 쓰면 좋을 점과 화목을 다지는 작은 실천' },
  future:      { icon:'🌠', title:'미래운',        guide:'앞으로 다가올 흐름 중 지금부터 준비해두면 좋을 것 — 막연한 예언이 아니라 구체적인 준비 팁' },
  grades:      { icon:'📚', title:'학업·성적운',   guide:'공부·시험·자기계발과 관련해 오늘 집중하면 좋을 점' },
  personality: { icon:'🎭', title:'성격 분석',     guide:'사주에 드러난 성격의 강점과 스스로 다듬으면 좋을 부분' },
  appearance:  { icon:'💫', title:'인상·이미지운', guide:'오늘 좋은 인상을 주는 데 도움이 되는 스타일링이나 태도 팁' },
  success:     { icon:'🚀', title:'성공운',        guide:'목표 달성과 성공을 위해 오늘 취하면 좋을 태도나 행동' },
};

async function handleFortuneTopic(request, env) {
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', topic, birth } = await request.json().catch(() => ({}));
    const t = FORTUNE_TOPICS[topic];
    if (!t) return cors(JSON.stringify({ error: { message: '올바르지 않은 주제입니다.' } }), 400);

    // 1토큰 차감 (atomic INSERT — 잔액 >= 1 일 때만 삽입)
    const useId = `fortune_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const deduct = await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       SELECT ?, ?, 'fortune_use', 0, -1, 'approved', unixepoch()
       WHERE (SELECT COALESCE(SUM(tokens), 0) FROM payment_requests WHERE user_email = ? AND status = 'approved') >= 1`
    ).bind(useId, email, email).run();
    if (!deduct.meta?.rows_written) {
      return cors(JSON.stringify({ error: { message: `${t.title}은(는) 토큰 1개가 필요합니다. 잔액을 확인해 주세요.` } }), 402);
    }
    const remainRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(tokens), 0) AS bal FROM payment_requests WHERE user_email = ? AND status = 'approved'`
    ).bind(email).first();
    const remainingTokens = remainRow?.bal ?? 0;

    const il = ilchin();
    const on = ON[lang] || ON.ko;
    const saju = (birth && birth.year) ? computeSaju(birth.year, birth.month, birth.day, birth.hour) : null;
    const sajuBlock = saju
      ? `\n\n[이 사람의 사주 원국 — 서버에서 만세력으로 계산한 확정값. 절대 재계산·추측하지 말고 이 값만 사용]\n${saju.text}\n이 사주의 일간(본질)과 오행 분포를 반영해 개인 맞춤으로 풀어주세요.`
      : '';

    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const prompt = `당신은 오늘의 기운을 친근하게 안내해주는 상담사입니다. 오늘의 오행 기운은 "${on[il.o]}"입니다.${sajuBlock}

다음 주제에 대해서만 ${langLabel}로 3~5문장, 따뜻하고 친근한 말투로 조언해주세요. 딱딱한 단정적 예언이 아니라 오늘 실천할 수 있는 구체적인 태도나 행동으로 풀어주세요. 부정적으로 보일 수 있는 부분도 균형을 찾는 조언으로 전환해서 표현하세요. "바람을 피운다/피우지 않는다", "성공한다/못한다"처럼 단정하지 말고, 항상 본인이 취할 수 있는 태도와 행동 중심으로 안내하세요.
주제: ${t.icon} ${t.title} — ${t.guide}

중요: 한자나 어려운 사주 용어를 쓸 경우 반드시 바로 옆에 괄호로 뜻을 써주세요.

JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사(그리고, 다만, 특히 등)로 편하게 이어서 사람이 말하듯 써주세요.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ temperature:0.85 } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

    if (!resp.ok || !reading) {
      const refundId = `fortune_refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.prepare(
        `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'fortune_refund', 0, 1, 'approved', unixepoch())`
      ).bind(refundId, email).run();
      return cors(JSON.stringify({ error: { message: '풀이를 생성하지 못했습니다. 토큰은 환불되었습니다.' } }), 422);
    }

    saveFeatureHistory(env, email, 'fortune', t.title, reading, { topic }).catch(() => {});

    return cors(JSON.stringify({ success:true, topic, title: t.title, icon: t.icon, reading, remaining: remainingTokens }), 200);
  } catch(e) {
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  주역(周易) 괘 풀이 — 재미 콘텐츠, 1토큰
//  전통 삼전법(三錢法, 동전 3개 던지기) 그대로 구현: 효 하나당 동전 3개 합(6~9)으로
//  노음(6,변효)/소양(7)/소음(8)/노양(9,변효) 결정 — 실제 확률적 무작위성은 서버에서 생성.
//  64괘 이름 매칭·해석은 AI에 위임(64괘 이름은 안정적인 공개 고전 지식이라 사주 만세력처럼
//  정밀 계산이 필요한 영역이 아님 — 상/하괘 정보를 명시해 정확도를 높임)
// ════════════════════════════════════════════
function _ichingLine() {
  // 동전 앞(3)/뒤(2) 3개 합: 6=노음(변), 7=소양, 8=소음, 9=노양(변)
  const sum = [0,0,0].reduce(s => s + (Math.random() < 0.5 ? 2 : 3), 0);
  const yang = (sum === 7 || sum === 9);
  const changing = (sum === 6 || sum === 9);
  return { sum, yang, changing };
}

async function handleIching(request, env) {
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', question = '' } = await request.json().catch(() => ({}));
    const cleanQuestion = String(question || '').trim().slice(0, 200);

    // 1토큰 차감 (atomic INSERT)
    const useId = `iching_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const deduct = await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       SELECT ?, ?, 'iching_use', 0, -1, 'approved', unixepoch()
       WHERE (SELECT COALESCE(SUM(tokens), 0) FROM payment_requests WHERE user_email = ? AND status = 'approved') >= 1`
    ).bind(useId, email, email).run();
    if (!deduct.meta?.rows_written) {
      return cors(JSON.stringify({ error: { message: '주역 괘 풀이는 토큰 1개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    const remainRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(tokens), 0) AS bal FROM payment_requests WHERE user_email = ? AND status = 'approved'`
    ).bind(email).first();
    const remainingTokens = remainRow?.bal ?? 0;

    // 6효 생성 (아래→위)
    const lines = Array.from({ length: 6 }, () => _ichingLine());
    const linesText = lines.map((l, i) => `${i+1}효(아래서 ${i+1}번째): ${l.yang ? '양(--- 실선)' : '음(- - 끊긴선)'}${l.changing ? ' — 변효' : ''}`).join('\n');
    const hasChanging = lines.some(l => l.changing);

    const il = ilchin();
    const on = ON[lang] || ON.ko;
    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const prompt = `당신은 주역(周易) 점을 봐주는 상담사입니다. 삼전법(동전 던지기)으로 아래 6효가 나왔습니다(아래에서 위 순서):
${linesText}

${cleanQuestion ? `질문: "${cleanQuestion}"` : '특정 질문 없이 오늘의 흐름을 물었습니다.'}
오늘의 오행 기운은 "${on[il.o]}"입니다.

1) 이 6효로 만들어지는 본괘(本卦)의 정식 64괘 이름(한자+한글 독음)을 정확히 밝혀주세요.
2) 변효가 있다면 변효를 반영한 지괘(之卦) 이름도 함께 밝혀주세요.
3) 괘의 상징을 바탕으로 ${langLabel}로 4~6문장, 질문(또는 오늘의 흐름)에 대해 따뜻하고 구체적인 해석과 실천 조언을 주세요. 단정적 예언이 아니라 태도와 행동 중심으로 안내하세요.

중요: 한자를 쓸 경우 바로 옆에 괄호로 한글 독음과 뜻을 써주세요. JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사(그리고, 다만, 특히 등)로 편하게 이어서 사람이 말하듯 써주세요.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ temperature:0.8 } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

    if (!resp.ok || !reading) {
      const refundId = `iching_refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.prepare(
        `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'iching_refund', 0, 1, 'approved', unixepoch())`
      ).bind(refundId, email).run();
      return cors(JSON.stringify({ error: { message: '괘 풀이를 생성하지 못했습니다. 토큰은 환불되었습니다.' } }), 422);
    }

    saveFeatureHistory(env, email, 'iching', null, reading, { lines: lines.map(l => ({ yang:l.yang, changing:l.changing })), hasChanging, question: cleanQuestion || null }).catch(() => {});

    return cors(JSON.stringify({
      success:true,
      lines: lines.map(l => ({ yang:l.yang, changing:l.changing })),
      reading, remaining: remainingTokens
    }), 200);
  } catch(e) {
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  수비학(數秘學) 라이프패스 넘버 — 재미 콘텐츠, 1토큰
//  생년월일 전체 자릿수를 합산해 한 자리로 축약(11/22/33 마스터 넘버는 축약하지 않음) —
//  100% 결정론적 계산이라 서버에서 직접 산출(AI는 해석만, 재계산 금지)
// ════════════════════════════════════════════
function _lifePathNumber(year, month, day) {
  const digits = `${year}${month}${day}`.split('').map(Number);
  let sum = digits.reduce((a,b) => a+b, 0);
  while (sum > 9 && sum !== 11 && sum !== 22 && sum !== 33) {
    sum = String(sum).split('').map(Number).reduce((a,b) => a+b, 0);
  }
  return sum;
}

async function handleNumerology(request, env) {
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', birth } = await request.json().catch(() => ({}));
    const by = birth ? parseInt(birth.year, 10) : NaN;
    const bm = birth ? parseInt(birth.month, 10) : NaN;
    const bd = birth ? parseInt(birth.day, 10) : NaN;
    if (!by || !bm || !bd) {
      return cors(JSON.stringify({ error: { message: '생년월일이 필요합니다.' } }), 400);
    }

    // 1토큰 차감 (atomic INSERT)
    const useId = `numerology_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const deduct = await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       SELECT ?, ?, 'numerology_use', 0, -1, 'approved', unixepoch()
       WHERE (SELECT COALESCE(SUM(tokens), 0) FROM payment_requests WHERE user_email = ? AND status = 'approved') >= 1`
    ).bind(useId, email, email).run();
    if (!deduct.meta?.rows_written) {
      return cors(JSON.stringify({ error: { message: '수비학 풀이는 토큰 1개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    const remainRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(tokens), 0) AS bal FROM payment_requests WHERE user_email = ? AND status = 'approved'`
    ).bind(email).first();
    const remainingTokens = remainRow?.bal ?? 0;

    const lifePath = _lifePathNumber(by, bm, bd);
    const il = ilchin();
    const on = ON[lang] || ON.ko;
    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const prompt = `당신은 서양 수비학(numerology) 상담사입니다. 이 사람의 생년월일로 계산한 라이프패스 넘버(Life Path Number)는 정확히 "${lifePath}"입니다(이 숫자는 이미 정확히 계산된 확정값이니 재계산하지 마세요).

오늘의 오행 기운은 "${on[il.o]}"입니다.

라이프패스 넘버 ${lifePath}의 전통적인 수비학적 의미(성격·강점·인생 방향)를 ${langLabel}로 설명하고, 오늘의 기운과 엮어서 4~6문장으로 따뜻하고 구체적인 조언을 주세요. 단정적 예언이 아니라 태도와 행동 중심으로 안내하세요.

JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사(그리고, 다만, 특히 등)로 편하게 이어서 사람이 말하듯 써주세요.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ temperature:0.8 } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

    if (!resp.ok || !reading) {
      const refundId = `numerology_refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.prepare(
        `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'numerology_refund', 0, 1, 'approved', unixepoch())`
      ).bind(refundId, email).run();
      return cors(JSON.stringify({ error: { message: '수비학 풀이를 생성하지 못했습니다. 토큰은 환불되었습니다.' } }), 422);
    }

    saveFeatureHistory(env, email, 'numerology', `${lifePath}`, reading, { lifePath }).catch(() => {});

    return cors(JSON.stringify({ success:true, lifePath, reading, remaining: remainingTokens }), 200);
  } catch(e) {
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  토정비결풍 신년운세 — 재미 콘텐츠, 2토큰
//  ※ 정통 토정비결의 원문 괘사(고전 텍스트)는 신뢰성 있게 재현할 방법이 없어 그대로 인용하지
//  않음. 대신 서버가 계산한 정확한 사주 원국을 바탕으로 "그 해 신수를 총운·재물·애정·건강별로
//  짚어보는" 전통 신년운세의 정신을 살려 AI가 생성 — 정통 원문의 대체가 아님을 프론트에 안내.
// ════════════════════════════════════════════
async function handleTojeong(request, env) {
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', birth } = await request.json().catch(() => ({}));
    if (!birth || !birth.year) {
      return cors(JSON.stringify({ error: { message: '생년월일이 필요합니다.' } }), 400);
    }
    const saju = computeSaju(birth.year, birth.month, birth.day, birth.hour);
    if (!saju) return cors(JSON.stringify({ error: { message: '사주 계산에 실패했습니다.' } }), 400);

    // 2토큰 차감 (atomic INSERT — 정식 상세풀이와 동일한 무게)
    const useId = `tojeong_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const deduct = await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       SELECT ?, ?, 'tojeong_use', 0, -2, 'approved', unixepoch()
       WHERE (SELECT COALESCE(SUM(tokens), 0) FROM payment_requests WHERE user_email = ? AND status = 'approved') >= 2`
    ).bind(useId, email, email).run();
    if (!deduct.meta?.rows_written) {
      return cors(JSON.stringify({ error: { message: '토정비결풍 신년운세는 토큰 2개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    const remainRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(tokens), 0) AS bal FROM payment_requests WHERE user_email = ? AND status = 'approved'`
    ).bind(email).first();
    const remainingTokens = remainRow?.bal ?? 0;

    const thisYear = new Date().getFullYear();
    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const sajuBlock = `\n\n[이 사람의 사주 원국 — 서버에서 만세력으로 계산한 확정값. 절대 재계산·추측하지 말고 이 값만 사용]\n${saju.text}`;
    const prompt = `당신은 토정비결(土亭祕訣)의 정신을 이어받아 신년운세를 봐주는 상담사입니다. 정통 토정비결 원문을 그대로 인용하지는 말고, 아래 사주를 바탕으로 ${thisYear}년 한 해의 신수를 봐주세요.${sajuBlock}

${langLabel}로 아래 4개 섹션을 각각 2~3문장씩 작성하세요(섹션 제목도 포함):
1. 총운 — 올 한 해 전체 흐름
2. 재물운 — 돈과 관련해 주의할 점과 기회
3. 애정·인간관계운 — 사람들과의 관계에서 신경 쓰면 좋을 점
4. 건강운 — 몸과 마음을 챙기는 방법

단정적 예언이 아니라 태도와 행동 중심으로, 따뜻하고 희망적인 톤으로 안내하세요. 한자나 어려운 사주 용어는 바로 옆에 괄호로 뜻을 써주세요.

JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요(섹션 제목은 줄바꿈으로 구분). 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사(그리고, 다만, 특히 등)로 편하게 이어서 사람이 말하듯 써주세요.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ temperature:0.8, maxOutputTokens: 4096, thinkingConfig:{ thinkingBudget: 0 } } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

    if (!resp.ok || !reading) {
      const refundId = `tojeong_refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.prepare(
        `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'tojeong_refund', 0, 2, 'approved', unixepoch())`
      ).bind(refundId, email).run();
      return cors(JSON.stringify({ error: { message: '신년운세를 생성하지 못했습니다. 토큰은 환불되었습니다.' } }), 422);
    }

    saveFeatureHistory(env, email, 'tojeong', `${thisYear}`, reading, { year: thisYear }).catch(() => {});

    return cors(JSON.stringify({ success:true, year: thisYear, reading, remaining: remainingTokens }), 200);
  } catch(e) {
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  관상·손금 사진 분석 (재미 콘텐츠, 2토큰)
//  사용자가 올린 얼굴/손 사진을 Gemini Vision으로 분석. 저장을 원한다고 명시적으로
//  확인했으므로 photo_readings 테이블에 이미지·결과를 저장해 마이페이지에서 다시 볼 수 있게 함.
// ════════════════════════════════════════════
const MAX_PHOTO_B64_LEN = 900000; // 대략 base64 ~900KB(원본 이미지 약 650KB) — 클라이언트에서 리사이즈 후 전송 전제

async function handlePhotoReading(request, env) {
  try {
    // 본문 크기 선행 체크 (base64 인코딩 오버헤드 감안, 약 1.3MB까지만 허용)
    const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (contentLength > 1300000) {
      return cors(JSON.stringify({ error: { message: '사진 용량이 너무 큽니다. 더 작은 사진으로 다시 시도해 주세요.' } }), 413);
    }

    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', type, image } = await request.json().catch(() => ({}));
    if (type !== 'face' && type !== 'palm') {
      return cors(JSON.stringify({ error: { message: '올바르지 않은 분석 종류입니다.' } }), 400);
    }
    if (!image || typeof image !== 'string') {
      return cors(JSON.stringify({ error: { message: '사진이 필요합니다.' } }), 400);
    }
    // data URL 접두사(data:image/jpeg;base64,) 제거
    const b64 = image.replace(/^data:image\/\w+;base64,/, '');
    if (b64.length > MAX_PHOTO_B64_LEN) {
      return cors(JSON.stringify({ error: { message: '사진 용량이 너무 큽니다. 더 작은 사진으로 다시 시도해 주세요.' } }), 413);
    }

    // 2토큰 차감 (atomic INSERT)
    const useId = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const deduct = await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       SELECT ?, ?, 'photo_reading_use', 0, -2, 'approved', unixepoch()
       WHERE (SELECT COALESCE(SUM(tokens), 0) FROM payment_requests WHERE user_email = ? AND status = 'approved') >= 2`
    ).bind(useId, email, email).run();
    if (!deduct.meta?.rows_written) {
      return cors(JSON.stringify({ error: { message: (type==='face'?'관상':'손금') + ' 풀이는 토큰 2개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    const remainRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(tokens), 0) AS bal FROM payment_requests WHERE user_email = ? AND status = 'approved'`
    ).bind(email).first();
    const remainingTokens = remainRow?.bal ?? 0;

    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const guide = type === 'face'
      ? '이마·눈썹·눈·코·입·턱 등 전통 관상학(觀相學)의 요소를 바탕으로 성격의 강점과 살면 좋을 방향을 해석'
      : '생명선·감정선·두뇌선 등 전통 손금(手相)의 요소를 바탕으로 성격의 강점과 살면 좋을 방향을 해석';
    const prompt = `당신은 따뜻하고 신중한 ${type==='face'?'관상':'손금'} 상담사입니다. 첨부된 사진을 보고 ${guide}해주세요.

${langLabel}로 5~7문장, 친근하고 희망적인 톤으로 작성하세요.

매우 중요한 규칙:
- 나이·인종·성별 추측이나 외모 평가(잘생김/못생김 등)는 절대 하지 마세요. 전통 상학(相學)의 상징적 해석에만 집중하세요.
- 건강·질병에 대한 의학적 진단이나 단정은 절대 하지 마세요.
- "단명한다", "불행하다" 같은 단정적·부정적 예언은 하지 말고, 모든 해석을 태도와 행동으로 바꿀 수 있는 조언으로 표현하세요.
- 사진 속 인물을 특정하거나 개인정보를 추측하지 마세요.
- 사진에 얼굴(또는 손)이 명확히 보이지 않으면, 억지로 해석하지 말고 다시 촬영을 요청하는 안내만 해주세요.

JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사(그리고, 다만, 특히 등)로 편하게 이어서 사람이 말하듯 써주세요.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          contents:[{ parts:[
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: b64 } }
          ]}],
          generationConfig:{ temperature:0.7 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
          ],
        }) }
    );
    // Gemini 응답 파싱 — 형식이 예상과 다르거나(JSON 아님 등) 실패해도 아래에서 안전하게 처리
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

    if (!resp.ok || !reading) {
      // API 오류 또는 세이프티 필터 등으로 응답이 비면 토큰 환불
      const refundId = `photo_refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.prepare(
        `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'photo_reading_refund', 0, 2, 'approved', unixepoch())`
      ).bind(refundId, email).run();
      return cors(JSON.stringify({ error: { message: '사진을 분석하지 못했습니다. 다른 사진으로 다시 시도해 주세요. 토큰은 환불되었습니다.' } }), 422);
    }

    // 저장 (마이페이지에서 다시 볼 수 있도록 이미지 + 결과 보관) — 용량 관리를 위해 사용자당 최대 20개만 유지
    // 저장에 실패해도(용량/일시 오류 등) 이미 생성된 풀이는 그대로 사용자에게 돌려줌 — 결제·생성은 이미 끝난 뒤이므로
    let readingId = null;
    try {
      const insertResult = await env.DB.prepare(
        `INSERT INTO photo_readings (user_email, type, image_b64, reading) VALUES (?, ?, ?, ?)`
      ).bind(email, type, b64, reading).run();
      readingId = insertResult.meta?.last_row_id ?? null;
      env.DB.prepare(
        `SELECT id FROM photo_readings WHERE user_email = ? ORDER BY created_at DESC LIMIT 1 OFFSET 20`
      ).bind(email).all().then(({ results }) => {
        if (results && results.length > 0) {
          return env.DB.prepare(`DELETE FROM photo_readings WHERE user_email = ? AND id < ?`).bind(email, results[0].id).run();
        }
      }).catch(() => {});
    } catch (e) {
      console.error('[PHOTO READING SAVE]', e);
    }

    return cors(JSON.stringify({ success:true, id: readingId, type, reading, remaining: remainingTokens }), 200);
  } catch(e) {
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// 저장된 관상·손금 기록 조회 (최신순, 페이징) — 마이페이지 갤러리용
async function handleGetPhotoReadings(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return cors(JSON.stringify({ error: { message: '인증이 필요합니다.' } }), 401);
  }
  const idToken = authHeader.slice(7);
  const email = await getEmailFromToken(idToken, env);
  if (!email) {
    return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 30);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  try {
    const { results } = await env.DB.prepare(`
      SELECT id, type, image_b64, reading, created_at
      FROM photo_readings
      WHERE user_email = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(email, limit, offset).all();

    const items = results.map(row => ({
      id: row.id, type: row.type, image: row.image_b64, reading: row.reading, createdAt: row.created_at,
    }));

    return cors(JSON.stringify({ ok: true, items, count: items.length }), 200);
  } catch (e) {
    return cors(JSON.stringify({ error: { message: '기록 조회에 실패했습니다.' } }), 500);
  }
}

// 저장된 관상·손금 기록 삭제 (사진은 민감정보이므로 사용자가 직접 지울 수 있게)
async function handleDeletePhotoReading(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return cors(JSON.stringify({ error: { message: '인증이 필요합니다.' } }), 401);
  }
  const idToken = authHeader.slice(7);
  const email = await getEmailFromToken(idToken, env);
  if (!email) {
    return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);
  }
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return cors(JSON.stringify({ error: { message: 'id가 필요합니다.' } }), 400);

  try {
    await env.DB.prepare(`DELETE FROM photo_readings WHERE id = ? AND user_email = ?`).bind(id, email).run();
    return cors(JSON.stringify({ ok: true }), 200);
  } catch (e) {
    return cors(JSON.stringify({ error: { message: '삭제에 실패했습니다.' } }), 500);
  }
}

// ════════════════════════════════════════════
//  꿈해몽 (재미 콘텐츠, 1토큰)
// ════════════════════════════════════════════
async function handleDreamInterpretation(request, env) {
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', dream } = await request.json().catch(() => ({}));
    const cleanDream = String(dream || '').trim().slice(0, 500);
    if (!cleanDream) return cors(JSON.stringify({ error: { message: '꿈 내용을 입력해 주세요.' } }), 400);

    // 1토큰 차감 (atomic INSERT)
    const useId = `dream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const deduct = await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       SELECT ?, ?, 'dream_use', 0, -1, 'approved', unixepoch()
       WHERE (SELECT COALESCE(SUM(tokens), 0) FROM payment_requests WHERE user_email = ? AND status = 'approved') >= 1`
    ).bind(useId, email, email).run();
    if (!deduct.meta?.rows_written) {
      return cors(JSON.stringify({ error: { message: '꿈해몽은 토큰 1개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    const remainRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(tokens), 0) AS bal FROM payment_requests WHERE user_email = ? AND status = 'approved'`
    ).bind(email).first();
    const remainingTokens = remainRow?.bal ?? 0;

    const il = ilchin();
    const on = ON[lang] || ON.ko;
    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const prompt = `당신은 따뜻하고 통찰력 있는 꿈해몽 상담사입니다. 다음 꿈 내용을 해몽해주세요: "${cleanDream}"

오늘의 오행 기운은 "${on[il.o]}"입니다.

${langLabel}로 4~6문장, 꿈에 나온 상징들의 전통적인 해몽 의미를 오늘의 기운과 엮어서 따뜻하고 희망적으로 풀어주세요. 단정적 예언이 아니라 태도와 행동으로 연결되는 조언으로 마무리하세요.

JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사(그리고, 다만, 특히 등)로 편하게 이어서 사람이 말하듯 써주세요.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ temperature:0.85 } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

    if (!resp.ok || !reading) {
      const refundId = `dream_refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.prepare(
        `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'dream_refund', 0, 1, 'approved', unixepoch())`
      ).bind(refundId, email).run();
      return cors(JSON.stringify({ error: { message: '해몽하지 못했습니다. 토큰은 환불되었습니다.' } }), 422);
    }

    saveFeatureHistory(env, email, 'dream', cleanDream.slice(0, 30), reading, { dream: cleanDream }).catch(() => {});

    return cors(JSON.stringify({ success:true, reading, remaining: remainingTokens }), 200);
  } catch(e) {
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  오늘의 로또번호 추천 (재미 콘텐츠, 1토큰)
//  숫자 자체는 서버에서 진짜 무작위로 뽑음(AI는 재계산·해석만) — 참고용 오락 콘텐츠
// ════════════════════════════════════════════
function _lottoNumbers() {
  const nums = new Set();
  while (nums.size < 6) nums.add(1 + Math.floor(Math.random() * 45));
  return [...nums].sort((a, b) => a - b);
}

async function handleLottoNumbers(request, env) {
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko' } = await request.json().catch(() => ({}));

    // 1토큰 차감 (atomic INSERT)
    const useId = `lotto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const deduct = await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       SELECT ?, ?, 'lotto_use', 0, -1, 'approved', unixepoch()
       WHERE (SELECT COALESCE(SUM(tokens), 0) FROM payment_requests WHERE user_email = ? AND status = 'approved') >= 1`
    ).bind(useId, email, email).run();
    if (!deduct.meta?.rows_written) {
      return cors(JSON.stringify({ error: { message: '오늘의 로또번호는 토큰 1개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    const remainRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(tokens), 0) AS bal FROM payment_requests WHERE user_email = ? AND status = 'approved'`
    ).bind(email).first();
    const remainingTokens = remainRow?.bal ?? 0;

    const numbers = _lottoNumbers();
    const il = ilchin();
    const on = ON[lang] || ON.ko;
    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const prompt = `당신은 오늘의 기운을 바탕으로 행운 번호에 재미있는 의미를 붙여주는 상담사입니다. 오늘 뽑힌 번호는 ${numbers.join(', ')}이고, 오늘의 오행 기운은 "${on[il.o]}"입니다.

이 번호들과 오늘의 기운을 재미있게 엮어서 ${langLabel}로 2~3문장, 가볍고 유쾌한 코멘트를 해주세요. 당첨을 보장하거나 확신을 주는 표현은 절대 쓰지 말고, 어디까지나 재미로 보는 참고용이라는 톤을 유지하세요.

JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사(그리고, 다만, 특히 등)로 편하게 이어서 사람이 말하듯 써주세요.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ temperature:0.9 } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

    if (!resp.ok || !reading) {
      const refundId = `lotto_refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.prepare(
        `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'lotto_refund', 0, 1, 'approved', unixepoch())`
      ).bind(refundId, email).run();
      return cors(JSON.stringify({ error: { message: '코멘트를 생성하지 못했습니다. 토큰은 환불되었습니다.' } }), 422);
    }

    saveFeatureHistory(env, email, 'lotto', numbers.join(', '), reading, { numbers }).catch(() => {});

    return cors(JSON.stringify({ success:true, numbers, reading, remaining: remainingTokens }), 200);
  } catch(e) {
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  룬 문자 점 (재미 콘텐츠, 1토큰) — 엘더 푸타르크 24개 룬
// ════════════════════════════════════════════
const RUNE_NAMES = [
  { en:'Fehu',     ko:'페후' },   { en:'Uruz',     ko:'우루즈' },
  { en:'Thurisaz', ko:'수리사즈' }, { en:'Ansuz',    ko:'안수즈' },
  { en:'Raidho',   ko:'라이도' },  { en:'Kenaz',    ko:'케나즈' },
  { en:'Gebo',     ko:'게보' },   { en:'Wunjo',    ko:'운요' },
  { en:'Hagalaz',  ko:'하갈라즈' }, { en:'Nauthiz',  ko:'나우디즈' },
  { en:'Isa',      ko:'이사' },   { en:'Jera',     ko:'예라' },
  { en:'Eihwaz',   ko:'에이와즈' }, { en:'Perthro',  ko:'페르쏘' },
  { en:'Algiz',    ko:'알기즈' },  { en:'Sowilo',   ko:'소윌로' },
  { en:'Tiwaz',    ko:'티와즈' },  { en:'Berkano',  ko:'베르카노' },
  { en:'Ehwaz',    ko:'에와즈' },  { en:'Mannaz',   ko:'만나즈' },
  { en:'Laguz',    ko:'라구즈' },  { en:'Ingwaz',   ko:'잉와즈' },
  { en:'Dagaz',    ko:'다가즈' },  { en:'Othala',   ko:'오달라' },
];

async function handleRuneReading(request, env) {
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko' } = await request.json().catch(() => ({}));

    // 1토큰 차감 (atomic INSERT)
    const useId = `rune_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const deduct = await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       SELECT ?, ?, 'rune_use', 0, -1, 'approved', unixepoch()
       WHERE (SELECT COALESCE(SUM(tokens), 0) FROM payment_requests WHERE user_email = ? AND status = 'approved') >= 1`
    ).bind(useId, email, email).run();
    if (!deduct.meta?.rows_written) {
      return cors(JSON.stringify({ error: { message: '룬 문자 점은 토큰 1개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    const remainRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(tokens), 0) AS bal FROM payment_requests WHERE user_email = ? AND status = 'approved'`
    ).bind(email).first();
    const remainingTokens = remainRow?.bal ?? 0;

    const idx = Math.floor(Math.random() * RUNE_NAMES.length);
    const rune = RUNE_NAMES[idx];
    const upright = Math.random() < 0.7;

    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const prompt = `당신은 룬 문자(Rune) 점을 봐주는 상담사입니다. 오늘 뽑힌 룬은 "${rune.en}(${rune.ko})" — ${upright ? '정방향' : '역방향'}입니다.

이 룬이 오늘 하루에 어떤 의미인지 ${langLabel}로 3~4문장, 따뜻하고 신비로운 톤으로 해석해주세요. 딱딱한 예언이 아니라 오늘 하루를 대하는 마음가짐이나 작은 실천 팁으로 풀어주세요. 역방향이거나 다소 무거운 룬이어도 균형을 찾는 조언으로 전환해서 표현하세요.

JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사(그리고, 다만, 특히 등)로 편하게 이어서 사람이 말하듯 써주세요.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ temperature:0.9 } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

    if (!resp.ok || !reading) {
      const refundId = `rune_refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.prepare(
        `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'rune_refund', 0, 1, 'approved', unixepoch())`
      ).bind(refundId, email).run();
      return cors(JSON.stringify({ error: { message: '룬 해석을 생성하지 못했습니다. 토큰은 환불되었습니다.' } }), 422);
    }

    saveFeatureHistory(env, email, 'rune', `${rune.en}(${rune.ko})`, reading, { index: idx, upright }).catch(() => {});

    return cors(JSON.stringify({ success:true, index: idx, name: rune.en, nameKo: rune.ko, upright, reading, remaining: remainingTokens }), 200);
  } catch(e) {
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════
//  Web Push 유틸
// ════════════════════════════
function _b64url(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function _vapidJwt(env, endpoint) {
  const aud = new URL(endpoint).origin;
  const now = Math.floor(Date.now()/1000);
  const header = _b64url(new TextEncoder().encode(JSON.stringify({alg:'ES256',typ:'JWT'})));
  const payload = _b64url(new TextEncoder().encode(JSON.stringify({
    aud, exp: now+3600, sub:`mailto:${env.VAPID_EMAIL||'push@myan.app'}`
  })));
  const msg = `${header}.${payload}`;
  const rawKey = atob(env.VAPID_PRIVATE_KEY.replace(/-/g,'+').replace(/_/g,'/'));
  const keyBytes = Uint8Array.from(rawKey, c=>c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBytes, {name:'ECDSA',namedCurve:'P-256'}, false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    {name:'ECDSA',hash:'SHA-256'}, cryptoKey, new TextEncoder().encode(msg)
  );
  return `${msg}.${_b64url(sig)}`;
}

function _endpointId(endpoint) {
  return _b64url(new TextEncoder().encode(endpoint)).slice(0,64);
}

async function handlePushVapidKey(env) {
  return cors(JSON.stringify({ publicKey: env.VAPID_PUBLIC_KEY || '' }), 200);
}

async function handlePushSubscribe(request, env) {
  try {
    const { subscription, lang='ko' } = await request.json().catch(()=>({}));
    if (!subscription?.endpoint) return cors(JSON.stringify({error:{message:'subscription 필수'}}),400);
    const id = _endpointId(subscription.endpoint);
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (id,endpoint,p256dh,auth,lang)
       VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET endpoint=excluded.endpoint,
       p256dh=excluded.p256dh,auth=excluded.auth,lang=excluded.lang`
    ).bind(id, subscription.endpoint, subscription.keys?.p256dh||'', subscription.keys?.auth||'', lang).run();
    return cors(JSON.stringify({success:true}),200);
  } catch(e) {
    return cors(JSON.stringify({error:{message:e.message}}),500);
  }
}

async function handlePushUnsubscribe(request, env) {
  try {
    const { endpoint } = await request.json().catch(()=>({}));
    if (!endpoint) return cors(JSON.stringify({error:{message:'endpoint 필수'}}),400);
    const id = _endpointId(endpoint);
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(id).run();
    return cors(JSON.stringify({success:true}),200);
  } catch(e) {
    return cors(JSON.stringify({error:{message:e.message}}),500);
  }
}

async function _sendOnePush(env, sub, payload) {
  try {
    const jwt = await _vapidJwt(env, sub.endpoint);
    await fetch(sub.endpoint, {
      method:'POST',
      headers:{
        'Authorization':`vapid t=${jwt},k=${env.VAPID_PUBLIC_KEY}`,
        'Content-Type':'application/json',
        'TTL':'86400'
      },
      body: JSON.stringify(payload)
    });
  } catch(_) {}
}

async function sendDailyPush(env) {
  await ensureDBExt(env);
  const subs = await env.DB.prepare('SELECT * FROM push_subscriptions').all();
  for (const sub of (subs.results||[])) {
    const msg = { ko:'오늘의 오행 운세를 확인하세요! 🌟', en:"Check today's fortune! 🌟",
                  zh:'查看今日五行运势！🌟', ja:'今日の五行運勢を確認！🌟' };
    await _sendOnePush(env, sub, { title:'M;Y 安', body: msg[sub.lang]||msg.ko, url:'/' });
  }
}

// ════════════════════════════
//  스트릭 핸들러
// ════════════════════════════
function _todayKST() {
  return new Date(Date.now()+9*3600000).toISOString().slice(0,10);
}

async function handleStreakCheckin(request, env) {
  try {
    const idToken = (request.headers.get('Authorization')||'').replace('Bearer ','').trim();
    if (!idToken) return cors(JSON.stringify({error:{message:'인증 필요'}}),401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 토큰'}}),401);

    const today = _todayKST();
    const row = await env.DB.prepare('SELECT * FROM user_streaks WHERE user_email=?').bind(email).first();

    let current=1, max=1, total=1;
    if (row) {
      if (row.last_checkin === today) return cors(JSON.stringify({alreadyDone:true, current:row.current_streak, max:row.max_streak, total:row.total_checkins, lastCheckin:today}),200);
      const yesterday = new Date(Date.now()+9*3600000-86400000).toISOString().slice(0,10);
      current = (row.last_checkin === yesterday) ? row.current_streak+1 : 1;
      max = Math.max(current, row.max_streak||0);
      total = (row.total_checkins||0)+1;
    }

    await env.DB.prepare(
      `INSERT INTO user_streaks (user_email,current_streak,max_streak,last_checkin,total_checkins,updated_at)
       VALUES (?,?,?,?,?,unixepoch())
       ON CONFLICT(user_email) DO UPDATE SET current_streak=excluded.current_streak,
       max_streak=excluded.max_streak,last_checkin=excluded.last_checkin,
       total_checkins=excluded.total_checkins,updated_at=excluded.updated_at`
    ).bind(email,current,max,today,total).run();

    // 7일 스트릭 보너스 (원장에 새 행 추가 — UPDATE 금지: 기존 결제 행 수만큼 중복 지급되는 버그가 됨)
    if (current%7===0) {
      const bonusId = `streak_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      await env.DB.prepare(
        `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'streak_bonus', 0, 5, 'approved', unixepoch())`
      ).bind(bonusId, email).run();
    }

    return cors(JSON.stringify({success:true,current,max,total,bonus:current%7===0,lastCheckin:today}),200);
  } catch(e) {
    return cors(JSON.stringify({error:{message:e.message}}),500);
  }
}

async function handleGetStreak(request, env) {
  try {
    const idToken = (request.headers.get('Authorization')||'').replace('Bearer ','').trim();
    if (!idToken) return cors(JSON.stringify({error:{message:'인증 필요'}}),401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 토큰'}}),401);
    const row = await env.DB.prepare('SELECT * FROM user_streaks WHERE user_email=?').bind(email).first();
    if (!row) return cors(JSON.stringify({current:0,max:0,total:0,lastCheckin:null}),200);
    return cors(JSON.stringify({current:row.current_streak,max:row.max_streak,total:row.total_checkins,lastCheckin:row.last_checkin}),200);
  } catch(e) {
    return cors(JSON.stringify({error:{message:e.message}}),500);
  }
}

// ════════════════════════════
//  오행 히스토리 핸들러
// ════════════════════════════
async function handleOhaengHistory(request, env) {
  try {
    const idToken = (request.headers.get('Authorization')||'').replace('Bearer ','').trim();
    if (!idToken) return cors(JSON.stringify({error:{message:'인증 필요'}}),401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 토큰'}}),401);
    const rows = await env.DB.prepare(
      'SELECT date,ohaeng FROM ohaeng_history WHERE user_email=? ORDER BY date DESC LIMIT 90'
    ).bind(email).all();
    return cors(JSON.stringify({history: rows.results||[]}),200);
  } catch(e) {
    return cors(JSON.stringify({error:{message:e.message}}),500);
  }
}

// ════════════════════════════
//  주간 리포트 핸들러
// ════════════════════════════
async function handleWeeklyReport(request, env) {
  try {
    const idToken = (request.headers.get('Authorization')||'').replace('Bearer ','').trim();
    if (!idToken) return cors(JSON.stringify({error:{message:'인증 필요'}}),401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 토큰'}}),401);

    const cutoff = new Date(Date.now()+9*3600000-6*86400000).toISOString().slice(0,10);
    const rows = await env.DB.prepare(
      'SELECT date,ohaeng FROM ohaeng_history WHERE user_email=? AND date>=? ORDER BY date DESC'
    ).bind(email, cutoff).all();
    const history = rows.results||[];

    const distribution = {};
    for (const r of history) distribution[r.ohaeng] = (distribution[r.ohaeng]||0)+1;
    let mostFrequent = '';
    let maxCount = 0;
    for (const [o, c] of Object.entries(distribution)) {
      if (c > maxCount) { maxCount = c; mostFrequent = o; }
    }

    const streakRow = await env.DB.prepare('SELECT current_streak FROM user_streaks WHERE user_email=?').bind(email).first();

    return cors(JSON.stringify({
      mostFrequent,
      distribution,
      totalDays: history.length,
      streak: streakRow?.current_streak || 0
    }),200);
  } catch(e) {
    return cors(JSON.stringify({error:{message:e.message}}),500);
  }
}

// ════════════════════════════
//  공유 보너스 핸들러
// ════════════════════════════
async function handleShareBonus(request, env) {
  try {
    const idToken = (request.headers.get('Authorization')||'').replace('Bearer ','').trim();
    if (!idToken) return cors(JSON.stringify({error:{message:'인증 필요'}}),401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 토큰'}}),401);

    const today = _todayKST();
    const row = await env.DB.prepare('SELECT last_share_bonus FROM user_streaks WHERE user_email=?').bind(email).first();
    if (row?.last_share_bonus === today) {
      return cors(JSON.stringify({error:{message:'오늘은 이미 공유 보너스를 받았습니다'}}),400);
    }

    await env.DB.prepare(
      `INSERT INTO user_streaks (user_email,last_share_bonus,updated_at)
       VALUES (?,?,unixepoch())
       ON CONFLICT(user_email) DO UPDATE SET last_share_bonus=excluded.last_share_bonus,updated_at=excluded.updated_at`
    ).bind(email, today).run();

    await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       VALUES (?, ?, 'share_bonus', 0, 1, 'approved', unixepoch())`
    ).bind(`share_${email}_${today}`, email).run();

    return cors(JSON.stringify({success:true, tokens:1}),200);
  } catch(e) {
    return cors(JSON.stringify({error:{message:e.message}}),500);
  }
}

// ════════════════════════════
//  피드백 핸들러
// ════════════════════════════
async function handleFeedback(request, env) {
  try {
    const idToken = (request.headers.get('Authorization')||'').replace('Bearer ','').trim();
    if (!idToken) return cors(JSON.stringify({error:{message:'인증 필요'}}),401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 토큰'}}),401);
    const { date, ohaeng, isCorrect } = await request.json().catch(()=>({}));
    if (!date||!ohaeng) return cors(JSON.stringify({error:{message:'date,ohaeng 필수'}}),400);
    const id = `${email}:${date}`;
    await env.DB.prepare(
      `INSERT INTO reading_feedback (id,user_email,date,ohaeng,is_correct)
       VALUES (?,?,?,?,?) ON CONFLICT(user_email,date) DO UPDATE SET is_correct=excluded.is_correct`
    ).bind(id,email,date,ohaeng,isCorrect?1:0).run();
    return cors(JSON.stringify({success:true}),200);
  } catch(e) {
    return cors(JSON.stringify({error:{message:e.message}}),500);
  }
}

// ════════════════════════════
//  레퍼럴 핸들러
// ════════════════════════════
async function handleReferralGenerate(request, env) {
  try {
    const idToken = (request.headers.get('Authorization')||'').replace('Bearer ','').trim();
    if (!idToken) return cors(JSON.stringify({error:{message:'인증 필요'}}),401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 토큰'}}),401);
    // 기존 코드 확인
    const existing = await env.DB.prepare('SELECT code FROM referrals WHERE referrer_email=? AND referee_email IS NULL LIMIT 1').bind(email).first();
    if (existing) return cors(JSON.stringify({code:existing.code}),200);
    // 새 코드 생성
    const code = _b64url(crypto.getRandomValues(new Uint8Array(9))).slice(0,8).toUpperCase();
    await env.DB.prepare('INSERT INTO referrals (code,referrer_email) VALUES (?,?)').bind(code,email).run();
    return cors(JSON.stringify({code}),200);
  } catch(e) {
    return cors(JSON.stringify({error:{message:e.message}}),500);
  }
}

async function handleReferralClaim(request, env) {
  try {
    const idToken = (request.headers.get('Authorization')||'').replace('Bearer ','').trim();
    if (!idToken) return cors(JSON.stringify({error:{message:'인증 필요'}}),401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 토큰'}}),401);
    const { code } = await request.json().catch(()=>({}));
    if (!code) return cors(JSON.stringify({error:{message:'code 필수'}}),400);
    const ref = await env.DB.prepare('SELECT * FROM referrals WHERE code=?').bind(code.toUpperCase()).first();
    if (!ref) return cors(JSON.stringify({error:{message:'유효하지 않은 코드'}}),404);
    if (ref.referee_email) return cors(JSON.stringify({error:{message:'이미 사용된 코드'}}),409);
    if (ref.referrer_email===email) return cors(JSON.stringify({error:{message:'본인 코드 사용 불가'}}),400);
    // 코드 소비 (동시 요청으로 한 코드가 두 번 보상되지 않도록 referee_email IS NULL 조건으로 원자적 처리)
    const claimRes = await env.DB.prepare(
      'UPDATE referrals SET referee_email=?,rewarded_at=unixepoch() WHERE code=? AND referee_email IS NULL'
    ).bind(email,code.toUpperCase()).run();
    if (!claimRes.meta?.rows_written) {
      return cors(JSON.stringify({error:{message:'이미 사용된 코드'}}),409);
    }
    // 보상: 양쪽 3토큰 (원장에 새 행 추가 — UPDATE 금지: 기존 결제 행 수만큼 중복 지급되는 버그가 됨)
    const refId1 = `ref_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const refId2 = `ref_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       VALUES (?, ?, 'referral_bonus', 0, 3, 'approved', unixepoch())`
    ).bind(refId1, email).run();
    await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       VALUES (?, ?, 'referral_bonus', 0, 3, 'approved', unixepoch())`
    ).bind(refId2, ref.referrer_email).run();
    return cors(JSON.stringify({success:true,bonus:3}),200);
  } catch(e) {
    return cors(JSON.stringify({error:{message:e.message}}),500);
  }
}

async function handleGetReferral(request, env) {
  try {
    const idToken = (request.headers.get('Authorization')||'').replace('Bearer ','').trim();
    if (!idToken) return cors(JSON.stringify({error:{message:'인증 필요'}}),401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 토큰'}}),401);
    const refs = await env.DB.prepare('SELECT code,referee_email,rewarded_at FROM referrals WHERE referrer_email=?').bind(email).all();
    const myCode = (refs.results||[]).find(r=>!r.referee_email);
    return cors(JSON.stringify({
      myCode: myCode?.code||null,
      used: (refs.results||[]).filter(r=>r.referee_email).length
    }),200);
  } catch(e) {
    return cors(JSON.stringify({error:{message:e.message}}),500);
  }
}

// ════════════════════════════
//  토큰 내역 조회
// ════════════════════════════
async function handleTokenHistory(request, env) {
  try {
    const idToken = (request.headers.get('Authorization')||'').replace('Bearer ','').trim();
    if (!idToken) return cors(JSON.stringify({error:{message:'인증 필요'}}),401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 토큰'}}),401);

    const history = [];

    // 1. 충전 내역 (payment_requests)
    const payments = await env.DB.prepare(
      `SELECT pkg, amount, tokens, status, created_at
       FROM payment_requests
       WHERE user_email=? AND status='completed'
       ORDER BY created_at DESC`
    ).bind(email).all().catch(() => ({ results: [] }));

    for (const p of payments.results || []) {
      history.push({
        type: 'charge',
        tokens: p.tokens,
        amount: p.amount,
        pkg: p.pkg,
        timestamp: p.created_at,
        desc: `${p.pkg} 패키지 충전`
      });
    }

    // 2. 운기 이벤트 (ungi_token_gifts)
    const ungiGifts = await env.DB.prepare(
      `SELECT tokens_given, gifted_at
       FROM ungi_token_gifts
       WHERE user_email=?
       ORDER BY gifted_at DESC`
    ).bind(email).all().catch(() => ({ results: [] }));

    for (const g of ungiGifts.results || []) {
      history.push({
        type: 'event',
        tokens: g.tokens_given,
        timestamp: g.gifted_at,
        desc: '🍮 운기 푸딩 이벤트'
      });
    }

    // 3. 추천인 보상 (referrals)
    const referrals = await env.DB.prepare(
      `SELECT rewarded_at
       FROM referrals
       WHERE (referrer_email=? OR referee_email=?) AND rewarded_at IS NOT NULL
       ORDER BY rewarded_at DESC`
    ).bind(email, email).all().catch(() => ({ results: [] }));

    for (const r of referrals.results || []) {
      history.push({
        type: 'referral',
        tokens: 3,
        timestamp: r.rewarded_at,
        desc: '👥 친구 추천 보상'
      });
    }

    // 4. 프로모션 (promo_claims)
    const promos = await env.DB.prepare(
      `SELECT promo_code, tokens_given, claimed_at
       FROM promo_claims
       WHERE user_email=?
       ORDER BY claimed_at DESC`
    ).bind(email).all().catch(() => ({ results: [] }));

    for (const p of promos.results || []) {
      history.push({
        type: 'promo',
        tokens: p.tokens_given,
        timestamp: p.claimed_at,
        desc: `🎁 프로모션: ${p.promo_code}`
      });
    }

    // 시간순 정렬
    history.sort((a, b) => b.timestamp - a.timestamp);

    return cors(JSON.stringify({ history }), 200);
  } catch (e) {
    return cors(JSON.stringify({ error: { message: e.message } }), 500);
  }
}

// ════════════════════════════
//  운기 관리자 Google 로그인
// ════════════════════════════
async function handleUngiAdminLogin(request, env) {
  try {
    const { idToken } = await request.json().catch(() => ({}));
    if (!idToken) {
      return cors(JSON.stringify({ error: { message: 'idToken 필수' } }), 400);
    }

    // Google 토큰 검증
    const email = await getEmailFromToken(idToken, env);
    if (!email) {
      return cors(JSON.stringify({ error: { message: '유효하지 않은 토큰' } }), 401);
    }

    // 관리자 이메일 체크
    const ADMIN_EMAIL = env.ADMIN_EMAIL || 'riger7070@gmail.com';
    if (email !== ADMIN_EMAIL) {
      return cors(JSON.stringify({ error: { message: '관리자 권한이 없습니다' } }), 403);
    }

    return cors(JSON.stringify({ success: true, email }), 200);
  } catch (e) {
    return cors(JSON.stringify({ error: { message: e.message } }), 500);
  }
}

// ════════════════════════════
//  운기 토큰 지급 핸들러
// ════════════════════════════
async function handleUngiGiveTokens(request, env) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    const { pin, googleToken, email, tokens } = await request.json().catch(() => ({}));

    // 방법 2: IP 화이트리스트 체크
    const whitelisted = await env.DB.prepare('SELECT * FROM ungi_admin_whitelist WHERE ip=?').bind(ip).first();
    if (!whitelisted) {
      return cors(JSON.stringify({ error: { message: '접근 권한이 없습니다. IP가 등록되지 않았습니다.' } }), 403);
    }

    // 방법 1: Rate Limiting - 최근 1시간 동안 시도 횟수 확인
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    const attempts = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM ungi_admin_attempts WHERE ip=? AND attempt_at > ?'
    ).bind(ip, oneHourAgo).first();

    if (attempts && attempts.count >= 10) {
      return cors(JSON.stringify({ error: { message: '너무 많은 시도. 1시간 후 다시 시도하세요.' } }), 429);
    }

    // 인증 방법 확인
    let authenticated = false;

    if (googleToken) {
      // 방법 3: Google 로그인 인증
      const googleEmail = await getEmailFromToken(googleToken, env);
      const ADMIN_EMAIL = env.ADMIN_EMAIL || 'riger7070@gmail.com';
      if (googleEmail === ADMIN_EMAIL) {
        authenticated = true;
        // 성공 기록
        await env.DB.prepare('INSERT INTO ungi_admin_attempts (ip, attempt_at, success) VALUES (?, ?, 1)')
          .bind(ip, Math.floor(Date.now() / 1000)).run();
      } else {
        return cors(JSON.stringify({ error: { message: '관리자 권한이 없습니다' } }), 403);
      }
    } else if (pin) {
      // 방법 1: PIN 인증 (UNGI_PIN 시크릿 미설정 시 하드코딩 폴백 금지 — PIN 로그인 자체를 비활성화)
      const pinMatch = !!env.UNGI_PIN && pin === env.UNGI_PIN;

      // 시도 기록
      await env.DB.prepare('INSERT INTO ungi_admin_attempts (ip, attempt_at, success) VALUES (?, ?, ?)')
        .bind(ip, Math.floor(Date.now() / 1000), pinMatch ? 1 : 0).run();

      if (pinMatch) {
        authenticated = true;
      }
    }

    if (!authenticated) {
      return cors(JSON.stringify({ error: { message: '인증 실패' } }), 401);
    }

    if (!email || !tokens) {
      return cors(JSON.stringify({ error: { message: 'email, tokens 필수' } }), 400);
    }

    if (tokens < 1 || tokens > 10) {
      return cors(JSON.stringify({ error: { message: '토큰은 1~10개만 가능' } }), 400);
    }

    // 사용자 존재 확인
    const user = await env.DB.prepare('SELECT * FROM payment_requests WHERE user_email=?').bind(email).first();
    if (!user) {
      return cors(JSON.stringify({ error: { message: '존재하지 않는 사용자' } }), 404);
    }

    // 토큰 지급 (원장에 새 행 추가 — UPDATE 금지: 기존 결제 행 수만큼 중복 지급되는 버그가 됨)
    const grantId = `ungi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       VALUES (?, ?, 'ungi_admin_grant', 0, ?, 'approved', unixepoch())`
    ).bind(grantId, email, tokens).run();

    // 로그 기록
    await env.DB.prepare('INSERT INTO ungi_token_gifts (user_email, tokens_given, gifted_by) VALUES (?, ?, ?)')
      .bind(email, tokens, 'UNGI_STORE').run();

    return cors(JSON.stringify({ success: true, tokens, email }), 200);
  } catch (e) {
    return cors(JSON.stringify({ error: { message: e.message } }), 500);
  }
}


// ════════════════════════════════════════════
//  운기 푸딩 일회용 QR 행운 시스템
//  - 푸딩 1개당 일회용 코드 1개 (스티커 라벨로 인쇄)
//  - 첫 스캔 시 행운 시드 확정, 이후 24시간 동안만 같은 메시지 재확인 가능
// ════════════════════════════════════════════
const FORTUNE_CODE_REVIEW_WINDOW = 86400; // 사용 후 재확인 허용 시간(초)

function _genFortuneCode() {
  // 혼동되는 문자(I,O,0,1) 제외 32자 × 10자리 = 약 10^15 조합 (추측 불가)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint8Array(10);
  crypto.getRandomValues(buf);
  return Array.from(buf, b => chars[b % chars.length]).join('');
}

// [사장님] 일회용 코드 일괄 생성 — 스티커 라벨 인쇄용
async function handleFortuneQrGenerate(request, env) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.RL_API.limit({ key: `fqrgen:${ip}` });
    if (!success) return cors(JSON.stringify({ error: { message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' } }), 429);

    const { pin, count } = await request.json().catch(() => ({}));
    if (!env.UNGI_PIN || !pin || String(pin).length > 8 || String(pin) !== env.UNGI_PIN) {
      return cors(JSON.stringify({ error: { message: 'PIN이 올바르지 않습니다.' } }), 403);
    }

    const n = Math.min(Math.max(parseInt(count, 10) || 0, 1), 100);
    const batchId = `b${Date.now()}`;
    const codes = [];
    const stmts = [];
    for (let i = 0; i < n; i++) {
      const code = _genFortuneCode();
      codes.push(code);
      stmts.push(env.DB.prepare(
        `INSERT INTO fortune_codes (code, batch_id) VALUES (?, ?)`
      ).bind(code, batchId));
    }
    await env.DB.batch(stmts);

    return cors(JSON.stringify({ success: true, batchId, codes }), 200);
  } catch (e) {
    return cors(JSON.stringify({ error: { message: e.message } }), 500);
  }
}

// [손님] 일회용 코드 사용 → 행운 시드 반환 (메시지 매핑은 클라이언트)
async function handleFortuneQrRedeem(request, env) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.RL_API.limit({ key: `fqr:${ip}` });
    if (!success) return cors(JSON.stringify({ error: { message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' } }), 429);

    const { code } = await request.json().catch(() => ({}));
    if (!code || typeof code !== 'string' || code.length > 20) {
      return cors(JSON.stringify({ error: { message: '코드 형식이 올바르지 않습니다.' } }), 400);
    }

    const row = await env.DB.prepare(
      `SELECT code, used_at, fortune_seed FROM fortune_codes WHERE code = ?`
    ).bind(code.toUpperCase().trim()).first();

    if (!row) return cors(JSON.stringify({ error: { message: '유효하지 않은 QR 코드입니다.' } }), 404);

    const now = Math.floor(Date.now() / 1000);
    if (row.used_at) {
      if (now - row.used_at <= FORTUNE_CODE_REVIEW_WINDOW) {
        return cors(JSON.stringify({ success: true, seed: row.fortune_seed, revisit: true }), 200);
      }
      return cors(JSON.stringify({ error: { message: '이미 사용된 QR 코드입니다.' } }), 410);
    }

    // 첫 사용: 시드 확정 (WHERE used_at IS NULL 조건으로 동시 스캔 경합 방지)
    const seed = Math.floor(Math.random() * 1000000);
    const res = await env.DB.prepare(
      `UPDATE fortune_codes SET used_at = unixepoch(), fortune_seed = ? WHERE code = ? AND used_at IS NULL`
    ).bind(seed, row.code).run();

    if (!res.meta || res.meta.changes === 0) {
      // 동시 스캔으로 다른 요청이 먼저 사용 처리 → 확정된 시드 반환
      const again = await env.DB.prepare(
        `SELECT fortune_seed FROM fortune_codes WHERE code = ?`
      ).bind(row.code).first();
      return cors(JSON.stringify({ success: true, seed: again?.fortune_seed ?? seed, revisit: true }), 200);
    }

    return cors(JSON.stringify({ success: true, seed, revisit: false }), 200);
  } catch (e) {
    return cors(JSON.stringify({ error: { message: e.message } }), 500);
  }
}


async function handleOhaengHistorySave(request, env) {
  try {
    const idToken = (request.headers.get('Authorization')||'').replace('Bearer ','').trim();
    if (!idToken) return cors(JSON.stringify({error:{message:'인증 필요'}}),401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 토큰'}}),401);
    const { date, ohaeng } = await request.json().catch(()=>({}));
    if (!date||!ohaeng) return cors(JSON.stringify({error:{message:'date,ohaeng 필수'}}),400);
    const id = `${email}:${date}`;
    await env.DB.prepare(
      `INSERT INTO ohaeng_history (id,user_email,date,ohaeng) VALUES (?,?,?,?)
       ON CONFLICT(user_email,date) DO UPDATE SET ohaeng=excluded.ohaeng`
    ).bind(id,email,date,ohaeng).run();
    return cors(JSON.stringify({success:true}),200);
  } catch(e) {
    return cors(JSON.stringify({error:{message:e.message}}),500);
  }
}


// ════════════════════════════════════════════
//  프로모 QR 코드 클레임 핸들러
// ════════════════════════════════════════════
// 카페 직원 PIN — 소스에 하드코딩하지 않고 `wrangler secret put CAFE_STAFF_PIN`으로 설정
const PROMO_CODES = {
  'MYAN_CAFE': { tokens: 3, label: '카페 방문 혜택' },
};

async function handlePromoClaim(request, env) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return cors(JSON.stringify({ error: '로그인이 필요합니다.' }), 401);

  // 서명 검증 없이 payload만 디코드하면 누구나 임의 이메일로 위장 가능 — getEmailFromToken으로 반드시 검증
  const email = await getEmailFromToken(token, env);
  if (!email) return cors(JSON.stringify({ error: '인증 오류입니다.' }), 401);

  const { code, pin, promo_token } = await request.json().catch(() => ({}));

  // 다이나믹 1회용 토큰 처리
  if (promo_token) {
    return handleDynamicPromoClaim(request, env, email, promo_token);
  }

  const promo = PROMO_CODES[code?.toUpperCase()];
  if (!promo) return cors(JSON.stringify({ error: '유효하지 않은 코드입니다.' }), 400);

  // PIN 검증 (브루트포스 방지: 입력값 길이 제한)
  if (promo.requirePin) {
    if (!env.CAFE_STAFF_PIN || !pin || String(pin).length > 8) {
      return cors(JSON.stringify({ error: '직원 확인 PIN을 입력해 주세요.' }), 400);
    }
    if (String(pin) !== env.CAFE_STAFF_PIN) {
      return cors(JSON.stringify({ error: 'PIN이 올바르지 않습니다. 직원에게 다시 확인해 주세요.' }), 403);
    }
  }

  // 중복 클레임 확인
  const existing = await env.DB.prepare(
    `SELECT id FROM promo_claims WHERE user_email = ? AND promo_code = ?`
  ).bind(email, code.toUpperCase()).first();

  if (existing) {
    return cors(JSON.stringify({ error: '이미 사용된 코드입니다. 계정당 1회만 사용 가능합니다.' }), 409);
  }

  // 토큰 지급
  const claimId = `promo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await env.DB.prepare(
    `INSERT INTO promo_claims (id, user_email, promo_code, claimed_at, tokens_given) VALUES (?, ?, ?, unixepoch(), ?)`
  ).bind(claimId, email, code.toUpperCase(), promo.tokens).run();

  await env.DB.prepare(
    `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
     VALUES (?, ?, 'promo', 0, ?, 'approved', unixepoch())`
  ).bind(`grant_${claimId}`, email, promo.tokens).run();

  // 잔여 토큰 반환
  const bal = await env.DB.prepare(
    `SELECT COALESCE(SUM(tokens), 0) AS t FROM payment_requests WHERE user_email = ? AND status = 'approved'`
  ).bind(email).first();

  return cors(JSON.stringify({
    success: true,
    tokensGiven: promo.tokens,
    remaining: bal?.t ?? 0,
    label: promo.label
  }), 200);
}


// ════════════════════════════════════════════
//  다이나믹 QR 프로모 (1회용 토큰 시스템)
// ════════════════════════════════════════════
// 카운터 태블릿용 관리자 PIN — 소스에 하드코딩하지 않고 `wrangler secret put PROMO_ADMIN_PIN`으로 설정
const PROMO_TOKEN_TTL = 600;   // 토큰 유효시간: 10분 (초)
const PROMO_TOKENS_REWARD = 3; // 지급 토큰 수

// 랜덤 토큰 생성
function _genToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length: 8}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// [관리자] 새 1회용 토큰 생성 (카운터 태블릿에서 호출)
async function handlePromoGenerate(request, env) {
  const { adminPin } = await request.json().catch(() => ({}));
  if (!env.PROMO_ADMIN_PIN || adminPin !== env.PROMO_ADMIN_PIN) {
    return cors(JSON.stringify({ error: '관리자 PIN이 올바르지 않습니다.' }), 403);
  }
  // 기존 미사용 토큰 무효화
  await env.DB.prepare(
    `UPDATE dynamic_promo_tokens SET used_at = unixepoch(), used_by = 'expired'
     WHERE used_at IS NULL AND created_at < unixepoch() - ?`
  ).bind(PROMO_TOKEN_TTL).run();

  const token = _genToken();
  await env.DB.prepare(
    `INSERT INTO dynamic_promo_tokens (token, created_at, tokens_given) VALUES (?, unixepoch(), ?)`
  ).bind(token, PROMO_TOKENS_REWARD).run();

  const url = `https://myan.riger7070.workers.dev/?promo_token=${token}`;
  return cors(JSON.stringify({ success: true, token, url, ttl: PROMO_TOKEN_TTL }), 200);
}

// [관리자] 현재 유효한 토큰 조회
async function handlePromoCurrent(request, env) {
  const adminPin = new URL(request.url).searchParams.get('pin');
  if (!env.PROMO_ADMIN_PIN || adminPin !== env.PROMO_ADMIN_PIN) {
    return cors(JSON.stringify({ error: '인증 오류' }), 403);
  }
  const row = await env.DB.prepare(
    `SELECT token, created_at, (unixepoch() - created_at) AS age
     FROM dynamic_promo_tokens
     WHERE used_at IS NULL AND created_at > unixepoch() - ?
     ORDER BY created_at DESC LIMIT 1`
  ).bind(PROMO_TOKEN_TTL).first();

  if (!row) return cors(JSON.stringify({ token: null }), 200);
  const remaining = PROMO_TOKEN_TTL - row.age;
  const url = `https://myan.riger7070.workers.dev/?promo_token=${row.token}`;
  return cors(JSON.stringify({ token: row.token, url, remaining }), 200);
}

// [손님] 1회용 토큰으로 클레임
async function handleDynamicPromoClaim(request, env, email, token) {
  // 토큰 유효성 확인
  const tokenRow = await env.DB.prepare(
    `SELECT token, tokens_given, used_at FROM dynamic_promo_tokens
     WHERE token = ? AND used_at IS NULL AND created_at > unixepoch() - ?`
  ).bind(token, PROMO_TOKEN_TTL).first();

  if (!tokenRow) {
    return cors(JSON.stringify({ error: '이 코드는 이미 사용됐거나 만료되었습니다. 직원에게 새 코드를 요청해 주세요.' }), 410);
  }

  // 중복 사용 방지
  const already = await env.DB.prepare(
    `SELECT id FROM promo_claims WHERE user_email = ? AND promo_code = 'DYNAMIC'`
  ).bind(email).first();
  if (already) {
    return cors(JSON.stringify({ error: '이미 프로모 혜택을 사용하셨습니다. (계정당 1회)' }), 409);
  }

  // 토큰 소비 처리
  await env.DB.prepare(
    `UPDATE dynamic_promo_tokens SET used_at = unixepoch(), used_by = ? WHERE token = ?`
  ).bind(email, token).run();

  const claimId = `dyn_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  await env.DB.prepare(
    `INSERT INTO promo_claims (id, user_email, promo_code, claimed_at, tokens_given) VALUES (?, ?, 'DYNAMIC', unixepoch(), ?)`
  ).bind(claimId, email, tokenRow.tokens_given).run();

  await env.DB.prepare(
    `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
     VALUES (?, ?, 'promo_dynamic', 0, ?, 'approved', unixepoch())`
  ).bind(`grant_${claimId}`, email, tokenRow.tokens_given).run();

  const bal = await env.DB.prepare(
    `SELECT COALESCE(SUM(tokens), 0) AS t FROM payment_requests WHERE user_email = ? AND status = 'approved'`
  ).bind(email).first();

  return cors(JSON.stringify({
    success: true, tokensGiven: tokenRow.tokens_given, remaining: bal?.t ?? 0
  }), 200);
}

// [카운터 태블릿] QR 표시 화면
async function handlePromoDisplay(request, env) {
  const url = new URL(request.url);
  const pin = url.searchParams.get('pin') || '';
  const authed = !!env.PROMO_ADMIN_PIN && pin === env.PROMO_ADMIN_PIN;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>M;Y 安 · 카운터 QR</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>
  body { margin:0; background:#1a1610; color:#c9a96e; font-family:'Apple SD Gothic Neo',sans-serif;
         display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; }
  h1 { font-size:1.4rem; letter-spacing:4px; margin-bottom:4px; }
  .sub { font-size:0.8rem; opacity:0.5; margin-bottom:28px; }
  #qr-box { background:#fff; padding:16px; border-radius:12px; margin-bottom:20px; }
  .status { font-size:0.85rem; opacity:0.6; margin-bottom:12px; }
  .token-disp { font-size:1.6rem; font-weight:700; letter-spacing:8px; margin-bottom:20px; color:#e0c07a; }
  .btn { background:#c9a96e; color:#1a1610; border:none; padding:14px 32px; border-radius:10px;
         font-size:1rem; font-weight:700; cursor:pointer; margin:6px; }
  .btn-sm { background:transparent; border:1px solid #c9a96e; color:#c9a96e; padding:10px 20px;
            border-radius:8px; font-size:0.85rem; cursor:pointer; }
  .pin-form { display:flex; flex-direction:column; align-items:center; gap:12px; }
  input { padding:14px; border-radius:10px; border:1px solid #c9a96e; background:#2a2010;
          color:#c9a96e; font-size:1.2rem; text-align:center; letter-spacing:6px; width:160px; }
  #timer { font-size:0.78rem; color:#888; margin-top:8px; }
  #used-badge { display:none; color:#e05a4a; font-size:0.9rem; margin-top:8px; }
</style>
</head>
<body>
${authed ? `
<h1>M;Y 安</h1>
<div class="sub">카운터 QR · 고객용</div>
<div id="qr-box"><div id="qr"></div></div>
<div class="token-disp" id="token-text">─ ─ ─ ─ ─</div>
<div class="status" id="status">새 QR을 생성하세요</div>
<div id="timer"></div>
<div id="used-badge">✓ 사용됨 — 새 QR을 생성해 주세요</div>
<br>
<button class="btn" onclick="genQR()">🔄 새 QR 생성</button>
<button class="btn-sm" onclick="location.reload()">새로고침</button>
<script>
const PIN = '${pin}';
let currentToken = null;
let pollInterval = null;
let timerInterval = null;
let expiresAt = null;

async function genQR() {
  document.getElementById('used-badge').style.display = 'none';
  document.getElementById('status').textContent = '생성 중...';
  const r = await fetch('/api/promo/generate', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({adminPin: PIN})
  });
  const d = await r.json();
  if (!d.success) { alert(d.error); return; }
  currentToken = d.token;
  expiresAt = Date.now() + d.ttl * 1000;
  showQR(d.url, d.token);
  startPoll();
  startTimer(d.ttl);
}

function showQR(url, token) {
  document.getElementById('qr').innerHTML = '';
  new QRCode(document.getElementById('qr'), {
    text: url, width:220, height:220,
    colorDark:'#1a1610', colorLight:'#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });
  document.getElementById('token-text').textContent = token;
  document.getElementById('status').textContent = '손님이 스캔하면 자동으로 새 QR이 생성됩니다';
}

function startPoll() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    const r = await fetch('/api/promo/current?pin=' + PIN);
    const d = await r.json();
    if (!d.token || d.token !== currentToken) {
      clearInterval(pollInterval);
      clearInterval(timerInterval);
      document.getElementById('timer').textContent = '';
      document.getElementById('used-badge').style.display = 'block';
      document.getElementById('status').textContent = '사용 완료!';
      // 2초 후 자동으로 새 QR 생성
      setTimeout(genQR, 2000);
    }
  }, 2000);
}

function startTimer(ttl) {
  if (timerInterval) clearInterval(timerInterval);
  const el = document.getElementById('timer');
  timerInterval = setInterval(() => {
    const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    el.textContent = left > 0 ? '유효시간: ' + left + '초' : '만료됨';
    if (left === 0) { clearInterval(timerInterval); clearInterval(pollInterval); }
  }, 1000);
}

// 페이지 로드 시 현재 유효한 토큰 확인
(async () => {
  const r = await fetch('/api/promo/current?pin=' + PIN);
  const d = await r.json();
  if (d.token) {
    currentToken = d.token;
    expiresAt = Date.now() + d.remaining * 1000;
    showQR(d.url, d.token);
    startPoll();
    startTimer(d.remaining);
  }
})();
</script>
` : `
<h1>M;Y 安 · 카운터</h1>
<div class="sub">관리자 로그인</div>
<div class="pin-form">
  <input type="password" id="pin-in" placeholder="PIN" maxlength="8" inputmode="numeric">
  <button class="btn" onclick="location.href='/promo-display?pin='+document.getElementById('pin-in').value">
    입장
  </button>
</div>
`}
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}


// ════════════════════════════════════════════
//  게스트 체험 핸들러 (로그인 없이 1회 무료)
// ════════════════════════════════════════════
async function handleGuestChat(request, env) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    const today = new Date().toISOString().slice(0, 10);

    if (!env.DB) {
      return cors(JSON.stringify({ error: { message: 'DB not available' } }), 500);
    }

    const { birth, name = '손님', lang = 'ko', ref } = await request.json().catch(() => ({}));
    if (!birth) {
      return cors(JSON.stringify({ error: { message: 'birth 필수' } }), 400);
    }

    // 마스터 IP는 제한 없음
    const MASTER_IP = '183.103.107.75';
    const isMaster = ip === MASTER_IP;

    // ref=ungi 여부에 따라 다른 테이블 사용
    const isUngi = ref === 'ungi';
    const tableName = isUngi ? 'ungi_guest_usage' : 'guest_usage';

    // IP당 하루 1회 제한 확인 (마스터 IP는 제외)
    if (!isMaster) {
      const usage = await env.DB.prepare(
        `SELECT used_count FROM ${tableName} WHERE ip = ? AND used_date = ?`
      ).bind(ip, today).first().catch(() => null);

      if (usage && usage.used_count >= 1) {
      // 다음날 자정(KST) 계산
      const resetDate = new Date(today);
      resetDate.setDate(resetDate.getDate() + 1);
      resetDate.setHours(0, 0, 0, 0);
      const hoursUntilReset = Math.ceil((resetDate - Date.now()) / 3600000);

      return cors(JSON.stringify({
        error: {
          message: 'already_used',
          code: 'GUEST_LIMIT',
          resetIn: hoursUntilReset,
          resetAt: resetDate.toISOString()
        }
      }), 429);
      }
    }

    const il = ilchin();
    const on = ON[lang] || ON.ko;

    // 정확한 사주(연/월/일주, 절기 반영) — 게스트는 출생시각이 없어 시주 제외. AI엔 해석만 시킴
    const bm = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec((birth || '').trim());
    const gsaju = bm ? computeSaju(bm[1], bm[2], bm[3], '') : null;
    const gsajuBlock = gsaju
      ? `\n[정확한 사주 원국 — 서버 만세력 계산값. 재계산·추측 금지, 이 값만 사용]: ${gsaju.text}`
      : '';

    const sysText = `You are the Ohaeng Energy Master of M;Y 安. Today's Ilchin: ${CG[il.ci]}${JJ[il.ji]} · Primary: ${on[il.o]}.${gsajuBlock}
${lang === 'ko' ? '한국어로 답변하세요.' : lang === 'en' ? 'Respond in English.' : lang === 'zh' ? '请用中文回答。' : '日本語で答えてください。'}
HANJA RULE: When using Chinese characters, always add Korean meaning in parentheses.
Write in warm, plain everyday language. Keep it concise (200-250 characters).
OUTPUT: Return ONLY valid JSON: {"reading":"<warm short reading 200-300 chars>","ohaeng":{"木":N,"火":N,"土":N,"金":N,"水":N}}
For ohaeng: integers 0–100, sum = 100${gsaju ? ', derive from the EXACT 오행분포 above (do not recalculate pillars)' : ''}. End reading with one of: #木 #火 #土 #金 #水`;

    const userName = name || '손님';
    const userMsg = `${lang === 'ko' ? `이름: ${userName}\n생년월일` : `Name: ${userName}\nBirth date`}: ${birth}
${lang === 'ko' ? '오늘의 기운과 나의 오행 궁합을 짧게 풀어주세요. 이름을 불러주세요.' : `Give me a short reading of today's energy and my five elements. Address me by name (${userName}).`}`;

    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              { parts: [{ text: sysText + '\n\n' + userMsg }] }
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.8,
              maxOutputTokens: 2048
            }
          })
        }
      );

      if (!resp.ok) {
        const errorText = await resp.text();
        console.error('[GUEST CHAT] Gemini API error:', resp.status, errorText);
        return cors(JSON.stringify({
          error: { message: `Gemini API 오류 (${resp.status})`, details: errorText.substring(0, 200) }
        }), 500);
      }

      const data = await resp.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      console.log('[GUEST CHAT] Gemini raw response:', raw.substring(0, 500));

      let result = {};
      try {
        // JSON 파싱 시도
        const cleaned = raw.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
        result = JSON.parse(cleaned);
      } catch (parseError) {
        console.error('[GUEST CHAT] Parse error:', parseError.message, 'Raw:', raw.substring(0, 200));
        return cors(JSON.stringify({
          error: { message: 'AI 응답을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.' }
        }), 500);
      }

      if (!result.reading || !result.ohaeng) {
        return cors(JSON.stringify({
          error: { message: 'AI 응답 형식 오류' }
        }), 500);
      }

      // 사용 기록 저장 (ref에 따라 다른 테이블, 마스터 IP는 제외)
      if (!isMaster) {
        await env.DB.prepare(
          `INSERT INTO ${tableName} (ip, used_date, used_count) VALUES (?, ?, 1)
           ON CONFLICT(ip, used_date) DO UPDATE SET used_count = used_count + 1`
        ).bind(ip, today).run();
      }

      return cors(JSON.stringify({ success: true, reading: result.reading, ohaeng: result.ohaeng, isUngi }), 200);

    } catch(e) {
      return cors(JSON.stringify({
        error: { message: '서버 오류가 발생했습니다.' }
      }), 500);
    }
  } catch(outerErr) {
    return cors(JSON.stringify({
      error: { message: '시스템 오류가 발생했습니다.' }
    }), 500);
  }
}
