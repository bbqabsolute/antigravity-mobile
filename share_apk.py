#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Antigravity Mobile - APK Sharing Server
Starts a local HTTP server with QR code for quick APK download to smartphone via Wi-Fi.
"""

import os
import sys
import socket
import io
from http.server import HTTPServer, SimpleHTTPRequestHandler

# Force UTF-8 stdout
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
APK_PATH = os.path.join(PROJECT_DIR, "Antigravity-Mobile.apk")
PORT = 8080


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def print_ascii_qr(url):
    try:
        import qrcode
        qr = qrcode.QRCode(border=1)
        qr.add_data(url)
        qr.make(fit=True)
        f = io.StringIO()
        qr.print_ascii(out=f, invert=True)
        print(f.getvalue())
    except Exception as e:
        print(f"   (Откройте ссылку в браузере телефона: {url})")


class DownloadHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            
            apk_size_mb = os.path.getsize(APK_PATH) / (1024 * 1024) if os.path.exists(APK_PATH) else 0.1
            
            html = f"""<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Скачать Antigravity Mobile</title>
    <style>
        body {{
            background: #070A0F;
            color: #F0F6FC;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            text-align: center;
            box-sizing: border-box;
        }}
        .card {{
            background: #0D1117;
            border: 1px solid #21262D;
            border-radius: 20px;
            padding: 28px;
            max-width: 400px;
            width: 100%;
            box-shadow: 0 12px 36px rgba(0,0,0,0.5);
        }}
        .icon {{ font-size: 48px; margin-bottom: 12px; }}
        h1 {{ font-size: 22px; margin: 0 0 8px 0; background: linear-gradient(135deg, #3B82F6, #8B5CF6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }}
        p {{ color: #8B949E; font-size: 14px; line-height: 1.5; margin: 0 0 20px 0; }}
        .btn {{
            display: block;
            background: linear-gradient(135deg, #3B82F6, #2563EB);
            color: #fff;
            text-decoration: none;
            padding: 14px 20px;
            border-radius: 12px;
            font-weight: 700;
            font-size: 16px;
            margin-bottom: 16px;
            box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);
        }}
        .instructions {{
            background: #161B22;
            border-radius: 10px;
            padding: 12px;
            text-align: left;
            font-size: 12px;
            color: #8B949E;
            line-height: 1.5;
        }}
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">🚀</div>
        <h1>Antigravity Mobile</h1>
        <p>Автономный AI-разработчик прямо на вашем Android смартфоне (v1.0.0, {apk_size_mb:.2f} MB)</p>
        <a href="/Antigravity-Mobile.apk" class="btn" download>📥 Скачать APK</a>
        <div class="instructions">
            <b>💡 Установка:</b><br>
            1. Нажмите «Скачать APK».<br>
            2. Откройте скачанный файл.<br>
            3. Если появится запрос, разрешите «Установку из этого источника».<br>
            4. Запустите Antigravity и укажите Gemini API ключ в Настройках.
        </div>
    </div>
</body>
</html>"""
            self.wfile.write(html.encode("utf-8"))
            return

        elif self.path == "/Antigravity-Mobile.apk":
            if not os.path.exists(APK_PATH):
                self.send_error(404, "APK not found")
                return

            self.send_response(200)
            self.send_header("Content-Type", "application/vnd.android.package-archive")
            self.send_header("Content-Disposition", 'attachment; filename="Antigravity-Mobile.apk"')
            self.send_header("Content-Length", str(os.path.getsize(APK_PATH)))
            self.end_headers()

            with open(APK_PATH, "rb") as f:
                self.wfile.write(f.read())
            return

        super().do_GET()


def main():
    if not os.path.exists(APK_PATH):
        print(f"[!] Ошибка: файл {APK_PATH} не найден. Сначала запустите build_apk.bat")
        return

    ip = get_local_ip()
    url = f"http://{ip}:{PORT}"

    print("=" * 64)
    print("   [!] СЕРВЕР ЗАГРУЗКИ ANTIGRAVITY MOBILE ЗАПУЩЕН")
    print(f"   [!] Адрес для скачивания: {url}")
    print("   [!] Наведите камеру телефона на QR-код ниже:")
    print("-" * 64)
    print_ascii_qr(url)
    print("-" * 64)
    print(f"   Файл APK: {APK_PATH}")
    print("   Для остановки нажмите Ctrl + C")
    print("=" * 64)

    server = HTTPServer(("0.0.0.0", PORT), DownloadHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nСервер остановлен.")


if __name__ == "__main__":
    main()
