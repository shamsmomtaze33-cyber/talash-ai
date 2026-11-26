# TALASH Ai — Official Ownership, Production Deployment, PWA, Android & iOS Launch Guide

**Official Application Name:** `TALASH Ai`  
**Creator:** `Shams Talash`  
**Native Package / Bundle ID:** `com.shamstalash.talashai`  
**Official Owner Account:** `shamsmomtaze33@gmail.com` (`super_admin`, database-enforced immutable owner)

---

## 1. Owner Control & Authentication
1. Open **TALASH Ai** in your browser.
2. Sign in with `shamsmomtaze33@gmail.com` (email + password, protected by salted `crypto.scryptSync` hashing).
3. Open **Settings (top-left gear icon)** -> **Open Admin Panel** to manage:
   - Registered users, email verification, roles (`user`, `admin`, `super_admin`), suspension/activation, and password recovery codes
   - Global AI routing & model defaults
   - Custom domain, SEO metadata & Google Search Console verification tag
   - Pashto Islamic Learning Center SQLite CMS (`data/talash_learning.db`, 12 categories / 223 topics) + full JSON database backup export
   - Owner passkey rotation

> **Database Immutability Guarantee:** SQLite triggers (`prevent_owner_role_tamper` and `prevent_owner_delete`) prevent any user or API call from deleting or demoting `shamsmomtaze33@gmail.com`.

---

## 2. Production Website Deployment & Custom Domain (HTTPS)
1. **AI Studio Hosted URL:**  
   - Shared / Production Preview URL: `https://ais-pre-raiv567ekxtle6r2ircqo4-727549841273.europe-west2.run.app`  
   - Click **Share / Publish** in Google AI Studio to make this HTTPS endpoint publicly accessible.
2. **Self-Hosted Node.js / Cloud Run / VPS Deployment:**
   - Set environment variables from `.env.example` (never expose API keys to client code):
     - `GEMINI_API_KEY` (required)
     - `OPENAI_API_KEY` (optional)
     - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` or `RESEND_API_KEY` (for automated verification & password recovery emails)
     - `CUSTOM_DOMAIN` (e.g. `https://talashai.com`)
     - `GOOGLE_SITE_VERIFICATION` (optional Google Search Console HTML token)
   - Build and launch:
     ```bash
     npm ci
     npm run build
     NODE_ENV=production npm start
     ```
   - Point your custom domain DNS (`A` or `CNAME`) to your host with HTTPS enabled, then save the canonical URL inside **Owner Admin Panel -> Global AI & SEO**.

---

## 3. Installable Web App (PWA — Active Now)
TALASH Ai includes a full Progressive Web App configuration (`manifest.webmanifest`, Workbox Service Worker with offline app-shell caching, adaptive `192x192` / `512x512` / `maskable` icons, and `apple-touch-icon.png`):
- **Android Chrome:** Tap **Install TALASH Ai App** inside Settings or use Chrome Menu -> **Install app**.
- **iOS Safari:** Tap **Install on iPhone / iPad** inside Settings (or Safari Share -> **Add to Home Screen**).
- **Desktop Chrome / Edge:** Click the address bar Install icon.

---

## 4. Android Native App (`APK` & Google Play `AAB`) — `com.shamstalash.talashai`
Because Java JDK and Android SDK are not installed inside this cloud container, compiled `.apk` / `.aab` binaries cannot be built locally inside the preview workspace. The complete Android Gradle project (`/android/`), adaptive icons (`/android/app/src/main/res/mipmap-*`), dark splash screen (`/android/app/src/main/res/drawable/launch_screen.xml`), Capacitor configuration (`/capacitor.config.ts`), and automated GitHub Actions builder (`/.github/workflows/build-android-apk.yml`) are all ready:

1. **Generate Upload Keystore (once, on your computer):**
   ```bash
   keytool -genkey -v -keystore talash-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias talash-key
   ```
   Keep `talash-release.jks` and passwords strictly private.
2. **Cloud Build via GitHub Actions (Recommended):**
   - Push the repo to your private GitHub repository.
   - Add GitHub Actions secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
   - Run **Actions -> Build TALASH Ai Android APK** to download signed `.apk` (direct install) and `.aab` (Google Play Console).
3. **Local Android Studio Build:**
   - Open `/android/` in Android Studio -> **Build -> Generate Signed App Bundle / APK**.

---

## 5. iOS App Store Preparation — `com.shamstalash.talashai`
See `/ios/README_IOS_RELEASE.md` for full macOS + Xcode + `@capacitor/ios` build, `Info.plist` permission keys, TestFlight, and App Store Connect submission instructions.

---

## 6. Optional Google & Facebook OAuth (Future Activation)
Google and Facebook login remain cleanly hidden from users until you obtain valid credentials from Google Cloud Console / Meta for Developers, configure `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` or `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET`, and enable them in **Owner Admin Panel -> OAuth & Auth**.
