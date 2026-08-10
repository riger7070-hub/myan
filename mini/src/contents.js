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

export const OHAENG_TYPES = [
  { v: '木', label: '목(木) · 나무' },
  { v: '火', label: '화(火) · 불' },
  { v: '土', label: '토(土) · 흙' },
  { v: '金', label: '금(金) · 쇠' },
  { v: '水', label: '수(水) · 물' },
];

// ⚠️ v 는 서버의 FORTUNE_TOPICS 키와 **정확히** 같아야 한다. 다르면 400 으로 튕긴다.
// (첫 버전에서 love/money/work 처럼 임의로 지었다가 6개 중 5개가 전부 실패했다.)
export const TOPICS = [
  { v: 'crush',       label: '짝사랑운' },
  { v: 'trust',       label: '관계 신뢰 기운' },
  { v: 'family',      label: '가족운' },
  { v: 'future',      label: '미래운' },
  { v: 'grades',      label: '학업·성적운' },
  { v: 'personality', label: '성격 분석' },
  { v: 'appearance',  label: '인상·이미지운' },
  { v: 'success',     label: '성공운' },
];

// ⚠️ v 는 서버의 TAKIL_PURPOSES 키와 정확히 같아야 한다(같은 이유).
export const PURPOSES = [
  { v: 'wedding',  label: '결혼·약혼' },
  { v: 'moving',   label: '이사·입주' },
  { v: 'opening',  label: '개업·창업' },
  { v: 'contract', label: '계약·거래' },
  { v: 'travel',   label: '여행·출장' },
  { v: 'medical',  label: '치료·수술' },
  { v: 'build',    label: '공사·수리' },
  { v: 'meeting',  label: '만남·모임' },
  { v: 'ritual',   label: '고사·기도' },
];

export const SECTIONS = [
  {
    icon: '☯', title: '사주로 보는 나',
    items: [
      { id: 'daeun',      icon: '🌊',  label: '대운 · 10년의 흐름', cost: 3, path: '/api/daeun',          need: null },
      { id: 'name',       icon: '✍️',  label: '이름 풀이',          cost: 2, path: '/api/name-reading',   need: 'name' },
      { id: 'photo',      icon: '🖐️', label: '관상·손금',          cost: 2, path: '/api/photo-reading',  need: 'photo' },
      { id: 'typecompat', icon: '🧿',  label: '오행 유형 테스트',    cost: 1, path: '/api/type-compat',    need: 'type' },
      { id: 'numerology', icon: '🔢',  label: '라이프패스 넘버',     cost: 1, path: '/api/numerology',     need: null },
    ],
  },
  {
    icon: '📅', title: '때를 고르다',
    items: [
      { id: 'takil',   icon: '📆', label: '택일 · 좋은 날 고르기', cost: 2, path: '/api/auspicious-days', need: 'purpose' },
      { id: 'compat',  icon: '💞', label: '궁합 시기',             cost: 3, path: '/api/compat-timing',   need: 'partner' },
      { id: 'tojeong', icon: '🧧', label: '토정비결풍 신년운세',    cost: 2, path: '/api/tojeong',         need: null },
    ],
  },
  {
    icon: '🎴', title: '물어보는 점',
    items: [
      { id: 'tarot',  icon: '🔮', label: '오늘의 타로',  cost: 1, path: '/api/tarot-draw',          need: null },
      { id: 'iching', icon: '🀄', label: '주역 괘 풀이', cost: 1, path: '/api/iching',              need: 'text',
        prompt: '무엇이 궁금하신가요? (비워도 됩니다)', placeholder: '예: 지금 이직해도 될까요' },
      { id: 'rune',   icon: 'ᚱ', label: '룬 문자 점',   cost: 1, path: '/api/rune-reading',        need: null },
      { id: 'dream',  icon: '🌙', label: '꿈해몽',       cost: 1, path: '/api/dream-interpretation', need: 'text',
        prompt: '어떤 꿈을 꾸셨나요?', placeholder: '예: 맑은 물에서 잉어를 봤어요', required: true, field: 'dream' },
    ],
  },
  {
    icon: '✨', title: '오늘의 운세',
    items: [
      { id: 'today',  icon: '🌅', label: '오늘의 운세',        cost: 1, path: '/mini/api/today', need: null },
      { id: 'astro',  icon: '🪐', label: '천궁도 트랜싯',      cost: 1, path: '/api/astro-transit',  need: null },
      { id: 'zodiac', icon: '🐉', label: '띠·별자리 운세',      cost: 1, path: '/api/zodiac-fortune', need: null },
      { id: 'topic',  icon: '✨', label: '주제별 운세',         cost: 1, path: '/api/fortune-topic',  need: 'topic' },
      { id: 'lucky',  icon: '🍀', label: '오늘의 럭키 아이템',  cost: 1, path: '/api/lucky-picks',    need: null },
      { id: 'saju',   icon: '📜', label: '내 사주 풀이',        cost: 0, path: '/saju-reading',       need: null, free: true },
    ],
  },
];

export const ALL_ITEMS = SECTIONS.flatMap(s => s.items);
export const itemById = (id) => ALL_ITEMS.find(i => i.id === id);
