package com.antigravity.mobile;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

public class ShellExecutor {

    public static class ShellResult {
        public int exitCode;
        public String stdout;
        public String stderr;

        public JSONObject toJson() {
            JSONObject obj = new JSONObject();
            try {
                obj.put("exitCode", exitCode);
                obj.put("stdout", stdout);
                obj.put("stderr", stderr);
            } catch (Exception ignored) {}
            return obj;
        }
    }

    public static ShellResult execute(String command, String cwdStr, int timeoutSeconds) {
        ShellResult res = new ShellResult();
        StringBuilder outBuf = new StringBuilder();
        StringBuilder errBuf = new StringBuilder();

        try {
            File cwd = (cwdStr != null && !cwdStr.trim().isEmpty()) ? new File(cwdStr) : null;
            if (cwd != null && !cwd.exists()) {
                cwd.mkdirs();
            }

            ProcessBuilder pb = new ProcessBuilder("/system/bin/sh", "-c", command);
            if (cwd != null && cwd.exists() && cwd.isDirectory()) {
                pb.directory(cwd);
            }

            // Setup basic PATH for Android tools and Termux if present
            pb.environment().put("PATH", "/system/bin:/system/xbin:/data/data/com.termux/files/usr/bin:" + System.getenv("PATH"));
            pb.redirectErrorStream(false);

            Process process = pb.start();

            Thread outThread = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    char[] buffer = new char[4096];
                    int read;
                    while ((read = reader.read(buffer)) != -1) {
                        if (outBuf.length() < 256 * 1024) { // limit 256KB
                            outBuf.append(buffer, 0, read);
                        }
                    }
                } catch (Exception ignored) {}
            });

            Thread errThread = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8))) {
                    char[] buffer = new char[4096];
                    int read;
                    while ((read = reader.read(buffer)) != -1) {
                        if (errBuf.length() < 128 * 1024) { // limit 128KB
                            errBuf.append(buffer, 0, read);
                        }
                    }
                } catch (Exception ignored) {}
            });

            outThread.start();
            errThread.start();

            boolean finished = process.waitFor(timeoutSeconds > 0 ? timeoutSeconds : 60, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                res.exitCode = -1;
                res.stdout = outBuf.toString();
                res.stderr = "Command timed out after " + timeoutSeconds + " seconds.\n" + errBuf.toString();
                return res;
            }

            outThread.join(2000);
            errThread.join(2000);

            res.exitCode = process.exitValue();
            res.stdout = outBuf.toString();
            res.stderr = errBuf.toString();

        } catch (Exception e) {
            res.exitCode = -1;
            res.stdout = "";
            res.stderr = "Execution error: " + e.getMessage();
        }

        return res;
    }
}
