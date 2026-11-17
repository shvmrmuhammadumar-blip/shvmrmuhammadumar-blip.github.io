import AsyncStorage from '@react-native-async-storage/async-storage';

export type SavedAccount = {
  id: string;
  email: string;
};

const STORAGE_KEY = 'lumo.saved-accounts.v1';
const MAX_SAVED_ACCOUNTS = 10;

export async function getSavedAccounts(): Promise<SavedAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is SavedAccount => (
      typeof item === 'object'
      && item !== null
      && 'id' in item
      && typeof item.id === 'string'
      && 'email' in item
      && typeof item.email === 'string'
      && item.email.length > 0
    )).slice(0, MAX_SAVED_ACCOUNTS);
  } catch {
    return [];
  }
}

export async function rememberAccount(id: string, email: string): Promise<SavedAccount[]> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!id || !normalizedEmail) return getSavedAccounts();

  const current = await getSavedAccounts();
  const next = [
    { id, email: normalizedEmail },
    ...current.filter((account) => account.id !== id),
  ].slice(0, MAX_SAVED_ACCOUNTS);

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
