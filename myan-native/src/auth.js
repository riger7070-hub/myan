import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from './constants';
import * as storage from './storage';

let _initialized = false;

export function initGoogle() {
  if (_initialized) return;
  GoogleSignin.configure({
    webClientId:  GOOGLE_WEB_CLIENT_ID,
    iosClientId:  GOOGLE_IOS_CLIENT_ID,
    offlineAccess: false,
  });
  _initialized = true;
}

// Google Sign-In → ID 토큰 반환
export async function signInWithGoogle() {
  initGoogle();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const userInfo = await GoogleSignin.signIn();
  const { idToken } = await GoogleSignin.getTokens();
  return { idToken, user: userInfo.user };
}

// 현재 세션에서 ID 토큰 가져오기 (만료 시 자동 갱신)
export async function getValidIdToken() {
  try {
    initGoogle();
    const isSignedIn = await GoogleSignin.isSignedIn();
    if (!isSignedIn) return null;
    const { idToken } = await GoogleSignin.getTokens();
    return idToken;
  } catch {
    return null;
  }
}

// 사이런트 로그인 (앱 시작 시 자동 로그인)
export async function silentSignIn() {
  try {
    initGoogle();
    const userInfo = await GoogleSignin.signInSilently();
    const { idToken } = await GoogleSignin.getTokens();
    return { idToken, user: userInfo.user };
  } catch (e) {
    if (e.code === statusCodes.SIGN_IN_REQUIRED) return null;
    return null;
  }
}

// 로그아웃
export async function signOut() {
  try {
    initGoogle();
    await GoogleSignin.revokeAccess();
    await GoogleSignin.signOut();
  } catch {}
  await storage.clearSession();
}

// Authorization 헤더 생성
export async function authHeaders() {
  const token = await getValidIdToken() || await storage.getIdToken();
  return token
    ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}
