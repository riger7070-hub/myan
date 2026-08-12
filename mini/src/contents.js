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

export const SECTIONS = [
  {
    icon: 'secMe', title: '사주로 보는 나',
    items: [
      { id: 'sinsal',     icon: 'sinsal',     label: '신살 풀이',          cost: 3, path: '/api/sinsal',         need: null },
      { id: 'pastlife',   icon: 'pastlife',   label: '전생 이야기',        cost: 4, path: '/api/past-life',      need: null },
      { id: 'vocation',   icon: 'vocation',   label: '천직과 적성',        cost: 4, path: '/api/vocation',       need: null },
      { id: 'daeun',      icon: 'daeun',      label: '대운, 10년의 흐름', cost: 6, path: '/api/daeun',          need: null },
      { id: 'name',       icon: 'name',       label: '이름 풀이',          cost: 4, path: '/api/name-reading',   need: 'name' },
      { id: 'photo',      icon: 'photo',      label: '관상과 손금',          cost: 4, path: '/api/photo-reading',  need: 'photo' },
      { id: 'typecompat', icon: 'typecompat', label: '오행 유형 테스트',    cost: 2, path: '/api/type-compat',    need: 'type' },
      { id: 'numerology', icon: 'numerology', label: '라이프패스 넘버',     cost: 2, path: '/api/numerology',     need: null },
    ],
  },
  {
    icon: 'secTiming', title: '때를 고르다',
    items: [
      { id: 'takil',   icon: 'takil',   label: '택일, 좋은 날 고르기', cost: 2, path: '/api/auspicious-days', need: 'purpose' },
      { id: 'compat',  icon: 'compat',  label: '궁합 시기',             cost: 6, path: '/api/compat-timing',   need: 'partner' },
      { id: 'spouse',  icon: 'spouse',  label: '배우자궁 풀이',          cost: 3, path: '/api/spouse-palace',   need: null },
      { id: 'tojeong', icon: 'tojeong', label: '토정비결풍 신년운세',    cost: 4, path: '/api/tojeong',         need: null },
    ],
  },
  {
    icon: 'secAsk', title: '물어보는 점',
    items: [
      { id: 'tarot',  icon: 'tarot',  label: '오늘의 타로',  cost: 1, path: '/api/tarot-draw',          need: null },
      { id: 'iching', icon: 'iching', label: '주역 괘 풀이', cost: 1, path: '/api/iching',              need: 'text',
        prompt: '무엇이 궁금하신가요? (비워도 됩니다)', placeholder: '예: 지금 이직해도 될까요' },
      { id: 'rune',   icon: 'rune',   label: '룬 문자 점',   cost: 1, path: '/api/rune-reading',        need: null },
      { id: 'dream',  icon: 'dream',  label: '꿈해몽',       cost: 1, path: '/api/dream-interpretation', need: 'text',
        prompt: '어떤 꿈을 꾸셨나요?', placeholder: '예: 맑은 물에서 잉어를 봤어요', required: true, field: 'dream' },
    ],
  },
  {
    icon: 'secDaily', title: '오늘의 운세',
    items: [
      { id: 'ttirank', icon: 'ttirank', label: '오늘의 띠 순위',     cost: 1, path: '/api/tti-ranking',    need: null },
      { id: 'today',  icon: 'today',  label: '오늘의 운세',        cost: 1, path: '/mini/api/today',     need: null },
      { id: 'astro',  icon: 'astro',  label: '천궁도 트랜싯',      cost: 1, path: '/api/astro-transit',  need: null },
      { id: 'zodiac', icon: 'zodiac', label: '띠와 별자리 운세',      cost: 1, path: '/api/zodiac-fortune', need: null },
      { id: 'topic',  icon: 'topic',  label: '주제별 운세',         cost: 1, path: '/api/fortune-topic',  need: 'topic' },
      { id: 'lucky',  icon: 'lucky',  label: '오늘의 럭키 아이템',  cost: 1, path: '/api/lucky-picks',    need: null },
      { id: 'saju',   icon: 'saju',   label: '내 사주 풀이',        cost: 0, path: '/saju-reading',       need: null, free: true },
      // 산가지는 서버를 안 부르는 무료 재미다. 엽전이 걸린 놀이들과 같은 칸에 두면
      // 보상이 있는 줄 알고 눌렀다 실망한다. 오늘의 운세 곁이 제자리다.
      { id: 'stick',  icon: 'stick',  label: '산가지 뽑기',         cost: 0, path: null,                  need: null, free: true, local: true },
    ],
  },
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

export const ALL_ITEMS = SECTIONS.flatMap(s => s.items);
export const itemById = (id) => ALL_ITEMS.find(i => i.id === id);
