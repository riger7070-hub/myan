import { useRef, useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, ActivityIndicator, BackHandler, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const WEB_URL  = 'https://myan.riger7070.workers.dev';
// app.js의 GOOGLE_CID 와 동일한 값 (Web application 타입 OAuth 클라이언트 ID)
const WEB_CLIENT_ID = '806789036860-iu94f5ne93t2vh2mvfuqmi3mj95m8ick.apps.googleusercontent.com';

GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });

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

  // Android 뒤로가기: 웹 히스토리 우선
  const canGoBack = useRef(false);
  const handleAndroidBack = useCallback(() => {
    if (canGoBack.current) {
      webRef.current?.goBack();
      return true; // 앱 종료 방지
    }
    return false; // 기본 동작 (앱 종료)
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

  // 웹 → 네이티브 메시지 수신
  const handleMessage = useCallback(async ({ nativeEvent }) => {
    const msg = nativeEvent.data;

    if (msg === 'GOOGLE_SIGNIN_REQUEST') {
      try {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        await GoogleSignin.signIn();
        const { idToken } = await GoogleSignin.getTokens();
        webRef.current?.injectJavaScript(
          `window.__nativeGoogleToken(${JSON.stringify(idToken)});true;`
        );
      } catch (e) {
        webRef.current?.injectJavaScript(
          `window.__nativeGoogleError(${JSON.stringify(e.message || 'cancelled')});true;`
        );
      }
    }

    if (msg === 'GOOGLE_SIGNOUT_REQUEST') {
      try { await GoogleSignin.signOut(); } catch (_) {}
    }

    // 결제 등 외부 브라우저로 열어야 하는 URL
    if (msg.startsWith('OPEN_EXTERNAL:')) {
      const url = msg.replace('OPEN_EXTERNAL:', '');
      try { await Linking.openURL(url); } catch (_) {}
    }
  }, []);

  // SDK 54+ 안드로이드는 edge-to-edge 강제라 상·하단 시스템바 영역을 직접 비켜줘야 한다.
  // (웹뷰 안의 env(safe-area-inset-*) 은 안드로이드에서 0 으로 보고되는 경우가 많음)
  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <WebView
        ref={webRef}
        source={{ uri: WEB_URL }}
        style={styles.webview}
        onMessage={handleMessage}
        injectedJavaScriptBeforeContentLoaded={INJECTED_JS_BEFORE}
        onNavigationStateChange={handleNavState}
        onLoadEnd={() => setReady(true)}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaCapturePermissionGrantType="grant"
        onContentProcessDidTerminate={() => webRef.current?.reload()}
      />
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
