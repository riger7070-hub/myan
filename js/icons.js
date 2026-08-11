// 콘텐츠 아이콘 — 자동 생성 파일. 직접 고치지 말 것.
//
// 원본은 mini/src/icons.js 다. 고쳤으면 아래를 돌려 다시 만들고 함께 커밋한다.
//   node tools/build-web-icons.mjs
//
// 웹은 <script src> 로 읽는 고전 스크립트라 import/export 를 쓸 수 없다.
// 그래서 같은 내용을 전역으로 노출한다.

const S = (body) =>
  `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
     aria-hidden="true">${body}</svg>`;

const ICONS = {
  // ── 사주로 보는 나 ──
  // 대운: 열 해마다 굽이치는 물결
  daeun: S(`<path d="M2 9c2-2.2 4-2.2 6 0s4 2.2 6 0 4-2.2 6 0"/>
            <path d="M2 15c2-2.2 4-2.2 6 0s4 2.2 6 0 4-2.2 6 0" opacity=".55"/>`),
  // 이름 풀이: 붓과 획
  name: S(`<path d="M4 20c3.5-.6 5.4-2 8.2-4.8L19 8.4a2 2 0 0 0-2.8-2.8L9.4 12.4C6.6 15.2 5.2 17.1 4 20Z"/>
           <path d="M14.5 7.5 17 10"/>`),
  // 관상·손금: 펼친 손바닥
  photo: S(`<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11"/>
            <path d="M12 10.5V4.5a1.5 1.5 0 0 1 3 0V11"/>
            <path d="M15 11V6.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.7a5 5 0 0 1-3.7-1.7L5 16"/>
            <path d="M9 11V9a1.5 1.5 0 0 0-3 0v5"/>`),
  // 오행 유형: 다섯 점이 도는 원
  typecompat: S(`<circle cx="12" cy="4.5" r="1.6"/><circle cx="19.1" cy="9.7" r="1.6"/>
                 <circle cx="16.4" cy="18" r="1.6"/><circle cx="7.6" cy="18" r="1.6"/>
                 <circle cx="4.9" cy="9.7" r="1.6"/>
                 <path d="M12 6.1 19.1 8.1M19.1 11.3 16.6 16.4M14.9 18 9.1 18M7.4 16.4 4.9 11.3M4.9 8.1 12 6.1" opacity=".5"/>`),
  // 라이프패스: 길과 숫자의 마디
  numerology: S(`<path d="M6 21c0-4 3-5 6-5s6-1 6-5-3-5-6-5"/>
                 <circle cx="12" cy="6" r="1.3"/><circle cx="12" cy="16" r="1.3"/>
                 <path d="M9.5 3.5 12 6l2.5-2.5"/>`),

  // ── 때를 고르다 ──
  // 택일: 달력에 표시된 하루
  takil: S(`<rect x="3.5" y="5" width="17" height="15" rx="2.5"/>
            <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/>
            <circle cx="12" cy="14.5" r="2.2"/>`),
  // 궁합 시기: 겹쳐진 두 고리
  compat: S(`<circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/>`),
  // 토정비결: 접힌 책력
  tojeong: S(`<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5Z"/>
              <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5Z"/>
              <path d="M8.5 7.5h6M8.5 11h4"/>`),

  // ── 물어보는 점 ──
  // 타로: 겹친 두 장의 카드
  tarot: S(`<rect x="8.5" y="3.5" width="11" height="15" rx="1.8"/>
            <path d="M6 6.5 4.9 7A1.8 1.8 0 0 0 4 9.4l3.4 9.4a1.8 1.8 0 0 0 2.3 1l1.1-.4"/>
            <path d="M14 8.5l1 2.2 2.2.3-1.6 1.6.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.6 2.2-.3Z"/>`),
  // 주역: 양효와 음효
  iching: S(`<path d="M4 6h16M4 12h6.5M13.5 12H20M4 18h16"/>`),
  // 룬: 새겨진 문자
  rune: S(`<path d="M8 4v16M8 4l8 5-8 5"/>`),
  // 꿈해몽: 초승달과 별
  dream: S(`<path d="M20 14.5A8 8 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>
            <path d="M17 4.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6Z"/>`),

  // ── 오늘의 운세 ──
  // 오늘의 운세: 떠오르는 해
  today: S(`<path d="M3.5 18h17"/><path d="M6.5 18a5.5 5.5 0 0 1 11 0"/>
            <path d="M12 4v2M5.6 6.6l1.4 1.4M18.4 6.6 17 8"/>`),
  // 천궁도: 궤도를 도는 별
  astro: S(`<circle cx="12" cy="12" r="3"/>
            <ellipse cx="12" cy="12" rx="9.5" ry="4.5" transform="rotate(-25 12 12)"/>
            <circle cx="19.4" cy="8.2" r="1.2" fill="currentColor" stroke="none"/>`),
  // 띠·별자리: 이어진 별자리
  zodiac: S(`<circle cx="5.5" cy="7" r="1.3"/><circle cx="12" cy="4.5" r="1.3"/>
             <circle cx="17.5" cy="9.5" r="1.3"/><circle cx="14" cy="16" r="1.3"/>
             <circle cx="7" cy="18" r="1.3"/>
             <path d="M6.7 6.6 10.8 5M13.2 5.3l3.5 3.2M16.8 10.7 14.7 14.7M12.8 16.5 8.2 17.7M6.6 16.7 5.8 8.3" opacity=".55"/>`),
  // 주제별 운세: 여러 갈래로 나뉘는 길
  topic: S(`<path d="M12 21V11"/><path d="M12 11 6 5M12 11l6-6"/>
            <circle cx="5.2" cy="4.2" r="1.5"/><circle cx="18.8" cy="4.2" r="1.5"/>
            <circle cx="12" cy="21" r="1.2" fill="currentColor" stroke="none"/>`),
  // 럭키 아이템: 네잎 매듭
  lucky: S(`<path d="M12 12c0-2.5-1.2-4-3-4s-3 1.3-3 3 1.5 3 6 1Z"/>
            <path d="M12 12c2.5 0 4-1.2 4-3s-1.3-3-3-3-3 1.5-1 6Z"/>
            <path d="M12 12c0 2.5 1.2 4 3 4s3-1.3 3-3-1.5-3-6-1Z"/>
            <path d="M12 12c-2.5 0-4 1.2-4 3s1.3 3 3 3 3-1.5 1-6Z"/>
            <path d="M12 12 8.5 20" opacity=".6"/>`),
  // 내 사주 풀이: 펼친 두루마리
  saju: S(`<path d="M6 4h11a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2Z"/>
           <path d="M6 4a2 2 0 0 0-2 2v1.5h2M9.5 9h6M9.5 12.5h6M9.5 16h3.5"/>`),
  // 산가지: 흩어진 산가지
  stick: S(`<path d="M5 20 9 4M11 20l1.6-16M17.5 20 15 4.5"/><path d="M4 12h16" opacity=".5"/>`),

  // ── 토큰 받기 ──
  checkin: S(`<rect x="3.5" y="5" width="17" height="15" rx="2.5"/>
              <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/><path d="M9 14.5l2 2 4-4"/>`),
  quiz: S(`<circle cx="12" cy="12" r="8.5"/>
           <path d="M9.7 9.6a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1.1 1-1.1 1.8v.3"/>
           <circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>`),
  pop: S(`<path d="M12 3.5c3.6 0 6.5 3 6.5 6.7 0 4-3.2 6.6-6.5 8.3-3.3-1.7-6.5-4.3-6.5-8.3C5.5 6.5 8.4 3.5 12 3.5Z"/>
          <path d="M10.6 18.5h2.8l-1.4 2.3Z"/>
          <path d="M9.6 8.4a2.8 2.8 0 0 1 2-1.9" opacity=".6"/>`),
  ad: S(`<rect x="3" y="5" width="18" height="12.5" rx="2.5"/>
         <path d="M10.3 9.4l4.4 2.4-4.4 2.4Z"/><path d="M8.5 21h7"/>`),
  charge: S(`<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 10a2.5 2.5 0 0 1 2.5-2.5h.4a2.1 2.1 0 0 1 0 4.2h-.8a2.1 2.1 0 0 0 0 4.3h.4A2.5 2.5 0 0 0 14.5 14"/>`),

  // ── 분류 머리 ──
  secMe:     S(`<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a4.25 4.25 0 0 1 0 8.5 4.25 4.25 0 0 0 0 8.5"/>`),
  secTiming: S(`<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.2l3.2 2"/>`),
  secAsk:    S(`<rect x="8.5" y="3.5" width="11" height="15" rx="1.8"/>
                <path d="M6 6.5 4.9 7A1.8 1.8 0 0 0 4 9.4l3.4 9.4a1.8 1.8 0 0 0 2.3 1l1.1-.4"/>`),
  secDaily:  S(`<path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9Z"/>
                <path d="M18.5 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8Z" opacity=".6"/>`),
  secGift:   S(`<rect x="3.5" y="9" width="17" height="11.5" rx="2"/><path d="M3.5 13.5h17M12 9v11.5"/>
                <path d="M12 9S10.6 4.5 8.4 4.5a2.2 2.2 0 0 0 0 4.5Z"/>
                <path d="M12 9s1.4-4.5 3.6-4.5a2.2 2.2 0 0 1 0 4.5Z"/>`),

  // 배우자궁: 마주 보는 두 사람 사이의 매듭
  spouse: S(`<circle cx="7" cy="8" r="2.6"/><circle cx="17" cy="8" r="2.6"/>
             <path d="M3 19a4 4 0 0 1 8 0M13 19a4 4 0 0 1 8 0"/>
             <path d="M12 9.5c1.2 1 1.2 2.6 0 3.6-1.2-1-1.2-2.6 0-3.6Z"/>`),

  // ── 마이페이지 ──
  secProfile: S(`<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>`),
  // 반은 해, 반은 달 — 밝기 설정
  secScreen:  S(`<circle cx="12" cy="12" r="5"/>
                 <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>
                 <path d="M12 7a5 5 0 0 0 0 10Z" fill="currentColor" stroke="none" opacity=".55"/>`),
  secAccount: S(`<path d="M14 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14"/>
                 <path d="M17.5 8.5 21 12l-3.5 3.5M21 12h-9"/>`),

  // ── 웹 전용(미니앱에는 없는 콘텐츠) ──
  // 로또: 굴러 나온 공 셋
  lotto: S(`<circle cx="7.8" cy="15" r="4.2"/><circle cx="16.4" cy="15.8" r="3.2"/>
            <circle cx="13.4" cy="7.6" r="3.6"/>`),
  // 오늘의 행운: 복주머니
  quickFortune: S(`<path d="M8.4 9h7.2l2.5 4.1a5.4 5.4 0 0 1-4.6 8.1h-3a5.4 5.4 0 0 1-4.6-8.1Z"/>
                   <path d="M9.2 9c0-2 1.2-3.1 2.8-3.1S14.8 7 14.8 9"/>
                   <path d="M7.4 12.2h9.2"/>`),

  // ── 머리말 ──
  // 메뉴: 세 획. 길이를 달리해 두루마리를 편 듯 보이게 했다.
  menu: S(`<path d="M4 7h16M4 12h16M4 17h11"/>`),
  // 알리기: 한 점에서 두 갈래로 퍼지는 선
  share: S(`<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/>
            <circle cx="18" cy="18.5" r="2.5"/>
            <path d="M8.2 10.8 15.8 6.7M8.2 13.2l7.6 4.1"/>`),
};

/** 없는 이름을 불러도 화면이 비지 않게 빈 자리를 돌려준다. */
const icon = (name) => ICONS[name] || S('<circle cx="12" cy="12" r="8.5" opacity=".4"/>');

// 전역으로 내보낸다(app.js 가 icon() 을 그대로 부른다).
window.ICONS = ICONS;
window.icon = icon;

// HTML 에 직접 박아 둔 자리도 채운다: <span data-icon="secGift"></span>
// JS 로 그리는 목록과 달리 index.html 에 고정된 아이콘들이 여기 해당한다.
window.paintIcons = function (root) {
  (root || document).querySelectorAll('[data-icon]').forEach(function (el) {
    if (el.firstElementChild) return;               // 이미 채웠으면 그대로 둔다
    el.innerHTML = icon(el.getAttribute('data-icon'));
  });
};
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { window.paintIcons(); });
} else {
  window.paintIcons();
}
