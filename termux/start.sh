#!/data/data/com.termux/files/usr/bin/bash
if command -v agy >/dev/null 2>&1; then
    exec agy "$@"
else
    DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    exec python "$DIR/agy.py" "$@"
fi
