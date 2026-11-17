# LUMO

LUMO is a social app built with Expo, React Native, TypeScript and Supabase.

## Features

- Personalized home feed, profiles, likes and comments
- Stories and short-form video browsing
- Direct messaging with photo, video and file attachments
- Groups, channels and content forwarding
- Search and creator tools
- Private activity history, including likes, comments, forwards and app usage time

## Tech stack

- Expo SDK 54
- React Native and TypeScript
- Expo Router
- Supabase Auth, Postgres, Storage and Row Level Security

## Getting started

1. Install Node.js and Git.
2. Clone this repository and enter the project folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

5. Set your own Supabase project URL and publishable key in `.env`. Add a Carto API key only if you use the map features.
6. Apply the SQL migrations in `supabase/migrations` to your Supabase project in filename order. Review each migration and configure the required Storage buckets and policies for your own project.
7. Start the app:

   ```bash
   npx expo start
   ```

For web:

```bash
npm run web
```

For a TypeScript check:

```bash
npm run typecheck
```

## Environment variables

See `.env.example` for the variable names. Real credentials belong only in your local `.env` file. Never commit that file.

The app uses the Supabase client-side publishable key. Protect application data with Row Level Security policies and never place a Supabase service-role key in the client app.

## Notes

This repository contains the application source code. A public GitHub repository does not itself host a live app; running LUMO requires a configured Supabase project and its environment variables.
