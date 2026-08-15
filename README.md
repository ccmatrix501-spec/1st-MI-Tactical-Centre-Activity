# 1st M.I. Tactical Centre — Discord Activity source deployment

This repository is now a real Vite/React source project.

## Why this fixes the missing updates
The old Discord Activity repository served a prebuilt `assets/index-*.js` file. Editing the included desktop App.tsx/reference file did not rebuild that JavaScript, so Discord kept running old application code.

This project uses `src/App.tsx` as the live application source. Vercel runs `npm run build` automatically and Vite creates a new content-hashed JavaScript bundle whenever the app changes.

## GitHub / Vercel deployment
1. Replace the old Activity repository contents with this project's contents.
2. Commit/push to GitHub.
3. In Vercel, make sure the project is connected to that repository.
4. Framework Preset: Vite (Vercel should auto-detect it).
5. Build Command: `npm run build` (normally auto-detected).
6. Output Directory: `dist` (normally auto-detected).
7. Keep the environment variables:
   - `DISCORD_CLIENT_ID`
   - `DISCORD_BOT_TOKEN`
8. Redeploy.
9. In Discord Developer Portal -> Activities -> URL Mappings, make sure `/` points to THIS Vercel project's production domain.
10. Completely stop the Activity in Discord and launch it again.

## Future updates
Edit `src/App.tsx`, commit and push. Do not edit generated `dist/assets/index-*.js` files.

## Licensing
`public/web-compat.js` makes the web / Discord Activity build licence-free. The desktop / Microsoft Store build can continue using the real `window.steLicense` implementation.


## v1.6.1 — complete Discord thread picker

The Discord export picker now enumerates active threads plus archived public/forum threads and accessible archived private threads.

Bot permissions for complete results:
- View Channel
- Send Messages
- Attach Files
- Send Messages in Threads
- Read Message History (required to enumerate archived threads)
- Manage Threads (optional, but required to see/use all private or locked threads; without it only private threads the bot has joined can be listed)

Sending to an archived, unlocked thread will let Discord automatically unarchive it as part of the message send.
