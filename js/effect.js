// M;Y 安 — effect.js  (오행 파티클 버스트)
// ────────────────────────────────────────────────────────────
// 버그 수정 내역 (원본 대비):
//   1. position:'absolute' → 'fixed'  (스크롤해도 화면 전체 커버)
//   2. 종료 조건: particles[0].alpha > 0 → 전체 파티클 alive 체크
//   3. targetElementId 실제 좌표에서 파티클 spawn (미사용 파라미터 수정)
//   4. zIndex: '9998' 추가 (UI 위에 렌더)
//   5. canvas.width/height를 style이 아닌 attribute로 설정 (해상도 불일치 방지)

const OHAENG_COLORS = {
  '木': '#4bc87a',
  '火': '#e05a4a',
  '土': '#d4a040',
  '金': '#a0aab4',
  '水': '#5aa8e0',
};

window.M_Effect = {
  /**
   * @param {string|null} targetElementId  파티클 spawn 기준 요소 ID (null이면 화면 중앙)
   * @param {string}      ohaengType       오행 키 ('木'|'火'|'土'|'金'|'水')
   */
  spawnParticles(targetElementId, ohaengType) {
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
      position:      'fixed',   // ✅ fixed: 스크롤 위치 무관하게 전체 화면 커버
      top:           '0',
      left:          '0',
      width:         '100%',
      height:        '100%',
      pointerEvents: 'none',
      zIndex:        '9998',    // ✅ UI 최상단 위
    });
    canvas.width  = window.innerWidth;   // ✅ attribute로 설정 (해상도 정확)
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);

    // ✅ targetElementId 실제로 사용 — 요소 중심을 spawn 위치로
    let ox = canvas.width / 2;
    let oy = canvas.height / 2;
    if (targetElementId) {
      const el = document.getElementById(targetElementId);
      if (el) {
        const r = el.getBoundingClientRect();
        ox = r.left + r.width  / 2;
        oy = r.top  + r.height / 2;
      }
    }

    const color = OHAENG_COLORS[ohaengType] || '#c9a96e';
    const particles = Array.from({ length: 40 }, () => ({
      x:     ox,
      y:     oy,
      vx:    (Math.random() - 0.5) * 12,
      vy:    (Math.random() - 0.5) * 12,
      r:     Math.random() * 2.5 + 1,
      alpha: 1,
    }));

    const ctx = canvas.getContext('2d');

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;                 // ✅ 전체 파티클 생존 여부 추적
      for (const p of particles) {
        p.x     += p.vx;
        p.y     += p.vy;
        p.alpha -= 0.018;
        if (p.alpha <= 0) continue;
        alive = true;
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle   = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (alive) {
        requestAnimationFrame(draw);
      } else {
        canvas.remove();                 // ✅ 모든 파티클 소멸 시 canvas 정리
      }
    }
    draw();
  },
};
