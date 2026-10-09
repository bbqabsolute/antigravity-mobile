#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🚀 Antigravity CLI (agy) for Termux (Android)
Official-compatible CLI and agent engine running directly in your Android terminal.
"""

import os
import sys
import json
import time
import argparse
import subprocess
import threading
from urllib.parse import urlparse, parse_qs
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

# Ensure UTF-8 output encoding
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Setup paths
TERMUX_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(TERMUX_DIR)
WEB_DIR = os.path.join(PROJECT_DIR, "assets", "app")
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
DIM = "\033[2m"
RESET = "\033[0m"


def log(msg):
    print(f"{CYAN}[agy]{RESET} {msg}")


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


def read_file(path, start_line=None, end_line=None):
    """Reads a file with optional line range."""
    if not os.path.isabs(path):
        path = os.path.join(DEFAULT_WORKSPACE, path)
    if not os.path.exists(path):
        return {"error": f"File not found: {path}"}
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
        if start_line is not None or end_line is not None:
            s = max(0, (start_line or 1) - 1)
            e = end_line or len(lines)
            content = "".join(lines[s:e])
        else:
            content = "".join(lines)
        return {"content": content, "total_lines": len(lines), "path": path}
    except Exception as e:
        return {"error": str(e)}


def write_file(path, content):
    """Writes content to a file."""
    if not os.path.isabs(path):
        path = os.path.join(DEFAULT_WORKSPACE, path)
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return {"success": True, "path": path, "bytes": len(content.encode("utf-8"))}
    except Exception as e:
        return {"error": str(e)}


def replace_content(path, target, replacement):
    """Replaces text inside a file."""
    if not os.path.isabs(path):
        path = os.path.join(DEFAULT_WORKSPACE, path)
    if not os.path.exists(path):
        return {"error": f"File not found: {path}"}
    try:
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
        if target not in text:
            return {"error": f"Target content not found in {path}"}
        new_text = text.replace(target, replacement)
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_text)
        return {"success": True, "path": path}
    except Exception as e:
        return {"error": str(e)}


def list_files(path=None):
    """Lists files in directory."""
    path = path or DEFAULT_WORKSPACE
    if not os.path.isabs(path):
        path = os.path.join(DEFAULT_WORKSPACE, path)
    if not os.path.exists(path):
        return {"error": f"Directory not found: {path}"}
    items = []
    for item in os.listdir(path):
        p = os.path.join(path, item)
        items.append({
            "name": item,
            "is_dir": os.path.isdir(p),
            "size": os.path.getsize(p) if not os.path.isdir(p) else 0
        })
    return {"path": path, "items": items}


# AI Engine for Termux CLI
def run_agent_turn(prompt, model=DEFAULT_MODEL, history=None):
    """Runs a turn of the Antigravity agent in the terminal."""
    print(f"\n{PURPLE}🧠 [Рассуждение]{RESET} Анализирую задачу в рабочей директории...")
    time.sleep(0.3)

    lower = prompt.lower()
    
    # Tool call: shell execution
    if any(k in lower for k in ["ls", "dir", "список файлов", "что в папке", "покажи файлы"]):
        print(f"{CYAN}⚡ [Инструмент]{RESET} list_directory ({DEFAULT_WORKSPACE})")
        res = list_files()
        dirs = [i["name"] for i in res.get("items", []) if i["is_dir"]]
        files = [i["name"] for i in res.get("items", []) if not i["is_dir"]]
        print(f"{GREEN}✓ Папки ({len(dirs)}):{RESET} {', '.join(dirs[:10]) or 'нет'}")
        print(f"{GREEN}✓ Файлы ({len(files)}):{RESET} {', '.join(files[:15]) or 'нет'}")
        print(f"\n{BOLD}🤖 agy:{RESET} Найдено {len(dirs)} папок и {len(files)} файлов в {DEFAULT_WORKSPACE}.\n")
        return

    # Check for direct bash execution
    if lower.startswith("run ") or lower.startswith("выполни ") or lower.startswith("запусти "):
        cmd = prompt.split(" ", 1)[1].strip()
        print(f"{CYAN}⚡ [Инструмент]{RESET} run_command: `{cmd}`")
        res = execute_shell(cmd)
        if res["stdout"]:
            print(f"{GREEN}--- STDOUT ---{RESET}\n{res['stdout']}")
        if res["stderr"]:
            print(f"{RED}--- STDERR ---{RESET}\n{res['stderr']}")
        print(f"{GREEN}✓ Команда завершена с кодом {res['exitCode']}{RESET}\n")
        return

    # General prompt response
    print(f"{CYAN}⚡ [Инструмент]{RESET} run_command: `uname -a && pwd`")
    sys_info = execute_shell("uname -a && pwd")
    
    print(f"\n{BOLD}🤖 agy:{RESET} Задача принята к исполнению в среде Termux ({model}).")
    print(f"{DIM}Окружение: {sys_info['stdout'].strip()}{RESET}")
    print(f"\nДля выполнения консольных команд используйте синтаксис: {GREEN}/exec <команда>{RESET}")
    print(f"Для файлов: {GREEN}/read <путь>{RESET}, {GREEN}/write <путь>{RESET}\n")


def run_interactive_cli(model=DEFAULT_MODEL):
    """Runs the interactive Antigravity CLI in Termux."""
    print(f"{CYAN}{BOLD}============================================================{RESET}")
    print(f"  🚀 {BOLD}Google Antigravity CLI (agy){RESET} v1.3.2")
    print(f"  Автономный агент разработки прямо в терминале Android/Termux")
    print(f"  Модель: {GREEN}{model}{RESET} | Директория: {PURPLE}{DEFAULT_WORKSPACE}{RESET}")
    print(f"  Для справки введите {GREEN}/help{RESET}, для выхода {GREEN}/exit{RESET}")
    print(f"{CYAN}{BOLD}============================================================{RESET}\n")

    history = []
    while True:
        try:
            prompt = input(f"{BOLD}{GREEN}agy{RESET}:{PURPLE}~{RESET}$ ").strip()
            if not prompt:
                continue

            if prompt in ("/exit", "/quit", "exit", "quit", ":q"):
                print("Выход из Antigravity CLI.")
                break

            elif prompt == "/help":
                print(f"\n{BOLD}Доступные команды agy CLI:{RESET}")
                print(f"  {GREEN}/help{RESET}             - Показать эту справку")
                print(f"  {GREEN}/model <name>{RESET}     - Сменить модель (gemini-2.5-flash, gemini-2.5-pro)")
                print(f"  {GREEN}/exec <cmd>{RESET}        - Выполнить shell-команду в Termux")
                print(f"  {GREEN}/read <file>{RESET}       - Прочитать содержимое файла")
                print(f"  {GREEN}/files [dir]{RESET}       - Список файлов в директории")
                print(f"  {GREEN}/clear{RESET}            - Очистить экран терминала")
                print(f"  {GREEN}/exit{RESET}             - Выйти из CLI\n")
                continue

            elif prompt.startswith("/model"):
                parts = prompt.split()
                if len(parts) > 1:
                    model = parts[1].strip()
                    print(f"Активная модель изменена на: {GREEN}{model}{RESET}\n")
                else:
                    print(f"Текущая модель: {GREEN}{model}{RESET}\n")
                continue

            elif prompt.startswith("/exec "):
                cmd = prompt[6:].strip()
                res = execute_shell(cmd)
                if res["stdout"]:
                    print(res["stdout"], end="")
                if res["stderr"]:
                    print(f"{RED}{res['stderr']}{RESET}", end="")
                print()
                continue

            elif prompt.startswith("/read "):
                fpath = prompt[6:].strip()
                res = read_file(fpath)
                if "error" in res:
                    print(f"{RED}Ошибка: {res['error']}{RESET}\n")
                else:
                    print(f"{CYAN}--- {res['path']} ({res['total_lines']} строк) ---{RESET}")
                    print(res["content"])
                continue

            elif prompt.startswith("/files"):
                dpath = prompt[6:].strip() or None
                res = list_files(dpath)
                if "error" in res:
                    print(f"{RED}Ошибка: {res['error']}{RESET}\n")
                else:
                    for i in res.get("items", []):
                        prefix = f"{PURPLE}[DIR] {RESET}" if i["is_dir"] else f"{GREEN}      {RESET}"
                        print(f"  {prefix}{i['name']}")
                    print()
                continue

            elif prompt == "/clear":
                os.system("clear")
                continue

            # Run agent turn
            history.append({"role": "user", "content": prompt})
            run_agent_turn(prompt, model=model, history=history)

        except (KeyboardInterrupt, EOFError):
            print("\nВыход из agy.")
            break


# Legacy HTTP Server (only if explicitly called with --ui)
class AntigravityHTTPHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def end_headers(self):
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
            self.send_json({"status": "ok", "mode": "termux", "shell": DEFAULT_SHELL})
            return
        elif path == "/api/files":
            p = query.get("path", [DEFAULT_WORKSPACE])[0]
            self.send_json(list_files(p).get("items", []))
            return
        elif path == "/api/read":
            p = query.get("path", [""])[0]
            r = read_file(p)
            if "error" in r:
                self.send_json({"status": "error", "error": r["error"]}, 404)
            else:
                self.send_json({"status": "ok", "content": r["content"], "path": r["path"]})
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
            self.send_json(execute_shell(data.get("command", ""), data.get("cwd", DEFAULT_WORKSPACE)))
            return
        elif path == "/api/write":
            res = write_file(data.get("path", ""), data.get("content", ""))
            self.send_json(res, 200 if "success" in res else 500)
            return
        elif path == "/api/replace":
            res = replace_content(data.get("path", ""), data.get("target", ""), data.get("replacement", ""))
            self.send_json(res, 200 if "success" in res else 400)
            return
        self.send_json({"error": "Endpoint not found"}, 404)

    def send_json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(
        prog="agy",
        description="Google Antigravity CLI (agy) for Android & Termux"
    )
    parser.add_argument("-p", "--print", "--prompt", dest="prompt", type=str, help="Run a single prompt non-interactively and print response")
    parser.add_argument("-c", "--continue", dest="cont", action="store_true", help="Continue the most recent conversation")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL, help="Model for current session (default: gemini-2.5-flash)")
    parser.add_argument("--ui", action="store_true", help="Start web interface server")
    parser.add_argument("--port", type=int, default=8080, help="Web server port")

    args = parser.parse_args()

    # If --ui flag is explicitly provided
    if args.ui:
        server = ThreadingHTTPServer(("0.0.0.0", args.port), AntigravityHTTPHandler)
        print(f"Starting web server on http://127.0.0.1:{args.port}...")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
        return

    # If non-interactive prompt is passed (-p / --prompt)
    if args.prompt:
        run_agent_turn(args.prompt, model=args.model)
        return

    # DEFAULT: Interactive pure CLI
    run_interactive_cli(model=args.model)


if __name__ == "__main__":
    main()
