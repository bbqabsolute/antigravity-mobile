package com.antigravity.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
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

        webView.loadUrl("file:///android_asset/app/index.html");
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
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url));
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

    public void startVoiceInput() {
        try {
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault());
            intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Диктуйте команду для Antigravity...");
            startActivityForResult(intent, REQ_VOICE);
        } catch (Exception e) {
            // Speech recognition not supported on device
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
        }
    }

    @Override
    public void onBackPressed() {
        // Delegate back press to web app (e.g. to close editor modal or switch to chat tab)
        webView.evaluateJavascript("window.handleBackPressed ? window.handleBackPressed() : false", value -> {
            if (!"true".equals(value)) {
                super.onBackPressed();
            }
        });
    }
}
