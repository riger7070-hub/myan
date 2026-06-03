// 일진 & 오행 계산 (웹 앱 로직 그대로 포팅)

const CG  = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const JJ  = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const CG_K = ['갑','을','병','정','무','기','경','신','임','계'];
const JJ_K = ['자','축','인','묘','진','사','오','미','신','유','술','해'];
const OE   = { 甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水' };

export const OHAENG_COLORS = {
  木: '#4a7c59', 火: '#c0392b', 土: '#b8860b', 金: '#7f8c8d', 水: '#2471a3',
};

export const OHAENG_NAMES = {
  ko: { 木:'목(木)',火:'화(火)',土:'토(土)',金:'금(金)',水:'수(水)' },
  en: { 木:'Wood',  火:'Fire', 土:'Earth',金:'Metal',水:'Water' },
  zh: { 木:'木',    火:'火',   土:'土',   金:'金',   水:'水'   },
  ja: { 木:'木',    火:'火',   土:'土',   金:'金',   水:'水'   },
};

// 오늘의 일진 계산
export function ilchin(date = new Date()) {
  const base  = new Date(1924, 0, 5); // 甲子일 기준
  const diff  = Math.floor((date - base) / 86400000);
  const ci    = ((diff % 10) + 10) % 10;
  const ji    = ((diff % 12) + 12) % 12;
  return { ci, ji, o: OE[CG[ci]], cg: CG[ci], jj: JJ[ji], cg_k: CG_K[ci], jj_k: JJ_K[ji] };
}

export function ilchinLabel(il, lang = 'ko') {
  const name = OHAENG_NAMES[lang]?.[il.o] || il.o;
  return `${il.cg}${il.jj}(${il.cg_k}${il.jj_k})일 · ${name}`;
}

// 음력 생년월일로 사주 팔자 간략 계산 (간지)
export function birthGanji(year, month, day) {
  const y = ((year - 4) % 60 + 60) % 60;
  const ci = y % 10;
  const ji = y % 12;
  return `${CG[ci]}${JJ[ji]}년`;
}
