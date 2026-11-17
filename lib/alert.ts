import { Alert as NativeAlert, Platform } from 'react-native';
import type { AlertButton } from 'react-native';

export type AlertPayload = { title: string; message?: string; buttons?: AlertButton[] };

type Listener = (payload: AlertPayload) => void;
let listener: Listener | null = null;
const pendingAlerts: AlertPayload[] = [];

export function subscribeAlert(fn: Listener) {
  listener = fn;
  while (pendingAlerts.length) fn(pendingAlerts.shift()!);
  return () => {
    if (listener === fn) listener = null;
  };
}

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    const payload: AlertPayload = { title, message, buttons };
    if (listener) {
      listener(payload);
      return;
    }

    // NativeAlert is the platform fallback only on iOS/Android. On web, queue
    // the message until LumoAlertHost subscribes instead of opening window.alert().
    if (Platform.OS !== 'web') {
      NativeAlert.alert(title, message, buttons);
      return;
    }
    pendingAlerts.push(payload);
  },
};
