import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { colors } from '../../lib/theme';
import { createLiveSession, LIVE_CATEGORIES, type LiveAudience, type LiveCategory } from '../../lib/live';
import { useThemedStyles, resolveThemeColor } from "../../lib/theme-styles";


export default function CreateLiveScreen() {
  const lumoStyles = useThemedStyles(styles);
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<LiveCategory>('conversation');
  const [audience, setAudience] = useState<LiveAudience>('public');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startLive = async () => {
    if (!userId || starting) return;
    const cleanTitle = title.trim();
    if (cleanTitle.length < 3) {
      setError('Give your live a title with at least 3 characters.');
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const live = await createLiveSession({
        userId,
        title: cleanTitle,
        description: description.trim(),
        category,
        audience,
      });
      router.replace('/live/' + live.live_code as never);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start your live.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <ScrollView style={lumoStyles.screen} contentContainerStyle={lumoStyles.content} keyboardShouldPersistTaps="handled">
      <Pressable style={lumoStyles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={19} color={resolveThemeColor("#F2F5F7", "color")} />
        <Text style={lumoStyles.backText}>Back to Live</Text>
      </Pressable>

      <View style={lumoStyles.heading}>
        <View style={lumoStyles.headingIcon}><Ionicons name="radio" size={24} color={resolveThemeColor("#11161C", "color")} /></View>
        <Text style={lumoStyles.eyebrow}>LUMO / BROADCAST</Text>
        <Text style={lumoStyles.title}>Set your stage.</Text>
        <Text style={lumoStyles.subtitle}>A good live starts with a clear idea. Your guests join only when you approve them.</Text>
      </View>

      <View style={lumoStyles.formCard}>
        <Text style={lumoStyles.fieldLabel}>LIVE TITLE</Text>
        <TextInput
          value={title}
          onChangeText={value => { setTitle(value.slice(0, 80)); setError(null); }}
          placeholder="What are we talking about?"
          placeholderTextColor={resolveThemeColor("#6E7A89", "placeholderTextColor")}
          maxLength={80}
          style={lumoStyles.titleInput}
        />
        <View style={lumoStyles.counterRow}><Text style={lumoStyles.helper}>3–80 characters</Text><Text style={lumoStyles.counter}>{title.length}/80</Text></View>

        <Text style={[lumoStyles.fieldLabel, lumoStyles.spacedLabel]}>DESCRIPTION <Text style={lumoStyles.optional}>OPTIONAL</Text></Text>
        <TextInput
          value={description}
          onChangeText={value => setDescription(value.slice(0, 500))}
          placeholder="Add a little context for your audience…"
          placeholderTextColor={resolveThemeColor("#6E7A89", "placeholderTextColor")}
          multiline
          maxLength={500}
          style={lumoStyles.descriptionInput}
        />
        <Text style={[lumoStyles.counter, lumoStyles.descriptionCounter]}>{description.length}/500</Text>

        <Text style={[lumoStyles.fieldLabel, lumoStyles.spacedLabel]}>CHOOSE A CATEGORY</Text>
        <View style={lumoStyles.categoryGrid}>
          {LIVE_CATEGORIES.map(item => (
            <Pressable key={item.key} onPress={() => setCategory(item.key)} style={[lumoStyles.category, category === item.key && lumoStyles.categoryActive]}>
              <Text style={[lumoStyles.categoryText, category === item.key && lumoStyles.categoryTextActive]}>{item.label}</Text>
              {category === item.key ? <Ionicons name="checkmark" size={14} color={resolveThemeColor("#11161C", "color")} /> : null}
            </Pressable>
          ))}
        </View>

        <Text style={[lumoStyles.fieldLabel, lumoStyles.spacedLabel]}>WHO CAN WATCH?</Text>
        <View style={lumoStyles.audienceStack}>
          <Pressable onPress={() => setAudience('public')} style={[lumoStyles.audienceCard, audience === 'public' && lumoStyles.audienceCardActive]}>
            <View style={lumoStyles.audienceIcon}><Ionicons name="globe-outline" size={18} color={audience === 'public' ? resolveThemeColor("#D6E3B4", "color") : resolveThemeColor("#9AA5B2", "color")} /></View>
            <View style={lumoStyles.audienceCopy}>
              <Text style={lumoStyles.audienceTitle}>Public</Text>
              <Text style={lumoStyles.audienceDescription}>Anyone on LUMO can discover this live.</Text>
            </View>
            <Ionicons name={audience === 'public' ? 'radio-button-on' : 'radio-button-off'} size={18} color={audience === 'public' ? resolveThemeColor("#C9D9A4", "color") : resolveThemeColor("#65717E", "color")} />
          </Pressable>
          <Pressable onPress={() => setAudience('followers')} style={[lumoStyles.audienceCard, audience === 'followers' && lumoStyles.audienceCardActive]}>
            <View style={lumoStyles.audienceIcon}><Ionicons name="people-outline" size={18} color={audience === 'followers' ? resolveThemeColor("#D6E3B4", "color") : resolveThemeColor("#9AA5B2", "color")} /></View>
            <View style={lumoStyles.audienceCopy}>
              <Text style={lumoStyles.audienceTitle}>Followers only</Text>
              <Text style={lumoStyles.audienceDescription}>Only people who follow you can watch.</Text>
            </View>
            <Ionicons name={audience === 'followers' ? 'radio-button-on' : 'radio-button-off'} size={18} color={audience === 'followers' ? resolveThemeColor("#C9D9A4", "color") : resolveThemeColor("#65717E", "color")} />
          </Pressable>
        </View>
      </View>

      <View style={lumoStyles.stageNote}>
        <Ionicons name="people-circle-outline" size={21} color={resolveThemeColor("#C9D9A4", "color")} />
        <View style={lumoStyles.stageNoteCopy}>
          <Text style={lumoStyles.stageNoteTitle}>You control the stage</Text>
          <Text style={lumoStyles.stageNoteText}>Viewers can request to join. You approve up to three guests at a time.</Text>
        </View>
      </View>

      {error ? <View style={lumoStyles.errorCard}><Ionicons name="alert-circle-outline" size={17} color={resolveThemeColor("#D8B879", "color")} /><Text style={lumoStyles.errorText}>{error}</Text></View> : null}

      <Pressable onPress={() => void startLive()} disabled={starting || title.trim().length < 3} style={[lumoStyles.startButton, (starting || title.trim().length < 3) && lumoStyles.startButtonDisabled]}>
        {starting ? <ActivityIndicator color={resolveThemeColor("#11161C", "color")} /> : <Ionicons name="radio" size={18} color={resolveThemeColor("#11161C", "color")} />}
        <Text style={lumoStyles.startButtonText}>{starting ? 'Preparing your stage…' : 'Start LUMO LIVE'}</Text>
        {!starting ? <Ionicons name="arrow-forward" size={17} color={resolveThemeColor("#11161C", "color")} /> : null}
      </Pressable>
      <Text style={lumoStyles.footerHint}>Camera and microphone permission will be requested when you enter the stage.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090C12' },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 36, gap: 17, width: '100%', maxWidth: 720, alignSelf: 'center' },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 7 },
  backText: { color: '#B0BBC6', fontSize: 11, fontWeight: '800' },
  heading: { gap: 8, paddingVertical: 8 },
  headingIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#C9D9A4', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  eyebrow: { color: '#C3D19E', fontSize: 8, letterSpacing: 1.7, fontWeight: '900' },
  title: { color: '#F2F5F7', fontSize: 28, fontWeight: '900' },
  subtitle: { color: '#9AA5B2', fontSize: 11, lineHeight: 17, maxWidth: 520 },
  formCard: { backgroundColor: '#11161D', borderWidth: 1, borderColor: '#2B3440', borderRadius: 20, padding: 16 },
  fieldLabel: { color: '#9AA5B2', fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  titleInput: { color: '#F2F5F7', fontSize: 17, fontWeight: '700', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#303A45' },
  counterRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  helper: { color: '#65717E', fontSize: 9 },
  counter: { color: '#65717E', fontSize: 9 },
  optional: { color: '#6E7A89', fontSize: 8 },
  spacedLabel: { marginTop: 22, marginBottom: 10 },
  descriptionInput: { minHeight: 76, backgroundColor: '#171D24', borderWidth: 1, borderColor: '#2B3440', borderRadius: 12, color: '#F2F5F7', fontSize: 11, lineHeight: 16, textAlignVertical: 'top', padding: 12 },
  descriptionCounter: { textAlign: 'right', marginTop: 5 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  category: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: '#303A45', backgroundColor: '#171D24' },
  categoryActive: { backgroundColor: '#C9D9A4', borderColor: '#C9D9A4' },
  categoryText: { color: '#AAB5C0', fontSize: 9, fontWeight: '800' },
  categoryTextActive: { color: '#11161C' },
  audienceStack: { gap: 8 },
  audienceCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#303A45', backgroundColor: '#171D24' },
  audienceCardActive: { borderColor: 'rgba(201,217,164,0.7)', backgroundColor: 'rgba(201,217,164,0.07)' },
  audienceIcon: { width: 35, height: 35, borderRadius: 11, backgroundColor: '#202831', alignItems: 'center', justifyContent: 'center' },
  audienceCopy: { flex: 1, gap: 3 },
  audienceTitle: { color: '#F2F5F7', fontSize: 11, fontWeight: '900' },
  audienceDescription: { color: '#8E9AA7', fontSize: 9, lineHeight: 14 },
  stageNote: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderRadius: 15, backgroundColor: '#171F1E', borderWidth: 1, borderColor: '#344039' },
  stageNoteCopy: { flex: 1, gap: 3 },
  stageNoteTitle: { color: '#E9EEDC', fontSize: 11, fontWeight: '900' },
  stageNoteText: { color: '#A8B5A7', fontSize: 9, lineHeight: 14 },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#51432F', backgroundColor: '#211B16', borderRadius: 12, padding: 11 },
  errorText: { color: '#E0C89E', fontSize: 10, flex: 1, lineHeight: 15 },
  startButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#C9D9A4', borderRadius: 15, paddingVertical: 15 },
  startButtonDisabled: { opacity: 0.55 },
  startButtonText: { color: '#11161C', fontSize: 12, fontWeight: '900' },
  footerHint: { color: '#697684', fontSize: 9, textAlign: 'center', lineHeight: 14 },
});
