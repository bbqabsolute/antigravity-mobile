#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build Script for Antigravity Mobile Android APK
Compiles resources, Java sources, converts to DEX, packages assets, aligns and signs the APK.
"""

import os
import sys
import shutil
import zipfile
import subprocess
import glob

# Ensure UTF-8 stdout on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
BUILD_DIR = os.path.join(PROJECT_DIR, "build")
OUTPUT_APK = os.path.join(PROJECT_DIR, "Antigravity-Mobile.apk")
DESKTOP_DIR = os.path.expanduser(r"~\Desktop")
DESKTOP_APK = os.path.join(DESKTOP_DIR, "Antigravity-Mobile.apk")

# SDK paths detection
USER_PROFILE = os.environ.get("USERPROFILE", os.path.expanduser("~"))
ANDROID_HOME = os.environ.get("ANDROID_HOME", os.path.join(USER_PROFILE, "AppData", "Local", "Android", "Sdk"))

BUILD_TOOLS_DIR = os.path.join(ANDROID_HOME, "build-tools", "36.0.0")
PLATFORM_DIR = os.path.join(ANDROID_HOME, "platforms", "android-37.0")
ANDROID_JAR = os.path.join(PLATFORM_DIR, "android.jar")

AAPT2 = os.path.join(BUILD_TOOLS_DIR, "aapt2.exe")
D8 = os.path.join(BUILD_TOOLS_DIR, "d8.bat")
ZIPALIGN = os.path.join(BUILD_TOOLS_DIR, "zipalign.exe")
APKSIGNER = os.path.join(BUILD_TOOLS_DIR, "apksigner.bat")

KEYSTORE = os.path.join(USER_PROFILE, ".android", "debug.keystore")

# JDK detection
JAVA_HOME = os.environ.get("JAVA_HOME", r"C:\Program Files\Eclipse Adoptium\jdk-25.0.4.101-hotspot")
JAVAC = os.path.join(JAVA_HOME, "bin", "javac.exe")
if not os.path.exists(JAVAC):
    JAVAC = "javac"


def log(msg):
    print(f"[BUILD] {msg}")


def run_cmd(cmd, cwd=PROJECT_DIR):
    log(f"Running: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    res = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str), capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res.returncode != 0:
        print("\n--- STDOUT ---")
        print(res.stdout)
        print("\n--- STDERR ---")
        print(res.stderr)
        raise RuntimeError(f"Command failed with exit code {res.returncode}")
    return res.stdout


def main():
    log("==========================================")
    log("Starting Antigravity Mobile APK Build...")
    log("==========================================")

    # 0. Clean & Prepare build dirs
    if os.path.exists(BUILD_DIR):
        shutil.rmtree(BUILD_DIR)
    os.makedirs(BUILD_DIR, exist_ok=True)
    gen_dir = os.path.join(BUILD_DIR, "gen")
    classes_dir = os.path.join(BUILD_DIR, "classes")
    dex_dir = os.path.join(BUILD_DIR, "dex")
    os.makedirs(gen_dir, exist_ok=True)
    os.makedirs(classes_dir, exist_ok=True)
    os.makedirs(dex_dir, exist_ok=True)

    # 1. AAPT2 compile
    log("Step 1: Compiling Android resources with aapt2...")
    compiled_res = os.path.join(BUILD_DIR, "compiled_res.zip")
    res_dir = os.path.join(PROJECT_DIR, "res")
    run_cmd([AAPT2, "compile", "--dir", res_dir, "-o", compiled_res])

    # 2. AAPT2 link
    log("Step 2: Linking resources with aapt2...")
    manifest = os.path.join(PROJECT_DIR, "AndroidManifest.xml")
    unaligned_res_apk = os.path.join(BUILD_DIR, "unaligned_res.apk")
    run_cmd([
        AAPT2, "link",
        "-I", ANDROID_JAR,
        compiled_res,
        "--manifest", manifest,
        "-o", unaligned_res_apk,
        "--java", gen_dir,
        "--auto-add-overlay"
    ])

    # 3. Compile Java sources
    log("Step 3: Compiling Java sources with javac...")
    java_files = []
    for root, _, files in os.walk(os.path.join(PROJECT_DIR, "src")):
        for f in files:
            if f.endswith(".java"):
                java_files.append(os.path.join(root, f))
    for root, _, files in os.walk(gen_dir):
        for f in files:
            if f.endswith(".java"):
                java_files.append(os.path.join(root, f))

    javac_cmd = [
        JAVAC,
        "-cp", ANDROID_JAR,
        "-d", classes_dir,
        "--release", "17"
    ] + java_files
    run_cmd(javac_cmd)

    # 4. Convert classes to DEX with D8
    log("Step 4: Compiling bytecode to DEX with d8...")
    class_files = []
    for root, _, files in os.walk(classes_dir):
        for f in files:
            if f.endswith(".class"):
                class_files.append(os.path.join(root, f))

    d8_cmd = [
        D8,
        "--lib", ANDROID_JAR,
        "--min-api", "24",
        "--output", dex_dir
    ] + class_files
    run_cmd(d8_cmd)

    # 5. Assemble APK (copy resources APK, inject classes.dex & assets)
    log("Step 5: Assembling unaligned APK with assets...")
    unaligned_apk = os.path.join(BUILD_DIR, "unaligned.apk")
    shutil.copyfile(unaligned_res_apk, unaligned_apk)

    classes_dex = os.path.join(dex_dir, "classes.dex")
    assets_dir = os.path.join(PROJECT_DIR, "assets")

    with zipfile.ZipFile(unaligned_apk, "a", zipfile.ZIP_DEFLATED) as zf:
        # Add classes.dex
        zf.write(classes_dex, "classes.dex")
        
        # Add all assets
        for root, _, files in os.walk(assets_dir):
            for f in files:
                full_path = os.path.join(root, f)
                rel_path = os.path.relpath(full_path, PROJECT_DIR).replace("\\", "/")
                zf.write(full_path, rel_path)

    # 6. Zipalign APK
    log("Step 6: Aligning APK with zipalign...")
    aligned_apk = os.path.join(BUILD_DIR, "aligned.apk")
    run_cmd([ZIPALIGN, "-p", "-f", "4", unaligned_apk, aligned_apk])

    # 7. Sign APK with apksigner
    log("Step 7: Signing APK with apksigner...")
    if not os.path.exists(KEYSTORE):
        log("Generating debug keystore...")
        subprocess.run([
            "keytool", "-genkeypair", "-v",
            "-keystore", KEYSTORE,
            "-storepass", "android",
            "-alias", "androiddebugkey",
            "-keypass", "android",
            "-keyalg", "RSA", "-keysize", "2048",
            "-validity", "10000",
            "-dname", "CN=Android Debug,O=Android,C=US"
        ], check=True)

    run_cmd([
        APKSIGNER, "sign",
        "--ks", KEYSTORE,
        "--ks-pass", "pass:android",
        "--out", OUTPUT_APK,
        aligned_apk
    ])

    # 8. Copy to Desktop for user convenience
    shutil.copyfile(OUTPUT_APK, DESKTOP_APK)

    apk_size = os.path.getsize(OUTPUT_APK) / (1024 * 1024)
    log("==========================================")
    log(f"SUCCESS! APK built and signed successfully!")
    log(f"Path: {OUTPUT_APK} ({apk_size:.2f} MB)")
    log(f"Desktop Copy: {DESKTOP_APK}")
    log("==========================================")


if __name__ == "__main__":
    main()
