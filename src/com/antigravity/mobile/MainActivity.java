package com.antigravity.mobile;

import android.Manifest;
import android.accounts.AccountManager;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.util.ArrayList;
import java.util.Locale;

public class MainActivity extends Activity {

    private static final int REQ_VOICE = 101;
    private static final int REQ_PERMS = 102;
    private static final int REQ_CHOOSE_ACCOUNT = 103;

    private WebView webView;
    private AntigravityNativeBridge nativeBridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Dark theme status & navigation bar
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.parseColor("#070A0F"));
            window.setNavigationBarColor(Color.parseColor("#070A0F"));
        }

        FrameLayout layout = new FrameLayout(this);
        layout.setBackgroundColor(Color.parseColor("#0D1117"));

        webView = new WebView(this);
        layout.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(layout);

        setupWebView();
        checkPermissions();

        // Handle OAuth redirect intents if app was launched via deep link
        handleIntent(getIntent());

        // Auto-detect if Termux server is running on localhost:8080
        new Thread(() -> {
            boolean termuxRunning = false;
            try {
                java.net.Socket s = new java.net.Socket();
                s.connect(new java.net.InetSocketAddress("127.0.0.1", 8080), 300);
                s.close();
                termuxRunning = true;
            } catch (Exception ignored) {}

            final boolean isRunning = termuxRunning;
            runOnUiThread(() -> {
                if (isRunning) {
                    webView.loadUrl("http://127.0.0.1:8080");
                } else {
                    webView.loadUrl("file:///android_asset/app/index.html");
                }
            });
        }).start();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent != null && intent.getData() != null) {
            Uri data = intent.getData();
            if ("antigravity".equals(data.getScheme())) {
                // e.g. antigravity://oauth2callback?code=...
                String query = data.getQuery();
                if (query != null) {
                    webView.evaluateJavascript("window.onOAuthCallback && window.onOAuthCallback('" + query.replace("'", "\\'") + "');", null);
                }
            }
        }
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setDisplayZoomControls(false);

        // Use modern mobile Chrome User-Agent to ensure full Google OAuth compatibility
        settings.setUserAgentString("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(false);
        }

        webView.setBackgroundColor(Color.parseColor("#0D1117"));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        nativeBridge = new AntigravityNativeBridge(this);
        webView.addJavascriptInterface(nativeBridge, "AntigravityBridge");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    request.grant(request.getResources());
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("antigravity://")) {
                    handleIntent(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    return true;
                }
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                }
                return false;
            }
        });
    }

    private void checkPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            ArrayList<String> perms = new ArrayList<>();
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.RECORD_AUDIO);
            }
            if (checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            }
            if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
            }
            if (!perms.isEmpty()) {
                requestPermissions(perms.toArray(new String[0]), REQ_PERMS);
            }
        }
    }

    public void startNativeGoogleSignIn() {
        try {
            Intent intent = AccountManager.newChooseAccountIntent(
                    null,
                    null,
                    new String[]{"com.google"},
                    null,
                    null,
                    null,
                    null);
            startActivityForResult(intent, REQ_CHOOSE_ACCOUNT);
        } catch (Exception e) {
            startWebGoogleSignIn();
        }
    }

    public void startWebGoogleSignIn() {
        try {
            String oauthUrl = "https://accounts.google.com/o/oauth2/v2/auth?" +
                    "client_id=1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com&" +
                    "response_type=token&" +
                    "redirect_uri=urn:ietf:wg:oauth:2.0:oob&" +
                    "scope=openid%20email%20profile%20https://www.googleapis.com/auth/userinfo.email%20https://www.googleapis.com/auth/userinfo.profile";
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(oauthUrl));
            startActivity(intent);
        } catch (Exception ignored) {}
    }

    public void startVoiceInput() {
        try {
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault());
            intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Диктуйте команду для Antigravity...");
            startActivityForResult(intent, REQ_VOICE);
        } catch (Exception e) {
            webView.evaluateJavascript("window.onVoiceInputError && window.onVoiceInputError('Распознавание речи недоступно');", null);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_VOICE && resultCode == RESULT_OK && data != null) {
            ArrayList<String> matches = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (matches != null && !matches.isEmpty()) {
                String spokenText = matches.get(0);
                String safeText = spokenText.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n");
                webView.evaluateJavascript("window.onVoiceInputResult && window.onVoiceInputResult('" + safeText + "');", null);
            }
        } else if (requestCode == REQ_CHOOSE_ACCOUNT && resultCode == RESULT_OK && data != null) {
            String accountName = data.getStringExtra(AccountManager.KEY_ACCOUNT_NAME);
            if (accountName != null && !accountName.trim().isEmpty()) {
                String safeEmail = accountName.trim().replace("\\", "\\\\").replace("'", "\\'");
                webView.evaluateJavascript("window.onGoogleSignInSuccess && window.onGoogleSignInSuccess('" + safeEmail + "');", null);
            }
        }
    }

    @Override
    public void onBackPressed() {
        webView.evaluateJavascript("window.handleBackPressed ? window.handleBackPressed() : false", value -> {
            if (!"true".equals(value)) {
                super.onBackPressed();
            }
        });
    }
}
