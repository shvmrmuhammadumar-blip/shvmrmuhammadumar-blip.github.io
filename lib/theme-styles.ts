import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { usePreferences } from './preferences';
import { colors, type AppColors } from './theme';
import { resolveThemeColorForPalette } from './theme-color';

type StyleMap = Record<string, unknown>;

const COLOR_KEYS = new Set([
  'color',
  'backgroundColor',
  'borderColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'shadowColor',
  'textShadowColor',
  'textDecorationColor',
  'outlineColor',
  'tintColor',
  'placeholderTextColor',
  'fill',
  'stroke',
]);

const TEXT_STYLE_SUFFIXES = ['Text', 'Label', 'Title', 'Value', 'Caption', 'Count'];

function resolvePairedBackground(
  styleName: string,
  styles: Record<string, Record<string, unknown>>,
  palette: AppColors,
): string | undefined {
  const suffix = TEXT_STYLE_SUFFIXES.find((candidate) => styleName.endsWith(candidate));
  if (!suffix) return undefined;

  const base = styleName.slice(0, -suffix.length);
  if (!base) return undefined;

  const candidates = [
    base,
    base + 'Button',
    base + 'Chip',
    base + 'Badge',
    base + 'Main',
    base + 'Primary',
    base + 'Danger',
    base + 'Delete',
    base + 'Confirm',
  ];

  for (const candidate of candidates) {
    const background = styles[candidate]?.backgroundColor;
    if (typeof background !== 'string') continue;

    const mapped = resolveThemeColorForPalette(background, 'backgroundColor', palette);
    if ([
      palette.accent,
      palette.accentStrong,
      palette.success,
      palette.danger,
      palette.verified,
      palette.like,
      palette.chatOutgoing,
      palette.chatIncoming,
      palette.surface,
      palette.surfaceRaised,
      palette.surfaceSoft,
      palette.accentDark,
      palette.accentSoft,
      palette.successSoft,
      palette.dangerSoft,
      palette.verifiedSoft,
      palette.bg,
    ].includes(mapped)) {
      return background;
    }
  }

  return undefined;
}

/** Resolve a literal UI color into the selected theme's semantic color role. */
export function resolveThemeColor(
  value: string,
  property = 'color',
  backgroundColor?: string,
): string {
  return resolveThemeColorForPalette(value, property, colors, backgroundColor);
}

/**
 * Theme every color in an existing StyleSheet while leaving layout untouched.
 * Text styles paired with solid buttons/badges also inherit the correct inverse
 * foreground, so Light does not turn white button labels into dark-on-dark text.
 */
export function useThemedStyles<T extends StyleMap>(source: T): T {
  const { palette } = usePreferences();

  return useMemo(() => {
    const flattenedStyles: Record<string, Record<string, unknown>> = {};
    for (const [name, registeredStyle] of Object.entries(source)) {
      if (!registeredStyle) continue;
      const flattened = StyleSheet.flatten(registeredStyle as never) as Record<string, unknown> | undefined;
      if (flattened) flattenedStyles[name] = flattened;
    }

    const result: Record<string, unknown> = {};
    for (const [name, registeredStyle] of Object.entries(source)) {
      if (!registeredStyle) {
        result[name] = registeredStyle;
        continue;
      }

      const flattened = flattenedStyles[name];
      if (!flattened) {
        result[name] = registeredStyle;
        continue;
      }

      const themed: Record<string, unknown> = { ...flattened };
      const ownBackground = typeof flattened.backgroundColor === 'string'
        ? flattened.backgroundColor
        : undefined;
      const pairedBackground = resolvePairedBackground(name, flattenedStyles, palette);
      const textBackground = ownBackground ?? pairedBackground;

      for (const [property, value] of Object.entries(themed)) {
        if (COLOR_KEYS.has(property) && typeof value === 'string') {
          themed[property] = resolveThemeColorForPalette(
            value,
            property,
            palette,
            property === 'color' ? textBackground : undefined,
          );
        }
      }
      result[name] = themed;
    }

    return result as T;
  }, [source, palette]);
}

/**
 * Studio uses a stricter type scale than dense social-feed metadata.
 * Keep its supporting labels readable across phones, tablets and desktop.
 */
export function useStudioStyles<T extends StyleMap>(source: T): T {
  const themed = useThemedStyles(source);

  return useMemo(() => {
    const result: Record<string, unknown> = {};

    for (const [name, registeredStyle] of Object.entries(themed)) {
      if (!registeredStyle) {
        result[name] = registeredStyle;
        continue;
      }

      const flattened = StyleSheet.flatten(registeredStyle as never) as Record<string, unknown> | undefined;
      if (!flattened) {
        result[name] = registeredStyle;
        continue;
      }

      const normalized: Record<string, unknown> = { ...flattened };
      const fontSize = normalized.fontSize;
      if (typeof fontSize === 'number' && fontSize < 10) {
        normalized.fontSize = 10;
        if (typeof normalized.lineHeight === 'number' && normalized.lineHeight < 14) {
          normalized.lineHeight = 14;
        }
      }

      result[name] = normalized;
    }

    return result as T;
  }, [themed]);
}
