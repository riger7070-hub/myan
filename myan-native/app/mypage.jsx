import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useApp } from '@src/context';
import { withdrawAccount } from '@src/api';
import { signOut } from '@src/auth';
import { TX } from '@src/locales';
import { COLORS, FONT } from '@src/constants';
import * as storage from '@src/storage';

const HOURS = [
  '', '子(23-01)','丑(01-03)','寅(03-05)','卯(05-07)',
  '辰(07-09)','巳(09-11)','午(11-13)','未(13-15)',
  '申(15-17)','酉(17-19)','戌(19-21)','亥(21-23)',
];

export default function MyPageScreen() {
  const router = useRouter();
  const { user, setUser, lang, tokens, logoutSuccess } = useApp();
  const lx = TX[lang] || TX.ko;

  const [name,    setName]    = useState(user?.name || '');
  const [year,    setYear]    = useState(String(user?.birthYear  || ''));
  const [month,   setMonth]   = useState(String(user?.birthMonth || ''));
  const [day,     setDay]     = useState(String(user?.birthDay   || ''));
  const [hour,    setHour]    = useState(user?.birthHour || '');
  const [gender,  setGender]  = useState(user?.gender || '');
  const [region,  setRegion]  = useState(user?.region || '');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('확인', '이름을 입력해 주세요.'); return; }
    const y = parseInt(year, 10), m = parseInt(month, 10), d = parseInt(day, 10);
    if (year && (y < 1900 || y > 2025)) { Alert.alert('확인', '올바른 생년을 입력해 주세요.'); return; }
    if (month && (m < 1 || m > 12))     { Alert.alert('확인', '올바른 월을 입력해 주세요.'); return; }
    if (day && (d < 1 || d > 31))       { Alert.alert('확인', '올바른 일을 입력해 주세요.'); return; }

    setSaving(true);
    const updated = {
      ...user,
      name: name.trim(),
      birthYear:  y || null,
      birthMonth: m || null,
      birthDay:   d || null,
      birthHour:  hour || null,
      gender:     gender || null,
      region:     region.trim() || null,
    };
    await storage.setUser(updated);
    setUser(updated);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogout = () => {
    Alert.alert('', lx.logoutQ, [
      { text: '취소', style: 'cancel' },
      { text: lx.logout, style: 'destructive', onPress: async () => {
        await signOut();
        await logoutSuccess();
        router.back();
      }},
    ]);
  };

  const handleWithdraw = () => {
    Alert.alert('', lx.withdrawQ, [
      { text: '취소', style: 'cancel' },
      { text: lx.withdraw, style: 'destructive', onPress: async () => {
        try {
          await withdrawAccount();
          await storage.clearAll();
          await logoutSuccess();
          router.back();
        } catch (e) {
          Alert.alert('오류', e.message || '탈퇴 처리 중 오류가 발생했습니다.');
        }
      }},
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{lx.mypage}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 프로필 헤더 */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || '?').charAt(0)}</Text>
          </View>
          <Text style={styles.profileName}>{user?.name || '—'}</Text>
          <Text style={styles.profileEmail}>{user?.email || '—'}</Text>
          <View style={styles.tokenBadge}>
            <Text style={styles.tokenBadgeText}>✦ {tokens} 토큰</Text>
          </View>
        </View>

        {/* 기본 정보 */}
        <SectionTitle>기본 정보</SectionTitle>
        <Field label={lx.name}>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="홍길동" placeholderTextColor={COLORS.textMuted} />
        </Field>
        <View style={styles.row}>
          <Field label={lx.birthYear} style={{ flex: 1, marginRight: 6 }}>
            <TextInput style={styles.input} value={year} onChangeText={setYear} placeholder="1990" placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
          </Field>
          <Field label={lx.birthMonth} style={{ flex: 0.6, marginRight: 6 }}>
            <TextInput style={styles.input} value={month} onChangeText={setMonth} placeholder="1" placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
          </Field>
          <Field label={lx.birthDay} style={{ flex: 0.6 }}>
            <TextInput style={styles.input} value={day} onChangeText={setDay} placeholder="1" placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
          </Field>
        </View>

        {/* 상세 정보 */}
        <SectionTitle>상세 정보 (선택)</SectionTitle>
        <Text style={styles.detailNotice}>아래 정보를 추가하면 더욱 정밀한 사주 풀이를 받으실 수 있습니다.</Text>

        <Field label={lx.birthHour}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.hourRow}>
              {HOURS.map((h, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.hourBtn, hour === (i === 0 ? '' : ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'][i-1]) && styles.hourBtnActive]}
                  onPress={() => setHour(i === 0 ? '' : ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'][i-1])}
                >
                  <Text style={[styles.hourBtnText, hour === (i === 0 ? '' : ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'][i-1]) && styles.hourBtnTextActive]}>
                    {i === 0 ? '모름' : h.split('(')[0]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </Field>

        <Field label={lx.gender}>
          <View style={styles.genderRow}>
            {[['', '선택 안 함'], ['M', lx.male], ['F', lx.female]].map(([v, label]) => (
              <TouchableOpacity
                key={v}
                style={[styles.genderBtn, gender === v && styles.genderBtnActive]}
                onPress={() => setGender(v)}
              >
                <Text style={[styles.genderBtnText, gender === v && styles.genderBtnTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>

        <Field label={lx.region}>
          <TextInput style={styles.input} value={region} onChangeText={setRegion} placeholder="서울" placeholderTextColor={COLORS.textMuted} />
        </Field>

        {/* 저장 버튼 */}
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color={COLORS.bg} />
            : <Text style={styles.saveBtnText}>{saved ? lx.saved : lx.save}</Text>
          }
        </TouchableOpacity>

        {/* 토큰 충전 */}
        <View style={styles.bottomCard}>
          <Text style={styles.bottomCardTitle}>토큰 충전</Text>
          <Text style={styles.bottomCardDesc}>잔여 토큰 충전하기</Text>
          <TouchableOpacity style={styles.bottomCardBtn} onPress={() => Linking.openURL('https://myan.riger7070.workers.dev')}>
            <Text style={styles.bottomCardBtnText}>{lx.chargeWebBtn}</Text>
          </TouchableOpacity>
        </View>

        {/* 로그아웃 / 탈퇴 */}
        <View style={styles.dangerZone}>
          <TouchableOpacity style={styles.dangerBtn} onPress={handleLogout}>
            <Text style={styles.dangerBtnText}>{lx.logout}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.dangerBtn, styles.withdrawBtn]} onPress={handleWithdraw}>
            <Text style={[styles.dangerBtnText, styles.withdrawText]}>{lx.withdraw}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ children }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function Field({ label, children, style }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: COLORS.bg },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn:     { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  backText:    { color: COLORS.textMuted, fontSize: 18 },
  title:       { color: COLORS.gold, fontSize: FONT.size.md, letterSpacing: 2 },
  content:     { padding: 20, paddingBottom: 60 },
  profileCard: { alignItems: 'center', backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 24, marginBottom: 28 },
  avatar:      { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(201,169,110,0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  avatarText:  { color: COLORS.gold, fontSize: 26 },
  profileName: { color: COLORS.text, fontSize: FONT.size.lg, marginBottom: 4 },
  profileEmail: { color: COLORS.textMuted, fontSize: FONT.size.sm, marginBottom: 12 },
  tokenBadge:  { backgroundColor: 'rgba(201,169,110,0.1)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.border },
  tokenBadgeText: { color: COLORS.gold, fontSize: FONT.size.sm },
  sectionTitle: { color: COLORS.gold, fontSize: FONT.size.sm, letterSpacing: 2, marginTop: 20, marginBottom: 12, opacity: 0.7 },
  detailNotice: { color: COLORS.textMuted, fontSize: FONT.size.xs, marginBottom: 14, lineHeight: 18 },
  row:         { flexDirection: 'row' },
  field:       { marginBottom: 14 },
  fieldLabel:  { color: COLORS.textSub, fontSize: FONT.size.xs, marginBottom: 6 },
  input:       { backgroundColor: COLORS.bgInput, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, color: COLORS.text, fontSize: FONT.size.sm },
  hourRow:     { flexDirection: 'row', gap: 6 },
  hourBtn:     { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgInput },
  hourBtnActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(201,169,110,0.12)' },
  hourBtnText: { color: COLORS.textMuted, fontSize: FONT.size.xs },
  hourBtnTextActive: { color: COLORS.gold },
  genderRow:   { flexDirection: 'row', gap: 8 },
  genderBtn:   { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgInput, alignItems: 'center' },
  genderBtnActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(201,169,110,0.12)' },
  genderBtnText: { color: COLORS.textMuted, fontSize: FONT.size.sm },
  genderBtnTextActive: { color: COLORS.gold },
  saveBtn:     { backgroundColor: COLORS.gold, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20, marginBottom: 20 },
  saveBtnText: { color: COLORS.bg, fontSize: FONT.size.md, fontWeight: '600' },
  bottomCard:  { backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 20, marginBottom: 16, alignItems: 'center' },
  bottomCardTitle: { color: COLORS.gold, fontSize: FONT.size.md, marginBottom: 4 },
  bottomCardDesc: { color: COLORS.textMuted, fontSize: FONT.size.sm, marginBottom: 14 },
  bottomCardBtn: { backgroundColor: 'rgba(201,169,110,0.15)', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  bottomCardBtnText: { color: COLORS.gold, fontSize: FONT.size.sm },
  dangerZone:  { gap: 10, marginTop: 10 },
  dangerBtn:   { paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  dangerBtnText: { color: COLORS.textMuted, fontSize: FONT.size.sm },
  withdrawBtn: { borderColor: 'rgba(224,112,112,0.3)' },
  withdrawText: { color: COLORS.red },
});
