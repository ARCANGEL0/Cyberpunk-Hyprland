#!/usr/bin/env bash
pgrep -f "lockscreen-breach.qml" >/dev/null && exit 0
pkill -f 'ffplay.*mita' 2>/dev/null
exec qs -p "$HOME/.config/hypr/themes/cyberpunk/quickshell/widgets/lockscreen-breach.qml"
