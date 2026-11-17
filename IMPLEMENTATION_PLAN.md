# Lumo implementation plan

## Source baseline

- Expo SDK 54, React Native 0.81, Expo Router 6, TypeScript, Supabase JS v2.
- Keep the existing Supabase client, authentication, tables, RLS, API helpers, uploads, and the current routes.
- Existing working areas include Home/feed, Stories, posts/comments, direct chat, groups, channels, profile, and settings.
- The local source's recent post-viewer and comments-sheet updates are retained.

## Supplied design references

| Reference area | Existing or planned route | Implementation approach |
|---|---|---|
| Home / feed | `app/(tabs)/index.tsx` | Preserve feed and stories behavior; align shared tokens and larger-screen shell. |
| Video | `app/(tabs)/video.tsx` | Query published video posts from `posts`; keep ranking explicitly chronological until recommendation events exist. |
| Connect | `app/(tabs)/messages.tsx`, `app/chat/*` | Preserve existing personal/group/channel messaging and attachment flows. |
| Spaces | `app/(tabs)/spaces.tsx`, `app/groups/*`, `app/channels/*` | Reuse existing group/channel services and detail routes. |
| Market | `app/(tabs)/market.tsx` | Planned state only; no product/order tables or commerce provider in the connected backend. |
| Map | `app/(tabs)/map.tsx` | Planned state only; no map provider or location-sharing/consent backend. |
| Studio | `app/(tabs)/studio.tsx` | Show real post/follower/like counts; no fabricated views, reach, revenue, or scheduling data. |
| Events | `app/(tabs)/events.tsx` | Planned state only; no events schema. |
| Mini Apps | `app/(tabs)/mini-apps.tsx` | Planned state only; no mini-app registry/runtime. |
| Live | `app/(tabs)/live.tsx` | Planned state only; no live-stream service. Existing call controls are not a verified RTC implementation. |
| Wallet | `app/(tabs)/wallet.tsx` | Planned state only; no wallet/ledger/payment provider. |
| Create / story / post details | `app/(tabs)/create.tsx`, `app/story/*`, `app/post/*` | Preserve current upload, story and post interactions. |
| Search | `app/(tabs)/search.tsx` | Implemented live search across people, posts, videos, public groups, and public channels; events/products/files remain unavailable until their data modules exist. |
| Profile / notifications / settings | existing routes | Preserve behavior and align through shared tokens. |

## Live Supabase verification

The connected `lumo` project is active and contains the current profiles, posts, follows, stories, messages, group/channel, reaction, saved-post, notification, and moderation tables. All inspected public tables have RLS enabled. There are no Edge Functions and no products, orders, events, mini-app, wallet, location-sharing, live-stream, or creator-analytics tables. No database migrations are applied by this implementation pass.

## Quality gates

1. Read before modifying; preserve application architecture and existing behavior.
2. Keep all credentials out of deliverable archives.
3. Run TypeScript checks and Expo web export after implementation.
4. Report exactly which checks ran; visual and device QA require a running browser/device and must not be inferred from a successful bundle.
