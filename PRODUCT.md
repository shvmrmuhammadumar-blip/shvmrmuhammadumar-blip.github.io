# Lumo — Product context

## Overview

Lumo is a phone-first social application for sharing visual moments and private conversations. It is implemented as one React Native codebase for iOS and Android, using Expo SDK 54, Expo Router, TypeScript and Supabase.

## Users and core jobs

- A signed-in member browses a feed containing their own posts and posts from accounts they follow.
- Members publish image posts, react with likes and comments, save posts privately, and manage their profile.
- Members discover people, follow or unfollow profiles, and view a profile's posts and connections.
- Members publish and view stories that expire from the product after 24 hours.
- Members exchange real-time direct messages, including supported media and file attachments.

## Product boundaries

- The primary product is a native mobile app. Web export is a smoke-test surface, not a replacement product.
- Supabase Auth supplies identity; PostgreSQL and Row Level Security supply the app's shared data policy; Supabase Storage holds uploaded media.
- No production credentials are stored in source control. Local configuration is supplied through `.env` using `.env.example` as a template.
- A backend feature is not considered verified until it has been exercised against a configured Supabase project with the required migrations applied.

## Known release work

The source README identifies report/block flows, privacy and terms pages, in-app account deletion, moderation, push notifications and private-media/account policy as release work. Do not present these as implemented capabilities until they exist and have been tested.
