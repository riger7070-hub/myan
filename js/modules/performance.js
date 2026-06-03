// M;Y 安 — Performance Optimization Module
// 불필요한 리렌더링 방지 및 성능 최적화

// ════════════════════════════════════════════════════════════════
//  1. Debounce & Throttle 유틸리티
// ════════════════════════════════════════════════════════════════

/**
 * Debounce: 마지막 호출 후 일정 시간 동안 추가 호출이 없을 때만 실행
 * 사용 예: 검색 입력, 리사이즈 이벤트
 */
function debounce(func, wait = 200) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle: 일정 시간 동안 최대 1회만 실행
 * 사용 예: 스크롤 이벤트, 마우스 이동
 */
function throttle(func, limit = 200) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ════════════════════════════════════════════════════════════════
//  2. 스마트 토큰 디스플레이 업데이트 (배치 + 변경 감지)
// ════════════════════════════════════════════════════════════════

let _lastTokenValue = null;
let _tokenUpdateScheduled = false;

/**
 * 토큰 디스플레이 최적화 업데이트
 * - 값이 실제로 변경되었을 때만 DOM 업데이트
 * - requestAnimationFrame으로 배치 처리
 */
function scheduleTokenUpdate(newValue) {
  // 값이 변경되지 않았으면 스킵
  if (_lastTokenValue === newValue && _tokenUpdateScheduled) {
    return;
  }

  _lastTokenValue = newValue;

  // 이미 스케줄되어 있으면 중복 호출 방지
  if (_tokenUpdateScheduled) return;

  _tokenUpdateScheduled = true;

  // 다음 프레임에 배치로 업데이트
  requestAnimationFrame(() => {
    _tokenUpdateScheduled = false;
    _updateTokenDisplaysImmediate(newValue);
  });
}

/**
 * 실제 DOM 업데이트 (내부 함수)
 */
function _updateTokenDisplaysImmediate(tokenValue) {
  const elements = {
    count: document.getElementById('chatTokenCount'),
    chip: document.getElementById('tokenChip'),
    num: document.getElementById('mypageTokenNum'),
    tmNum: document.getElementById('tmBalanceNum'),
    zeroNote: document.getElementById('mpZeroNote')
  };

  // 존재하는 요소만 업데이트 (매번 조회하지 않고 캐싱)
  if (elements.count) elements.count.textContent = tokenValue;
  if (elements.num) elements.num.textContent = tokenValue;
  if (elements.tmNum) elements.tmNum.textContent = tokenValue;

  // 낮은 토큰 경고
  if (elements.chip) {
    const shouldWarn = tokenValue > 0 && tokenValue <= 5;
    if (elements.chip.classList.contains('low') !== shouldWarn) {
      elements.chip.classList.toggle('low', shouldWarn);
    }
  }

  // 토큰 0 안내
  if (elements.zeroNote) {
    const shouldShow = tokenValue === 0;
    if (shouldShow) {
      const msg = (TX[lang] || TX.ko)?.mpZeroNote || '';
      if (elements.zeroNote.textContent !== msg) {
        elements.zeroNote.textContent = msg;
      }
    }
    if ((elements.zeroNote.style.display === 'block') !== shouldShow) {
      elements.zeroNote.style.display = shouldShow ? 'block' : 'none';
    }
  }
}

// ════════════════════════════════════════════════════════════════
//  3. 이미지 레이지 로딩
// ════════════════════════════════════════════════════════════════

/**
 * Intersection Observer를 사용한 이미지 레이지 로딩
 */
function initLazyLoading() {
  if (!('IntersectionObserver' in window)) return;

  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          observer.unobserve(img);
        }
      }
    });
  }, {
    rootMargin: '50px' // 뷰포트 50px 전에 미리 로드
  });

  document.querySelectorAll('img[data-src]').forEach(img => {
    imageObserver.observe(img);
  });
}

// ════════════════════════════════════════════════════════════════
//  4. DOM 배치 업데이트 (여러 DOM 변경을 한 번에)
// ════════════════════════════════════════════════════════════════

const _domUpdateQueue = [];
let _domUpdateScheduled = false;

/**
 * DOM 업데이트를 큐에 추가하고 배치 처리
 */
function queueDOMUpdate(updateFunction) {
  _domUpdateQueue.push(updateFunction);

  if (_domUpdateScheduled) return;

  _domUpdateScheduled = true;

  requestAnimationFrame(() => {
    _domUpdateScheduled = false;

    // 모든 업데이트를 한 번에 실행 (reflow/repaint 최소화)
    while (_domUpdateQueue.length > 0) {
      const update = _domUpdateQueue.shift();
      update();
    }
  });
}

// ════════════════════════════════════════════════════════════════
//  5. 메모이제이션 (계산 결과 캐싱)
// ════════════════════════════════════════════════════════════════

const _memoCache = new Map();

/**
 * 함수 결과를 캐싱하여 재계산 방지
 */
function memoize(fn, keyGenerator = (...args) => JSON.stringify(args)) {
  return function memoized(...args) {
    const key = keyGenerator(...args);

    if (_memoCache.has(key)) {
      return _memoCache.get(key);
    }

    const result = fn(...args);
    _memoCache.set(key, result);

    // 캐시 크기 제한 (메모리 누수 방지)
    if (_memoCache.size > 100) {
      const firstKey = _memoCache.keys().next().value;
      _memoCache.delete(firstKey);
    }

    return result;
  };
}

/**
 * 캐시 클리어
 */
function clearMemoCache() {
  _memoCache.clear();
}

// ════════════════════════════════════════════════════════════════
//  6. 이벤트 위임 (Event Delegation)
// ════════════════════════════════════════════════════════════════

/**
 * 부모 요소에 단일 리스너를 등록하여 성능 향상
 * 예: 100개 버튼에 각각 리스너 대신 부모에 1개만
 */
function delegateEvent(parentSelector, eventType, childSelector, handler) {
  const parent = document.querySelector(parentSelector);
  if (!parent) return;

  parent.addEventListener(eventType, (e) => {
    const target = e.target.closest(childSelector);
    if (target && parent.contains(target)) {
      handler.call(target, e);
    }
  });
}

// ════════════════════════════════════════════════════════════════
//  7. 스크롤 최적화
// ════════════════════════════════════════════════════════════════

/**
 * 스크롤 이벤트 최적화 (passive + throttle)
 */
function optimizeScrollHandler(element, handler, throttleMs = 100) {
  const throttled = throttle(handler, throttleMs);

  element.addEventListener('scroll', throttled, {
    passive: true // 성능 향상
  });

  return () => element.removeEventListener('scroll', throttled);
}

// ════════════════════════════════════════════════════════════════
//  전역 노출
// ════════════════════════════════════════════════════════════════

window.Performance = {
  debounce,
  throttle,
  scheduleTokenUpdate,
  queueDOMUpdate,
  memoize,
  clearMemoCache,
  delegateEvent,
  optimizeScrollHandler,
  initLazyLoading,
};

// 자동 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLazyLoading);
} else {
  initLazyLoading();
}
