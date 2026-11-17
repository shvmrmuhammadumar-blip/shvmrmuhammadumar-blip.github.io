/**
 * Lumo visual foundation — Soft Apple-inspired premium graphite.
 * Keep aliases for older components while gradually migrating to semantic roles.
 */
export const colors = {
  bg: '#090C12',
  surface: '#12161C',
  surfaceRaised: '#1A2029',
  surfaceSoft: '#20252D',
  text: '#F2F5F7',
  muted: '#9AA5B2',
  dim: '#6E7A89',
  border: '#2B3440',
  accent: '#B9C7D6',
  accentStrong: '#E0E8F0',
  accentDark: '#2A3542',
  like: '#D58B9A',
  success: '#9EBEAE',
  danger: '#D8878D',
  verified: '#8EABC8',
  chatOutgoing: '#DCE4EC',
  chatOutgoingText: '#0B1016',
  chatIncoming: '#1A2028',
  chatIncomingText: '#F2F5F7',
  overlay: 'rgba(5, 8, 12, 0.82)',
  glass: 'rgba(26, 32, 41, 0.78)',
  glassBorder: 'rgba(224, 232, 240, 0.12)',
  focus: '#D6E3F0',
  // Backward-compatible aliases used across older feature components.
  lime: '#B9C7D6',
  limeGlow: 'rgba(185, 199, 214, 0.18)',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;
