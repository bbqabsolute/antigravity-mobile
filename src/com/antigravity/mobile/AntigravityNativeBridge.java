package com.antigravity.mobile;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public class AntigravityNativeBridge {

    private final MainActivity activity;
    private final SharedPreferences prefs;

    public AntigravityNativeBridge(MainActivity activity) {
        this.activity = activity;
        this.prefs = activity.getSharedPreferences("antigravity_prefs", Context.MODE_PRIVATE);
    }

    @JavascriptInterface
    public void signInWithGoogle() {
        activity.runOnUiThread(activity::startNativeGoogleSignIn);
    }

    @JavascriptInterface
    public void signInWithGoogleWeb() {
        activity.runOnUiThread(activity::startWebGoogleSignIn);
    }

    @JavascriptInterface
    public String getDeviceGoogleAccounts() {
        JSONArray arr = new JSONArray();
        try {
            android.accounts.AccountManager am = android.accounts.AccountManager.get(activity);
            android.accounts.Account[] accounts = am.getAccountsByType("com.google");
            if (accounts != null) {
                for (android.accounts.Account acc : accounts) {
                    if (acc != null && acc.name != null) {
                        arr.put(acc.name);
                    }
                }
            }
        } catch (Exception ignored) {}
        return arr.toString();
    }

    @JavascriptInterface
    public String executeShell(String command, String cwd) {
        if (cwd == null || cwd.trim().isEmpty()) {
            cwd = getWorkspaceDir();
        }
        ShellExecutor.ShellResult res = ShellExecutor.execute(command, cwd, 60);
        return res.toJson().toString();
    }

    @JavascriptInterface
    public String readFile(String filePath, int startLine, int endLine) {
        JSONObject res = new JSONObject();
        try {
            File f = resolveFile(filePath);
            if (!f.exists()) {
                res.put("status", "error");
                res.put("error", "File not found: " + filePath);
                return res.toString();
            }
            if (f.isDirectory()) {
                res.put("status", "error");
                res.put("error", "Path is a directory: " + filePath);
                return res.toString();
            }

            StringBuilder sb = new StringBuilder();
            int currentLine = 0;
            int totalLines = 0;
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    currentLine++;
                    totalLines++;
                    if ((startLine <= 0 || currentLine >= startLine) && (endLine <= 0 || currentLine <= endLine)) {
                        sb.append(line).append("\n");
                    }
                }
            }
            res.put("status", "ok");
            res.put("content", sb.toString());
            res.put("totalLines", totalLines);
            res.put("path", f.getAbsolutePath());
        } catch (Exception e) {
            try {
                res.put("status", "error");
                res.put("error", e.getMessage());
            } catch (Exception ignored) {}
        }
        return res.toString();
    }

    @JavascriptInterface
    public String writeFile(String filePath, String content, boolean overwrite) {
        JSONObject res = new JSONObject();
        try {
            File f = resolveFile(filePath);
            if (f.exists() && !overwrite) {
                res.put("status", "error");
                res.put("error", "File already exists and overwrite is false");
                return res.toString();
            }

            File parent = f.getParentFile();
            if (parent != null && !parent.exists()) {
                parent.mkdirs();
            }

            try (FileOutputStream fos = new FileOutputStream(f, false)) {
                byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
                fos.write(bytes);
                res.put("status", "ok");
                res.put("path", f.getAbsolutePath());
                res.put("bytes", bytes.length);
            }
        } catch (Exception e) {
            try {
                res.put("status", "error");
                res.put("error", e.getMessage());
            } catch (Exception ignored) {}
        }
        return res.toString();
    }

    @JavascriptInterface
    public String replaceInFile(String filePath, String target, String replacement) {
        JSONObject res = new JSONObject();
        try {
            File f = resolveFile(filePath);
            if (!f.exists()) {
                res.put("status", "error");
                res.put("error", "File not found: " + filePath);
                return res.toString();
            }

            // Read full file
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            try (FileInputStream fis = new FileInputStream(f)) {
                byte[] buf = new byte[8192];
                int read;
                while ((read = fis.read(buf)) != -1) {
                    baos.write(buf, 0, read);
                }
            }
            String content = baos.toString(StandardCharsets.UTF_8.name());

            if (!content.contains(target)) {
                res.put("status", "error");
                res.put("error", "Target string not found in file");
                return res.toString();
            }

            String newContent = content.replace(target, replacement);
            try (FileOutputStream fos = new FileOutputStream(f, false)) {
                fos.write(newContent.getBytes(StandardCharsets.UTF_8));
            }

            res.put("status", "ok");
            res.put("path", f.getAbsolutePath());
        } catch (Exception e) {
            try {
                res.put("status", "error");
                res.put("error", e.getMessage());
            } catch (Exception ignored) {}
        }
        return res.toString();
    }

    @JavascriptInterface
    public String listFiles(String dirPath) {
        JSONArray arr = new JSONArray();
        try {
            File dir = resolveFile(dirPath);
            if (dir.exists() && dir.isDirectory()) {
                File[] list = dir.listFiles();
                if (list != null) {
                    for (File f : list) {
                        JSONObject item = new JSONObject();
                        item.put("name", f.getName());
                        item.put("path", f.getAbsolutePath());
                        item.put("isDirectory", f.isDirectory());
                        item.put("size", f.length());
                        item.put("lastModified", f.lastModified());
                        arr.put(item);
                    }
                }
            }
        } catch (Exception ignored) {}
        return arr.toString();
    }

    @JavascriptInterface
    public String searchCode(String dirPath, String patternStr, boolean isRegex) {
        JSONArray results = new JSONArray();
        try {
            File root = resolveFile(dirPath);
            Pattern pattern = isRegex ? Pattern.compile(patternStr) : Pattern.compile(Pattern.quote(patternStr), Pattern.CASE_INSENSITIVE);
            searchDirRecursive(root, pattern, results, 0);
        } catch (Exception ignored) {}
        return results.toString();
    }

    private void searchDirRecursive(File dir, Pattern pattern, JSONArray results, int depth) {
        if (dir == null || !dir.exists() || depth > 8 || results.length() > 200) return;
        File[] files = dir.listFiles();
        if (files == null) return;

        for (File f : files) {
            if (results.length() > 200) break;
            if (f.getName().startsWith(".") || f.getName().equals("node_modules") || f.getName().equals("__pycache__")) {
                continue;
            }
            if (f.isDirectory()) {
                searchDirRecursive(f, pattern, results, depth + 1);
            } else if (f.isFile() && f.length() < 1024 * 1024) { // Max 1MB file
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
                    String line;
                    int lineNum = 0;
                    while ((line = reader.readLine()) != null) {
                        lineNum++;
                        if (pattern.matcher(line).find()) {
                            JSONObject match = new JSONObject();
                            match.put("path", f.getAbsolutePath());
                            match.put("line", lineNum);
                            match.put("text", line.trim());
                            results.put(match);
                            if (results.length() > 200) break;
                        }
                    }
                } catch (Exception ignored) {}
            }
        }
    }

    @JavascriptInterface
    public String getWorkspaceDir() {
        String saved = prefs.getString("workspace_dir", null);
        if (saved != null && !saved.trim().isEmpty()) {
            File f = new File(saved);
            if (f.exists() || f.mkdirs()) {
                return f.getAbsolutePath();
            }
        }

        File external = Environment.getExternalStorageDirectory();
        if (external != null && external.canWrite()) {
            File projects = new File(external, "AntigravityProjects");
            projects.mkdirs();
            return projects.getAbsolutePath();
        }

        File fallback = new File(activity.getFilesDir(), "projects");
        fallback.mkdirs();
        return fallback.getAbsolutePath();
    }

    @JavascriptInterface
    public void setWorkspaceDir(String dirPath) {
        prefs.edit().putString("workspace_dir", dirPath).apply();
    }

    @JavascriptInterface
    public String getApiKey() {
        return prefs.getString("gemini_api_key", "");
    }

    @JavascriptInterface
    public void setApiKey(String key) {
        prefs.edit().putString("gemini_api_key", key).apply();
    }

    @JavascriptInterface
    public String getSelectedModel() {
        return prefs.getString("selected_model", "gemini-2.5-flash");
    }

    @JavascriptInterface
    public void setSelectedModel(String model) {
        prefs.edit().putString("selected_model", model).apply();
    }

    @JavascriptInterface
    public void vibrate(int milliseconds) {
        try {
            Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(milliseconds);
                }
            }
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void copyToClipboard(String text) {
        try {
            activity.runOnUiThread(() -> {
                ClipboardManager cm = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) {
                    cm.setPrimaryClip(ClipData.newPlainText("Antigravity", text));
                }
            });
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void startVoiceRecognition() {
        activity.runOnUiThread(activity::startVoiceInput);
    }

    @JavascriptInterface
    public String makeHttpRequest(String urlStr, String method, String headersJson, String bodyJson) {
        JSONObject response = new JSONObject();
        try {
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod(method.toUpperCase());
            conn.setConnectTimeout(30000);
            conn.setReadTimeout(120000); // 120s for deep reasoning models

            // Headers
            if (headersJson != null && !headersJson.trim().isEmpty()) {
                JSONObject headers = new JSONObject(headersJson);
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    conn.setRequestProperty(key, headers.getString(key));
                }
            }

            // Body
            if (bodyJson != null && !bodyJson.trim().isEmpty() && !method.equalsIgnoreCase("GET")) {
                conn.setDoOutput(true);
                byte[] bodyBytes = bodyJson.getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(bodyBytes);
                    os.flush();
                }
            }

            int code = conn.getResponseCode();
            response.put("statusCode", code);

            InputStream is = (code >= 200 && code < 400) ? conn.getInputStream() : conn.getErrorStream();
            if (is != null) {
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int r;
                while ((r = is.read(buf)) != -1) {
                    baos.write(buf, 0, r);
                }
                response.put("body", baos.toString(StandardCharsets.UTF_8.name()));
            } else {
                response.put("body", "");
            }
            response.put("error", JSONObject.NULL);

        } catch (Exception e) {
            try {
                response.put("statusCode", -1);
                response.put("body", "");
                response.put("error", e.getMessage());
            } catch (Exception ignored) {}
        }
        return response.toString();
    }

    @JavascriptInterface
    public void shareProjectZip(String dirPath) {
        try {
            File dir = resolveFile(dirPath);
            if (!dir.exists() || !dir.isDirectory()) return;

            File cacheDir = activity.getCacheDir();
            File zipFile = new File(cacheDir, dir.getName() + ".zip");
            if (zipFile.exists()) zipFile.delete();

            try (ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(zipFile))) {
                zipFolder(dir, dir.getAbsolutePath(), zos);
            }

            activity.runOnUiThread(() -> {
                Intent shareIntent = new Intent(Intent.ACTION_SEND);
                shareIntent.setType("application/zip");
                Uri uri = Uri.fromFile(zipFile);
                shareIntent.putExtra(Intent.EXTRA_STREAM, uri);
                shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                activity.startActivity(Intent.createChooser(shareIntent, "Поделиться проектом Antigravity"));
            });
        } catch (Exception ignored) {}
    }

    private void zipFolder(File folder, String basePath, ZipOutputStream zos) throws Exception {
        File[] files = folder.listFiles();
        if (files == null) return;
        byte[] buffer = new byte[8192];

        for (File file : files) {
            if (file.getName().startsWith(".") || file.getName().equals("__pycache__")) continue;
            if (file.isDirectory()) {
                zipFolder(file, basePath, zos);
            } else {
                String entryName = file.getAbsolutePath().substring(basePath.length() + 1).replace("\\", "/");
                zos.putNextEntry(new ZipEntry(entryName));
                try (FileInputStream fis = new FileInputStream(file)) {
                    int len;
                    while ((len = fis.read(buffer)) > 0) {
                        zos.write(buffer, 0, len);
                    }
                }
                zos.closeEntry();
            }
        }
    }

    private File resolveFile(String path) {
        if (path == null || path.trim().isEmpty()) {
            return new File(getWorkspaceDir());
        }
        File f = new File(path);
        if (f.isAbsolute()) {
            return f;
        }
        return new File(getWorkspaceDir(), path);
    }
}
