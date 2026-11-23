import React from 'react';
import { Redirect } from 'expo-router';

export default function LegacyStudioRouteRedirect() {
  return <Redirect href="/creator-studio/community" />;
}
