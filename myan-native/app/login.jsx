import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';
import { signInWithGoogle } from '@src/auth';
import { useApp } from '@src/context';
import { signupGrant } from '@src/api';
import { TX } from '@src/locales';
import { COLORS, FONT } from '@src/constants';

export default function LoginScreen() {
  const router = useRouter();
  const { lang, loginSuccess } = useApp();
  const [loading, setLoading] = useState(false);
  const lx = TX[lang] || TX.ko;

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const { idToken, user } = await signInWithGoogle();
      const { isReturning, profile } = await loginSuccess(idToken, user);

      // 신규 가입 시 토큰 지급
      if (!isReturning) {
        await signupGrant().catch(() => {});
      }

      router.back();
    } catch (e) {
      if (e.code !== '12501') { // 12501 = 사용자가 취소
        Alert.alert('로그인 실패', '구글 로그인 중 오류가 발생했습니다. 다시 시도해 주세요.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>M ; Y 安</Text>
        <Text style={styles.sub}>{lx.appSub}</Text>

        <View style={styles.divider} />

        <Text style={styles.title}>{lx.login}</Text>
        <Text style={styles.desc}>{lx.loginDesc}</Text>

        <View style={styles.btnWrap}>
          {loading ? (
            <ActivityIndicator color={COLORS.gold} size="large" />
          ) : (
            <GoogleSigninButton
              style={styles.googleBtn}
              size={GoogleSigninButton.Size.Wide}
              color={GoogleSigninButton.Color.Dark}
              onPress={handleGoogleSignIn}
            />
          )}
        </View>

        <Text style={styles.notice}>
          로그인하면 서비스 이용약관 및 개인정보 처리방침에 동의하는 것으로 간주됩니다.
          수집된 정보는 기운 풀이 개선 및 맞춤 처방 목적으로만 사용되며 제3자에게 제공되지 않습니다.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: COLORS.bg },
  header:  { padding: 16, alignItems: 'flex-end' },
  backBtn: { padding: 8 },
  backText: { color: COLORS.textMuted, fontSize: 18 },
  content: { paddingHorizontal: 32, paddingTop: 40, paddingBottom: 40, alignItems: 'center' },
  brand:   { color: COLORS.gold, fontSize: 28, letterSpacing: 6, marginBottom: 8 },
  sub:     { color: COLORS.textMuted, fontSize: FONT.size.xs, letterSpacing: 2, marginBottom: 40 },
  divider: { width: 40, height: 1, backgroundColor: COLORS.border, marginBottom: 40 },
  title:   { color: COLORS.text, fontSize: FONT.size.lg, marginBottom: 8, textAlign: 'center' },
  desc:    { color: COLORS.textMuted, fontSize: FONT.size.sm, textAlign: 'center', marginBottom: 40, lineHeight: 20 },
  btnWrap: { marginBottom: 40, alignItems: 'center', height: 60, justifyContent: 'center' },
  googleBtn: { width: 240, height: 52 },
  notice:  { color: COLORS.textMuted, fontSize: 10, textAlign: 'center', lineHeight: 16, opacity: 0.6 },
});
