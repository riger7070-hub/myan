import { useRef, useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, ActivityIndicator, BackHandler, Linking, ToastAndroid, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const WEB_URL  = 'https://myan.riger7070.workers.dev';
// app.js의 GOOGLE_CID 와 동일한 값 (Web application 타입 OAuth 클라이언트 ID)
const WEB_CLIENT_ID = '806789036860-iu94f5ne93t2vh2mvfuqmi3mj95m8ick.apps.googleusercontent.com';

GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });

const EXTERNAL_PREFIX = 'OPEN_EXTERNAL:';
const LANG_PREFIX     = 'LANG:';

// 뒤로가기로 앱을 끝내기 전에 한 번 더 확인받는 안내. 웹이 알려준 언어를 따른다.
const EXIT_HINT = {
  ko: '한 번 더 누르면 종료됩니다',
  en: 'Press back again to exit',
  zh: '再按一次退出',
  ja: 'もう一度押すと終了します',
};
const EXIT_WINDOW_MS = 2000;

// 앱링크로 들어온 주소 중 우리 사이트인 것만 웹뷰에 태운다.
// 이 웹뷰에는 구글 로그인 브릿지(window.__nativeGoogleToken)가 주입돼 있어서,
// 남의 페이지를 여기서 열면 그 페이지가 브릿지를 부를 수 있다. 그래서 호스트를 본다.
function safeSiteUrl(url) {
  if (typeof url !== 'string' || !url.startsWith(WEB_URL)) return null;
  // 호스트가 정말 여기서 끝나는지 확인한다. 이 검사가 없으면
  // https://myan.riger7070.workers.dev.evil.com/ 도 startsWith 를 통과한다.
  const rest = url.slice(WEB_URL.length);
  if (rest === '' || rest[0] === '/' || rest[0] === '?' || rest[0] === '#') return url;
  return null;
}

async function openExternalUrl(url) {
  try { await Linking.openURL(url); }
  catch (e) { console.warn('[myan] 외부 링크 열기 실패:', url, e); }
}

// 페이지 로드 전에 주입 — window._isNativeApp 플래그와 콜백 미리 선언
const INJECTED_JS_BEFORE = `
(function() {
  window._isNativeApp = true;

  // 네이티브 → 웹: Google ID 토큰 수신
  window.__nativeGoogleToken = function(idToken) {
    window.dispatchEvent(new CustomEvent('nativeGoogleSignIn', {
      detail: { idToken: idToken }
    }));
  };
  window.__nativeGoogleError = function(msg) {
    window.dispatchEvent(new CustomEvent('nativeGoogleSignIn', {
      detail: { error: msg }
    }));
  };
})();
true;
`;

export default function WebScreen() {
  const webRef  = useRef(null);
  const insets  = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  // 앱링크로 열렸다면 그 주소에서 시작한다. 정해지기 전에는 웹뷰를 그리지 않는다 —
  // 먼저 홈을 띄우고 나중에 바꾸면 화면이 두 번 로드된다.
  const [startUrl, setStartUrl] = useState(null);

  // Android 뒤로가기: 웹 히스토리 우선
  const canGoBack = useRef(false);
  const lang      = useRef('ko');   // 웹이 LANG: 메시지로 알려준다
  const lastBack  = useRef(0);

  const handleAndroidBack = useCallback(() => {
    if (canGoBack.current) {
      webRef.current?.goBack();
      return true; // 앱 종료 방지
    }

    // 더 돌아갈 화면이 없을 때 곧장 꺼지면 "누르자마자 앱이 죽었다"로 느껴진다.
    // 안드로이드 관례대로 2초 안에 한 번 더 눌러야 실제로 종료한다.
    // (웹 화면 안에서 뒤로가기 버튼으로 이동한 경우 히스토리 항목이 남아 있어
    //  OS 뒤로가기 첫 번째가 아무 일도 안 하는 것처럼 보이는 구간이 있는데,
    //  그 직후 두 번째 누름에서 바로 꺼지던 것도 이걸로 완화된다.)
    const now = Date.now();
    if (now - lastBack.current < EXIT_WINDOW_MS) return false; // 종료 허용
    lastBack.current = now;
    if (Platform.OS === 'android') {
      ToastAndroid.show(EXIT_HINT[lang.current] || EXIT_HINT.ko, ToastAndroid.SHORT);
    }
    return true;
  }, []);

  useEffect(() => {
    let alive = true;
    Linking.getInitialURL()
      .then((url) => { if (alive) setStartUrl(safeSiteUrl(url) || WEB_URL); })
      .catch(() => { if (alive) setStartUrl(WEB_URL); });

    // 앱이 이미 떠 있는 상태에서 링크를 누른 경우. source 를 바꾸면 웹뷰가 다시
    // 마운트되면서 로그인 세션까지 날아가므로, 웹뷰 안에서 이동시킨다.
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      const next = safeSiteUrl(url);
      if (next) {
        webRef.current?.injectJavaScript(
          'location.href=' + JSON.stringify(next) + ';true;'
        );
      }
    });
    return () => { alive = false; linkSub.remove(); };
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handleAndroidBack);
    return () => sub.remove();
  }, [handleAndroidBack]);

  // 웹앱은 전체 페이지 로드 없이 history.pushState 로만 화면을 전환한다.
  // onLoadProgress 는 문서 로드에서만 발생해 최초 1회로 끝나므로 여기서 추적하면 안 되고,
  // pushState 까지 잡아주는 onNavigationStateChange 를 써야 한다.
  const handleNavState = useCallback((nav) => {
    canGoBack.current = nav.canGoBack;
  }, []);

  const sendGoogleError = useCallback((reason) => {
    webRef.current?.injectJavaScript(
      `window.__nativeGoogleError(${JSON.stringify(String(reason))});true;`
    );
  }, []);

  // 웹 → 네이티브 메시지 수신
  const handleMessage = useCallback(async ({ nativeEvent }) => {
    const msg = nativeEvent.data;
    if (typeof msg !== 'string') return;

    if (msg === 'GOOGLE_SIGNIN_REQUEST') {
      try {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        // v13 부터 취소는 throw 가 아니라 {type:'cancelled'} 로 돌아온다.
        // 이걸 확인하지 않고 곧장 getTokens() 를 부르면, 이전에 로그인한 적이 있을 때
        // 취소했는데도 예전 계정 토큰으로 로그인돼 버린다.
        const res = await GoogleSignin.signIn();
        if (res?.type !== 'success') { sendGoogleError('cancelled'); return; }
        // webClientId 를 설정했으므로 보통 여기서 바로 idToken 이 온다. 혹시 없으면 getTokens 로 보강.
        const idToken = res.data?.idToken || (await GoogleSignin.getTokens()).idToken;
        if (!idToken) { sendGoogleError('no idToken'); return; }
        webRef.current?.injectJavaScript(
          `window.__nativeGoogleToken(${JSON.stringify(idToken)});true;`
        );
      } catch (e) {
        sendGoogleError(e?.code || e?.message || 'signin failed');
      }
    }

    if (msg === 'GOOGLE_SIGNOUT_REQUEST') {
      try { await GoogleSignin.signOut(); } catch (_) {}
    }

    // 웹에서 고른 언어 — 네이티브가 직접 띄우는 문구(종료 안내 토스트)에 쓴다
    if (msg.startsWith(LANG_PREFIX)) {
      const code = msg.slice(LANG_PREFIX.length);
      if (EXIT_HINT[code]) lang.current = code;
    }

    // 공유·상담 링크 등 새 창으로 열어야 하는 URL.
    // (토스 결제는 successUrl 로 앱에 돌아와야 하므로 웹뷰 안에서 그대로 진행시킨다.)
    if (msg.startsWith(EXTERNAL_PREFIX)) {
      openExternalUrl(msg.slice(EXTERNAL_PREFIX.length));
    }
  }, [sendGoogleError]);

  // SDK 54+ 안드로이드는 edge-to-edge 강제라 상·하단 시스템바 영역을 직접 비켜줘야 한다.
  // (웹뷰 안의 env(safe-area-inset-*) 은 안드로이드에서 0 으로 보고되는 경우가 많음)
  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {startUrl && <WebView
        ref={webRef}
        source={{ uri: startUrl }}
        style={styles.webview}
        onMessage={handleMessage}
        injectedJavaScriptBeforeContentLoaded={INJECTED_JS_BEFORE}
        onNavigationStateChange={handleNavState}
        // window.open 안전망 — 이 prop 이 없으면 안드로이드는 보이지 않는 WebView 를 만들고 끝나
        // 링크가 조용히 사라진다. 웹이 OPEN_EXTERNAL 로 넘기지 못한 새 창도 여기서 받아준다.
        onOpenWindow={({ nativeEvent }) => openExternalUrl(nativeEvent.targetUrl)}
        onLoadEnd={() => setReady(true)}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaCapturePermissionGrantType="grant"
        onContentProcessDidTerminate={() => webRef.current?.reload()}
      />}
      {!ready && (
        <View style={styles.loader}>
          <ActivityIndicator color="#C9A96E" size="large" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#060608' },
  webview: { flex: 1, backgroundColor: '#060608' },
  loader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#060608',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
