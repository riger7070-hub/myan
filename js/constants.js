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

function ilchin() {
  const ref = new Date(2023,0,1); ref.setHours(0,0,0,0);
  const now = new Date(); now.setHours(0,0,0,0);
  const idx = ((44 + Math.round((now-ref)/864e5)) % 60 + 60) % 60;
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

// 오행 유형 테스트 — 질문 옵션 순서와 백엔드 worker.js의 TYPE_ELEMENTS 순서를 맞출 것
const TYPE_ORDER = ['木','火','土','金','水'];

// 한글 단독 이름 (일반인용)
const ON_KR = { 木:'목', 火:'화', 土:'토', 金:'금', 水:'수' };
// 오행 한글 설명
const ON_DESC = {
  ko:{ 木:'나무 기운', 火:'불 기운', 土:'흙 기운', 金:'쇠 기운', 水:'물 기운' },
  en:{ 木:'Wood energy', 火:'Fire energy', 土:'Earth energy', 金:'Metal energy', 水:'Water energy' },
  zh:{ 木:'木の能量', 火:'火の能量', 土:'土の能量', 金:'金の能量', 水:'水の能量' },
  ja:{ 木:'木の気',   火:'火の気',   土:'土の気',   金:'金の気',   水:'水の気' },
};

