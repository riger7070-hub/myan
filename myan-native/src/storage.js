import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  USER:         'myan_user',
  ID_TOKEN:     'myan_id_token',
  LOGGED_IN:    'myan_logged_in',
  SIGNED_OUT:   'myan_signed_out',
  LANG:         'myan_lang',
  THEME:        'myan_theme',
  CHAT_MODE:    'myan_chat_mode',
  CHAT_HIST:    'myan_chat_hist',
  OHAENG:       'myan_ohaeng',
};

export { KEYS };

export async function getItem(key) {
  try { return await AsyncStorage.getItem(key); }
  catch { return null; }
}

export async function setItem(key, value) {
  try { await AsyncStorage.setItem(key, String(value)); }
  catch {}
}

export async function removeItem(key) {
  try { await AsyncStorage.removeItem(key); }
  catch {}
}

export async function getJSON(key) {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}

export async function setJSON(key, value) {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); }
  catch {}
}

// ── 유저 프로필 ──────────────────────────────────────────────────────
export async function getUser()          { return getJSON(KEYS.USER); }
export async function setUser(u)         { return setJSON(KEYS.USER, u); }

// ── 로그인 상태 ──────────────────────────────────────────────────────
export async function isLoggedIn()       { return (await getItem(KEYS.LOGGED_IN)) === 'true'; }
export async function setLoggedIn(v)     { return setItem(KEYS.LOGGED_IN, v ? 'true' : 'false'); }

// ── ID 토큰 ──────────────────────────────────────────────────────────
export async function getIdToken()       { return getItem(KEYS.ID_TOKEN); }
export async function setIdToken(t)      { return setItem(KEYS.ID_TOKEN, t); }
export async function clearIdToken()     { return removeItem(KEYS.ID_TOKEN); }

// ── 언어 ─────────────────────────────────────────────────────────────
export async function getLang()          { return (await getItem(KEYS.LANG)) || 'ko'; }
export async function setLang(l)         { return setItem(KEYS.LANG, l); }

// ── 채팅 히스토리 ────────────────────────────────────────────────────
export async function getChatHist()      { return getJSON(KEYS.CHAT_HIST); }
export async function setChatHist(h)     { return setJSON(KEYS.CHAT_HIST, h); }
export async function getChatMode()      { return getItem(KEYS.CHAT_MODE); }
export async function setChatMode(m)     { return setItem(KEYS.CHAT_MODE, m); }
export async function clearChat()        {
  await removeItem(KEYS.CHAT_HIST);
  await removeItem(KEYS.CHAT_MODE);
}

// ── 로그아웃 (전체 세션 정리) ─────────────────────────────────────────
export async function clearSession() {
  await AsyncStorage.multiRemove([
    KEYS.ID_TOKEN, KEYS.LOGGED_IN, KEYS.CHAT_HIST, KEYS.CHAT_MODE,
  ]);
  await setItem(KEYS.SIGNED_OUT, 'true');
}

// ── 회원 탈퇴 (전체 데이터 정리) ─────────────────────────────────────
export async function clearAll() {
  await AsyncStorage.multiRemove(Object.values(KEYS));
  await setItem(KEYS.SIGNED_OUT, 'true');
}
