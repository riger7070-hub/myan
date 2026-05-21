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

function ilchin() {
  const ref = new Date(2023,0,1); ref.setHours(0,0,0,0);
  const now = new Date(); now.setHours(0,0,0,0);
  const idx = ((44 + Math.round((now-ref)/864e5)) % 60 + 60) % 60;
  return { ci: idx%10, ji: idx%12, o: CGO[idx%10], jo: JJO[idx%12] };
}

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname.replace(/\/$/, '') || '/';
    const method = request.method;

    if (method === 'OPTIONS') {
      return cors(null, 204);
    }

    if (env.DB) {
      await env.DB.exec(`
        CREATE TABLE IF NOT EXISTS payment_requests (
          id          TEXT    PRIMARY KEY,
          user_email  TEXT    NOT NULL,
          pkg         TEXT    NOT NULL,
          amount      INTEGER NOT NULL DEFAULT 0,
          tokens      INTEGER NOT NULL DEFAULT 0,
          status      TEXT    NOT NULL DEFAULT 'pending',
          created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
          approved_at INTEGER
        )
      `).catch(() => {});
    }

    if (path === '/user-tokens' && method === 'GET') return handleUserTokens(request, env);
    if (path === '/migrate-tokens' && method === 'POST') return handleMigrateTokens(request, env);
    if (path === '/signup-grant' && method === 'POST') return handleSignupGrant(request, env);
    if (path === '/payment-request' && method === 'POST') return handlePaymentRequest(request, env);
    if (path === '/payment-status' && method === 'GET') return handlePaymentStatus(request, env);
    if (path === '/admin/payments' && method === 'GET') return handleAdminPayments(request, env);
    if (path === '/admin/approve' && method === 'POST') return handleAdminApprove(request, env);
    if (path === '/admin/telegram-approve' && method === 'GET') return handleTelegramApprove(request, env);
    if (path === '/admin/grant-tokens' && method === 'POST') return handleAdminGrantTokens(request, env);
    if (path === '/chat' && method === 'POST') return handleGeminiChat(request, env);

    return cors(JSON.stringify({ error: { message: 'Not Found' } }), 404);
  }
};

// ════════════════════════════
//  Gemini 핵심 핸들러 (버그 픽스 완료 버전)
// ════════════════════════════
async function handleGeminiChat(request, env) {
  try {
    const API_KEY = env.GEMINI_API_KEY;
    if (!API_KEY) {
      return cors(JSON.stringify({ error: { message: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' } }), 500);
    }

    const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);

    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않거나 만료된 토큰입니다.' } }), 401);
    if (!env.DB) return cors(JSON.stringify({ error: { message: '데이터베이스가 연결되지 않았습니다.' } }), 500);

    const balanceRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(tokens), 0) as total FROM payment_requests WHERE user_email = ? AND status = 'approved'`
    ).bind(email).first();

    const currentBalance = balanceRow?.total || 0;
    if (currentBalance < 1) {
      return cors(JSON.stringify({ error: { message: '보유하신 토큰이 부족합니다. 충전 후 이용해주세요.' } }), 403);
    }

    let body;
    try { 
      body = await request.json(); 
    } catch { 
      return cors(JSON.stringify({ error: { message: '올바르지 않은 JSON 요청 형식입니다.' } }), 400); 
    }
    const { mode, lang, contents } = body;

    // 선차감 행 진행
    const useId = `use_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       VALUES (?, ?, 'gemini_use', 0, -1, 'approved', unixepoch())`
    ).bind(useId, email).run();

    const il = ilchin();
    const on = ON[lang || 'ko'];
    
    let langInstruct = '한국어로 답변해 주세요.';
    if (lang === 'en') langInstruct = 'Please respond in English.';
    if (lang === 'zh') langInstruct = '请用简体中文回答。';
    if (lang === 'ja') langInstruct = '必ず日本語でお答えください。';

    const basePrompt = `Ilchin today: ${CG[il.ci]}${JJ[il.ji]} · Primary Ohaeng: ${on[il.o]} · Secondary: ${on[il.jo]}\n${langInstruct}\nRules: Use "energy reading / flow / prescription" — never "fortune-telling / fate / divination".\nNo definitive predictions. Frame negatives as areas for balance. No markdown bold. End with ONE tag: #木 #火 #土 #金 or #水`;

    const fallbackPrompt = `\nCritical Safe Guide: If the user asks general trivia, cooking, coding, or any topic completely unrelated to Saju, Ohaeng, and daily energy flow, DO NOT freeze or throw a safety block. Instead, kindly reply in the requested language that you are the Ohaeng Energy Master of M;Y 安, and gently guide them to ask about their spiritual energy reading or destiny elements.`;

    const sysText = (mode === 'solo')
      ? `You are the Ohaeng Energy Master of M;Y 安.\n${basePrompt}${fallbackPrompt}\n\nMethod: (1) Identify Saju Ohaeng from birth date/time. (2) Analyze harmony/conflict with today's Ilchin. (3) Conclude most needed Ohaeng. (4) Write warm poetic long-form reading. (5) Give one specific advice for today.`
      : `You are the Ohaeng Harmony Master of M;Y 安.\n${basePrompt}${fallbackPrompt}\n\nMethod: (1) Each person's Saju Ohaeng. (2) Sangsaeng/Sangguk dynamics. (3) Today's Ilchin impact on the relationship. (4) How they complement each other. (5) Suggest shared activity or topic. Long-form, warm tone. NEVER say "compatibility is bad".`;

    const geminiReqBody = {
      systemInstruction: { parts: [{ text: sysText }] },
      contents: contents,
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      ],
      generationConfig: { temperature: 0.75, maxOutputTokens: 3000, topP: 0.95 },
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiReqBody) }
    );

    // [케이스 A] 네트워크 단의 물리적 서버 호출 실패 발생 시 환불 처리
    if (!res.ok) {
      const refundId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.prepare(
        `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'gemini_refund', 0, 1, 'approved', unixepoch())`
      ).bind(refundId, email).run();

      const errorData = await res.json().catch(() => ({}));
      return cors(JSON.stringify({ error: { message: 'Gemini API 호출에 실패하여 토큰이 환불되었습니다.', details: errorData } }), res.status);
    }

    const data = await res.json();
    
    // 🌟 [버그 픽스 핵심 코드] HTTP는 200이지만 세이프티 필터 등으로 차단되어 대답 본문이 공백인 경우 환불 처리
    const cand = data?.candidates?.[0];
    const rawText = cand?.content?.parts?.[0]?.text;

    if (!rawText) {
      const safetyRefundId = `ref_safe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.prepare(
        `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
         VALUES (?, ?, 'gemini_safety_refund', 0, 1, 'approved', unixepoch())`
      ).bind(safetyRefundId, email).run();

      // 환불 완료된 잔액을 다시 계산해서 담아줌 (프론트 UI 자동 동기화 대응)
      const balRow = await env.DB.prepare(
        `SELECT COALESCE(SUM(tokens), 0) as total FROM payment_requests WHERE user_email = ? AND status = 'approved'`
      ).bind(email).first();
      data._tokens = balRow?.total || 0;
      
      return cors(JSON.stringify(data), 200);
    }

    // [케이스 B] 대답이 성공적으로 잘 수신되어 통과한 경우 잔액 최신화
    if (data.candidates) {
      const balRow = await env.DB.prepare(
        `SELECT COALESCE(SUM(tokens), 0) as total FROM payment_requests WHERE user_email = ? AND status = 'approved'`
      ).bind(email).first();
      data._tokens = balRow?.total || 0;
    }

    return cors(JSON.stringify(data), 200);

  } catch (e) {
    return cors(JSON.stringify({ error: { message: e.message } }), 500);
  }
}

// ════════════════════════════
//  토큰 핸들러 & 헬퍼 함수
// ════════════════════════════

async function getEmailFromToken(idToken, env) {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;

    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) { base64 += '='; }

    const binString = atob(base64);
    const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;

    return payload.email || null;
  } catch { return null; }
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
  if (!env.DB) return cors(JSON.stringify({ error: { message: '데이터베이스 연결 실패' } }), 500);

  let body;
  try { body = await request.json(); } catch { return cors(JSON.stringify({ error: { message: '올바르지 않은 JSON 요청 형식입니다.' } }), 400); }

  const localTokens = parseInt(body.tokens, 10) || 0;
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

  const id = `mig_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  await env.DB.prepare(
    `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status) VALUES (?, ?, 'migration', 0, ?, 'approved')`
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

  const id = `signup_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  await env.DB.prepare(
    `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status) VALUES (?, ?, 'signup_grant', 0, 3, 'approved')`
  ).bind(id, email).run();

  return cors(JSON.stringify({ ok: true, tokens: 3 }));
}

// ════════════════════════════
//  결제 핸들러
// ════════════════════════════

async function handlePaymentRequest(request, env) {
  const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!idToken) return cors(JSON.stringify({ error: { message: '인증 토큰이 누락되었습니다.' } }), 401);
  const email = await getEmailFromToken(idToken, env);
  if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않은 유저 세션입니다.' } }), 401);

  let body;
  try { body = await request.json(); } catch { return cors(JSON.stringify({ error: { message: '올바르지 않은 JSON 요청 형식입니다.' } }), 400); }

  const { id, pkg } = body;
  if (!id || !pkg) return cors(JSON.stringify({ error: { message: '필수 요청 파라미터가 누락되었습니다.' } }), 400);
  if (!env.DB) return cors(JSON.stringify({ error: { message: '데이터베이스 연결 실패' } }), 500);

  const PKG_TABLE = {
    small:  { amount: 4900,  tokens: 30  },
    medium: { amount: 12900, tokens: 100 },
    large:  { amount: 29900, tokens: 300 },
  };
  const pkgInfo = PKG_TABLE[pkg];
  if (!pkgInfo) return cors(JSON.stringify({ error: { message: '유효하지 않은 결제 패키지입니다.' } }), 400);

  const existing = await env.DB.prepare(
    'SELECT id FROM payment_requests WHERE id = ?'
  ).bind(id).first();
  if (existing) return cors(JSON.stringify({ ok: true, duplicate: true }));

  await env.DB.prepare(
    'INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, email, pkg, pkgInfo.amount, pkgInfo.tokens, 'pending').run();

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const workerBase = new URL(request.url).origin;
    await sendTelegramNotification(env, workerBase, { id, email, pkg, ...pkgInfo });
  }

  return cors(JSON.stringify({ ok: true, id }));
}

async function handlePaymentStatus(request, env) {
  const url = new URL(request.url);
  const id  = url.searchParams.get('id');
  if (!id) return cors(JSON.stringify({ error: { message: '결제 ID가 누락되었습니다.' } }), 400);
  if (!env.DB) return cors('{"status":"not_found"}');

  const row = await env.DB.prepare(
    'SELECT status, tokens FROM payment_requests WHERE id = ?'
  ).bind(id).first();

  if (!row) return cors('{"status":"not_found"}');
  return cors(JSON.stringify({ status: row.status, tokens: row.tokens }));
}

// ════════════════════════════
//  관리자 기능 구성
// ════════════════════════════

const ADMIN_EMAIL = 'riger7070@gmail.com';

async function isAdmin(request, env) {
  const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!idToken) return false;

  // 이중 잠금: 관리자 비밀키 헤더 검증
  const clientSecret = request.headers.get('x-admin-secret');
  if (!clientSecret || clientSecret !== env.ADMIN_SECRET) return false;

  // 이메일 일치 검증
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
  if (!email || isNaN(tokenCount) || tokenCount <= 0) {
    return cors(JSON.stringify({ error: { message: '올바른 이메일과 1개 이상의 토큰 수량을 입력해주세요.' } }), 400);
  }

  const id = `grant_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  await env.DB.prepare(
    `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
     VALUES (?, ?, ?, 0, ?, 'approved', unixepoch())`
  ).bind(id, email, note || 'admin_grant', tokenCount).run();

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: `🎁 관리자 직접 충전\n👤 ${email}\n✦ ${tokenCount}토큰 지급 완료\n📝 ${note || '사유 없음'}`,
      }),
    }).catch(() => {});
  }

  return cors(JSON.stringify({ ok: true, id, email, tokens: tokenCount }));
}

async function handleTelegramApprove(request, env) {
  const url    = new URL(request.url);
  const id     = url.searchParams.get('id');
  const secret = url.searchParams.get('secret');

  if (!secret || secret !== env.ADMIN_SECRET) {
    return htmlPage('❌ 인증 실패', '올바르지 않은 접근입니다.');
  }
  if (!id) return htmlPage('❌ 오류', '결제 ID가 없습니다.');
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: `✅ 승인 완료!\n👤 ${row.user_email}\n🎁 ${row.tokens}토큰 지급됨`,
      }),
    }).catch(() => {});
  }

  return htmlPage('✅ 승인 완료!', `${row.user_email} 님께 ${row.tokens}토큰이 지급됩니다.`);
}

async function sendTelegramNotification(env, workerBase, { id, email, pkg, amount, tokens }) {
  const PKG_LABEL = { small:'소 (30토큰)', medium:'중 (100토큰)', large:'대 (300토큰)' };
  const approveUrl = `${workerBase}/admin/telegram-approve?id=${id}&secret=${env.ADMIN_SECRET}`;

  const text =
    `💰 새 결제 요청\n\n` +
    `👤 ${email}\n` +
    `📦 ${PKG_LABEL[pkg] || pkg}  |  ${Number(amount).toLocaleString()}원\n` +
    `🎁 지급 예정: ${tokens}토큰\n\n` +
    `입금 확인 후 아래 버튼을 눌러 승인해 주세요.`;

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text,
      reply_markup: { inline_keyboard: [[{ text: '✅ 승인하기', url: approveUrl }]] },
    }),
  }).catch(() => {});
}

function htmlPage(title, desc) {
  return new Response(
    `<!DOCTYPE html><html><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
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
    <div class="box"><h1>${title}</h1><p>${desc}</p><div class="brand">M ; Y 安</div></div>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
  );
}

function cors(body, status = 200) {
  return new Response(body || null, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-secret, Authorization',
    },
  });
}