# 1st M.I. Tactical Centre → Discord Activity Setup

This package contains everything you need to turn your existing Vercel web app into a Discord Activity.

---

## Files included

```
mi-discord-activity-v1.4.8/
├── api/
│   └── token.js                  ← Vercel serverless function (OAuth token exchange)
├── public/
│   └── discord-activity.js       ← Client-side Discord SDK bootstrap
├── mi-web-update-v1.4.8/
│   ├── index-D8SEAL-n.js         ← Your original app build
│   ├── UPLOAD-INSTRUCTIONS.txt
│   └── version.txt
└── DISCORD-ACTIVITY-SETUP.md     ← This file
```

---

## Step-by-step

### 1. Discord Developer Portal

1. Go to https://discord.com/developers/applications
2. Create (or open) your application
3. Copy the **Application ID** (this is your Client ID)
4. Go to **OAuth2** → copy the **Client Secret**
5. Under **OAuth2 → Redirects** add:
   - `https://your-app.vercel.app`
   - `http://localhost:3000` (for local testing)
6. Go to **Activities** → enable Activities
7. Under **URL Mappings** add:

| Prefix | Target                          |
|--------|---------------------------------|
| `/`    | `https://your-app.vercel.app`   |

---

### 2. Vercel Environment Variables

In your Vercel project → Settings → Environment Variables, add:

| Name                    | Value                     |
|-------------------------|---------------------------|
| `DISCORD_CLIENT_ID`     | Your Application ID       |
| `DISCORD_CLIENT_SECRET` | Your Client Secret        |

Redeploy after adding them.

---

### 3. Add the files to your Vercel project

- Put `api/token.js` in the **root** of your Vercel project (creates `/api/token` endpoint)
- Put `public/discord-activity.js` in your public/static folder

---

### 4. Load the Discord bootstrap

You need to load `discord-activity.js` on the page.

**Easiest way** (if you control `index.html`):

```html
<script type="module" src="/discord-activity.js"></script>
```

**Alternative** – if you only have the built JS:

Open `discord-activity.js` and replace:

```js
const CLIENT_ID = "YOUR_DISCORD_CLIENT_ID_HERE";
```

with your real Client ID.

Then make sure the script is loaded after your main app.

---

### 5. Test

1. Deploy to Vercel
2. In Discord, open a voice channel
3. Click the rocket / Activities button
4. Search for your app name and launch it

---

## Important notes

- The original `index-D8SEAL-n.js` is a **minified production build**.  
  I did **not** modify it. The Discord integration is added as a separate script so it doesn’t break your existing app.
- For a deeper integration (showing Discord username inside the Tactical Centre, etc.) you will eventually need the **source code** so the SDK can be imported properly inside the React app.
- The bootstrap only runs when it detects it is inside a Discord Activity iframe. Outside Discord your site continues to work normally.

---

## Need a proper source-level integration?

If you can share the original React / Vite project (the source, not just the built files), I can give you a clean integration that is part of the app itself instead of a separate script.
