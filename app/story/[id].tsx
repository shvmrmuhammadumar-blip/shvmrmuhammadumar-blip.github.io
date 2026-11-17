import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Alert } from '../../lib/alert';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Avatar from '../../components/Avatar';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { dayAgoIso, timeAgo } from '../../lib/api';
import { trackContentOpen } from '../../lib/studio-analytics';
import type { Story } from '../../lib/types';

const SLIDE_MS = 5000;

export default function StoryViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session!.user.id;
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [stories, setStories] = useState<Story[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    const loadStories = async () => {
      try {
        const { data, error } = await supabase
          .from('stories')
          .select('id, user_id, image_url, created_at, profiles(username, avatar_url)')
          .eq('user_id', id)
          .gte('created_at', dayAgoIso())
          .order('created_at', { ascending: true });
        if (error) throw error;
        if (active) {
          setStories((data as unknown as Story[]) ?? []);
          setLoadError('');
        }
      } catch (error) {
        if (active) {
          setStories([]);
          setLoadError(error instanceof Error ? error.message : 'Could not load stories.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadStories();
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    const currentStory = stories[index];
    if (!currentStory) return;
    void trackContentOpen({
      ownerId: currentStory.user_id,
      viewerId: me,
      contentId: currentStory.id,
      contentType: 'story',
    });
  }, [stories, index, me]);

  // Auto-advance every few seconds; close after the last story.
  useEffect(() => {
    if (loading || stories.length === 0) return;
    const timer = setTimeout(() => {
      if (index < stories.length - 1) setIndex(index + 1);
      else router.back();
    }, SLIDE_MS);
    return () => clearTimeout(timer);
  }, [index, stories, loading, router]);

  const next = () => (index < stories.length - 1 ? setIndex(index + 1) : router.back());
  const prev = () => setIndex(Math.max(0, index - 1));

  const removeCurrent = () => {
    const current = stories[index];
    Alert.alert('Delete this story?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('stories').delete().eq('id', current.id);
            if (error) throw error;
            const rest = stories.filter((s) => s.id !== current.id);
            if (rest.length === 0) router.back();
            else {
              setStories(rest);
              setIndex(Math.min(index, rest.length - 1));
            }
          } catch (error) {
            Alert.alert('Could not delete story', error instanceof Error ? error.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.black}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }
  if (stories.length === 0) {
    return (
      <View style={styles.black}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          {loadError ? 'Stories could not be loaded' : 'No stories to show.'}
        </Text>
        {!!loadError && <Text style={{ color: '#9AA5B2', textAlign: 'center', marginTop: 8, paddingHorizontal: 24 }}>{loadError}</Text>}
        <Pressable onPress={() => router.back()} style={{ marginTop: 16, padding: 12 }} accessibilityRole="button">
          <Text style={{ color: '#B9C7D6', fontWeight: '700' }}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const story = stories[index];

  return (
    <View style={styles.black}>
      {story.image_url ? <Image source={{ uri: story.image_url }} style={StyleSheet.absoluteFill} contentFit="contain" /> : null}

      <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
        <Pressable style={{ flex: 1 }} onPress={prev} />
        <Pressable style={{ flex: 2 }} onPress={next} />
      </View>

      <SafeAreaView style={styles.top} pointerEvents="box-none">
        <View style={styles.bars}>
          {stories.map((s, i) => (
            <View key={s.id} style={[styles.bar, { width: (width - 24 - (stories.length - 1) * 4) / stories.length, opacity: i <= index ? 1 : 0.35 }]} />
          ))}
        </View>
        <View style={styles.header}>
          <Avatar uri={story.profiles?.avatar_url} name={story.profiles?.username} size={32} />
          <Text style={styles.name}>{story.profiles?.username ?? 'user'}</Text>
          <Text style={styles.time}>{timeAgo(story.created_at)}</Text>
          <View style={{ flex: 1 }} />
          {id === me && (
            <Pressable onPress={removeCurrent} hitSlop={10}>
              <Ionicons name="trash-outline" size={24} color="#fff" />
            </Pressable>
          )}
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={30} color="#fff" />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, gap: 10 },
  bars: { flexDirection: 'row', gap: 4, marginTop: 6 },
  bar: { height: 3, borderRadius: 2, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: '#fff', fontWeight: '700' },
  time: { color: '#ddd' },
});
