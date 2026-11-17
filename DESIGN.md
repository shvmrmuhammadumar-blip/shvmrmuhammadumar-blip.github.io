---
name: Lumo
description: Premium social ecosystem with a calm graphite foundation and precise glass surfaces.
colors:
  background: "#090C12"
  surface: "#12161C"
  surface-raised: "#1A2029"
  surface-soft: "#20252D"
  text: "#F2F5F7"
  muted: "#9AA5B2"
  border: "#2B3440"
  accent: "#B9C7D6"
  accent-strong: "#E0E8F0"
  danger: "#D8878D"
  like: "#D58B9A"
typography:
  display:
    fontFamily: "System"
    fontSize: "30"
    fontWeight: 800
    lineHeight: 1.1
  body:
    fontFamily: "System"
    fontSize: "16"
    fontWeight: 400
    lineHeight: 1.45
  utility:
    fontFamily: "System"
    fontSize: "12"
    fontWeight: 600
    lineHeight: 1.35
rounded:
  sm: "10px"
  md: "14px"
  lg: "18px"
  xl: "24px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  primary-action:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.background}"
    rounded: "{rounded.md}"
  surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
---

## Visual direction

Soft Apple-inspired premium UI with refined glassmorphism. Lumo's foundation is Obsidian (`#090C12`), layered graphite surfaces, soft silver typography, and a restrained ice-silver accent. The UI should feel tactile and calm rather than neon, playful, or aggressively futuristic.

## Color roles

- **Canvas:** `#090C12` — the application backdrop.
- **Surface:** `#12161C` — content surfaces and navigation panels.
- **Raised surface:** `#1A2029` — selected states, menus, and elevated content.
- **Soft surface:** `#20252D` — nested content and quiet control fills.
- **Primary text:** `#F2F5F7`; **secondary text:** `#9AA5B2`.
- **Accent:** `#B9C7D6` — focused actions, current navigation, and key progress.
- **Semantic colors:** muted rose for likes/destructive warnings, sage for success, and desaturated blue for verified identity.

Do not use lime as the visual identity. Avoid saturated purple, rainbow gradients, bright decorative glows, and excessive blur. Preserve enough contrast for text and controls.

## Typography and layout

Use the platform system font for native controls and reading. Titles use compact, confident weights; body text remains comfortable at 16 px or above for mobile inputs. Use a 4-point spacing rhythm and a restrained radius system (10 / 14 / 18 / 24 px).

The app has three layout modes: mobile bottom navigation, tablet compact navigation rail, and desktop labeled sidebar. Content surfaces should recompose around available width rather than simply stretch phone layouts.

## Glass surfaces

Glass is a material, not a decoration: use translucent fills, a fine edge, and subtle depth only for overlays, navigation, and layered controls. Keep long-form reading surfaces mostly opaque for legibility.

## Interaction and accessibility

Every control must have a real action or be visibly disabled with a reason. Keyboard focus must remain visible on web. Respect reduced-motion settings, touch targets, screen-reader labels, safe areas, and recoverable loading/error/empty states.

## Brand mark and assets

The lowercase open-top `u` mark remains the Lumo symbol. Preserve the locally bundled brand and authentication assets; do not substitute remote placeholder imagery for user-generated media.
