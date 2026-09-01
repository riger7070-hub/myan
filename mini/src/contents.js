// 미니앱이 제공하는 콘텐츠 정의.
//
// 웹(js/app.js 의 _homeSections)과 같은 4분류를 쓴다. 가격도 서버가 실제로 빼는 값과
// 같아야 한다 — 여기 적힌 값과 worker.js 의 accountSpend 가 어긋나면 사용자는 표시된
// 것보다 더 내거나 덜 낸다. 웹에는 그걸 잡는 테스트(home-sections.test.mjs)가 있고,
// 미니앱도 같은 규칙을 따른다.
//
// need: 콘텐츠를 부르기 전에 사용자에게 더 받아야 하는 입력.
//   null        - 프로필(생년월일)만으로 바로 호출
//   'text'      - 한 줄 입력 (꿈 내용, 주역 질문 등)
//   'name'      - 이름
//   'partner'   - 상대방 생년월일
//   'photo'     - 사진 업로드
//   'topic'     - 주제 선택
//   'type'      - 오행 유형 두 개 선택
//   'purpose'   - 택일 목적 선택

// 오늘의 달 위상. worker.js 의 moonPhase() 와 **같은 상수·같은 식**을 쓴다 —
// 여는 화면에 띄우는 달이 서버가 말하는 달과 다르면 앙금이 남는다.
// 서버를 부르지 않는 이유는 여는 화면이 네트워크를 기다리면 안 되기 때문이다.
const SYNODIC_MONTH = 29.530588853;   // 삭망월(일) — 천문 표준값
const NEW_MOON_JD   = 2451550.09766;  // 기준 삭(Meeus): 2000-01-06
const UNIX_EPOCH_JD = 2440587.5;

export const MOON_ICONS = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
export const MOON_NAMES = ['삭', '초승달', '상현달', '차오르는 달', '보름달', '기우는 달', '하현달', '그믐달'];

export function moonToday(date = new Date()) {
  const jd = date.getTime() / 86400000 + UNIX_EPOCH_JD;
  let age = (jd - NEW_MOON_JD) % SYNODIC_MONTH;
  if (age < 0) age += SYNODIC_MONTH;
  const index = Math.floor((age / SYNODIC_MONTH) * 8 + 0.5) % 8;
  return { index, icon: MOON_ICONS[index], name: MOON_NAMES[index] };
}

// 생시. 서버는 한글 시진명('자시'~'해시')이나 지지 글자를 받고, 빈값이면 '모름'으로 본다
// (worker.js 의 computeSaju 주석 참고). 웹의 _SIJI_OPTIONS 와 같은 목록이다 —
// 값이 어긋나면 같은 사람인데 웹과 미니앱의 사주가 달라진다.
export const SIJI = [
  ['',    '모름 / 선택 안 함'],
  ['자시', '🌑 자시 (23~01시)'], ['축시', '🌒 축시 (01~03시)'], ['인시', '🌓 인시 (03~05시)'],
  ['묘시', '🌅 묘시 (05~07시)'], ['진시', '🌤 진시 (07~09시)'], ['사시', '☀️ 사시 (09~11시)'],
  ['오시', '🌞 오시 (11~13시)'], ['미시', '🌇 미시 (13~15시)'], ['신시', '🌆 신시 (15~17시)'],
  ['유시', '🌇 유시 (17~19시)'], ['술시', '🌃 술시 (19~21시)'], ['해시', '🌙 해시 (21~23시)'],
];

// 성별. 대운(大運)은 남녀에 따라 순행·역행이 갈려서 없으면 풀이 자체가 달라진다.
// 서버는 'M'/'F' 를 쓴다.
export const GENDERS = [
  { v: 'M', label: '남성' },
  { v: 'F', label: '여성' },
];

export const OHAENG_TYPES = [
  { v: '木', label: '목(木) 나무' },
  { v: '火', label: '화(火) 불' },
  { v: '土', label: '토(土) 흙' },
  { v: '金', label: '금(金) 쇠' },
  { v: '水', label: '수(水) 물' },
];

// ⚠️ v 는 서버의 FORTUNE_TOPICS 키와 **정확히** 같아야 한다. 다르면 400 으로 튕긴다.
// (첫 버전에서 love/money/work 처럼 임의로 지었다가 6개 중 5개가 전부 실패했다.)
export const TOPICS = [
  { v: 'crush',       label: '짝사랑운' },
  { v: 'trust',       label: '관계 신뢰 기운' },
  { v: 'family',      label: '가족운' },
  { v: 'future',      label: '미래운' },
  { v: 'grades',      label: '학업과 성적운' },
  { v: 'personality', label: '성격 분석' },
  { v: 'appearance',  label: '인상과 이미지운' },
  { v: 'success',     label: '성공운' },
];

// ⚠️ v 는 서버의 TAKIL_PURPOSES 키와 정확히 같아야 한다(같은 이유).
// 이 사람과 어떤 사이인가. 안 골라도 되지만, 고르면 같은 자리를 다르게 읽어 준다 —
// 달의 기둥이 부딪히는 것이 연인에게는 취향 차이지만 같이 일하는 사이에서는
// 일하는 방식 차이가 된다.
export const RELATIONS = [
  { v: '',       label: '고르지 않음' },
  { v: 'lover',  label: '연인' },
  { v: 'spouse', label: '부부' },
  { v: 'family', label: '가족' },
  { v: 'friend', label: '친구' },
  { v: 'work',   label: '같이 일하는 사이' },
];

export const PURPOSES = [
  { v: 'wedding',  label: '결혼과 약혼' },
  { v: 'moving',   label: '이사와 입주' },
  { v: 'opening',  label: '개업과 창업' },
  { v: 'contract', label: '계약과 거래' },
  { v: 'travel',   label: '여행과 출장' },
  { v: 'medical',  label: '치료와 수술' },
  { v: 'build',    label: '공사와 수리' },
  { v: 'meeting',  label: '만남과 모임' },
  { v: 'ritual',   label: '고사와 기도' },
];

// ── 묶음은 **누가 풀어 주는가**로 나눈다 (2026-08-31) ──
//
// 전에는 '사주로 보는 나', '때와 방위' 처럼 주제로 나눴는데 축이 섞여 있었다.
// 어떤 칸은 주제로(나·관계), 어떤 칸은 시간으로(오늘·올해), 어떤 칸은 도구로
// (타로·주역·관상) 갈려서 같은 물음이 여러 칸에 흩어졌다 — "오늘 어때?" 를 묻는
// 칸이 다섯이었고 "이거 어떻게 될까?" 가 넷이었다.
//
// 축을 하나로 세웠다. **콘텐츠마다 맡은 사람이 이미 정해져 있으니**(FEATURE_SPEAKER)
// 그걸 그대로 묶음으로 쓴다. 하나는 정확히 한 사람에게 속하고(중복 없음), 넷이
// 전부를 덮는다(빠짐없음).
//
// ⚠️ 묶음을 옮길 때는 **FEATURE_SPEAKER 도 함께 고쳐야 한다.** 화면에는 안동자
//    묶음에 있는데 글은 안할매가 쓰면 사용자가 바로 알아챈다.
//    test/menu-by-speaker.test.mjs 가 둘을 대조한다.
//
// ⚠️ 웹(js/app.js 의 _homeSections)과 제목·순서가 같아야 한다 —
//    test/client-sections-sync.test.mjs 가 대조한다.
//    담기는 항목까지 같지는 않다(로또는 웹에만, 출석·산가지는 미니앱에만 있다).
//
// ── 합친 칸 ──
// 같은 물음을 여러 칸에 흩어 두면 고르는 데 힘이 든다. 하나로 묶고 **누른 다음**
// 고르게 했다(pick). 콘텐츠를 지운 것이 아니라 문 앞에서 한 번 물어보는 것이다.
export const SECTIONS = [
  {
    icon: 'secMe', title: '안도령 — 기운을 읽다',
    items: [
      // 무료 풀이를 맨 앞에 둔다 — 처음 온 사람이 엽전을 쓰기 전에 한 번 받아 볼 자리다.
      { id: 'saju',     icon: 'saju',     label: '내 사주 풀이',        cost: 0, path: '/saju-reading', need: null, free: true },
      { id: 'wealth',   icon: 'wealth',   label: '돈이 모이는 자리',     cost: 4, path: '/api/wealth',   need: null },
      { id: 'vocation', icon: 'vocation', label: '이 길이 내 길이 맞을까', cost: 4, path: '/api/vocation', need: null },
      { id: 'daeun',    icon: 'daeun',    label: '지금 나는 어느 10년',  cost: 6, path: '/api/daeun',    need: null },
      // 「오늘 어때?」 를 묻던 다섯 칸을 하나로 묶었다. 값이 다 1엽전이라 고를 이유가
      // 값에 있지 않았고, 다섯이 나란히 있으면 무엇이 다른지 알 수가 없었다.
      { id: 'daily',  icon: 'today',  label: '오늘 어때요',   cost: 1, pick: ['today', 'ttirank', 'zodiac', 'topic', 'astro'] },
      // 뽑아서 보는 것 둘. 물어볼 말이 필요 없다는 점이 같다.
      { id: 'draw',   icon: 'tarot',  label: '뽑아서 보기',   cost: 1, pick: ['tarot', 'rune'] },
      // 사주 말고 **다른 것으로** 나를 보는 넷. 넣는 것이 저마다 달라(이름·성·사진·없음)
      // 고른 뒤에 각자의 입력으로 간다.
      { id: 'other',  icon: 'name',   label: '이름·얼굴·숫자로 보는 나', cost: 4, pick: ['name', 'naming', 'photo', 'numerology'] },
    ],
  },
  {
    // 궁합은 그것만 보러 오는 사람이 있다. 전에는 '때를 고르다' 안에 궁합 시기와
    // 속궁합이 섞여 있어서 그 사람이 못 찾았다 — 그래서 밖으로 뺐다.
    icon: 'secLove', title: '안낭자 — 인연을 보다',
    items: [
      { id: 'compat',   icon: 'compat',   label: '이 사람과 좋은 때',      cost: 6, path: '/api/compat-timing', need: 'partner' },
      { id: 'intimacy', icon: 'intimacy', label: '속궁합',                cost: 5, path: '/api/intimacy',      need: 'partner' },
      { id: 'relation', icon: 'compat',   label: '왜 자꾸 이 사람과 어긋날까', cost: 5, path: '/api/relation',   need: 'relation' },
      { id: 'spouse',   icon: 'spouse',   label: '내 짝은 어떤 사람',       cost: 3, path: '/api/spouse-palace', need: null },
      { id: 'typecompat', icon: 'typecompat', label: '오행으로 보는 두 사람', cost: 2, path: '/api/type-compat', need: 'type' },
    ],
  },
  {
    icon: 'secTiming', title: '안할매 — 액을 눅이다',
    items: [
      { id: 'sinsal',   icon: 'sinsal',   label: '내 사주에 앉은 살',   cost: 3, path: '/api/sinsal',     need: null },
      { id: 'tojeong',  icon: 'tojeong',  label: '토정비결 신년운세',    cost: 4, path: '/api/tojeong',    need: null },
      { id: 'yearluck', icon: 'yearluck', label: '올해 나에게 오는 것',  cost: 4, path: '/api/year-luck',  need: null },
      { id: 'pastlife', icon: 'pastlife', label: '전생에 나는 누구였나', cost: 4, path: '/api/past-life',  need: null },
      // 물어보면 답해 주는 둘. 둘 다 글을 적어야 한다는 점이 같다.
      { id: 'ask',      icon: 'iching',   label: '물어보기',            cost: 1, pick: ['iching', 'dream'] },
    ],
  },
  {
    icon: 'secDaily', title: '안동자 — 길한 것을 찾다',
    items: [
      { id: 'gwiin',     icon: 'gwiin',     label: '누가 나를 도와줄까',   cost: 4, path: '/api/gwiin',           need: null },
      { id: 'direction', icon: 'direction', label: '나에게 좋은 방향',     cost: 3, path: '/api/direction',       need: null },
      { id: 'takil',     icon: 'takil',     label: '이 일에 좋은 날',      cost: 2, path: '/api/auspicious-days', need: 'purpose' },
      { id: 'lucky',     icon: 'lucky',     label: '오늘의 행운 아이템',   cost: 1, path: '/api/lucky-picks',     need: null },
      // 산가지는 서버를 안 부르는 무료 재미다. 엽전이 걸린 놀이들과 같은 칸에 두면
      // 보상이 있는 줄 알고 눌렀다 실망한다. 길한 것을 찾는 안동자 곁이 제자리다.
      { id: 'stick',     icon: 'stick',     label: '산가지 뽑기',         cost: 0, path: null, need: null, free: true, local: true },
    ],
  },
];

// ── 묶음 뒤에 숨은 것들 ──
//
// 합친 칸(pick)을 누르면 고르게 되는 실제 콘텐츠다. 홈 타일로는 안 보이지만
// itemById 로는 찾을 수 있어야 한다 — 고른 뒤에 이걸로 실행하기 때문이다.
//
// ⚠️ 여기 있는 것을 지우면 그 칸을 고를 수는 있는데 아무 일도 안 일어난다.
//    test/menu-by-speaker.test.mjs 가 pick 에 적힌 id 가 다 여기 있는지 본다.
export const PICKED = [
  // 오늘 어때요
  { id: 'today',   icon: 'today',   label: '사주로 보는 오늘',  cost: 1, path: '/mini/api/today',     need: null },
  { id: 'ttirank', icon: 'ttirank', label: '오늘의 띠 순위',    cost: 1, path: '/api/tti-ranking',    need: null },
  { id: 'zodiac',  icon: 'zodiac',  label: '띠와 별자리로',     cost: 1, path: '/api/zodiac-fortune', need: null },
  { id: 'topic',   icon: 'topic',   label: '주제를 골라서',     cost: 1, path: '/api/fortune-topic',  need: 'topic' },
  { id: 'astro',   icon: 'astro',   label: '행성으로 보는 오늘', cost: 1, path: '/api/astro-transit',  need: null },
  // 뽑아서 보기
  { id: 'tarot',   icon: 'tarot',   label: '타로 카드',        cost: 1, path: '/api/tarot-draw',     need: null },
  { id: 'rune',    icon: 'rune',    label: '룬 문자',          cost: 1, path: '/api/rune-reading',   need: null },
  // 물어보기
  { id: 'iching',  icon: 'iching',  label: '주역으로 묻다',     cost: 1, path: '/api/iching', need: 'text',
    prompt: '무엇이 궁금하신가요? (비워도 됩니다)', placeholder: '예: 지금 이직해도 될까요' },
  { id: 'dream',   icon: 'dream',   label: '꿈해몽',           cost: 1, path: '/api/dream-interpretation', need: 'text',
    prompt: '어떤 꿈을 꾸셨나요?', placeholder: '예: 맑은 물에서 잉어를 봤어요', required: true, field: 'dream' },
  // 이름·얼굴·숫자로 보는 나
  { id: 'name',       icon: 'name',       label: '내 이름에 담긴 기운', cost: 4, path: '/api/name-reading',  need: 'name' },
  { id: 'naming',     icon: 'naming',     label: '아이 이름 지을 때',   cost: 4, path: '/api/naming',        need: 'surname' },
  { id: 'photo',      icon: 'photo',      label: '관상과 손금',        cost: 4, path: '/api/photo-reading', need: 'photo' },
  { id: 'numerology', icon: 'numerology', label: '숫자로 보는 성향',    cost: 2, path: '/api/numerology',    need: null },
];

// 산가지(算가지) 뽑기. 서버도 AI 도 부르지 않는 순수 재미다.
// 결과에 엽전을 걸지 않는 이유: 운에 따라 보상이 나오면 사행성으로 지적받을 수 있다.
// 엽전은 출석·퀴즈·광고처럼 확인 가능한 행동에만 붙인다.
export const SANGAJI = [
  { n: '一', t: '길(吉)',   m: '막혔던 곳이 트입니다. 미뤄 둔 연락을 오늘 해보세요.' },
  { n: '二', t: '평(平)',   m: '크게 좋지도 나쁘지도 않은 날. 하던 일을 꾸준히 하면 됩니다.' },
  { n: '三', t: '희(喜)',   m: '반가운 소식이 들어옵니다. 작은 것이라도 놓치지 마세요.' },
  { n: '四', t: '신(愼)',   m: '서두르면 어긋납니다. 오늘은 한 박자 늦춰도 늦지 않습니다.' },
  { n: '五', t: '재(財)',   m: '들어올 자리가 보입니다. 다만 큰 지출은 며칠 미루세요.' },
  { n: '六', t: '인(人)',   m: '사람에게서 답이 옵니다. 오늘 만나는 이의 말을 흘리지 마세요.' },
  { n: '七', t: '정(靜)',   m: '움직이기보다 살피는 날. 결정을 내일로 미뤄도 좋습니다.' },
  { n: '八', t: '진(進)',   m: '나아가기 좋습니다. 망설이던 한 걸음을 떼어 보세요.' },
];


// ── 누가 풀어 주는가 ──
//
// 넷이 같은 집안이고, 콘텐츠마다 맡은 사람이 다르다. 화면에 세울 그림과 이름이
// 여기 있고, 실제로 글을 쓰는 인격은 서버(worker.js 의 SPEAKERS)에 있다.
//
// ⚠️ 서버의 SPEAKERS / FEATURE_SPEAKER 와 **글자 하나까지 같아야 한다**. 어긋나면
//    화면에는 안낭자가 서 있는데 글은 안할매가 쓴 것이 된다. 사용자는 그걸 바로 알아챈다.
//    test/speakers.test.mjs 가 두 파일을 대조한다.
export const SPEAKERS = {
  doryeong: { name: '안도령', file: '/andoryeong.svg', intro: '산중에서 기운을 읽어 온 젊은 도인' },
  nangja:   { name: '안낭자', file: '/annangja.svg',   intro: '사람과 사람 사이의 인연을 보는 이' },
  halmae:   { name: '안할매', file: '/anhalmae.svg',   intro: '액을 막고 흉을 눅이는 산중의 어른' },
  dongja:   { name: '안동자', file: '/andongja.svg',   intro: '길한 것을 찾아내는 눈 밝은 아이' },
};

export const DEFAULT_SPEAKER = 'doryeong';

// ⚠️ 이 표가 곧 홈 묶음이다(SECTIONS). 한쪽만 고치면 화면에는 안동자 묶음에 있는데
//    글은 안할매가 쓴 것이 된다. test/menu-by-speaker.test.mjs 가 둘을 대조한다.
export const FEATURE_SPEAKER = {
  // 안낭자 — 인연
  '/api/compat-timing':        'nangja',
  '/api/intimacy':             'nangja',
  '/api/relation':             'nangja',
  '/api/type-compat':          'nangja',
  '/api/spouse-palace':        'nangja',
  // 안할매 — 액막이와 오래된 책
  '/api/sinsal':               'halmae',
  '/api/tojeong':              'halmae',
  '/api/year-luck':            'halmae',
  '/api/past-life':            'halmae',
  '/api/dream-interpretation': 'halmae',
  '/api/iching':               'halmae',
  // 안동자 — 길한 것을 찾는다
  '/api/gwiin':                'dongja',
  '/api/lucky-picks':          'dongja',
  '/api/direction':            'dongja',
  '/api/auspicious-days':      'dongja',
};

/** 표에 없는 콘텐츠는 안도령이 맡는다. 산가지처럼 서버를 안 부르는 것도 여기로 온다. */
export const speakerOf = (item) =>
  SPEAKERS[FEATURE_SPEAKER[item && item.path] || DEFAULT_SPEAKER];

// ⚠️ 숨은 것(PICKED)까지 넣어야 한다. 합친 칸에서 고른 뒤에 itemById 로 찾아 실행한다.
export const ALL_ITEMS = [...SECTIONS.flatMap(s => s.items), ...PICKED];
export const itemById = (id) => ALL_ITEMS.find(i => i.id === id);
/** 합친 칸이 품고 있는 것들. 고르는 화면이 이걸로 목록을 그린다. */
export const pickedOf = (item) => (item?.pick || []).map(itemById).filter(Boolean);
