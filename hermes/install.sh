#!/usr/bin/env bash
# Installs (or refreshes) the Hermes profile "creat0r" for Lily and starts its gateway.
# Idempotent. Touches ONLY ~/.hermes/profiles/creat0r — never the default profile.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
PROFILE=creat0r
PDIR="$HOME/.hermes/profiles/$PROFILE"
LOG="$ROOT/data/hermes.log"
PIDFILE="$ROOT/data/hermes.pid"
mkdir -p "$ROOT/data"

# 1. Env from creat0r/.env
[ -f "$ROOT/.env" ] || { echo "missing $ROOT/.env" >&2; exit 1; }
set -a; . "$ROOT/.env"; set +a
for v in ANTHROPIC_API_KEY HERMES_API_KEY HERMES_WEBHOOK_SECRET; do
  [ -n "${!v:-}" ] || { echo "missing $v in .env" >&2; exit 1; }
done

# 2. Profile (blank, no bundled skills, no shell alias)
if [ ! -d "$PDIR" ]; then
  hermes profile create "$PROFILE" --no-skills --no-alias --description "Lily: runs creator ads for creat0r"
fi
mkdir -p "$PDIR/skills"

# 3. Profile .env (only this profile's file)
cat > "$PDIR/.env" <<EOF
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
API_SERVER_ENABLED=true
API_SERVER_HOST=127.0.0.1
API_SERVER_PORT=8642
API_SERVER_KEY=$HERMES_API_KEY
WEBHOOK_ENABLED=true
WEBHOOK_PORT=8644
WEBHOOK_SECRET=$HERMES_WEBHOOK_SECRET
EOF
chmod 600 "$PDIR/.env"

# 4. Config merge (keeps every key Hermes wrote)
bun "$HERE/merge_config.ts" "$HERE/config.patch.yaml" "$PDIR/config.yaml" "$ROOT"

# 5. SOUL + skills (symlinked, so repo edits are live on the next run)
cp "$HERE/SOUL.md" "$PDIR/SOUL.md"
for d in "$HERE"/skills/creat0r-*; do
  ln -sfn "$d" "$PDIR/skills/$(basename "$d")"
done

# 5b. One bundled skill per webhook route (Hermes injects only the first skill a route lists)
bundle() { # bundle <route> <skill>...
  local route="$1"; shift
  local out="$PDIR/skills/creat0r-wake-$route"
  rm -rf "$out"; mkdir -p "$out"
  {
    printf -- '---\nname: creat0r-wake-%s\ndescription: Everything Lily needs for a creat0r %s webhook run (built by hermes/install.sh from %s).\nversion: 1.0.0\n---\n\n' "$route" "$route" "$*"
    for s in "$@"; do
      printf '\n# Skill: %s\n\n' "$s"
      awk 'NR==1 && /^---$/ {f=1; next} f && /^---$/ {f=0; next} !f' "$HERE/skills/$s/SKILL.md"
    done
  } > "$out/SKILL.md"
}
bundle campaign-start  creat0r-context creat0r-find creat0r-outreach
bundle creator-message creat0r-context creat0r-negotiate creat0r-review
bundle admin-decision  creat0r-context creat0r-admin creat0r-outreach creat0r-negotiate creat0r-review

# 6. (Re)start the gateway in the background
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  kill "$(cat "$PIDFILE")" || true
  for _ in $(seq 1 20); do kill -0 "$(cat "$PIDFILE")" 2>/dev/null || break; sleep 0.5; done
fi
nohup hermes -p "$PROFILE" gateway run --replace >> "$LOG" 2>&1 &
echo $! > "$PIDFILE"
echo "gateway pid $(cat "$PIDFILE"), log $LOG"

for _ in $(seq 1 60); do
  a=$(curl -s -m 1 http://127.0.0.1:8642/health || true)
  w=$(curl -s -m 1 http://127.0.0.1:8644/health || true)
  if [ -n "$a" ] && [ -n "$w" ]; then
    echo "api server: $a"; echo "webhooks:   $w"; exit 0
  fi
  sleep 1
done
echo "gateway did not come up in 60s, see $LOG" >&2
tail -30 "$LOG" >&2
exit 1
