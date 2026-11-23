import React from 'react';
import { Redirect } from 'expo-router';

export default function PremiumRedirect() {
  return <Redirect href="/perks?section=premium" />;
}
