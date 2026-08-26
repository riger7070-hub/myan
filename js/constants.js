// M;Y 安 — constants.js  (오행 상수·전역 상태·일진 계산)
const EP = "https://myan.riger7070.workers.dev/";
let lang = 'ko', mode = null, hist = [];

/* 오행 데이터 */
const CG   = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const CG_K = ['갑','을','병','정','무','기','경','신','임','계'];
const CG_P = ['jiǎ','yǐ','bǐng','dīng','wù','jǐ','gēng','xīn','rén','guǐ'];
const JJ   = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const JJ_K = ['자','축','인','묘','진','사','오','미','신','유','술','해'];
const JJ_P = ['zǐ','chǒu','yín','mǎo','chén','sì','wǔ','wèi','shēn','yǒu','xū','hài'];
const CGO  = ['木','木','火','火','土','土','金','金','水','水'];
const JJO  = ['水','土','木','木','土','火','火','土','金','金','土','水'];
const OC   = {木:'#4bc87a',火:'#e05a4a',土:'#d4a040',金:'#a0aab4',水:'#5aa8e0'};
const OBG  = {木:'rgba(75,200,122,.08)',火:'rgba(224,90,74,.08)',土:'rgba(212,160,64,.08)',金:'rgba(160,170,180,.08)',水:'rgba(90,168,224,.08)'};

// 오늘의 일진(日辰) — 날이 넘어가는 기준은 **KST 자정**이다.
//
// 예전엔 new Date().setHours(0,0,0,0) 으로 브라우저의 로컬 자정을 썼다. 그러면 사용자가
// 어디 있느냐에 따라 "오늘"이 달라져서, 서버(로컬이 UTC 라 09:00 KST 에 날을 넘긴다)가
// 만든 AI 본문과 이 화면의 오행 게이지가 다른 기운을 말했다. 이제 양쪽이 KST 한 축만 본다.
//
// ⚠️ worker.js 에 같은 함수가 한 번 더 있다 — 한쪽만 고치면 화면과 본문이 다시 어긋난다.
function ilchin() {
  const day    = Math.floor((Date.now() + 9 * 3600000) / 864e5);  // KST 기준 epoch 일수
  const refDay = Date.UTC(2023, 0, 1) / 864e5;                    // 2023-01-01(KST) 을 같은 축에서
  const idx = ((44 + day - refDay) % 60 + 60) % 60;
  return { ci: idx%10, ji: idx%12, o: CGO[idx%10], jo: JJO[idx%12] };
}

const ON = {
  ko:{木:'목(木)',火:'화(火)',土:'토(土)',金:'금(金)',水:'수(水)'},
  en:{木:'Wood',火:'Fire',土:'Earth',金:'Metal',水:'Water'},
  zh:{木:'木气',火:'火气',土:'土气',金:'金气',水:'水气'},
  ja:{木:'木(もく)',火:'火(か)',土:'土(ど)',金:'金(きん)',水:'水(すい)'},
};

// 상세 풀이 개별 카테고리 — 백엔드 worker.js의 DETAIL_CATEGORIES와 키를 맞출 것
const DETAIL_CATS = [
  { key:'wealth', icon:'💰' },
  { key:'love',   icon:'💕' },
  { key:'career', icon:'💼' },
  { key:'health', icon:'🏥' },
];

// 띠(12지) 이름 — 인덱스는 백엔드 worker.js의 ZODIAC_ANIMALS_KO와 순서를 맞출 것
const ZODIAC_ANIMAL_NAMES = {
  ko: ['원숭이','닭','개','돼지','쥐','소','호랑이','토끼','용','뱀','말','양'],
  en: ['Monkey','Rooster','Dog','Pig','Rat','Ox','Tiger','Rabbit','Dragon','Snake','Horse','Goat'],
  zh: ['猴','鸡','狗','猪','鼠','牛','虎','兔','龙','蛇','马','羊'],
  ja: ['申(猿)','酉(鶏)','戌(犬)','亥(猪)','子(鼠)','丑(牛)','寅(虎)','卯(兎)','辰(龍)','巳(蛇)','午(馬)','未(羊)'],
};
// 서양 별자리 이름 — 인덱스는 백엔드 worker.js의 WESTERN_ZODIAC_KO와 순서를 맞출 것
const WESTERN_ZODIAC_NAMES = {
  ko: ['염소자리','물병자리','물고기자리','양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리','천칭자리','전갈자리','사수자리'],
  en: ['Capricorn','Aquarius','Pisces','Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius'],
  zh: ['摩羯座','水瓶座','双鱼座','白羊座','金牛座','双子座','巨蟹座','狮子座','处女座','天秤座','天蝎座','射手座'],
  ja: ['やぎ座','みずがめ座','うお座','おひつじ座','おうし座','ふたご座','かに座','しし座','おとめ座','てんびん座','さそり座','いて座'],
};

// 천궁도(트랜싯)용 이름표.
// ⚠️ 위 WESTERN_ZODIAC_NAMES 와 순서가 다르다. 저쪽은 날짜 판정표(_getWesternZodiacIndex)에
// 맞춰 염소자리부터 시작하지만, 천궁도의 signIndex 는 황경 0도 = 양자리 기준이라 양자리부터다.
// 두 표를 섞어 쓰면 별자리가 9칸씩 밀리므로 반드시 구분할 것.
// 백엔드 worker.js 의 SIGN_NAMES / BODY_NAMES / ASPECT_NAMES 와 순서·키를 맞춰야 한다.
const ASTRO_SIGN_NAMES = {
  ko: ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리','천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'],
  en: ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'],
  zh: ['白羊座','金牛座','双子座','巨蟹座','狮子座','处女座','天秤座','天蝎座','射手座','摩羯座','水瓶座','双鱼座'],
  ja: ['牡羊座','牡牛座','双子座','蟹座','獅子座','乙女座','天秤座','蠍座','射手座','山羊座','水瓶座','魚座'],
};
const ASTRO_BODY_ORDER = ['sun','moon','mercury','venus','mars','jupiter','saturn'];
const ASTRO_BODY_ICONS = { sun:'☉', moon:'☽', mercury:'☿', venus:'♀', mars:'♂', jupiter:'♃', saturn:'♄' };
const ASTRO_BODY_NAMES = {
  ko: { sun:'태양', moon:'달', mercury:'수성', venus:'금성', mars:'화성', jupiter:'목성', saturn:'토성' },
  en: { sun:'Sun', moon:'Moon', mercury:'Mercury', venus:'Venus', mars:'Mars', jupiter:'Jupiter', saturn:'Saturn' },
  zh: { sun:'太阳', moon:'月亮', mercury:'水星', venus:'金星', mars:'火星', jupiter:'木星', saturn:'土星' },
  ja: { sun:'太陽', moon:'月', mercury:'水星', venus:'金星', mars:'火星', jupiter:'木星', saturn:'土星' },
};
const ASTRO_ASPECT_ICONS = { conjunction:'☌', sextile:'⚹', square:'□', trine:'△', opposition:'☍' };
const ASTRO_ASPECT_NAMES = {
  ko: { conjunction:'합', sextile:'육각', square:'사각', trine:'삼각', opposition:'대립' },
  en: { conjunction:'Conjunction', sextile:'Sextile', square:'Square', trine:'Trine', opposition:'Opposition' },
  zh: { conjunction:'合相', sextile:'六分相', square:'四分相', trine:'三分相', opposition:'对分相' },
  ja: { conjunction:'合', sextile:'セクスタイル', square:'スクエア', trine:'トライン', opposition:'オポジション' },
};

// 오행 유형 테스트 — 질문 옵션 순서와 백엔드 worker.js의 TYPE_ELEMENTS 순서를 맞출 것
const TYPE_ORDER = ['木','火','土','金','水'];

// 달의 위상 — 인덱스는 백엔드 worker.js의 MOON_PHASE_KO와 순서를 맞출 것
// 0=삭 1=초승 2=상현 3=차오름 4=보름 5=기움 6=하현 7=그믐
const MOON_PHASE_ICONS = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'];
const MOON_PHASE_NAMES = {
  ko: ['삭(신월)','초승달','상현달','차오르는 달','보름달','기우는 달','하현달','그믐달'],
  en: ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous','Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'],
  zh: ['新月','蛾眉月','上弦月','盈凸月','满月','亏凸月','下弦月','残月'],
  ja: ['新月','三日月','上弦の月','十三夜月','満月','寝待月','下弦の月','有明月'],
};

// 달의 위상 계산 — 서버 worker.js의 moonPhase()와 동일한 천문 상수·식을 쓴다.
// (홈 화면 표시는 서버 왕복 없이 즉시 그리기 위해 클라이언트에서도 계산)
function moonPhaseLocal(date = new Date()) {
  const SYNODIC = 29.530588853, NEW_MOON_JD = 2451550.09766, UNIX_EPOCH_JD = 2440587.5;
  const jd = date.getTime() / 86400000 + UNIX_EPOCH_JD;
  let age = (jd - NEW_MOON_JD) % SYNODIC;
  if (age < 0) age += SYNODIC;
  return {
    age,
    illumination: (1 - Math.cos(2 * Math.PI * age / SYNODIC)) / 2,
    index: Math.floor((age / SYNODIC) * 8 + 0.5) % 8,
  };
}

// 수성 역행 — 서버 worker.js의 mercuryRetrograde()와 동일한 궤도요소·식.
// ⚠ 둘 중 하나만 고치면 홈 배지와 운세 내용이 어긋난다. 반드시 함께 수정할 것.
const _ORBIT_LOCAL = {
  mercury: { a:0.38709927, e:0.20563593, I:7.00497902, L:252.25032350, lp:77.45779628, node:48.33076593,
             da:0.00000037, de:0.00001906, dI:-0.00594749, dL:149472.67411175, dlp:0.16047689, dnode:-0.12534081 },
  earth:   { a:1.00000261, e:0.01671123, I:-0.00001531, L:100.46457166, lp:102.93768193, node:0.0,
             da:0.00000562, de:-0.00004392, dI:-0.01294668, dL:35999.37244981, dlp:0.32327364, dnode:0.0 },
};
function _helioXYLocal(p, T) {
  const D = Math.PI / 180;
  const a = p.a + p.da * T, e = p.e + p.de * T;
  const I = (p.I + p.dI * T) * D, L = (p.L + p.dL * T) * D;
  const lp = (p.lp + p.dlp * T) * D, node = (p.node + p.dnode * T) * D;
  const w = lp - node;
  let M = L - lp;
  M = ((M + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 10; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  const xv = a * (Math.cos(E) - e), yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cn = Math.cos(node), sn = Math.sin(node), ci = Math.cos(I);
  return {
    x: (cw * cn - sw * sn * ci) * xv + (-sw * cn - cw * sn * ci) * yv,
    y: (cw * sn + sw * cn * ci) * xv + (-sw * sn + cw * cn * ci) * yv,
  };
}
function _mercuryLonLocal(date) {
  const T = (date.getTime() / 86400000 + 2440587.5 - 2451545.0) / 36525;
  const m = _helioXYLocal(_ORBIT_LOCAL.mercury, T), e = _helioXYLocal(_ORBIT_LOCAL.earth, T);
  return Math.atan2(m.y - e.y, m.x - e.x);
}
function mercuryRetrogradeLocal(date = new Date()) {
  const at = (d) => {
    const a = _mercuryLonLocal(new Date(d.getTime() - 43200000));
    const b = _mercuryLonLocal(new Date(d.getTime() + 43200000));
    let x = b - a;
    while (x > Math.PI) x -= 2 * Math.PI;
    while (x < -Math.PI) x += 2 * Math.PI;
    return x < 0;
  };
  if (!at(date)) return { retrograde: false };
  for (let k = 1; k <= 30; k++) {
    const d = new Date(date.getTime() + k * 86400000);
    if (!at(d)) {
      // 역행하는 마지막 날을 KST 기준으로 (서버 mercuryRetrograde()와 동일 규칙)
      const lastDay = new Date(d.getTime() - 86400000 + 9 * 3600000);
      return { retrograde: true, endsAt: lastDay.toISOString().slice(0, 10) };
    }
  }
  return { retrograde: true, endsAt: null };
}

// 오늘의 운세 모음 — 키는 백엔드 worker.js의 FORTUNE_TOPICS와 맞출 것. 라벨은 locales.js의 fortuneTopicTitle에서.
const FORTUNE_TOPICS = [
  { key:'crush',       icon:'💌' },
  { key:'trust',       icon:'🕊️' },
  { key:'family',      icon:'👪' },
  { key:'future',      icon:'🌠' },
  { key:'grades',      icon:'📚' },
  { key:'personality', icon:'🎭' },
  { key:'appearance',  icon:'💫' },
  { key:'success',     icon:'🚀' },
];

// 한글 단독 이름 (일반인용)
const ON_KR = { 木:'목', 火:'화', 土:'토', 金:'금', 水:'수' };
