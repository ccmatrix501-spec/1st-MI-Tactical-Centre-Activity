# 1st M.I. Combined Bot

One Discord bot for:

1. **After Action Reports** — reports, points, PL snapshots, voice reminders  
2. **Looking for Troopers** — LFG posts, recruit alerts, onboarding alerts  
3. **Tactical Centre** — specialisation question editor (Sentinel / Driller / Top Dog / Doughboy)

## Railway

- Start: `node index.js`
- Env: `TOKEN` or `DISCORD_TOKEN`
- Volume: `/app/data` (stats + specialisations.json)

## Developer Portal intents

- Server Members Intent  
- Message Content Intent  
- Guild Voice States (default with voice)

## Commands

### AAR
`/setup` `/drops` `/droplist` `/1stmidrops` `/servermembers` `/setstats` `/settotal` `/setall` `/undolast` `/testreminder` `/plpanel`

### Looking for Troopers
`/count` `/check` `/lfttest`

### Tactical Centre
No slash commands — uses permanent **Edit … Questions** buttons in the four specialisation threads.


## PL snapshot / AAR flow

- The **PL Snapshot** records the Platoon Lead and everyone present in the Platoon Lead, Demon, Nightmare, Cerberus, and Hellfire voice channels.
- Squad Leads are **not** chosen when the snapshot is taken.
- When that PL starts an AAR, the saved roster auto-loads and the AAR asks them to select the Squad Lead from the people who were snapshotted in each squad.
- Demon, Nightmare, and Hellfire Squad Leads are required when those squads were occupied. Cerberus remains optional.
- Squad Lead selections apply to that AAR only; the base PL snapshot remains roster-only for the next AAR.

## Folders

- `images/` — LFG rotating images  
- `recruit_alert_images/` — recruit alert images  
- `data/specialisations.json` — TAC question bank  
- `aar-reminder.mp3` — AAR voice reminder  

## Important

Stop any separate AAR / LFT / TAC bots before deploying — one token, one process.
