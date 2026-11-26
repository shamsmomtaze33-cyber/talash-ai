// Capacitor configuration for TALASH Ai Android & iOS app shells.
// Package / Bundle ID: com.shamstalash.talashai
// Creator: Shams Talash
const config = {
  appId: 'com.shamstalash.talashai',
  appName: 'TALASH Ai',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    cleartext: false,
    // For thin-client live server wrapping (optional), uncomment and set your production URL:
    // url: process.env.TALASH_APP_URL || 'https://ais-pre-raiv567ekxtle6r2ircqo4-727549841273.europe-west2.run.app',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'automatic',
    scheme: 'TALASH Ai',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#18181b',
      showSpinner: false,
    },
  },
};

export default config;
