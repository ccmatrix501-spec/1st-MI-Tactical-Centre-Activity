1st M.I. Tactical Centre – Discord Activity package
Source: github.com/ccmatrix501-spec/Matrix-s-1st-MI-Tactical-Centre (web v1.4.8)
Client ID: 1532302380237066271

HOW TO DEPLOY
1. Open GitHub repo: 1st-MI-Tactical-Centre-Activity
2. Delete old files (or replace everything)
3. Upload ALL contents of this folder to the repo ROOT
4. Vercel (connected to Activity repo) will redeploy automatically
5. Env vars on Vercel:
   DISCORD_CLIENT_ID     = 1532302380237066271
   DISCORD_CLIENT_SECRET = (from Discord Developer Portal)
6. Discord URL Mapping:
   Prefix /
   Target: matrix-s-1st-mi-tactical-centre.vercel.app
7. Test in a voice channel

PC white screen: Discord → Settings → Advanced → Hardware Acceleration OFF
