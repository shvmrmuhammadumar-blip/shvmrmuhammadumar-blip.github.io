import React, { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Alert } from '../lib/alert';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { dayAgoIso, pickPostMedia, uploadPostMedia } from '../lib/api';
import { colors } from '../lib/theme';
import type { MiniProfile } from '../lib/types';

type Ring = { userId: string; profile: MiniProfile | null };

export default function StoriesBar() {
  const { session } = useAuth();
  const me = session!.user.id;
  const router = useRouter();
  const [rings, setRings] = useState<Ring[]>([]);
  const [myAvatar, setMyAvatar] = useState<MiniProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async (isActive: () => boolean = () => true) => {
    const [{ data: stories, error: storiesError }, { data: mine, error: profileError }] = await Promise.all([
      supabase
        .from('stories')
        .select('user_id, created_at, profiles(username, avatar_url)')
        .gte('created_at', dayAgoIso())
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('username, avatar_url').eq('id', me).single(),
    ]);
    if (!isActive()) return;
    if (storiesError || profileError) {
      throw storiesError ?? profileError;
    }
    setLoadError('');
    setMyAvatar((mine as MiniProfile | null) ?? null);

    const seen = new Set<string>();
    const list: Ring[] = [];
    for (const row of (stories as any[]) ?? []) {
      if (seen.has(row.user_id)) continue;
      seen.add(row.user_id);
      list.push({ userId: row.user_id, profile: row.profiles });
    }
    setRings(list);
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void load(() => active).catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Could not load stories.');
      });
      return () => { active = false; };
    }, [load])
  );

  const addStory = async () => {
    if (busy) return;
    try {
      const media = await pickPostMedia();
      if (!media) return;
      setBusy(true);
      const uploaded = await uploadPostMedia(media, me, 'story');
      const { error } = await (supabase as any).from('stories').insert({
        user_id: me,
        image_url: media.type === 'image' ? uploaded.publicUrl : null,
        video_url: media.type === 'video' ? uploaded.publicUrl : null,
        media_type: media.type,
        media_path: uploaded.path,
        media_mime_type: media.mimeType,
        media_file_name: media.fileName,
      });
      if (error) throw error;
      await load();
    } catch (e: any) {
      Alert.alert('Could not add story', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const hasOwn = rings.some((r) => r.userId === me);
  const others = rings.filter((r) => r.userId !== me);

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <View style={styles.item}>
          <View style={styles.ownStoryWrap}>
            <Pressable
              onPress={hasOwn ? () => router.push(`/story/${me}`) : addStory}
              accessibilityRole="button"
              accessibilityLabel={hasOwn ? 'View your story' : 'Add a story'}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <View style={[styles.ring, hasOwn && styles.ringActive]}>
                <Avatar uri={myAvatar?.avatar_url} name={myAvatar?.username} size={58} />
              </View>
            </Pressable>
            <Pressable
              onPress={addStory}
              disabled={busy}
              style={({ pressed }) => [styles.plus, pressed && styles.pressed, busy && styles.plusBusy]}
              accessibilityRole="button"
              accessibilityLabel="Add a story"
              hitSlop={8}
            >
              <Ionicons name="add" size={18} color={colors.bg} />
            </Pressable>
          </View>
          <Text style={styles.label} numberOfLines={1}>{busy ? 'Uploading…' : 'Your story'}</Text>
        </View>

        {others.map((r) => (
          <Pressable key={r.userId} style={styles.item} onPress={() => router.push(`/story/${r.userId}`)}>
            <View style={[styles.ring, styles.ringActive]}>
              <Avatar uri={r.profile?.avatar_url} name={r.profile?.username} size={58} />
            </View>
            <Text style={styles.label} numberOfLines={1}>{r.profile?.username ?? 'user'}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {!!loadError && <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    maxWidth: 960,
    alignSelf: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: 12,
    backgroundColor: colors.bg,
  },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 14,
  },
  item: {
    alignItems: 'center',
    width: 76,
  },
  ownStoryWrap: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    padding: 3,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  ringActive: {
    borderColor: colors.lime,
    shadowColor: colors.lime,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 6,
    elevation: 4,
  },
  plus: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.lime,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  label: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.95 }],
  },
  plusBusy: {
    opacity: 0.5,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
});
