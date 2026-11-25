# Sharing Aangan with testers

The Android app (`apps/mobile/dist/Aangan-1.0.0.apk`) talks to the Aangan server. **The server runs on your PC**, so for people outside your Wi-Fi it must be reachable from the internet. Two parts:

## 1. You: make the server reachable

**Quick way (free, no account):**

```powershell
winget install --id Cloudflare.cloudflared        # once
.\scripts\share-backend.ps1                       # starts the API + a public tunnel
```

It prints an address like `https://random-words.trycloudflare.com`. Keep the window open while people test. **The address changes every run**, so testers must re-enter it each time you restart. Your PC must be on and online.

**Stable way (recommended once testing is serious):** host the API on a small always-on server (Render, Fly.io, Railway, a VPS). Then bake that fixed address into the app so testers never type anything:

```powershell
.\scripts\build-apk.ps1 -ServerUrl https://your-api.example.com
```

## 2. Testers: install and sign in

1. Send them the `.apk` file (WhatsApp, Drive, email).
2. On their Android phone: open the file → if asked, allow **"Install unknown apps"** for that app (Settings → Apps → Special access).
3. Open **Aangan** → swipe through the intro → **Get started** → create an account.
4. If it says it can't reach the server: on the sign-in screen tap **Connection settings**, paste the address you gave them, and try again.
5. Choose **Explore the Sharma family demo** to look around with sample data, or **Set up my family**.

Needs Android 8+ on a 64-bit phone (almost every phone since 2017). iPhones can't install an APK.

## What testers should know (tell them)

- It is a **prototype. Use fake data only.** Do not enter real Aadhaar, PAN, medical or banking details.
- Ambulance dispatch, hospital delivery, bill payment, bookings and phone calls are **simulated** and labelled as such. In a real emergency call **112 or 108**.
- Documents they scan are read by Google Gemini's free tier, which may use them to improve models.
- Anyone with the server address can create an account (limited to 10 sign-ups per hour per address). Email addresses are not verified.

## Keeping it working

- **Back up `apps/mobile/credentials/`** (the signing key and its password). If you lose it you can still build, but testers must uninstall the old app first. It is git-ignored on purpose; never commit it.
- To ship an update, raise `version` (and `android.versionCode`) in `apps/mobile/app.json`, then run `.\scripts\build-apk.ps1`. Testers install the new file over the old one and keep their login.
- Check that the server is healthy: open `<server address>/v1/health`. You should see `{"ok":true,...}`.
- The build allows plain `http://` addresses so it also works on your home Wi-Fi (`http://192.168.x.x:8000`). For anything public, use the `https` tunnel/host address.
