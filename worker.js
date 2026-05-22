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

// HMAC-SHA256 서명 검증
async function hmacVerify(secret, data, signature) {
  const expected = await hmacSign(secret, data);
  return expected === signature;
}

// 인메모리 속도 제한 (isolate당, 1차 빠른 거부용)
const _rateLimit = new Map();
function checkRateLimit(key, limitMs) {
  const now = Date.now();
  const last = _rateLimit.get(key) || 0;
  if (now - last < limitMs) return false;
  _rateLimit.set(key, now);
  // 메모리 누수 방지: 1000개 초과 시 오래된 항목 정리
  if (_rateLimit.size > 1000) {
    const cutoff = now - limitMs * 2;
    for (const [k, v] of _rateLimit) { if (v < cutoff) _rateLimit.delete(k); }
  }
  return true;
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

// DB 초기화 (워커 인스턴스 당 최초 1회만 실행)
let _dbReady = false;
async function ensureDB(env) {
  if (_dbReady || !env.DB) return;
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
    );
    CREATE INDEX IF NOT EXISTS idx_pr_email_status ON payment_requests (user_email, status);
    CREATE INDEX IF NOT EXISTS idx_pr_created ON payment_requests (created_at DESC);
  `).catch(() => {});
  _dbReady = true;
}

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname.replace(/\/$/, '') || '/';
    const method = request.method;

    if (method === 'OPTIONS') {
      return cors(null, 204);
    }

    await ensureDB(env);

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
    if (path === '/api/payment/verify' && method === 'POST') return handlePaymentVerify(request, env);
    if (path === '/withdraw' && method === 'DELETE') return handleWithdraw(request, env);

    // 루트 경로: Worker Assets에서 index.html 직접 서빙 (보안 헤더 주입)
    if (method === 'GET') {
      const res = await env.ASSETS.fetch(request);
      return addSecurityHeaders(res);
    }

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
    if (idToken.length > 4096) return cors(JSON.stringify({ error: { message: '토큰 형식이 올바르지 않습니다.' } }), 400);

    const email = await getEmailFromToken(idToken, env);
    if (!email) return cors(JSON.stringify({ error: { message: '유효하지 않거나 만료된 토큰입니다.' } }), 401);
    if (!env.DB) return cors(JSON.stringify({ error: { message: '데이터베이스가 연결되지 않았습니다.' } }), 500);

    // 1차: 인메모리 빠른 거부 (3초 이내 연속 요청 차단)
    if (!checkRateLimit(`chat:${email}`, 3000)) {
      return cors(JSON.stringify({ error: { message: '요청이 너무 빠릅니다. 잠시 후 다시 시도해주세요.' } }), 429);
    }
    // 2차: Cloudflare 분산 Rate Limit (분당 10회 — 전 인스턴스 통합)
    if (!await cfRateLimit(env.RL_CHAT, email)) {
      return cors(JSON.stringify({ error: { message: '분당 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' } }), 429);
    }

    let body;
    try { 
      body = await request.json(); 
    } catch { 
      return cors(JSON.stringify({ error: { message: '올바르지 않은 JSON 요청 형식입니다.' } }), 400); 
    }
    const { mode, lang, contents } = body;

    // contents 검증: 개수 + 총 텍스트 크기 (과대 payload 방지, max 32KB)
    if (!Array.isArray(contents) || contents.length > 50) {
      return cors(JSON.stringify({ error: { message: '올바르지 않은 요청 형식입니다.' } }), 400);
    }
    const totalChars = contents.reduce((s, c) =>
      s + (c?.parts?.reduce((ps, p) => ps + (typeof p?.text === 'string' ? p.text.length : 0), 0) || 0), 0);
    if (totalChars > 32768) {
      return cors(JSON.stringify({ error: { message: '요청 내용이 너무 깁니다.' } }), 400);
    }

    // ── 원자적 토큰 차감 (Race Condition 방지) ──
    // Conditional INSERT: 잔액 >= 1 일 때만 -1 행이 삽입됨 (SQLite 원자 연산)
    const useId = `use_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const deductResult = await env.DB.prepare(
      `INSERT INTO payment_requests (id, user_email, pkg, amount, tokens, status, approved_at)
       SELECT ?, ?, 'gemini_use', 0, -1, 'approved', unixepoch()
       WHERE (SELECT COALESCE(SUM(tokens), 0) FROM payment_requests WHERE user_email = ? AND status = 'approved') >= 1`
    ).bind(useId, email, email).run();

    // rows_written === 0 이면 잔액 부족 (원자적으로 검증됨)
    if (!deductResult.meta?.rows_written) {
      return cors(JSON.stringify({ error: { message: '보유하신 토큰이 부족합니다. 충전 후 이용해주세요.' } }), 403);
    }

    const il = ilchin();
    const on = ON[lang || 'ko'];
    
    let langInstruct = '한국어로 답변해 주세요.';
    if (lang === 'en') langInstruct = 'Please respond in English.';
    if (lang === 'zh') langInstruct = '请用简体中文回答。';
    if (lang === 'ja') langInstruct = '必ず日本語でお答えください。';

    const basePrompt = `Ilchin today: ${CG[il.ci]}${JJ[il.ji]} · Primary Ohaeng: ${on[il.o]} · Secondary: ${on[il.jo]}\n${langInstruct}\nRules: Use "energy reading / flow / prescription" — never "fortune-telling / fate / divination".\nNo definitive predictions. Frame negatives as areas for balance. No markdown bold. End with ONE tag: #木 #火 #土 #金 or #水`;

    const fallbackPrompt = `\nCritical Safe Guide: If the user asks general trivia, cooking, coding, or any topic completely unrelated to Saju, Ohaeng, and daily energy flow, DO NOT freeze or throw a safety block. Instead, kindly reply in the requested language that you are the Ohaeng Energy Master of M;Y 安, and gently guide them to ask about their spiritual energy reading or destiny elements.`;

    // solo 모드: 응답 전체를 JSON 구조로 반환 (responseMimeType: application/json)
    const ohaengJsonInstruction = `\n\nOUTPUT FORMAT (MANDATORY): Return ONLY a valid JSON object — no markdown, no code block, no extra text. Use exactly this structure:\n{\"reading\":\"<your full warm poetic saju reading here, including the #tag>\",\"ohaeng\":{\"木\":N,\"火\":N,\"土\":N,\"金\":N,\"水\":N}}\nFor ohaeng: each N is an integer 0–100, all five must sum to exactly 100. Base on user's actual Saju pillars (year/month/day/hour stems and branches). If birth info is incomplete, estimate from available data.`;

    const sysText = (mode === 'solo')
      ? `You are the Ohaeng Energy Master of M;Y 安.\n${basePrompt}${fallbackPrompt}\n\nMethod: (1) Identify Saju Ohaeng from birth date/time. (2) Analyze harmony/conflict with today's Ilchin. (3) Conclude most needed Ohaeng. (4) Write warm poetic long-form reading. (5) Give one specific advice for today.${ohaengJsonInstruction}`
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
      generationConfig: { temperature: 0.75, maxOutputTokens: 3000, topP: 0.95, ...(mode === 'solo' ? { responseMimeType: 'application/json' } : {}) },
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

      // solo 모드: JSON 응답 파싱 → reading/ohaeng 분리
      if (mode === 'solo' && rawText) {
        let extracted = false;
        try {
          // 마크다운 코드블록 제거 후 파싱
          const jsonStr = rawText.replace(/^```json\s*/i, '').replace(/\s*```\s*$/, '').trim();
          const parsed = JSON.parse(jsonStr);
          // ohaeng 객체 추출 (필수)
          if (parsed.ohaeng && typeof parsed.ohaeng === 'object') {
            data._ohaeng = parsed.ohaeng;
            // reading 키 다양한 이름 허용 (LLM이 key명을 바꾸는 경우 대응)
            const reading = parsed.reading || parsed.message || parsed.content
              || parsed.text || parsed.result
              || Object.entries(parsed)
                  .filter(([k]) => k !== 'ohaeng')
                  .map(([, v]) => v)
                  .find(v => typeof v === 'string' && v.length > 10)
              || '';
            if (reading) {
              data.candidates[0].content.parts[0].text = reading;
              extracted = true;
            }
          }
        } catch { /* not valid JSON — fall through to regex */ }

        if (!extracted) {
          // fallback: regex로 ohaeng 블록 추출
          const m = rawText.match(/"ohaeng"\s*:\s*(\{[^}]+\})/);
          if (m) {
            try { data._ohaeng = JSON.parse(m[1]); } catch {}
          }
          // JSON 전체 블록 제거 후 reading 텍스트만 남김
          // 빈 문자열이 되면 원본 rawText 유지 (최소한 어떤 텍스트라도 표시)
          const stripped = rawText
            .replace(/^```json\s*/gi, '').replace(/\s*```\s*$/g, '')
            .replace(/^\s*\{[\s\S]*?"ohaeng"\s*:\s*\{[^}]+\}\s*\}\s*$/m, '')
            .replace(/\{[^{}]*"ohaeng"\s*:\s*\{[^}]+\}[^{}]*\}/g, '')
            .trim();
          data.candidates[0].content.parts[0].text = stripped || rawText;
        }
      }
    }

    return cors(JSON.stringify(data), 200);

  } catch (e) {
    return cors(JSON.stringify({ error: { message: '서버 오류가 발생했습니다.' } }), 500);
  }
}

// ════════════════════════════
//  토큰 핸들러 & 헬퍼 함수
// ════════════════════════════

async function getEmailFromToken(idToken, env) {
  try {
    // 1) 만료일 선행 체크 (빠른 거부 — 네트워크 절약)
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
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
  if (!await cfRateLimit(env.RL_API, email)) {
    return cors(JSON.stringify({ error: { message: '요청 한도를 초과했습니다.' } }), 429);
  }

  let body;
  try { body = await request.json(); } catch { return cors(JSON.stringify({ error: { message: '올바르지 않은 JSON 요청 형식입니다.' } }), 400); }

  const { id, pkg } = body;
  if (!id || !pkg) return cors(JSON.stringify({ error: { message: '필수 요청 파라미터가 누락되었습니다.' } }), 400);
  if (typeof id !== 'string' || id.length > 200) return cors(JSON.stringify({ error: { message: '올바르지 않은 결제 ID입니다.' } }), 400);
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
  const id    = url.searchParams.get('id');
  const token = url.searchParams.get('token');

  // HMAC 서명 검증 — URL에서 ADMIN_SECRET 완전 제거
  if (!id || !token || !await hmacVerify(env.ADMIN_SECRET, id, token)) {
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
  // HMAC 서명으로 승인 URL 생성 — ADMIN_SECRET을 URL에 직접 노출하지 않음
  const token = await hmacSign(env.ADMIN_SECRET, id);
  const approveUrl = `${workerBase}/admin/telegram-approve?id=${id}&token=${token}`;

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
//  포트원 V2 결제 검증 핸들러
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

    // paymentId만 클라이언트에서 수신 — pkg/amount/tokens는 서버에서 결정
    let body;
    try { body = await request.json(); } catch {
      return cors(JSON.stringify({ error: { message: '올바르지 않은 JSON 요청 형식입니다.' } }), 400);
    }
    const { paymentId } = body;
    if (!paymentId || typeof paymentId !== 'string' || paymentId.length > 200) {
      return cors(JSON.stringify({ error: { message: '올바르지 않은 결제 ID입니다.' } }), 400);
    }

    // 1. 포트원 V2 API로 결제 단독 조회 (위변조 방지)
    const verifyRes = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: `PortOne ${env.PORTONE_SECRET}` } }
    );
    if (!verifyRes.ok) {
      return cors(JSON.stringify({ error: { message: '포트원 결제 조회 실패' } }), 400);
    }
    const payment = await verifyRes.json();

    // 2. 결제 상태 확인
    if (payment.status !== 'PAID') {
      return cors(JSON.stringify({ error: { message: '결제가 완료되지 않았습니다.' } }), 400);
    }

    // 3. 서버 PKG_TABLE로 금액 → pkg/tokens 결정 (클라이언트 조작 원천 차단)
    const VERIFY_PKG_TABLE = {
      4900:  { pkg: 'small',  tokens: 30  },
      12900: { pkg: 'medium', tokens: 100 },
      29900: { pkg: 'large',  tokens: 300 },
    };
    const paidAmount = payment.amount?.total;
    const pkgEntry = VERIFY_PKG_TABLE[paidAmount];
    if (!pkgEntry) {
      return cors(JSON.stringify({ error: { message: '유효하지 않은 결제 금액입니다.' } }), 400);
    }
    const { pkg: serverPkg, tokens: serverTokens } = pkgEntry;

    // 4. 중복 결제 방지 확인
    const dupCheck = await env.DB.prepare(
      'SELECT id FROM payment_requests WHERE id = ?'
    ).bind(paymentId).first();
    if (dupCheck) {
      return cors(JSON.stringify({ error: { message: '이미 처리된 결제입니다.' } }), 409);
    }

    // 5. 검증 통과 → D1 DB에 approved 상태로 기록 (서버 계산값 사용)
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`
      INSERT INTO payment_requests
        (id, user_email, pkg, amount, tokens, status, created_at, approved_at)
      VALUES (?, ?, ?, ?, ?, 'approved', ?, ?)
    `).bind(paymentId, email, serverPkg, paidAmount, serverTokens, now, now).run();

    // 6. 최신 잔액 계산 후 반환
    const balRes = await env.DB.prepare(`
      SELECT COALESCE(SUM(tokens), 0) AS balance
      FROM payment_requests
      WHERE user_email = ? AND status = 'approved'
    `).bind(email).first();

    return cors(JSON.stringify({
      success: true,
      balance: balRes ? balRes.balance : serverTokens
    }));

  } catch (err) {
    return cors(JSON.stringify({ error: { message: '결제 처리 중 오류가 발생했습니다.' } }), 500);
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

  // Content-Security-Policy (XSS 브라우저 차단)
  h.set('Content-Security-Policy', [
    "default-src 'self'",
    // 구글 로그인 + PortOne + QR 라이브러리 스크립트
    "script-src 'self' 'unsafe-inline' https://accounts.google.com https://cdnjs.cloudflare.com https://cdn.portone.io",
    // 인라인 스타일 + 구글 폰트
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // 구글 폰트 파일
    "font-src 'self' https://fonts.gstatic.com",
    // 이미지: self, data URI
    "img-src 'self' data: https:",
    // API 통신 허용 출처
    "connect-src 'self' https://oauth2.googleapis.com https://generativelanguage.googleapis.com https://api.portone.io https://script.google.com",
    // 구글 로그인 팝업 허용
    "frame-src https://accounts.google.com",
  ].join('; '));

  return new Response(response.body, { status: response.status, headers: h });
}

function cors(body, status = 200) {
  return new Response(body || null, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'https://myan.riger7070.workers.dev',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-secret, Authorization',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
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

    // 해당 이메일의 모든 결제/토큰 기록 삭제
    await env.DB.prepare(
      'DELETE FROM payment_requests WHERE user_email = ?'
    ).bind(email).run();

    return cors(JSON.stringify({ success: true, message: '회원 탈퇴가 완료되었습니다.' }), 200);
  } catch (e) {
    return cors(JSON.stringify({ error: { message: '탈퇴 처리 중 오류가 발생했습니다.' } }), 500);
  }
}