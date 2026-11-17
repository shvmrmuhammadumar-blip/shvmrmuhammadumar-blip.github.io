import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { StudioFrame, StudioPanel } from '../../../components/studio/StudioFrame';
import { StudioChip, StudioEmpty, StudioSection } from '../../../components/studio/StudioWidgets';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';

type ContentType = 'post' | 'video' | 'story' | 'live';
type PlanStatus = 'idea' | 'planned' | 'published' | 'archived';
type Plan = {
  id: string;
  title: string;
  notes: string;
  content_type: ContentType;
  scheduled_at: string | null;
  status: PlanStatus;
  created_at: string;
};

const types: { key: ContentType; label: string }[] = [
  { key: 'post', label: 'Post' },
  { key: 'video', label: 'Video' },
  { key: 'story', label: 'Story' },
  { key: 'live', label: 'Live' },
];

type Filter = 'all' | 'idea' | 'planned' | 'published';

export default function StudioPlannerScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [plans, setPlans] = useState<Plan[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [contentType, setContentType] = useState<ContentType>('post');
  const [scheduledDate, setScheduledDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error: queryError } = await supabase.from('creator_plans')
      .select('id, title, notes, content_type, scheduled_at, status, created_at')
      .eq('user_id', userId)
      .neq('status', 'archived')
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(100);
    if (queryError) throw queryError;
    setPlans((data ?? []) as Plan[]);
    setError('');
  }, [userId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    load().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Planner could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]));

  const visiblePlans = useMemo(() => filter === 'all' ? plans : plans.filter((plan) => plan.status === filter), [plans, filter]);

  const savePlan = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle || saving || !userId) return;
    let scheduledAt: string | null = null;
    if (scheduledDate.trim()) {
      const parsed = new Date(`${scheduledDate.trim()}T12:00:00`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate.trim()) || Number.isNaN(parsed.getTime())) {
        setError('Use the date format YYYY-MM-DD.');
        return;
      }
      scheduledAt = parsed.toISOString();
    }
    setSaving(true);
    setError('');
    try {
      const { error: insertError } = await supabase.from('creator_plans').insert({
        user_id: userId,
        title: cleanTitle,
        notes: notes.trim(),
        content_type: contentType,
        scheduled_at: scheduledAt,
        status: scheduledAt ? 'planned' : 'idea',
      });
      if (insertError) throw insertError;
      setTitle('');
      setNotes('');
      setScheduledDate('');
      setContentType('post');
      setShowForm(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Plan could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (plan: Plan, status: PlanStatus) => {
    const { error: updateError } = await supabase.from('creator_plans')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', plan.id)
      .eq('user_id', userId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await load();
  };

  const removePlan = async (plan: Plan) => {
    const { error: deleteError } = await supabase.from('creator_plans').delete().eq('id', plan.id).eq('user_id', userId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setPlans((current) => current.filter((item) => item.id !== plan.id));
  };

  return (
    <StudioFrame title="Planner" subtitle="Ideas and publishing schedule" icon="calendar-outline">
      <View style={styles.headerRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.heading}>Content planner</Text>
          <Text style={styles.subheading}>Keep ideas moving towards publish.</Text>
        </View>
        <Pressable onPress={() => setShowForm((value) => !value)} style={styles.addButton} accessibilityRole="button">
          <Ionicons name={showForm ? 'close' : 'add'} size={17} color={colors.bg} />
          <Text style={styles.addText}>{showForm ? 'Close' : 'New plan'}</Text>
        </Pressable>
      </View>

      {showForm ? (
        <StudioPanel style={styles.form}>
          <Text style={styles.formTitle}>New content plan</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Working title" placeholderTextColor={colors.dim} style={styles.input} maxLength={100} />
          <TextInput value={notes} onChangeText={setNotes} placeholder="Notes (optional)" placeholderTextColor={colors.dim} style={[styles.input, styles.notesInput]} multiline maxLength={1200} />
          <View style={styles.typeRow}>
            {types.map((item) => <StudioChip key={item.key} label={item.label} active={contentType === item.key} onPress={() => setContentType(item.key)} />)}
          </View>
          <Text style={styles.fieldLabel}>PUBLISH DATE · OPTIONAL</Text>
          <TextInput value={scheduledDate} onChangeText={setScheduledDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.dim} style={styles.input} maxLength={10} />
          <Text style={styles.helper}>No date saves this as an idea. A date adds it to Planned.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable onPress={() => void savePlan()} disabled={saving || !title.trim()} style={[styles.saveButton, (!title.trim() || saving) && styles.disabled]} accessibilityRole="button">
            {saving ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.saveText}>Save plan</Text>}
          </Pressable>
        </StudioPanel>
      ) : null}

      <View style={styles.filters}>
        {(['all', 'idea', 'planned', 'published'] as Filter[]).map((key) => (
          <StudioChip key={key} label={key === 'all' ? 'All' : key === 'idea' ? 'Ideas' : key === 'planned' ? 'Planned' : 'Published'} active={filter === key} onPress={() => setFilter(key)} />
        ))}
      </View>

      {error && !showForm ? <Text style={styles.error}>{error}</Text> : null}
      <StudioSection title={filter === 'all' ? 'Your plans' : filter === 'idea' ? 'Ideas' : filter === 'planned' ? 'Scheduled' : 'Published'} />
      {loading ? <ActivityIndicator color={colors.accentStrong} style={{ marginVertical: 24 }} /> : null}
      {!loading && !visiblePlans.length ? <StudioEmpty icon="calendar-outline" title="Nothing planned here yet" action="Create a plan" onAction={() => setShowForm(true)} /> : null}

      {visiblePlans.map((plan) => (
        <StudioPanel key={plan.id} style={styles.planCard}>
          <View style={styles.planTop}>
            <View style={styles.planType}>
              <Ionicons name={plan.content_type === 'video' ? 'play-circle-outline' : plan.content_type === 'story' ? 'aperture-outline' : plan.content_type === 'live' ? 'radio-outline' : 'image-outline'} size={16} color={colors.muted} />
              <Text style={styles.planTypeText}>{plan.content_type.toUpperCase()}</Text>
            </View>
            <Text style={[styles.status, plan.status === 'published' && styles.statusPublished]}>{plan.status.toUpperCase()}</Text>
          </View>
          <Text style={styles.planTitle}>{plan.title}</Text>
          {plan.notes ? <Text style={styles.planNotes}>{plan.notes}</Text> : null}
          <View style={styles.planBottom}>
            <Text style={styles.planDate}>{plan.scheduled_at ? new Date(plan.scheduled_at).toLocaleDateString() : 'No date set'}</Text>
            <View style={styles.actions}>
              {plan.status !== 'published' ? (
                <Pressable onPress={() => void updateStatus(plan, 'published')} style={styles.actionButton} accessibilityRole="button">
                  <Ionicons name="checkmark" size={15} color={colors.accentStrong} /><Text style={styles.actionText}>Done</Text>
                </Pressable>
              ) : null}
              {plan.status === 'idea' ? (
                <Pressable onPress={() => void updateStatus(plan, 'planned')} style={styles.actionButton} accessibilityRole="button">
                  <Ionicons name="calendar-outline" size={14} color={colors.accentStrong} /><Text style={styles.actionText}>Plan</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => void removePlan(plan)} hitSlop={8} style={styles.deleteButton} accessibilityRole="button" accessibilityLabel="Delete plan">
                <Ionicons name="trash-outline" size={15} color={colors.danger} />
              </Pressable>
            </View>
          </View>
        </StudioPanel>
      ))}
    </StudioFrame>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headingCopy: { flex: 1, gap: 4 },
  heading: { color: colors.text, fontSize: 25, fontWeight: '900', letterSpacing: -0.8 },
  subheading: { color: colors.muted, fontSize: 11 },
  addButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 11, backgroundColor: colors.accent },
  addText: { color: colors.bg, fontSize: 11, fontWeight: '900' },
  form: { gap: 11 },
  formTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  input: { minHeight: 43, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, paddingHorizontal: 12, color: colors.text, fontSize: 12 },
  notesInput: { minHeight: 72, paddingTop: 11, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  fieldLabel: { color: colors.dim, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  helper: { color: colors.dim, fontSize: 9 },
  saveButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.accent },
  saveText: { color: colors.bg, fontSize: 11, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  error: { color: colors.danger, fontSize: 10 },
  planCard: { gap: 10 },
  planTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planType: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  planTypeText: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  status: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.8, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: colors.surfaceRaised },
  statusPublished: { color: colors.success },
  planTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  planNotes: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  planBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  planDate: { color: colors.dim, fontSize: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  actionButton: { minHeight: 31, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, borderRadius: 9, backgroundColor: colors.surfaceRaised },
  actionText: { color: colors.accentStrong, fontSize: 9, fontWeight: '800' },
  deleteButton: { minHeight: 31, width: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: colors.surfaceRaised },
});
