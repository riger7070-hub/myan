// M;Y 安 — Enhanced Notifications Module
// 재방문 유도 및 사용자 맞춤 알림 시스템

const NOTIFICATION_CONFIG = {
  defaultHour: 8,
  defaultMinute: 0,
  retentionDays: [3, 7, 14], // 재방문 알림 주기
};

// 알림 권한 요청
async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    // 환영 알림
    new Notification('M;Y 安', {
      body: '알림이 설정되었습니다. 매일 기운을 전해드릴게요. ✨',
      icon: '/icon-pwa-192-192.webp',
      badge: '/icon-pwa-192-192.webp',
      tag: 'myan-welcome',
    });

    // 분석 트래킹
    if (typeof Analytics !== 'undefined') {
      Analytics.trackFeature('notification_enabled');
    }

    // 기본 알림 스케줄 시작
    scheduleDailyNotification();
    return true;
  }
  return false;
}

// 사용자 지정 시간으로 일일 알림 스케줄
function scheduleDailyNotification(hour, minute) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  // 설정값 불러오기 또는 기본값 사용
  const notifHour = hour ?? parseInt(localStorage.getItem('myan_notif_hour') || NOTIFICATION_CONFIG.defaultHour);
  const notifMinute = minute ?? parseInt(localStorage.getItem('myan_notif_minute') || NOTIFICATION_CONFIG.defaultMinute);

  // 설정 저장
  localStorage.setItem('myan_notif_hour', notifHour);
  localStorage.setItem('myan_notif_minute', notifMinute);
  localStorage.setItem('myan_notif_enabled', 'true');

  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), notifHour, notifMinute, 0);

  // 이미 지난 시간이면 내일로
  if (next <= now) next.setDate(next.getDate() + 1);

  const delay = next - now;

  // 기존 타이머 클리어
  if (window._dailyNotifTimer) clearTimeout(window._dailyNotifTimer);

  window._dailyNotifTimer = setTimeout(() => {
    showDailyNotification();
    scheduleDailyNotification(); // 내일도 반복
  }, delay);
}

// 일일 알림 표시
function showDailyNotification() {
  if (Notification.permission !== 'granted') return;

  const messages = [
    '오늘의 일진과 오행 기운을 확인해 보세요.',
    '새로운 하루의 기운이 기다리고 있어요.',
    '오늘의 에너지 처방을 받아보세요.',
    '당신만의 오늘 리딩이 준비되었어요.',
  ];

  const body = messages[Math.floor(Math.random() * messages.length)];

  new Notification('M;Y 安 · 오늘의 기운', {
    body: body,
    icon: '/icon-pwa-192-192.webp',
    badge: '/icon-pwa-192-192.webp',
    tag: 'myan-daily',
    renotify: true,
  });

  // 마지막 알림 시간 기록
  localStorage.setItem('myan_last_notif', new Date().toISOString());
}

// 재방문 유도 알림 (미방문 사용자 대상)
function checkRetentionNotifications() {
  if (Notification.permission !== 'granted') return;

  const lastVisit = localStorage.getItem('myan_last_visit');
  if (!lastVisit) return;

  const daysSinceVisit = Math.floor((Date.now() - new Date(lastVisit)) / (1000 * 60 * 60 * 24));

  // 3일, 7일, 14일 미방문 시 알림
  if (NOTIFICATION_CONFIG.retentionDays.includes(daysSinceVisit)) {
    const alreadySent = localStorage.getItem(`myan_retention_${daysSinceVisit}`);
    if (alreadySent) return;

    let title, body;
    if (daysSinceVisit === 3) {
      title = 'M;Y 安이 그리워요';
      body = '3일 동안 오행 기운을 확인하지 않으셨네요. 오늘의 흐름을 놓치지 마세요!';
    } else if (daysSinceVisit === 7) {
      title = '일주일이 지났어요';
      body = '한 주 동안의 기운 변화를 확인해 보세요. 특별한 선물이 기다리고 있어요! 🎁';
    } else if (daysSinceVisit === 14) {
      title = '2주 만에 다시 만나요';
      body = '오랜만이에요! 그동안의 일진을 한 번에 확인하고 특별 토큰을 받아가세요.';
    }

    new Notification(title, {
      body: body,
      icon: '/icon-pwa-192-192.webp',
      badge: '/icon-pwa-192-192.webp',
      tag: `myan-retention-${daysSinceVisit}`,
      requireInteraction: true, // 사용자가 직접 닫을 때까지 유지
    });

    localStorage.setItem(`myan_retention_${daysSinceVisit}`, new Date().toISOString());

    // 분석 트래킹
    if (typeof Analytics !== 'undefined') {
      Analytics.trackFeature('retention_notification', {
        days_since_visit: daysSinceVisit
      });
    }
  }
}

// 특별한 날 알림 (명절, 절기, 특수 일진)
function checkSpecialDayNotifications() {
  if (Notification.permission !== 'granted') return;

  const today = new Date();
  const month = today.getMonth() + 1;
  const date = today.getDate();

  const specialDays = {
    '1-1': '새해 첫날',
    '2-4': '입춘 (立春)',
    '3-21': '춘분 (春分)',
    '5-5': '입하 (立夏)',
    '6-21': '하지 (夏至)',
    '8-8': '입추 (立秋)',
    '9-23': '추분 (秋分)',
    '11-8': '입동 (立冬)',
    '12-22': '동지 (冬至)',
  };

  const key = `${month}-${date}`;
  const specialDay = specialDays[key];

  if (specialDay) {
    const alreadySent = localStorage.getItem(`myan_special_${key}`);
    if (alreadySent === today.toISOString().slice(0, 10)) return;

    new Notification(`${specialDay} 특별 리딩`, {
      body: `오늘은 ${specialDay}입니다. 특별한 날의 기운을 확인해 보세요!`,
      icon: '/icon-pwa-192-192.webp',
      badge: '/icon-pwa-192-192.webp',
      tag: `myan-special-${key}`,
      requireInteraction: true,
    });

    localStorage.setItem(`myan_special_${key}`, today.toISOString().slice(0, 10));
  }
}

// 마지막 방문 시간 업데이트
function updateLastVisit() {
  localStorage.setItem('myan_last_visit', new Date().toISOString());
}

// 알림 시간 설정 UI
function showNotificationSettingsModal() {
  const currentHour = parseInt(localStorage.getItem('myan_notif_hour') || NOTIFICATION_CONFIG.defaultHour);
  const currentMinute = parseInt(localStorage.getItem('myan_notif_minute') || NOTIFICATION_CONFIG.defaultMinute);

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box" style="max-width: 380px; padding: 24px;">
      <div class="modal-title">알림 시간 설정</div>
      <div style="margin: 20px 0; font-size: 0.9rem; color: var(--text-dim);">
        매일 원하는 시간에 오늘의 기운을 받아보세요.
      </div>
      <div style="display: flex; gap: 12px; align-items: center; justify-content: center; margin: 24px 0;">
        <select id="notifHourSelect" style="
          padding: 12px;
          font-size: 1.1rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--card);
          color: var(--text);
          cursor: pointer;
        ">
          ${Array.from({length: 24}, (_, i) =>
            `<option value="${i}" ${i === currentHour ? 'selected' : ''}>${i}시</option>`
          ).join('')}
        </select>
        <span style="font-size: 1.2rem; color: var(--text-dim);">:</span>
        <select id="notifMinuteSelect" style="
          padding: 12px;
          font-size: 1.1rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--card);
          color: var(--text);
          cursor: pointer;
        ">
          ${[0, 15, 30, 45].map(m =>
            `<option value="${m}" ${m === currentMinute ? 'selected' : ''}>${m.toString().padStart(2, '0')}분</option>`
          ).join('')}
        </select>
      </div>
      <button onclick="Notifications.saveNotificationTime()" style="
        width: 100%;
        padding: 14px;
        background: linear-gradient(135deg, var(--gold), #d4a574);
        color: var(--bg);
        border: none;
        border-radius: 10px;
        font-weight: 600;
        cursor: pointer;
        font-size: 1rem;
        margin-bottom: 8px;
      ">저장하기</button>
      <button onclick="this.closest('.modal-overlay').remove()" style="
        width: 100%;
        padding: 12px;
        background: transparent;
        color: var(--text-dim);
        border: 1px solid var(--border);
        border-radius: 10px;
        cursor: pointer;
      ">취소</button>
    </div>
  `;
  document.body.appendChild(modal);
}

// 알림 시간 저장
function saveNotificationTime() {
  const hour = parseInt(document.getElementById('notifHourSelect').value);
  const minute = parseInt(document.getElementById('notifMinuteSelect').value);

  scheduleDailyNotification(hour, minute);

  // 모달 닫기
  document.querySelector('.modal-overlay').remove();

  // 토스트 표시
  if (typeof showToast === 'function') {
    showToast(`알림 시간이 ${hour}:${minute.toString().padStart(2, '0')}로 설정되었습니다.`);
  }

  // 분석 트래킹
  if (typeof Analytics !== 'undefined') {
    Analytics.trackFeature('notification_time_changed', { hour, minute });
  }
}

// 알림 비활성화
function disableNotifications() {
  if (window._dailyNotifTimer) {
    clearTimeout(window._dailyNotifTimer);
  }
  localStorage.setItem('myan_notif_enabled', 'false');

  if (typeof Analytics !== 'undefined') {
    Analytics.trackFeature('notification_disabled');
  }
}

// 초기화: 앱 로드 시 실행
function initNotifications() {
  // 마지막 방문 시간 업데이트
  updateLastVisit();

  // 일일 알림 재스케줄
  if (localStorage.getItem('myan_notif_enabled') === 'true') {
    scheduleDailyNotification();
  }

  // 재방문 알림 체크 (하루에 한 번만)
  const lastCheck = localStorage.getItem('myan_last_retention_check');
  const today = new Date().toISOString().slice(0, 10);
  if (lastCheck !== today) {
    checkRetentionNotifications();
    checkSpecialDayNotifications();
    localStorage.setItem('myan_last_retention_check', today);
  }
}

// 전역 노출
window.Notifications = {
  requestPermission: requestNotificationPermission,
  scheduleDailyNotification,
  showNotificationSettingsModal,
  saveNotificationTime,
  disableNotifications,
  init: initNotifications,
  updateLastVisit,
};

// 자동 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNotifications);
} else {
  initNotifications();
}
