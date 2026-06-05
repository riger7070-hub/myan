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

function _todayRel(todayElem, me, ef, isKo) {
  if (todayElem===me) return isKo?`오늘은 ${ef[todayElem]} 기운이 같은 기운을 더해 힘이 솟는 날이에요.`:`Today's ${ef[todayElem]} energy reinforces yours — an energizing day.`;
  if (_GEN[todayElem]===me) return isKo?`오늘은 ${ef[todayElem]} 기운이 당신을 도와주는(생) 날이라 일이 수월해요.`:`Today's ${ef[todayElem]} energy supports you — things flow smoothly.`;
  if (_GEN[me]===todayElem) return isKo?`오늘은 당신이 ${ef[todayElem]} 기운에 베푸는 날이라 에너지를 아끼는 게 좋아요.`:`Today you give to the ${ef[todayElem]} energy — pace yourself.`;
  if (_CTRL[todayElem]===me) return isKo?`오늘은 ${ef[todayElem]} 기운이 당신을 누르는(극) 날이라 무리하지 마세요.`:`Today's ${ef[todayElem]} energy presses on you — don't overdo it.`;
  return isKo?`오늘은 당신이 ${ef[todayElem]} 기운을 다스리는 날이라 주도권을 쥐기 좋아요.`:`Today you control the ${ef[todayElem]} energy — a good day to lead.`;
}

// solo 간단 풀이
function buildLocalReading(saju, lang, il, name) {
  const L = ['ko','en','zh','ja'].includes(lang) ? lang : 'en';
  const isKo = L==='ko';
  const ef = _ELEM_FR[L];
  const trait = _GAN_TRAIT[L][saju.dayGan] || '';
  const need = _needElem(saju.elem);
  const strong = _strongElem(saju.elem);
  const pillars = `年 ${saju.yp} / 月 ${saju.mp} / 日 ${saju.dp} / 時 ${saju.hp || (isKo?'미상':'unknown')}`;
  const rel = _todayRel(il.o, saju.dayElem, ef, isKo);
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

  let reading;
  if (L === 'ko') {
    reading = `📅 사주 원국 (만세력)\n${pillars}\n\n🎯 당신의 본질 (일간)\n${saju.dayGan}${ef[saju.dayElem]} — ${trait}\n\n⚖️ 오행 에너지 분포\n${elemDesc}\n가장 강한 기운: ${ef[strong]}\n부족한 기운: ${ef[need]}\n\n🔮 용신 (필요한 기운)\n${yongsinAdv}\n\n☀️ 오늘의 기운 (${CG[il.ci]}${JJ[il.ji]}日)\n${rel}\n\n💡 오늘의 조언\n${adv}`;
  } else if (L === 'zh') {
    reading = `📅 四柱命盘 (万年历)\n${pillars}\n\n🎯 您的本质 (日干)\n${saju.dayGan}${ef[saju.dayElem]} — ${trait}\n\n⚖️ 五行能量分布\n${elemDesc}\n最强之气: ${ef[strong]}\n不足之气: ${ef[need]}\n\n🔮 用神 (所需之气)\n${yongsinAdv}\n\n☀️ 今日之气 (${CG[il.ci]}${JJ[il.ji]}日)\n${rel}\n\n💡 今日建议\n${adv}`;
  } else if (L === 'ja') {
    reading = `📅 四柱命式 (万年暦)\n${pillars}\n\n🎯 あなたの本質 (日干)\n${saju.dayGan}${ef[saju.dayElem]} — ${trait}\n\n⚖️ 五行エネルギー分布\n${elemDesc}\n最も強い気: ${ef[strong]}\n不足している気: ${ef[need]}\n\n🔮 用神 (必要な気)\n${yongsinAdv}\n\n☀️ 今日の気 (${CG[il.ci]}${JJ[il.ji]}日)\n${rel}\n\n💡 今日のアドバイス\n${adv}`;
  } else {
    reading = `📅 Four Pillars\n${pillars}\n\n🎯 Your Essence (Day Master)\n${saju.dayGan} (${ef[saju.dayElem]}) — ${trait}\n\n⚖️ Five Elements Distribution\n${elemDesc}\nStrongest: ${ef[strong]}\nWeakest: ${ef[need]}\n\n🔮 Beneficial Element\n${yongsinAdv}\n\n☀️ Today's Energy (${CG[il.ci]}${JJ[il.ji]})\n${rel}\n\n💡 Today's Advice\n${adv}`;
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

// 인메모리 속도 제한 (isolate당, 1차 빠른 거부용)
const _rateLimit = new Map();
function checkRateLimit(key, limitMs) {
  const now = Date.now();
  const last = _rateLimit.get(key) || 0;
  if (now - last < limitMs) return false;
  _rateLimit.set(key, now);
  // 메모리 누수 방지: 1000개 초과 시 오래된 항목 정리
  if (_rateLimit.size > 1000) {
    const cutoff = now - limitMs * 2;
    for (const [k, v] of _rateLimit) { if (v < cutoff) _rateLimit.delete(k); }
  }
  return true;
}

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
      total_checkins INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT (unixepoch())
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
  `).catch(() => {});
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
    if (path === '/chat' && method === 'POST') return handleGeminiChat(request, env);
    if (path === '/api/payment/verify' && method === 'POST') return handlePaymentVerify(request, env);
    if (path === '/withdraw' && method === 'DELETE') return handleWithdraw(request, env);
    if (path === '/delete-account'  && method === 'GET') return handleDeleteAccountPage();
    if (path === '/privacy-policy'  && method === 'GET') return handlePrivacyPage();
    if (path === '/terms'           && method === 'GET') return handleTermsPage();

    // ── 상세 풀이 ──
    if (path === '/chat-detail' && method === 'POST') { await ensureDBExt(env); return handleDetailReading(request, env); }
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
    // ── 프로모 & 피드백 ──
    if (path === '/api/promo/claim'      && method === 'POST') { await ensureDBExt(env); return handlePromoClaim(request, env); }
    if (path === '/api/promo/generate'   && method === 'POST') { await ensureDBExt(env); return handlePromoGenerate(request, env); }
    if (path === '/api/promo/current'    && method === 'GET')  { await ensureDBExt(env); return handlePromoCurrent(request, env); }
    if (path === '/promo-display'        && method === 'GET')  { return handlePromoDisplay(request, env); }
    if (path === '/api/feedback'         && method === 'POST') { await ensureDBExt(env); return handleFeedback(request, env); }
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

    // 루트 경로: Worker Assets에서 index.html 직접 서빙 (보안 헤더 주입 + ENV 주입)
    if (method === 'GET') {
      const res = await env.ASSETS.fetch(request);

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
  }
};

// ════════════════════════════
//  Gemini 핵심 핸들러 (버그 픽스 완료 버전)
// ════════════════════════════
async function handleGeminiChat(request, env) {
  try {
    const API_KEY = env.GEMINI_API_KEY;
    if (!API_KEY) {
      return cors(JSON.stringify({ error: { message: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' } }), 500);
    }

    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    if (idToken.length > 4096) return cors(JSON.stringify({ error: { message: '토큰 형식이 올바르지 않습니다.' } }), 400);

    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않거나 만료된 토큰입니다.' } }), 401);
    if (!env.DB) return cors(JSON.stringify({ error: { message: '데이터베이스가 연결되지 않았습니다.' } }), 500);

    // 1차: 인메모리 빠른 거부 (3초 이내 연속 요청 차단)
    if (!checkRateLimit(`chat:${email}`, 3000)) {
      return cors(JSON.stringify({ error: { message: '요청이 너무 빠릅니다. 잠시 후 다시 시도해주세요.' } }), 429);
    }
    // 2차: Cloudflare 분산 Rate Limit (분당 10회 — 전 인스턴스 통합)
    if (!await cfRateLimit(env.RL_CHAT, email)) {
      return cors(JSON.stringify({ error: { message: '분당 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' } }), 429);
    }

    let body;
    try { 
      body = await request.json(); 
    } catch { 
      return cors(JSON.stringify({ error: { message: '올바르지 않은 JSON 요청 형식입니다.' } }), 400); 
    }
    const { mode, lang, contents, birth } = body;

    // 정확한 사주 원국(만세력) — solo 모드에서 생년월일시가 오면 서버에서 코드로 계산
    const saju = (mode === 'solo' && birth && birth.year)
      ? computeSaju(birth.year, birth.month, birth.day, birth.hour)
      : null;

    // contents 검증: 개수 + 총 텍스트 크기 (과대 payload 방지, max 32KB)
    if (!Array.isArray(contents) || contents.length > 50) {
      return cors(JSON.stringify({ error: { message: '올바르지 않은 요청 형식입니다.' } }), 400);
    }
    const totalChars = contents.reduce((s, c) =>
      s + (c?.parts?.reduce((ps, p) => ps + (typeof p?.text === 'string' ? p.text.length : 0), 0) || 0), 0);
    if (totalChars > 32768) {
      return cors(JSON.stringify({ error: { message: '요청 내용이 너무 깁니다.' } }), 400);
    }

    // ── 원자적 토큰 차감 (duo 모드 = 2토큰, solo = 1토큰) ──
    const tokenCost = (mode === 'duo') ? 2 : 1;
    const useId = `use_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const deductResult = await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       SELECT ?, ?, 'gemini_use', 0, ?, 'approved', unixepoch()
       WHERE (SELECT COALESCE(SUM(tokens), 0) FROM payment_requests WHERE user_email = ? AND status = 'approved') >= ?`
    ).bind(useId, email, -tokenCost, email, tokenCost).run();

    // rows_written === 0 이면 잔액 부족 (원자적으로 검증됨)
    if (!deductResult.meta?.rows_written) {
      const msg = (mode === 'duo')
        ? '우리의 조화는 토큰 2개가 필요합니다. 잔액이 부족해요.'
        : '보유하신 토큰이 부족합니다. 충전 후 이용해주세요.';
      return cors(JSON.stringify({ error: { message: msg } }), 403);
    }

    const il = ilchin();
    const on = ON[lang || 'ko'];
    
    let langInstruct = '한국어로 답변해 주세요.';
    if (lang === 'en') langInstruct = 'Please respond in English.';
    if (lang === 'zh') langInstruct = '请用简体中文回答。';
    if (lang === 'ja') langInstruct = '必ず日本語でお答えください。';

    const basePrompt = `Ilchin today: ${CG[il.ci]}${JJ[il.ji]} · Primary Ohaeng: ${on[il.o]} · Secondary: ${on[il.jo]}\n${langInstruct}\nRules: Use "energy reading / flow / prescription" — never "fortune-telling / fate / divination".\nNo definitive predictions. Frame negatives as areas for balance. No markdown bold. End with ONE tag: #木 #火 #土 #金 or #水\n\nHANJA RULE (CRITICAL): When writing the reading in Korean, if you use any Chinese character or difficult Sino-Korean term, you MUST immediately follow it with its meaning in plain Korean in parentheses. Examples: 甲木(갑목, 강한 나무 기운), 天干(천간, 하늘의 기운 10가지), 地支(지지, 땅의 기운 12가지), 庚寅(경인, 쇠와 호랑이의 기운), 相生(상생, 서로 도움), 相剋(상극, 서로 충돌). Simple everyday words do NOT need explanation. Speak warmly and naturally — like a kind friend, not an academic.`;

    const fallbackPrompt = `\nCritical Safe Guide: If the user asks general trivia, cooking, coding, or any topic completely unrelated to Saju, Ohaeng, and daily energy flow, DO NOT freeze or throw a safety block. Instead, kindly reply in the requested language that you are the Ohaeng Energy Master of M;Y 安, and gently guide them to ask about their spiritual energy reading or destiny elements.`;

    // 정확한 사주 원국 블록 (계산됐을 때만) — AI엔 해석만 시키고 재계산 금지
    const sajuBlock = saju
      ? `\n\n[정확한 사주 원국 — 서버에서 만세력(절기 반영)으로 계산한 확정값. 절대 재계산·추측하지 말고 반드시 이 값만 사용]\n${saju.text}`
      : '';

    // solo 모드: 응답 전체를 JSON 구조로 반환 (responseMimeType: application/json)
    const ohaengJsonInstruction = `\n\nOUTPUT FORMAT (MANDATORY): Return ONLY a valid JSON object — no markdown, no code block, no extra text. Use exactly this structure:\n{\"reading\":\"<your full warm poetic saju reading here, including the #tag>\",\"ohaeng\":{\"木\":N,\"火\":N,\"土\":N,\"金\":N,\"水\":N}}\nFor ohaeng: each N is an integer 0–100, all five must sum to exactly 100. ${saju ? 'Derive these from the EXACT element distribution in [정확한 사주 원국] above — do NOT invent or recalculate the pillars.' : "Base on the user's actual Saju pillars; if birth info is incomplete, estimate from available data."}`;

    const sysText = (mode === 'solo')
      ? `You are the Ohaeng Energy Master of M;Y 安.\n${basePrompt}${fallbackPrompt}${sajuBlock}\n\nMethod: (1) ${saju ? 'Use the EXACT Saju pillars given in [정확한 사주 원국] above — do NOT recalculate them from the birth date.' : 'Identify Saju Ohaeng from birth date/time.'} (2) Analyze harmony/conflict with today's Ilchin. (3) Conclude most needed Ohaeng. (4) Write warm, easy-to-read long-form reading in simple everyday language. (5) Give one specific, practical advice for today that anyone can act on.${ohaengJsonInstruction}`
      : `You are the Ohaeng Harmony Master of M;Y 安.\n${basePrompt}${fallbackPrompt}\n\nMethod: (1) Each person's Saju Ohaeng in plain words. (2) Explain the relationship dynamics simply — how their energies work together or clash, using everyday metaphors. (3) Today's energy impact on the relationship. (4) How they complement each other in practical daily life. (5) Suggest a shared activity or topic. Long-form, warm, simple tone. NEVER say "compatibility is bad".`;

    const geminiReqBody = {
      systemInstruction: { parts: [{ text: sysText }] },
      contents: contents,
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      ],
      generationConfig: { temperature: 0.75, maxOutputTokens: mode === 'solo' ? 8192 : 4096, topP: 0.95, ...(mode === 'solo' ? { responseMimeType: 'application/json' } : {}) },
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiReqBody) }
    );

    // [케이스 A] 네트워크 단의 물리적 서버 호출 실패 발생 시 환불 처리
    if (!res.ok) {
      const refundId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.prepare(
        `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'gemini_refund', 0, 1, 'approved', unixepoch())`
      ).bind(refundId, email).run();

      const errorData = await res.json().catch(() => ({}));
      return cors(JSON.stringify({ error: { message: 'Gemini API 호출에 실패하여 토큰이 환불되었습니다.', details: errorData } }), res.status);
    }

    const data = await res.json();
    
    // 🌟 [버그 픽스 핵심 코드] HTTP는 200이지만 세이프티 필터 등으로 차단되어 대답 본문이 공백인 경우 환불 처리
    const cand = data?.candidates?.[0];
    const rawText = cand?.content?.parts?.[0]?.text;

    if (!rawText) {
      const safetyRefundId = `ref_safe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.prepare(
        `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'gemini_safety_refund', 0, 1, 'approved', unixepoch())`
      ).bind(safetyRefundId, email).run();

      // 환불 완료된 잔액을 다시 계산해서 담아줌 (프론트 UI 자동 동기화 대응)
      const balRow = await env.DB.prepare(
        `SELECT COALESCE(SUM(tokens), 0) as total FROM payment_requests WHERE user_email = ? AND status = 'approved'`
      ).bind(email).first();
      data._tokens = balRow?.total || 0;
      
      return cors(JSON.stringify(data), 200);
    }

    // [케이스 B] 대답이 성공적으로 잘 수신되어 통과한 경우 잔액 최신화
    if (data.candidates) {
      const balRow = await env.DB.prepare(
        `SELECT COALESCE(SUM(tokens), 0) as total FROM payment_requests WHERE user_email = ? AND status = 'approved'`
      ).bind(email).first();
      data._tokens = balRow?.total || 0;

      // solo 모드: JSON 응답 파싱 → reading/ohaeng 분리
      if (mode === 'solo' && rawText) {
        let extracted = false;
        try {
          // 마크다운 코드블록 제거 후 파싱
          const jsonStr = rawText.replace(/^```json\s*/i, '').replace(/\s*```\s*$/, '').trim();
          const parsed = JSON.parse(jsonStr);
          // ohaeng 객체 추출 (필수)
          if (parsed.ohaeng && typeof parsed.ohaeng === 'object') {
            data._ohaeng = parsed.ohaeng;
            // reading 키 다양한 이름 허용 (LLM이 key명을 바꾸는 경우 대응)
            const reading = parsed.reading || parsed.message || parsed.content
              || parsed.text || parsed.result
              || Object.entries(parsed)
                  .filter(([k]) => k !== 'ohaeng')
                  .map(([, v]) => v)
                  .find(v => typeof v === 'string' && v.length > 10)
              || '';
            if (reading) {
              data.candidates[0].content.parts[0].text = reading;
              extracted = true;
            }
          }
        } catch { /* not valid JSON — fall through to regex */ }

        if (!extracted) {
          // fallback 1: JSON이 잘렸어도 "reading" 키에서 텍스트 추출 시도
          // (maxOutputTokens 초과로 JSON 미완성 시 reading 내용만 꺼내 표시)
          const readingMatch = rawText.match(/"reading"\s*:\s*"([\s\S]+)/);
          if (readingMatch) {
            let rt = readingMatch[1];
            // 닫히는 따옴표+쉼표(ohaeng으로 이어지는 경우) 또는 닫힘 따옴표+괄호 찾아 잘라냄
            const closeIdx = rt.search(/",\s*"ohaeng"|"\s*\}/);
            if (closeIdx > 0) rt = rt.slice(0, closeIdx);
            // JSON 이스케이프 복원
            rt = rt.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
                   .replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            if (rt.trim().length > 20) {
              data.candidates[0].content.parts[0].text = rt.trim();
              extracted = true;
            }
          }
        }
        if (!extracted) {
          // fallback 2: regex로 ohaeng 블록 추출
          const m = rawText.match(/"ohaeng"\s*:\s*(\{[^}]+\})/);
          if (m) {
            try { data._ohaeng = JSON.parse(m[1]); } catch {}
          }
          // JSON 전체 블록 제거 후 reading 텍스트만 남김
          // 빈 문자열이 되면 원본 rawText 유지 (최소한 어떤 텍스트라도 표시)
          const stripped = rawText
            .replace(/^```json\s*/gi, '').replace(/\s*```\s*$/g, '')
            .replace(/^\s*\{[\s\S]*?"ohaeng"\s*:\s*\{[^}]+\}\s*\}\s*$/m, '')
            .replace(/\{[^{}]*"ohaeng"\s*:\s*\{[^}]+\}[^{}]*\}/g, '')
            .trim();
          data.candidates[0].content.parts[0].text = stripped || rawText;
        }
      }
    }

    return cors(JSON.stringify(data), 200);

  } catch (e) {
    return cors(JSON.stringify({ error: { message: '서버 오류가 발생했습니다.' } }), 500);
  }
}

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
  }), 200);
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
    // API 통신 허용 출처 (토스페이먼츠 API + GIS gsi 엔드포인트 추가)
    "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://generativelanguage.googleapis.com https://api.tosspayments.com https://script.google.com",
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
async function handleDetailReading(request, env) {
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { date, ohaeng, lang = 'ko', birth, p2 } = await request.json().catch(() => ({}));
    if (!date || !ohaeng) return cors(JSON.stringify({ error: { message: 'date, ohaeng 필수' } }), 400);

    // 사용자 사주 원국(만세력) — 생년월일시가 오면 서버에서 정확히 계산 (AI 재계산 금지)
    const saju  = (birth && birth.year) ? computeSaju(birth.year, birth.month, birth.day, birth.hour) : null;
    const saju2 = (p2 && p2.year)       ? computeSaju(p2.year, p2.month, p2.day, p2.hour) : null;
    let sajuBlock = '';
    if (saju && saju2) {
      // 우리의 조화(2인) 상세풀이 — 두 사람의 확정 사주 기반 관계 풀이
      sajuBlock = `\n\n[두 사람의 사주 원국 — 서버 만세력 계산 확정값. 재계산·추측 금지]\n첫 번째 분: ${saju.text}\n두 번째 분: ${saju2.text}\n반드시 두 사람의 일간(본질)과 오행 분포를 비교·반영하여, 오늘(${date}) 기운 속에서 두 사람의 관계를 개인 맞춤으로 풀어주세요. 아래 4영역은 '두 사람의 관계' 관점으로 해석하세요.`;
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

아래 4가지 영역에 대해 ${langLabel}로 조언해주세요.
중요: 한자나 어려운 사주 용어(예: 甲木, 天干, 地支, 相生 등)를 쓸 경우 반드시 바로 옆에 괄호로 뜻을 써주세요. 예) 甲木(갑목, 강한 나무 기운), 相生(상생, 서로 돕는 관계). 일상적인 쉬운 단어는 풀이 불필요. 따뜻하고 친근한 말투로, 각 영역 150자 이상.

1. 🏥 건강: 오늘 몸과 마음을 어떻게 챙기면 좋을지 구체적인 행동 조언
2. 💰 재물: 오늘 돈·일·사업과 관련해 주의할 점과 좋은 기회
3. 💝 관계: 가족·친구·연인 관계에서 오늘 특히 신경 쓸 점과 좋은 기회
4. 🎯 행운: 오늘 특히 좋은 시간대, 색깔, 숫자와 그 이유를 알기 쉽게

JSON 형식으로 답하세요:
{"health":"...","wealth":"...","relationships":"...","fortune":"..."}`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ responseMimeType:'application/json', temperature:0.8 } }) }
    );
    const data = await resp.json();
    const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const detail = JSON.parse(raw);
    return cors(JSON.stringify({ success:true, detail, remaining: remainingTokens }), 200);
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
      if (row.last_checkin === today) return cors(JSON.stringify({alreadyDone:true, current:row.current_streak, max:row.max_streak, total:row.total_checkins}),200);
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

    // 7일 스트릭 보너스
    if (current%7===0) {
      await env.DB.prepare(
        `UPDATE payment_requests SET tokens=tokens+5 WHERE user_email=?`
      ).bind(email).run();
    }

    return cors(JSON.stringify({success:true,current,max,total,bonus:current%7===0}),200);
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
    // 보상: 양쪽 3토큰
    await env.DB.prepare('UPDATE referrals SET referee_email=?,rewarded_at=unixepoch() WHERE code=?').bind(email,code.toUpperCase()).run();
    await env.DB.prepare('UPDATE payment_requests SET tokens=tokens+3 WHERE user_email=?').bind(email).run();
    await env.DB.prepare('UPDATE payment_requests SET tokens=tokens+3 WHERE user_email=?').bind(ref.referrer_email).run();
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
      // 방법 1: PIN 인증
      const UNGI_PIN = env.UNGI_PIN || '5984'; // fallback
      const pinMatch = pin === UNGI_PIN;

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

    // 토큰 지급
    await env.DB.prepare('UPDATE payment_requests SET tokens=tokens+? WHERE user_email=?')
      .bind(tokens, email).run();

    // 로그 기록
    await env.DB.prepare('INSERT INTO ungi_token_gifts (user_email, tokens_given, gifted_by) VALUES (?, ?, ?)')
      .bind(email, tokens, 'UNGI_STORE').run();

    return cors(JSON.stringify({ success: true, tokens, email }), 200);
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
// 카페 직원 PIN — 변경하려면 이 숫자를 수정 후 재배포
const CAFE_STAFF_PIN = '7777';

const PROMO_CODES = {
  'MYAN_CAFE': { tokens: 3, label: '카페 방문 혜택' },
};

async function handlePromoClaim(request, env) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return cors(JSON.stringify({ error: '로그인이 필요합니다.' }), 401);

  let email;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    email = payload.email;
    if (!email) throw new Error('no email');
  } catch {
    return cors(JSON.stringify({ error: '인증 오류입니다.' }), 401);
  }

  const { code, pin, promo_token } = await request.json().catch(() => ({}));

  // 다이나믹 1회용 토큰 처리
  if (promo_token) {
    return handleDynamicPromoClaim(request, env, email, promo_token);
  }

  const promo = PROMO_CODES[code?.toUpperCase()];
  if (!promo) return cors(JSON.stringify({ error: '유효하지 않은 코드입니다.' }), 400);

  // PIN 검증 (브루트포스 방지: 입력값 길이 제한)
  if (promo.requirePin) {
    if (!pin || String(pin).length > 8) {
      return cors(JSON.stringify({ error: '직원 확인 PIN을 입력해 주세요.' }), 400);
    }
    if (String(pin) !== CAFE_STAFF_PIN) {
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
const PROMO_ADMIN_PIN = '9999'; // 카운터 태블릿용 관리자 PIN (변경 가능)
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
  if (adminPin !== PROMO_ADMIN_PIN) {
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
  if (adminPin !== PROMO_ADMIN_PIN) {
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
  const authed = pin === PROMO_ADMIN_PIN;

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

    const { birth, lang = 'ko', ref } = await request.json().catch(() => ({}));
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

    const userMsg = `${lang === 'ko' ? '생년월일' : 'Birth date'}: ${birth}
${lang === 'ko' ? '오늘의 기운과 나의 오행 궁합을 짧게 풀어주세요.' : "Give me a short reading of today's energy and my five elements."}`;

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
