#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
#  🚀 Antigravity CLI (agy) - Официальный установщик для Termux (Android)
# ==============================================================================

set -e

echo -e "\033[96m"
echo "============================================================"
echo "      🚀 УСТАНОВКА ANTIGRAVITY CLI (AGY) В TERMUX           "
echo "============================================================"
echo -e "\033[0m"

INSTALL_BIN="$PREFIX/bin/agy"
TERMUX_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGY_PY="$TERMUX_DIR/agy.py"

# Шаг 1: Обновление базовых пакетов Termux
echo "[1/4] Обновление пакетов Termux и установка инструментов..."
pkg update -y
pkg install -y proot-distro curl tar git python termux-api

# Шаг 2: Определение архитектуры
ARCH="$(uname -m)"
echo "[2/4] Архитектура процессора: $ARCH"

case "$ARCH" in
    aarch64|arm64)
        URL="https://storage.googleapis.com/antigravity-public/antigravity-cli/1.3.2-5813501495738368/linux-arm/cli_linux_arm64.tar.gz"
        ;;
    x86_64|amd64)
        URL="https://storage.googleapis.com/antigravity-public/antigravity-cli/1.3.2-5813501495738368/linux-x64/cli_linux_x64.tar.gz"
        ;;
    *)
        URL="https://storage.googleapis.com/antigravity-public/antigravity-cli/1.3.2-5813501495738368/linux-arm/cli_linux_arm64.tar.gz"
        ;;
esac

# Шаг 3: Установка окружения и загрузка Google Antigravity бинарника
SETUP_OFFICIAL=0

echo "[3/4] Установка официального движка Antigravity CLI..."
if proot-distro install debian 2>/dev/null || proot-distro list | grep -q "debian (installed)"; then
    echo "Окружение Debian готово. Скачивание официального бинарника agy..."
    
    TMP_DIR="$PREFIX/tmp"
    mkdir -p "$TMP_DIR"
    curl -fsSL "$URL" -o "$TMP_DIR/agy.tar.gz"
    tar -xzf "$TMP_DIR/agy.tar.gz" -C "$TMP_DIR"
    rm -f "$TMP_DIR/agy.tar.gz"

    DEBIAN_ROOTFS="$PREFIX/var/lib/proot-distro/installed-rootfs/debian"
    if [ -f "$TMP_DIR/antigravity" ] && [ -d "$DEBIAN_ROOTFS" ]; then
        cp "$TMP_DIR/antigravity" "$DEBIAN_ROOTFS/usr/local/bin/agy"
        chmod +x "$DEBIAN_ROOTFS/usr/local/bin/agy"
        rm -f "$TMP_DIR/antigravity"

        # Установка сертификатов и утилит внутри Debian
        proot-distro login debian -- apt-get update -y >/dev/null 2>&1 || true
        proot-distro login debian -- apt-get install -y ca-certificates git python3 >/dev/null 2>&1 || true

        # Создание команды 'agy' через proot
        cat << 'EOF' > "$INSTALL_BIN"
#!/data/data/com.termux/files/usr/bin/bash
exec proot-distro login --bind /sdcard:/sdcard --bind /data/data/com.termux/files/home:/root debian -- agy "$@"
EOF
        chmod +x "$INSTALL_BIN"
        SETUP_OFFICIAL=1
    fi
fi

# Fallback если proot недоступен: быстрый автономный Python CLI
if [ "$SETUP_OFFICIAL" -eq 0 ]; then
    echo "Настройка автономного движка agy Python CLI..."
    pip install requests urllib3 || true
    cat << EOF > "$INSTALL_BIN"
#!/data/data/com.termux/files/usr/bin/bash
python "$AGY_PY" "\$@"
EOF
    chmod +x "$INSTALL_BIN"
fi

chmod +x "$AGY_PY"

echo -e "\033[92m"
echo "============================================================"
echo "  ✓ ANTIGRAVITY CLI УСПЕШНО УСТАНОВЛЕН В TERMUX!            "
echo "============================================================"
echo -e "\033[0m"
echo "Команда 'agy' теперь доступна из любой папки в Termux:"
echo "  • agy                -> Запуск интерактивного CLI агента"
echo "  • agy -p \"задача\"    -> Выполнить задачу в одну команду"
echo "  • agy --help         -> Просмотр всех опций и моделей"
echo ""

# Автоматический первый запуск CLI
agy --help || python "$AGY_PY" --help
