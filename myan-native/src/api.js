import { API_BASE } from './constants';
import { authHeaders } from './auth';

async function req(path, options = {}) {
  const headers = await authHeaders();
  const res = await fetch(API_BASE + path, {
    headers,
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  return res;
}

// ── 토큰 잔액 조회 ────────────────────────────────────────────────────
export async function getUserTokens() {
  const res = await req('user-tokens');
  if (!res.ok) throw new Error('토큰 조회 실패');
  return res.json();
}

// ── 로컬 토큰 마이그레이션 ────────────────────────────────────────────
export async function migrateTokens(localTokens) {
  const res = await req('migrate-tokens', {
    method: 'POST',
    body: JSON.stringify({ tokens: localTokens }),
  });
  if (!res.ok) throw new Error('마이그레이션 실패');
  return res.json();
}

// ── 신규 가입 토큰 지급 ──────────────────────────────────────────────
export async function signupGrant() {
  const res = await req('signup-grant', { method: 'POST' });
  if (!res.ok) return null;
  return res.json();
}

// ── Gemini 채팅 ──────────────────────────────────────────────────────
export async function sendChat(mode, lang, contents) {
  const res = await req('chat', {
    method: 'POST',
    body: JSON.stringify({ mode, lang, contents }),
  });

  if (res.status === 401) throw { noLogin: true };
  if (res.status === 402 || res.status === 403) throw { noToken: true };
  if (res.status === 429) throw { rateLimited: true };

  const data = await res.json();
  if (data?.error) throw { apiError: true, msg: data.error.message };
  return data;
}

// ── 결제 검증 (Toss → 웹뷰 처리 후 네이티브에서 확인) ────────────────
export async function verifyPayment(paymentKey, orderId, amount) {
  const res = await req('verify-payment', {
    method: 'POST',
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  return res.json();
}

// ── 회원 탈퇴 ────────────────────────────────────────────────────────
export async function withdrawAccount() {
  const res = await req('withdraw', { method: 'DELETE' });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error?.message || '탈퇴 처리 오류');
  }
  return res.json();
}
