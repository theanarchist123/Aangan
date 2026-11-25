# Updating Aangan without rebuilding the APK

There are three kinds of change. Each has its own, much faster, route.

| What you changed | What to do | Testers must |
|---|---|---|
| **Server code** (the API, AI, database logic) | Commit and push to GitHub. Render redeploys by itself in a few minutes | Nothing. They already use the new server |
| **App screens, logic, fixes** (anything in `apps/mobile/src`, texts, colours) | `.\scripts\publish-update.ps1 -Message "what changed"` | Open the app. A banner says "A new version is ready". Tap **Restart** |
| **Native changes** (new permission, new native library, Expo upgrade, new app icon) | Build a new APK (`.\scripts\build-apk.ps1 -ServerUrl ...`) and raise the version | Tap **Get it** in the banner, install the file over the old app |

Most day-to-day fixes are the first two and need **no APK at all**.

## One-time setup for over-the-air updates

Over-the-air updates are delivered by Expo's free **EAS Update** service.

1. Create a free account at https://expo.dev.
2. In a terminal:
   ```powershell
   cd d:\Wild_app\apps\mobile
   npx eas-cli login          # sign in once
   npx eas-cli init           # links the app to your account (adds a project id)
   npx eas-cli update:configure
   ```
3. Build **one more APK** (the setup above must be in the installed app): `.\scripts\build-apk.ps1 -ServerUrl https://aangan-api-zz4a.onrender.com`. After that, ordinary changes never need an APK.

## Publishing a normal fix

```powershell
.\scripts\publish-update.ps1 -Message "Fixed document upload"
```

It checks the code for errors, bundles it, and uploads it. Installed apps fetch it in the background the next time they open (and whenever they return to the foreground), then show the restart banner.

An update only reaches apps with the **same version number** in `apps/mobile/app.json` (this protects people with an older APK from receiving code that needs newer native features).

## Announcing a new APK (native changes)

1. Raise `version` and `android.versionCode` in `apps/mobile/app.json` (for example `1.1.0` and `2`).
2. Build it: `.\scripts\build-apk.ps1 -ServerUrl https://aangan-api-zz4a.onrender.com`.
3. Upload `apps\mobile\dist\Aangan-1.1.0.apk` somewhere testers can download it, for example a **GitHub Release** (your repo → Releases → Draft a new release → attach the file) and copy the file's link.
4. In Render → your service → **Environment**, set:
   - `APP_LATEST_VERSION_CODE` = `2`
   - `APP_LATEST_VERSION_NAME` = `1.1.0`
   - `APP_APK_URL` = the download link
   - `APP_RELEASE_NOTES` = one short sentence about what is new
   - `APP_MIN_VERSION_CODE` = `2` only if the old version can no longer work. Those apps then show a full-screen "Please update" instead of a dismissable banner.

   Render restarts the server and every installed app starts showing "Version 1.1.0 is available".

## Limits to know

- Android does not allow an app to install itself silently. Native updates always need the user to tap the downloaded file (the Play Store is the only way around that).
- Updates and the banner only work in an **installed build**, not in Expo Go or the browser preview.
- Free EAS Update has monthly limits that are generous for a test group.
- If the server is asleep (free hosting), the "new APK" check simply waits until the next time the app opens.
