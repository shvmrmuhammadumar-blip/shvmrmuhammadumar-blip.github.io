# Lumo — source repair and verification report

Audit date: 2026-11-07

## Implemented source changes

- Replaced the old broken favicon/logo references with bundled app assets. The app icon and web favicon now resolve to real PNG files, and the native Android adaptive icon uses the transparent mark.
- Established the OLED graphite + lime palette in `lib/theme.ts`; removed the purple accent treatment from the feed-adjacent messaging/video UI.
- Hardened auth initialization so a failed session restore cannot leave the app permanently on its loading screen. Login/signup now always clear their busy state after errors, and sign-out errors are surfaced.
- Added explicit photo-library permission handling and recoverable picker errors.
- Fixed the story action controls so the story-open and add-story actions are separate touch targets; made story loading safe when the screen loses focus and made backend errors visible.
- Added explicit retry/error handling for search and post detail queries, including cancellation of stale search responses.
- Added the missing `saved_post` database table, private per-user RLS policies and an existing-project migration.
- Added `.env.example`, `PRODUCT.md` and `DESIGN.md`; corrected setup and icon instructions in `README.md`.

## Verification performed

| Check | Result |
|---|---|
| `npm run typecheck` | Passed (`tsc --noEmit`) |
| `node node_modules/expo/bin/cli config --type public` | Passed; resolved Expo configuration printed |
| `node node_modules/expo/bin/cli install --check` | Passed using Expo's bundled native dependency map; network was unavailable, so remote version validation was skipped |
| `node node_modules/expo/bin/cli export --platform web` | Passed; Metro web bundle exported |
| `node node_modules/expo/bin/cli export --platform android` | Passed; Hermes Android bundle exported |
| Designobo 390 px mobile render — Home, Messages, Chat, Profile | Passed; no browser/console/network errors on these four prototype screens |
| Relative source imports / obsolete icon reference scan | No missing relative imports; no references to the removed `.ico` asset |

## Not verified / remaining work

- No Supabase project credentials were included. Auth, realtime, Storage uploads, RLS policies and database migrations were not exercised against a live backend.
- No iOS simulator, Android emulator or physical device was available for end-to-end interaction testing. Android bundle generation passed; this is not a device QA sign-off.
- Before deploying the `saved_post` feature to an existing Supabase project, run `supabase/migrations/20261107090000_saved_posts.sql` once in the SQL editor. New databases already get the table from `supabase/schema.sql`.
- `app.json` still contains the placeholder identifiers `com.yourname.lumo`; replace them with identifiers owned by the publisher before store builds.
- Existing release blockers remain: report/block workflows, moderation, privacy/terms pages, in-app account deletion, push notifications, and a private-media policy. The current public `images` bucket means media URLs remain publicly viewable.
- Story timelines hide items older than 24 hours in the app. A scheduled server-side purge of expired story rows and corresponding media files is not configured in this source package.

## Lovable handoff note

The connected Lovable workflow did not receive the source archive and its project runtime is a web-app stack, not an Expo/React Native editor. No Lovable code edits or deployment were made; the actual native Expo source remains the deliverable.

## Bundled visual assets update (2026-11-07)

- Added a custom lowercase open-top `u` glyph in PNG and SVG formats.
- Rebuilt the launcher icon from that same glyph and the OLED graphite/lime palette.
- Added locally bundled `lumo-auth-visual.jpg` and wired it into the login/signup hero. The screen no longer depends on an external image host for its main artwork.
- Added `lumo-brand-board.jpg` as a bundled brand showcase asset.
- Verified `npm run typecheck` and `npx expo export --platform web` after the asset integration. The web export includes `lumo-auth-visual.jpg` and `lumo-mark.png` in the generated asset list.

User-generated feed posts, stories, avatars and chat media remain sourced from Supabase Storage. No unrelated demo photos are injected as if they were real user posts.

## Premium UI implementation update — 2026-11-14

- Switched the shared palette from OLED/lime to the Soft Apple-inspired graphite system defined in `DESIGN.md`.
- Added a silver monochrome app mark, app icon and web PNG favicon. Corrected the Expo icon references to files that exist in this archive and enabled iPad support.
- Added a desktop labeled sidebar, tablet compact navigation rail and mobile module picker while preserving the existing five primary mobile tabs.
- Added a Video route backed by existing video posts, a Spaces route backed by existing groups/channels, an expanded Search for people/posts/videos/public groups/public channels, and a Studio summary using actual post/follower/like counts.
- Added explicit not-connected module screens for Market, Map, Events, Mini Apps, Live and Wallet. They do not create demo products, mock locations, fake streams or transactions.
- Restored visible keyboard focus styles and reduced-motion handling in web CSS.
- Preserved existing authentication, messaging, media upload, groups, channels, profile, story and post logic. No Supabase migrations or data writes were applied.

### Verification on 2026-11-14

| Check | Result |
|---|---|
| `npm run typecheck` | Passed after implementation |
| `node node_modules/expo/bin/cli config --type public` | Passed; Expo config resolves with the new icon files and iPad support |
| `node node_modules/expo/bin/cli export --platform android` | Passed after restoring execute permission to the archived Linux Hermes compiler; Metro bundled 1,196 modules and generated a 4.33 MB Hermes bundle |
| Web export | Blocked in this Linux container because the uploaded `node_modules` contains the Windows `lightningcss` binary but not `lightningcss-linux-x64-gnu`. The source archive is not modified to work around this host-specific optional dependency. |
| Browser/device visual QA | Not performed; no authenticated browser session or native device was available. A successful Android JS export is not a visual QA sign-off. |

### Live Supabase observations

The connected project is active. The inspected schema has profiles/posts/likes/comments/follows/stories/messages/groups/channels/saved-posts/notifications and related reaction/report tables, all with RLS enabled. There are no Edge Functions and no product/order, event, mini-app registry, wallet/ledger, location-sharing, live-stream or creator-analytics tables. `platform_roles` has RLS enabled with no policies. Supabase security advisors also flag `create_channel`, `delete_channel` and `update_channel_details` as `SECURITY DEFINER` RPCs callable by `anon`; additional authenticated `SECURITY DEFINER` functions and RLS policy performance findings require a separate permission review. These backend findings were not modified in this UI pass.
