import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { useThemedStyles, resolveThemeColor } from "../lib/theme-styles";


type Props = {
  count: number;
  onCopy: () => void;
  onForward: () => void;
  onDelete: () => void;
  onCancel: () => void;
  sending?: boolean;
  forwardDisabled?: boolean;
  deleteDisabled?: boolean;
};

export default function MessageSelectionToolbar({
  count,
  onCopy,
  onForward,
  onDelete,
  onCancel,
  sending = false,
  forwardDisabled = false,
  deleteDisabled = false,
}: Props) {
  const lumoStyles = useThemedStyles(styles);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (count < 1) return null;

  const handleCancel = () => {
    setConfirmingDelete(false);
    onCancel();
  };

  return (
    <View style={lumoStyles.container}>
      <View style={lumoStyles.header}>
        <View style={lumoStyles.countIcon}>
          <Ionicons name="checkmark-done" size={19} color={resolveThemeColor("#10150B", "color")} />
        </View>

        <View style={lumoStyles.headerCopy}>
          <Text style={lumoStyles.countText}>
            {count} {count === 1 ? 'MESSAGE' : 'MESSAGES'} SELECTED
          </Text>
          <Text style={lumoStyles.subtitle}>
            Choose an action for selected messages
          </Text>
        </View>

        <Pressable
          onPress={handleCancel}
          disabled={sending}
          style={lumoStyles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Cancel selection"
        >
          <Ionicons name="close" size={20} color={resolveThemeColor("#F2F5F7", "color")} />
        </Pressable>
      </View>

      {confirmingDelete ? (
        <View style={lumoStyles.confirmRow}>
          <View style={lumoStyles.confirmCopy}>
            <Text style={lumoStyles.confirmTitle}>Delete {count} messages?</Text>
            <Text style={lumoStyles.confirmSubtitle}>
              This action cannot be undone.
            </Text>
          </View>

          <Pressable
            onPress={() => setConfirmingDelete(false)}
            disabled={sending}
            style={lumoStyles.cancelDelete}
          >
            <Text style={lumoStyles.cancelDeleteText}>Cancel</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setConfirmingDelete(false);
              onDelete();
            }}
            disabled={sending || deleteDisabled}
            style={[
              lumoStyles.confirmDelete,
              (sending || deleteDisabled) && lumoStyles.disabled,
            ]}
          >
            {sending ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <Text style={lumoStyles.confirmDeleteText}>Delete</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={lumoStyles.actions}>
          <Pressable
            onPress={onCopy}
            disabled={sending}
            style={({ pressed }) => [
              lumoStyles.action,
              pressed && lumoStyles.actionPressed,
              sending && lumoStyles.disabled,
            ]}
          >
            <View style={lumoStyles.actionIcon}>
              <Ionicons name="copy-outline" size={19} color={resolveThemeColor("#B9C7D6", "color")} />
            </View>
            <Text style={lumoStyles.actionText}>Copy</Text>
          </Pressable>

          <Pressable
            onPress={onForward}
            disabled={sending || forwardDisabled}
            style={({ pressed }) => [
              lumoStyles.action,
              pressed && lumoStyles.actionPressed,
              (sending || forwardDisabled) && lumoStyles.disabled,
            ]}
          >
            <View style={[lumoStyles.actionIcon, lumoStyles.forwardIcon]}>
              <Ionicons name="arrow-redo-outline" size={20} color={resolveThemeColor("#10150B", "color")} />
            </View>
            <Text style={lumoStyles.actionText}>Forward</Text>
          </Pressable>

          <Pressable
            onPress={() => setConfirmingDelete(true)}
            disabled={sending || deleteDisabled}
            style={({ pressed }) => [
              lumoStyles.action,
              pressed && lumoStyles.actionPressed,
              (sending || deleteDisabled) && lumoStyles.disabled,
            ]}
          >
            <View style={lumoStyles.actionIcon}>
              <Ionicons name="trash-outline" size={19} color={resolveThemeColor("#FF7182", "color")} />
            </View>
            <Text style={[lumoStyles.actionText, lumoStyles.deleteText]}>Delete</Text>
          </Pressable>

          <Pressable
            onPress={handleCancel}
            disabled={sending}
            style={({ pressed }) => [
              lumoStyles.action,
              pressed && lumoStyles.actionPressed,
              sending && lumoStyles.disabled,
            ]}
          >
            <View style={lumoStyles.actionIcon}>
              <Ionicons name="close-outline" size={20} color={resolveThemeColor("#A3AA9A", "color")} />
            </View>
            <Text style={lumoStyles.actionText}>Cancel</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 15,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: '#10140E',
    borderTopWidth: 1,
    borderTopColor: '#303A27',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginBottom: 13,
  },
  countIcon: {
    width: 37,
    height: 37,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B9C7D6',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  countText: {
    color: '#F2F5F7',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  subtitle: {
    color: '#9AA5B2',
    fontSize: 10,
    marginTop: 4,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#20251C',
    borderWidth: 1,
    borderColor: '#343D2C',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
  },
  action: {
    flex: 1,
    minWidth: 0,
    minHeight: 65,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
  },
  actionPressed: {
    backgroundColor: '#20271A',
  },
  actionIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#22291D',
    borderWidth: 1,
    borderColor: '#343D2C',
  },
  forwardIcon: {
    backgroundColor: '#B9C7D6',
    borderColor: '#B9C7D6',
  },
  actionText: {
    color: '#C3CAB9',
    fontSize: 10,
    fontWeight: '800',
  },
  deleteText: {
    color: '#FF8492',
  },
  disabled: {
    opacity: 0.35,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 58,
  },
  confirmCopy: {
    flex: 1,
    minWidth: 0,
  },
  confirmTitle: {
    color: '#F2F5F7',
    fontSize: 12,
    fontWeight: '800',
  },
  confirmSubtitle: {
    color: '#9AA5B2',
    fontSize: 9,
    marginTop: 4,
  },
  cancelDelete: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#22291D',
  },
  cancelDeleteText: {
    color: '#DCE2D4',
    fontSize: 10,
    fontWeight: '800',
  },
  confirmDelete: {
    minWidth: 67,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#C9364D',
  },
  confirmDeleteText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
});