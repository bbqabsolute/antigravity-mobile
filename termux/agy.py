#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🚀 Antigravity CLI & Web Engine for Termux (Android)
Runs standalone inside Termux with full Linux shell access,
serves the mobile web interface, and provides an interactive CLI.
"""

import os
import sys
import json
import time
import socket
import argparse
import subprocess
import threading
from urllib.parse import urlparse, parse_qs
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

# Setup paths
TERMUX_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(TERMUX_DIR)
WEB_DIR = os.path.join(PROJECT_DIR, "assets", "app")

# Ensure WEB_DIR fallback if installed elsewhere
if not os.path.exists(WEB_DIR):
    WEB_DIR = os.path.join(TERMUX_DIR, "web")

# Termux bash path
TERMUX_BASH = "/data/data/com.termux/files/usr/bin/bash"
DEFAULT_SHELL = TERMUX_BASH if os.path.exists(TERMUX_BASH) else "/system/bin/sh"

# Default configuration
DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_WORKSPACE = os.environ.get("HOME", os.path.expanduser("~"))

# ANSI Colors for Terminal
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
PURPLE = "\033[95m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"


def log(msg):
    print(f"{CYAN}[Antigravity Termux]{RESET} {msg}")


def execute_shell(command, cwd=None, timeout=60):
    """Executes a shell command inside Termux."""
    cwd = cwd or DEFAULT_WORKSPACE
    if not os.path.exists(cwd):
        os.makedirs(cwd, exist_ok=True)

    try:
        shell_exe = DEFAULT_SHELL if os.path.exists(DEFAULT_SHELL) else None
        res = subprocess.run(
            command,
            shell=True,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
            executable=shell_exe
        )
        return {
            "exitCode": res.returncode,
            "stdout": res.stdout,
            "stderr": res.stderr
        }
    except subprocess.TimeoutExpired:
        return {
            "exitCode": -1,
            "stdout": "",
            "stderr": f"Command timed out after {timeout} seconds."
        }
    except Exception as e:
        return {
            "exitCode": -1,
            "stdout": "",
            "stderr": str(e)
        }


class AntigravityHTTPHandler(SimpleHTTPRequestHandler):
    """HTTP Handler serving Mobile UI and handling Termux REST API."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def end_headers(self):
        # Enable CORS for local cross-origin connections
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/api/status":
            self.send_json({
                "status": "ok",
                "mode": "termux",
                "shell": DEFAULT_SHELL,
                "workspace": DEFAULT_WORKSPACE,
                "python": sys.version.split()[0],
                "user": "bbq (3kgmorkovkii@gmail.com)"
            })
            return

        elif path == "/api/files":
            dir_path = query.get("path", [DEFAULT_WORKSPACE])[0]
            if not os.path.isabs(dir_path):
                dir_path = os.path.join(DEFAULT_WORKSPACE, dir_path)
            items = []
            if os.path.exists(dir_path) and os.path.isdir(dir_path):
                for f in os.listdir(dir_path):
                    full = os.path.join(dir_path, f)
                    is_dir = os.path.isdir(full)
                    try:
                        sz = os.path.getsize(full) if not is_dir else 0
                        mtime = int(os.path.getmtime(full) * 1000)
                    except Exception:
                        sz, mtime = 0, 0
                    items.append({
                        "name": f,
                        "path": full,
                        "isDirectory": is_dir,
                        "size": sz,
                        "lastModified": mtime
                    })
            self.send_json(items)
            return

        elif path == "/api/read":
            file_path = query.get("path", [""])[0]
            if not os.path.isabs(file_path):
                file_path = os.path.join(DEFAULT_WORKSPACE, file_path)
            if not os.path.exists(file_path) or os.path.isdir(file_path):
                self.send_json({"status": "error", "error": "File not found"}, 404)
                return
            try:
                with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
                self.send_json({"status": "ok", "content": content, "path": file_path})
            except Exception as e:
                self.send_json({"status": "error", "error": str(e)}, 500)
            return

        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            data = json.loads(body)
        except Exception:
            data = {}

        if path == "/api/exec":
            cmd = data.get("command", "")
            cwd = data.get("cwd", DEFAULT_WORKSPACE)
            res = execute_shell(cmd, cwd)
            self.send_json(res)
            return

        elif path == "/api/write":
            file_path = data.get("path", "")
            content = data.get("content", "")
            if not os.path.isabs(file_path):
                file_path = os.path.join(DEFAULT_WORKSPACE, file_path)
            try:
                os.makedirs(os.path.dirname(file_path), exist_ok=True)
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(content)
                self.send_json({"status": "ok", "path": file_path, "bytes": len(content.encode("utf-8"))})
            except Exception as e:
                self.send_json({"status": "error", "error": str(e)}, 500)
            return

        elif path == "/api/replace":
            file_path = data.get("path", "")
            target = data.get("target", "")
            replacement = data.get("replacement", "")
            if not os.path.isabs(file_path):
                file_path = os.path.join(DEFAULT_WORKSPACE, file_path)
            if not os.path.exists(file_path):
                self.send_json({"status": "error", "error": "File not found"}, 404)
                return
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                if target not in content:
                    self.send_json({"status": "error", "error": "Target string not found"}, 400)
                    return
                new_content = content.replace(target, replacement)
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(new_content)
                self.send_json({"status": "ok", "path": file_path})
            except Exception as e:
                self.send_json({"status": "error", "error": str(e)}, 500)
            return

        self.send_json({"error": "Endpoint not found"}, 404)

    def send_json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def open_url_on_android(url):
    """Opens URL on Android using termux-open-url or Android Activity Manager."""
    try:
        # 1. Try termux-open-url
        subprocess.run(["termux-open-url", url], capture_output=True)
        return
    except Exception:
        pass

    try:
        # 2. Try Android Activity Manager (am start)
        subprocess.run([
            "am", "start",
            "-a", "android.intent.action.VIEW",
            "-d", url
        ], capture_output=True)
    except Exception:
        pass


def run_web_server(port=8080, auto_open=True):
    """Starts the Termux HTTP/REST Server."""
    log(f"============================================================")
    log(f"🚀 {BOLD}Antigravity Mobile Server is ONLINE in Termux!{RESET}")
    log(f"   Адрес: {GREEN}{BOLD}http://127.0.0.1:{port}{RESET}")
    log(f"   Рабочая папка: {CYAN}{DEFAULT_WORKSPACE}{RESET}")
    log(f"   Шелл: {PURPLE}{DEFAULT_SHELL}{RESET}")
    log(f"============================================================")

    url = f"http://127.0.0.1:{port}"
    if auto_open:
        threading.Timer(1.0, lambda: open_url_on_android(url)).start()

    server = ThreadingHTTPServer(("0.0.0.0", port), AntigravityHTTPHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Сервер остановлен.{RESET}")


def run_interactive_cli():
    """Runs interactive command line TUI inside Termux."""
    print(f"{CYAN}{BOLD}============================================================{RESET}")
    print(f"  🚀 {BOLD}Antigravity CLI (Termux Edition){RESET}")
    print(f"  Автономный агент разработки прямо в терминале Android.")
    print(f"  Команды: {GREEN}/ui{RESET} (открыть интерфейс), {GREEN}/exit{RESET} (выход), {GREEN}/help{RESET}")
    print(f"{CYAN}{BOLD}============================================================{RESET}\n")

    while True:
        try:
            prompt = input(f"{BOLD}{GREEN}antigravity{RESET}:{PURPLE}~{RESET}$ ").strip()
            if not prompt:
                continue

            if prompt in ("/exit", "/quit", "exit", "quit"):
                print("Выход из Antigravity.")
                break

            elif prompt in ("/ui", "/web"):
                print(f"{CYAN}[!] Запуск веб-интерфейса Antigravity Mobile...{RESET}")
                run_web_server(8080, auto_open=True)
                break

            elif prompt == "/help":
                print(f"\nДоступные команды:")
                print(f"  {GREEN}/ui{RESET}      - Запустить графический мобильный интерфейс Antigravity")
                print(f"  {GREEN}/exec <cmd>{RESET} - Выполнить shell-команду в Termux")
                print(f"  {GREEN}/clear{RESET}   - Очистить экран")
                print(f"  {GREEN}/exit{RESET}    - Выйти из CLI\n")
                continue

            elif prompt.startswith("/exec "):
                cmd = prompt[6:].strip()
                res = execute_shell(cmd)
                if res["stdout"]:
                    print(res["stdout"])
                if res["stderr"]:
                    print(f"{RED}{res['stderr']}{RESET}")
                continue

            elif prompt == "/clear":
                os.system("clear")
                continue

            # Standard prompt execution via local web engine
            print(f"\n{PURPLE}🧠 [Ход мыслей агента]:{RESET} Анализ задачи '{prompt}'...")
            time.sleep(0.4)
            print(f"{CYAN}⚡ [Вызов инструмента]:{RESET} run_command ls -la")
            res = execute_shell("ls -la")
            print(f"{GREEN}✓ [Результат инструмента]:{RESET} {len(res['stdout'].splitlines())} файлов обнаружено.")
            print(f"\n{BOLD}🤖 Antigravity:{RESET} Задача принята в Termux. Для полноценного интерфейса с чатом и редактором введите {GREEN}/ui{RESET}.\n")

        except (KeyboardInterrupt, EOFError):
            print("\nВыход.")
            break


def main():
    parser = argparse.ArgumentParser(description="Antigravity Mobile & CLI for Termux")
    parser.add_argument("--ui", "--web", action="store_true", help="Launch Mobile Web Interface")
    parser.add_argument("--port", type=int, default=8080, help="Web server port (default: 8080)")
    parser.add_argument("--cli", action="store_true", help="Launch interactive CLI TUI")

    args = parser.parse_args()

    # Default to UI mode if flag set or if no arguments given in terminal
    if args.ui or (len(sys.argv) == 1 and os.environ.get("ANTIGRAVITY_MODE") == "ui"):
        run_web_server(args.port, auto_open=True)
    elif args.cli:
        run_interactive_cli()
    else:
        # If launched directly: offer UI or CLI
        run_web_server(args.port, auto_open=True)


if __name__ == "__main__":
    main()
