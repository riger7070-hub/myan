import React, { createContext, useContext, useEffect, useState } from 'react';
import * as storage from './storage';
import { getValidIdToken, silentSignIn } from './auth';
import { getUserTokens } from './api';
import { getLang } from './storage';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser]         = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [tokens, setTokens]     = useState(0);
  const [lang, setLangState]    = useState('ko');
  const [loading, setLoading]   = useState(true);

  // 앱 시작 시 초기화
  useEffect(() => {
    (async () => {
      const [savedUser, savedLang, signedOut, wasLoggedIn] = await Promise.all([
        storage.getUser(),
        storage.getLang(),
        storage.getItem(storage.KEYS.SIGNED_OUT),
        storage.isLoggedIn(),
      ]);

      if (savedLang) setLangState(savedLang);
      if (savedUser) setUser(savedUser);

      if (wasLoggedIn && signedOut !== 'true') {
        // 사이런트 로그인 시도
        try {
          const result = await silentSignIn();
          if (result?.idToken) {
            await storage.setIdToken(result.idToken);
            await storage.setLoggedIn(true);
            setLoggedIn(true);

            // 토큰 잔액 조회
            const data = await getUserTokens().catch(() => null);
            if (data) setTokens(data.tokens || 0);
          }
        } catch {}
      }
      setLoading(false);
    })();
  }, []);

  const refreshTokens = async () => {
    try {
      const data = await getUserTokens();
      setTokens(data?.tokens || 0);
    } catch {}
  };

  const changeLang = async (l) => {
    setLangState(l);
    await storage.setLang(l);
  };

  const loginSuccess = async (idToken, googleUser) => {
    await storage.setIdToken(idToken);
    await storage.setLoggedIn(true);
    await storage.removeItem(storage.KEYS.SIGNED_OUT);

    const existing = await storage.getUser() || {};
    const isReturning = existing.email && existing.email === googleUser.email;

    const profile = {
      ...existing,
      name:  googleUser.name  || existing.name  || '',
      email: googleUser.email || existing.email || '',
      photo: googleUser.photo || existing.photo || '',
    };
    await storage.setUser(profile);
    setUser(profile);
    setLoggedIn(true);

    const data = await getUserTokens().catch(() => null);
    setTokens(data?.tokens || 0);

    return { isReturning, profile };
  };

  const logoutSuccess = async () => {
    await storage.clearSession();
    setLoggedIn(false);
    setTokens(0);
  };

  return (
    <AppContext.Provider value={{
      user, setUser,
      loggedIn, setLoggedIn,
      tokens, setTokens, refreshTokens,
      lang, changeLang,
      loading,
      loginSuccess, logoutSuccess,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
