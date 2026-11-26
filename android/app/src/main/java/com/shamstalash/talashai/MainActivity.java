package com.shamstalash.talashai;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {
    private static final int COSMIC_DARK_BG = 0xFF030712;
    private static final int SKY_CYAN_ACCENT = 0xFF38BDF8;
    private static final long MIN_SPLASH_MS = 950L;
    private static final long MAX_SPLASH_MS = 7000L;

    private WebView webView;
    private FrameLayout splashOverlay;
    private ValueCallback<Uri[]> filePathCallback;
    private PermissionRequest pendingWebPermissionRequest;
    private long launchTimestampMs;
    private boolean splashDismissed = false;
    private boolean pageHasError = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private final ActivityResultLauncher<String[]> audioPermissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), result -> {
                if (pendingWebPermissionRequest != null) {
                    boolean granted = Boolean.TRUE.equals(result.get(Manifest.permission.RECORD_AUDIO));
                    if (granted) {
                        pendingWebPermissionRequest.grant(pendingWebPermissionRequest.getResources());
                    } else {
                        pendingWebPermissionRequest.deny();
                    }
                    pendingWebPermissionRequest = null;
                }
            });

    private final ActivityResultLauncher<Intent> filePickerLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                if (filePathCallback == null) return;
                Uri[] results = WebChromeClient.FileChooserParams.parseResult(result.getResultCode(), result.getData());
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            });

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                value,
                getResources().getDisplayMetrics()
        ));
    }

    private FrameLayout buildNativeSplashOverlay() {
        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(COSMIC_DARK_BG);
        overlay.setClickable(true);
        overlay.setFocusable(true);

        ImageView cosmicBg = new ImageView(this);
        cosmicBg.setImageResource(R.drawable.splash_bg);
        cosmicBg.setScaleType(ImageView.ScaleType.CENTER_CROP);
        cosmicBg.setAlpha(0.76f);
        overlay.addView(cosmicBg, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        LinearLayout centerStack = new LinearLayout(this);
        centerStack.setOrientation(LinearLayout.VERTICAL);
        centerStack.setGravity(Gravity.CENTER);
        centerStack.setPadding(dp(24), dp(24), dp(24), dp(24));

        ImageView helmetLogo = new ImageView(this);
        helmetLogo.setImageResource(R.drawable.splash_icon);
        helmetLogo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(dp(188), dp(188));
        logoParams.bottomMargin = dp(16);
        centerStack.addView(helmetLogo, logoParams);

        SpannableString brandText = new SpannableString("TALASH Ai");
        brandText.setSpan(new ForegroundColorSpan(Color.WHITE), 0, 7, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        brandText.setSpan(new StyleSpan(Typeface.BOLD), 0, 9, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        brandText.setSpan(new ForegroundColorSpan(SKY_CYAN_ACCENT), 7, 9, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        brandText.setSpan(new StyleSpan(Typeface.ITALIC), 7, 9, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);

        TextView titleView = new TextView(this);
        titleView.setText(brandText);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 34);
        titleView.setGravity(Gravity.CENTER);
        centerStack.addView(titleView);

        TextView subtitleView = new TextView(this);
        subtitleView.setText("Your Intelligent AI Assistant");
        subtitleView.setTextColor(0xFFE2E8F0);
        subtitleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        subtitleView.setTypeface(null, Typeface.ITALIC);
        subtitleView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        subParams.topMargin = dp(8);
        subParams.bottomMargin = dp(24);
        centerStack.addView(subtitleView, subParams);

        ProgressBar spinner = new ProgressBar(this);
        spinner.setIndeterminate(true);
        spinner.setIndeterminateTintList(ColorStateList.valueOf(SKY_CYAN_ACCENT));
        LinearLayout.LayoutParams spinnerParams = new LinearLayout.LayoutParams(dp(36), dp(36));
        spinnerParams.bottomMargin = dp(10);
        centerStack.addView(spinner, spinnerParams);

        TextView loadingLabel = new TextView(this);
        loadingLabel.setText("Loading...");
        loadingLabel.setTextColor(0xFFCBD5E1);
        loadingLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        loadingLabel.setGravity(Gravity.CENTER);
        centerStack.addView(loadingLabel);

        FrameLayout.LayoutParams centerParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
        );
        overlay.addView(centerStack, centerParams);

        SpannableString creatorText = new SpannableString("Created by: Shams Talash");
        creatorText.setSpan(new ForegroundColorSpan(0xFF94A3B8), 0, 12, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        creatorText.setSpan(new ForegroundColorSpan(SKY_CYAN_ACCENT), 12, creatorText.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        creatorText.setSpan(new StyleSpan(Typeface.BOLD), 12, creatorText.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);

        TextView footerView = new TextView(this);
        footerView.setText(creatorText);
        footerView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        footerView.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams footerParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL
        );
        footerParams.bottomMargin = dp(28);
        overlay.addView(footerView, footerParams);

        return overlay;
    }

    private void dismissSplashOverlay() {
        if (splashDismissed || splashOverlay == null) return;
        splashDismissed = true;
        long elapsed = SystemClock.elapsedRealtime() - launchTimestampMs;
        long delay = Math.max(0L, MIN_SPLASH_MS - elapsed);
        mainHandler.postDelayed(() -> {
            if (splashOverlay == null) return;
            splashOverlay.animate()
                    .alpha(0f)
                    .setDuration(280L)
                    .withEndAction(() -> {
                        if (splashOverlay != null) {
                            splashOverlay.setVisibility(View.GONE);
                        }
                    })
                    .start();
        }, delay);
    }

    private void showOfflineFallback(final String targetUrl) {
        String offlineHtml = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'/>"
                + "<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;"
                + "background:#030712;color:#f1f5f9;font-family:sans-serif;padding:24px;text-align:center;}"
                + ".card{max-width:340px;width:100%;background:#071127;border:1px solid rgba(56,189,248,.35);"
                + "border-radius:22px;padding:28px 20px;box-shadow:0 20px 50px rgba(0,0,0,.6);}"
                + "h1{margin:0 0 8px;font-size:24px;letter-spacing:-0.02em;} .ai{color:#38BDF8;font-style:italic;}"
                + "p{margin:0 0 20px;color:#94a3b8;font-size:14px;line-height:1.5;}"
                + "button{background:linear-gradient(135deg,#2563eb,#0ea5e9);border:none;color:#fff;font-weight:700;"
                + "font-size:14px;padding:12px 24px;border-radius:12px;cursor:pointer;}</style></head>"
                + "<body><div class='card'><h1>TALASH <span class='ai'>Ai</span></h1>"
                + "<p>Unable to reach TALASH Ai servers. Check your internet connection and try again.</p>"
                + "<button onclick=\"window.location.href='" + targetUrl + "'\">Retry Connection</button>"
                + "</div></body></html>";
        webView.loadDataWithBaseURL(targetUrl, offlineHtml, "text/html", "UTF-8", null);
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        setTheme(R.style.AppTheme);
        super.onCreate(savedInstanceState);
        launchTimestampMs = SystemClock.elapsedRealtime();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(COSMIC_DARK_BG);

        webView = new WebView(this);
        webView.setBackgroundColor(COSMIC_DARK_BG);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        splashOverlay = buildNativeSplashOverlay();
        root.addView(splashOverlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        final String serverUrl = getString(R.string.talash_server_url);
        final String appHost = Uri.parse(serverUrl).getHost();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                if (host != null && (host.equals(appHost) || host.endsWith(".talash.ai"))) {
                    return false;
                }
                CustomTabsIntent customTabsIntent = new CustomTabsIntent.Builder().build();
                customTabsIntent.launchUrl(MainActivity.this, uri);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (!pageHasError) {
                    dismissSplashOverlay();
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame()) {
                    pageHasError = true;
                    dismissSplashOverlay();
                    showOfflineFallback(serverUrl);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
                            == PackageManager.PERMISSION_GRANTED) {
                        request.grant(request.getResources());
                    } else {
                        pendingWebPermissionRequest = request;
                        audioPermissionLauncher.launch(new String[]{Manifest.permission.RECORD_AUDIO});
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                Intent intent = params.createIntent();
                filePickerLauncher.launch(intent);
                return true;
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        mainHandler.postDelayed(this::dismissSplashOverlay, MAX_SPLASH_MS);
        webView.loadUrl(serverUrl);
    }

    @Override
    protected void onDestroy() {
        mainHandler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
