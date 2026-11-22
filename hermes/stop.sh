#!/usr/bin/env bash
# Stops the creat0r Hermes gateway started by install.sh.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIDFILE="$ROOT/data/hermes.pid"
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  kill "$(cat "$PIDFILE")" && echo "stopped $(cat "$PIDFILE")"
else
  echo "not running"
fi
rm -f "$PIDFILE"
