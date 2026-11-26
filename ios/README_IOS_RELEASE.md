# TALASH Ai — iOS App Store Release Preparation Guide

- **Application Name:** `TALASH Ai`
- **Creator:** `Shams Talash`
- **Bundle Identifier:** `com.shamstalash.talashai`
- **Capacitor Config:** `/capacitor.config.ts`

> Building an `.ipa` binary for the Apple App Store or TestFlight requires macOS + Xcode + an Apple Developer Program account ($99/year).

## 1. Prerequisites on macOS
1. Install Node.js 22+ and Xcode 15+ from the Mac App Store.
2. Install CocoaPods (`sudo gem install cocoapods` or `brew install cocoapods`).
3. Sign into Xcode with your Apple Developer account (`shamsmomtaze33@gmail.com` or your Apple ID).

## 2. Generate & Sync the iOS Xcode Project
From the project root on macOS:

```bash
npm ci
npm run build
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/splash-screen
npx cap add ios
npx cap sync ios
npx cap open ios
```

## 3. Required `Info.plist` & Signing Settings in Xcode
Inside Xcode -> **App** target:
1. Set **Bundle Identifier** to `com.shamstalash.talashai`.
2. Set **Display Name** to `TALASH Ai`.
3. Under **Signing & Capabilities**, choose your Apple Developer **Team** and enable automatic signing.
4. Add required privacy descriptions to `ios/App/App/Info.plist`:
   - `NSMicrophoneUsageDescription`: `TALASH Ai uses the microphone for Pashto, Arabic, and English voice input.`
   - `NSPhotoLibraryUsageDescription`: `TALASH Ai uses photo library access so you can upload images for analysis.`
   - `NSCameraUsageDescription`: `TALASH Ai uses the camera to capture images for AI analysis.`
5. Set the App Icon asset using `/public/pwa-512x512.png` (no transparency) and LaunchScreen background color `#18181b`.

## 4. Archive & Upload to TestFlight / App Store Connect
1. Select **Any iOS Device (arm64)** as the build target.
2. Choose **Product -> Archive**.
3. In the Xcode Organizer window, click **Distribute App -> App Store Connect -> Upload**.
4. Open App Store Connect, complete your Privacy Policy URL, screenshots, and submit for TestFlight or App Store review.
