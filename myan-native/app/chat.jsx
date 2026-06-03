import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useApp } from '@src/context';
import { sendChat } from '@src/api';
import { ilchin } from '@src/saju';
import { TX } from '@src/locales';
import { COLORS, FONT, OHAENG_COLORS } from '@src/constants';
import * as storage from '@src/storage';

const OHAENG_DESC = {
  ko: { 木:'목(木) — 성장과 시작의 기운',火:'화(火) — 열정과 표현의 기운',土:'토(土) — 안정과 중심의 기운',金:'금(金) — 결단과 수확의 기운',水:'수(水) — 지혜와 적응의 기운' },
};

export default function ChatScreen() {
  const router  = useRouter();
  const params  = useLocalSearchParams();
  const mode    = params.mode || 'solo';
  const { user, lang, tokens, setTokens, refreshTokens } = useApp();
  const lx      = TX[lang] || TX.ko;
  const il      = ilchin();

  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [showChips, setShowChips] = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [formData, setFormData]   = useState({ name:'', year:'', month:'', day:'', time:'' });
  const [hist, setHist]           = useState([]);
  const scrollRef = useRef(null);

  // 첫 진입 시 인사 메시지
  useEffect(() => {
    const hasProfile = user?.birthYear;
    if (mode === 'solo' && hasProfile) {
      addBubble(lx.g1_auto(il, user), 'ai');
      setShowChips(true);
    } else {
      addBubble(mode === 'solo' ? lx.g1(il) : lx.g2(il), 'ai');
      if (mode === 'solo') setShowForm(true);
      else setShowChips(true);
    }
  }, []);

  const addBubble = (text, role, extra) => {
    setMessages(prev => [...prev, { role, text, extra, id: Date.now() + Math.random() }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const submitForm = () => {
    const { name, year, month, day } = formData;
    if (!name.trim() || !year || !month || !day) {
      Alert.alert('입력 확인', '이름, 생년, 월, 일은 필수입니다.');
      return;
    }
    const y = parseInt(year, 10), m = parseInt(month, 10), d = parseInt(day, 10);
    if (y < 1900 || y > 2025 || m < 1 || m > 12 || d < 1 || d > 31) {
      Alert.alert('입력 확인', '올바른 생년월일을 입력해 주세요.');
      return;
    }
    setShowForm(false);
    setShowChips(true);
    addBubble(`${name} / ${year}년 ${month}월 ${day}일${formData.time ? ' ' + formData.time + '시' : ''}`, 'user');
    const summary = `이름: ${name}, 생년월일: ${year}년 ${month}월 ${day}일${formData.time ? ', 태어난 시: ' + formData.time + '시' : ''}`;
    sendMessage(summary, true);
  };

  const sendMessage = async (text, isSystem = false) => {
    if (!text.trim() || loading) return;
    if (tokens <= 0) {
      Alert.alert(
        '토큰 부족',
        lx.chargeWeb,
        [
          { text: '취소', style: 'cancel' },
          { text: lx.chargeWebBtn, onPress: () => Linking.openURL('https://myan.riger7070.workers.dev') },
        ]
      );
      return;
    }

    if (!isSystem) {
      addBubble(text, 'user');
      setInput('');
    }

    const newHist = [...hist, { role: 'user', parts: [{ text }] }];
    setHist(newHist);
    setLoading(true);
    setShowChips(false);

    // 낙관적 UI: 토큰 -1
    setTokens(t => Math.max(0, t - 1));

    try {
      const data = await sendChat(mode, lang, newHist);
      const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) throw { refund: true };

      const clean = raw.replace(/#[木火土金水]\s*/g, '').replace(/\*\*/g, '').trim();
      const tag   = ['木','火','土','金','水'].find(k => raw.includes('#' + k));

      setHist(prev => [...prev, { role: 'model', parts: [{ text: raw }] }]);
      addBubble(clean, 'ai', tag ? { ohaeng: tag } : null);

      if (data._tokens !== undefined) setTokens(data._tokens);
      setShowChips(true);

    } catch (e) {
      setTokens(t => t + 1); // 환불
      if (e.noLogin) {
        Alert.alert('세션 만료', '다시 로그인해 주세요.');
        router.push('/login');
      } else if (e.noToken) {
        await refreshTokens();
        addBubble(lx.noToken, 'ai');
      } else if (e.rateLimited) {
        addBubble('잠시 후 다시 시도해 주세요.', 'ai');
      } else {
        addBubble('오류가 발생했습니다. 다시 시도해 주세요.', 'ai');
      }
    } finally {
      setLoading(false);
      setTimeout(() => setShowChips(true), 100);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← {lx.back}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{mode === 'solo' ? lx.solo : lx.duo}</Text>
        <View style={styles.tokenChip}>
          <Text style={styles.tokenText}>{tokens} ✦</Text>
        </View>
      </View>

      {/* ── 채팅창 ── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.chat}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.map(msg => (
            <ChatBubble key={msg.id} msg={msg} lx={lx} />
          ))}
          {loading && (
            <View style={[styles.bubble, styles.bubbleAi]}>
              <ActivityIndicator color={COLORS.gold} size="small" />
            </View>
          )}
        </ScrollView>

        {/* ── 첫 입력 폼 (프로필 없는 경우) ── */}
        {showForm && (
          <View style={styles.form}>
            <FormInput label="이름" value={formData.name} onChangeText={v => setFormData(p => ({...p, name: v}))} placeholder="홍길동" />
            <View style={styles.formRow}>
              <FormInput label="태어난 해" value={formData.year} onChangeText={v => setFormData(p => ({...p, year: v}))} placeholder="1990" keyboardType="numeric" style={{ flex: 1, marginRight: 6 }} />
              <FormInput label="월" value={formData.month} onChangeText={v => setFormData(p => ({...p, month: v}))} placeholder="1" keyboardType="numeric" style={{ flex: 0.5, marginRight: 6 }} />
              <FormInput label="일" value={formData.day} onChangeText={v => setFormData(p => ({...p, day: v}))} placeholder="1" keyboardType="numeric" style={{ flex: 0.5 }} />
            </View>
            <TouchableOpacity style={styles.formSubmit} onPress={submitForm}>
              <Text style={styles.formSubmitText}>{lx.sgSubmit}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 추천 칩 ── */}
        {showChips && !showForm && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsContent}>
            {(lx.suggestChips || []).map((chip, i) => (
              <TouchableOpacity key={i} style={styles.chip} onPress={() => sendMessage(chip)}>
                <Text style={styles.chipText}>{chip}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* ── 입력창 ── */}
        {!showForm && (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder={lx.inputPh}
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={500}
              onSubmitEditing={() => sendMessage(input)}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
              onPress={() => sendMessage(input)}
              disabled={!input.trim() || loading}
            >
              <Text style={styles.sendBtnText}>▶</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChatBubble({ msg, lx }) {
  const isAi = msg.role === 'ai';
  return (
    <View style={[styles.bubble, isAi ? styles.bubbleAi : styles.bubbleUser]}>
      <Text style={[styles.bubbleText, isAi ? styles.bubbleTextAi : styles.bubbleTextUser]}>
        {msg.text}
      </Text>
      {msg.extra?.ohaeng && (
        <View style={[styles.ohaengTag, { borderColor: OHAENG_COLORS[msg.extra.ohaeng] + '60' }]}>
          <Text style={[styles.ohaengTagText, { color: OHAENG_COLORS[msg.extra.ohaeng] }]}>
            {msg.extra.ohaeng}
          </Text>
        </View>
      )}
    </View>
  );
}

function FormInput({ label, value, onChangeText, placeholder, keyboardType, style }) {
  return (
    <View style={[styles.formField, style]}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        style={styles.formInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        keyboardType={keyboardType || 'default'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: COLORS.bg },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn:     { padding: 4 },
  backText:    { color: COLORS.goldDim, fontSize: FONT.size.sm },
  headerTitle: { color: COLORS.gold, fontSize: FONT.size.md, letterSpacing: 1 },
  tokenChip:   { backgroundColor: 'rgba(201,169,110,0.1)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.border },
  tokenText:   { color: COLORS.gold, fontSize: FONT.size.xs },
  chat:        { flex: 1 },
  chatContent: { padding: 16, paddingBottom: 8 },
  bubble:      { maxWidth: '85%', borderRadius: 14, padding: 12, marginBottom: 10 },
  bubbleAi:    { backgroundColor: COLORS.bubble.ai, borderWidth: 1, borderColor: COLORS.border, alignSelf: 'flex-start' },
  bubbleUser:  { backgroundColor: COLORS.bubble.user, alignSelf: 'flex-end' },
  bubbleText:  { fontSize: FONT.size.sm, lineHeight: 22 },
  bubbleTextAi:   { color: COLORS.text },
  bubbleTextUser: { color: COLORS.text },
  ohaengTag:   { marginTop: 8, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  ohaengTagText: { fontSize: FONT.size.xs },
  chipsScroll: { maxHeight: 48 },
  chipsContent: { paddingHorizontal: 12, paddingVertical: 6, gap: 8, flexDirection: 'row' },
  chip:        { backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  chipText:    { color: COLORS.textSub, fontSize: FONT.size.xs },
  inputRow:    { flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 8 },
  input:       { flex: 1, backgroundColor: COLORS.bgInput, borderWidth: 1, borderColor: COLORS.border, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, color: COLORS.text, fontSize: FONT.size.sm, maxHeight: 120 },
  sendBtn:     { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.gold, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: COLORS.bg, fontSize: 16 },
  form:        { padding: 16, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 10 },
  formRow:     { flexDirection: 'row' },
  formField:   {},
  formLabel:   { color: COLORS.textMuted, fontSize: FONT.size.xs, marginBottom: 4 },
  formInput:   { backgroundColor: COLORS.bgInput, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, color: COLORS.text, fontSize: FONT.size.sm },
  formSubmit:  { backgroundColor: COLORS.gold, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  formSubmitText: { color: COLORS.bg, fontSize: FONT.size.sm, fontWeight: '600' },
});
