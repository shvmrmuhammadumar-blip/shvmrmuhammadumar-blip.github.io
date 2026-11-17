import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from './supabase';

export const LOCATION_TASK_NAME = 'LUMO_BACKGROUND_LOCATION';

type BackgroundLocationPayload = {
  locations?: Location.LocationObject[];
};

async function saveCoordinates(userId: string, location: Location.LocationObject) {
  const { coords } = location;
  const { error } = await supabase.from('user_locations').upsert(
    {
      user_id: userId,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy_meters: coords.accuracy,
      heading_degrees: coords.heading,
      speed_mps: coords.speed,
    },
    { onConflict: 'user_id' },
  );

  if (error) throw error;
}

TaskManager.defineTask<BackgroundLocationPayload>(
  LOCATION_TASK_NAME,
  async ({ data, error }) => {
    if (error || !data?.locations?.length) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) return;

      const { data: sharing } = await supabase
        .from('user_locations')
        .select('sharing_enabled')
        .eq('user_id', userId)
        .maybeSingle();

      if (!sharing?.sharing_enabled) return;

      const latest = data.locations[data.locations.length - 1];
      await saveCoordinates(userId, latest);
    } catch {
      // A later location event retries transient network failures.
    }
  },
);

export async function getLocationSharingState(userId: string) {
  const { data, error } = await supabase
    .from('user_locations')
    .select('sharing_enabled, latitude, longitude, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function enableLocationSharing(userId: string) {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) {
    throw new Error('Lumo needs location permission while the app is open.');
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  if (!background.granted) {
    throw new Error('Allow background location in system settings to keep sharing while Lumo is not open.');
  }

  const current = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  await saveCoordinates(userId, current);

  const { error } = await supabase
    .from('user_locations')
    .update({ sharing_enabled: true })
    .eq('user_id', userId);

  if (error) throw error;

  try {
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (!started) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 30000,
        distanceInterval: 20,
        pausesUpdatesAutomatically: true,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Lumo location sharing',
          notificationBody: 'Your live location is shared with people you follow.',
          notificationColor: '#B9C7D6',
        },
      });
    }
  } catch (error) {
    await supabase
      .from('user_locations')
      .update({ sharing_enabled: false })
      .eq('user_id', userId);
    throw error;
  }

  return current;
}

export async function disableLocationSharing(userId: string) {
  const { error } = await supabase
    .from('user_locations')
    .update({ sharing_enabled: false })
    .eq('user_id', userId);

  if (error) throw error;

  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (started) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}
