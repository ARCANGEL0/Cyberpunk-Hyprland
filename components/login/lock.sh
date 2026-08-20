#!/usr/bin/env bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export QML2_IMPORT_PATH="$DIR/imports:$QML2_IMPORT_PATH"
export QML_XHR_ALLOW_FILE_READ=1
export XDG_SESSION_TYPE="${XDG_SESSION_TYPE:-$(loginctl show-session $(loginctl | grep $(whoami) | awk '{print $1}') -p Type --value 2>/dev/null || echo wayland)}"
export QT_MEDIA_BACKEND=ffmpeg
export QS_THEME="netwatch"
export QS_THEME_PATH="$DIR/themes/$QS_THEME"

killall -9 hyprlock swaylock wlogout 2>/dev/null || true

exec quickshell -p "$DIR/lock_shell.qml"
