#!/usr/bin/env bash
SOUND="$HOME/.claude/sounds/OptionD.mp3"
[ -r "$SOUND" ] || exit 0
nohup afplay -v 0.6 "$SOUND" >/dev/null 2>&1 &
exit 0
