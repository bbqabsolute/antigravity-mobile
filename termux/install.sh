#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
#  🚀 Antigravity Mobile & CLI - Termux Automated Installer
# ==============================================================================

set -e

echo -e "\033[96m"
echo "============================================================"
echo "   🚀 УСТАНОВКА ANTIGRAVITY MOBILE В TERMUX (ANDROID)       "
echo "============================================================"
echo -e "\033[0m"

echo "[1/4] Обновление пакетов Termux..."
pkg update -y

echo "[2/4] Установка Python, Git и системных утилит..."
pkg install -y python git termux-api termux-tools

echo "[3/4] Настройка зависимостей Python..."
pip install requests urllib3 || true

# Создание глобальной команды 'agy' в Termux
INSTALL_BIN="$PREFIX/bin/agy"
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/agy.py"

echo "[4/4] Создание системной команды 'agy'..."
cat <<EOF > "$INSTALL_BIN"
#!/data/data/com.termux/files/usr/bin/bash
python "$SCRIPT_PATH" "\$@"
EOF
chmod +x "$INSTALL_BIN"
chmod +x "$SCRIPT_PATH"

echo -e "\033[92m"
echo "============================================================"
echo "  ✓ УСТАНОВКА УСПЕШНО ЗАВЕРШЕНА!                            "
echo "============================================================"
echo -e "\033[0m"
echo "Теперь вы можете запускать Antigravity из любой точки Termux:"
echo "  • agy --ui     -> Запустить графический мобильный интерфейс"
echo "  • agy --cli    -> Запустить интерактивный терминальный режим"
echo "  • agy          -> Быстрый запуск сервера и открытие интерфейса"
echo ""

# Автоматический запуск
python "$SCRIPT_PATH" --ui
