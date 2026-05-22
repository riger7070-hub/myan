// M;Y 安 — effect.js  (오행 파티클 버스트 · 강화판)
// ────────────────────────────────────────────────────────────
// v2 변경사항:
//   - 파티클 120개 (기존 40개)
//   - shadowBlur 글로우 효과
//   - 중력(gravity) + 공기저항(drag) 물리 적용
//   - 원형 + 별(sparkle) 혼합 형태
//   - 초기 방사형 플래시 연출
//   - 크기·속도·수명 랜덤 분산 강화

const OHAENG_COLORS = {
  '木': '#4bc87a',
  '火': '#e05a4a',
  '土': '#d4a040',
  '金': '#c8d4e0',
  '水': '#5aa8e0',
};
const OHAENG_GLOW = {
  '木': 'rgba(75,200,122,',
  '火': 'rgba(224,90,74,',
  '土': 'rgba(212,160,64,',
  '金': 'rgba(200,212,224,',
  '水': 'rgba(90,168,224,',
};

window.M_Effect = {
  /**
   * @param {string|null} targetElementId  파티클 spawn 기준 요소 ID (null이면 화면 중앙)
   * @param {string}      ohaengType       오행 키 ('木'|'火'|'土'|'金'|'水')
   */
  spawnParticles(targetElementId, ohaengType) {
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
      position:      'fixed',
      top:           '0',
      left:          '0',
      width:         '100%',
      height:        '100%',
      pointerEvents: 'none',
      zIndex:        '9998',
    });
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = window.innerWidth  * dpr;
    canvas.height = window.innerHeight * dpr;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const W = window.innerWidth;
    const H = window.innerHeight;

    // 스폰 기준점
    let ox = W / 2, oy = H / 2;
    if (targetElementId) {
      const el = document.getElementById(targetElementId);
      if (el) {
        const r = el.getBoundingClientRect();
        ox = r.left + r.width  / 2;
        oy = r.top  + r.height / 2;
      }
    }

    const color    = OHAENG_COLORS[ohaengType] || '#c9a96e';
    const glowBase = OHAENG_GLOW[ohaengType]   || 'rgba(201,169,110,';

    // ── 초기 방사형 플래시 ──
    let flashAlpha = 0.55;
    function drawFlash() {
      if (flashAlpha <= 0) return;
      const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, 180);
      grad.addColorStop(0,   glowBase + flashAlpha + ')');
      grad.addColorStop(0.4, glowBase + (flashAlpha * 0.3) + ')');
      grad.addColorStop(1,   glowBase + '0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      flashAlpha -= 0.045;
    }

    // ── 파티클 생성 ──
    function mkParticle(i) {
      const isStar    = Math.random() < 0.3;          // 30%는 별 모양
      const speed     = Math.random() * 18 + 6;       // 6~24
      const angle     = Math.random() * Math.PI * 2;
      const lifespan  = Math.random() * 0.4 + 0.6;   // 0.6~1.0 (수명 배율)
      return {
        x:       ox,
        y:       oy,
        vx:      Math.cos(angle) * speed,
        vy:      Math.sin(angle) * speed - (Math.random() * 4), // 위쪽 편향
        r:       isStar ? Math.random() * 3 + 2 : Math.random() * 5 + 1.5,
        alpha:   1,
        decay:   (0.008 + Math.random() * 0.01) / lifespan,
        gravity: 0.18 + Math.random() * 0.12,
        drag:    0.97 - Math.random() * 0.02,
        isStar,
        spin:    (Math.random() - 0.5) * 0.3,
        angle:   Math.random() * Math.PI * 2,
      };
    }
    const particles = Array.from({ length: 120 }, mkParticle);

    // ── 별(sparkle) 그리기 ──
    function drawStar(ctx, x, y, r, angle) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r * 2.2, Math.sin(a) * r * 2.2);
      }
      ctx.lineWidth   = r * 0.7;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.restore();
    }

    // ── 메인 루프 ──
    function draw() {
      ctx.clearRect(0, 0, W, H);
      drawFlash();

      let alive = false;

      for (const p of particles) {
        p.vx    *= p.drag;
        p.vy    *= p.drag;
        p.vy    += p.gravity;
        p.x     += p.vx;
        p.y     += p.vy;
        p.alpha -= p.decay;
        p.angle += p.spin;
        if (p.alpha <= 0) continue;
        alive = true;

        ctx.globalAlpha  = p.alpha;
        ctx.shadowColor  = color;
        ctx.shadowBlur   = p.r * 5;

        if (p.isStar) {
          drawStar(ctx, p.x, p.y, p.r, p.angle);
        } else {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;

      if (alive || flashAlpha > 0) {
        requestAnimationFrame(draw);
      } else {
        canvas.remove();
      }
    }
    draw();
  },
};
