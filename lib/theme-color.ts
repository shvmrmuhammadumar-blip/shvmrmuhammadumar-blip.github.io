import { themePalettes, type AppColors } from './theme';

type RGB = { r: number; g: number; b: number; a: number };

function parseColor(value: string): RGB | null {
  const input = value.trim().toLowerCase();
  if (input === 'transparent' || input === 'currentcolor' || input === 'inherit') return null;

  const hex = input.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let raw = hex[1];
    if (raw.length === 3 || raw.length === 4) raw = raw.split('').map((part) => part + part).join('');
    const hasAlpha = raw.length === 8;
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
      a: hasAlpha ? parseInt(raw.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgb = input.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)%?)?\s*\)$/);
  if (!rgb) return null;
  const alpha = rgb[4] == null ? 1 : Number(rgb[4]) > 1 ? Number(rgb[4]) / 100 : Number(rgb[4]);
  return {
    r: Number(rgb[1]),
    g: Number(rgb[2]),
    b: Number(rgb[3]),
    a: Math.max(0, Math.min(1, alpha)),
  };
}

function luminance({ r, g, b }: RGB): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return channel(r) * 0.2126 + channel(g) * 0.7152 + channel(b) * 0.0722;
}

function saturation({ r, g, b }: RGB): number {
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  return maximum === 0 ? 0 : (maximum - minimum) / maximum;
}

function hue({ r, g, b }: RGB): number {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  if (delta === 0) return 0;
  let result = 0;
  if (maximum === red) result = ((green - blue) / delta) % 6;
  else if (maximum === green) result = (blue - red) / delta + 2;
  else result = (red - green) / delta + 4;
  return (result * 60 + 360) % 360;
}

function isRed(value: number) {
  return value < 18 || value >= 340;
}

function colorKind(tone: number, chroma: number): 'red' | 'green' | 'blue' | 'accent' | null {
  if (isRed(tone) && chroma >= 0.18) return 'red';
  if (tone >= 100 && tone <= 170 && chroma >= 0.13) return 'green';
  if (tone >= 185 && tone <= 255 && chroma >= 0.22) return 'blue';
  if (chroma >= 0.20) return 'accent';
  return null;
}

const BASE_PALETTE = themePalettes.obsidian;

function matchesColor(a: RGB, b: RGB): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && Math.abs(a.a - b.a) < 0.01;
}

function exactRole(value: RGB, property: string): keyof AppColors | null {
  const palettes = Object.values(themePalettes);

  if (
    property === 'color' &&
    matchesColor(value, parseColor(BASE_PALETTE.bg)!)
  ) {
    return 'inverseText';
  }
  if (
    property === 'backgroundColor' &&
    palettes.some((palette) => matchesColor(value, parseColor(palette.mediaBg)!))
  ) {
    return 'mediaBg';
  }
  if (
    property === 'backgroundColor' &&
    palettes.some((palette) => matchesColor(value, parseColor(palette.mediaText)!))
  ) {
    return 'mediaText';
  }
  // Legacy LUMO brand-lime literals are the primary accent, not success green.
  if (
    matchesColor(value, parseColor('#C9D9A4')!) &&
    ['color', 'backgroundColor', 'tintColor', 'fill', 'stroke'].includes(property)
  ) {
    return 'accent';
  }
  if (
    (property === 'color' || property === 'textShadowColor' || property === 'textDecorationColor') &&
    palettes.some((palette) => matchesColor(value, parseColor(palette.mediaText)!))
  ) {
    return 'mediaText';
  }

  const roles: (keyof AppColors)[] = property.toLowerCase().includes('border')
    ? ['border', 'accentDark', 'accentSoft', 'successSoft', 'dangerSoft', 'verifiedSoft', 'glassBorder']
    : property === 'shadowColor'
      ? ['shadow']
      : property === 'placeholderTextColor'
        ? ['dim']
        : property === 'color' || property === 'textShadowColor' || property === 'textDecorationColor'
          ? ['text', 'muted', 'dim', 'accent', 'accentStrong', 'like', 'success', 'danger', 'verified', 'chatOutgoingText', 'chatIncomingText']
          : property === 'tintColor' || property === 'fill' || property === 'stroke'
            ? ['accent', 'accentStrong', 'like', 'success', 'danger', 'verified', 'muted']
            : ['bg', 'mediaBg', 'surface', 'surfaceRaised', 'surfaceSoft', 'accentDark', 'accentSoft', 'accent', 'accentStrong', 'like', 'success', 'successSoft', 'danger', 'dangerSoft', 'verified', 'verifiedSoft', 'chatOutgoing', 'chatIncoming', 'overlay', 'glass', 'glassBorder', 'limeGlow'];

  for (const role of roles) {
    if (palettes.some((palette) => {
      const paletteColor = parseColor(palette[role]);
      return paletteColor && matchesColor(value, paletteColor);
    })) {
      return role;
    }
  }
  return null;
}

function semanticRole(parsed: RGB, property: string): keyof AppColors {
  const light = luminance(parsed);
  const chroma = saturation(parsed);
  const tone = hue(parsed);
  const kind = colorKind(tone, chroma);

  if (property === 'shadowColor') return 'shadow';
  if (property === 'placeholderTextColor') return 'dim';

  // Fixed black media canvases use white overlays in every theme.
  // Semi-transparent black surfaces are overlays, not theme backgrounds.
  if (property === 'backgroundColor' && parsed.a < 0.98 && light < 0.10 && chroma < 0.22) {
    return 'overlay';
  }

  if (property.toLowerCase().includes('border') || property === 'outlineColor') {
    if (!kind || chroma < 0.42) return 'border';
    if (kind === 'red') return 'dangerSoft';
    if (kind === 'green') return 'successSoft';
    if (kind === 'blue') return 'verifiedSoft';
    return 'accentSoft';
  }

  if (property === 'color' || property === 'textShadowColor' || property === 'textDecorationColor') {
    if (light < 0.16) return 'chatOutgoingText';
    if (kind === 'red') return chroma > 0.52 ? 'danger' : 'like';
    if (kind === 'green') return 'success';
    if (kind === 'blue') return 'verified';
    if (kind === 'accent') return 'accent';
    if (light >= 0.78) return 'text';
    if (light >= 0.38) return 'muted';
    if (light >= 0.16) return 'dim';
    return 'chatOutgoingText';
  }

  if (property === 'tintColor' || property === 'fill' || property === 'stroke') {
    if (kind === 'red') return chroma > 0.52 ? 'danger' : 'like';
    if (kind === 'green') return 'success';
    if (kind === 'blue') return 'verified';
    return 'accent';
  }

  // Very dark UI surfaces need luminance-based mapping before hue mapping.
  // Otherwise near-black navy/green panels can be mistaken for blue/green badges.
  if (light < 0.07) {
    if (kind === 'red' && light >= 0.005) return 'dangerSoft';
    if (tone >= 55 && tone < 100 && chroma >= 0.20 && light >= 0.01) return 'accentSoft';
    if (light < 0.0005) return 'bg';
    if (kind === 'green') {
      if (light >= 0.016) return 'surfaceSoft';
      if (light >= 0.007) return 'surfaceRaised';
      if (light >= 0.003) return 'surface';
      return 'bg';
    }
    if (light >= 0.036) return 'accentDark';
    if (light >= 0.012) return 'surfaceSoft';
    if (light >= 0.005) return 'surfaceRaised';
    if (light >= 0.0015) return 'surface';
    return 'bg';
  }

  if (kind === 'red') return light >= 0.38 ? 'danger' : 'dangerSoft';
  if (kind === 'green') return light >= 0.34 ? 'success' : 'successSoft';
  if (kind === 'blue') return light >= 0.38 ? 'verified' : 'verifiedSoft';
  if (kind === 'accent') return light >= 0.38 ? 'accent' : 'accentSoft';

  // Bright neutral surfaces map by depth, never by text/accent roles.
  if (light >= 0.88) return 'surface';
  if (light >= 0.62) return 'surfaceRaised';
  if (light >= 0.34) return 'surfaceSoft';
  if (light >= 0.16) return 'accentDark';
  return 'surfaceSoft';
}

export function resolveThemeColorForPalette(
  value: string,
  property: string,
  palette: AppColors,
  backgroundColor?: string,
): string {
  const parsed = parseColor(value);
  if (!parsed) return value;

  if (
    property === 'color' &&
    backgroundColor &&
    saturation(parsed) < 0.22
  ) {
    const background = parseColor(backgroundColor);
    if (background) {
      const backgroundRole = exactRole(background, 'backgroundColor') ??
        semanticRole(background, 'backgroundColor');
      if (backgroundRole === 'accent' || backgroundRole === 'accentStrong' ||
          backgroundRole === 'success' || backgroundRole === 'danger' ||
          backgroundRole === 'verified' || backgroundRole === 'like') {
        return palette.inverseText;
      }
      if (backgroundRole === 'chatOutgoing') return palette.chatOutgoingText;
      if (backgroundRole === 'chatIncoming') return palette.chatIncomingText;

      const surfaceRoles: (keyof AppColors)[] = [
        'bg', 'surface', 'surfaceRaised', 'surfaceSoft', 'accentDark',
        'accentSoft', 'successSoft', 'dangerSoft', 'verifiedSoft', 'glass', 'overlay',
      ];
      if (backgroundRole === 'mediaBg' || backgroundRole === 'overlay') {
        return palette.mediaText;
      }
      if (
        surfaceRoles.includes(backgroundRole) &&
        luminance(parsed) >= 0.78 &&
        saturation(parsed) < 0.22
      ) {
        return palette.text;
      }
    }
  }

  const role = exactRole(parsed, property) ?? semanticRole(parsed, property);
  const replacement = palette[role];
  if (parsed.a >= 0.98) return replacement;

  const color = parseColor(replacement);
  if (!color) return replacement;
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${parsed.a})`;
}
