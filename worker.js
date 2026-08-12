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

// 오늘의 일진(日辰) — 날이 넘어가는 기준은 **KST 자정**이다.
//
// 예전엔 new Date().setHours(0,0,0,0) 으로 런타임의 로컬 자정을 썼다. 그러면 "오늘"이
// 코드가 도는 곳마다 달라진다 — 워커는 로컬이 UTC 라 09:00 KST 에 날을 넘기고, 브라우저는
// 사용자가 있는 지역의 자정에 넘긴다. 그래서 한국 사용자는 00:00~09:00 KST 사이에 화면의
// 오행 게이지(js/constants.js 의 사본이 계산)와 유료로 받은 AI 본문(서버가 계산)이 서로
// 다른 기운을 말했고, 해외 사용자는 그 둘과 또 달랐다. 이제 양쪽이 KST 한 축만 본다.
//
// 2023-01-01(KST) = 44 라는 기준점은 그대로다. 한국 브라우저가 보던 값은 바뀌지 않고,
// 서버가 그 값에 맞춰 온다(test/ilchin-kst.test.mjs 가 날짜별 기준값으로 고정한다).
//
// ⚠️ 이 함수는 js/constants.js 에 같은 내용으로 한 번 더 있다 — 한쪽만 고치면 다시 어긋난다.
function ilchin() {
  const day    = Math.floor((Date.now() + 9 * 3600000) / 864e5);  // KST 기준 epoch 일수
  const refDay = Date.UTC(2023, 0, 1) / 864e5;                    // 2023-01-01(KST) 을 같은 축에서
  const idx = ((44 + day - refDay) % 60 + 60) % 60;
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

// ── 수성 역행 — 실제 궤도 계산 ──
// 지구와 수성의 위치를 각각 구해 "지구에서 본 수성의 황경"이 줄어드는지로 판정한다.
// 역행은 실제 후진이 아니라 두 행성의 공전 속도 차로 생기는 겉보기 현상이므로
// 지구 위치를 함께 계산해야 한다.
// JPL 근사 궤도요소(1800~2050 유효). js/constants.js의 클라이언트 구현과 값이 같아야 함.
const _ORBIT = {
  mercury: { a:0.38709927, e:0.20563593, I:7.00497902, L:252.25032350, lp:77.45779628, node:48.33076593,
             da:0.00000037, de:0.00001906, dI:-0.00594749, dL:149472.67411175, dlp:0.16047689, dnode:-0.12534081 },
  venus:   { a:0.72333566, e:0.00677672, I:3.39467605, L:181.97909950, lp:131.60246718, node:76.67984255,
             da:0.00000390, de:-0.00004107, dI:-0.00078890, dL:58517.81538729, dlp:0.00268329, dnode:-0.27769418 },
  mars:    { a:1.52371034, e:0.09339410, I:1.84969142, L:-4.55343205, lp:-23.94362959, node:49.55953891,
             da:0.00001847, de:0.00007882, dI:-0.00813131, dL:19140.30268499, dlp:0.44441088, dnode:-0.29257343 },
  earth:   { a:1.00000261, e:0.01671123, I:-0.00001531, L:100.46457166, lp:102.93768193, node:0.0,
             da:0.00000562, de:-0.00004392, dI:-0.01294668, dL:35999.37244981, dlp:0.32327364, dnode:0.0 },
  // 목성·토성은 점성술에서 '느린 행성'으로 비중이 크다(한 별자리에 1년/2.5년씩 머문다).
  // 위와 같은 JPL 근사 케플러 원소표(1800~2050 유효).
  jupiter: { a:5.20288700, e:0.04838624, I:1.30439695, L:34.39644051, lp:14.72847983, node:100.47390909,
             da:-0.00011607, de:-0.00013253, dI:-0.00183714, dL:3034.74612775, dlp:0.21252668, dnode:0.20469106 },
  saturn:  { a:9.53667594, e:0.05386179, I:2.48599187, L:49.95424423, lp:92.59887831, node:113.66242448,
             da:-0.00125060, de:-0.00050991, dI:0.00193609, dL:1222.49362201, dlp:-0.41897216, dnode:-0.28867794 },
};

// 역행 중일 때 AI에 넘길 의미. 점성술에서 통용되는 해석을 그대로 쓰되,
// 겁주는 방향이 아니라 "무엇을 조심하면 되는지"로 프레이밍한다.
const _RETRO_MEANING = {
  mercury: { ko:'수성', hint:'소통·계약·이동에서 오해나 지연이 생기기 쉬운 시기' },
  venus:   { ko:'금성', hint:'연애·관계·금전에서 지난 인연이나 결정을 돌아보게 되는 시기' },
  mars:    { ko:'화성', hint:'추진력이 더디고 갈등이 불거지기 쉬워, 새로 벌이기보다 정비에 좋은 시기' },
};

// 궤도요소 → 황도면 직교좌표(태양 중심). 케플러 방정식은 뉴턴법으로 푼다.
function _helioXY(p, T) {
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

// 지구에서 본 행성의 황경(rad)
function _planetLon(planet, date) {
  const T = (date.getTime() / 86400000 + UNIX_EPOCH_JD - 2451545.0) / 36525;
  const p = _helioXY(_ORBIT[planet], T), e = _helioXY(_ORBIT.earth, T);
  return Math.atan2(p.y - e.y, p.x - e.x);
}

function _isRetroAt(planet, date) {
  const a = _planetLon(planet, new Date(date.getTime() - 43200000));
  const b = _planetLon(planet, new Date(date.getTime() + 43200000));
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;   // 0/360도 경계 넘어갈 때 부호가 뒤집히는 것 방지
  while (d < -Math.PI) d += 2 * Math.PI;
  return d < 0;
}

// 역행 중이면 마지막 날까지 알려준다.
// endsAt은 "역행하는 마지막 날"을 KST 기준으로 준다.
// 순행으로 바뀐 첫날을 그대로 주면 "11/14까지"처럼 이미 끝난 날을 가리키게 되고,
// 앱의 다른 날짜 로직(_todayKST 등)이 전부 KST라 시간대도 맞춰야 한다.
// 탐색 상한은 행성별 최장 역행 기간을 넘게 잡는다(수성 24일, 금성 42일, 화성 80일).
const _RETRO_MAX_DAYS = { mercury: 35, venus: 55, mars: 95 };

function planetRetrograde(planet, date = new Date()) {
  if (!_ORBIT[planet] || planet === 'earth') return { retrograde: false };
  if (!_isRetroAt(planet, date)) return { retrograde: false };
  const limit = _RETRO_MAX_DAYS[planet] || 95;
  for (let k = 1; k <= limit; k++) {
    const d = new Date(date.getTime() + k * 86400000);
    if (!_isRetroAt(planet, d)) {
      const lastDay = new Date(d.getTime() - 86400000 + 9 * 3600000); // 전날 + KST 보정
      return { retrograde: true, endsAt: lastDay.toISOString().slice(0, 10) };
    }
  }
  return { retrograde: true, endsAt: null };
}

// ══════════════════════════════════════════════════════════════════════
//  천궁도(호로스코프) — 실제 행성 위치로 탄생 차트와 오늘의 트랜싯을 계산
//
//  위의 _planetLon() 은 이미 지구에서 본 행성의 황경을 실제로 구하고 있었지만,
//  여태 역행 판정에만 쓰고 값 자체는 버리고 있었다. 여기서 그 황경을 그대로 살려
//  "지금 어떤 행성이 어느 별자리에 있고, 서로 어떤 각도인가"를 만든다.
//
//  정밀도: 태양·행성은 JPL 근사 원소로 각분 수준(1800~2050). 달만 별도로 절단
//  급수(Meeus 저정밀식)를 써서 약 0.3도 오차인데, 별자리 한 칸이 30도라 배치
//  판정에는 충분하다. 다만 경계 근처에서는 흔들릴 수 있어 따로 표시해 준다.
// ══════════════════════════════════════════════════════════════════════
const _DEG = Math.PI / 180;
const _norm360 = d => ((d % 360) + 360) % 360;
const _julianCenturies = date => (date.getTime() / 86400000 + UNIX_EPOCH_JD - 2451545.0) / 36525;

// 12별자리 (황경 0도 = 양자리 0도부터 30도씩)
const ZODIAC_SIGNS = ['aries','taurus','gemini','cancer','leo','virgo',
                      'libra','scorpio','sagittarius','capricorn','aquarius','pisces'];

// 지구에서 본 태양의 황경(도). 태양은 지구 헬리오 좌표의 정반대편에 보인다.
function sunLonDeg(date = new Date()) {
  const e = _helioXY(_ORBIT.earth, _julianCenturies(date));
  return _norm360(Math.atan2(-e.y, -e.x) / _DEG);
}

// 달의 황경(도) — Meeus 저정밀식(주요 항만). 오차 약 0.3도.
// 달은 하루에 약 13도를 움직여서, 출생 '시각'을 모르면 최대 ±6.5도 오차가 더 붙는다.
// (이 서비스는 날짜만 받으므로 정오를 기준으로 계산한다 — sunLonDeg 등과 달리 호출부에서 맞춰준다.)
function moonLonDeg(date = new Date()) {
  const T = _julianCenturies(date);
  const D  = _norm360(297.8502042 + 445267.1115168 * T) * _DEG;  // 평균 이각
  const M  = _norm360(357.5291092 + 35999.0502909  * T) * _DEG;  // 태양 평균 근점이각
  const Mp = _norm360(134.9634114 + 477198.8676313 * T) * _DEG;  // 달 평균 근점이각
  const F  = _norm360( 93.2720993 + 483202.0175273 * T) * _DEG;  // 위도 인수

  const lon = 218.3164477 + 481267.88123421 * T
    + 6.289 * Math.sin(Mp)
    - 1.274 * Math.sin(Mp - 2 * D)
    + 0.658 * Math.sin(2 * D)
    + 0.214 * Math.sin(2 * Mp)
    - 0.186 * Math.sin(M)
    - 0.114 * Math.sin(2 * F);
  return _norm360(lon);
}

// 행성 황경(도)
function planetLonDeg(planet, date = new Date()) {
  return _norm360(_planetLon(planet, date) / _DEG);
}

// 차트에 올릴 천체. 태양·달을 포함하는 게 점성술 관례다(둘 다 '행성'으로 다룬다).
const CHART_BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];

function bodyLonDeg(body, date) {
  if (body === 'sun')  return sunLonDeg(date);
  if (body === 'moon') return moonLonDeg(date);
  return planetLonDeg(body, date);
}

// 황경 → 별자리 배치. 경계에서 1도 이내면 계산 오차로 뒤집힐 수 있어 표시해 둔다.
function signPlacement(lonDeg) {
  const lon = _norm360(lonDeg);
  const index = Math.floor(lon / 30) % 12;
  const degInSign = lon - index * 30;
  return {
    sign: ZODIAC_SIGNS[index],
    signIndex: index,
    degInSign: Math.round(degInSign * 10) / 10,
    nearCusp: degInSign < 1 || degInSign > 29,   // 경계 근처 — 해석에서 단정하지 않게
  };
}

// 주요 각(메이저 어스펙트)과 허용 오차(오브).
// 오브는 점성술 문헌에서 흔히 쓰는 범위 중 보수적인 쪽을 택했다 — 넓게 잡으면
// 아무 날에나 각이 잡혀서 "오늘은 특별하다"는 말이 매일 나온다.
const ASPECTS = [
  { name: 'conjunction', angle: 0,   orb: 8 },
  { name: 'sextile',     angle: 60,  orb: 4 },
  { name: 'square',      angle: 90,  orb: 6 },
  { name: 'trine',       angle: 120, orb: 6 },
  { name: 'opposition',  angle: 180, orb: 8 },
];

// 두 황경 사이의 각도(0~180)
function angularSeparation(a, b) {
  let d = Math.abs(_norm360(a) - _norm360(b)) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

// 두 천체가 이루는 각. 없으면 null.
function findAspect(lonA, lonB) {
  const sep = angularSeparation(lonA, lonB);
  for (const asp of ASPECTS) {
    const diff = Math.abs(sep - asp.angle);
    if (diff <= asp.orb) {
      return {
        name: asp.name,
        angle: asp.angle,
        orb: Math.round(diff * 10) / 10,
        // 오브가 작을수록 각이 '정확'하다 = 영향이 강하다고 본다
        strength: Math.round((1 - diff / asp.orb) * 100),
      };
    }
  }
  return null;
}

// 특정 시점의 차트(천체별 황경·별자리·역행 여부)
function buildChart(date) {
  const chart = {};
  for (const body of CHART_BODIES) {
    const lon = bodyLonDeg(body, date);
    chart[body] = {
      lon: Math.round(lon * 100) / 100,
      ...signPlacement(lon),
      // 태양·달은 지구에서 볼 때 역행하지 않는다
      retrograde: (body === 'sun' || body === 'moon') ? false : _isRetroAt(body, date),
    };
  }
  return chart;
}

// 생년월일 → 탄생 차트. 시각을 받지 않으므로 그날 정오(UTC)를 기준으로 삼는다.
// 정오를 쓰면 하루 중 어느 시각이든 오차가 최대 12시간으로 균등해진다(자정 기준이면 최대 24시간).
function natalChart(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (Number.isNaN(d.getTime())) return null;
  return buildChart(d);
}

// 오늘 하늘의 행성이 탄생 차트의 천체에 맺는 각(트랜싯).
// 강한 순으로 정렬해 상위 몇 개만 쓰게 한다 — 전부 나열하면 해석이 산만해진다.
function transitAspects(natal, transitChart) {
  const out = [];
  for (const t of CHART_BODIES) {
    for (const n of CHART_BODIES) {
      const asp = findAspect(transitChart[t].lon, natal[n].lon);
      if (asp) out.push({ transit: t, natal: n, ...asp });
    }
  }
  out.sort((a, b) => b.strength - a.strength);
  return out;
}

// 홈 배지 등 기존 호출부 호환용
function mercuryRetrograde(date = new Date()) {
  return planetRetrograde('mercury', date);
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
//  로컬(무료) 간단 사주 풀이 — Gemini 미호출, 엽전 미차감. 코드로 생성
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

const _OHAENG_ORDER = ['木','火','土','金','水'];

// 오행 개수 → 합이 정확히 100 인 정수 퍼센트.
//
// 최대잉여법(largest remainder): 내림한 뒤 남은 몫을 소수부가 큰 순서로 1씩 나눠 준다.
// 예전엔 반올림 오차 전부를 최댓값 하나에 몰아넣었는데(`p[mi] += diff`), 그러면
// 실제로는 같은 두 기운이 벌어져 보인다. 예를 들어 庚午/辛巳/庚辰/壬午 는 火 3개,
// 金 3개로 똑같은데 화36% 금38% 로 표시됐다. 거기에 _strongElem 이 퍼센트가 아니라
// 원본 개수를 따로 보고 최댓값을 골라서, 화면에 "금 38%" 를 띄워 놓고 바로 아랫줄에
// "가장 강한 기운: 화" 라고 적는 자기모순이 생년월일 4건 중 1건꼴로 나왔다.
// 아래 두 함수가 이 퍼센트에서 그대로 고르므로 숫자와 라벨은 항상 같은 것을 가리킨다.
function _ohaengPct(elem) {
  const total = _OHAENG_ORDER.reduce((a,k)=>a+(elem[k]||0),0);
  const out = {};
  if (!total) { _OHAENG_ORDER.forEach(k => out[k] = 0); return out; }

  const exact = _OHAENG_ORDER.map(k => (elem[k]||0)/total*100);
  const p = exact.map(Math.floor);
  const rest = 100 - p.reduce((a,b)=>a+b,0);   // 내림으로 잃은 몫 (0~4)
  // 소수부가 큰 순서, 같으면 木火土金水 순서 — 아래 두 함수의 동점 처리와 같은 기준.
  const byRemainder = _OHAENG_ORDER.map((_, i) => i)
    .sort((a,b) => (exact[b]-p[b]) - (exact[a]-p[a]) || a-b);
  for (let i = 0; i < rest; i++) p[byRemainder[i]]++;

  _OHAENG_ORDER.forEach((k,i) => out[k] = p[i]);
  return out;
}
// 동점이면 木火土金水 중 앞선 것 — _ohaengPct 가 잉여분을 주는 순서와 같다.
function _strongElem(elem){
  const pct = _ohaengPct(elem);
  return _OHAENG_ORDER.reduce((b,k) => pct[k] > pct[b] ? k : b, '木');
}
function _needElem(elem){
  // 아예 없는 기운이 있으면 그게 용신이다(0% 라 어차피 최솟값이기도 하다).
  const zero = _OHAENG_ORDER.find(k => (elem[k]||0) === 0);
  if (zero) return zero;
  const pct = _ohaengPct(elem);
  return _OHAENG_ORDER.reduce((b,k) => pct[k] < pct[b] ? k : b, '木');
}

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

// 무료 간단 풀이 엔드포인트 (Gemini 미호출 · 엽전 미차감)
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
          await saveSajuHistory(env, email, mode, p1, p2, out.reading, out.ohaeng, il.o).catch(() => {});
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

// ════════════════════════════════════════════
//  공용 운세 캐시 — 사람마다 달라지지 않는 글은 한 번만 만든다
//
//  일부 콘텐츠는 프롬프트에 사주 원국이 전혀 안 들어간다. 같은 카드를 뽑은 두 사람에게
//  줄 글은 애초에 같은 글이다. 그런데도 매번 Gemini 를 불러서, 분당 요청 한도에 걸려
//  동시 접속 5명이면 5명 다 실패했다(측정: 순차 12건 전부 성공 / 동시 5건 전부 실패).
//
//  캐시 단위는 "그 글을 결정하는 값 전부"를 이어 붙인 bucket 이다. 날짜가 프롬프트에
//  들어가는 것(띠·별자리, 럭키, 라이프패스)은 bucket 에 날짜를 넣어 하루마다 갈리고,
//  안 들어가는 것(타로, 룬, 유형궁합)은 날짜 없이 영구 재사용한다.
//
//  한 bucket 에 여러 변형을 담아 둘 수 있다(id = bucket#n). 있으면 그중 하나를 무작위로
//  주므로, 같은 띠·별자리인 두 사람이 나란히 비교해도 똑같은 문장이 나오지 않는다.
//  변형은 미리 만들어 둘 때만 늘어나고, 사용자 요청은 하나라도 있으면 절대 새로 안 만든다.
// ════════════════════════════════════════════

// 같은 isolate 안에서 같은 bucket 이 동시에 생성되는 것을 막는다.
// D1 은 네트워크 왕복이라, 캐시가 빈 상태로 동시에 5건이 들어오면 5건 다 조회에 실패하고
// 5번 다 Gemini 를 부른다 — 정확히 지금 터지고 있는 그 상황이다. 먼저 온 요청의
// 약속(promise)을 붙잡아 두고 뒤에 온 요청은 그것을 같이 기다리게 한다.
const _fortuneInflight = new Map();

/** Gemini 로 본문 텍스트 한 덩이를 받는다. 실패하면 빈 문자열(호출부가 환불 판단). */
// ════════════════════════════════════════════
//  안도령 — 모든 풀이의 화자
// ════════════════════════════════════════════
// 콘텐츠마다 프롬프트가 따로 있다 보니 말투와 깊이가 제각각이었다. 어떤 건 딱딱하고
// 어떤 건 전문용어를 그냥 쏟아냈다. 여기서 화자를 하나로 고정한다.
//
// systemInstruction 은 프롬프트보다 강하게 걸리고, 사용자가 프롬프트로 밀어내기도
// 어렵다. 그래서 인격과 금칙은 여기에 두고, 각 프롬프트는 "무엇을 볼지"만 말한다.
//
// ⚠️ 마지막 항목(JSON 요청 시 JSON 만)이 중요하다. 럭키 아이템처럼
// responseMimeType 으로 JSON 을 받는 콘텐츠가 있는데, 인격 지시가 세면 거기에도
// 산문을 붙여 파싱이 깨진다.
// Gemini 응답이 멈추면 워커는 기본적으로 무한정 기다린다. 그러면 사용자는 로딩 화면에
// 갇히고, cachedFortune 의 inflight 에 묶인 다른 요청까지 함께 멈춘다(같은 bucket 이면
// 뒤에 온 요청이 앞선 요청의 약속을 그대로 기다린다). 끊고 환불하는 편이 낫다.
const GEMINI_TIMEOUT_MS = 45000;

const ANDORYEONG = `너는 "안도령(安道令)"이다. 산중에서 오래 기운을 읽어 온 젊은 도인이고,
찾아온 사람의 사주와 그날의 기운을 함께 살펴 이야기를 들려준다.

말하는 법
- 존댓말을 쓰되 예스럽거나 근엄하게 굴지 않는다. 곁에 앉은 사람에게 조곤조곤 말하듯 한다.
- "제가 기운을 살펴보니", "오늘 흐름을 보면" 처럼 네가 직접 살펴본 것으로 말한다.
- 스스로를 AI 나 모델이라 부르지 않는다. 안도령으로만 말한다.

풀이하는 법 (이게 가장 중요하다)
- 찾아온 사람은 사주를 전혀 모른다고 여겨라. 전문용어를 쓸 때는 반드시 그 자리에서
  쉬운 말로 풀어 준다. 예: "일간(日干), 그러니까 타고난 본바탕을 말합니다"
- 결론만 던지지 말고 왜 그렇게 보는지를 함께 말한다. 근거가 있어야 납득이 된다.
- 뜬구름 잡는 말 대신 오늘 당장 해볼 수 있는 것을 하나라도 짚어 준다.
- 단정적인 예언을 하지 않는다. "반드시 ~한다" 대신 "~한 기운이 있으니 ~해 보시면 좋겠습니다".
- 나쁜 기운도 숨기지 않되, 겁주지 않고 대비할 방법과 함께 말한다.

쓰지 않는 것
- 별표(*), 우물정자(#), 소제목, 번호를 붙이지 않는다.
- 줄표(— –)와 가운뎃점(·)을 절대 쓰지 않는다. 사람이 손으로 쓴 글에는 잘 나오지 않는
  기호라, 그것만으로 기계가 쓴 티가 난다. 줄표 대신 쉼표나 마침표로 문장을 끊고,
  여럿을 늘어놓을 때는 가운뎃점 대신 쉼표를 쓰거나 "~와 ~" 처럼 말로 잇는다.
- 문단으로 자연스럽게 이어 쓴다.

예외
- JSON 형식으로 답하라는 요청을 받으면 그때는 JSON 만 출력한다. 인사말도 설명도 붙이지 않는다.`;

const _ANDORYEONG_SI = { parts: [{ text: ANDORYEONG }] };

/**
 * 기계가 쓴 티가 나는 기호를 걷어낸다.
 *
 * 줄표(—)와 가운뎃점(·)은 사람이 손으로 쓴 글에는 잘 안 나온다. 페르소나에 쓰지 말라고
 * 일러 두었지만 모델은 종종 잊는다 — 그래서 나가는 자리에서 한 번 더 거른다.
 * 줄 첫머리의 줄표는 목록 표시이므로 지우고, 문장 가운데 것은 쉼표로 바꾼다.
 */
function _humanize(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line
      .replace(/^\s*[-–—•·─]\s+/, '')          // 줄머리 목록 기호
      .replace(/\s*[–—]\s*/g, ', ')            // 문장 가운데 줄표
      .replace(/\s*·\s*/g, ', ')               // 가운뎃점
      .replace(/,\s*,/g, ',')
      .replace(/\s*,\s*([.!?])/g, '$1')        // ", ." 같은 자국
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 같은 물음에는 저장해 둔 답을 돌려주고 Gemini 를 부르지 않는다.
 *
 * 사주는 바뀌지 않는다. 같은 생년월일·성별로 신살을 물으면 어제도 오늘도 같은 답이
 * 나와야 맞다 — 매번 새로 지어 내면 값만 나가고 신뢰도 떨어진다.
 * 날짜를 타는 것(띠 순위 등)은 키에 날짜를 넣어 그날 안에서만 함께 쓴다.
 *
 * 저장소는 이미 있는 fortune_cache 를 쓴다. bucket 은 기능 이름이라 나중에 기능별로
 * 비우기 쉽다. 캐시가 없거나 실패해도 풀이는 정상으로 나간다 — 있으면 아끼는 것뿐이다.
 *
 * @param {string} key   기능 이름과 입력을 합친 값. 프롬프트에 드는 것이 다 들어가야 한다.
 * @param {number} ttlSec 이 시간이 지나면 다시 짓는다.
 * @param {() => Promise<string>} produce 캐시가 없을 때 실제로 짓는 일
 */
/**
 * 프롬프트의 지문. 캐시 키로 쓴다.
 *
 * 핸들러마다 키를 따로 짜면 값 하나를 빠뜨리기 쉽고, 그러면 남의 풀이가 나간다.
 * 프롬프트에는 결과를 정하는 것이 이미 다 들어 있으니 그걸 통째로 줄여 쓴다.
 * 암호용이 아니라 캐시 키라 FNV-1a 로 충분하다.
 */
function _promptKey(prompt) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const str = String(prompt || '');
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return str.length.toString(36) + h1.toString(36) + h2.toString(36);
}

async function cachedReading(env, key, ttlSec, produce) {
  const id = 'c:' + key;
  const bucket = 'c:' + key.split(':')[0];

  if (env.DB) {
    try {
      const row = await env.DB.prepare(
        'SELECT reading FROM fortune_cache WHERE id = ? AND created_at > unixepoch() - ?'
      ).bind(id, ttlSec).first();
      if (row?.reading) return row.reading;
    } catch (e) { console.warn('[cache:get]', e?.message); }
  }

  const reading = await produce();
  if (reading && env.DB) {
    try {
      await env.DB.prepare(
        'INSERT INTO fortune_cache (id, bucket, reading, created_at) VALUES (?, ?, ?, unixepoch()) ' +
        'ON CONFLICT(id) DO UPDATE SET reading = excluded.reading, created_at = excluded.created_at'
      ).bind(id, bucket, reading).run();
    } catch (e) { console.warn('[cache:set]', e?.message); }
  }
  return reading;
}

/** 캐시 키에 넣을 사주 지문. 프롬프트에 드는 것이 다 들어가야 한다. */
function _sajuKey(saju, gender) {
  return [saju?.yp, saju?.mp, saju?.dp, saju?.hp || '-', gender || '-'].join('');
}

const CACHE_DAY  = 26 * 3600;        // 하루짜리(날짜를 타는 풀이)
const CACHE_LONG = 90 * 24 * 3600;   // 사주처럼 안 바뀌는 것

async function geminiText(env, prompt, generationConfig = {}) {
  // 추론 토큰을 끄지 않으면 답을 내기 전에 생각에만 시간을 쓴다. 느려지고, 출력 예산까지
  // 갉아먹어 본문이 잘린다(토정비결에서 겪었고, 라이프패스가 한참 안 뜨던 원인도 이것이다).
  // 사주 풀이는 긴 추론이 필요한 작업이 아니다 — 프롬프트에 이미 계산된 사주를 준다.
  const cfg = { temperature: 0.9, thinkingConfig: { thinkingBudget: 0 }, ...generationConfig };
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    { signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS), method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ systemInstruction: _ANDORYEONG_SI, contents:[{ parts:[{ text: prompt }] }], generationConfig: cfg }) }
  );
  let data = null;
  try { data = await resp.json(); } catch { data = null; }
  if (!resp.ok) {
    // 실패 사유가 서버 어디에도 안 남아서 "가끔 안 된다"를 추적할 수 없었다.
    // 본문 전체는 프롬프트가 되돌아올 수 있으니 상태와 메시지만 남긴다.
    console.warn(`[gemini] ${resp.status} ${data?.error?.status || ''} ${(data?.error?.message || '').slice(0, 200)}`);
    return '';
  }
  const text = _humanize(data?.candidates?.[0]?.content?.parts?.[0]?.text || '');
  if (!text) {
    console.warn(`[gemini] 200 이지만 본문이 비었다 — finishReason=${data?.candidates?.[0]?.finishReason} promptFeedback=${JSON.stringify(data?.promptFeedback || null)}`);
  }
  return text;
}

/**
 * bucket 에 저장된 글이 있으면 그중 하나를, 없으면 generate() 로 만들어 저장하고 돌려준다.
 * @param {string} bucket 그 글을 결정하는 값 전부를 이어 붙인 키
 * @param {() => Promise<string>} generate 캐시가 비었을 때만 불린다
 * @returns {Promise<string>} 실패하면 빈 문자열
 */
async function cachedFortune(env, bucket, generate) {
  const pick = async () => {
    const { results } = await env.DB.prepare(
      'SELECT reading FROM fortune_cache WHERE bucket = ?'
    ).bind(bucket).all();
    if (!results?.length) return '';
    return results[Math.floor(Math.random() * results.length)].reading;
  };

  try {
    const hit = await pick();
    if (hit) return hit;
  } catch { /* 캐시 조회 실패는 캐시 미스와 같게 다룬다 — 생성으로 넘어간다 */ }

  const waiting = _fortuneInflight.get(bucket);
  if (waiting) return waiting;

  const job = (async () => {
    const text = await generate();
    if (text) {
      await storeFortune(env, bucket, text).catch(() => {});
    }
    return text;
  })();

  _fortuneInflight.set(bucket, job);
  try { return await job; }
  finally { _fortuneInflight.delete(bucket); }
}

/** 변형 하나를 캐시에 넣는다. 같은 자리에 이미 있으면 그대로 둔다. */
async function storeFortune(env, bucket, reading) {
  // 변형 번호는 현재 개수에서 이어 붙인다. 경합으로 같은 번호가 겹치면
  // PRIMARY KEY 가 막고(INSERT OR IGNORE) 조용히 넘어간다 — 어차피 같은 bucket 의 글이다.
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM fortune_cache WHERE bucket = ?'
  ).bind(bucket).first();
  const id = `${bucket}#${row?.n ?? 0}`;
  await env.DB.prepare(
    'INSERT OR IGNORE INTO fortune_cache (id, bucket, reading) VALUES (?, ?, ?)'
  ).bind(id, bucket, reading).run();
}

// 오늘 날짜(KST, YYYY-MM-DD). 이 앱에서 "오늘"은 언제나 KST 자정에 넘어간다 —
// 사용자가 달력에서 고르는 날(택일의 기준일)이든, ilchin() 이 내는 일진이든 같은 축이다.
//
// 한동안 축이 둘이었다. ilchin() 이 런타임 로컬 자정(워커=UTC=09:00 KST)을 쓰는 동안
// 날짜가 붙는 캐시 bucket 만 KST 자정으로 끊려서, 한 bucket 이 서로 다른 일간 두 개에
// 걸쳤다 — 00:00~09:00 KST 에 처음 들어온 요청이 어제 오행으로 글을 만들어 캐시에 박고
// 그날 남은 15시간 동안 모두가 그 글을 받았다. 그때는 bucket 을 ilchin() 쪽 경계에
// 맞추는 것으로 막았고(_ilchinYmd), 지금은 ilchin() 자체가 KST 라 축이 하나로 합쳐졌다.
// 그래서 bucket 도 이 함수를 그대로 쓴다.
//
// ⚠️ 새로 "오늘"을 만들 때 런타임 로컬 시간(new Date().setHours/getFullYear 등)으로
// 재지 말 것. 워커에서는 UTC 가 되어 09:00 KST 까지 어제가 된다.
// test/fortune-bucket-date.test.mjs 가 bucket 날짜와 ilchin() 이 함께 넘어가는지 지킨다.
function _kstYmd() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
/** 올해(KST) — 대운·궁합 시기의 '지금'. */
function _kstYear() {
  return parseInt(_kstYmd().slice(0, 4), 10);
}

// ── 날짜를 타지 않는 콘텐츠의 bucket·프롬프트 ──
//
// 크론이 미리 채워 두는 것과 사용자 요청이 만드는 것이 **반드시 같은 글**이어야 한다.
// 프롬프트를 양쪽에 따로 적어 두면 한쪽만 손봤을 때 캐시에 다른 결의 글이 섞이는데,
// 그건 화면만 봐선 알 수 없다. 그래서 bucket 과 프롬프트를 한 자리에서만 만든다.
const _LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
const _CACHE_LANGS = ['ko', 'en', 'zh', 'ja'];
const _TAIL = 'JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사(그리고, 다만, 특히 등)로 편하게 이어서 사람이 말하듯 써주세요.';

function tarotSpec(lang, cardIdx, upright) {
  const card = TAROT_CARDS[cardIdx];
  const langLabel = _LANG_LABEL[lang] || '한국어';
  return {
    bucket: `tarot|${lang}|${cardIdx}|${upright ? 'u' : 'r'}`,
    prompt: `당신은 오늘의 기운을 친근하게 안내해주는 타로 마스터입니다. 오늘 뽑힌 카드는 "${card.name}", ${upright ? '정방향' : '역방향'}입니다.

이 카드가 오늘 하루에 어떤 의미인지 ${langLabel}로 3~4문장, 따뜻하고 재미있게 해석해주세요. 딱딱한 예언이 아니라 오늘 하루를 대하는 마음가짐이나 작은 실천 팁으로 풀어주세요. 역방향이거나 다소 무거운 카드여도 균형을 찾는 조언으로 전환해서 표현하세요.

${_TAIL}`,
  };
}

function runeSpec(lang, idx, upright) {
  const rune = RUNE_NAMES[idx];
  const langLabel = _LANG_LABEL[lang] || '한국어';
  return {
    bucket: `rune|${lang}|${idx}|${upright ? 'u' : 'r'}`,
    prompt: `당신은 룬 문자(Rune) 점을 봐주는 상담사입니다. 오늘 뽑힌 룬은 "${rune.en}(${rune.ko})", ${upright ? '정방향' : '역방향'}입니다.

이 룬이 오늘 하루에 어떤 의미인지 ${langLabel}로 3~4문장, 따뜻하고 신비로운 톤으로 해석해주세요. 딱딱한 예언이 아니라 오늘 하루를 대하는 마음가짐이나 작은 실천 팁으로 풀어주세요. 역방향이거나 다소 무거운 룬이어도 균형을 찾는 조언으로 전환해서 표현하세요.

${_TAIL}`,
  };
}

function typeCompatSpec(lang, myType, partnerType) {
  const on = ON[lang] || ON.ko;
  const langLabel = _LANG_LABEL[lang] || '한국어';
  return {
    bucket: `typecompat|${lang}|${myType}|${partnerType}`,
    prompt: `당신은 재미있는 궁합 상담사입니다. 오행 성격 유형 테스트에서 한 사람은 "${on[myType]}" 유형, 다른 사람은 "${on[partnerType]}" 유형이 나왔습니다.

두 유형의 궁합을 ${langLabel}로 3~4문장, 가볍고 유쾌하게 풀어주세요. 두 사람이 함께하면 어떤 케미가 나는지, 서로에게 좋은 점이나 함께 하면 좋을 활동을 재미있게 알려주세요. 안 맞는 조합처럼 보여도 유쾌하게 표현하세요(예: "티격태격하지만 그게 매력!").

${_TAIL}`,
  };
}

/** 크론이 미리 채울 수 있는 자리 전부 (날짜를 타지 않는 것만). */
function permanentFortuneSpecs() {
  const out = [];
  for (const lang of _CACHE_LANGS) {
    for (let i = 0; i < TAROT_CARDS.length; i++) {
      out.push(tarotSpec(lang, i, true), tarotSpec(lang, i, false));
    }
    for (let i = 0; i < RUNE_NAMES.length; i++) {
      out.push(runeSpec(lang, i, true), runeSpec(lang, i, false));
    }
    for (const a of TYPE_ELEMENTS) for (const b of TYPE_ELEMENTS) out.push(typeCompatSpec(lang, a, b));
  }
  return out;
}

// 한 번의 크론에서 만들 개수와 간격.
// 한도가 분당 10건 근처라 그보다 느리게 간다 — 예열이 사용자 요청을 밀어내면 본말전도다.
// 916자리를 이 속도로 채우면 한 달쯤 걸리지만, 그동안에도 사용자 요청이 오는 자리부터
// 알아서 채워지므로 급할 것이 없다. 채워진 자리는 다시 만들지 않는다.
const WARM_BUDGET = 30;
const WARM_GAP_MS = 7000;
const CACHE_TTL_DAYS = 3;
// wrangler.toml 의 crons 두 번째 항목과 반드시 같아야 한다. 어긋나면 예열이 아예
// 안 돌거나(아무 크론에도 안 걸림) 아침 푸시 시각에 같이 돌아 사용자를 밀어낸다.
const WARM_CRON = '0 19 * * *';

/**
 * 날짜가 붙은 bucket 중 지난 것을 지운다.
 * 타로·룬·유형궁합은 날짜를 안 타서 계속 값어치가 있으므로 건드리지 않는다 —
 * created_at 만 보고 싹 지우면 어렵게 채운 영구 자리를 매일 밤 날려 먹는다.
 */
async function purgeStaleFortunes(env, nowSec = Math.floor(Date.now() / 1000)) {
  const cutoff = nowSec - CACHE_TTL_DAYS * 86400;
  await env.DB.prepare(
    `DELETE FROM fortune_cache
      WHERE created_at < ?
        AND (bucket LIKE 'zodiac|%' OR bucket LIKE 'lucky|%' OR bucket LIKE 'numerology|%')`
  ).bind(cutoff).run();
}

/** 변형이 가장 적은 자리부터 budget 개. 아직 하나도 없는 자리가 먼저 온다. */
async function selectWarmTargets(env, budget = WARM_BUDGET) {
  const { results } = await env.DB.prepare(
    'SELECT bucket, COUNT(*) AS n FROM fortune_cache GROUP BY bucket'
  ).all();
  const have = new Map((results || []).map(r => [r.bucket, r.n]));
  return permanentFortuneSpecs()
    .map(s => ({ ...s, n: have.get(s.bucket) || 0 }))
    .sort((a, b) => a.n - b.n)
    .slice(0, budget);
}

/**
 * 날짜를 타지 않는 캐시 자리를 조금씩 미리 채우고, 날짜가 지난 자리는 지운다.
 * 실패는 삼킨다 — 예열이 안 됐다고 크론의 다른 일(푸시·재결제)까지 멈출 이유가 없다.
 */
async function warmFortuneCache(env) {
  if (!env.DB || !env.GEMINI_API_KEY) return;

  try { await purgeStaleFortunes(env); }
  catch { /* 정리는 실패해도 그만 — 다음 밤에 다시 시도한다 */ }

  let specs;
  try { specs = await selectWarmTargets(env); }
  catch { return; }

  for (const spec of specs) {
    try {
      const text = await geminiText(env, spec.prompt);
      if (text) await storeFortune(env, spec.bucket, text);
    } catch { /* 한 자리가 실패해도 나머지는 계속 */ }
    await new Promise(r => setTimeout(r, WARM_GAP_MS));
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
    return miniCors(request, JSON.stringify({ error: { message: '인증이 필요합니다.' } }), 401);
  }
  // 기록은 웹·미니앱이 같은 테이블을 쓰되 키를 네임스페이스로 가른다(accountHistoryKey).
  // 이메일로만 조회하면 미니앱 사용자는 자기 기록을 영영 못 본다.
  const acct = await resolveAccount(request, env);
  if (!acct) {
    return miniCors(request, JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);
  }
  const email = accountHistoryKey(acct);

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

    return miniCors(request, JSON.stringify({ ok: true, history, count: history.length }), 200);
  } catch (e) {
    return miniCors(request, JSON.stringify({ error: { message: '기록 조회에 실패했습니다.' } }), 500);
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

// ════════════════════════════
//  계정 계층 — 웹(구글)과 미니앱(토스)을 한 코드로 다루기
// ════════════════════════════
// 유료 콘텐츠 핸들러는 원래 "이메일"만 알았다. 그래서 미니앱은 같은 콘텐츠를 하나도
// 쓸 수 없었다. 여기서 "누가 요청했나"를 계정 한 겹으로 감싸, 핸들러가 웹인지 미니앱인지
// 몰라도 되게 한다.
//
// ⚠️ 원장은 절대 섞이지 않는다. 웹은 payment_requests(user_email), 미니앱은
//    mini_payment_requests(user_key) 로 물리적으로 다른 테이블을 쓴다. 두 서비스는
//    계정도 엽전도 별개라는 계약이고, test/mini-isolation.test.mjs 가 이를 지킨다.
//
// 테이블·컬럼 이름은 아래 고정 표에서만 온다. 사용자 입력이 SQL 로 흘러들지 않는다.
const _LEDGERS = {
  web:  { table: 'payment_requests',      col: 'user_email' },
  mini: { table: 'mini_payment_requests', col: 'user_key' },
};

/**
 * 요청자를 계정으로 해석한다.
 * @returns {{kind:'web'|'mini', key:string}|null} 인증 실패면 null
 */
async function resolveAccount(request, env) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return null;
  // 미니앱 세션('mini:<userKey>')을 먼저 본다. getEmailFromToken 은 이걸 이미 거르지만,
  // 순서를 뒤집으면 나중에 그 차단이 느슨해졌을 때 미니 사용자가 웹 원장에 얹힌다.
  const userKey = await getMiniUserKeyFromRequest(request, env);
  if (userKey) return { kind: 'mini', key: userKey };
  const email = await getEmailFromToken(token, env).catch(() => null);
  if (email) return { kind: 'web', key: email };
  return null;
}

/**
 * 기록(feature_history)에 쓸 키. 원장과 달리 기록은 테이블을 나누지 않고
 * 미니앱 사용자를 'mini:' 접두사로 네임스페이스만 갈라 둔다 — 돈이 아니라서
 * 회계가 섞일 일이 없고, 두 서비스가 같은 조회 코드를 그대로 쓸 수 있다.
 * (접두사 덕에 실제 이메일과 절대 겹치지 않는다.)
 */
function accountHistoryKey(acct) {
  return acct.kind === 'web' ? acct.key : `mini:${acct.key}`;
}

/** 계정의 현재 잔액. */
async function accountBalance(env, acct) {
  const { table, col } = _LEDGERS[acct.kind];
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(tokens), 0) AS bal FROM ${table} WHERE ${col} = ? AND status = 'approved'`
  ).bind(acct.key).first();
  return row?.bal ?? 0;
}

/**
 * 엽전을 차감한다. 잔액 조건을 INSERT 안에 넣은 한 문장이라, 동시에 들어온 두 요청이
 * 같은 잔액을 보고 둘 다 통과하는 일이 없다.
 * @returns {boolean} 잔액이 모자라면 false (이때는 아무것도 쓰이지 않는다)
 */
async function accountSpend(env, acct, feature, cost) {
  const { table, col } = _LEDGERS[acct.kind];
  const id = `${feature}_use_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const r = await env.DB.prepare(
    `INSERT INTO ${table} (id, ${col}, pkg, amount, tokens, status, approved_at)
     SELECT ?, ?, ?, 0, ?, 'approved', unixepoch()
      WHERE (SELECT COALESCE(SUM(tokens), 0) FROM ${table}
              WHERE ${col} = ? AND status = 'approved') >= ?`
  ).bind(id, acct.key, `${feature}_use`, -cost, acct.key, cost).run();
  return (r?.meta?.changes ?? 0) > 0;
}

/** 차감해 놓고 결과를 못 준 경우 되돌린다. 차감할 때 쓴 값을 그대로 넘길 것. */
async function accountRefund(env, acct, feature, cost) {
  const { table, col } = _LEDGERS[acct.kind];
  const id = `${feature}_refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await env.DB.prepare(
      `INSERT INTO ${table} (id, ${col}, pkg, amount, tokens, status, approved_at)
       VALUES (?, ?, ?, 0, ?, 'approved', unixepoch())`
    ).bind(id, acct.key, `${feature}_refund`, cost).run();
  } catch (e) {
    // 환불이 실패하면 사용자는 돈만 잃는다. 조용히 넘기지 말고 반드시 남긴다.
    console.error('[REFUND FAILED]', acct.kind, feature, cost, e?.message);
  }
}

// 유료 기능의 엽전 환불. 차감할 때 쓴 값을 그대로 넘겨야 환불이 원래 청구와 어긋나지 않는다.
// 호출부는 차감 직후 refund 클로저를 만들어 두고, 실패 분기와 catch 양쪽에서 이걸 쓴다.
async function refundTokens(env, email, feature, cost) {
  const id = `${feature}_refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await env.DB.prepare(
    `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
     VALUES (?, ?, ?, 0, ?, 'approved', unixepoch())`
  ).bind(id, email, `${feature}_refund`, cost).run();
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

// 스키마 DDL 을 문장 단위로 나눠 하나씩 실행한다.
//
// 원래는 여러 문장을 담은 템플릿을 통째로 `env.DB.exec(...).catch(() => {})` 로 돌렸는데
// 두 가지가 겹쳐 조용히 망가져 있었다.
//   1) D1 의 exec() 는 입력을 줄 단위로 쪼개 실행해서, 이 파일처럼 여러 줄로 예쁘게 쓴
//      CREATE TABLE 문을 제대로 처리하지 못한다.
//   2) 배치 전체에 하나의 .catch() 가 걸려 있어 중간에 한 문장이 실패하면 나머지가
//      통째로 사라지는데, 로그조차 남지 않았다.
// 그 결과 users / login_events / subscriptions / feature_history / photo_readings 등이
// 프로덕션에 아예 생성되지 않은 채 오래 방치됐다(= 해당 기능들이 조용히 실패 중이었다).
// 이제는 문장마다 개별 실행 + 개별 로깅이라, 하나가 실패해도 나머지는 계속 만들어진다.
async function _execEach(env, sql, label) {
  const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of stmts) {
    try {
      await env.DB.prepare(stmt).run();
    } catch (e) {
      // ALTER TABLE 로 이미 있는 컬럼을 추가하는 경우처럼 정상적인 실패도 섞여 있다.
      // 그래도 삼키지 말고 남긴다 — 안 보이면 오늘 같은 일이 또 생긴다.
      console.error(`[SCHEMA:${label}]`, stmt.split('\n')[0].slice(0, 70), '→', e?.message);
    }
  }
}

// DB 초기화 (워커 인스턴스 당 최초 1회만 실행)
let _dbReady = false;
async function ensureDB(env) {
  if (_dbReady || !env.DB) return;
  await _execEach(env, `
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

    -- saju_history 는 여태 어느 ensureDB* 에도 없었다. 프로덕션엔 손으로 만들어져 있어서
    -- 굴러갔을 뿐이라, DB 를 새로 만들면 리딩 기록 저장이 통째로 깨진다.
    -- schema_saju_history.sql 과 같은 정의를 여기에 둔다(그 파일은 참고용이고 실행되지 않는다).
    CREATE TABLE IF NOT EXISTS saju_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email  TEXT    NOT NULL,
      mode        TEXT    NOT NULL,
      p1_name     TEXT,
      p1_birth    TEXT    NOT NULL,
      p1_hour     TEXT,
      p2_name     TEXT,
      p2_birth    TEXT,
      p2_hour     TEXT,
      reading     TEXT    NOT NULL,
      ohaeng      TEXT    NOT NULL,
      day_elem    TEXT,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_saju_user_created ON saju_history(user_email, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_saju_created ON saju_history(created_at DESC);
  `, 'core');
  _dbReady = true;
}

// ── ensureDB 확장: 신규 기능 테이블 ──
let _dbExtReady = false;
async function ensureDBExt(env) {
  if (_dbExtReady || !env.DB) return;
  await _execEach(env, `
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

    CREATE TABLE IF NOT EXISTS fortune_cache (
      id TEXT PRIMARY KEY,
      bucket TEXT NOT NULL,
      reading TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_fc_bucket ON fortune_cache (bucket);
    CREATE INDEX IF NOT EXISTS idx_fc_created ON fortune_cache (created_at);
  `, 'ext');

  // ⚠️ subscriptions(정기결제) 테이블은 일부러 여기서 만들지 않는다.
  //
  // 위 배치가 오래 실패하고 있어서 이 테이블도 프로덕션에 없는 상태였고, 그 덕에 구독 기능은
  // 조용히 아무것도 하지 않고 있었다. 테이블을 만드는 순간 handleSubscriptionConfirm 이 실제로
  // 행을 쓰기 시작하고 크론(processSubscriptionRenewals)이 그 행을 근거로 재결제를 시도한다.
  // 결제 수단 등록 전에 그 상태로 넘어가면 안 되므로, 결제를 정식으로 여는 시점에
  // 아래 DDL 을 위 'ext' 배치로 옮길 것. 옮길 때 test/schema.test.mjs 의 DEFERRED_TABLES 에서도
  // subscriptions 를 빼야 테스트가 통과한다(빼먹으면 테스트가 알려준다).
  //
  //   CREATE TABLE IF NOT EXISTS subscriptions (
  //     user_email TEXT PRIMARY KEY, plan TEXT NOT NULL, billing_key TEXT NOT NULL,
  //     customer_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
  //     amount INTEGER NOT NULL, monthly_tokens INTEGER NOT NULL,
  //     created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  //     current_period_start INTEGER NOT NULL, current_period_end INTEGER NOT NULL,
  //     last_charged_at INTEGER, fail_count INTEGER NOT NULL DEFAULT 0, canceled_at INTEGER
  //   );
  //   CREATE INDEX IF NOT EXISTS idx_sub_status_due ON subscriptions (status, current_period_end);

  // ── 앱인토스 미니앱 전용 ──
  // 웹과 완전히 분리된 서비스다. 계정도 엽전도 서로 통하지 않는다.
  // 웹은 구글 로그인(이메일이 키)이지만 미니앱은 토스 로그인이다. 토스는 이메일을
  // 안 줄 수도 있어서(null 가능) 키로 쓸 수 없다.
  //
  // 키는 userKey 다. CI 가 아니다 — 처음엔 CI 로 짰다가 두 가지 이유로 바꿨다:
  //   1) CI 는 개인정보라 **암호화되어** 내려온다. 복호화 키(콘솔에서 이메일로 발급)와
  //      AAD 없이는 평문을 얻을 수 없고, 암호문을 그대로 키로 쓰면 값이 불안정하다.
  //   2) 연결 끊기 콜백이 userKey 로 온다. CI 를 키로 두면 탈퇴 요청과 계정을 못 맞춘다.
  // userKey 는 "해당 앱에서만 쓰는 사용자 고유값"이고 평문이라 이 용도에 정확히 맞는다.
  // 계산 로직(computeSaju·moonPhase·프롬프트)은 웹과 공유하되 데이터만 갈라 둔다.
  await _execEach(env, `
    CREATE TABLE IF NOT EXISTS mini_users (
      user_key      TEXT PRIMARY KEY,
      name          TEXT,
      birth_year    INTEGER,
      birth_month   INTEGER,
      birth_day     INTEGER,
      birth_hour    TEXT,
      gender        TEXT,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      last_login_at INTEGER NOT NULL DEFAULT (unixepoch()),
      login_count   INTEGER NOT NULL DEFAULT 0,
      unlinked_at   INTEGER
    );
    CREATE TABLE IF NOT EXISTS mini_payment_requests (
      id          TEXT    PRIMARY KEY,
      user_key    TEXT    NOT NULL,
      pkg         TEXT    NOT NULL,
      amount      INTEGER NOT NULL DEFAULT 0,
      tokens      INTEGER NOT NULL DEFAULT 0,
      status      TEXT    NOT NULL DEFAULT 'pending',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      approved_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_mpr_user_status ON mini_payment_requests (user_key, status);
    CREATE INDEX IF NOT EXISTS idx_mpr_created ON mini_payment_requests (created_at DESC);
  `, 'mini');

  // 아래는 이미 배포된 테이블에 컬럼을 덧붙이는 보정이라 위 배치와 분리한다.
  // 컬럼이 이미 있으면 매번 실패하는데(정상), _execEach 가 문장별로 처리하므로 다음 줄에 영향이 없다.
  await _execEach(env, `
    ALTER TABLE user_streaks ADD COLUMN last_share_bonus TEXT;
    ALTER TABLE users ADD COLUMN birth_year INTEGER;
    ALTER TABLE users ADD COLUMN birth_month INTEGER;
    ALTER TABLE users ADD COLUMN birth_day INTEGER;
    ALTER TABLE users ADD COLUMN birth_hour TEXT;
    ALTER TABLE users ADD COLUMN gender TEXT;
    ALTER TABLE users ADD COLUMN region TEXT;
    ALTER TABLE push_subscriptions ADD COLUMN user_email TEXT;
    CREATE INDEX IF NOT EXISTS idx_push_email ON push_subscriptions(user_email);
  `, 'alter');

  _dbExtReady = true;
}

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname.replace(/\/$/, '') || '/';
    const method = request.method;

    if (method === 'OPTIONS') {
      return isMiniOrigin(request) ? miniCors(request, null, 204) : cors(null, 204);
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
    if (path === '/chat-detail' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleDetailReading(request, env)); }
    // ── 타로카드 뽑기 (재미 콘텐츠) ──
    if (path === '/api/tarot-draw' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleTarotDraw(request, env)); }
    // ── 띠·별자리 운세 (재미 콘텐츠) ──
    if (path === '/api/zodiac-fortune' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleZodiacFortune(request, env)); }
    if (path === '/api/astro-transit'  && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleAstroTransit(request, env)); }
    if (path === '/api/auspicious-days' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleAuspiciousDays(request, env)); }
    if (path === '/api/spouse-palace' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleSpousePalace(request, env)); }
    if (path === '/api/wealth' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleWealth(request, env)); }
    if (path === '/api/sinsal' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleSinsal(request, env)); }
    if (path === '/api/tti-ranking' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleTtiRanking(request, env)); }
    if (path === '/api/past-life' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handlePastLife(request, env)); }
    if (path === '/api/vocation' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleVocation(request, env)); }
    if (path === '/api/daeun'          && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleDaeun(request, env)); }
    if (path === '/api/name-reading'   && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleNameReading(request, env)); }
    if (path === '/api/compat-timing'  && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleCompatTiming(request, env)); }
    // ── 오늘의 럭키 컬러·음식·노래 (재미 콘텐츠) ──
    if (path === '/api/lucky-picks' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleLuckyPicks(request, env)); }
    // ── 오행 유형 궁합 테스트 (재미 콘텐츠) ──
    if (path === '/api/type-compat' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleTypeCompat(request, env)); }
    if (path === '/api/fortune-topic' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleFortuneTopic(request, env)); }
    if (path === '/api/iching' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleIching(request, env)); }
    if (path === '/api/numerology' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleNumerology(request, env)); }
    if (path === '/api/tojeong' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleTojeong(request, env)); }
    if (path === '/api/photo-reading' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handlePhotoReading(request, env)); }
    if (path === '/api/photo-readings' && method === 'GET') { await ensureDBExt(env); return handleGetPhotoReadings(request, env); }
    if (path === '/api/photo-reading' && method === 'DELETE') { await ensureDBExt(env); return handleDeletePhotoReading(request, env); }
    if (path === '/api/dream-interpretation' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleDreamInterpretation(request, env)); }
    if (path === '/api/lotto-numbers' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleLottoNumbers(request, env)); }
    if (path === '/api/rune-reading' && method === 'POST') { await ensureDBExt(env); return withMiniOrigin(request, await handleRuneReading(request, env)); }
    // ── 게스트 체험 ──
    if (path === '/chat-guest' && method === 'POST') { await ensureDBExt(env); return handleGuestChat(request, env); }
    // ── 무료 간단 사주 풀이 (로컬 계산, Gemini 미호출) ──
    if (path === '/saju-reading' && method === 'POST') {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.RL_API.limit({ key: `saju:${ip}` });
      if (!success) return withMiniOrigin(request, cors(JSON.stringify({ error: { message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' } }), 429));
      // 무료·무인증이라 미니앱도 이 엔드포인트를 그대로 쓴다. 오리진만 맞춰 준다.
      return withMiniOrigin(request, await handleSajuReading(request, env));
    }
    // ── 사주 기록 조회 ──
    if (path === '/api/saju-history' && method === 'GET') { await ensureDBExt(env); return handleGetSajuHistory(request, env); }
    // ── 유료 콘텐츠(상세풀이/타로/띠·별자리/럭키/궁합) 통합 기록 조회 ──
    if (path === '/api/feature-history' && method === 'GET') { await ensureDBExt(env); return withMiniOrigin(request, await handleGetFeatureHistory(request, env)); }
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

    // ── 앱인토스 미니앱 (/mini/*) — 웹과 계정·엽전이 완전히 분리된 별도 서비스 ──
    if (path === '/mini/api/auth/login' && method === 'POST') { await ensureDBExt(env); return handleMiniAuthLogin(request, env); }
    if (path === '/mini/api/me'         && method === 'GET')  { await ensureDBExt(env); return handleMiniMe(request, env); }
    if (path === '/mini/api/profile'    && method === 'POST') { await ensureDBExt(env); return handleMiniSaveProfile(request, env); }
    if (path === '/mini/api/tokens'     && method === 'GET')  { await ensureDBExt(env); return handleMiniTokens(request, env); }
    if (path === '/mini/api/products'   && method === 'GET')  { return handleMiniProducts(request, env); }
    if (path === '/mini/api/payment/grant' && method === 'POST') { await ensureDBExt(env); return handleMiniPaymentGrant(request, env); }
    if (path === '/mini/api/today'         && method === 'POST') { await ensureDBExt(env); return handleMiniDailyFortune(request, env); }
    if (path === '/mini/api/ad-reward'     && method === 'POST') { await ensureDBExt(env); return handleMiniAdReward(request, env); }
    if (path === '/mini/api/checkin'       && method === 'POST') { await ensureDBExt(env); return handleMiniCheckin(request, env); }
    if (path === '/mini/api/quiz'          && method === 'GET')  { await ensureDBExt(env); return handleMiniQuiz(request, env); }
    if (path === '/mini/api/quiz'          && method === 'POST') { await ensureDBExt(env); return handleMiniQuizSubmit(request, env); }
    if (path === '/mini/api/pop'           && method === 'GET')  { await ensureDBExt(env); return handleMiniPopStart(request, env); }
    if (path === '/mini/api/pop'           && method === 'POST') { await ensureDBExt(env); return handleMiniPopClaim(request, env); }
    // 연결 끊기 콜백 — 토스 서버가 부른다. 콘솔에서 GET/POST 중 무엇을 고를지 모르니 둘 다 받는다.
    if (path === '/mini/api/auth/unlink' && (method === 'GET' || method === 'POST')) {
      await ensureDBExt(env); return handleMiniUnlink(request, env);
    }
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
    // 예열은 새벽(04:00 KST)에만 따로 돈다 — wrangler.toml 의 crons 주석 참고.
    // Gemini 분당 한도를 사용자 요청과 나눠 쓰므로, 아침 푸시로 사람이 몰리는
    // 시각에 같이 돌리면 예열이 그 사람들을 밀어낸다.
    if (event.cron === WARM_CRON) {
      ctx.waitUntil((async () => { await ensureDBExt(env); await warmFortuneCache(env); })());
      return;
    }
    ctx.waitUntil(sendDailyPush(env));
    ctx.waitUntil((async () => { await ensureDBExt(env); await processSubscriptionRenewals(env); })());
  }
};

// ════════════════════════════
//  엽전 핸들러 & 헬퍼 함수
// ════════════════════════════

// ── 자체 세션 토큰 (HS256 JWT, 30일) ──
// Google ID 토큰은 1시간 만료라 매 요청 검증/재로그인 부담이 큼.
// 로그인 시 1회 Google 검증 후 자체 세션을 발급하고, 이후 요청은 로컬 HMAC 검증(네트워크 0회).
const SESSION_TTL = 30 * 24 * 60 * 60; // 30일(초)

// SESSION_SECRET 이 없으면 세션 발급·검증을 아예 하지 않는다(폴백 금지).
// 예전엔 ADMIN_SECRET → GEMINI_API_KEY → 'myan-dev-secret' 순으로 폴백했는데,
// 마지막 값이 이 공개 저장소에 그대로 박혀 있어서 시크릿이 비는 순간 누구나
// 임의 이메일로 세션 토큰을 위조할 수 있었다(= 전 계정 탈취 + 엽전 무한 지급).
// UNGI_PIN/CAFE_STAFF_PIN/PROMO_ADMIN_PIN 과 같은 원칙 — 시크릿이 없으면 거부한다.
// 던진 예외는 verifySessionToken 경로에선 getEmailFromToken 의 try/catch 가 받아
// 인증 거부(null)로 떨어지고, 발급 경로에선 handleAuthLogin 이 500 으로 돌려준다.
function _sessionSecret(env) {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET not configured');
  return env.SESSION_SECRET;
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
      if (header && header.alg === 'HS256') {
        const subject = await verifySessionToken(idToken, env);
        // 미니앱 세션('mini:<userKey>')은 웹 사용자로 통과시키지 않는다.
        // 그냥 두면 웹 원장(payment_requests.user_email)에 'mini:...' 행이 생겨
        // 두 서비스의 계정·엽전이 섞인다. 미니앱은 getMiniCiFromRequest 로만 인증한다.
        if (typeof subject === 'string' && subject.startsWith('mini:')) return null;
        return subject;
      }
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

// ════════════════════════════════════════════
//  앱인토스 미니앱 — 인증 (웹의 구글 로그인과 완전히 별개)
// ════════════════════════════════════════════
// 미니앱은 토스 앱 안의 웹뷰라 구글 OAuth 가 막힌다(2021-09-30 부터 임베디드 웹뷰 차단).
// 대신 TossAuth.login() 이 주는 인가코드를 서버가 토스 API 로 교환·검증한다.
//
// ⚠️ 앱인토스 서버 API 는 mTLS 가 필수라 일반 fetch 로는 호출할 수 없다.
// wrangler mtls-certificate 로 올린 인증서를 TOSS_MTLS 바인딩으로 받아 그쪽 fetch 를 쓴다.
// 바인딩이 없으면(로컬·미설정) 호출을 시도하지 않고 명시적으로 실패시킨다 —
// 조용히 일반 fetch 로 넘어가면 인증 없이 통과한 것처럼 보일 수 있다.
const TOSS_API = 'https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss';

function _tossFetch(env, url, init) {
  if (!env.TOSS_MTLS?.fetch) {
    throw new Error('TOSS_MTLS 바인딩이 없습니다. mTLS 인증서를 등록해야 앱인토스 API를 호출할 수 있습니다.');
  }
  return env.TOSS_MTLS.fetch(url, init);
}

// ── 토스가 내려준 개인정보 복호화 ──
// 이름·생년월일·성별·CI 는 평문이 아니라 AES-256-GCM 암호문으로 온다.
// 규격: base64 로 디코드하면 [IV 12바이트][암호문][인증태그 16바이트] 이고,
// 키와 AAD 는 콘솔의 "이메일로 복호화 키 받기" 로 받는다(키는 base64).
//
// WebCrypto 의 decrypt 는 태그가 암호문 뒤에 붙어 있는 형태를 그대로 받으므로
// 앞 12바이트만 떼고 나머지를 통째로 넘기면 된다(태그를 따로 자르지 않는다).
//
// 키가 없으면 null 을 돌려준다 — 그 경우 사용자가 생년월일을 직접 입력하는 흐름으로 간다.
const _TOSS_IV_BYTES = 12;

function _b64ToBytes(b64) {
  const bin = atob(String(b64).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// 요청마다 importKey 를 다시 하지 않도록 캐시하되, **키 값 자체를 캐시 키로 삼는다**.
// 그냥 한 번만 만들어 두면 시크릿을 교체해도 옛 키를 계속 쓰게 된다.
let _tossKeyCache = { secret: null, promise: null };
function _tossDecryptKey(env) {
  const secret = env.TOSS_DECRYPT_KEY;
  if (!secret) return null;
  if (_tossKeyCache.secret !== secret) {
    _tossKeyCache = {
      secret,
      promise: crypto.subtle.importKey(
        'raw', _b64ToBytes(secret), { name: 'AES-GCM' }, false, ['decrypt']
      ),
    };
  }
  return _tossKeyCache.promise;
}

/** 암호문 하나를 평문으로. 키가 없거나 복호화에 실패하면 null. */
async function tossDecrypt(env, value) {
  if (!value || typeof value !== 'string') return null;
  const keyPromise = _tossDecryptKey(env);
  if (!keyPromise) return null;
  try {
    const raw = _b64ToBytes(value);
    if (raw.length <= _TOSS_IV_BYTES + 16) return null;   // IV + 태그도 안 되는 길이
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: raw.slice(0, _TOSS_IV_BYTES),
        additionalData: new TextEncoder().encode(env.TOSS_DECRYPT_AAD || ''),
        tagLength: 128,
      },
      await keyPromise,
      raw.slice(_TOSS_IV_BYTES),   // 암호문 + 태그
    );
    return new TextDecoder().decode(plain);
  } catch {
    // 키·AAD 가 틀렸거나 값이 애초에 암호문이 아닌 경우다. 호출부가 원본으로 폴백한다.
    return null;
  }
}

/** 암호문이면 풀고, 못 풀면 원본을 그대로 쓴다(평문으로 내려오는 경우 대비). */
async function _tossField(env, value) {
  if (!value) return null;
  return (await tossDecrypt(env, value)) ?? value;
}

// 인가코드(10분·1회용) → accessToken(1시간) 교환 후, login-me 로 사용자 정보를 받는다.
async function _tossExchangeAndFetchUser(env, authorizationCode, referrer) {
  const tokenRes = await _tossFetch(env, `${TOSS_API}/user/oauth2/generate-token`, {
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorizationCode, referrer: referrer === 'SANDBOX' ? 'SANDBOX' : 'DEFAULT' }),
  });
  if (!tokenRes.ok) throw new Error('토스 인가코드 교환에 실패했습니다.');
  const tokens = await tokenRes.json();
  const accessToken = tokens?.accessToken || tokens?.success?.accessToken;
  if (!accessToken) throw new Error('토스 accessToken 을 받지 못했습니다.');

  const meRes = await _tossFetch(env, `${TOSS_API}/user/oauth2/login-me`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok) throw new Error('토스 사용자 조회에 실패했습니다.');
  const me = await meRes.json();
  // 앱인토스 API 는 HTTP 200 이어도 resultType 으로 실패를 알린다. 반드시 확인할 것.
  if (me?.resultType && me.resultType !== 'SUCCESS') throw new Error('토스 사용자 인증에 실패했습니다.');
  return me?.success || me;
}

// 미니앱 로그인. 성공하면 웹과 같은 자체 세션 토큰을 발급하되 subject 는 'mini:<userKey>' 다.
async function handleMiniAuthLogin(request, env) {
  if (!env.DB) return miniCors(request, JSON.stringify({ error: { message: '데이터베이스 연결 실패' } }), 500);
  const { authorizationCode, referrer } = await request.json().catch(() => ({}));
  if (!authorizationCode || typeof authorizationCode !== 'string') {
    return miniCors(request, JSON.stringify({ error: { message: '인가코드가 필요합니다.' } }), 400);
  }

  let user;
  try {
    user = await _tossExchangeAndFetchUser(env, authorizationCode, referrer);
  } catch (e) {
    console.error('[MINI AUTH]', e?.message);
    return miniCors(request, JSON.stringify({ error: { message: '토스 로그인에 실패했습니다.' } }), 401);
  }

  // 토스가 어떤 항목을 실제로 내려줬는지 남긴다. 동의 항목(스코프)을 콘솔에서 켰는지,
  // 값이 암호화되어 오는지를 이거 없이는 알 수 없다.
  // ⚠️ 값이 아니라 **필드 이름만** 찍는다. 값은 개인정보라 로그에 남기면 안 된다.
  console.log('[MINI AUTH] 받은 항목:', Object.keys(user || {}).join(','));

  // userKey 는 이 앱 전용 사용자 고유값이고 평문으로 내려온다 — 계정 키로 이걸 쓴다.
  // ci 는 암호화되어 있어 복호화 키 없이는 못 쓰고, 연결 끊기 콜백도 userKey 로 온다.
  //
  // ⚠️ String() 이 반드시 필요하다. 토스는 userKey 를 **숫자**로 내려주는데, 그대로
  // bind 하면 SQLite 가 REAL 로 받아 TEXT 컬럼에 '307515147.0' 으로 저장한다.
  // 반면 세션 subject 는 `mini:${userKey}` 라 문자열 '307515147' 이 된다.
  // 그러면 로그인은 한 행에 쓰고 나머지 요청은 다른 행을 읽어, 같은 사람이 두 계정으로
  // 갈린다 — 실제로 토스가 준 이름·생년월일이 로그인 행에만 들어가고 앱에는 안 보였다.
  const userKey = user?.userKey == null ? null : String(user.userKey);
  if (!userKey) return miniCors(request, JSON.stringify({ error: { message: '사용자 식별값(userKey)을 받지 못했습니다.' } }), 400);

  // 이름·생일·성별은 암호문으로 온다. 키(TOSS_DECRYPT_KEY)가 등록돼 있으면 풀어서
  // 바로 쓰고, 없으면 null 이 되어 사용자가 직접 입력하는 화면으로 넘어간다.
  const [name, birthRaw, gender] = await Promise.all([
    _tossField(env, user?.name),
    _tossField(env, user?.birthday || user?.birthDay),
    _tossField(env, user?.gender),
  ]);
  const birth = _parseTossBirthday(birthRaw);
  // 토스는 성별을 'MALE'/'FEMALE' 로 준다. 우리 사주 계산은 'M'/'F' 를 쓴다
  // (대운은 남녀에 따라 순행·역행이 갈리므로 여기서 어긋나면 풀이가 반대로 나온다).
  const genderCode = _normalizeGender(gender);

  try {
    await env.DB.prepare(
      `INSERT INTO mini_users (user_key, name, birth_year, birth_month, birth_day, gender, login_count)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(user_key) DO UPDATE SET
         name = COALESCE(excluded.name, mini_users.name),
         birth_year  = COALESCE(mini_users.birth_year,  excluded.birth_year),
         birth_month = COALESCE(mini_users.birth_month, excluded.birth_month),
         birth_day   = COALESCE(mini_users.birth_day,   excluded.birth_day),
         gender      = COALESCE(mini_users.gender,      excluded.gender),
         last_login_at = unixepoch(),
         login_count = mini_users.login_count + 1,
         unlinked_at = NULL`
    ).bind(userKey, name || null, birth?.year ?? null, birth?.month ?? null, birth?.day ?? null, genderCode).run();
  } catch (e) {
    // 여기서 조용히 넘어가면 안 된다. 행이 없는 채로 세션만 나가면 로그인은 된 것처럼
    // 보이는데 프로필 저장도 엽전 지급도 대상이 없어 전부 무효가 된다.
    // (실제로 컬럼명을 바꾸기 전에 로그인한 사용자가 이 상태에 빠졌다.)
    console.error('[MINI AUTH UPSERT]', e?.message);
    return miniCors(request, JSON.stringify({ error: { message: '로그인 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' } }), 500);
  }

  // 처음 온 사람에게 체험용 엽전을 준다. 한 번도 못 써보고 결제 화면부터 만나면
  // 대부분 그냥 나간다. 두 번째 로그인부터는 id 충돌로 조용히 무시된다.
  await _miniGrantSignup(env, userKey);

  const session = await createSessionToken(`mini:${userKey}`, env);
  const row = await env.DB.prepare(
    `SELECT name, birth_year, birth_month, birth_day, birth_hour, gender FROM mini_users WHERE user_key = ?`
  ).bind(userKey).first().catch(() => null);

  return miniCors(request, JSON.stringify({
    ok: true,
    session,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
    profile: row ? {
      name: row.name || '',
      birthYear: row.birth_year || '', birthMonth: row.birth_month || '',
      birthDay: row.birth_day || '', birthHour: row.birth_hour || '',
      gender: row.gender || '',
    } : null,
  }), 200);
}

/**
 * 성별 표기를 'M'/'F' 로 맞춘다. 토스는 'MALE'/'FEMALE', 앱 폼은 'M'/'F' 를 보낸다.
 * 알 수 없으면 null — 잘못된 값으로 대운을 뒤집느니 비워 두고 사용자에게 받는다.
 */
function _normalizeGender(raw) {
  const v = String(raw || '').trim().toUpperCase();
  if (v === 'M' || v === 'MALE' || v === '남' || v === '남성') return 'M';
  if (v === 'F' || v === 'FEMALE' || v === '여' || v === '여성') return 'F';
  return null;
}

// 토스가 주는 생일 표기를 연·월·일로 나눈다. 'YYYYMMDD' / 'YYYY-MM-DD' 둘 다 받는다.
function _parseTossBirthday(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const year = +digits.slice(0, 4), month = +digits.slice(4, 6), day = +digits.slice(6, 8);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

// 미니앱 요청의 userKey 를 세션에서 꺼낸다. 웹 세션(구글)은 여기서 통과하지 못한다 —
// subject 에 'mini:' 접두사가 있어야만 미니앱 사용자로 인정한다(서비스 분리 보장).
async function getMiniUserKeyFromRequest(request, env) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const subject = await verifySessionToken(token, env).catch(() => null);
  if (!subject || !subject.startsWith('mini:')) return null;
  return subject.slice(5);
}

// 미니앱 잔액. 웹과 같은 append-only 원장 규칙을 쓰되 테이블이 다르다.
async function _miniBalance(env, userKey) {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(tokens), 0) AS bal FROM mini_payment_requests WHERE user_key = ? AND status = 'approved'`
  ).bind(userKey).first();
  return row?.bal ?? 0;
}

async function handleMiniMe(request, env) {
  const userKey = await getMiniUserKeyFromRequest(request, env);
  if (!userKey) return miniCors(request, JSON.stringify({ error: { message: '로그인이 필요합니다.' } }), 401);
  const row = await env.DB.prepare(
    `SELECT name, birth_year, birth_month, birth_day, birth_hour, gender FROM mini_users WHERE user_key = ?`
  ).bind(userKey).first().catch(() => null);
  return miniCors(request, JSON.stringify({
    ok: true,
    profile: {
      name: row?.name || '',
      birthYear: row?.birth_year || '', birthMonth: row?.birth_month || '',
      birthDay: row?.birth_day || '', birthHour: row?.birth_hour || '',
      gender: row?.gender || '',
    },
    tokens: await _miniBalance(env, userKey),
    // 한 번이라도 결제한 사람에게는 자동 광고를 틀지 않는다. 광고로 버는 것보다
    // 돈을 낸 사람을 붙잡아 두는 편이 낫고, 그 약속을 충전 화면에 적어 두었다.
    // 판단은 서버가 한다 — 앱을 다시 깔아도 유지되어야 하는 값이다.
    noAds: await _miniHasPaid(env, userKey),
  }), 200);
}

/** 돈을 내고 산 적이 있는가. 무료로 받은 엽전(출석·퀴즈·광고 등)은 세지 않는다. */
async function _miniHasPaid(env, userKey) {
  const row = await env.DB.prepare(
    `SELECT 1 FROM mini_payment_requests
      WHERE user_key = ? AND status = 'approved' AND amount > 0 LIMIT 1`
  ).bind(userKey).first().catch(() => null);
  return !!row;
}

// 토스가 생일을 안 줬거나 태어난 시각을 더 받아야 할 때 쓴다.
async function handleMiniSaveProfile(request, env) {
  const userKey = await getMiniUserKeyFromRequest(request, env);
  if (!userKey) return miniCors(request, JSON.stringify({ error: { message: '로그인이 필요합니다.' } }), 401);
  const b = await request.json().catch(() => ({}));
  const y = b.birthYear ? parseInt(b.birthYear, 10) : null;
  const m = b.birthMonth ? parseInt(b.birthMonth, 10) : null;
  const d = b.birthDay ? parseInt(b.birthDay, 10) : null;
  if (y !== null && (!Number.isInteger(y) || y < 1900 || y > new Date().getFullYear())) {
    return miniCors(request, JSON.stringify({ error: { message: '생년을 확인해 주세요.' } }), 400);
  }
  try {
    // UPDATE 가 아니라 UPSERT 다. 어떤 이유로든 로그인 때 행이 안 만들어졌으면
    // UPDATE 는 0건을 고치고도 성공을 돌려줘서, 사용자에겐 "저장했다는데 안 남는"
    // 상태로 보인다. 여기서 행을 만들어 스스로 복구한다.
    //
    // gender 는 COALESCE 로 받는다. 값이 오면 반영하고, 안 오면 토스 로그인으로 받아 둔
    // 값을 그대로 둔다 — 빈 값으로 덮어쓰면 대운이 순행·역행부터 뒤집힌다.
    const r = await env.DB.prepare(
      `INSERT INTO mini_users (user_key, name, birth_year, birth_month, birth_day, birth_hour, gender)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_key) DO UPDATE SET
         name        = excluded.name,
         birth_year  = excluded.birth_year,
         birth_month = excluded.birth_month,
         birth_day   = excluded.birth_day,
         birth_hour  = excluded.birth_hour,
         gender      = COALESCE(excluded.gender, mini_users.gender)`
    ).bind(userKey, b.name || null, y, m, d, b.birthHour || null, _normalizeGender(b.gender)).run();

    if ((r?.meta?.changes ?? 0) === 0) {
      console.error('[MINI PROFILE] 아무 행도 바뀌지 않았다:', userKey);
      return miniCors(request, JSON.stringify({ error: { message: '저장에 실패했습니다.' } }), 500);
    }
    return miniCors(request, JSON.stringify({ ok: true }), 200);
  } catch (e) {
    console.error('[MINI PROFILE]', e?.message);
    return miniCors(request, JSON.stringify({ error: { message: '저장에 실패했습니다.' } }), 500);
  }
}

async function handleMiniTokens(request, env) {
  const userKey = await getMiniUserKeyFromRequest(request, env);
  if (!userKey) return miniCors(request, JSON.stringify({ tokens: 0 }), 401);
  return miniCors(request, JSON.stringify({ tokens: await _miniBalance(env, userKey) }), 200);
}

/**
 * 지금 지급할 수 있는 콘솔 SKU 목록. 화면이 어떤 타일을 열지 여기에 맞춘다.
 *
 * 예전엔 클라이언트가 SKU 목록을 따로 들고 콘솔 목록과 대조했는데, 그러면 같은 번호가
 * 세 곳(콘솔·클라이언트·서버)에 살면서 반드시 어긋난다 — 실제로 어긋나서 화면에
 * '서버 미등록'만 뜨고 원인을 알 수 없었다. 지급할 수 있는지를 아는 것은 서버뿐이므로
 * 서버가 답한다. 로그인은 필요 없다(가격표는 비밀이 아니고, 로그인 전에도 그려야 한다).
 */
function handleMiniProducts(request, env) {
  return miniCors(request, JSON.stringify({ products: _miniSellableSkus(env) }), 200);
}

// ── 연결 끊기(탈퇴) 콜백 ──
// 사용자가 토스에서 연동을 해제하거나 토스를 탈퇴하면 토스 서버가 이 URL 을 부른다.
// 콘솔에 등록: https://myan.riger7070.workers.dev/mini/api/auth/unlink
//
// 이 엔드포인트는 인증 없이는 절대 열어두면 안 된다 — userKey 만 알면 남의 계정을
// 끊어버릴 수 있기 때문이다. 콘솔에 등록한 Basic Auth 헤더 값을 시크릿으로 두고 대조한다.
//   wrangler secret put TOSS_UNLINK_AUTH   (값: 콘솔에 넣은 'Basic xxxx' 전체 문자열)
// 시크릿이 없으면 열어두지 않고 전부 거부한다(안전한 기본값).
const TOSS_UNLINK_REFERRERS = new Set(['UNLINK', 'WITHDRAWAL_TERMS', 'WITHDRAWAL_TOSS']);

// 길이·내용이 달라도 같은 시간이 걸리게 비교한다. 일반 === 는 앞 글자만 맞아도
// 조금 더 오래 걸려서, 반복 호출로 값을 한 글자씩 알아낼 여지를 준다.
function _timingSafeEqual(a, b) {
  const x = String(a || ''), y = String(b || '');
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x.charCodeAt(i % x.length || 0) || 0) ^ (y.charCodeAt(i % y.length || 0) || 0);
  }
  return diff === 0;
}

async function handleMiniUnlink(request, env) {
  const expected = env.TOSS_UNLINK_AUTH;
  if (!expected) {
    console.error('[MINI UNLINK] TOSS_UNLINK_AUTH 시크릿이 없어 콜백을 거부했다.');
    return miniCors(request, JSON.stringify({ error: { message: 'unauthorized' } }), 401);
  }
  if (!_timingSafeEqual(request.headers.get('Authorization'), expected)) {
    return miniCors(request, JSON.stringify({ error: { message: 'unauthorized' } }), 401);
  }

  // 토스는 GET 쿼리스트링 또는 POST JSON 둘 중 콘솔에서 고른 방식으로 보낸다. 둘 다 받는다.
  const url = new URL(request.url);
  let userKey = url.searchParams.get('userKey');
  let referrer = url.searchParams.get('referrer');
  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    userKey = body?.userKey || userKey;
    referrer = body?.referrer || referrer;
  }
  if (!userKey) return miniCors(request, JSON.stringify({ error: { message: 'userKey가 필요합니다.' } }), 400);
  if (referrer && !TOSS_UNLINK_REFERRERS.has(referrer)) {
    console.warn('[MINI UNLINK] 모르는 referrer:', referrer);
  }

  try {
    // 개인정보(이름·생년월일·성별)는 지우고 행은 남긴다. 행까지 지우면 같은 사람이
    // 다시 연동했을 때 새 계정처럼 보이는데, 결제 원장은 userKey 로 남아 있어 어긋난다.
    await env.DB.prepare(
      `UPDATE mini_users
          SET name = NULL, birth_year = NULL, birth_month = NULL, birth_day = NULL,
              birth_hour = NULL, gender = NULL, unlinked_at = unixepoch()
        WHERE user_key = ?`
    ).bind(userKey).run();
    // ⚠️ mini_payment_requests 는 지우지 않는다. 전자상거래법상 결제·거래 기록은
    // 보관 의무가 있고, userKey 만 남으면 개인을 특정할 수 없다.
    console.log('[MINI UNLINK] 연결 끊김:', referrer || 'UNKNOWN');
  } catch (e) {
    console.error('[MINI UNLINK]', e?.message);
    return miniCors(request, JSON.stringify({ error: { message: '처리에 실패했습니다.' } }), 500);
  }
  return miniCors(request, JSON.stringify({ ok: true }), 200);
}

// ════════════════════════════════════════════
//  앱인토스 인앱결제(IAP)
// ════════════════════════════════════════════
// 클라이언트가 IAP.createOneTimePurchaseOrder() 로 결제하면 processProductGrant 콜백에서
// 이 서버의 /mini/api/payment/grant 를 부른다. 서버는 orderId 를 토스에 **직접 물어**
// 결제 사실을 확인한 뒤에만 엽전을 넣는다. 지급이 끝나면 클라이언트가
// IAP.completeProductGrant 로 앱에 알린다.
//
// ⚠️ 클라이언트가 보낸 금액·수량은 절대 믿지 않는다. sku 만 받고 지급량은 아래 표에서 정한다.
//    안 그러면 요청을 조작해 엽전을 원하는 만큼 받아갈 수 있다.
//
// ⚠️ SKU 문자열은 앱인토스 콘솔에 등록한 상품 ID 와 **정확히** 같아야 한다.
//    콘솔에서 상품을 만든 뒤 이 표를 맞춰야 결제가 지급으로 이어진다.
//    amount 는 원장에 남기는 기록용이고 실제 청구는 콘솔 설정을 따르지만,
//    앱 화면에 그대로 보여 주는 값이므로 판매가와 어긋나면 안 된다.
//
// ⚠️ 콘솔은 **공급가**를 받고 판매가 = 공급가 × 1.1(VAT) 로 계산한다.
//    그래서 판매가는 11 의 배수만 나온다 — 처음 계획한 3,900·27,900 은 만들 수 없었다.
//    콘솔에 넣은 공급가 → 실제로 청구되는 판매가
//      3,900 → 4,290 / 9,000 → 9,900 / 25,000 → 27,500
//
// 10개를 진입 가격으로 두고 위로 갈수록 개당 단가를 낮춘다.
// 많이 살수록 이득이라는 게 눈에 보여야 한 칸 위를 고르게 된다.
const MINI_PRODUCTS = {
  token_10:  { tokens: 10,  amount: 4290,  label: '엽전 10개' },   // 429원/개
  token_30:  { tokens: 30,  amount: 9900,  label: '엽전 30개' },   // 330원/개
  token_100: { tokens: 100, amount: 27500, label: '엽전 100개' },  // 275원/개
};

// ── 콘솔 SKU ↔ 위 상품 키 ──
//
// 앱인토스 콘솔은 상품 번호(SKU)를 **자기가 만들어 준다**. 우리가 고르는 값이 아니라
// 'ait.0000062547.fc566614.108bcc23c8.6434661588' 같은 자동 생성값이고, 상품을 새로
// 만들면 새 번호가 붙는다. 그래서 token_10 같은 이름으로 맞출 방법이 없다.
//
// 이걸 코드에 박아 두면 상품을 하나 추가할 때마다 코드 수정 → 워커 배포 → 미니앱 배포가
// 따라붙는다. 상품 추가는 콘솔에서 하는 일이지 배포할 일이 아니므로, 매핑을 시크릿으로 뺐다.
//
//   wrangler secret put MINI_SKU_ALIAS
//   {"ait.0000062547.…":"token_10","ait.…":"token_30","ait.…":"token_100"}
//
// 시크릿은 즉시 반영되므로 상품을 추가할 때 이 한 줄이면 끝난다.
// 값이 없거나 JSON 이 깨졌으면 빈 매핑으로 두고 크게 남긴다 — 조용히 넘어가면 결제는
// 되는데 지급이 안 되는, 가장 나쁜 상태가 된다.
function _miniSkuAlias(env) {
  const raw = env.MINI_SKU_ALIAS;
  if (!raw) return {};
  try {
    const map = JSON.parse(raw);
    if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('객체가 아님');
    return map;
  } catch (e) {
    console.error('[MINI IAP] MINI_SKU_ALIAS 를 읽지 못했습니다 — 지급이 막힙니다:', e?.message);
    return {};
  }
}

/**
 * 토스가 준 SKU 로 상품을 찾는다.
 * 콘솔 SKU(별칭)를 먼저 보고, 없으면 상품 키를 그대로 쓴다 —
 * 후자는 테스트와, 혹시 콘솔에서 SKU 를 직접 정할 수 있게 되는 경우를 위한 길이다.
 */
function _miniProductForSku(env, sku) {
  if (typeof sku !== 'string' || !sku) return null;
  const key = _miniSkuAlias(env)[sku] || sku;
  return MINI_PRODUCTS[key] || null;
}

/** 지금 실제로 팔 수 있는 것들 — 콘솔 SKU 가 매핑된 상품만. 클라이언트가 이걸 보고 타일을 연다. */
function _miniSellableSkus(env) {
  const alias = _miniSkuAlias(env);
  return Object.entries(alias)
    .filter(([, key]) => MINI_PRODUCTS[key])
    .map(([sku, key]) => ({ sku, ...MINI_PRODUCTS[key] }));
}

// 결제가 끝난 상태. PURCHASED 는 지급까지 끝난 상태, PAYMENT_COMPLETED 는 결제만 끝나고
// 지급 대기인 상태다. 우리 입장에선 둘 다 "돈은 들어왔다"라서 지급 대상으로 본다.
const TOSS_ORDER_PAID = new Set(['PURCHASED', 'PAYMENT_COMPLETED']);
// 아직 진행 중 — 실패가 아니라 잠시 뒤 다시 물어보면 되는 상태다.
const TOSS_ORDER_PENDING = new Set(['ORDER_IN_PROGRESS']);

async function _tossOrderStatus(env, orderId) {
  const res = await _tossFetch(env, `${TOSS_API}/order/get-order-status`, {
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  });
  if (!res.ok) throw new Error(`주문 조회 실패(${res.status})`);
  const data = await res.json();
  // HTTP 200 이어도 resultType 으로 실패를 알린다 — 반드시 확인할 것.
  if (data?.resultType && data.resultType !== 'SUCCESS') throw new Error('주문 조회에 실패했습니다.');
  return data?.success || data;
}

async function handleMiniPaymentGrant(request, env) {
  if (!env.DB) return miniCors(request, JSON.stringify({ error: { message: '데이터베이스 연결 실패' } }), 500);
  const userKey = await getMiniUserKeyFromRequest(request, env);
  if (!userKey) return miniCors(request, JSON.stringify({ error: { message: '로그인이 필요합니다.' } }), 401);

  const { orderId } = await request.json().catch(() => ({}));
  if (!orderId || typeof orderId !== 'string') {
    return miniCors(request, JSON.stringify({ error: { message: '주문번호가 필요합니다.' } }), 400);
  }

  let order;
  try {
    order = await _tossOrderStatus(env, orderId);
  } catch (e) {
    console.error('[MINI IAP] 주문 조회 실패:', orderId, e?.message);
    return miniCors(request, JSON.stringify({ error: { message: '결제 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.' } }), 502);
  }

  const status = order?.status;
  const sku = order?.sku?.id || order?.sku?.sku || order?.sku;

  // 환불된 주문 — 이미 지급했다면 되돌린다. 원장은 append-only 라 음수 행을 하나 넣는다.
  if (status === 'REFUNDED') {
    await _miniRefundOrder(env, orderId, userKey);
    return miniCors(request, JSON.stringify({ error: { message: '환불된 주문입니다.' } }), 409);
  }
  if (TOSS_ORDER_PENDING.has(status)) {
    return miniCors(request, JSON.stringify({ error: { message: '결제가 진행 중입니다. 잠시 후 다시 확인해 주세요.' }, retry: true }), 202);
  }
  if (!TOSS_ORDER_PAID.has(status)) {
    console.warn('[MINI IAP] 지급 대상이 아닌 상태:', orderId, status, order?.reason);
    return miniCors(request, JSON.stringify({ error: { message: '완료되지 않은 결제입니다.' } }), 400);
  }

  const product = _miniProductForSku(env, typeof sku === 'string' ? sku : null);
  if (!product) {
    // 콘솔에 상품을 추가하고 MINI_SKU_ALIAS 에 그 번호를 안 넣으면 여기로 온다.
    // 돈은 이미 받았으므로 조용히 넘기지 말고 반드시 로그를 남긴다 —
    // 이 줄의 SKU 를 그대로 시크릿에 넣으면 복구된다.
    console.error('[MINI IAP] 모르는 SKU — 지급 못 함:', orderId, JSON.stringify(sku));
    return miniCors(request, JSON.stringify({ error: { message: '알 수 없는 상품입니다. 고객센터로 문의해 주세요.' } }), 500);
  }

  // 같은 orderId 로 두 번 들어와도 한 번만 지급한다 — orderId 가 곧 기본키다.
  // 클라이언트가 재시도하거나 getPendingOrders 로 복구할 때 실제로 두 번 온다.
  let inserted = false;
  try {
    const r = await env.DB.prepare(
      `INSERT INTO mini_payment_requests (id, user_key, pkg, amount, tokens, status, approved_at)
       VALUES (?, ?, ?, ?, ?, 'approved', unixepoch())
       ON CONFLICT(id) DO NOTHING`
    ).bind(orderId, userKey, sku, product.amount, product.tokens).run();
    inserted = (r?.meta?.changes ?? 0) > 0;
  } catch (e) {
    console.error('[MINI IAP] 지급 기록 실패:', orderId, e?.message);
    return miniCors(request, JSON.stringify({ error: { message: '지급 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.' } }), 500);
  }

  if (inserted) console.log('[MINI IAP] 지급 완료:', orderId, sku, product.tokens);
  return miniCors(request, JSON.stringify({
    ok: true,
    granted: inserted,           // false = 이미 지급된 주문(재시도). 클라이언트는 둘 다 성공으로 처리하면 된다.
    tokens: product.tokens,
    balance: await _miniBalance(env, userKey),
  }), 200);
}

// 환불 되돌림. 지급 행이 있을 때만 음수 행을 넣고, 그 음수 행도 id 로 중복을 막는다.
async function _miniRefundOrder(env, orderId, userKey) {
  try {
    const paid = await env.DB.prepare(
      `SELECT tokens, pkg FROM mini_payment_requests WHERE id = ? AND status = 'approved'`
    ).bind(orderId).first();
    if (!paid || paid.tokens <= 0) return;
    const r = await env.DB.prepare(
      `INSERT INTO mini_payment_requests (id, user_key, pkg, amount, tokens, status, approved_at)
       VALUES (?, ?, ?, 0, ?, 'approved', unixepoch())
       ON CONFLICT(id) DO NOTHING`
    ).bind(`${orderId}:refund`, userKey, `${paid.pkg}:refund`, -paid.tokens).run();
    if ((r?.meta?.changes ?? 0) > 0) console.log('[MINI IAP] 환불 반영:', orderId, -paid.tokens);
  } catch (e) {
    console.error('[MINI IAP] 환불 반영 실패:', orderId, e?.message);
  }
}

// ── 미니앱 엽전 차감·환불 ──
// 웹과 같은 append-only 규칙이다. 잔액을 읽고 나서 쓰는 2단계로 하면 동시 요청이
// 같은 잔액을 보고 둘 다 통과한다. 조건을 INSERT 안에 넣어 한 문장으로 끝낸다.
async function _miniSpend(env, userKey, feature, cost) {
  const id = `spend:${feature}:${crypto.randomUUID()}`;
  const r = await env.DB.prepare(
    `INSERT INTO mini_payment_requests (id, user_key, pkg, amount, tokens, status, approved_at)
     SELECT ?, ?, ?, 0, ?, 'approved', unixepoch()
      WHERE (SELECT COALESCE(SUM(tokens), 0) FROM mini_payment_requests
              WHERE user_key = ? AND status = 'approved') >= ?`
  ).bind(id, userKey, feature, -cost, userKey, cost).run();
  // changes = 0 이면 잔액이 모자라 아무것도 안 들어간 것이다.
  return (r?.meta?.changes ?? 0) > 0 ? id : null;
}

// 차감해 놓고 결과를 못 준 경우 되돌린다. 이걸 빠뜨리면 사용자는 돈만 잃는다.
async function _miniRefundSpend(env, spendId, userKey, cost) {
  try {
    await env.DB.prepare(
      `INSERT INTO mini_payment_requests (id, user_key, pkg, amount, tokens, status, approved_at)
       VALUES (?, ?, 'refund', 0, ?, 'approved', unixepoch())
       ON CONFLICT(id) DO NOTHING`
    ).bind(`${spendId}:refund`, userKey, cost).run();
  } catch (e) {
    console.error('[MINI REFUND]', spendId, e?.message);
  }
}

// ── 미니앱 무료 지급 ──
// 둘 다 원장에 행을 하나 넣는 것이고, **행 id 자체가 중복 방지 장치**다.
// 별도 플래그 테이블이나 조회-후-쓰기가 없으므로 동시에 두 번 눌러도 한 번만 들어간다.
const MINI_SIGNUP_TOKENS = 3;   // 첫 로그인 1회
const MINI_AD_TOKENS     = 1;   // 광고 1편당
// 하루 광고 상한. 자동 광고까지 합쳐 하루 3번을 넘지 않게 한다 —
// 무료 엽전을 준다고 해서 광고를 계속 물리면 앱을 지운다.
// 클라이언트도 같은 수를 세지만(mini/src/main.js 의 AD_DAILY_MAX),
// 실제로 막는 것은 여기다. 앱을 고쳐도 넘길 수 없다.
const MINI_AD_DAILY_MAX  = 3;

/** KST 기준 오늘 날짜(YYYY-MM-DD). */
function _kstToday(now = Date.now()) {
  return new Date(now + 9 * 3600000).toISOString().slice(0, 10);
}

/**
 * KST 기준 ISO 주차 키(예: '2026-W33').
 * 공유 보너스를 주 1회로 묶는 데 쓴다. 단순히 날짜를 7로 나누면 해가 바뀔 때
 * 주가 겹치거나 건너뛴다.
 */
function _kstWeek(now = Date.now()) {
  const d = new Date(now + 9 * 3600000);
  d.setUTCHours(0, 0, 0, 0);
  // ISO 주는 목요일이 속한 해를 그 주의 해로 본다.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** 첫 로그인 지급. id 가 'signup:<userKey>' 라 두 번째부터는 조용히 무시된다. */
async function _miniGrantSignup(env, userKey) {
  try {
    const r = await env.DB.prepare(
      `INSERT INTO mini_payment_requests (id, user_key, pkg, amount, tokens, status, approved_at)
       VALUES (?, ?, 'signup', 0, ?, 'approved', unixepoch())
       ON CONFLICT(id) DO NOTHING`
    ).bind(`signup:${userKey}`, userKey, MINI_SIGNUP_TOKENS).run();
    if ((r?.meta?.changes ?? 0) > 0) console.log('[MINI SIGNUP] 첫 지급:', MINI_SIGNUP_TOKENS);
  } catch (e) {
    // 지급 실패가 로그인을 막지는 않는다. 다음 로그인 때 다시 시도된다.
    console.error('[MINI SIGNUP]', e?.message);
  }
}

// 광고 시청 보상. 하루 상한까지 한 편에 한 개씩 준다.
// 순번을 붙인 id 를 앞에서부터 시도해, 들어가는 자리가 곧 그날의 n번째 보상이다.
// 세는 질의를 따로 두지 않으므로 동시에 두 번 눌러도 상한을 넘지 않는다.
async function handleMiniAdReward(request, env) {
  if (!env.DB) return miniCors(request, JSON.stringify({ error: { message: '데이터베이스 연결 실패' } }), 500);
  const userKey = await getMiniUserKeyFromRequest(request, env);
  if (!userKey) return miniCors(request, JSON.stringify({ error: { message: '로그인이 필요합니다.' } }), 401);

  const today = _kstToday();
  try {
    for (let n = 1; n <= MINI_AD_DAILY_MAX; n++) {
      const r = await env.DB.prepare(
        `INSERT INTO mini_payment_requests (id, user_key, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'ad', 0, ?, 'approved', unixepoch())
         ON CONFLICT(id) DO NOTHING`
      ).bind(`ad:${userKey}:${today}:${n}`, userKey, MINI_AD_TOKENS).run();

      if ((r?.meta?.changes ?? 0) > 0) {
        return miniCors(request, JSON.stringify({
          ok: true, granted: true, tokens: MINI_AD_TOKENS,
          remainToday: MINI_AD_DAILY_MAX - n,
          balance: await _miniBalance(env, userKey),
          message: `엽전 ${MINI_AD_TOKENS}개를 드렸어요. 오늘 ${MINI_AD_DAILY_MAX - n}번 더 받을 수 있어요.`,
        }), 200);
      }
    }
    return miniCors(request, JSON.stringify({
      ok: true, granted: false, tokens: 0, remainToday: 0,
      balance: await _miniBalance(env, userKey),
      message: '오늘은 광고 보상을 다 받으셨어요. 내일 다시 받을 수 있습니다.',
    }), 200);
  } catch (e) {
    console.error('[MINI AD]', e?.message);
    return miniCors(request, JSON.stringify({ error: { message: '처리에 실패했습니다.' } }), 500);
  }
}

// ════════════════════════════════════════════
//  미니앱 놀이 — 출석 · 퀴즈 · 부풀리기 · 산가지
// ════════════════════════════════════════════
// 보상을 "운"이 아니라 "행동"에 붙인다. 뽑기 결과에 따라 엽전이 나오면 사행성으로
// 지적받을 수 있어서, 산가지는 재미(무료)만 주고 엽전은 출석·퀴즈·부풀리기·광고로만
// 나간다 — 앞의 셋은 결과가 아니라 한 일에 값을 매기는 것이라 같은 지적을 받지 않는다.
// (부풀리기가 이 목록에 늦게 들어와서 한동안 주석에서 빠져 있었다.)
const MINI_CHECKIN_TOKENS = 3;   // 7일 개근
const MINI_QUIZ_TOKENS    = 1;   // 퀴즈 만점, 하루 1회
const MINI_CHECKIN_CYCLE  = 7;

/** 출석 도장 + 7일 개근 보상. */
async function handleMiniCheckin(request, env) {
  const userKey = await getMiniUserKeyFromRequest(request, env);
  if (!userKey) return miniCors(request, JSON.stringify({ error: { message: '로그인이 필요합니다.' } }), 401);
  const today = _kstToday();

  try {
    // 도장은 엽전 0짜리 행이다. 원장에 함께 두면 표를 더 만들지 않아도 되고,
    // id 가 날짜라 하루 한 번만 찍힌다.
    await env.DB.prepare(
      `INSERT INTO mini_payment_requests (id, user_key, pkg, amount, tokens, status, approved_at)
       VALUES (?, ?, 'checkin', 0, 0, 'approved', unixepoch())
       ON CONFLICT(id) DO NOTHING`
    // ⚠️ 물음표가 둘이므로 값도 둘이다. 셋을 넘기면 D1 이 통째로 거부해서
    //    출석이 '처리에 실패했습니다'로만 보인다(실제로 그랬다).
    ).bind(`checkin:${userKey}:${today}`, userKey).run();

    // 최근 도장을 날짜 역순으로 훑어 연속 일수를 센다.
    const rows = await env.DB.prepare(
      `SELECT id FROM mini_payment_requests
        WHERE user_key = ? AND pkg = 'checkin'
        ORDER BY created_at DESC LIMIT 40`
    ).bind(userKey).all();
    const days = new Set((rows?.results || []).map(r => String(r.id).split(':').pop()));

    let streak = 0;
    for (let i = 0; i < 40; i++) {
      const d = _kstToday(Date.now() - i * 86400000);
      if (!days.has(d)) break;
      streak++;
    }

    // 7일마다 보상. id 가 날짜라 같은 날 두 번 눌러도 한 번만 나간다.
    let granted = false;
    if (streak > 0 && streak % MINI_CHECKIN_CYCLE === 0) {
      const g = await env.DB.prepare(
        `INSERT INTO mini_payment_requests (id, user_key, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'checkin_bonus', 0, ?, 'approved', unixepoch())
         ON CONFLICT(id) DO NOTHING`
      ).bind(`checkin7:${userKey}:${today}`, userKey, MINI_CHECKIN_TOKENS).run();
      granted = (g?.meta?.changes ?? 0) > 0;
    }

    return miniCors(request, JSON.stringify({
      ok: true, streak, granted,
      tokens: granted ? MINI_CHECKIN_TOKENS : 0,
      toNext: MINI_CHECKIN_CYCLE - (streak % MINI_CHECKIN_CYCLE || MINI_CHECKIN_CYCLE),
      balance: await _miniBalance(env, userKey),
      message: granted
        ? `${MINI_CHECKIN_CYCLE}일 개근! 엽전 ${MINI_CHECKIN_TOKENS}개를 드렸어요.`
        : `${streak}일째 오셨어요.`,
    }), 200);
  } catch (e) {
    console.error('[MINI CHECKIN]', e?.message);
    return miniCors(request, JSON.stringify({ error: { message: '처리에 실패했습니다.' } }), 500);
  }
}

// 오행 상식 퀴즈. 정답은 클라이언트에 보내지 않는다 — 보내면 그냥 맞다고 우기면 된다.
// 대신 정답을 HMAC 으로 서명해 함께 내려주고, 채점할 때 서명을 검증한다(서버 상태 불필요).
const MINI_QUIZ_BANK = [
  // ── 오행 상생(相生): 木→火→土→金→水→木 ──
  { q: '오행에서 나무(木)를 낳는 기운은 무엇일까요?', c: ['물(水)', '불(火)', '쇠(金)', '흙(土)'], a: 0,
    why: '물이 나무를 기릅니다. 수생목(水生木)입니다.' },
  { q: '나무(木)가 낳는 기운은 무엇일까요?', c: ['흙(土)', '불(火)', '물(水)', '쇠(金)'], a: 1,
    why: '나무를 태워 불이 붙습니다. 목생화(木生火)입니다.' },
  { q: '불(火)이 낳는 기운은 무엇일까요?', c: ['쇠(金)', '물(水)', '흙(土)', '나무(木)'], a: 2,
    why: '불이 타고 남은 재가 흙이 됩니다. 화생토(火生土)입니다.' },
  { q: '흙(土)이 낳는 기운은 무엇일까요?', c: ['나무(木)', '물(水)', '불(火)', '쇠(金)'], a: 3,
    why: '흙 속에서 쇠가 나옵니다. 토생금(土生金)입니다.' },
  { q: '쇠(金)가 낳는 기운은 무엇일까요?', c: ['물(水)', '나무(木)', '흙(土)', '불(火)'], a: 0,
    why: '쇠에 이슬이 맺히듯 물이 생깁니다. 금생수(金生水)입니다.' },

  // ── 오행 상극(相剋): 木→土→水→火→金→木 ──
  { q: '쇠(金)를 이기는 기운은 무엇일까요?', c: ['불(火)', '흙(土)', '물(水)', '나무(木)'], a: 0,
    why: '불이 쇠를 녹입니다. 화극금(火剋金)입니다.' },
  { q: '나무(木)가 이기는 기운은 무엇일까요?', c: ['불(火)', '흙(土)', '쇠(金)', '물(水)'], a: 1,
    why: '나무뿌리가 흙을 파고듭니다. 목극토(木剋土)입니다.' },
  { q: '물(水)이 이기는 기운은 무엇일까요?', c: ['나무(木)', '쇠(金)', '불(火)', '흙(土)'], a: 2,
    why: '물이 불을 끕니다. 수극화(水剋火)입니다.' },
  { q: '흙(土)이 이기는 기운은 무엇일까요?', c: ['쇠(金)', '불(火)', '나무(木)', '물(水)'], a: 3,
    why: '흙이 물길을 막습니다. 토극수(土剋水)입니다.' },
  { q: '나무(木)를 이기는 기운은 무엇일까요?', c: ['쇠(金)', '물(水)', '흙(土)', '불(火)'], a: 0,
    why: '도끼가 나무를 벱니다. 금극목(金剋木)입니다.' },

  // ── 사주의 뼈대 ──
  { q: '사주에서 "일간(日干)"은 무엇을 뜻할까요?', c: ['태어난 해', '태어난 날의 천간', '태어난 시각', '띠'], a: 1,
    why: '태어난 날의 천간이며, 사주에서 나 자신을 나타내는 자리입니다.' },
  { q: '사주(四柱)의 네 기둥은 무엇으로 이루어질까요?', c: ['해·달·날·시', '해·달·날·나이', '해·계절·날·시', '해·달·시·띠'], a: 0,
    why: '연주·월주·일주·시주, 즉 태어난 해·달·날·시각의 네 기둥입니다.' },
  { q: '사주 여덟 글자를 부르는 다른 이름은 무엇일까요?', c: ['사상', '팔괘', '팔자', '육효'], a: 2,
    why: '네 기둥에 각각 두 글자씩 여덟 글자라 팔자(八字)라 합니다.' },
  { q: '천간(天干)은 모두 몇 개일까요?', c: ['8개', '10개', '12개', '60개'], a: 1,
    why: '갑을병정무기경신임계, 열 개입니다.' },
  { q: '지지(地支)는 모두 몇 개일까요?', c: ['10개', '8개', '12개', '24개'], a: 2,
    why: '자축인묘진사오미신유술해, 열둘이며 십이지와 같습니다.' },
  { q: '천간과 지지를 짝지어 만든 주기는 몇 년일까요?', c: ['12년', '24년', '60년', '100년'], a: 2,
    why: '10과 12의 최소공배수인 60년입니다. 이래서 예순 살을 환갑이라 합니다.' },
  { q: '"대운"은 보통 몇 년 단위로 바뀔까요?', c: ['1년', '3년', '10년', '12년'], a: 2,
    why: '대운은 10년마다 흐름이 바뀝니다.' },
  { q: '해마다 바뀌는 그해의 운을 무엇이라 할까요?', c: ['세운', '대운', '월운', '태과'], a: 0,
    why: '그해의 운은 세운(歲運), 그날의 운은 일진(日辰)입니다.' },

  // ── 천간·지지의 오행 ──
  { q: '천간 "갑(甲)"과 "을(乙)"은 어떤 오행일까요?', c: ['불(火)', '나무(木)', '흙(土)', '물(水)'], a: 1,
    why: '갑을은 나무, 병정은 불, 무기는 흙, 경신은 쇠, 임계는 물입니다.' },
  { q: '천간 "임(壬)"과 "계(癸)"는 어떤 오행일까요?', c: ['물(水)', '쇠(金)', '나무(木)', '불(火)'], a: 0,
    why: '임계는 물입니다. 천간의 마지막 두 글자입니다.' },
  { q: '지지 "인(寅)"과 "묘(卯)"는 어떤 오행일까요?', c: ['흙(土)', '쇠(金)', '나무(木)', '불(火)'], a: 2,
    why: '인묘는 나무이며 봄에 해당합니다.' },
  { q: '지지 "사(巳)"와 "오(午)"는 어떤 오행일까요?', c: ['불(火)', '물(水)', '나무(木)', '쇠(金)'], a: 0,
    why: '사오는 불이며 여름에 해당합니다.' },

  // ── 십이지 ──
  { q: '십이지 중 첫 번째 동물은 무엇일까요?', c: ['소', '호랑이', '용', '쥐'], a: 3,
    why: '자축인묘…의 첫 글자 자(子)가 쥐입니다.' },
  { q: '십이지 중 마지막 동물은 무엇일까요?', c: ['개', '돼지', '닭', '원숭이'], a: 1,
    why: '…술해의 마지막 글자 해(亥)가 돼지입니다.' },
  { q: '"진(辰)"에 해당하는 동물은 무엇일까요?', c: ['뱀', '토끼', '용', '말'], a: 2,
    why: '진은 용입니다. 십이지에서 유일한 상상의 동물입니다.' },
  { q: '"오(午)"에 해당하는 동물은 무엇일까요?', c: ['말', '양', '소', '호랑이'], a: 0,
    why: '오는 말입니다. 정오(正午)라는 말이 여기서 왔습니다.' },
  { q: '"자시(子時)"는 언제부터 언제까지일까요?', c: ['오전 1~3시', '밤 11시~새벽 1시', '자정~새벽 2시', '밤 10시~자정'], a: 1,
    why: '자시는 밤 11시부터 새벽 1시까지이며, 자정을 가운데 둡니다.' },
  { q: '십이지 한 칸은 몇 시간을 나타낼까요?', c: ['1시간', '2시간', '3시간', '4시간'], a: 1,
    why: '하루 24시간을 열둘로 나누어 한 칸이 두 시간입니다.' },

  // ── 절기와 계절 ──
  { q: '한 해의 사주가 바뀌는 기준은 언제일까요?', c: ['설날', '입춘', '동지', '1월 1일'], a: 1,
    why: '사주는 양력 새해나 설이 아니라 입춘을 기준으로 해가 바뀝니다.' },
  { q: '24절기 중 낮이 가장 긴 날은 언제일까요?', c: ['입하', '하지', '춘분', '대서'], a: 1,
    why: '하지(夏至)에 낮이 가장 깁니다. 반대로 동지에 밤이 가장 깁니다.' },
  { q: '봄에 해당하는 오행은 무엇일까요?', c: ['나무(木)', '불(火)', '쇠(金)', '물(水)'], a: 0,
    why: '봄은 나무, 여름은 불, 가을은 쇠, 겨울은 물이고 흙은 환절기를 맡습니다.' },
  { q: '겨울에 해당하는 오행은 무엇일까요?', c: ['쇠(金)', '흙(土)', '물(水)', '나무(木)'], a: 2,
    why: '겨울은 물(水)이며, 지지로는 해자축에 해당합니다.' },
  { q: '사주에서 달(월주)이 바뀌는 기준은 무엇일까요?', c: ['매월 1일', '절기', '보름', '그믐'], a: 1,
    why: '달력의 1일이 아니라 입춘·경칩 같은 절기가 들 때 월주가 바뀝니다.' },

  // ── 색·방위 ──
  { q: '오행 중 "불(火)"에 해당하는 색은 무엇일까요?', c: ['푸른색', '붉은색', '흰색', '검은색'], a: 1,
    why: '목은 청, 화는 적, 토는 황, 금은 백, 수는 흑입니다.' },
  { q: '오행 중 "물(水)"에 해당하는 색은 무엇일까요?', c: ['검은색', '흰색', '노란색', '붉은색'], a: 0,
    why: '물은 검은색입니다. 깊은 물이 검게 보이는 데서 왔습니다.' },
  { q: '오행 중 "쇠(金)"에 해당하는 방위는 어디일까요?', c: ['동쪽', '남쪽', '서쪽', '북쪽'], a: 2,
    why: '목은 동, 화는 남, 금은 서, 수는 북, 토는 중앙입니다.' },
  { q: '오행 중 "흙(土)"에 해당하는 방위는 어디일까요?', c: ['북쪽', '중앙', '동쪽', '남쪽'], a: 1,
    why: '흙은 중앙입니다. 나머지 넷을 가운데서 받치는 자리입니다.' },

  // ── 그 밖의 점법 ──
  { q: '주역의 괘는 모두 몇 개일까요?', c: ['8개', '32개', '64개', '100개'], a: 2,
    why: '팔괘를 위아래로 겹쳐 8×8=64괘가 됩니다.' },
  { q: '타로 카드 한 벌은 보통 몇 장일까요?', c: ['52장', '64장', '72장', '78장'], a: 3,
    why: '메이저 22장과 마이너 56장을 합해 78장입니다.' },
  { q: '음양에서 "양(陽)"에 해당하지 않는 것은 무엇일까요?', c: ['낮', '해', '달', '여름'], a: 2,
    why: '달은 음(陰)에 속합니다. 해는 양, 달은 음으로 봅니다.' },
  { q: '서양 별자리는 모두 몇 개일까요?', c: ['10개', '12개', '14개', '24개'], a: 1,
    why: '양자리부터 물고기자리까지 열둘입니다.' },
];
const MINI_QUIZ_COUNT = 3;
const MINI_QUIZ_PASS  = 2;   // 3문제 중 2개만 맞히면 지급

async function handleMiniQuiz(request, env) {
  const userKey = await getMiniUserKeyFromRequest(request, env);
  if (!userKey) return miniCors(request, JSON.stringify({ error: { message: '로그인이 필요합니다.' } }), 401);

  // 문제를 섞어 3개 고르고, **보기 순서도 문제마다 섞는다**.
  // 문제만 섞으면 정답 위치 분포가 원본 그대로라(4번 정답이 유독 드물다) 위치로 찍힌다.
  // 섞은 순서를 payload 에 함께 담아 서명하므로 채점할 때 원래 자리로 되돌릴 수 있다.
  const idx = [...MINI_QUIZ_BANK.keys()].sort(() => Math.random() - 0.5).slice(0, MINI_QUIZ_COUNT);
  const picked = idx.map(i => ({
    i,
    perm: [0, 1, 2, 3].sort(() => Math.random() - 0.5),   // 보여줄 자리 → 원래 자리
  }));
  const payload = picked.map(p => `${p.i}.${p.perm.join('')}`).join(',');
  const sig = await hmacSign(_sessionSecret(env), `quiz:${userKey}:${payload}`);

  return miniCors(request, JSON.stringify({
    ok: true,
    // 정답(a)과 해설(why)은 채점 뒤에 준다.
    questions: picked.map(({ i, perm }) => ({
      q: MINI_QUIZ_BANK[i].q,
      c: perm.map(k => MINI_QUIZ_BANK[i].c[k]),
    })),
    // 귀띔은 순서를 섞어 함께 내려준다. 사주를 모르는 사람도 읽고 풀 수 있어야 하고,
    // 순서가 그대로면 1번 귀띔이 1번 문제 답이 되어 읽을 필요조차 없어진다.
    tips: picked.map(({ i }) => MINI_QUIZ_BANK[i].why).sort(() => Math.random() - 0.5),
    payload, sig,
  }), 200);
}

async function handleMiniQuizSubmit(request, env) {
  const userKey = await getMiniUserKeyFromRequest(request, env);
  if (!userKey) return miniCors(request, JSON.stringify({ error: { message: '로그인이 필요합니다.' } }), 401);

  const { payload, sig, answers } = await request.json().catch(() => ({}));
  if (!payload || !sig || !Array.isArray(answers)) {
    return miniCors(request, JSON.stringify({ error: { message: '잘못된 요청입니다.' } }), 400);
  }
  // 서명이 맞아야 우리가 낸 문제다. 이게 없으면 아무 문제나 지어내 만점을 주장할 수 있다.
  const valid = await hmacVerify(_sessionSecret(env), `quiz:${userKey}:${payload}`, sig).catch(() => false);
  if (!valid) return miniCors(request, JSON.stringify({ error: { message: '문제가 변조되었습니다.' } }), 400);

  // payload 는 '문제번호.보기순서' 목록이다(예: '7.2031,3.1302').
  // 사용자가 고른 건 '보여준 자리'라, perm 으로 원래 자리로 되돌려 정답과 맞춘다.
  const picked = payload.split(',').map(part => {
    const [n, permStr] = part.split('.');
    return { n: Number(n), perm: String(permStr || '0123').split('').map(Number) };
  }).filter(p => MINI_QUIZ_BANK[p.n] && p.perm.length === 4);

  const results = picked.map(({ n, perm }, i) => ({
    correct: perm[answers[i]] === MINI_QUIZ_BANK[n].a,      // 보여준 자리 → 원래 자리
    answer: perm.indexOf(MINI_QUIZ_BANK[n].a),              // 정답이 화면에 보인 자리
    why: MINI_QUIZ_BANK[n].why,
  }));
  // 3문제 만점을 요구하면 찍어서 통과할 확률이 1/64 다. 사주를 모르는 사람에게는
  // 사실상 못 받는 보상이라 재미가 아니라 짜증이 된다. 2문제로 낮춘다.
  const correctCount = results.filter(r => r.correct).length;
  const allRight = results.length > 0 && correctCount >= MINI_QUIZ_PASS;

  let granted = false;
  if (allRight) {
    try {
      // 기본 하루 1회. 광고를 본 만큼 더 받을 수 있다.
      const maxToday = 1 + await _miniAdBonusToday(env, userKey);
      const today = _kstToday();
      for (let n = 1; n <= maxToday; n++) {
        const r = await env.DB.prepare(
          `INSERT INTO mini_payment_requests (id, user_key, pkg, amount, tokens, status, approved_at)
           VALUES (?, ?, 'quiz', 0, ?, 'approved', unixepoch())
           ON CONFLICT(id) DO NOTHING`
        ).bind(`quiz:${userKey}:${today}:${n}`, userKey, MINI_QUIZ_TOKENS).run();
        if ((r?.meta?.changes ?? 0) > 0) { granted = true; break; }
      }
    } catch (e) { console.error('[MINI QUIZ]', e?.message); }
  }

  return miniCors(request, JSON.stringify({
    ok: true, results, allRight, granted,
    tokens: granted ? MINI_QUIZ_TOKENS : 0,
    balance: await _miniBalance(env, userKey),
    message: !allRight ? `${correctCount}문제 맞히셨어요. ${MINI_QUIZ_PASS}문제부터 엽전을 드려요.`
      : granted ? `${correctCount}문제 맞히셨어요! 엽전 ${MINI_QUIZ_TOKENS}개를 드렸어요.`
      : '잘 푸셨어요. 오늘 보상은 이미 받으셨습니다.',
  }), 200);
}

// ── 안도령 부풀리기 ──
// 두드려서 부풀리고 터뜨리면 엽전을 준다. 보상이 운이 아니라 두드린 횟수에 붙으므로
// 사행성 소지가 없다.
//
// ⚠️ 클라이언트 말을 그대로 믿으면 안 된다. 앱을 고치지 않아도 보상 엔드포인트만
// 직접 부르면 엽전이 나온다. 그래서 서버가 목표 횟수와 발급 시각을 서명해 내려주고,
// 제출할 때 (1) 서명이 맞는지 (2) 사람이 두드릴 만한 시간이 걸렸는지를 본다.
const MINI_POP_TOKENS    = 1;
const MINI_POP_TAPS      = 30;     // 터뜨리는 데 필요한 두드림 수
const MINI_POP_DAILY_MAX = 1;   // 하루 1번. 광고를 보면 그만큼 늘어난다

/**
 * 광고를 본 만큼 그날 한도를 늘려 준다.
 * 근거는 클라이언트 말이 아니라 **그날 실제로 지급된 광고 보상 행 수**다.
 * 광고 보상 자체가 userEarnedReward 로만 나가므로, 여기까지 위조하려면
 * 광고를 실제로 봐야 한다.
 */
async function _miniAdBonusToday(env, userKey) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM mini_payment_requests
      WHERE user_key = ? AND pkg = 'ad' AND id LIKE ?`
  ).bind(userKey, `ad:${userKey}:${_kstToday()}:%`).first();
  return row?.c ?? 0;
}
const MINI_POP_MIN_MS    = 3000;   // 30번을 3초 안에 = 사람 손이 아니다
const MINI_POP_MAX_MS    = 300000; // 5분이 넘으면 낡은 발급으로 본다

async function handleMiniPopStart(request, env) {
  const userKey = await getMiniUserKeyFromRequest(request, env);
  if (!userKey) return miniCors(request, JSON.stringify({ error: { message: '로그인이 필요합니다.' } }), 401);

  const issuedAt = Date.now();
  const sig = await hmacSign(_sessionSecret(env), `pop:${userKey}:${MINI_POP_TAPS}:${issuedAt}`);
  return miniCors(request, JSON.stringify({ ok: true, taps: MINI_POP_TAPS, issuedAt, sig }), 200);
}

async function handleMiniPopClaim(request, env) {
  const userKey = await getMiniUserKeyFromRequest(request, env);
  if (!userKey) return miniCors(request, JSON.stringify({ error: { message: '로그인이 필요합니다.' } }), 401);

  const { issuedAt, sig, taps } = await request.json().catch(() => ({}));
  const valid = issuedAt && sig && await hmacVerify(
    _sessionSecret(env), `pop:${userKey}:${MINI_POP_TAPS}:${issuedAt}`, sig
  ).catch(() => false);
  if (!valid) return miniCors(request, JSON.stringify({ error: { message: '잘못된 요청입니다.' } }), 400);

  if (!(taps >= MINI_POP_TAPS)) {
    return miniCors(request, JSON.stringify({ error: { message: '아직 다 부풀지 않았어요.' } }), 400);
  }
  const elapsed = Date.now() - Number(issuedAt);
  if (elapsed < MINI_POP_MIN_MS || elapsed > MINI_POP_MAX_MS) {
    // 너무 빠르면 자동화, 너무 느리면 오래된 발급을 다시 쓰는 것이다.
    console.warn('[MINI POP] 시간이 이상하다:', elapsed);
    return miniCors(request, JSON.stringify({ error: { message: '다시 시도해 주세요.' } }), 400);
  }

  const today = _kstToday();
  try {
    // 광고를 본 만큼 오늘 더 할 수 있다.
    const maxToday = MINI_POP_DAILY_MAX + await _miniAdBonusToday(env, userKey);
    for (let n = 1; n <= maxToday; n++) {
      const r = await env.DB.prepare(
        `INSERT INTO mini_payment_requests (id, user_key, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'pop', 0, ?, 'approved', unixepoch())
         ON CONFLICT(id) DO NOTHING`
      ).bind(`pop:${userKey}:${today}:${n}`, userKey, MINI_POP_TOKENS).run();

      if ((r?.meta?.changes ?? 0) > 0) {
        return miniCors(request, JSON.stringify({
          ok: true, granted: true, tokens: MINI_POP_TOKENS,
          remainToday: maxToday - n,
          balance: await _miniBalance(env, userKey),
          message: `펑! 엽전 ${MINI_POP_TOKENS}개를 드렸어요. 오늘 ${maxToday - n}번 더 할 수 있어요.`,
        }), 200);
      }
    }
    return miniCors(request, JSON.stringify({
      ok: true, granted: false, tokens: 0, remainToday: 0,
      balance: await _miniBalance(env, userKey),
      message: '오늘은 다 하셨어요. 내일 다시 만나요.',
    }), 200);
  } catch (e) {
    console.error('[MINI POP]', e?.message);
    return miniCors(request, JSON.stringify({ error: { message: '처리에 실패했습니다.' } }), 500);
  }
}

// ── 미니앱 오늘의 운세 (유료 엽전 1개) ──
const MINI_TODAY_COST = 1;

async function handleMiniDailyFortune(request, env) {
  if (!env.DB) return miniCors(request, JSON.stringify({ error: { message: '데이터베이스 연결 실패' } }), 500);
  const userKey = await getMiniUserKeyFromRequest(request, env);
  if (!userKey) return miniCors(request, JSON.stringify({ error: { message: '로그인이 필요합니다.' } }), 401);

  const row = await env.DB.prepare(
    `SELECT name, birth_year, birth_month, birth_day, birth_hour FROM mini_users WHERE user_key = ?`
  ).bind(userKey).first().catch(() => null);
  if (!row?.birth_year) {
    return miniCors(request, JSON.stringify({ error: { message: '생년월일을 먼저 입력해 주세요.' } }), 400);
  }

  const saju = computeSaju(row.birth_year, row.birth_month, row.birth_day, row.birth_hour);
  if (!saju) return miniCors(request, JSON.stringify({ error: { message: '사주 계산에 실패했습니다.' } }), 400);

  // 먼저 차감한다. Gemini 를 부르고 나서 차감하면 그 사이에 여러 번 눌러 공짜로 볼 수 있다.
  const spendId = await _miniSpend(env, userKey, 'today', MINI_TODAY_COST);
  if (!spendId) {
    return miniCors(request, JSON.stringify({ error: { message: '엽전이 부족합니다.', code: 'NO_TOKEN' } }), 402);
  }

  try {
    const il = ilchin();
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);   // KST 기준 날짜
    const name = row.name ? `${row.name}님` : '그대';
    const prompt = [
      '너는 "안도령"이라는 이름의 다정하고 진중한 사주 해설가야.',
      `오늘은 ${today}이고, 오늘의 일진 오행은 "${il.o}"야.`,
      `상담자의 사주는 다음과 같아: ${saju.text}`,
      `상담자를 "${name}"이라고 불러줘.`,
      '',
      '오늘 하루의 운세를 한국어로 풀어줘. 다음 순서로 이어지는 글로 써.',
      '1) 오늘의 기운을 사주와 일진의 관계로 설명',
      '2) 오늘 조심할 점 한 가지',
      '3) 오늘 하면 좋은 일 한 가지',
      '4) 마무리 응원 한 문장',
      '',
      '규칙: 별표(*)나 우물정자(#) 같은 기호를 쓰지 마. 긴 줄표도 쓰지 마.',
      '소제목이나 번호를 붙이지 말고 자연스럽게 이어지는 문단으로 써.',
      '전체 400자 내외로, 따뜻하지만 담백하게. 단정적인 예언 대신 조언하듯이 써.',
    ].join('\n');

    const reading = await geminiText(env, prompt, {
      temperature: 0.9,
      maxOutputTokens: 2048,
      // 추론 토큰이 출력 예산을 다 먹어 본문이 잘리는 걸 막는다.
      thinkingConfig: { thinkingBudget: 0 },
    });

    if (!reading) {
      await _miniRefundSpend(env, spendId, userKey, MINI_TODAY_COST);
      return miniCors(request, JSON.stringify({ error: { message: '운세를 불러오지 못했습니다. 엽전은 돌려드렸어요.' } }), 502);
    }

    return miniCors(request, JSON.stringify({
      ok: true,
      date: today,
      dayElem: il.o,
      saju: saju.text,
      reading,
      tokens: await _miniBalance(env, userKey),
    }), 200);
  } catch (e) {
    // fetch 가 던지는 경우(연결 끊김·타임아웃)도 여기로 온다. 차감만 남으면 안 된다.
    console.error('[MINI TODAY]', e?.message);
    await _miniRefundSpend(env, spendId, userKey, MINI_TODAY_COST);
    return miniCors(request, JSON.stringify({ error: { message: '오류가 발생했습니다. 엽전은 돌려드렸어요.' } }), 500);
  }
}

// 로그인 기록: Google 토큰 검증 후 users upsert + login_events 기록 (로그인 직후 1회 호출)
async function handleAuthLogin(request, env) {
  const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!idToken) return cors(JSON.stringify({ error: '로그인이 필요합니다.' }), 401);
  // Google tokeninfo로 서명 검증 + 프로필(name/picture/locale) 추출
  let info;
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    if (!res.ok) return cors(JSON.stringify({ error: '유효하지 않은 엽전입니다.' }), 401);
    info = await res.json();
  } catch {
    return cors(JSON.stringify({ error: '엽전 검증 실패' }), 401);
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

  // 자체 세션 토큰 발급 (이후 요청은 이 엽전으로 로컬 검증)
  // SESSION_SECRET 미설정이면 _sessionSecret() 이 던진다 — 스택을 흘리지 않고 한국어로 응답.
  let session;
  try {
    session = await createSessionToken(email, env);
  } catch (e) {
    console.error('[AUTH LOGIN] 세션 발급 실패', e);
    return cors(JSON.stringify({ error: '로그인 처리 중 오류가 발생했습니다.' }), 500);
  }
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

  // 소비 집계(tokens < 0) — 기능별 사용 횟수·소모 엽전·이용자 수.
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

  // 계정당 1회뿐인 이관이므로 id 를 이메일로 고정한다(위 SELECT 만으로는 동시 요청을 못 막는다).
  const id = `mig_${email}`;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO payment_requests (id, user_email, pkg, amount, tokens, status) VALUES (?, ?, 'migration', 0, ?, 'approved')`
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

  // id 를 이메일로 고정한다. 위 SELECT 는 동시 요청 두 개를 나란히 통과시키므로(둘 다 갱신 전
  // 상태를 읽는다) 그것만으로는 중복 지급을 못 막는다. PRIMARY KEY 충돌이 두 번째를 걸러낸다.
  const id = `signup_${email}`;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO payment_requests (id, user_email, pkg, amount, tokens, status) VALUES (?, ?, 'signup_grant', 0, 3, 'approved')`
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
    return cors(JSON.stringify({ error: { message: '올바른 이메일과 1개 이상의 엽전 수량을 입력해주세요.' } }), 400);
  }

  const id = `grant_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  await env.DB.prepare(
    `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
     VALUES (?, ?, ?, 0, ?, 'approved', unixepoch())`
  ).bind(id, email, note || 'admin_grant', tokenCount).run();

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: `🎁 관리자 직접 충전\n👤 ${email}\n✦ ${tokenCount}엽전 지급 완료\n📝 ${note || '사유 없음'}`,
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
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: `✅ 승인 완료!\n👤 ${row.user_email}\n🎁 ${row.tokens}엽전 지급됨`,
      }),
    }).catch(() => {});
  }

  return htmlPage('✅ 승인 완료!', `${row.user_email} 님께 ${row.tokens}엽전이 지급됩니다.`);
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
// 요금제: 금액·지급 엽전은 서버에서 결정 (클라이언트 조작 차단)
const SUB_PLANS = {
  basic:   { amount: 9900,  tokens: 120, name: '마이안 베이직 멤버십' },
  premium: { amount: 19900, tokens: 280, name: '마이안 프리미엄 멤버십' },
};
const SUB_PERIOD_SEC = 30 * 24 * 60 * 60; // 결제 주기(30일)
const SUB_MAX_FAILS  = 3;                  // 연속 결제 실패 허용 횟수 (이후 past_due)

// 구독 엽전 지급 — 기존 잔액 계산(payment_requests, status='approved')과 동일 경로로 적립
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

    // 3. 구독 레코드 저장(있으면 갱신) + 엽전 지급
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
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 엽전' } }), 401);
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

// 구독 해지 (이미 지급된 엽전은 유지, 다음 주기부터 자동결제 중단)
async function handleSubscriptionCancel(request, env) {
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 필요' } }), 401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 엽전' } }), 401);
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

// 미니앱은 토스가 호스팅하는 도메인에서 돌아간다. 웹과 오리진이 달라서 cors() 의
// 고정 ACAO 로는 /mini/api 호출이 전부 브라우저에 막힌다("Failed to fetch").
//
// 서브도메인 구성이 SDK 버전마다 다르다 — 3.x 는 <앱>.web / <앱>.private-web,
// 1.x~2.x 는 <앱>.apps / <앱>.private-apps 다. 버전을 올리면 오리진이 통째로 바뀌므로
// 특정 조합을 나열하지 않고 tossmini.com 아래 서브도메인 전체를 받는다.
//
// 와일드카드('*')로 열지 않는 이유: Authorization 헤더를 실어 보내는 API 라서
// 아무 사이트나 우리 API 를 호출하게 두면 안 된다. 토스 도메인으로는 묶어 둔다.
const MINI_ORIGIN_RE = /^https:\/\/([a-z0-9][a-z0-9-]*\.)+tossmini\.com$/;

function isMiniOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  if (MINI_ORIGIN_RE.test(origin)) return true;
  // 못 알아본 오리진은 남긴다. 미니앱이 "Failed to fetch" 로만 보일 때
  // 실제로 어떤 오리진이 왔는지 알아야 원인을 찾을 수 있다.
  if (origin && origin !== 'https://myan.riger7070.workers.dev') {
    console.warn('[CORS] 허용 목록에 없는 오리진:', origin);
  }
  return false;
}

/** 이미 만들어진 응답의 허용 오리진만 미니앱용으로 바꿔 준다(웹 응답은 그대로 통과). */
function withMiniOrigin(request, res) {
  if (!isMiniOrigin(request)) return res;
  const out = new Response(res.body, res);
  out.headers.set('Access-Control-Allow-Origin', request.headers.get('Origin'));
  // 오리진마다 응답이 달라지므로 캐시가 섞이지 않게 알린다.
  out.headers.set('Vary', 'Origin');
  return out;
}

/** cors() 와 같되, 토스 미니앱 오리진이면 그 오리진을 허용으로 되돌려준다. */
function miniCors(request, body, status = 200) {
  return withMiniOrigin(request, cors(body, status));
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
    <li>이메일 주소 (서비스 식별 및 엽전 관리, 서버 저장)</li>
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
    <li>결제 기록 (엽전 잔액 관리, 서버 저장)</li>
  </ul>
  <p style="margin-top:10px"><strong>게스트(비회원) 체험 시 수집:</strong></p>
  <ul>
    <li>IP 주소 (1일 1회 무료 체험 횟수 제한 목적, 서버 저장)</li>
  </ul>
</div>

<h2>2. 개인정보 이용 목적</h2>
<ul>
  <li>AI 사주 리딩 서비스 제공</li>
  <li>엽전 잔액 관리 및 결제 처리</li>
  <li>서비스 이용 내역 관리 및 오류 대응</li>
  <li>로그인·접속 기록을 통한 보안 및 부정 이용(어뷰징) 방지</li>
  <li>서비스 이용 통계 분석 및 품질 개선</li>
  <li>법령상 의무 이행</li>
</ul>

<h2>3. 개인정보 보유 및 파기</h2>
<p>회원 탈퇴 시 서버에 저장된 모든 데이터(이메일, 이름·프로필·언어 설정, 엽전 잔액, 결제 기록, 로그인·접속 기록)를 즉시 파기합니다. 생년월일 등 기기 로컬 데이터는 앱 삭제 또는 회원 탈퇴 시 파기됩니다. 게스트 체험 기록은 횟수 제한 목적 달성 후 일정 기간 경과 시 파기됩니다.</p>

<h2>4. 개인정보 제3자 제공</h2>
<p>회사는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 단, 법령에 의한 요청이 있는 경우는 예외로 합니다.</p>

<h2>5. 개인정보 처리 위탁</h2>
<div class="box">
  <p><strong>Cloudflare, Inc.</strong> — 서버 인프라 및 데이터 저장 (미국)</p>
  <p><strong>Google LLC</strong> — 소셜 로그인 인증 (미국)</p>
  <p><strong>Google LLC (Gemini API)</strong> — AI 리딩 서비스 제공 (미국)</p>
</div>
<p style="margin-top:10px">AI 리딩에 사용된 입력값(생년월일, 사진 등)은 <strong>유료 등급 API</strong>로 처리되어
Google의 모델 학습에 사용되지 않습니다. 회사는 이 목적 외로 해당 데이터를 이용하지 않습니다.</p>

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
  <li>위 서비스는 엽전(이용권)을 소비하여 이용합니다</li>
</ul>

<h2>제3조 (회원가입 및 로그인)</h2>
<p>본 서비스는 Google 소셜 로그인을 통해 가입 및 이용이 가능합니다. 가입 시 신규 이용자에게 무료 엽전이 지급됩니다.</p>

<h2>제4조 (엽전 및 결제)</h2>
<div class="box">
  <ul>
    <li>엽전은 AI 리딩 서비스 이용에 사용되는 디지털 이용권입니다</li>
    <li>결제 완료 즉시 엽전이 지급됩니다</li>
    <li>엽전은 현금으로 환급되지 않습니다</li>
    <li>미사용 엽전은 회원 탈퇴 시 소멸됩니다</li>
  </ul>
</div>

<h2>제5조 (환불 정책)</h2>
<ul>
  <li>결제 후 7일 이내, 미사용 엽전에 한해 환불 가능합니다</li>
  <li>엽전을 1개 이상 사용한 경우 부분 환불이 적용될 수 있습니다</li>
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
      <li>서버에 저장된 엽전 잔액 및 결제 기록</li>
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

    // 해당 이메일의 모든 결제/엽전 기록 삭제
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
  // 차감이 끝난 뒤 실패하면 되돌린다. 차감·환불이 같은 값을 쓰도록 한 곳에서만 만든다.
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

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

    // 엽전 2개 차감 (atomic INSERT — 잔액 >= 2 일 때만 삽입)
    const paid = await accountSpend(env, acct, 'detail', 2);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: '상세 풀이는 엽전 2개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    refund = () => accountRefund(env, acct, 'detail', 2);
    // 차감 후 잔여 엽전 계산
    const remainingTokens = await accountBalance(env, acct);

    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const prompt = `당신은 오늘의 기운을 친근하게 안내해주는 상담사입니다. 오늘(${date})의 기운은 "${ohaeng}"(${ohaeng==='木'?'나무':ohaeng==='火'?'불':ohaeng==='土'?'흙':ohaeng==='金'?'쇠':'물'} 기운)입니다.${sajuBlock}

아래 주제 하나에 대해서만 ${langLabel}로 조언해주세요. 250자 이상, 따뜻하고 친근한 말투로 작성하고 마지막엔 오늘 바로 실천할 수 있는 구체적인 행동 하나를 제안하세요.
주제: ${cat.icon} ${cat.title} — ${cat.guide}

중요: 한자나 어려운 사주 용어(예: 甲木, 天干, 地支, 相生 등)를 쓸 경우 반드시 바로 옆에 괄호로 뜻을 써주세요. 예) 甲木(갑목, 강한 나무 기운), 相生(상생, 서로 돕는 관계). 일상적인 쉬운 단어는 풀이 불필요.

JSON이나 마크다운, 코드블록 없이 조언 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사(그리고, 다만, 특히 등)로 편하게 이어서 사람이 말하듯 써주세요.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      { signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS), method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ systemInstruction: _ANDORYEONG_SI, contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ temperature:0.8, maxOutputTokens:1200, thinkingConfig:{ thinkingBudget:0 } } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = _humanize(data?.candidates?.[0]?.content?.parts?.[0]?.text);

    if (!resp.ok || !reading) {
      await refund(); refund = null;
      return cors(JSON.stringify({ error: { message: '상세 풀이를 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'detail', cat.title, reading, { category, date, ohaeng }).catch(() => {});

    return cors(JSON.stringify({ success:true, category, categoryTitle: cat.title, reading, remaining: remainingTokens }), 200);
  } catch(e) {
    // Gemini 호출이 던지는 등 위에서 예외가 나면 차감만 남는다 — 여기서 되돌린다.
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  타로카드 뽑기 (재미 콘텐츠, 엽전 1개)
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
  // 차감이 끝난 뒤 실패하면 되돌린다. 차감·환불이 같은 값을 쓰도록 한 곳에서만 만든다.
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko' } = await request.json().catch(() => ({}));

    // 엽전 1개 차감 (atomic INSERT — 잔액 >= 1 일 때만 삽입)
    const paid = await accountSpend(env, acct, 'tarot', 1);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: '타로카드 뽑기는 엽전 1개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    refund = () => accountRefund(env, acct, 'tarot', 1);
    const remainingTokens = await accountBalance(env, acct);

    const cardIdx = Math.floor(Math.random() * TAROT_CARDS.length);
    const card = TAROT_CARDS[cardIdx];
    const upright = Math.random() < 0.65; // 정방향에 약간 더 무게 — 지나치게 부정적인 결과가 잦지 않도록

    // 카드 해석에는 뽑은 사람의 정보가 하나도 안 들어간다 — 같은 카드·같은 방향이면 같은 글이다.
    // 날짜도 프롬프트에 없으므로 한 번 만들면 계속 쓴다(78장 × 정역 2 × 4개국어 = 624개).
    const { bucket, prompt } = tarotSpec(lang, cardIdx, upright);
    const reading = await cachedFortune(env, bucket, () => geminiText(env, prompt, { maxOutputTokens: 1000 }));

    if (!reading) {
      await refund(); refund = null;
      return cors(JSON.stringify({ error: { message: '카드 해석을 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'tarot', card.name, reading, { cardIndex: cardIdx, upright }).catch(() => {});

    return cors(JSON.stringify({
      success:true,
      card: { index: cardIdx, name: card.name, icon: card.icon },
      upright, reading, remaining: remainingTokens
    }), 200);
  } catch(e) {
    // Gemini 호출이 던지는 등 위에서 예외가 나면 차감만 남는다 — 여기서 되돌린다.
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  띠·별자리 운세 (재미 콘텐츠, 엽전 1개)
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
  // 차감이 끝난 뒤 실패하면 되돌린다. 차감·환불이 같은 값을 쓰도록 한 곳에서만 만든다.
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

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

    // 엽전 1개 차감 (atomic INSERT — 잔액 >= 1 일 때만 삽입)
    const paid = await accountSpend(env, acct, 'zodiac', 1);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: '띠·별자리 운세는 엽전 1개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    refund = () => accountRefund(env, acct, 'zodiac', 1);
    const remainingTokens = await accountBalance(env, acct);

    // 실제 달의 위상을 함께 넘겨, 같은 별자리라도 날마다 해석이 달라지게 한다
    const moon = moonPhase();
    const moonName = MOON_PHASE_KO[moon.index];
    const moonPct = Math.round(moon.illumination * 100);

    // 역행은 '사건'이라 진행 중일 때만 프롬프트에 넣는다.
    // 평소에도 "순행 중"이라 알리면 매번 언급돼 해석이 지저분해진다.
    const retros = ['mercury', 'venus', 'mars']
      .map(p => ({ p, ...planetRetrograde(p) }))
      .filter(r => r.retrograde);
    const mercBlock = retros.length
      ? '\n역행 중인 행성: ' + retros.map(r =>
          `${_RETRO_MEANING[r.p].ko}${r.endsAt ? `(${r.endsAt}까지)` : ''} — ${_RETRO_MEANING[r.p].hint}`
        ).join(' / ') +
        '\n겁주지 말고, 조심할 점을 알면 무난하다는 톤으로 짧게만 언급해 주세요. 여러 개면 가장 관련 있는 하나만 다뤄도 됩니다.'
      : '';
    const merc = retros.find(r => r.p === 'mercury') || { retrograde: false };

    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const prompt = `당신은 오늘의 기운을 친근하게 안내해주는 상담사입니다. 이 사람은 "${animal}띠"이고 서양 별자리는 "${zodiac}"입니다. 오늘의 오행 기운은 "${on[il.o]}"입니다.

[오늘 실제 하늘 — 천문 계산값이니 그대로 사용하고 임의로 바꾸지 마세요]
달의 위상: ${moonName} (월령 ${moon.age.toFixed(1)}일, 밝기 약 ${moonPct}%)${mercBlock}

띠와 별자리, 오늘의 오행 기운, 그리고 위 달의 위상을 재미있게 엮어서 ${langLabel}로 3~4문장의 짧고 유쾌한 오늘의 운세를 알려주세요. 달이 차오르는 중이면 시작·확장의 기운으로, 기우는 중이면 정리·마무리의 기운으로 자연스럽게 풀어주세요. 진지한 예언이 아니라 가볍게 웃으며 읽을 수 있는 톤으로, 마지막엔 오늘 실천하면 좋을 작은 팁 하나를 더해주세요.

JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사(그리고, 다만, 특히 등)로 편하게 이어서 사람이 말하듯 써주세요.`;

    // 프롬프트에 들어가는 값은 띠·별자리·오늘의 오행·달 위상·역행뿐 — 전부 이 사람과 무관하거나
    // 오늘이면 모두에게 같다. 뒤의 넷은 날짜가 정하므로 bucket 에 날짜만 넣으면 된다.
    // (띠 12 × 별자리 12 × 4개국어 = 하루 576개, 그마저도 실제로 들어온 조합만 만든다.)
    // 날짜는 _kstYmd() — 위 프롬프트의 il 을 낸 ilchin() 과 같은 KST 경계다(그 함수 주석 참고).
    const reading = await cachedFortune(
      env, `zodiac|${lang}|${animalIndex}|${zodiacIndex}|${_kstYmd()}`,
      () => geminiText(env, prompt, { maxOutputTokens: 1000 }),
    );

    if (!reading) {
      await refund(); refund = null;
      return cors(JSON.stringify({ error: { message: '운세를 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'zodiac', `${animal}띠·${zodiac}`, reading, { animalIndex, zodiacIndex }).catch(() => {});

    return cors(JSON.stringify({
      success:true, animal, animalIndex, zodiac, zodiacIndex, reading,
      moon: { index: moon.index, illumination: moonPct }, // 프론트는 index로 자국어 이름을 찾는다
      mercury: merc,
      remaining: remainingTokens
    }), 200);
  } catch(e) {
    // Gemini 호출이 던지는 등 위에서 예외가 나면 차감만 남는다 — 여기서 되돌린다.
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  천궁도 트랜싯 — 실제 행성 위치로 보는 오늘의 하늘 (엽전 1개)
//
//  다른 콘텐츠와 달리 AI 에게 "알아서 지어내라"고 하지 않는다. 별자리 배치와 각도는
//  전부 코드가 실제 궤도 계산으로 산출해서 넘기고, AI 는 그 사실을 해석만 한다.
//  (사주에서 computeSaju 로 4기둥을 먼저 구하고 AI 에겐 해석만 시키는 것과 같은 구조 —
//   천체 위치를 AI 가 지어내면 그럴듯하지만 하늘과 무관한 글이 나온다.)
// ════════════════════════════════════════════
const SIGN_NAMES = {
  ko: ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리','천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'],
  en: ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'],
  zh: ['白羊座','金牛座','双子座','巨蟹座','狮子座','处女座','天秤座','天蝎座','射手座','摩羯座','水瓶座','双鱼座'],
  ja: ['牡羊座','牡牛座','双子座','蟹座','獅子座','乙女座','天秤座','蠍座','射手座','山羊座','水瓶座','魚座'],
};
const BODY_NAMES = {
  ko: { sun:'태양', moon:'달', mercury:'수성', venus:'금성', mars:'화성', jupiter:'목성', saturn:'토성' },
  en: { sun:'Sun', moon:'Moon', mercury:'Mercury', venus:'Venus', mars:'Mars', jupiter:'Jupiter', saturn:'Saturn' },
  zh: { sun:'太阳', moon:'月亮', mercury:'水星', venus:'金星', mars:'火星', jupiter:'木星', saturn:'土星' },
  ja: { sun:'太陽', moon:'月', mercury:'水星', venus:'金星', mars:'火星', jupiter:'木星', saturn:'土星' },
};
const ASPECT_NAMES = {
  ko: { conjunction:'합(0도)', sextile:'육각(60도)', square:'사각(90도)', trine:'삼각(120도)', opposition:'대립(180도)' },
  en: { conjunction:'conjunction (0°)', sextile:'sextile (60°)', square:'square (90°)', trine:'trine (120°)', opposition:'opposition (180°)' },
  zh: { conjunction:'合相(0度)', sextile:'六分相(60度)', square:'四分相(90度)', trine:'三分相(120度)', opposition:'对分相(180度)' },
  ja: { conjunction:'合(0度)', sextile:'セクスタイル(60度)', square:'スクエア(90度)', trine:'トライン(120度)', opposition:'オポジション(180度)' },
};
// 각의 성격 — AI 가 길흉을 제멋대로 붙이지 않도록 통용되는 해석을 고정해 준다.
const ASPECT_TONE_KO = {
  conjunction: '두 힘이 겹쳐 강해지는 각',
  sextile:     '기회가 열리지만 스스로 움직여야 하는 각',
  square:      '마찰과 긴장이 생겨 행동을 요구하는 각',
  trine:       '흐름이 순조롭고 힘이 잘 풀리는 각',
  opposition:  '양쪽이 팽팽히 맞서 균형을 요구하는 각',
};

const ASTRO_TOP_TRANSITS = 5;   // 상위 몇 개만 해석에 쓸지. 전부 넣으면 글이 산만해진다

async function handleAstroTransit(request, env) {
  // 차감이 끝난 뒤 실패하면 되돌린다. 차감·환불이 같은 값을 쓰도록 한 곳에서만 만든다.
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', birth } = await request.json().catch(() => ({}));
    const by = birth ? parseInt(birth.year, 10) : NaN;
    const bm = birth ? parseInt(birth.month, 10) : NaN;
    const bd = birth ? parseInt(birth.day, 10) : NaN;
    if (!by || !bm || !bd) {
      return cors(JSON.stringify({ error: { message: '생년월일이 필요합니다.' } }), 400);
    }

    const natal = natalChart(by, bm, bd);
    if (!natal) return cors(JSON.stringify({ error: { message: '생년월일이 올바르지 않습니다.' } }), 400);
    const today = buildChart(new Date());
    const transits = transitAspects(natal, today).slice(0, ASTRO_TOP_TRANSITS);

    // 엽전 비용은 한 번만 정해 차감·환불 양쪽에서 같은 값을 쓴다
    const COST = 1;
    const paid = await accountSpend(env, acct, 'astro', COST);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: `천궁도 풀이는 엽전 ${COST}개가 필요합니다. 잔액을 확인해 주세요.` } }), 402);
    }
    refund = () => accountRefund(env, acct, 'astro', COST);
    const remainingTokens = await accountBalance(env, acct);

    const S = SIGN_NAMES[lang] || SIGN_NAMES.ko;
    const B = BODY_NAMES[lang] || BODY_NAMES.ko;
    const A = ASPECT_NAMES[lang] || ASPECT_NAMES.ko;
    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';

    const fmt = c => `${S[c.signIndex]} ${c.degInSign}도${c.retrograde ? ' (역행)' : ''}`;
    const natalLines  = CHART_BODIES.map(b => `  ${B[b]}: ${fmt(natal[b])}`).join('\n');
    const todayLines  = CHART_BODIES.map(b => `  ${B[b]}: ${fmt(today[b])}`).join('\n');
    const transitLines = transits.length
      ? transits.map(t =>
          `  오늘의 ${B[t.transit]} → 태어날 때의 ${B[t.natal]} : ${A[t.name]} (오차 ${t.orb}도) — ${ASPECT_TONE_KO[t.name]}`
        ).join('\n')
      : '  (오늘은 뚜렷한 각이 없습니다 — 조용한 하늘입니다)';

    const moon = moonPhase();
    const prompt = `당신은 서양 점성술 상담사입니다. 아래 행성 위치는 실제 궤도 계산으로 구한 값이니, 임의로 바꾸거나 새로 지어내지 마세요.

[태어난 날의 하늘]
${natalLines}

[오늘의 하늘]
${todayLines}
  달의 위상: ${Math.round(moon.illumination * 100)}% 밝기

[오늘 하늘이 이 사람의 차트에 맺는 각]
${transitLines}

위 배치를 근거로 오늘 하루의 흐름을 ${langLabel}로 풀어주세요. 조건:
- 위에 준 각 중 강한 것 2~3개를 골라 그것이 오늘 어떤 형태로 나타날지 구체적으로 쓰세요.
- 각의 성격(마찰인지 순조로움인지)을 무시하고 좋은 말만 하지 마세요. 다만 겁주지 말고 "무엇을 하면 되는지"로 마무리하세요.
- 행성 이름과 별자리를 본문에 자연스럽게 언급해, 왜 그런 해석이 나오는지 독자가 알 수 있게 하세요.
- 400~500자 분량. 문단 2~3개.
- JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사로 편하게 이어서 사람이 말하듯 써주세요.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      { signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS), method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ systemInstruction: _ANDORYEONG_SI, contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ temperature:0.9, maxOutputTokens:1200, thinkingConfig:{ thinkingBudget:0 } } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = _humanize(data?.candidates?.[0]?.content?.parts?.[0]?.text);

    if (!resp.ok || !reading) {
      await refund(); refund = null;
      return cors(JSON.stringify({ error: { message: '천궁도 풀이를 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    const title = `${S[today.sun.signIndex]}의 계절`;
    await saveFeatureHistory(env, accountHistoryKey(acct), 'astro', title, reading,
      { natalSun: natal.sun.signIndex, natalMoon: natal.moon.signIndex, transits }).catch(() => {});

    return cors(JSON.stringify({
      success: true, reading, natal, today, transits,
      moon: { index: moon.index, illumination: Math.round(moon.illumination * 100) },
      remaining: remainingTokens,
    }), 200);
  } catch(e) {
    // Gemini 호출이 던지는 등 위에서 예외가 나면 차감만 남는다 — 여기서 되돌린다.
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  택일(擇日) — 목적에 맞는 좋은 날 고르기 (엽전 2개)
//
//  천궁도와 같은 원칙이다. 길흉 판단을 AI 에게 맡기지 않는다.
//  lunar-javascript 가 들고 있는 실제 역법 데이터(일진의 의宜/기忌, 길신, 흉살, 충)로
//  코드가 먼저 날짜를 걸러 점수순으로 세우고, AI 는 "왜 그 날인지"만 설명한다.
//  AI 에게 날짜를 고르게 하면 그럴듯하지만 역서와 무관한 날이 나온다.
//
//  용어(嫁娶·天德·月破 …)는 원 데이터가 한자다. 화면에 그대로 내보내면 한국어 사용자가
//  읽을 수 없으므로 여기서 4개국어 이름으로 바꿔 내려보낸다 — 프론트에 같은 표를
//  또 두지 않기 위해서다(목적 라벨만 선택 UI 에 필요해 locales.js 에도 있다).
// ════════════════════════════════════════════

// 목적별로 역서의 어느 항목을 보는지. yi = 이 날이 그 일에 '의(宜)'인가, ji = '기(忌)'인가.
const TAKIL_PURPOSES = {
  wedding:  { icon:'💍', yi:['嫁娶','订盟','纳采','冠笄'], ji:['嫁娶'],
              label:{ ko:'결혼·약혼', en:'Wedding or engagement', zh:'嫁娶·订盟', ja:'結婚・婚約' } },
  moving:   { icon:'📦', yi:['移徙','入宅','出火','安床'], ji:['移徙','入宅'],
              label:{ ko:'이사·입주', en:'Moving in', zh:'移徙·入宅', ja:'引っ越し・入居' } },
  opening:  { icon:'🏪', yi:['开市','挂匾','立券','纳财'], ji:['开市'],
              label:{ ko:'개업·창업', en:'Opening a business', zh:'开市·开业', ja:'開業・創業' } },
  contract: { icon:'📝', yi:['立券','交易','纳财','开仓','出货财'], ji:['立券','交易','纳财'],
              label:{ ko:'계약·거래', en:'Contract or deal', zh:'立券·交易', ja:'契約・取引' } },
  travel:   { icon:'✈️', yi:['出行'], ji:['出行'],
              label:{ ko:'여행·출장', en:'Travel', zh:'出行', ja:'旅行・出張' } },
  medical:  { icon:'🩺', yi:['求医','治病'], ji:['求医','治病','探病'],
              label:{ ko:'치료·수술', en:'Treatment or surgery', zh:'求医·治病', ja:'治療・手術' } },
  build:    { icon:'🔨', yi:['动土','修造','上梁','起基','竖柱','盖屋','拆卸'], ji:['动土','修造','上梁','盖屋'],
              label:{ ko:'공사·수리', en:'Construction or repairs', zh:'动土·修造', ja:'工事・修理' } },
  meeting:  { icon:'🤝', yi:['会亲友','进人口'], ji:['会亲友'],
              label:{ ko:'만남·모임', en:'Meeting people', zh:'会亲友', ja:'会合・集まり' } },
  ritual:   { icon:'🕯️', yi:['祭祀','祈福','开光','斋醮'], ji:['祭祀','祈福'],
              label:{ ko:'고사·기도', en:'Rite or prayer', zh:'祭祀·祈福', ja:'祈願・祭祀' } },
};

// 길신/흉살은 역서에 수십 종이 실리는데 전부 보여주면 읽히지 않는다.
// 택일에서 실제로 무게가 실리는 것만 골라 가중치(w)와 4개국어 이름을 붙였다.
// 여기 없는 항목은 점수에도, 화면에도 쓰지 않는다.
const TAKIL_JISHEN = {
  天德:   { w:2, ko:'천덕',   en:'Heavenly Virtue',   zh:'天德',   ja:'天徳' },
  月德:   { w:2, ko:'월덕',   en:'Monthly Virtue',    zh:'月德',   ja:'月徳' },
  天德合: { w:2, ko:'천덕합', en:'Heavenly Virtue Union', zh:'天德合', ja:'天徳合' },
  月德合: { w:2, ko:'월덕합', en:'Monthly Virtue Union',  zh:'月德合', ja:'月徳合' },
  天赦:   { w:2, ko:'천사',   en:'Heavenly Pardon',   zh:'天赦',   ja:'天赦' },
  天愿:   { w:2, ko:'천원',   en:'Heavenly Wish',     zh:'天愿',   ja:'天願' },
  三合:   { w:2, ko:'삼합',   en:'Triple Harmony',    zh:'三合',   ja:'三合' },
  六合:   { w:2, ko:'육합',   en:'Six Harmony',       zh:'六合',   ja:'六合' },
  天喜:   { w:1, ko:'천희',   en:'Heavenly Joy',      zh:'天喜',   ja:'天喜' },
  天医:   { w:1, ko:'천의',   en:'Heavenly Healer',   zh:'天医',   ja:'天医' },
  母仓:   { w:1, ko:'모창',   en:'Mother Granary',    zh:'母仓',   ja:'母倉' },
  生气:   { w:1, ko:'생기',   en:'Life Energy',       zh:'生气',   ja:'生気' },
  五富:   { w:1, ko:'오부',   en:'Five Riches',       zh:'五富',   ja:'五富' },
  福生:   { w:1, ko:'복생',   en:'Blessing Born',     zh:'福生',   ja:'福生' },
};
const TAKIL_XIONGSHA = {
  月破: { w:3, ko:'월파', en:'Month Breaker',      zh:'月破', ja:'月破' },
  大耗: { w:3, ko:'대모', en:'Great Drain',        zh:'大耗', ja:'大耗' },
  四废: { w:3, ko:'사폐', en:'Four Wastes',        zh:'四废', ja:'四廃' },
  受死: { w:3, ko:'수사', en:'Death Day',          zh:'受死', ja:'受死' },
  往亡: { w:2, ko:'왕망', en:'Journey Loss',       zh:'往亡', ja:'往亡' },
  归忌: { w:2, ko:'귀기', en:'Return Taboo',       zh:'归忌', ja:'帰忌' },
  血忌: { w:2, ko:'혈기', en:'Blood Taboo',        zh:'血忌', ja:'血忌' },
  天贼: { w:2, ko:'천적', en:'Heavenly Thief',     zh:'天贼', ja:'天賊' },
  月煞: { w:1, ko:'월살', en:'Month Killing',      zh:'月煞', ja:'月殺' },
  月刑: { w:1, ko:'월형', en:'Month Punishment',   zh:'月刑', ja:'月刑' },
  月厌: { w:1, ko:'월염', en:'Month Loathing',     zh:'月厌', ja:'月厭' },
  五虚: { w:1, ko:'오허', en:'Five Voids',         zh:'五虚', ja:'五虚' },
  白虎: { w:1, ko:'백호', en:'White Tiger',        zh:'白虎', ja:'白虎' },
  朱雀: { w:1, ko:'주작', en:'Vermilion Bird',     zh:'朱雀', ja:'朱雀' },
};
// 띠(생년 지지)를 충하는 날은 본명일 충이라 전통 택일에서 가장 먼저 걸러낸다.
const TAKIL_ANIMALS = {
  ko:['쥐','소','호랑이','토끼','용','뱀','말','양','원숭이','닭','개','돼지'],
  en:['Rat','Ox','Tiger','Rabbit','Dragon','Snake','Horse','Goat','Monkey','Rooster','Dog','Pig'],
  zh:['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'],
  ja:['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'],
};

const TAKIL_SCAN_DAYS = 60;   // 몇 달 앞까지 훑을지. 너무 길면 "그때 가서 다시 보면 될 날"이 섞인다
const TAKIL_TOP       = 5;    // 추천으로 내보낼 날 수

/**
 * 목적에 맞는 날을 역서 데이터로 걸러 점수순으로 돌려준다. 여기엔 AI 도 네트워크도 없다.
 * @param {string} purposeKey TAKIL_PURPOSES 의 키
 * @param {{year:number,month:number,day:number}} start 훑기 시작할 날(보통 오늘)
 * @param {{days?:number, yearZhi?:string}} opts yearZhi 를 주면 그 띠를 충하는 날은 뺀다
 * @returns {Array|null} 점수 내림차순(동점이면 빠른 날짜) 후보 목록. 목적 키가 틀리면 null
 */
function pickAuspiciousDays(purposeKey, start, opts = {}) {
  const p = TAKIL_PURPOSES[purposeKey];
  if (!p) return null;
  const days = opts.days || TAKIL_SCAN_DAYS;
  const out = [];

  let solar = Solar.fromYmd(start.year, start.month, start.day);
  for (let i = 0; i < days; i++, solar = solar.next(1)) {
    const lunar = solar.getLunar();
    const ji = lunar.getDayJi();
    if (ji.includes('诸事不宜')) continue;              // 역서가 통째로 막아둔 날
    if (p.ji.some(k => ji.includes(k))) continue;      // 그 일에 대놓고 '기(忌)'인 날
    const yi = lunar.getDayYi();
    const hits = p.yi.filter(k => yi.includes(k));
    if (!hits.length) continue;                        // '나쁘지 않다'는 '좋다'가 아니다 — 의(宜)에 있어야 후보
    const chong = lunar.getDayChong();
    if (opts.yearZhi && chong === opts.yearZhi) continue;   // 본명일 충

    const jishen   = lunar.getDayJiShen().filter(s => TAKIL_JISHEN[s]);
    const xiongsha = lunar.getDayXiongSha().filter(s => TAKIL_XIONGSHA[s]);
    let score = hits.length * 3;
    for (const s of jishen)   score += TAKIL_JISHEN[s].w;
    for (const s of xiongsha) score -= TAKIL_XIONGSHA[s].w;

    out.push({
      ymd: solar.toYmd(),
      ganzhi: lunar.getDayInGanZhi(),
      lunarMonth: Math.abs(lunar.getMonth()),
      lunarDay: lunar.getDay(),
      leapMonth: lunar.getMonth() < 0,
      hits, jishen, xiongsha, chong, score,
    });
  }
  // 동점이면 가까운 날을 먼저 — 사용자는 대개 빨리 잡고 싶어 한다
  out.sort((a, b) => b.score - a.score || (a.ymd < b.ymd ? -1 : 1));
  return out;
}

async function handleAuspiciousDays(request, env) {
  // 차감이 끝난 뒤 실패하면 되돌린다. 차감·환불이 같은 값을 쓰도록 한 곳에서만 만든다.
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', purpose, birth, from, days } = await request.json().catch(() => ({}));
    const P = TAKIL_PURPOSES[purpose];
    if (!P) return cors(JSON.stringify({ error: { message: '어떤 일의 날짜를 고를지 선택해 주세요.' } }), 400);

    // 언제부터 볼지. "내년 봄쯤 결혼" 처럼 먼 날을 잡는 경우가 있어 시작일을 받는다.
    // 과거로는 보내지 않고(지난 날을 권할 수는 없다), 너무 먼 미래도 막는다.
    //
    // 기준일은 KST 다. UTC 로 잡았더니 00:00~09:00 KST 사이에는 "오늘"이 한국의 어제가 되어,
    // 그 어제가 점수 1위면 결혼 날짜로 이미 지나간 날을 추천했다. 프론트의 date 입력
    // min/value 도 같은 KST 로 맞춰야 서버의 400 과 어긋나지 않는다(js/app.js 의 _kstToday).
    const todayYmd = _kstYmd();
    let startYmd = todayYmd;
    if (typeof from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      const [ty, tm, td] = todayYmd.split('-').map(n => parseInt(n, 10));
      const maxYmd = new Date(Date.UTC(ty + 2, tm - 1, td)).toISOString().slice(0, 10);
      if (from < todayYmd || from > maxYmd) {
        return cors(JSON.stringify({ error: { message: '오늘부터 2년 안의 날짜로 골라 주세요.' } }), 400);
      }
      startYmd = from;
    }
    const scanDays = Math.min(Math.max(parseInt(days, 10) || TAKIL_SCAN_DAYS, 7), 90);

    // 띠는 있으면 쓰고 없으면 건너뛴다 — 생년월일이 없다고 택일 자체를 막을 이유는 없다.
    let yearZhi = null, animalIndex = -1;
    const by = birth ? parseInt(birth.year, 10) : NaN;
    const bm = birth ? parseInt(birth.month, 10) : NaN;
    const bd = birth ? parseInt(birth.day, 10) : NaN;
    if (by && bm && bd) {
      try {
        yearZhi = Solar.fromYmd(by, bm, bd).getLunar().getYearZhiByLiChun();
        animalIndex = JJ.indexOf(yearZhi);
      } catch { yearZhi = null; }
    }

    const [sy, sm, sd] = startYmd.split('-').map(n => parseInt(n, 10));
    const all = pickAuspiciousDays(purpose, { year: sy, month: sm, day: sd }, { yearZhi, days: scanDays });
    const picks = (all || []).slice(0, TAKIL_TOP);

    // 후보가 없으면 차감하지 않는다. 못 준 결과에 엽전을 받을 수는 없다.
    if (!picks.length) {
      return cors(JSON.stringify({ error: { message: `${startYmd}부터 ${scanDays}일 안에는 마땅한 날이 없습니다. 기간을 넓혀 다시 보아 주세요.` } }), 404);
    }

    // 엽전 비용은 한 번만 정해 차감·환불 양쪽에서 같은 값을 쓴다
    const COST = 2;
    const paid = await accountSpend(env, acct, 'takil', COST);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: `택일은 엽전 ${COST}개가 필요합니다. 잔액을 확인해 주세요.` } }), 402);
    }
    refund = () => accountRefund(env, acct, 'takil', COST);
    const remainingTokens = await accountBalance(env, acct);

    const L = (tbl, key) => (tbl[key]?.[lang] || tbl[key]?.ko || key);
    const purposeLabel = P.label[lang] || P.label.ko;
    const animals = TAKIL_ANIMALS[lang] || TAKIL_ANIMALS.ko;
    // 화면·프롬프트 양쪽이 같은 이름을 쓰도록 여기서 한 번만 옮긴다
    const localized = picks.map(d => ({
      ...d,
      jishen:   d.jishen.map(s => L(TAKIL_JISHEN, s)),
      xiongsha: d.xiongsha.map(s => L(TAKIL_XIONGSHA, s)),
      chongAnimal: JJ.indexOf(d.chong) >= 0 ? animals[JJ.indexOf(d.chong)] : d.chong,
    }));

    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const dayLines = localized.map((d, i) => {
      const good = d.jishen.length ? ` / 길신: ${d.jishen.join(', ')}` : '';
      const bad  = d.xiongsha.length ? ` / 흉살: ${d.xiongsha.join(', ')}` : '';
      return `  ${i + 1}순위 ${d.ymd} (음력 ${d.lunarMonth}월 ${d.lunarDay}일, 일진 ${d.ganzhi}) — 점수 ${d.score}${good}${bad} / 이 날이 충하는 띠: ${d.chongAnimal}`;
    }).join('\n');

    const prompt = `당신은 택일(擇日)을 봐 주는 상담사입니다. 아래 날짜는 실제 역서(만세력)의 일진·의기(宜忌)·길신·흉살 데이터로 이미 골라 둔 것입니다. 날짜를 새로 지어내거나 순위를 바꾸지 말고, 준 것만 설명하세요.

[하려는 일] ${purposeLabel}
${yearZhi ? `[의뢰인의 띠] ${animals[animalIndex] || ''}띠 (이 띠를 충하는 날은 이미 제외했습니다)` : '[의뢰인의 띠] 알 수 없음 (본명 충은 걸러내지 못했습니다)'}

[역서가 고른 날 — 점수가 높을수록 그 일에 맞는 날]
${dayLines}

위 자료를 근거로 ${langLabel}로 답하세요. 조건:
- 1순위 날을 왜 권하는지 먼저 쓰고, 길신 이름을 근거로 들어 설명하세요.
- 사정이 안 될 때를 위해 2·3순위도 한 줄씩 짚어 주세요.
- 흉살이 붙은 날은 숨기지 말고 "이런 점만 조심하면 된다"는 식으로 짚어 주세요.
- 날짜는 반드시 위에 준 그대로 쓰세요.
- 400~500자 분량, 문단 2~3개.
- JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사로 편하게 이어서 사람이 말하듯 써주세요.`;

    // geminiText 로 부른다 — 실패하면 ''를 주고 상태·finishReason 을 로그에 남긴다.
    // 인라인 fetch 로 두면 실패가 서버 어디에도 안 남아 "가끔 안 된다"를 추적할 수 없다.
    // (systemInstruction·타임아웃·thinkingBudget 은 geminiText 안에 들어 있다 — 여기서 다시 주지 않는다.)
    const reading = await cachedReading(env, 'takil:' + _promptKey(prompt), CACHE_LONG,
      () => geminiText(env, prompt, { temperature: 0.8, maxOutputTokens: 1400 }));

    if (!reading) {
      await refund(); refund = null;
      return cors(JSON.stringify({ error: { message: '택일 풀이를 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'takil', `${purposeLabel} · ${localized[0].ymd}`, reading,
      { purpose, picks: localized }).catch(() => {});

    return cors(JSON.stringify({
      success: true, purpose, purposeLabel, picks: localized, reading,
      from: startYmd, scanDays, remaining: remainingTokens,
    }), 200);
  } catch(e) {
    // Gemini 호출이 던지는 등 위에서 예외가 나면 차감만 남는다 — 여기서 되돌린다.
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  대운(大運) — 10년 단위로 바뀌는 운의 흐름 (엽전 3개)
//
//  사주가 "타고난 판"이라면 대운은 "시간에 따라 바뀌는 판"이다. 여기서도 계산은
//  코드가 끝낸다. 대운의 방향(순행·역행)과 기운(起運) 시점, 각 구간의 간지는
//  lunar-javascript 의 EightChar.getYun 이 절기 거리로 산출하고, AI 는 "지금 어느
//  자리에 와 있는지"를 해석만 한다.
//
//  방향은 연간(年干)의 음양과 성별로 갈린다(양남음녀 순행). 그래서 성별이 없으면
//  대운 자체를 세울 수 없어 이 기능만 성별을 필수로 받는다.
// ════════════════════════════════════════════

// 시진(자시~해시)만 알아도 기운 시점이 꽤 정확해진다 — 절기까지의 거리를 날짜가 아니라
// 시각으로 재기 때문이다. 지지 인덱스를 그 시진의 대표 시각으로 옮긴다(자시는 0시).
function _hourFromBranch(hourInput) {
  const raw = (hourInput || '').trim();
  const branch = SIJI_TO_JJ[raw] || raw;
  const idx = JJ.indexOf(branch);
  return idx >= 0 ? idx * 2 : 0;
}

/**
 * 대운 구간을 만들어 돌려준다. 네트워크도 AI 도 타지 않는다.
 * @param {{year:number,month:number,day:number,hour?:string}} birth 시진명은 있으면 쓴다
 * @param {'M'|'F'} gender 대운 방향이 성별로 갈리므로 필수
 * @param {number} refYear '지금'으로 볼 해
 */
function computeDaeun(birth, gender, refYear) {
  const y = parseInt(birth.year, 10), m = parseInt(birth.month, 10), d = parseInt(birth.day, 10);
  if (!y || !m || !d) return null;
  if (gender !== 'M' && gender !== 'F') return null;

  const ec = Solar.fromYmdHms(y, m, d, _hourFromBranch(birth.hour), 0, 0).getLunar().getEightChar();
  const yun = ec.getYun(gender === 'M' ? 1 : 0);

  const periods = yun.getDaYun()
    .filter(p => p.getGanZhi())      // 첫 칸은 태어나서 기운 전까지라 간지가 비어 있다
    .map(p => {
      const gz = p.getGanZhi();
      const gi = CG.indexOf(gz[0]), zi = JJ.indexOf(gz[1]);
      return {
        ganzhi: gz,
        ganElem: gi >= 0 ? CGO[gi] : '',
        zhiElem: zi >= 0 ? JJO[zi] : '',
        startYear: p.getStartYear(), endYear: p.getEndYear(),
        startAge: p.getStartAge(),   endAge: p.getEndAge(),
        current: refYear >= p.getStartYear() && refYear <= p.getEndYear(),
      };
    });
  if (!periods.length) return null;

  const curIdx = periods.findIndex(p => p.current);
  // 아직 기운 전이면 첫 대운을 '다음'으로 안내한다 — 어린 나이에 조회하는 경우다.
  const current = curIdx >= 0 ? periods[curIdx] : null;
  const next    = curIdx >= 0 ? (periods[curIdx + 1] || null) : periods[0];

  // 세운(그 해의 간지)은 대운 안에서 다시 한 해씩 갈린다.
  let liunian = null;
  if (curIdx >= 0) {
    const raw = yun.getDaYun().filter(p => p.getGanZhi())[curIdx];
    const hit = raw.getLiuNian().find(n => n.getYear() === refYear);
    if (hit) {
      const gz = hit.getGanZhi();
      const gi = CG.indexOf(gz[0]), zi = JJ.indexOf(gz[1]);
      liunian = { year: refYear, ganzhi: gz, ganElem: gi >= 0 ? CGO[gi] : '', zhiElem: zi >= 0 ? JJO[zi] : '' };
    }
  }

  // 기운(起運)까지 걸리는 시간. getStartYear/Month/Day 는 달력 날짜가 아니라 "태어나고 몇 년
  // 몇 개월 뒤"라는 간격이다. 구간 경계는 해 단위라 시진을 넣어도 안 움직이지만 이 값은 움직인다 —
  // 시각을 받는 의미가 여기에 있다.
  const qiyun = { years: yun.getStartYear(), months: yun.getStartMonth(), days: yun.getStartDay() };

  return { forward: yun.isForward(), qiyun, periods, current, next, liunian };
}

// ════════════════════════════════════════════
//  배우자궁(配偶者宮) 풀이
// ════════════════════════════════════════════
// 사주 네 기둥 중 **일지(日支)**, 곧 태어난 날 기둥의 아랫글자가 배우자 자리다.
// 여기 앉은 글자와 십신으로 배우자상과 관계의 결을 보고, 대운·세운이 이 자리를
// 충(沖)·형(刑)으로 건드리는 때를 관계가 시험받는 시기로 본다.
//
// ⚠️ "이혼 사주"로 만들지 않은 이유가 계산에도 반영돼 있다. 일지가 충을 받는다고
//    반드시 헤어지는 게 아니다 — 자료들도 한목소리로 그렇게 말하고, 충이 오히려
//    관계를 새로 깊게 만들기도 한다. 그래서 이 함수는 '이혼 여부'를 판정하지 않고
//    **어느 해에 어떤 종류의 흔들림이 오는지**만 돌려준다. 판단은 사람 몫이다.

// 지지 육충(六沖) — 정반대 자리끼리 부딪친다(여섯 칸 차이).
const JJ_CHUNG = { 子:'午', 午:'子', 丑:'未', 未:'丑', 寅:'申', 申:'寅',
                   卯:'酉', 酉:'卯', 辰:'戌', 戌:'辰', 巳:'亥', 亥:'巳' };
// 지지 육합(六合) — 맞물려 안정되는 짝.
const JJ_HAP   = { 子:'丑', 丑:'子', 寅:'亥', 亥:'寅', 卯:'戌', 戌:'卯',
                   辰:'酉', 酉:'辰', 巳:'申', 申:'巳', 午:'未', 未:'午' };
// 형(刑) — 삼형과 상형, 자형.
const JJ_HYUNG = {
  寅: ['巳', '申'], 巳: ['寅', '申'], 申: ['寅', '巳'],   // 삼형
  丑: ['戌', '未'], 戌: ['丑', '未'], 未: ['丑', '戌'],   // 삼형
  子: ['卯'], 卯: ['子'],                                 // 상형
  辰: ['辰'], 午: ['午'], 酉: ['酉'], 亥: ['亥'],          // 자형
};

/** 십신. 일간과 상대 오행·음양의 관계로 정한다. */
const SAENG = { 木:'火', 火:'土', 土:'金', 金:'水', 水:'木' };   // 내가 낳는다
const GEUK  = { 木:'土', 土:'水', 水:'火', 火:'金', 金:'木' };   // 내가 이긴다

function _sipsin(dayGan, targetElem, targetYang) {
  const gi = CG.indexOf(dayGan);
  if (gi < 0) return null;
  const me = CGO[gi];
  const myYang = gi % 2 === 0;          // 갑·병·무·경·임이 양
  const same = myYang === targetYang;

  if (me === targetElem)          return same ? '비견' : '겁재';
  if (SAENG[me] === targetElem)   return same ? '식신' : '상관';
  if (GEUK[me] === targetElem)    return same ? '편재' : '정재';
  if (GEUK[targetElem] === me)    return same ? '편관' : '정관';
  if (SAENG[targetElem] === me)   return same ? '편인' : '정인';
  return null;
}

/** 십신이 배우자를 뜻하는 자리인지. 남자는 재성, 여자는 관성을 배우자로 본다. */
function _isSpouseStar(sipsin, gender) {
  if (gender === 'M') return sipsin === '정재' || sipsin === '편재';
  if (gender === 'F') return sipsin === '정관' || sipsin === '편관';
  return false;   // 성별을 모르면 단정하지 않는다
}

const _SIPSIN_MEANING = {
  비견: '나와 같은 결. 대등한 동반자를 원하고, 서로 자기 자리를 지키려는 힘이 함께 있습니다.',
  겁재: '가깝고도 겨루는 사이. 함께 나아가지만 몫을 나누는 데서 부딪히기 쉽습니다.',
  식신: '먹이고 돌보는 자리. 편안하고 너그러운 관계를 만들지만 무뎌지기도 합니다.',
  상관: '드러내고 표현하는 자리. 솔직해서 가깝지만, 그 솔직함이 상처가 되기도 합니다.',
  정재: '알뜰하고 성실한 자리. 안정된 살림과 꾸준한 정을 중히 여깁니다.',
  편재: '넓고 활달한 자리. 씀씀이도 마음도 크지만 한곳에 머물기를 답답해하기도 합니다.',
  정관: '반듯하고 책임지는 자리. 질서와 도리를 지키려 하고 약속을 무겁게 봅니다.',
  편관: '강하고 밀어붙이는 자리. 든든하지만 때로 억누르는 힘으로 느껴집니다.',
  정인: '품고 기르는 자리. 이해받는 느낌이 크지만 기대는 마음도 함께 큽니다.',
  편인: '깊고 사려 깊은 자리. 속을 잘 헤아리되 거리를 두려는 면도 있습니다.',
};


// ── 재물운 ──
//
// 사주에서 돈은 재성(財星), 곧 정재와 편재로 본다. 다만 재성이 많다고 부자가 아니다.
//   · 재성을 낳아 주는 힘(식신·상관)이 있어야 돈이 들어오는 길이 생긴다 (식상생재)
//   · 재성을 나눠 갖는 힘(비견·겁재)이 세면 벌어도 남지 않는다 (군겁쟁재)
//   · 일간이 약한데 재성만 크면 감당하지 못한다 (재다신약)
// 이 셋을 함께 봐야 말이 된다. 아래는 그 셋을 세는 계산이다.

const _JAE  = ['정재', '편재'];
const _SIK  = ['식신', '상관'];
const _BIG  = ['비견', '겁재'];
const _IN   = ['정인', '편인'];

/**
 * 재물의 결을 읽는다.
 * @param {object} saju computeSaju 결과
 * @param {number} fromYear 세운을 훑기 시작할 해
 * @param {number} years 몇 해를 볼지
 */
function computeWealth(saju, fromYear, years = 10) {
  const spread = computeSipsinSpread(saju);
  if (!spread) return null;

  const pctOf = (names) => spread.spread
    .filter(x => names.includes(x.name))
    .reduce((a, x) => a + x.pct, 0);

  const jae = pctOf(_JAE), sik = pctOf(_SIK), big = pctOf(_BIG), inseong = pctOf(_IN);
  // 일간을 돕는 힘(비겁+인성)이 몸의 힘이다. 이게 재성보다 두터워야 재물을 감당한다.
  const body = big + inseong;

  // 재성이 어느 기둥에 앉았는지. 자리마다 뜻이 다르다.
  const POS = ['년', '월', '일', '시'];
  const POS_MEAN = {
    년: '집안과 어린 시절의 재물',
    월: '일터에서 버는 재물. 사주에서 가장 힘이 실리는 자리다',
    일: '내 손에 쥐는 재물, 그리고 배우자',
    시: '말년과 자식 대의 재물',
  };
  const seats = [];
  [saju.yp, saju.mp, saju.dp, saju.hp].forEach((p, i) => {
    if (!p) return;
    for (const gan of [p[0], JJ_BONGI[p[1]]]) {
      const gi = CG.indexOf(gan);
      if (gi < 0) continue;
      const name = _sipsin(saju.dayGan, CGO[gi], gi % 2 === 0);
      if (_JAE.includes(name) && !seats.some(x => x.pos === POS[i])) {
        seats.push({ pos: POS[i], name, mean: POS_MEAN[POS[i]] });
      }
    }
  });

  // 앞으로 재성이 드는 해. 그 해 지지의 본기로 본다.
  const now = fromYear || _kstYear();
  const good = [];
  for (let y = now; y < now + years; y++) {
    const branch = JJ[(y - 4) % 12];
    const gi = CG.indexOf(JJ_BONGI[branch]);
    if (gi < 0) continue;
    const name = _sipsin(saju.dayGan, CGO[gi], gi % 2 === 0);
    if (_JAE.includes(name)) good.push({ year: y, branch, sipsin: name });
    else if (_SIK.includes(name)) good.push({ year: y, branch, sipsin: name, feeds: true });
  }

  // 어떤 그림인지 한 줄로 정한다. 글은 이 판정을 근거로 쓴다.
  let shape, note;
  if (jae === 0) {
    shape = '재성무';
    note = '사주에 재성이 드러나 있지 않습니다. 돈이 없다는 뜻이 아니라, 돈을 좇기보다 일과 재주로 풀리는 결입니다.';
  } else if (jae > body) {
    shape = '재다신약';
    note = '재성이 몸의 힘보다 큽니다. 기회는 많은데 다 쥐려다 지치기 쉬우니, 벌리기보다 하나를 붙드는 편이 낫습니다.';
  } else if (big >= 30 && jae > 0) {
    shape = '군겁쟁재';
    note = '재물을 나눠 갖는 힘이 셉니다. 동업과 보증에서 새기 쉬우니 돈은 내 이름으로 지키는 편이 좋습니다.';
  } else if (sik >= 15 && jae > 0) {
    shape = '식상생재';
    note = '재주가 돈을 낳는 결입니다. 남 밑에서 받는 삯보다 내가 만들어 파는 쪽에서 크게 됩니다.';
  } else {
    shape = '신왕재왕';
    note = '몸과 재물이 함께 섭니다. 꾸준히 모으면 모이는 결이라, 큰 한 방보다 오래 가는 쪽이 맞습니다.';
  }

  return { spread: spread.spread, jae, sik, big, inseong, body, seats, years: good, shape, note };
}

// ════════════════════════════════════════════════════════════
//  신살(神煞) · 삼재 · 띠 순위 · 십신 분포
//
//  전부 지지(地支) 표로 정해지는 것이라 계산으로 끝난다. AI 에게 "도화살이 있나요"
//  하고 묻지 않는다 — 물으면 매번 다른 답이 나오고, 그건 사주가 아니라 소설이다.
//  계산은 여기서 하고, AI 에게는 **계산 결과를 읽어 주는 일**만 맡긴다.
// ════════════════════════════════════════════════════════════

// 삼합국(三合局). 신살 대부분이 이 표에서 나온다.
//   [삼합 세 글자, 왕지(도화), 역마, 화개]
const SAMHAP_GROUPS = [
  { set: ['寅', '午', '戌'], dohwa: '卯', yeokma: '申', hwagae: '戌' },
  { set: ['巳', '酉', '丑'], dohwa: '午', yeokma: '亥', hwagae: '丑' },
  { set: ['申', '子', '辰'], dohwa: '酉', yeokma: '寅', hwagae: '辰' },
  { set: ['亥', '卯', '未'], dohwa: '子', yeokma: '巳', hwagae: '未' },
];
const _groupOf = (branch) => SAMHAP_GROUPS.find(g => g.set.includes(branch)) || null;

// 백호대살(白虎大殺) — 간지 한 쌍으로 정해진다.
const BAEKHO = new Set(['甲辰', '乙未', '丙戌', '丁丑', '戊辰', '壬戌', '癸丑']);
// 괴강살(魁罡殺) — 일주로 본다.
const GWAEGANG = new Set(['庚辰', '庚戌', '壬辰', '戊戌']);
// 양인살(羊刃殺) — 일간의 겁재가 앉는 왕지. 음간에는 세우지 않는 것이 통설이다.
const YANGIN = { 甲: '卯', 丙: '午', 戊: '午', 庚: '酉', 壬: '子' };
// 천을귀인(天乙貴人) — 살이 아니라 길신. 흉살만 늘어놓으면 겁만 주게 된다.
const CHEONEUL = {
  甲: ['丑', '未'], 戊: ['丑', '未'], 庚: ['丑', '未'],
  乙: ['子', '申'], 己: ['子', '申'],
  丙: ['亥', '酉'], 丁: ['亥', '酉'],
  辛: ['午', '寅'],
  壬: ['巳', '卯'], 癸: ['巳', '卯'],
};

const SINSAL_MEANING = {
  도화살: { good: true, text: '사람을 끌어당기는 기운입니다. 눈에 띄고 인기를 얻지만, 그만큼 구설도 함께 옵니다.' },
  역마살: { good: true, text: '한곳에 머물지 못하는 결입니다. 이동·여행·해외와 인연이 깊고, 변화가 잦습니다.' },
  화개살: { good: true, text: '홀로 깊어지는 자리입니다. 예술·학문·종교에 재주가 있고, 고독을 벗 삼습니다.' },
  백호살: { good: false, text: '기운이 급하고 강합니다. 피를 보는 일(수술·사고)과 인연이 있다 하여 조심을 이릅니다.' },
  괴강살: { good: false, text: '극과 극의 자리입니다. 크게 이루거나 크게 꺾이며, 우두머리 기질이 강합니다.' },
  양인살: { good: false, text: '날이 선 칼과 같습니다. 결단이 빠르고 추진력이 세지만, 스스로를 베기도 합니다.' },
  천을귀인: { good: true, text: '가장 귀한 길신입니다. 어려울 때 손 내미는 사람이 나타나고, 흉한 일이 눅어집니다.' },
};

/**
 * 사주 네 기둥에서 신살을 찾는다.
 * @param {{yp,mp,dp,hp,dayGan}} saju computeSaju 의 결과
 */
function computeSinsal(saju) {
  if (!saju) return null;
  const pillars = [saju.yp, saju.mp, saju.dp, saju.hp].filter(Boolean);
  const branches = pillars.map(p => p[1]);
  const yearBranch = saju.yp?.[1];
  const dayBranch = saju.dp?.[1];
  const dayGan = saju.dayGan;

  // 기준은 년지와 일지 둘 다 본다(어느 쪽을 쓰느냐는 유파가 갈린다).
  const bases = [...new Set([yearBranch, dayBranch].filter(Boolean))];
  const hits = [];
  const add = (name, where) => {
    const found = hits.find(h => h.name === name);
    if (found) { if (!found.where.includes(where)) found.where.push(where); return; }
    hits.push({ name, where: [where], ...SINSAL_MEANING[name] });
  };
  const POS = ['년', '월', '일', '시'];

  for (const base of bases) {
    const g = _groupOf(base);
    if (!g) continue;
    branches.forEach((b, i) => {
      if (b === g.dohwa)  add('도화살', POS[i]);
      if (b === g.yeokma) add('역마살', POS[i]);
      if (b === g.hwagae) add('화개살', POS[i]);
    });
  }
  pillars.forEach((p, i) => { if (BAEKHO.has(p)) add('백호살', POS[i]); });
  if (saju.dp && GWAEGANG.has(saju.dp)) add('괴강살', '일');
  if (YANGIN[dayGan]) branches.forEach((b, i) => { if (b === YANGIN[dayGan]) add('양인살', POS[i]); });
  (CHEONEUL[dayGan] || []).forEach(t => branches.forEach((b, i) => { if (b === t) add('천을귀인', POS[i]); }));

  return { hits, samjae: computeSamjae(yearBranch) };
}

/**
 * 삼재(三災). 태어난 해의 띠가 속한 삼합국마다 드는 3년이 정해져 있다.
 * 들삼재·눌삼재(누울삼재)·날삼재 순으로 지나간다.
 */
const SAMJAE_YEARS = {
  '申子辰': ['寅', '卯', '辰'],
  '巳酉丑': ['亥', '子', '丑'],
  '寅午戌': ['申', '酉', '戌'],
  '亥卯未': ['巳', '午', '未'],
};
function computeSamjae(yearBranch, fromYear) {
  const g = _groupOf(yearBranch);
  if (!g) return null;
  const years = SAMJAE_YEARS[g.set.join('')];
  if (!years) return null;
  const now = fromYear || Number(new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 4));
  const LABEL = ['들삼재', '눌삼재', '날삼재'];

  // ⚠️ 삼재는 **연속한 세 해**다. 해당 지지를 아무 데서나 주워 담으면
  // 卯·辰·寅(2023·2024·2034) 처럼 흩어진 해가 나온다 — 12년 건너뛴 남의 주기다.
  // 들삼재가 드는 해를 먼저 찾고, 거기서 세 해를 이어 붙인다.
  const branchOf = (y) => JJ[(y - 4) % 12];           // 서기 4년이 甲子년
  let start = now;
  while (branchOf(start) !== years[0]) start--;
  if (now > start + 2) start += 12;                   // 이미 지난 주기면 다음 주기로

  const out = [0, 1, 2].map(i => ({ year: start + i, kind: LABEL[i] }));
  const inSamjae = now >= start && now <= start + 2;
  return { years: out, now, inSamjae };
}

// ── 오늘의 띠 순위 ──
//
// 그날 일진의 지지와 열두 띠가 맺는 관계로 점수를 낸다. 무작위가 아니라 계산이라
// 같은 날에는 누가 보든 같은 순위가 나온다 — 운세는 그래야 믿긴다.
const TTI_NAME = { 子: '쥐', 丑: '소', 寅: '호랑이', 卯: '토끼', 辰: '용', 巳: '뱀',
                   午: '말', 未: '양', 申: '원숭이', 酉: '닭', 戌: '개', 亥: '돼지' };

function computeTtiRanking(ymd) {
  const [y, m, d] = String(ymd).split('-').map(n => parseInt(n, 10));
  if (!y || !m || !d) return null;
  let dayBranch;
  try {
    dayBranch = Solar.fromYmd(y, m, d).getLunar().getEightChar().getDay()[1];
  } catch { return null; }
  const g = _groupOf(dayBranch);

  const rows = JJ.map(b => {
    let score = 0;
    const why = [];
    if (g && g.set.includes(b) && b !== dayBranch) { score += 3; why.push('삼합'); }
    if (JJ_HAP[dayBranch] === b) { score += 3; why.push('육합'); }
    if (b === dayBranch) { score += 2; why.push('일진과 같은 자리'); }
    if (JJ_CHUNG[dayBranch] === b) { score -= 3; why.push('충'); }
    if ((JJ_HYUNG[dayBranch] || []).includes(b)) { score -= 2; why.push('형'); }
    return { branch: b, name: TTI_NAME[b], score, why };
  });

  // 점수가 같을 때의 순서도 날마다 달라야 한다. 날짜에서 뽑은 값으로 흔든다
  // (무작위가 아니라 날짜의 함수라, 같은 날 다시 봐도 순위가 그대로다).
  const seed = (y * 10000 + m * 100 + d) % 12;
  rows.forEach((r, i) => { r.tie = (i + seed) % 12; });
  rows.sort((a, b) => b.score - a.score || a.tie - b.tie);
  return { dayBranch, rows: rows.map((r, i) => ({ rank: i + 1, ...r })) };
}

// ── 십신 분포 ──
//
// 천직·적성은 어떤 십신이 두터운가로 읽는다. 천간 넷과 지지의 본기(本氣)를 함께 센다.
const JJ_BONGI = { 子: '癸', 丑: '己', 寅: '甲', 卯: '乙', 辰: '戊', 巳: '丙',
                   午: '丁', 未: '己', 申: '庚', 酉: '辛', 戌: '戊', 亥: '壬' };

function computeSipsinSpread(saju) {
  if (!saju?.dayGan) return null;
  const count = {};
  const bump = (gan, weight) => {
    const gi = CG.indexOf(gan);
    if (gi < 0) return;
    const name = _sipsin(saju.dayGan, CGO[gi], gi % 2 === 0);
    if (name) count[name] = (count[name] || 0) + weight;
  };
  for (const p of [saju.yp, saju.mp, saju.dp, saju.hp]) {
    if (!p) continue;
    bump(p[0], 1);                       // 천간
    bump(JJ_BONGI[p[1]], 1);             // 지지 본기
  }
  // 일간 자신은 세지 않는다(늘 비견이 되어 분포를 흐린다).
  const gi = CG.indexOf(saju.dayGan);
  if (gi >= 0) {
    const self = _sipsin(saju.dayGan, CGO[gi], gi % 2 === 0);
    if (self && count[self]) count[self] -= 1;
  }
  const total = Object.values(count).reduce((a, b) => a + b, 0) || 1;
  const sorted = Object.entries(count)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => ({ name, count: n, pct: Math.round((n / total) * 100) }));
  return { total, spread: sorted, top: sorted.slice(0, 3).map(x => x.name) };
}

/**
 * 배우자궁을 읽는다.
 * @param {{year,month,day,hour}} birth
 * @param {'M'|'F'|null} gender
 * @param {number} fromYear 시기를 훑기 시작할 해
 * @param {number} years 몇 해를 볼지
 */
function computeSpousePalace(birth, gender, fromYear, years = 10) {
  const saju = computeSaju(birth.year, birth.month, birth.day, birth.hour);
  if (!saju || !saju.dp || saju.dp.length < 2) return null;

  const branch = saju.dp[1];                   // 일지 = 배우자궁
  const bi = JJ.indexOf(branch);
  if (bi < 0) return null;
  const elem = JJO[bi];
  const yang = bi % 2 === 0;                   // 자·인·진·오·신·술이 양
  const sipsin = _sipsin(saju.dayGan, elem, yang);

  // 앞으로 몇 해가 이 자리를 어떻게 건드리는지.
  const timeline = [];
  for (let i = 0; i < years; i++) {
    const y = fromYear + i;
    // 세운 지지는 60갑자 순환에서 온다. 1984년(갑자년)의 지지가 子.
    const yb = JJ[(((y - 1984) % 12) + 12) % 12];
    const kinds = [];
    if (JJ_CHUNG[branch] === yb) kinds.push('충');
    if ((JJ_HYUNG[branch] || []).includes(yb)) kinds.push('형');
    if (JJ_HAP[branch] === yb) kinds.push('합');
    if (kinds.length) timeline.push({ year: y, branch: yb, kinds });
  }

  return {
    branch, elem, sipsin,
    meaning: _SIPSIN_MEANING[sipsin] || '',
    isSpouseStar: _isSpouseStar(sipsin, gender),
    chung: JJ_CHUNG[branch] || null,
    hap: JJ_HAP[branch] || null,
    timeline,
    saju: saju.text,
    dayGan: saju.dayGan,
  };
}


// ════════════════════════════════════════════════════════════
//  재물운 (4엽전)
//
//  운세 검색에서 가장 많이 찾는 주제다. 다만 "부자가 된다/못 된다" 로 답하면
//  점집이지 상담이 아니다. 어떤 결로 돈이 들어오고 어디서 새는지를 짚는다.
// ════════════════════════════════════════════════════════════
async function handleWealth(request, env) {
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { birth, gender } = await request.json().catch(() => ({}));
    const saju = birth && birth.year
      ? computeSaju(birth.year, birth.month, birth.day, birth.hour) : null;
    if (!saju) return cors(JSON.stringify({ error: { message: '생년월일이 올바르지 않습니다.' } }), 400);
    const w = computeWealth(saju, _kstYear(), 10);
    if (!w) return cors(JSON.stringify({ error: { message: '재물운을 계산하지 못했습니다.' } }), 400);

    const COST = 4;
    const paid = await accountSpend(env, acct, 'wealth', COST);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: '재물운 풀이는 엽전 ' + COST + '개가 필요합니다.' } }), 402);
    }
    refund = () => accountRefund(env, acct, 'wealth', COST);
    const remainingTokens = await accountBalance(env, acct);

    const g = _normalizeGender(gender);
    const jaeYears = w.years.filter(y => !y.feeds).map(y => y.year + '년');
    const sikYears = w.years.filter(y => y.feeds).map(y => y.year + '년');
    const prompt = [
      '상담자의 사주: ' + [saju.yp, saju.mp, saju.dp, saju.hp].filter(Boolean).join(' '),
      '일간은 ' + saju.dayGan + '(' + saju.dayElem + ') 입니다.',
      g ? '상담자는 ' + (g === 'M' ? '남성' : '여성') + ' 입니다.' : '',
      '',
      '계산해 둔 것:',
      '재성(돈) ' + w.jae + '%, 식상(버는 재주) ' + w.sik + '%, 비겁(나눠 갖는 힘) ' + w.big + '%, 인성 ' + w.inseong + '%.',
      '몸의 힘(비겁+인성)은 ' + w.body + '% 입니다.',
      '판정: ' + w.shape + '. ' + w.note,
      w.seats.length
        ? '재성이 앉은 자리: ' + w.seats.map(x => x.pos + '주(' + x.name + '), ' + x.mean).join(' / ')
        : '재성이 드러난 자리가 없습니다.',
      jaeYears.length ? '앞으로 재물이 드는 해: ' + jaeYears.join(', ') : '',
      sikYears.length ? '재주가 트여 돈길이 열리는 해: ' + sikYears.join(', ') : '',
      '',
      '이 사람의 재물운을 풀어 주세요. 다음 순서로 이어지는 글로 씁니다.',
      '1) 이 사주에서 돈이 들어오는 결. 위 판정을 근거로 삼되 용어는 그 자리에서 풀어 주기',
      '2) 어디서 새는지, 무엇을 조심하면 되는지',
      '3) 재물이 드는 해에 무엇을 준비하면 좋은지',
      '4) 올해 안에 해볼 수 있는 아주 구체적인 한 가지',
      '',
      '⚠️ 반드시 지킬 것: 부자가 된다거나 못 된다고 단정하지 마세요. 얼마를 벌게 된다는',
      '금액, 주식·코인·부동산 같은 투자 종목을 말하지 마세요. 돈을 다루는 태도와 습관,',
      '그리고 시기의 결을 짚는 글이어야 합니다. 재물이 적게 나온 사주라도 기죽지 않게,',
      '그 사람 나름의 길을 함께 보여 주세요.',
      '전체 700자 내외.',
    ].filter(Boolean).join(String.fromCharCode(10));

    const reading = await cachedReading(env, 'wealth:' + _promptKey(prompt), CACHE_LONG,
      () => geminiText(env, prompt, { temperature: 0.85, maxOutputTokens: 2048 }));
    if (!reading) {
      if (refund) await refund().catch(() => {});
      return cors(JSON.stringify({ error: { message: '풀이를 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'wealth', '재물운 ' + w.shape, reading,
      { shape: w.shape, jae: w.jae }).catch(() => {});

    return cors(JSON.stringify({
      success: true, reading,
      shape: w.shape, jae: w.jae, sik: w.sik, big: w.big, body: w.body,
      seats: w.seats, wealthYears: w.years, remaining: remainingTokens,
    }), 200);
  } catch (e) {
    console.error('[WEALTH]', e?.message);
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error: { message: '풀이 중 오류가 발생했습니다.' } }), 500);
  }
}

// ════════════════════════════════════════════════════════════
//  신살 풀이 (3엽전)
//
//  도화살·역마살 같은 말은 검색이 많은 만큼 겁을 주기도 쉽다. 계산은 표대로 하되
//  글은 "이런 기운이니 이렇게 쓰시라" 로 간다 — 흉살만 늘어놓고 끝내지 않는다.
// ════════════════════════════════════════════════════════════
async function handleSinsal(request, env) {
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { birth, gender } = await request.json().catch(() => ({}));
    const saju = birth && birth.year
      ? computeSaju(birth.year, birth.month, birth.day, birth.hour) : null;
    if (!saju) return cors(JSON.stringify({ error: { message: '생년월일이 올바르지 않습니다.' } }), 400);
    const sin = computeSinsal(saju);
    if (!sin) return cors(JSON.stringify({ error: { message: '신살을 계산하지 못했습니다.' } }), 400);

    const COST = 3;
    const paid = await accountSpend(env, acct, 'sinsal', COST);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: '신살 풀이는 엽전 ' + COST + '개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    refund = () => accountRefund(env, acct, 'sinsal', COST);
    const remainingTokens = await accountBalance(env, acct);

    const g = _normalizeGender(gender);
    const list = sin.hits.map(h => h.name + '(' + h.where.join(', ') + '주): ' + h.text).join(NL);
    const sj = sin.samjae;
    const prompt = [
      '상담자의 사주: ' + [saju.yp, saju.mp, saju.dp, saju.hp].filter(Boolean).join(' '),
      '일간은 ' + saju.dayGan + ' 입니다.',
      g ? '상담자는 ' + (g === 'M' ? '남성' : '여성') + ' 입니다.' : '',
      '',
      sin.hits.length ? '이 사주에 선 신살:' + NL + list
        : '뚜렷하게 선 신살이 없습니다. 그것도 하나의 결이니 그렇게 읽어 주세요.',
      '',
      sj ? (sj.inSamjae
        ? '지금 삼재 중입니다(' + sj.years.map(y => y.year + '년 ' + y.kind).join(', ') + ').'
        : '다음 삼재는 ' + sj.years.map(y => y.year + '년 ' + y.kind).join(', ') + ' 입니다.') : '',
      '',
      '이 사람의 신살을 풀어 주세요. 다음 순서로 이어지는 글로 씁니다.',
      '1) 가장 도드라진 기운 하나를 먼저 짚고, 그 기운이 삶에서 어떻게 드러나는지',
      '2) 나머지 신살들이 서로 어떻게 얽히는지',
      '3) 이 기운을 잘 쓰는 법 — 억누르는 것이 아니라 쓰는 법으로',
      '4) 삼재에 대해 담담하게 한 문단',
      '',
      '⚠️ 반드시 지킬 것: 살(殺)이라는 글자에 겁먹지 않도록 하세요. 사고·수술·이별 같은',
      '일을 예언하지 마세요. 신살은 타고난 기운의 결이지 정해진 불행이 아니며, 어떻게',
      '쓰느냐에 따라 재능이 된다고 분명히 말해 주세요. 삼재도 "조심할 때"이지',
      '"나쁜 일이 반드시 생기는 해"가 아닙니다.',
      '전체 700자 내외.',
    ].filter(Boolean).join(NL);

    const reading = await cachedReading(env, 'sinsal:' + _sajuKey(saju, g), CACHE_LONG,
      () => geminiText(env, prompt, { temperature: 0.85, maxOutputTokens: 2048 }));
    if (!reading) {
      if (refund) await refund().catch(() => {});
      return cors(JSON.stringify({ error: { message: '풀이를 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    const title = sin.hits.length ? sin.hits.map(h => h.name).join('·') : '신살 없음';
    await saveFeatureHistory(env, accountHistoryKey(acct), 'sinsal', '신살 ' + title, reading,
      { hits: sin.hits.map(h => h.name) }).catch(() => {});

    return cors(JSON.stringify({
      success: true, reading, hits: sin.hits, samjae: sin.samjae,
      saju: [saju.yp, saju.mp, saju.dp, saju.hp].filter(Boolean).join(' '),
      remaining: remainingTokens,
    }), 200);
  } catch (e) {
    console.error('[SINSAL]', e?.message);
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error: { message: '풀이 중 오류가 발생했습니다.' } }), 500);
  }
}

// ════════════════════════════════════════════════════════════
//  오늘의 띠 순위 (1엽전)
//
//  순위 자체는 계산이라 AI 없이도 나온다. AI 에게는 1위와 꼴찌, 그리고 내 띠에
//  대한 짧은 말만 맡긴다 — 열두 줄을 다 쓰게 하면 느리고 비싸다.
// ════════════════════════════════════════════════════════════
async function handleTtiRanking(request, env) {
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { birth } = await request.json().catch(() => ({}));
    const today = _kstYmd();
    const rank = computeTtiRanking(today);
    if (!rank) return cors(JSON.stringify({ error: { message: '오늘의 순위를 계산하지 못했습니다.' } }), 500);

    // 내 띠. 생년이 없어도 순위는 볼 수 있게 한다.
    let mine = null;
    if (birth && birth.year) {
      const saju = computeSaju(birth.year, birth.month || 1, birth.day || 1, birth.hour || '');
      if (saju) mine = rank.rows.find(r => r.branch === saju.yp[1]) || null;
    }

    const COST = 1;
    const paid = await accountSpend(env, acct, 'ttirank', COST);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: '오늘의 띠 순위는 엽전 ' + COST + '개가 필요합니다.' } }), 402);
    }
    refund = () => accountRefund(env, acct, 'ttirank', COST);
    const remainingTokens = await accountBalance(env, acct);

    const top = rank.rows[0], bottom = rank.rows[11];
    const prompt = [
      '오늘은 일진의 지지가 ' + rank.dayBranch + ' 인 날입니다.',
      '오늘 기운이 가장 좋은 띠는 ' + top.name + '띠(' + top.why.join(', ') + ')이고,',
      '가장 조심할 띠는 ' + bottom.name + '띠(' + bottom.why.join(', ') + ')입니다.',
      mine ? '이 사람은 ' + mine.name + '띠이고 오늘 ' + mine.rank + '위입니다' +
        (mine.why.length ? '(' + mine.why.join(', ') + ')' : '') + '.' : '',
      '',
      '다음 세 토막을 써 주세요. 각 토막은 두세 문장입니다.',
      '1) 오늘 1위인 ' + top.name + '띠에게 이 기운을 어디에 쓰면 좋은지',
      '2) 오늘 12위인 ' + bottom.name + '띠에게, 겁주지 말고 무엇을 늦추면 좋은지',
      mine ? '3) ' + mine.name + '띠인 상담자에게 오늘 하루를 어떻게 보내면 좋은지' : '3) 오늘 하루 모두에게 건네는 한마디',
      '',
      '⚠️ 순위가 낮다고 불행을 예고하지 마세요. 오늘 기운과 어긋난다는 뜻일 뿐입니다.',
      '토막마다 앞에 "1)" 같은 번호는 쓰지 말고, 빈 줄로 나눠 주세요.',
      '전체 400자 내외.',
    ].filter(Boolean).join(NL);

    const reading = await cachedReading(env, 'ttirank:' + today + ':' + (mine?.branch || '-'), CACHE_DAY,
      () => geminiText(env, prompt, { temperature: 0.9, maxOutputTokens: 1200 }));
    if (!reading) {
      if (refund) await refund().catch(() => {});
      return cors(JSON.stringify({ error: { message: '풀이를 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'ttirank',
      today + ' 띠 순위', reading, { top: top.name, mine: mine?.name || null }).catch(() => {});

    return cors(JSON.stringify({
      success: true, reading, date: today, dayBranch: rank.dayBranch,
      rows: rank.rows, mine, remaining: remainingTokens,
    }), 200);
  } catch (e) {
    console.error('[TTIRANK]', e?.message);
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error: { message: '풀이 중 오류가 발생했습니다.' } }), 500);
  }
}

// ════════════════════════════════════════════════════════════
//  전생 이야기 (4엽전)
//
//  한 번 보고 끝나는 콘텐츠라 값을 조금 높였다. 대신 읽는 맛으로 승부한다.
// ════════════════════════════════════════════════════════════
async function handlePastLife(request, env) {
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { birth, gender } = await request.json().catch(() => ({}));
    const saju = birth && birth.year
      ? computeSaju(birth.year, birth.month, birth.day, birth.hour) : null;
    if (!saju) return cors(JSON.stringify({ error: { message: '생년월일이 올바르지 않습니다.' } }), 400);

    const COST = 4;
    const paid = await accountSpend(env, acct, 'pastlife', COST);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: '전생 이야기는 엽전 ' + COST + '개가 필요합니다.' } }), 402);
    }
    refund = () => accountRefund(env, acct, 'pastlife', COST);
    const remainingTokens = await accountBalance(env, acct);

    const sin = computeSinsal(saju);
    const spread = computeSipsinSpread(saju);
    const g = _normalizeGender(gender);
    const prompt = [
      '상담자의 사주: ' + [saju.yp, saju.mp, saju.dp, saju.hp].filter(Boolean).join(' '),
      '일간은 ' + saju.dayGan + '(' + saju.dayElem + ') 이고, 두드러진 십신은 ' +
        (spread?.top?.join('·') || '고르게 퍼져 있습니다') + ' 입니다.',
      sin?.hits?.length ? '선 신살: ' + sin.hits.map(h => h.name).join('·') : '',
      g ? '상담자는 ' + (g === 'M' ? '남성' : '여성') + ' 입니다.' : '',
      '',
      '이 사주를 바탕으로 **전생 이야기**를 지어 주세요. 다음 순서로 씁니다.',
      '1) 어느 시대 어느 땅에서 무엇을 하던 사람이었는지 (구체적인 장면 하나로 시작)',
      '2) 그 삶에서 무엇을 잘했고 무엇에 걸려 넘어졌는지',
      '3) 그 결이 이번 생에 어떻게 남아 있는지 — 사주의 어느 글자와 이어지는지 짚어서',
      '4) 그래서 이번 생에 풀어야 할 숙제 한 가지',
      '',
      '⚠️ 지킬 것: 전생은 재미로 보는 이야기입니다. 실제 역사 인물의 이름을 대지 말고,',
      '전생 때문에 지금 불행하다는 식으로 쓰지 마세요. 읽고 나서 자기 자신을 조금 더',
      '이해하게 되는 글이어야 합니다. 장면이 눈에 보이도록 써 주세요.',
      '전체 700자 내외.',
    ].filter(Boolean).join(NL);

    const reading = await cachedReading(env, 'pastlife:' + _sajuKey(saju, g), CACHE_LONG,
      () => geminiText(env, prompt, { temperature: 0.95, maxOutputTokens: 2048 }));
    if (!reading) {
      if (refund) await refund().catch(() => {});
      return cors(JSON.stringify({ error: { message: '풀이를 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'pastlife', '전생 이야기', reading,
      { dayGan: saju.dayGan }).catch(() => {});

    return cors(JSON.stringify({
      success: true, reading,
      saju: [saju.yp, saju.mp, saju.dp, saju.hp].filter(Boolean).join(' '),
      remaining: remainingTokens,
    }), 200);
  } catch (e) {
    console.error('[PASTLIFE]', e?.message);
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error: { message: '풀이 중 오류가 발생했습니다.' } }), 500);
  }
}

// ════════════════════════════════════════════════════════════
//  천직 · 적성 (4엽전)
//
//  십신 분포로 읽는다. 재미보다 실용이라 취업·이직을 앞둔 사람이 다시 찾는다.
// ════════════════════════════════════════════════════════════
async function handleVocation(request, env) {
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { birth, gender } = await request.json().catch(() => ({}));
    const saju = birth && birth.year
      ? computeSaju(birth.year, birth.month, birth.day, birth.hour) : null;
    if (!saju) return cors(JSON.stringify({ error: { message: '생년월일이 올바르지 않습니다.' } }), 400);
    const spread = computeSipsinSpread(saju);
    if (!spread?.spread?.length) {
      return cors(JSON.stringify({ error: { message: '십신을 계산하지 못했습니다.' } }), 400);
    }

    const COST = 4;
    const paid = await accountSpend(env, acct, 'vocation', COST);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: '천직 풀이는 엽전 ' + COST + '개가 필요합니다.' } }), 402);
    }
    refund = () => accountRefund(env, acct, 'vocation', COST);
    const remainingTokens = await accountBalance(env, acct);

    const g = _normalizeGender(gender);
    const table = spread.spread.map(x => x.name + ' ' + x.pct + '%').join(', ');
    const prompt = [
      '상담자의 사주: ' + [saju.yp, saju.mp, saju.dp, saju.hp].filter(Boolean).join(' '),
      '일간은 ' + saju.dayGan + '(' + saju.dayElem + ') 입니다.',
      '십신 분포: ' + table,
      '가장 두터운 것은 ' + spread.top.join(', ') + ' 입니다.',
      g ? '상담자는 ' + (g === 'M' ? '남성' : '여성') + ' 입니다.' : '',
      '',
      '이 사람에게 맞는 일과 일하는 방식을 풀어 주세요. 다음 순서로 씁니다.',
      '1) 이 분포가 말하는 타고난 일머리 — 무엇을 할 때 힘이 덜 드는지',
      '2) 어울리는 일의 결 세 가지 (직업 이름을 못 박기보다 결로 — 다만 예시는 들어서)',
      '3) 조심할 자리 — 어떤 환경에서 지치기 쉬운지',
      '4) 지금 자리에서 바로 해볼 수 있는 한 가지',
      '',
      '⚠️ 지킬 것: "너는 이 직업을 해야 한다"고 못 박지 마세요. 적성은 가능성이지',
      '정해진 길이 아닙니다. 이미 다른 일을 하고 있는 사람이 읽어도 상처받지 않게,',
      '지금 하는 일에서 이 결을 살리는 법도 함께 짚어 주세요.',
      '전체 700자 내외.',
    ].filter(Boolean).join(NL);

    const reading = await cachedReading(env, 'vocation:' + _sajuKey(saju, g), CACHE_LONG,
      () => geminiText(env, prompt, { temperature: 0.85, maxOutputTokens: 2048 }));
    if (!reading) {
      if (refund) await refund().catch(() => {});
      return cors(JSON.stringify({ error: { message: '풀이를 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'vocation',
      '천직 ' + spread.top.join('·'), reading, { top: spread.top }).catch(() => {});

    return cors(JSON.stringify({
      success: true, reading, spread: spread.spread, top: spread.top,
      remaining: remainingTokens,
    }), 200);
  } catch (e) {
    console.error('[VOCATION]', e?.message);
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error: { message: '풀이 중 오류가 발생했습니다.' } }), 500);
  }
}

async function handleSpousePalace(request, env) {
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', birth, gender } = await request.json().catch(() => ({}));
    const g = _normalizeGender(gender);
    const now = new Date(Date.now() + 9 * 3600000);
    const sp = (birth && birth.year)
      ? computeSpousePalace(birth, g, now.getFullYear(), 10) : null;
    if (!sp) return cors(JSON.stringify({ error: { message: '생년월일이 올바르지 않습니다.' } }), 400);

    const COST = 3;
    const paid = await accountSpend(env, acct, 'spouse', COST);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: `배우자궁 풀이는 엽전 ${COST}개가 필요합니다. 잔액을 확인해 주세요.` } }), 402);
    }
    refund = () => accountRefund(env, acct, 'spouse', COST);
    const remainingTokens = await accountBalance(env, acct);

    const shake = sp.timeline.filter(t => t.kinds.some(k => k !== '합'));
    const steady = sp.timeline.filter(t => t.kinds.includes('합'));
    const prompt = [
      `상담자의 사주: ${sp.saju}`,
      `배우자궁(일지)은 ${sp.branch}(${sp.elem}) 이고, 일간 ${sp.dayGan} 기준 십신은 ${sp.sipsin} 입니다.`,
      `그 자리의 결: ${sp.meaning}`,
      sp.isSpouseStar ? '이 자리가 배우자를 뜻하는 별과 겹칩니다.' : '',
      g ? `상담자는 ${g === 'M' ? '남성' : '여성'} 입니다.` : '성별을 모르니 단정하지 말고 두루 짚어 주세요.',
      shake.length ? `앞으로 이 자리가 흔들리는 해: ${shake.map(t => `${t.year}년(${t.kinds.join('·')})`).join(', ')}` : '앞으로 10년 안에 이 자리를 크게 치는 해는 없습니다.',
      steady.length ? `자리가 맞물려 안정되는 해: ${steady.map(t => t.year + '년').join(', ')}` : '',
      '',
      '이 사람의 배우자궁을 풀어 주세요. 다음 순서로 이어지는 글로 씁니다.',
      '1) 이 자리가 말해 주는 인연의 결과 어울리는 배우자상',
      '2) 관계에서 되풀이되기 쉬운 나의 태도 — 장점과 함께',
      '3) 흔들리는 해가 있다면 그때 무엇을 살피면 좋은지',
      '4) 지금 곁에 있는 사람과 더 잘 지내기 위한 한 가지',
      '',
      '⚠️ 반드시 지킬 것: 헤어짐이나 이혼을 예언하지 마세요. 충이나 형이 든다고 관계가',
      '끝나는 것이 아니라 "시험을 받는 때"일 뿐이며, 그 시기를 지나며 오히려 깊어지기도',
      '한다고 분명히 말해 주세요. 겁을 주는 대신 살필 지점과 할 수 있는 일을 짚어 주세요.',
      '혼자인 분이 읽을 수도 있으니 이미 배우자가 있다고 단정하지 마세요.',
      '전체 600자 내외.',
    ].filter(Boolean).join(String.fromCharCode(10));

    const reading = await cachedReading(env, 'spouse:' + _promptKey(prompt), CACHE_LONG,
      () => geminiText(env, prompt, { temperature: 0.85, maxOutputTokens: 2048 }));
    if (!reading) {
      if (refund) await refund().catch(() => {});
      return cors(JSON.stringify({ error: { message: '풀이를 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'spouse', `배우자궁 ${sp.branch}·${sp.sipsin}`, reading,
      { branch: sp.branch, sipsin: sp.sipsin }).catch(() => {});

    return cors(JSON.stringify({
      success: true, reading,
      branch: sp.branch, elem: sp.elem, sipsin: sp.sipsin,
      timeline: sp.timeline, remaining: remainingTokens,
    }), 200);
  } catch (e) {
    console.error('[SPOUSE]', e?.message);
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error: { message: '오류가 발생했습니다.' } }), 500);
  }
}
async function handleDaeun(request, env) {
  // 차감이 끝난 뒤 실패하면 되돌린다. 차감·환불이 같은 값을 쓰도록 한 곳에서만 만든다.
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', birth, gender } = await request.json().catch(() => ({}));
    if (!birth?.year || !birth?.month || !birth?.day) {
      return cors(JSON.stringify({ error: { message: '생년월일이 필요합니다.' } }), 400);
    }
    if (gender !== 'M' && gender !== 'F') {
      return cors(JSON.stringify({ error: { message: '대운은 성별에 따라 방향이 달라집니다. 마이페이지에서 성별을 등록해 주세요.' } }), 400);
    }

    const saju = computeSaju(birth.year, birth.month, birth.day, birth.hour);
    // '올해'는 KST 로 센다 — UTC 로 세면 1월 1일 00:00~09:00 KST 에 작년이 나온다.
    const refYear = _kstYear();
    const daeun = computeDaeun(birth, gender, refYear);
    if (!saju || !daeun) {
      return cors(JSON.stringify({ error: { message: '생년월일이 올바르지 않습니다.' } }), 400);
    }

    // 엽전 비용은 한 번만 정해 차감·환불 양쪽에서 같은 값을 쓴다
    const COST = 6;
    const paid = await accountSpend(env, acct, 'daeun', COST);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: `대운 풀이는 엽전 ${COST}개가 필요합니다. 잔액을 확인해 주세요.` } }), 402);
    }
    refund = () => accountRefund(env, acct, 'daeun', COST);
    const remainingTokens = await accountBalance(env, acct);

    const on = ON[lang] || ON.ko;
    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const el = p => `${on[p.ganElem] || p.ganElem}·${on[p.zhiElem] || p.zhiElem}`;
    const timeline = daeun.periods.map(p =>
      `  ${p.startYear}~${p.endYear} (${p.startAge}~${p.endAge}세) ${p.ganzhi} [${el(p)}]${p.current ? '  ← 지금 이 자리' : ''}`
    ).join('\n');

    const prompt = `당신은 사주 상담사입니다. 아래 사주와 대운은 만세력으로 이미 계산해 둔 값이니, 임의로 바꾸거나 새로 지어내지 마세요.

[사주 네 기둥]
${saju.text}

[대운 — ${daeun.forward ? '순행' : '역행'}, 태어나고 ${daeun.qiyun.years}년 ${daeun.qiyun.months}개월 뒤부터 돌기 시작해 10년마다 바뀝니다]
${timeline}

[지금]
${daeun.current
  ? `대운 ${daeun.current.ganzhi} [${el(daeun.current)}] 의 ${refYear - daeun.current.startYear + 1}년째 (${daeun.current.startYear}~${daeun.current.endYear})`
  : `아직 대운이 시작되기 전입니다. 첫 대운은 ${daeun.next.startYear}년(${daeun.next.startAge}세)부터입니다.`}
${daeun.liunian ? `올해 세운 ${daeun.liunian.ganzhi} [${on[daeun.liunian.ganElem] || ''}·${on[daeun.liunian.zhiElem] || ''}]` : ''}
${daeun.next ? `다음 대운 ${daeun.next.ganzhi} [${el(daeun.next)}] — ${daeun.next.startYear}년(${daeun.next.startAge}세)부터` : ''}

위 자료를 근거로 ${langLabel}로 풀어 주세요. 조건:
- 일간(日干)과 지금 대운의 기운이 어떤 관계인지(돕는지 누르는지)를 먼저 짚고, 그것이 요즘 어떤 형태로 나타나는지 쓰세요.
- 지금 대운이 언제 끝나고 다음 대운이 어떤 결로 바뀌는지, 그 전환을 무엇으로 준비하면 좋을지 한 문단 쓰세요.
- 올해 세운은 대운이라는 큰 흐름 안의 한 해로만 다루세요.
- 좋은 말만 늘어놓지 말고, 눌리는 시기는 눌린다고 쓰되 겁주지 말고 "무엇을 하면 되는지"로 마무리하세요.
- 한자 용어를 쓰면 바로 옆에 괄호로 뜻을 적어 주세요. 예) 甲木(갑목, 강한 나무 기운)
- 500~600자 분량, 문단 3개.
- JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사로 편하게 이어서 사람이 말하듯 써주세요.`;

    // geminiText 로 부른다 — 실패 사유를 로그에 남기기 위해서다(택일 쪽 주석 참고).
    const reading = await cachedReading(env, 'daeun:' + _promptKey(prompt), CACHE_LONG,
      () => geminiText(env, prompt, { temperature: 0.85, maxOutputTokens: 2400 }));

    if (!reading) {
      await refund(); refund = null;
      return cors(JSON.stringify({ error: { message: '대운 풀이를 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    const title = daeun.current
      ? `${daeun.current.ganzhi} · ${daeun.current.startYear}~${daeun.current.endYear}`
      : `${daeun.next.startYear}년부터`;
    await saveFeatureHistory(env, accountHistoryKey(acct), 'daeun', title, reading,
      { forward: daeun.forward, current: daeun.current, next: daeun.next }).catch(() => {});

    return cors(JSON.stringify({
      success: true, reading, refYear,
      pillars: { yp: saju.yp, mp: saju.mp, dp: saju.dp, hp: saju.hp, dayGan: saju.dayGan, dayElem: saju.dayElem },
      forward: daeun.forward, qiyun: daeun.qiyun, periods: daeun.periods,
      current: daeun.current, next: daeun.next, liunian: daeun.liunian,
      remaining: remainingTokens,
    }), 200);
  } catch(e) {
    // Gemini 호출이 던지는 등 위에서 예외가 나면 차감만 남는다 — 여기서 되돌린다.
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  이름 풀이 — 한글 이름의 발음오행과 사주의 궁합 (엽전 2개)
//
//  전통 작명은 발음오행(오음오행)·수리오행(획수)·자원오행(한자 부수) 셋을 함께 본다.
//  여기서 다루는 것은 그중 발음오행 하나뿐이다. 나머지 둘은 한자 획수·부수 표가
//  있어야 하는데 이 저장소에 없고, 없는 데이터를 AI 에게 지어내게 하면 그럴듯한
//  거짓말이 된다. 그래서 범위를 발음오행으로 좁히고 화면에도 그렇게 밝힌다.
//
//  판단은 코드가 한다 — 초성에서 오행을 뽑고, 이웃한 글자끼리 상생·상극을 따지고,
//  그 오행이 사주에서 비어 있던 자리를 채우는지 이미 넘치는 자리를 더 밀어 올리는지
//  까지 세서 넘긴다. AI 는 그 결과를 말로 풀 뿐이다.
// ════════════════════════════════════════════
const HANGUL_CHOSEONG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
// 오음오행 — 아(牙)·설(舌)·순(脣)·치(齒)·후(喉) 순서로 木火土金水.
const SOUND_ELEM = {
  'ㄱ':'木','ㄲ':'木','ㅋ':'木',
  'ㄴ':'火','ㄷ':'火','ㄸ':'火','ㄹ':'火','ㅌ':'火',
  'ㅁ':'土','ㅂ':'土','ㅃ':'土','ㅍ':'土',
  'ㅅ':'金','ㅆ':'金','ㅈ':'金','ㅉ':'金','ㅊ':'金',
  'ㅇ':'水','ㅎ':'水',
};
const ELEM_SAENG = { 木:'火', 火:'土', 土:'金', 金:'水', 水:'木' };   // 낳아 주는 관계
const ELEM_GEUK  = { 木:'土', 土:'水', 水:'火', 火:'金', 金:'木' };   // 누르는 관계

/**
 * 한글 이름의 발음오행을 뽑고, 이웃 관계와 사주와의 궁합을 센다. AI 도 네트워크도 없다.
 * @param {string} name 성을 포함한 한글 이름 (2~6자)
 * @param {Record<string,number>} sajuElem computeSaju 가 낸 오행 분포. 없으면 사주 대조는 건너뛴다
 */
function analyzeName(name, sajuElem) {
  const chars = [...String(name || '').trim()];
  if (chars.length < 2 || chars.length > 6) return null;

  const parsed = [];
  for (const ch of chars) {
    const code = ch.charCodeAt(0);
    if (code < 0xAC00 || code > 0xD7A3) return null;   // 완성형 한글이 아니면 초성을 뽑을 수 없다
    const cho = HANGUL_CHOSEONG[Math.floor((code - 0xAC00) / 588)];
    parsed.push({ ch, choseong: cho, elem: SOUND_ELEM[cho] });
  }

  // 이웃한 글자끼리만 본다 — 성과 이름이 이어지는 결이 발음오행에서 보는 지점이다.
  const pairs = [];
  let score = 0;
  for (let i = 1; i < parsed.length; i++) {
    const a = parsed[i - 1].elem, b = parsed[i].elem;
    let relation;
    if (ELEM_SAENG[a] === b || ELEM_SAENG[b] === a) { relation = 'saeng'; score += 2; }
    else if (ELEM_GEUK[a] === b || ELEM_GEUK[b] === a) { relation = 'geuk'; score -= 2; }
    else { relation = 'bihwa'; score += 1; }
    pairs.push({ from: a, to: b, relation });
  }

  // 사주에서 비어 있던 오행을 이름이 채우는지, 이미 많은 쪽을 더 밀어 올리는지.
  const fills = [], overs = [];
  if (sajuElem) {
    const nameElems = [...new Set(parsed.map(p => p.elem))];
    for (const e of nameElems) {
      if ((sajuElem[e] || 0) === 0) { fills.push(e); score += 2; }
      else if ((sajuElem[e] || 0) >= 3) { overs.push(e); score -= 1; }
    }
  }

  return { chars: parsed, pairs, score, fills, overs };
}

async function handleNameReading(request, env) {
  // 차감이 끝난 뒤 실패하면 되돌린다. 차감·환불이 같은 값을 쓰도록 한 곳에서만 만든다.
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', name, birth } = await request.json().catch(() => ({}));
    // 사주 대조는 생년월일이 있을 때만 — 이름만 봐도 발음오행 흐름은 나온다.
    const saju = birth?.year ? computeSaju(birth.year, birth.month, birth.day, birth.hour) : null;
    const analysis = analyzeName(name, saju?.elem);
    if (!analysis) {
      return cors(JSON.stringify({ error: { message: '한글 이름을 2~6글자로 입력해 주세요.' } }), 400);
    }

    // 엽전 비용은 한 번만 정해 차감·환불 양쪽에서 같은 값을 쓴다
    const COST = 4;
    const paid = await accountSpend(env, acct, 'name', COST);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: `이름 풀이는 엽전 ${COST}개가 필요합니다. 잔액을 확인해 주세요.` } }), 402);
    }
    refund = () => accountRefund(env, acct, 'name', COST);
    const remainingTokens = await accountBalance(env, acct);

    const on = ON[lang] || ON.ko;
    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const REL_KO = { saeng:'상생(서로 낳아 주는 관계)', geuk:'상극(한쪽이 누르는 관계)', bihwa:'비화(같은 기운끼리)' };

    const charLine = analysis.chars.map(c => `${c.ch}(${c.choseong}, ${on[c.elem] || c.elem})`).join(' — ');
    const pairLine = analysis.pairs.map((p, i) =>
      `  ${analysis.chars[i].ch}→${analysis.chars[i + 1].ch}: ${on[p.from] || p.from}과 ${on[p.to] || p.to}, ${REL_KO[p.relation]}`
    ).join('\n');
    const sajuLine = saju
      ? `${saju.text}\n비어 있는 오행을 이름이 채우는 것: ${analysis.fills.length ? analysis.fills.map(e => on[e] || e).join(', ') : '없음'}`
        + `\n이미 많은데 이름이 더 보태는 것: ${analysis.overs.length ? analysis.overs.map(e => on[e] || e).join(', ') : '없음'}`
      : '(생년월일이 없어 사주와는 대조하지 않았습니다)';

    const prompt = `당신은 이름을 봐 주는 상담사입니다. 아래 분석은 이미 계산해 둔 값이니 임의로 바꾸지 말고, 없는 근거(획수·한자 뜻 등)를 지어내지 마세요.

[이름의 발음오행]
${charLine}

[이웃한 글자끼리의 관계]
${pairLine}

[사주와의 대조]
${sajuLine}

위 자료를 근거로 ${langLabel}로 풀어 주세요. 조건:
- 이름이 어떤 기운의 흐름으로 읽히는지 먼저 쓰고, 상생·상극이 어디에서 생기는지 글자를 짚어 설명하세요.
- 사주와 대조한 결과가 있으면, 이름이 부족한 자리를 채우는지 아니면 이미 센 쪽을 더 미는지 말해 주세요.
- 이름이 나쁘다고 몰아가거나 개명을 권하지 마세요. 상극이 있어도 그것이 어떤 성질로 드러나는지, 무엇으로 균형을 잡으면 되는지로 풀어 주세요.
- 여기서 본 것은 발음오행 하나뿐이며 획수(수리)와 한자 뜻(자원)은 보지 않았다는 점을 마지막에 한 문장으로 밝혀 주세요.
- 400~500자 분량, 문단 2~3개.
- JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사로 편하게 이어서 사람이 말하듯 써주세요.`;

    // geminiText 로 부른다 — 실패 사유를 로그에 남기기 위해서다(택일 쪽 주석 참고).
    const reading = await cachedReading(env, 'name:' + _promptKey(prompt), CACHE_LONG,
      () => geminiText(env, prompt, { temperature: 0.85, maxOutputTokens: 1400 }));

    if (!reading) {
      await refund(); refund = null;
      return cors(JSON.stringify({ error: { message: '이름 풀이를 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'name', analysis.chars.map(c => c.ch).join(''), reading,
      { chars: analysis.chars, pairs: analysis.pairs, fills: analysis.fills, overs: analysis.overs }).catch(() => {});

    return cors(JSON.stringify({
      success: true, reading,
      name: analysis.chars.map(c => c.ch).join(''),
      chars: analysis.chars, pairs: analysis.pairs, score: analysis.score,
      fills: analysis.fills, overs: analysis.overs,
      sajuElem: saju?.elem || null,
      remaining: remainingTokens,
    }), 200);
  } catch(e) {
    // Gemini 호출이 던지는 등 위에서 예외가 나면 차감만 남는다 — 여기서 되돌린다.
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  궁합 심화 — 두 사람에게 언제가 좋은 시기인지 (엽전 3개)
//
//  기존 궁합이 "둘이 어떤 조합인지"를 본다면 여기서는 "언제인지"를 본다. 판단 근거는
//  세운(그 해의 지지)이 각자의 일지(日支)와 맺는 관계다 — 육합·삼합이면 풀리고
//  충이면 흔들린다는, 명리에서 시기를 볼 때 가장 먼저 보는 자리다. 거기에 각자
//  그 해에 어느 대운을 지나는지를 얹어 배경으로 준다(computeDaeun 재사용).
//
//  좋은 해를 코드가 먼저 세워서 넘기고, AI 는 그 해가 왜 그런지 설명만 한다.
// ════════════════════════════════════════════
const JIJI_YUKHAP = { 子:'丑', 丑:'子', 寅:'亥', 亥:'寅', 卯:'戌', 戌:'卯', 辰:'酉', 酉:'辰', 巳:'申', 申:'巳', 午:'未', 未:'午' };
const JIJI_SAMHAP = [['申','子','辰'], ['巳','酉','丑'], ['寅','午','戌'], ['亥','卯','未']];

// 그 해의 지지가 어떤 사람의 일지와 맺는 관계. 합·충이 겹치면 충을 우선한다(흔들림이 먼저 체감된다).
function branchRelation(yearZhi, dayZhi) {
  if (!yearZhi || !dayZhi) return { relation: 'none', score: 0 };
  const yi = JJ.indexOf(yearZhi), di = JJ.indexOf(dayZhi);
  if (yi < 0 || di < 0) return { relation: 'none', score: 0 };
  if ((yi + 6) % 12 === di) return { relation: 'chung',  score: -3 };   // 충
  if (JIJI_YUKHAP[yearZhi] === dayZhi) return { relation: 'yukhap', score: 3 };
  if (JIJI_SAMHAP.some(g => g.includes(yearZhi) && g.includes(dayZhi) && yearZhi !== dayZhi)) {
    return { relation: 'samhap', score: 2 };
  }
  return { relation: 'none', score: 0 };
}

/**
 * 두 사람의 앞으로 몇 해를 훑어 시기별 점수를 낸다. 네트워크도 AI 도 없다.
 * @param {{birth:object, gender:'M'|'F'}} a
 * @param {{birth:object, gender:'M'|'F'}} b
 * @param {number} fromYear 훑기 시작할 해
 * @param {number} years 몇 해를 볼지
 */
function computeCompatTiming(a, b, fromYear, years = 10) {
  const sa = computeSaju(a.birth?.year, a.birth?.month, a.birth?.day, a.birth?.hour);
  const sb = computeSaju(b.birth?.year, b.birth?.month, b.birth?.day, b.birth?.hour);
  if (!sa || !sb) return null;

  const dayZhiA = sa.dp[1], dayZhiB = sb.dp[1];
  // 대운은 성별이 있어야 세워진다. 없으면 시기 흐름만 보고 대운은 비운다.
  const daeunA = a.gender ? computeDaeun(a.birth, a.gender, fromYear) : null;
  const daeunB = b.gender ? computeDaeun(b.birth, b.gender, fromYear) : null;
  const daeunAt = (d, y) => d?.periods.find(p => y >= p.startYear && y <= p.endYear)?.ganzhi || null;

  const timeline = [];
  for (let i = 0; i < years; i++) {
    const y = fromYear + i;
    // 6월 1일은 입춘·동지 어느 쪽에도 걸리지 않아 그 해의 연주를 그대로 집는다
    const yearGanZhi = Solar.fromYmd(y, 6, 1).getLunar().getYearInGanZhi();
    const yearZhi = yearGanZhi[1];
    const ra = branchRelation(yearZhi, dayZhiA);
    const rb = branchRelation(yearZhi, dayZhiB);
    timeline.push({
      year: y, ganzhi: yearGanZhi,
      a: { relation: ra.relation, daeun: daeunAt(daeunA, y) },
      b: { relation: rb.relation, daeun: daeunAt(daeunB, y) },
      score: ra.score + rb.score,
    });
  }

  // 가장 높은 점수부터, 같으면 가까운 해 먼저 — 사용자는 대개 빨리 잡고 싶어 한다.
  const best = [...timeline].sort((x, z) => z.score - x.score || x.year - z.year).slice(0, 3);
  return { pillars: { a: sa.text, b: sb.text }, dayZhi: { a: dayZhiA, b: dayZhiB }, timeline, best };
}

async function handleCompatTiming(request, env) {
  // 차감이 끝난 뒤 실패하면 되돌린다. 차감·환불이 같은 값을 쓰도록 한 곳에서만 만든다.
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', p1, p2 } = await request.json().catch(() => ({}));
    if (!p1?.year || !p2?.year) {
      return cors(JSON.stringify({ error: { message: '두 분의 생년월일이 모두 필요합니다.' } }), 400);
    }
    const nameA = sanitizeName(p1.name || '') || 'A';
    const nameB = sanitizeName(p2.name || '') || 'B';

    // 훑기 시작할 해도 KST 기준 — 대운과 같은 이유(1월 1일 새벽에 작년부터 훑지 않도록).
    const fromYear = _kstYear();
    const YEARS = 10;
    const timing = computeCompatTiming(
      { birth: p1, gender: p1.gender === 'M' || p1.gender === 'F' ? p1.gender : null },
      { birth: p2, gender: p2.gender === 'M' || p2.gender === 'F' ? p2.gender : null },
      fromYear, YEARS);
    if (!timing) return cors(JSON.stringify({ error: { message: '생년월일이 올바르지 않습니다.' } }), 400);

    // 엽전 비용은 한 번만 정해 차감·환불 양쪽에서 같은 값을 쓴다
    const COST = 6;
    const paid = await accountSpend(env, acct, 'compat', COST);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: `궁합 시기 풀이는 엽전 ${COST}개가 필요합니다. 잔액을 확인해 주세요.` } }), 402);
    }
    refund = () => accountRefund(env, acct, 'compat', COST);
    const remainingTokens = await accountBalance(env, acct);

    const REL_KO = { yukhap:'육합(끌어당김)', samhap:'삼합(뜻이 모임)', chung:'충(흔들림)', none:'별다른 관계 없음' };
    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const line = t => `  ${t.year} ${t.ganzhi} — ${nameA}: ${REL_KO[t.a.relation]}${t.a.daeun ? `(대운 ${t.a.daeun})` : ''}`
      + ` / ${nameB}: ${REL_KO[t.b.relation]}${t.b.daeun ? `(대운 ${t.b.daeun})` : ''} [점수 ${t.score}]`;

    const prompt = `당신은 두 사람의 인연을 시기로 보아 주는 상담사입니다. 아래는 만세력으로 이미 계산해 둔 값이니 임의로 바꾸거나 새 해를 지어내지 마세요.

[두 분의 사주]
${nameA}: ${timing.pillars.a}
${nameB}: ${timing.pillars.b}

[앞으로 ${YEARS}년 — 그 해의 지지가 각자의 일지(日支)와 맺는 관계]
${timing.timeline.map(line).join('\n')}

[점수가 높은 해]
${timing.best.map(line).join('\n')}

위 자료를 근거로 ${langLabel}로 풀어 주세요. 조건:
- 가장 좋은 해를 먼저 짚고, 왜 그 해인지 육합·삼합 같은 근거를 들어 설명하세요.
- 충이 든 해는 숨기지 말고, 헤어질 해라는 식으로 겁주지도 마세요. 무엇이 흔들리기 쉬운 시기이고 무엇을 조심하면 되는지로 쓰세요.
- 대운이 함께 적힌 해는 그 사람에게 큰 흐름이 어떤 배경인지 한 번만 언급하세요.
- 연도는 반드시 위에 준 그대로 쓰세요.
- 450~550자 분량, 문단 2~3개.
- JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사로 편하게 이어서 사람이 말하듯 써주세요.`;

    // geminiText 로 부른다 — 실패 사유를 로그에 남기기 위해서다(택일 쪽 주석 참고).
    const reading = await cachedReading(env, 'compat:' + _promptKey(prompt), CACHE_LONG,
      () => geminiText(env, prompt, { temperature: 0.85, maxOutputTokens: 2400 }));

    if (!reading) {
      await refund(); refund = null;
      return cors(JSON.stringify({ error: { message: '궁합 시기 풀이를 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'compat', `${nameA} × ${nameB} · ${timing.best[0].year}`, reading,
      { best: timing.best }).catch(() => {});

    return cors(JSON.stringify({
      success: true, reading, nameA, nameB,
      timeline: timing.timeline, best: timing.best, fromYear, years: YEARS,
      remaining: remainingTokens,
    }), 200);
  } catch(e) {
    // Gemini 호출이 던지는 등 위에서 예외가 나면 차감만 남는다 — 여기서 되돌린다.
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  오늘의 럭키 컬러·음식·노래 (재미 콘텐츠, 엽전 1개)
// ════════════════════════════════════════════
async function handleLuckyPicks(request, env) {
  // 차감이 끝난 뒤 실패하면 되돌린다. 차감·환불이 같은 값을 쓰도록 한 곳에서만 만든다.
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko' } = await request.json().catch(() => ({}));
    const il = ilchin();
    const on = ON[lang] || ON.ko;

    // 엽전 1개 차감 (atomic INSERT — 잔액 >= 1 일 때만 삽입)
    const paid = await accountSpend(env, acct, 'lucky', 1);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: '오늘의 럭키 아이템은 엽전 1개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    refund = () => accountRefund(env, acct, 'lucky', 1);
    const remainingTokens = await accountBalance(env, acct);

    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const prompt = `당신은 오늘의 기운을 바탕으로 행운 아이템을 추천해주는 재미있는 상담사입니다. 오늘의 오행 기운은 "${on[il.o]}"입니다.

이 기운에 어울리는 오늘의 행운 아이템 3가지를 ${langLabel}로 추천해주세요. 각 항목은 이름과 짧고 유쾌한 이유(1~2문장)로 구성하세요.
1. 럭키 컬러 — 구체적인 색깔 이름
2. 럭키 음식 — 구체적인 음식 이름
3. 럭키 무드 — 음악 장르나 분위기 (실제 곡 강요보다는 무드 위주)

JSON 형식으로만 답하세요, 다른 텍스트 없이:
{"color":{"name":"...","reason":"..."},"food":{"name":"...","reason":"..."},"song":{"name":"...","reason":"..."}}`;

    // 오늘의 오행 하나로만 정해진다 — 4개국어 합쳐 하루 4개면 전부다.
    // 여기만 응답이 JSON 이라 캐시에는 그 문자열을 그대로 넣고 꺼낼 때 파싱한다.
    // 날짜는 _kstYmd() — 위 프롬프트의 il 을 낸 ilchin() 과 같은 KST 경계다(그 함수 주석 참고).
    const raw = await cachedFortune(
      env, `lucky|${lang}|${_kstYmd()}`,
      async () => {
        const text = await geminiText(env, prompt, { responseMimeType:'application/json', temperature:0.9, maxOutputTokens: 1000 });
        // 캐시에 넣기 전에 걸러야 깨진 JSON 이 하루 종일 재사용되지 않는다.
        try {
          const p = JSON.parse(text);
          return (p?.color?.name || p?.food?.name || p?.song?.name) ? text : '';
        } catch { return ''; }
      },
    );
    let picks;
    try { picks = JSON.parse(raw || '{}'); } catch { picks = {}; }

    // 이 핸들러는 JSON 응답이라 파싱이 깨져도 picks={}로 흘러가 빈 카드 3장이 나갔다.
    // 세 항목 중 하나도 이름이 없으면 실패로 보고 환불한다.
    const hasPick = !!(picks?.color?.name || picks?.food?.name || picks?.song?.name);
    if (!hasPick) {
      await refund(); refund = null;
      return cors(JSON.stringify({ error: { message: '행운 아이템을 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'lucky', null, JSON.stringify(picks), null).catch(() => {});

    return cors(JSON.stringify({ success:true, picks, remaining: remainingTokens }), 200);
  } catch(e) {
    // Gemini 호출이 던지는 등 위에서 예외가 나면 차감만 남는다 — 여기서 되돌린다.
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  오행 유형 궁합 테스트 (재미 콘텐츠, 엽전 1개)
//  유형 판정(퀴즈)은 프론트에서 무료로 처리, 궁합 해석만 여기서 엽전 1개
// ════════════════════════════════════════════
const TYPE_ELEMENTS = ['木','火','土','金','水'];

async function handleTypeCompat(request, env) {
  // 차감이 끝난 뒤 실패하면 되돌린다. 차감·환불이 같은 값을 쓰도록 한 곳에서만 만든다.
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', myType, partnerType } = await request.json().catch(() => ({}));
    if (!TYPE_ELEMENTS.includes(myType) || !TYPE_ELEMENTS.includes(partnerType)) {
      return cors(JSON.stringify({ error: { message: '올바르지 않은 유형입니다.' } }), 400);
    }

    // 엽전 1개 차감 (atomic INSERT — 잔액 >= 1 일 때만 삽입)
    const paid = await accountSpend(env, acct, 'typecompat', 2);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: '궁합 보기는 엽전 1개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    refund = () => accountRefund(env, acct, 'typecompat', 1);
    const remainingTokens = await accountBalance(env, acct);

    const on = ON[lang] || ON.ko;
    // 유형 두 개로만 정해진다 — 5 × 5 × 4개국어 = 100개면 전 조합이 채워지고 날짜도 안 탄다.
    const { bucket, prompt } = typeCompatSpec(lang, myType, partnerType);
    const reading = await cachedFortune(env, bucket, () => geminiText(env, prompt, { maxOutputTokens: 1200 }));

    if (!reading) {
      await refund(); refund = null;
      return cors(JSON.stringify({ error: { message: '궁합 해석을 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'typecompat', `${on[myType]}×${on[partnerType]}`, reading, { myType, partnerType }).catch(() => {});

    return cors(JSON.stringify({ success:true, myType, partnerType, reading, remaining: remainingTokens }), 200);
  } catch(e) {
    // Gemini 호출이 던지는 등 위에서 예외가 나면 차감만 남는다 — 여기서 되돌린다.
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  오늘의 운세 모음 (재미 콘텐츠, 엽전 1개)
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
  // 차감이 끝난 뒤 실패하면 되돌린다. 차감·환불이 같은 값을 쓰도록 한 곳에서만 만든다.
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', topic, birth } = await request.json().catch(() => ({}));
    const t = FORTUNE_TOPICS[topic];
    if (!t) return cors(JSON.stringify({ error: { message: '올바르지 않은 주제입니다.' } }), 400);

    // 엽전 1개 차감 (atomic INSERT — 잔액 >= 1 일 때만 삽입)
    const paid = await accountSpend(env, acct, 'fortune', 1);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: `${t.title}은(는) 엽전 1개가 필요합니다. 잔액을 확인해 주세요.` } }), 402);
    }
    refund = () => accountRefund(env, acct, 'fortune', 1);
    const remainingTokens = await accountBalance(env, acct);

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
      { signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS), method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ systemInstruction: _ANDORYEONG_SI, contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ temperature:0.85, maxOutputTokens:1000, thinkingConfig:{ thinkingBudget:0 } } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = _humanize(data?.candidates?.[0]?.content?.parts?.[0]?.text);

    if (!resp.ok || !reading) {
      await refund(); refund = null;
      return cors(JSON.stringify({ error: { message: '풀이를 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'fortune', t.title, reading, { topic }).catch(() => {});

    return cors(JSON.stringify({ success:true, topic, title: t.title, icon: t.icon, reading, remaining: remainingTokens }), 200);
  } catch(e) {
    // Gemini 호출이 던지는 등 위에서 예외가 나면 차감만 남는다 — 여기서 되돌린다.
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  주역(周易) 괘 풀이 — 재미 콘텐츠, 엽전 1개
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
  // 차감이 끝난 뒤 실패하면 되돌린다. 차감·환불이 같은 값을 쓰도록 한 곳에서만 만든다.
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', question = '' } = await request.json().catch(() => ({}));
    const cleanQuestion = String(question || '').trim().slice(0, 200);

    // 엽전 1개 차감 (atomic INSERT)
    const paid = await accountSpend(env, acct, 'iching', 1);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: '주역 괘 풀이는 엽전 1개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    refund = () => accountRefund(env, acct, 'iching', 1);
    const remainingTokens = await accountBalance(env, acct);

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
      { signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS), method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ systemInstruction: _ANDORYEONG_SI, contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ temperature:0.8, maxOutputTokens:1000, thinkingConfig:{ thinkingBudget:0 } } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = _humanize(data?.candidates?.[0]?.content?.parts?.[0]?.text);

    if (!resp.ok || !reading) {
      await refund(); refund = null;
      return cors(JSON.stringify({ error: { message: '괘 풀이를 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'iching', null, reading, { lines: lines.map(l => ({ yang:l.yang, changing:l.changing })), hasChanging, question: cleanQuestion || null }).catch(() => {});

    return cors(JSON.stringify({
      success:true,
      lines: lines.map(l => ({ yang:l.yang, changing:l.changing })),
      reading, remaining: remainingTokens
    }), 200);
  } catch(e) {
    // Gemini 호출이 던지는 등 위에서 예외가 나면 차감만 남는다 — 여기서 되돌린다.
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  수비학(數秘學) 라이프패스 넘버 — 재미 콘텐츠, 엽전 1개
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
  // 차감이 끝난 뒤 실패하면 되돌린다. 차감·환불이 같은 값을 쓰도록 한 곳에서만 만든다.
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', birth } = await request.json().catch(() => ({}));
    const by = birth ? parseInt(birth.year, 10) : NaN;
    const bm = birth ? parseInt(birth.month, 10) : NaN;
    const bd = birth ? parseInt(birth.day, 10) : NaN;
    if (!by || !bm || !bd) {
      return cors(JSON.stringify({ error: { message: '생년월일이 필요합니다.' } }), 400);
    }

    // 엽전 1개 차감 (atomic INSERT)
    const paid = await accountSpend(env, acct, 'numerology', 2);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: '수비학 풀이는 엽전 2개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    refund = () => accountRefund(env, acct, 'numerology', 1);
    const remainingTokens = await accountBalance(env, acct);

    const lifePath = _lifePathNumber(by, bm, bd);
    const il = ilchin();
    const on = ON[lang] || ON.ko;
    const LANG_LABEL = { ko:'한국어', en:'English', zh:'中文', ja:'日本語' };
    const langLabel = LANG_LABEL[lang] || '한국어';
    const prompt = `당신은 서양 수비학(numerology) 상담사입니다. 이 사람의 생년월일로 계산한 라이프패스 넘버(Life Path Number)는 정확히 "${lifePath}"입니다(이 숫자는 이미 정확히 계산된 확정값이니 재계산하지 마세요).

오늘의 오행 기운은 "${on[il.o]}"입니다.

라이프패스 넘버 ${lifePath}의 전통적인 수비학적 의미(성격·강점·인생 방향)를 ${langLabel}로 설명하고, 오늘의 기운과 엮어서 4~6문장으로 따뜻하고 구체적인 조언을 주세요. 단정적 예언이 아니라 태도와 행동 중심으로 안내하세요.

JSON이나 마크다운, 코드블록 없이 본문만 순수 텍스트로 답하세요. 별표(*)나 긴 줄표(—) 같은 기호는 쓰지 말고, 쉼표와 자연스러운 접속사(그리고, 다만, 특히 등)로 편하게 이어서 사람이 말하듯 써주세요.`;

    // 생년월일은 라이프패스 넘버 하나로 압축돼서 들어간다(1~9, 11, 22, 33 — 12가지).
    // 오늘의 기운을 함께 엮으므로 날짜까지 넣어 하루 48개.
    // 날짜는 _kstYmd() — 위 프롬프트의 il 을 낸 ilchin() 과 같은 KST 경계다(그 함수 주석 참고).
    const reading = await cachedFortune(
      env, `numerology|${lang}|${lifePath}|${_kstYmd()}`,
      () => geminiText(env, prompt, { temperature: 0.8, maxOutputTokens: 1200 }),
    );

    if (!reading) {
      await refund(); refund = null;
      return cors(JSON.stringify({ error: { message: '수비학 풀이를 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'numerology', `${lifePath}`, reading, { lifePath }).catch(() => {});

    return cors(JSON.stringify({ success:true, lifePath, reading, remaining: remainingTokens }), 200);
  } catch(e) {
    // Gemini 호출이 던지는 등 위에서 예외가 나면 차감만 남는다 — 여기서 되돌린다.
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  토정비결풍 신년운세 — 재미 콘텐츠, 엽전 2개
//  ※ 정통 토정비결의 원문 괘사(고전 텍스트)는 신뢰성 있게 재현할 방법이 없어 그대로 인용하지
//  않음. 대신 서버가 계산한 정확한 사주 원국을 바탕으로 "그 해 신수를 총운·재물·애정·건강별로
//  짚어보는" 전통 신년운세의 정신을 살려 AI가 생성 — 정통 원문의 대체가 아님을 프론트에 안내.
// ════════════════════════════════════════════
async function handleTojeong(request, env) {
  // 차감이 끝난 뒤 실패하면 되돌린다. 차감·환불이 같은 값을 쓰도록 한 곳에서만 만든다.
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', birth } = await request.json().catch(() => ({}));
    if (!birth || !birth.year) {
      return cors(JSON.stringify({ error: { message: '생년월일이 필요합니다.' } }), 400);
    }
    const saju = computeSaju(birth.year, birth.month, birth.day, birth.hour);
    if (!saju) return cors(JSON.stringify({ error: { message: '사주 계산에 실패했습니다.' } }), 400);

    // 엽전 2개 차감 (atomic INSERT — 정식 상세풀이와 동일한 무게)
    const paid = await accountSpend(env, acct, 'tojeong', 4);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: '토정비결풍 신년운세는 엽전 2개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    refund = () => accountRefund(env, acct, 'tojeong', 2);
    const remainingTokens = await accountBalance(env, acct);

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
      { signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS), method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ systemInstruction: _ANDORYEONG_SI, contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ temperature:0.8, maxOutputTokens: 4096, thinkingConfig:{ thinkingBudget: 0 } } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = _humanize(data?.candidates?.[0]?.content?.parts?.[0]?.text);

    if (!resp.ok || !reading) {
      await refund(); refund = null;
      return cors(JSON.stringify({ error: { message: '신년운세를 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'tojeong', `${thisYear}`, reading, { year: thisYear }).catch(() => {});

    return cors(JSON.stringify({ success:true, year: thisYear, reading, remaining: remainingTokens }), 200);
  } catch(e) {
    // Gemini 호출이 던지는 등 위에서 예외가 나면 차감만 남는다 — 여기서 되돌린다.
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  관상·손금 사진 분석 (재미 콘텐츠, 엽전 2개)
//  사용자가 올린 얼굴/손 사진을 Gemini Vision으로 분석. 저장을 원한다고 명시적으로
//  확인했으므로 photo_readings 테이블에 이미지·결과를 저장해 마이페이지에서 다시 볼 수 있게 함.
// ════════════════════════════════════════════
const MAX_PHOTO_B64_LEN = 900000; // 대략 base64 ~900KB(원본 이미지 약 650KB) — 클라이언트에서 리사이즈 후 전송 전제

async function handlePhotoReading(request, env) {
  // 차감이 끝난 뒤 실패하면 되돌린다. 차감·환불이 같은 값을 쓰도록 한 곳에서만 만든다.
  let refund = null;
  try {
    // 본문 크기 선행 체크 (base64 인코딩 오버헤드 감안, 약 1.3MB까지만 허용)
    const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (contentLength > 1300000) {
      return cors(JSON.stringify({ error: { message: '사진 용량이 너무 큽니다. 더 작은 사진으로 다시 시도해 주세요.' } }), 413);
    }

    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

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

    // 엽전 2개 차감 (atomic INSERT)
    const paid = await accountSpend(env, acct, 'photo_reading', 4);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: (type==='face'?'관상':'손금') + ' 풀이는 엽전 2개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    refund = () => accountRefund(env, acct, 'photo_reading', 2);
    const remainingTokens = await accountBalance(env, acct);

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
      { signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS), method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          systemInstruction: _ANDORYEONG_SI,
          contents:[{ parts:[
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: b64 } }
          ]}],
          generationConfig:{ temperature:0.7, maxOutputTokens:1600, thinkingConfig:{ thinkingBudget:0 } },
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
    const reading = _humanize(data?.candidates?.[0]?.content?.parts?.[0]?.text);

    if (!resp.ok || !reading) {
      // API 오류 또는 세이프티 필터 등으로 응답이 비면 엽전 환불
      await refund(); refund = null;
      return cors(JSON.stringify({ error: { message: '사진을 분석하지 못했습니다. 다른 사진으로 다시 시도해 주세요. 엽전은 환불되었습니다.' } }), 422);
    }

    // 저장 (마이페이지에서 다시 볼 수 있도록 이미지 + 결과 보관) — 용량 관리를 위해 사용자당 최대 20개만 유지
    // 저장에 실패해도(용량/일시 오류 등) 이미 생성된 풀이는 그대로 사용자에게 돌려줌 — 결제·생성은 이미 끝난 뒤이므로
    let readingId = null;
    try {
      const insertResult = await env.DB.prepare(
        `INSERT INTO photo_readings (user_email, type, image_b64, reading) VALUES (?, ?, ?, ?)`
      ).bind(accountHistoryKey(acct), type, b64, reading).run();
      readingId = insertResult.meta?.last_row_id ?? null;
      // 20개 상한 정리. await 하지 않으면 응답과 함께 취소돼 상한이 사실상 없는 셈이 된다
      // (여기 저장되는 건 base64 이미지라 쌓이면 D1 용량을 빠르게 먹는다).
      const { results } = await env.DB.prepare(
        `SELECT id FROM photo_readings WHERE user_email = ? ORDER BY created_at DESC LIMIT 1 OFFSET 20`
      ).bind(accountHistoryKey(acct)).all();
      if (results && results.length > 0) {
        await env.DB.prepare(`DELETE FROM photo_readings WHERE user_email = ? AND id < ?`)
          .bind(accountHistoryKey(acct), results[0].id).run();
      }
    } catch (e) {
      console.error('[PHOTO READING SAVE]', e);
    }

    return cors(JSON.stringify({ success:true, id: readingId, type, reading, remaining: remainingTokens }), 200);
  } catch(e) {
    // Gemini 호출이 던지는 등 위에서 예외가 나면 차감만 남는다 — 여기서 되돌린다.
    if (refund) await refund().catch(() => {});
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
//  꿈해몽 (재미 콘텐츠, 엽전 1개)
// ════════════════════════════════════════════
async function handleDreamInterpretation(request, env) {
  // 차감이 끝난 뒤 실패하면 되돌린다. 차감·환불이 같은 값을 쓰도록 한 곳에서만 만든다.
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko', dream } = await request.json().catch(() => ({}));
    const cleanDream = String(dream || '').trim().slice(0, 500);
    if (!cleanDream) return cors(JSON.stringify({ error: { message: '꿈 내용을 입력해 주세요.' } }), 400);

    // 엽전 1개 차감 (atomic INSERT)
    const paid = await accountSpend(env, acct, 'dream', 1);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: '꿈해몽은 엽전 1개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    refund = () => accountRefund(env, acct, 'dream', 1);
    const remainingTokens = await accountBalance(env, acct);

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
      { signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS), method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ systemInstruction: _ANDORYEONG_SI, contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ temperature:0.85, maxOutputTokens:1000, thinkingConfig:{ thinkingBudget:0 } } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = _humanize(data?.candidates?.[0]?.content?.parts?.[0]?.text);

    if (!resp.ok || !reading) {
      await refund(); refund = null;
      return cors(JSON.stringify({ error: { message: '해몽하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'dream', cleanDream.slice(0, 30), reading, { dream: cleanDream }).catch(() => {});

    return cors(JSON.stringify({ success:true, reading, remaining: remainingTokens }), 200);
  } catch(e) {
    // Gemini 호출이 던지는 등 위에서 예외가 나면 차감만 남는다 — 여기서 되돌린다.
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  오늘의 로또번호 추천 (재미 콘텐츠, 엽전 1개)
//  숫자 자체는 서버에서 진짜 무작위로 뽑음(AI는 재계산·해석만) — 참고용 오락 콘텐츠
// ════════════════════════════════════════════
function _lottoNumbers() {
  const nums = new Set();
  while (nums.size < 6) nums.add(1 + Math.floor(Math.random() * 45));
  return [...nums].sort((a, b) => a - b);
}

async function handleLottoNumbers(request, env) {
  // 차감이 끝난 뒤 실패하면 되돌린다. 차감·환불이 같은 값을 쓰도록 한 곳에서만 만든다.
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko' } = await request.json().catch(() => ({}));

    // 엽전 1개 차감 (atomic INSERT)
    const paid = await accountSpend(env, acct, 'lotto', 1);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: '오늘의 로또번호는 엽전 1개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    refund = () => accountRefund(env, acct, 'lotto', 1);
    const remainingTokens = await accountBalance(env, acct);

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
      { signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS), method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ systemInstruction: _ANDORYEONG_SI, contents:[{ parts:[{ text: prompt }] }],
          generationConfig:{ temperature:0.9, maxOutputTokens:800, thinkingConfig:{ thinkingBudget:0 } } }) }
    );
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    const reading = _humanize(data?.candidates?.[0]?.content?.parts?.[0]?.text);

    if (!resp.ok || !reading) {
      await refund(); refund = null;
      return cors(JSON.stringify({ error: { message: '코멘트를 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'lotto', numbers.join(', '), reading, { numbers }).catch(() => {});

    return cors(JSON.stringify({ success:true, numbers, reading, remaining: remainingTokens }), 200);
  } catch(e) {
    // Gemini 호출이 던지는 등 위에서 예외가 나면 차감만 남는다 — 여기서 되돌린다.
    if (refund) await refund().catch(() => {});
    return cors(JSON.stringify({ error:{ message: e.message } }), 500);
  }
}

// ════════════════════════════════════════════
//  룬 문자 점 (재미 콘텐츠, 엽전 1개) — 엘더 푸타르크 24개 룬
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
  // 차감이 끝난 뒤 실패하면 되돌린다. 차감·환불이 같은 값을 쓰도록 한 곳에서만 만든다.
  let refund = null;
  try {
    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
    const acct = await resolveAccount(request, env);
    if (!acct) return cors(JSON.stringify({ error: { message: '유효하지 않은 인증 토큰입니다.' } }), 401);

    const { lang = 'ko' } = await request.json().catch(() => ({}));

    // 엽전 1개 차감 (atomic INSERT)
    const paid = await accountSpend(env, acct, 'rune', 1);
    if (!paid) {
      return cors(JSON.stringify({ error: { message: '룬 문자 점은 엽전 1개가 필요합니다. 잔액을 확인해 주세요.' } }), 402);
    }
    refund = () => accountRefund(env, acct, 'rune', 1);
    const remainingTokens = await accountBalance(env, acct);

    const idx = Math.floor(Math.random() * RUNE_NAMES.length);
    const rune = RUNE_NAMES[idx];
    const upright = Math.random() < 0.7;

    // 타로와 같다 — 룬과 방향만으로 글이 정해지고 날짜도 안 들어간다(24 × 2 × 4 = 192개).
    const { bucket, prompt } = runeSpec(lang, idx, upright);
    const reading = await cachedFortune(env, bucket, () => geminiText(env, prompt, { maxOutputTokens: 1000 }));

    if (!reading) {
      await refund(); refund = null;
      return cors(JSON.stringify({ error: { message: '룬 해석을 생성하지 못했습니다. 엽전은 환불되었습니다.' } }), 422);
    }

    await saveFeatureHistory(env, accountHistoryKey(acct), 'rune', `${rune.en}(${rune.ko})`, reading, { index: idx, upright }).catch(() => {});

    return cors(JSON.stringify({ success:true, index: idx, name: rune.en, nameKo: rune.ko, upright, reading, remaining: remainingTokens }), 200);
  } catch(e) {
    // Gemini 호출이 던지는 등 위에서 예외가 나면 차감만 남는다 — 여기서 되돌린다.
    if (refund) await refund().catch(() => {});
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

    // 로그인 상태면 구독을 사용자와 연결해 개인화 대상이 되게 한다.
    // 비로그인 구독도 계속 허용한다(email 이 NULL 이면 기본 문구가 나간다).
    const idToken = (request.headers.get('Authorization')||'').replace('Bearer ','').trim();
    const email = idToken ? await getEmailFromToken(idToken, env) : null;

    const id = _endpointId(subscription.endpoint);
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (id,endpoint,p256dh,auth,lang,user_email)
       VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET endpoint=excluded.endpoint,
       p256dh=excluded.p256dh,auth=excluded.auth,lang=excluded.lang,
       -- 재구독이 비로그인 상태면 기존 연결을 지우지 않는다
       user_email=COALESCE(excluded.user_email, push_subscriptions.user_email)`
    ).bind(id, subscription.endpoint, subscription.keys?.p256dh||'', subscription.keys?.auth||'', lang, email).run();
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

    // 예전엔 endpoint 만 맞으면 누구든 지울 수 있었다. 엔드포인트 URL 은 비밀이 아니라서
    // 값을 알아낸 사람이 남의 알림을 조용히 끊을 수 있었다(클라이언트는 예전부터
    // Authorization 을 보내고 있었는데 서버가 무시했다 — 구독 쪽과 같은 문제였다).
    const row = await env.DB.prepare('SELECT user_email FROM push_subscriptions WHERE id=?')
      .bind(id).first();
    if (!row) return cors(JSON.stringify({success:true}),200);   // 이미 없음 — 조용히 성공 처리

    if (row.user_email) {
      const idToken = (request.headers.get('Authorization')||'').replace('Bearer ','').trim();
      const email = idToken ? await getEmailFromToken(idToken, env) : null;
      if (email !== row.user_email) {
        return cors(JSON.stringify({error:{message:'권한이 없습니다.'}}),403);
      }
    }
    // user_email 이 NULL 인 건 로그인 전에 만들어진 구독이라 소유자를 알 수 없다.
    // 그건 예전처럼 endpoint 만으로 해제를 허용한다(막으면 영영 못 끊는다).

    await env.DB.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(id).run();
    return cors(JSON.stringify({success:true}),200);
  } catch(e) {
    return cors(JSON.stringify({error:{message:e.message}}),500);
  }
}

async function _sendOnePush(env, sub, payload) {
  try {
    const jwt = await _vapidJwt(env, sub.endpoint);
    const res = await fetch(sub.endpoint, {
      method:'POST',
      headers:{
        'Authorization':`vapid t=${jwt},k=${env.VAPID_PUBLIC_KEY}`,
        'Content-Type':'application/json',
        'TTL':'86400'
      },
      body: JSON.stringify(payload)
    });
    // 404/410 은 브라우저가 구독을 영구 폐기했다는 뜻이다. 지우지 않으면 죽은 엔드포인트가
    // 계속 쌓여 매일 크론이 헛일을 한다(예전엔 응답을 아예 보지 않았다).
    if (res.status === 404 || res.status === 410) {
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(sub.id).run().catch(()=>{});
    }
  } catch(_) {}
}

// 매일 08시(KST) 크론에서 호출. 구독 1건당 하루 1통이고, 아래 우선순위로 **한 가지** 문구만 고른다.
// 알림은 과하면 곧장 구독 해제로 이어지므로 여러 통을 보내지 않는다.
//   1) 스트릭이 살아 있는 사람 → 이어가라고 알림 (가장 시의성 있고 행동으로 이어짐)
//   2) 7일 이상 리딩이 없는 사람 → 지난 리딩 다시 보기로 유도
//   3) 그 외 / 비로그인 구독 → 오늘의 일진 오행 (날마다 실제로 바뀌는 문구)
// 기존 문구는 매일 글자 한 자 안 바뀌어서 무시당하기 쉬웠다.
const PUSH_MSG = {
  streak: {
    ko: n => `🔥 연속 ${n}일 진행 중! 오늘도 이어가세요`,
    en: n => `🔥 ${n}-day streak! Keep it going today`,
    zh: n => `🔥 已连续${n}天！今天也继续吧`,
    ja: n => `🔥 ${n}日連続中！今日も続けましょう`,
  },
  dormant: {
    ko: '지난 리딩을 다시 읽어보세요 📜 마이페이지 → 내 기록',
    en: 'Revisit your past readings 📜 My Page → My Records',
    zh: '回顾你的过往解读 📜 我的页面 → 我的记录',
    ja: '過去のリーディングを読み返しませんか 📜 マイページ → 私の記録',
  },
  daily: {
    ko: e => `오늘은 ${e} 기운의 날이에요 🌟 오늘의 리딩을 받아보세요`,
    en: e => `Today flows with ${e} energy 🌟 Get your reading`,
    zh: e => `今天是${e}之气的日子 🌟 来看今日解读`,
    ja: e => `今日は${e}の気の日 🌟 今日のリーディングを`,
  },
};

const DORMANT_DAYS = 7;

async function sendDailyPush(env) {
  await ensureDBExt(env);
  const subs = await env.DB.prepare('SELECT * FROM push_subscriptions').all();
  const rows = subs.results || [];
  if (!rows.length) return;

  // 개인화 신호는 앞에서 한 번에 모은다 — 구독자마다 조회하면 크론이 D1 호출을 수백 번 한다.
  const streaks = new Map();   // email → current_streak (어제까지 이어진 경우만)
  const recent  = new Set();   // 최근 DORMANT_DAYS 일 안에 리딩을 받은 email
  const hasUsers = rows.some(r => r.user_email);

  if (hasUsers) {
    const yesterday = new Date(Date.now() + 9*3600000 - 86400000).toISOString().slice(0, 10);
    try {
      // 오늘 이미 체크인했으면 재촉할 이유가 없으므로 어제까지인 사람만 고른다
      const s = await env.DB.prepare(
        `SELECT user_email, current_streak FROM user_streaks
         WHERE last_checkin = ? AND current_streak > 0`
      ).bind(yesterday).all();
      for (const r of s.results || []) streaks.set(r.user_email, r.current_streak);

      // 휴면 판정용 — "최근 활동자" 목록만 받아오면 되므로 전체 집계보다 훨씬 가볍다
      const since = Math.floor(Date.now()/1000) - DORMANT_DAYS*86400;
      const a = await env.DB.prepare(
        `SELECT DISTINCT user_email FROM (
           SELECT user_email, created_at FROM saju_history
           UNION ALL
           SELECT user_email, created_at FROM feature_history
         ) WHERE created_at > ?`
      ).bind(since).all();
      for (const r of a.results || []) recent.add(r.user_email);
    } catch (e) {
      // 개인화 실패가 알림 자체를 막으면 안 된다 — 기본 문구로 계속 진행
      console.error('[PUSH] 개인화 신호 조회 실패', e);
    }
  }

  const il = ilchin();
  for (const sub of rows) {
    const lang = PUSH_MSG.daily[sub.lang] ? sub.lang : 'ko';
    const email = sub.user_email;

    let body;
    if (email && streaks.has(email)) {
      body = PUSH_MSG.streak[lang](streaks.get(email));
    } else if (email && !recent.has(email)) {
      body = PUSH_MSG.dormant[lang];
    } else {
      const elem = (_ELEM_FR[lang] || _ELEM_FR.ko)[il.o] || il.o;
      body = PUSH_MSG.daily[lang](elem);
    }

    await _sendOnePush(env, sub, { title:'M;Y 安', body, url:'/' });
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
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 엽전'}}),401);

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

    // 위의 SELECT 검사만으로는 같은 날 두 번 체크인되는 걸 막지 못한다. 두 요청이 나란히 들어오면
    // 둘 다 갱신 전 상태를 읽고 둘 다 통과한다(버튼 두 번 누르기·재시도·오프라인 큐 재전송).
    // 그래서 갱신 자체에도 "오늘 날짜가 아직 아닐 때만" 조건을 건다.
    await env.DB.prepare(
      `INSERT INTO user_streaks (user_email,current_streak,max_streak,last_checkin,total_checkins,updated_at)
       VALUES (?,?,?,?,?,unixepoch())
       ON CONFLICT(user_email) DO UPDATE SET current_streak=excluded.current_streak,
       max_streak=excluded.max_streak,last_checkin=excluded.last_checkin,
       total_checkins=excluded.total_checkins,updated_at=excluded.updated_at
       WHERE user_streaks.last_checkin IS NOT excluded.last_checkin`
    ).bind(email,current,max,today,total).run();

    // 7일 스트릭 보너스 (원장에 새 행 추가 — UPDATE 금지: 기존 결제 행 수만큼 중복 지급되는 버그가 됨)
    // id 를 이메일+날짜로 고정한다. 위 경합으로 두 요청이 여기까지 와도 두 번째는 PRIMARY KEY 충돌로
    // 무시되므로 하루 한 번만 지급된다(share_bonus 가 이미 쓰는 방식과 같다).
    if (current%7===0) {
      const bonusId = `streak_${email}_${today}`;
      await env.DB.prepare(
        `INSERT OR IGNORE INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
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
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 엽전'}}),401);
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
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 엽전'}}),401);
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
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 엽전'}}),401);

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
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 엽전'}}),401);

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
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 엽전'}}),401);
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
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 엽전'}}),401);
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
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 엽전'}}),401);
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
    // 보상: 양쪽 엽전 3개 (원장에 새 행 추가 — UPDATE 금지: 기존 결제 행 수만큼 중복 지급되는 버그가 됨)
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
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 엽전'}}),401);
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
//  엽전 내역 조회
// ════════════════════════════
async function handleTokenHistory(request, env) {
  try {
    const idToken = (request.headers.get('Authorization')||'').replace('Bearer ','').trim();
    if (!idToken) return cors(JSON.stringify({error:{message:'인증 필요'}}),401);
    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 엽전'}}),401);

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
      return cors(JSON.stringify({ error: { message: '유효하지 않은 엽전' } }), 401);
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
//  운기 엽전 지급 핸들러
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
      return cors(JSON.stringify({ error: { message: '엽전은 1~10개만 가능' } }), 400);
    }

    // 사용자 존재 확인
    const user = await env.DB.prepare('SELECT * FROM payment_requests WHERE user_email=?').bind(email).first();
    if (!user) {
      return cors(JSON.stringify({ error: { message: '존재하지 않는 사용자' } }), 404);
    }

    // 엽전 지급 (원장에 새 행 추가 — UPDATE 금지: 기존 결제 행 수만큼 중복 지급되는 버그가 됨)
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
    if (!email) return cors(JSON.stringify({error:{message:'유효하지 않은 엽전'}}),401);
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

  // 다이나믹 1회용 엽전 처리
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

  // 엽전 지급.
  // 위의 중복 확인은 동시 요청 두 개를 나란히 통과시키므로(둘 다 기록 전 상태를 읽는다) 그것만으로는
  // 두 번 지급되는 걸 막지 못한다. claim id 를 이메일+코드로 고정해 클레임 기록 자체를 관문으로 쓴다 —
  // 먼저 도착한 요청만 행을 만들고, 나중 요청은 PRIMARY KEY 충돌로 밀려 지급까지 가지 못한다.
  const claimId = `promo_${email}_${code.toUpperCase()}`;
  const claimed = await env.DB.prepare(
    `INSERT OR IGNORE INTO promo_claims (id, user_email, promo_code, claimed_at, tokens_given) VALUES (?, ?, ?, unixepoch(), ?)`
  ).bind(claimId, email, code.toUpperCase(), promo.tokens).run();
  if (!claimed.meta?.changes) {
    return cors(JSON.stringify({ error: '이미 사용된 코드입니다. 계정당 1회만 사용 가능합니다.' }), 409);
  }

  await env.DB.prepare(
    `INSERT OR IGNORE INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
     VALUES (?, ?, 'promo', 0, ?, 'approved', unixepoch())`
  ).bind(`grant_${claimId}`, email, promo.tokens).run();

  // 잔여 엽전 반환
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
//  다이나믹 QR 프로모 (1회용 엽전 시스템)
// ════════════════════════════════════════════
// 카운터 태블릿용 관리자 PIN — 소스에 하드코딩하지 않고 `wrangler secret put PROMO_ADMIN_PIN`으로 설정
const PROMO_TOKEN_TTL = 600;   // 엽전 유효시간: 10분 (초)
const PROMO_TOKENS_REWARD = 3; // 지급 엽전 수

// 랜덤 엽전 생성
function _genToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length: 8}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// [관리자] 새 1회용 엽전 생성 (카운터 태블릿에서 호출)
async function handlePromoGenerate(request, env) {
  const { adminPin } = await request.json().catch(() => ({}));
  if (!env.PROMO_ADMIN_PIN || adminPin !== env.PROMO_ADMIN_PIN) {
    return cors(JSON.stringify({ error: '관리자 PIN이 올바르지 않습니다.' }), 403);
  }
  // 기존 미사용 엽전 무효화
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

// [관리자] 현재 유효한 엽전 조회
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

// [손님] 1회용 엽전으로 클레임
async function handleDynamicPromoClaim(request, env, email, token) {
  // 엽전 유효성 확인
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

  // 엽전 소비 처리.
  // used_at IS NULL 조건이 있어야 1회용 코드가 정말 1회가 된다 — 위의 SELECT 는 동시에 들어온
  // 두 요청(특히 서로 다른 계정)을 나란히 통과시키므로, 조건 없이 UPDATE 하면 둘 다 지급받는다.
  const consumed = await env.DB.prepare(
    `UPDATE dynamic_promo_tokens SET used_at = unixepoch(), used_by = ? WHERE token = ? AND used_at IS NULL`
  ).bind(email, token).run();
  if (!consumed.meta?.changes) {
    return cors(JSON.stringify({ error: '이 코드는 이미 사용됐거나 만료되었습니다. 직원에게 새 코드를 요청해 주세요.' }), 410);
  }

  // 계정당 1회이므로 claim id 도 이메일로 고정한다(같은 계정이 서로 다른 코드로 동시에 시도하는 경우 대비).
  const claimId = `dyn_${email}`;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO promo_claims (id, user_email, promo_code, claimed_at, tokens_given) VALUES (?, ?, 'DYNAMIC', unixepoch(), ?)`
  ).bind(claimId, email, tokenRow.tokens_given).run();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
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

// 페이지 로드 시 현재 유효한 엽전 확인
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
    // 무료 1회의 하루는 KST 자정에 넘어간다. 예전엔 UTC 날짜를 키로 썼는데, 워커 로컬이
    // UTC 라 실제 초기화가 09:00 KST 에 일어났다 — 08시에 쓰고 10시에 또 쓰면 두 번 됐고,
    // 밤 11시에 쓴 사람은 한국 날짜가 바뀐 새벽 1시에도 거절당했다. 스트릭·캐시·일진이
    // 모두 KST 자정을 쓰므로 여기만 어긋나 있었다.
    const today = _kstYmd();

    if (!env.DB) {
      return cors(JSON.stringify({ error: { message: 'DB not available' } }), 500);
    }

    const { birth, name = '손님', lang = 'ko', ref } = await request.json().catch(() => ({}));
    if (!birth) {
      return cors(JSON.stringify({ error: { message: 'birth 필수' } }), 400);
    }

    // 제한 없이 쓰는 운영자 IP. 공개 저장소라 값을 코드에 두지 않는다(예전엔 실제 IP 가 박혀 있었다).
    // 시크릿이 없으면 예외 자체가 사라진다 — PIN 들과 같은 fail-closed 방침.
    const isMaster = !!env.MASTER_IP && ip === env.MASTER_IP;

    // ref=ungi 여부에 따라 다른 테이블 사용
    const isUngi = ref === 'ungi';
    const tableName = isUngi ? 'ungi_guest_usage' : 'guest_usage';

    // IP당 하루 1회 제한 (마스터 IP는 제외).
    // 예전엔 SELECT 로 확인만 하고 실제 기록은 Gemini 응답을 받은 뒤에 했다. 그 사이가 비어 있어서
    // 같은 IP 로 동시에 들어온 요청이 전부 검사를 통과했고, 무료 호출이 그만큼 여러 번 나갔다.
    // 그래서 자리를 먼저 잡고(조건부 UPSERT), 풀이를 못 만들면 되돌려준다.
    let releaseGuestSlot = null;
    if (!isMaster) {
      const claim = await env.DB.prepare(
        `INSERT INTO ${tableName} (ip, used_date, used_count) VALUES (?, ?, 1)
         ON CONFLICT(ip, used_date) DO UPDATE SET used_count = used_count + 1
         WHERE ${tableName}.used_count < 1`
      ).bind(ip, today).run().catch(() => null);

      if (!claim?.meta?.changes) {
        // 다음 KST 자정 = (today 다음 날) 00:00 KST → UTC 로는 그 9시간 전.
        // 로컬 시간 접근자(setDate/setHours)로 재지 않는다 — 워커에서는 로컬이 UTC 라
        // 조용히 09:00 KST 를 가리켰다. Date.UTC 는 월·해 넘김도 알아서 처리한다.
        const [ry, rm, rd] = today.split('-').map(Number);
        const resetDate = new Date(Date.UTC(ry, rm - 1, rd + 1) - 9 * 3600000);
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

      // 우리 쪽 사정으로 풀이를 못 준 경우엔 오늘의 무료 1회를 소모시키지 않는다.
      releaseGuestSlot = () => env.DB.prepare(
        `UPDATE ${tableName} SET used_count = used_count - 1
         WHERE ip = ? AND used_date = ? AND used_count > 0`
      ).bind(ip, today).run();
    }
    const releaseSlot = async () => {
      if (!releaseGuestSlot) return;
      const release = releaseGuestSlot;
      releaseGuestSlot = null;
      await release().catch(() => {});
    };

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
          signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: _ANDORYEONG_SI,
            contents: [
              { parts: [{ text: sysText + '\n\n' + userMsg }] }
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.8,
              maxOutputTokens: 2048,
              thinkingConfig: { thinkingBudget: 0 }
            }
          })
        }
      );

      if (!resp.ok) {
        // 업스트림 원문은 로그로만 남긴다 — 응답에 실어 보내면 내부 사정이 그대로 새어나간다.
        console.error('[GUEST CHAT] Gemini API error:', resp.status, (await resp.text()).slice(0, 500));
        await releaseSlot();
        return cors(JSON.stringify({
          error: { message: '지금은 풀이를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.' }
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
        await releaseSlot();
        return cors(JSON.stringify({
          error: { message: 'AI 응답을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.' }
        }), 500);
      }

      if (!result.reading || !result.ohaeng) {
        await releaseSlot();
        return cors(JSON.stringify({
          error: { message: 'AI 응답 형식 오류' }
        }), 500);
      }

      // 사용 기록은 위에서 미리 잡아뒀다(releaseGuestSlot). 여기서 다시 올리지 않는다.
      return cors(JSON.stringify({ success: true, reading: result.reading, ohaeng: result.ohaeng, isUngi }), 200);

    } catch(e) {
      // fetch 가 던지는 등 우리 쪽 실패 — 무료 1회를 소모시키지 않는다.
      await releaseSlot();
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
