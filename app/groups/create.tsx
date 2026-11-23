import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../../components/Avatar';
import { Alert } from '../../lib/alert';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import { pickImage, uploadImage } from '../../lib/api';
import { createGroup } from '../../lib/groups';
import type { Database } from '../../lib/database.types';
import { useThemedStyles } from "../../lib/theme-styles";

type Person = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'username' | 'full_name' | 'avatar_url'
>;

export default function CreateGroup() {
  const lumoStyles = useThemedStyles(styles);
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person[]>([]);
  const [searching, setSearching] = useState(true);
  const [searchError, setSearchError] = useState('');

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me) {
      setPeople([]);
      setSearching(false);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError('');

      try {
        let request = supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .neq('id', me)
          .limit(30);

        const term = query.trim().toLowerCase().replace(/[%,_]/g, '');

        if (term) {
          request = request.ilike('username', `%${term}%`);
        } else {
          request = request.order('created_at', { ascending: false });
        }

        const { data, error } = await request;

        if (error) throw error;
        if (active) setPeople(data ?? []);
      } catch (error) {
        if (active) {
          setPeople([]);
          setSearchError(
            error instanceof Error ? error.message : 'Could not search people.',
          );
        }
      } finally {
        if (active) setSearching(false);
      }
    }, query.trim() ? 250 : 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, me]);

  const toggleMember = (person: Person) => {
    setSelected((current) =>
      current.some((item) => item.id === person.id)
        ? current.filter((item) => item.id !== person.id)
        : [...current, person],
    );
  };

  const changeAvatar = async () => {
    try {
      const uri = await pickImage([1, 1]);
      if (uri) setAvatarUri(uri);
    } catch (error) {
      Alert.alert(
        'Photo unavailable',
        error instanceof Error ? error.message : 'Could not select a photo.',
      );
    }
  };

  const handleCreate = async () => {
    if (!me) {
      Alert.alert('Sign in required', 'Please sign in and try again.');
      return;
    }

    const cleanName = name.trim();

    if (cleanName.length < 1 || cleanName.length > 80) {
      Alert.alert('Invalid group name', 'Use 1 to 80 characters.');
      return;
    }

    if (description.trim().length > 500) {
      Alert.alert('Description too long', 'Keep the description under 500 characters.');
      return;
    }

    setBusy(true);

    try {
      let finalAvatar: string | undefined;

      if (avatarUri) {
        finalAvatar = await uploadImage(avatarUri, me, 'group-avatar');
      }

      const groupId = await createGroup({
        name: cleanName,
        description: description.trim(),
        avatarUrl: finalAvatar,
        isPublic,
        memberIds: selected.map((person) => person.id),
      });

      router.replace(`/groups/${groupId}`);
    } catch (error) {
      Alert.alert(
        'Could not create group',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={lumoStyles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        contentContainerStyle={lumoStyles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={lumoStyles.header}>
          <Pressable
            onPress={() => router.back()}
            style={lumoStyles.backButton}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={21} color={colors.text} />
          </Pressable>

          <View style={lumoStyles.headerCopy}>
            <Text style={lumoStyles.eyebrow}>YOUR COMMUNITY</Text>
            <Text style={lumoStyles.title}>Create group</Text>
          </View>

          <View style={lumoStyles.headerSpacer} />
        </View>

        <View style={lumoStyles.identityCard}>
          <Pressable onPress={() => void changeAvatar()} style={lumoStyles.avatarAction}>
            <Avatar uri={avatarUri} name={name || 'Group'} size={76} />
            <View style={lumoStyles.cameraBadge}>
              <Ionicons name="camera" size={14} color={colors.bg} />
            </View>
          </Pressable>

          <View style={lumoStyles.avatarCaption}>
            <Text style={lumoStyles.avatarTitle}>Group photo</Text>
            <Text style={lumoStyles.avatarHint}>Optional · Square image</Text>
            <Pressable onPress={() => void changeAvatar()}>
              <Text style={lumoStyles.changePhoto}>Choose photo</Text>
            </Pressable>
          </View>
        </View>

        <View style={lumoStyles.section}>
          <Text style={lumoStyles.label}>GROUP NAME</Text>
          <TextInput
            style={lumoStyles.input}
            placeholder="Give your group a name"
            placeholderTextColor={colors.dim}
            value={name}
            onChangeText={setName}
            maxLength={80}
            autoCapitalize="sentences"
            returnKeyType="next"
          />
          <Text style={lumoStyles.counter}>{name.length}/80</Text>
        </View>

        <View style={lumoStyles.section}>
          <Text style={lumoStyles.label}>DESCRIPTION</Text>
          <TextInput
            style={[lumoStyles.input, lumoStyles.descriptionInput]}
            placeholder="What is this group about?"
            placeholderTextColor={colors.dim}
            value={description}
            onChangeText={setDescription}
            maxLength={500}
            multiline
            textAlignVertical="top"
          />
          <Text style={lumoStyles.counter}>{description.length}/500</Text>
        </View>

        <View style={lumoStyles.visibilityCard}>
          <View style={lumoStyles.visibilityIcon}>
            <Ionicons
              name={isPublic ? 'globe-outline' : 'lock-closed-outline'}
              size={19}
              color={colors.lime}
            />
          </View>
          <View style={lumoStyles.visibilityCopy}>
            <Text style={lumoStyles.visibilityTitle}>
              {isPublic ? 'Public group' : 'Private group'}
            </Text>
            <Text style={lumoStyles.visibilityDescription}>
              {isPublic
                ? 'Anyone can find and join this group.'
                : 'Only invited members can access this group.'}
            </Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ false: colors.border, true: colors.accentDark }}
            thumbColor={isPublic ? colors.lime : colors.muted}
            accessibilityLabel="Make group public"
          />
        </View>

        <View style={lumoStyles.memberSection}>
          <View style={lumoStyles.memberHeading}>
            <View>
              <Text style={lumoStyles.sectionTitle}>Add people</Text>
              <Text style={lumoStyles.sectionHint}>
                Select members to invite
              </Text>
            </View>
            <View style={lumoStyles.selectedBadge}>
              <Text style={lumoStyles.selectedBadgeText}>{selected.length} selected</Text>
            </View>
          </View>

          <View style={lumoStyles.searchBar}>
            <Ionicons name="search-outline" size={18} color={colors.muted} />
            <TextInput
              style={lumoStyles.searchInput}
              placeholder="Search by username"
              placeholderTextColor={colors.dim}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>

          {selected.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={lumoStyles.selectedList}
            >
              {selected.map((person) => (
                <Pressable
                  key={person.id}
                  style={lumoStyles.selectedPerson}
                  onPress={() => toggleMember(person)}
                >
                  <Avatar uri={person.avatar_url} name={person.username} size={34} />
                  <View style={lumoStyles.removeBadge}>
                    <Ionicons name="close" size={10} color={colors.bg} />
                  </View>
                  <Text style={lumoStyles.selectedName} numberOfLines={1}>
                    {person.username}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View style={lumoStyles.peopleList}>
            {searching ? (
              <View style={lumoStyles.searchState}>
                <ActivityIndicator color={colors.lime} size="small" />
              </View>
            ) : searchError ? (
              <Text style={lumoStyles.emptyMessage}>{searchError}</Text>
            ) : people.length === 0 ? (
              <Text style={lumoStyles.emptyMessage}>
                {query.trim() ? 'No people found.' : 'No people to show yet.'}
              </Text>
            ) : (
              people.map((person) => {
                const isSelected = selected.some((item) => item.id === person.id);

                return (
                  <Pressable
                    key={person.id}
                    style={lumoStyles.personRow}
                    onPress={() => toggleMember(person)}
                  >
                    <Avatar
                      uri={person.avatar_url}
                      name={person.username}
                      size={43}
                    />

                    <View style={lumoStyles.personCopy}>
                      <Text style={lumoStyles.personUsername} numberOfLines={1}>
                        @{person.username}
                      </Text>
                      {!!person.full_name && (
                        <Text style={lumoStyles.personName} numberOfLines={1}>
                          {person.full_name}
                        </Text>
                      )}
                    </View>

                    <View style={[lumoStyles.selectCircle, isSelected && lumoStyles.selectCircleActive]}>
                      {isSelected && (
                        <Ionicons name="checkmark" size={14} color={colors.bg} />
                      )}
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        </View>

        <Pressable
          style={[lumoStyles.createButton, (busy || !name.trim()) && lumoStyles.createButtonDisabled]}
          onPress={() => void handleCreate()}
          disabled={busy || !name.trim()}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <>
              <Ionicons name="people" size={18} color={colors.bg} />
              <Text style={lumoStyles.createButtonText}>Create group</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 40,
  },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 19,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    marginLeft: 12,
  },
  headerSpacer: {
    width: 40,
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: colors.text,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.7,
    marginTop: 3,
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 23,
  },
  avatarAction: {
    position: 'relative',
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: colors.lime,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCaption: {
    marginLeft: 15,
    gap: 4,
  },
  avatarTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  avatarHint: {
    color: colors.muted,
    fontSize: 11,
  },
  changePhoto: {
    color: colors.lime,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  section: {
    marginBottom: 17,
  },
  label: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  input: {
    minHeight: 49,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
  },
  descriptionInput: {
    minHeight: 92,
    paddingTop: 13,
  },
  counter: {
    color: colors.dim,
    fontSize: 10,
    textAlign: 'right',
    marginTop: 5,
  },
  visibilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    marginTop: 1,
    marginBottom: 25,
  },
  visibilityIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibilityCopy: {
    flex: 1,
    marginHorizontal: 11,
  },
  visibilityTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  visibilityDescription: {
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: 3,
  },
  memberSection: {
    marginBottom: 20,
  },
  memberHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  sectionHint: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3,
  },
  selectedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.accentDark,
    borderRadius: 20,
  },
  selectedBadgeText: {
    color: colors.lime,
    fontSize: 10,
    fontWeight: '800',
  },
  searchBar: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    paddingVertical: 0,
  },
  selectedList: {
    paddingVertical: 13,
    gap: 13,
  },
  selectedPerson: {
    width: 55,
    alignItems: 'center',
    position: 'relative',
  },
  removeBadge: {
    position: 'absolute',
    top: -2,
    right: 5,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  selectedName: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 5,
    maxWidth: 55,
  },
  peopleList: {
    marginTop: 8,
    overflow: 'hidden',
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchState: {
    minHeight: 75,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMessage: {
    color: colors.muted,
    textAlign: 'center',
    fontSize: 12,
    padding: 20,
  },
  personRow: {
    minHeight: 65,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  personCopy: {
    flex: 1,
    marginLeft: 11,
  },
  personUsername: {
    color: colors.text,
    fontSize: 12.5,
    fontWeight: '800',
  },
  personName: {
    color: colors.muted,
    fontSize: 10.5,
    marginTop: 3,
  },
  selectCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.dim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectCircleActive: {
    backgroundColor: colors.lime,
    borderColor: colors.lime,
  },
  createButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: colors.lime,
    borderRadius: 15,
    marginTop: 3,
  },
  createButtonDisabled: {
    opacity: 0.45,
  },
  createButtonText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '900',
  },
});
