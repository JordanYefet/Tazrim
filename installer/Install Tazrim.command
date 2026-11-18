#!/bin/bash
# Tazrim installer for macOS: double-click it in Finder.
# Release builds have the version below filled in at release time (release.yml).
#
# Testing overrides (environment variables):
#   TAZRIM_INSTALL_DIR       install folder (default ~/tazrim)
#   TAZRIM_COMPOSE_FILE      a local docker-compose.yml to copy instead of downloading
#   TAZRIM_INSTALL_ENV_EXTRA extra lines appended to a new .env (COMPOSE_PROJECT_NAME, ports, TAZRIM_VERSION)
#   TAZRIM_PORT              the port the computer opens (default 3000)
#   TAZRIM_NO_OPEN=1         do not open the browser
#   TAZRIM_INSTALL_LANG      he (default) or en
#
# Talks only to GitHub (the compose file) and, through Docker, Docker's registry.

VERSION="@@TAZRIM_VERSION@@"
REPO="JordanYefet/Tazrim"
HELP_URL="https://github.com/$REPO#התקנה-והפעלה"
ISSUES_URL="https://github.com/$REPO/issues"
DOCKER_URL="https://www.docker.com/products/docker-desktop/"

LANG_CHOICE="${TAZRIM_INSTALL_LANG:-he}"
INSTALL_DIR="${TAZRIM_INSTALL_DIR:-$HOME/tazrim}"
PORT="${TAZRIM_PORT:-3000}"

# msg "<hebrew>" "<english>"
msg() { if [ "$LANG_CHOICE" = en ]; then printf '%s\n' "$2"; else printf '%s\n' "$1"; fi; }

finish() {
  echo
  msg "לחצו Enter כדי לסגור את החלון." "Press Enter to close this window."
  read -r _ || true
  exit "${1:-0}"
}

fail() { # fail "<he>" "<en>"
  echo
  msg "✗ $1" "✗ $2"
  echo
  msg "עזרה: $HELP_URL" "Help: $HELP_URL"
  msg "או לפתוח פנייה: $ISSUES_URL" "Or open an issue: $ISSUES_URL"
  finish 1
}

open_url() { [ "${TAZRIM_NO_OPEN:-}" = 1 ] || open "$1" 2>/dev/null || true; }

# The value of KEY in an env-style text (last one wins), else the default
env_value() { # env_value KEY TEXT DEFAULT
  local v
  v=$(printf '%s\n' "$2" | sed -n "s/^$1=//p" | tail -n 1 | tr -d '\r "')
  printf '%s' "${v:-$3}"
}

port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

wait_healthy() { # wait_healthy PORT
  local i
  msg "מחכים שתזרים תעלה (עד שתי דקות)..." "Waiting for Tazrim to start (up to two minutes)..."
  for i in $(seq 1 60); do
    if curl -fsS -m 3 "http://localhost:$1/api/health" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

echo
msg "תזרים: התקנה" "Tazrim: install"
echo

# ---- 1. Docker ----------------------------------------------------------------------
[ -x /Applications/Docker.app/Contents/Resources/bin/docker ] && PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"
if ! command -v docker >/dev/null 2>&1 && [ ! -d /Applications/Docker.app ]; then
  msg "Docker Desktop לא מותקן. פותחים את דף ההורדה." "Docker Desktop is not installed. Opening its download page."
  open_url "$DOCKER_URL"
  fail "צריך להתקין את Docker Desktop (חינם, בלי חשבון), לפתוח אותו, ואז ללחוץ שוב פעמיים על הקובץ הזה." \
       "Install Docker Desktop (free, no account needed), open it, then double-click this file again."
fi

if ! docker info >/dev/null 2>&1; then
  msg "Docker לא רץ. מפעילים אותו..." "Docker is not running. Starting it..."
  open -a Docker 2>/dev/null || true
  ready=0
  for i in $(seq 1 90); do
    if docker info >/dev/null 2>&1; then ready=1; break; fi
    sleep 2
  done
  [ "$ready" = 1 ] || fail "Docker לא עלה תוך שלוש דקות. פותחים את Docker Desktop ידנית, מחכים ל-Engine running, ולוחצים שוב על הקובץ." \
                           "Docker did not start within three minutes. Open Docker Desktop yourself, wait for \"Engine running\", then double-click this file again."
fi
docker compose version >/dev/null 2>&1 || fail "ל-Docker חסר התוסף Compose. מעדכנים את Docker Desktop לגרסה האחרונה." \
                                              "Docker has no Compose plugin. Update Docker Desktop to the latest version."
msg "✓ Docker רץ." "✓ Docker is running."

# ---- An install that is already there: start it, change nothing -----------------------
if [ -e "$INSTALL_DIR" ]; then
  [ -f "$INSTALL_DIR/docker-compose.yml" ] || fail "התיקייה $INSTALL_DIR כבר קיימת אבל אין בה התקנה של תזרים, ולכן לא נוגעים בה. מעבירים אותה למקום אחר ומנסים שוב." \
                                                   "The folder $INSTALL_DIR already exists but is not a Tazrim install, so it is left alone. Move it away and try again."
  msg "נמצאה התקנה קיימת ב-$INSTALL_DIR. לא משנים בה כלום ולא נוגעים בנתונים; רק מפעילים אותה." \
      "Found an existing install in $INSTALL_DIR. Nothing in it is changed and your data is not touched; it is only started."
  existing_env=""
  [ -f "$INSTALL_DIR/.env" ] && existing_env=$(cat "$INSTALL_DIR/.env")
  PORT=$(env_value TAZRIM_PORT "$existing_env" "$PORT")
  if ! (cd "$INSTALL_DIR" && docker compose up -d); then
    fail "ההפעלה נכשלה. ההודעה של Docker מופיעה למעלה." "Starting failed. Docker's message is above."
  fi
  wait_healthy "$PORT" || fail "תזרים לא ענתה תוך שתי דקות. אפשר לראות מה קרה עם: cd \"$INSTALL_DIR\" && docker compose logs" \
                              "Tazrim did not answer within two minutes. To see why: cd \"$INSTALL_DIR\" && docker compose logs"
  msg "✓ תזרים רצה. פותחים את הדפדפן." "✓ Tazrim is running. Opening the browser."
  open_url "http://localhost:$PORT"
  msg "הכתובת: http://localhost:$PORT" "Address: http://localhost:$PORT"
  finish 0
fi

# ---- 2. This computer's home-network address ----------------------------------------
lan_ip=$(ipconfig getifaddr en0 2>/dev/null || true)
if [ -z "$lan_ip" ]; then
  iface=$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')
  [ -n "$iface" ] && lan_ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
fi

# ---- 3. The .env text first, so the ports it names are the ones checked ---------------
env_text="# Tazrim settings. Changing a value here needs: docker compose up -d
# Optional helpers that run with the app. 'updater' lets the app update itself (Settings -> Updates).
COMPOSE_PROFILES=updater"
if [ -n "$lan_ip" ]; then
  env_text="$env_text
# This computer's address on your home network. Phones and tablets open http://$lan_ip:3001
TAZRIM_LAN_IP=$lan_ip"
else
  env_text="$env_text
# This computer's address on your home network (not found automatically). Phones open http://<it>:3001
# TAZRIM_LAN_IP=192.168.1.10"
fi
[ -n "${TAZRIM_INSTALL_ENV_EXTRA:-}" ] && env_text="$env_text
# Extra
$TAZRIM_INSTALL_ENV_EXTRA"
PORT=$(env_value TAZRIM_PORT "$env_text" "$PORT")
PHONE_PORT=$(env_value TAZRIM_PHONE_PORT "$env_text" 3001)

for p in "$PORT" "$PHONE_PORT"; do
  if port_busy "$p"; then
    fail "הפורט $p תפוס על ידי תוכנה אחרת במחשב הזה, ולכן תזרים לא יכולה לעלות עליו. סוגרים אותה ומנסים שוב. (אפשר לראות מי תופס: lsof -iTCP:$p -sTCP:LISTEN)" \
         "Port $p is in use by another program on this computer, so Tazrim cannot start on it. Close that program and try again. (To see which: lsof -iTCP:$p -sTCP:LISTEN)"
  fi
done

# ---- 4. The compose file --------------------------------------------------------------
tmp=$(mktemp -d "${TMPDIR:-/tmp}/tazrim-install.XXXXXX") || fail "אין מקום זמני לעבוד בו." "Could not make a temporary folder."
trap 'rm -rf "$tmp"' EXIT
if [ -n "${TAZRIM_COMPOSE_FILE:-}" ]; then
  [ -f "$TAZRIM_COMPOSE_FILE" ] || fail "קובץ ההגדרות $TAZRIM_COMPOSE_FILE לא נמצא." "The compose file $TAZRIM_COMPOSE_FILE was not found."
  cp "$TAZRIM_COMPOSE_FILE" "$tmp/docker-compose.yml"
else
  ver="$VERSION"
  case "$ver" in
    @@*)
      # Not a release build (running from the repo): use the newest release
      ver=$(curl -fsSL -m 20 "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -n 1)
      ;;
  esac
  [ -n "$ver" ] || fail "לא הצלחנו להתחבר ל-GitHub. בודקים את החיבור לאינטרנט ומנסים שוב." \
                        "Could not reach GitHub. Check your internet connection and try again."
  msg "מורידים את קובץ ההגדרות של גרסה $ver..." "Downloading the settings file for version $ver..."
  curl -fsSL --retry 2 -m 60 "https://raw.githubusercontent.com/$REPO/v${ver#v}/docker-compose.yml" -o "$tmp/docker-compose.yml" \
    || fail "ההורדה נכשלה. בודקים את החיבור לאינטרנט ומנסים שוב." "The download failed. Check your internet connection and try again."
  grep -q '^services:' "$tmp/docker-compose.yml" || fail "הקובץ שירד לא נראה תקין. מנסים שוב מאוחר יותר." "The downloaded file does not look right. Try again later."
fi

# ---- 5. Create the folder, write the files --------------------------------------------
mkdir -p "$INSTALL_DIR" || fail "לא הצלחנו ליצור את התיקייה $INSTALL_DIR." "Could not create the folder $INSTALL_DIR."
cp "$tmp/docker-compose.yml" "$INSTALL_DIR/docker-compose.yml"
printf '%s\n' "$env_text" > "$INSTALL_DIR/.env"
msg "✓ נוצרה התיקייה $INSTALL_DIR" "✓ Created the folder $INSTALL_DIR"

# ---- 6. Start -------------------------------------------------------------------------
msg "מפעילים את תזרים. בפעם הראשונה Docker מוריד את האפליקציה, וזה יכול לקחת כמה דקות..." \
    "Starting Tazrim. The first time Docker downloads the app, which can take a few minutes..."
if ! (cd "$INSTALL_DIR" && docker compose up -d); then
  fail "ההפעלה נכשלה. ההודעה של Docker מופיעה למעלה. אם כתוב שם על חיבור או הורדה, בודקים את האינטרנט. ההתקנה נשארה ב-$INSTALL_DIR, ואפשר ללחוץ שוב על הקובץ." \
       "Starting failed. Docker's message is above; if it mentions a connection or a download, check your internet. The install stays in $INSTALL_DIR, and you can double-click this file again."
fi
wait_healthy "$PORT" || fail "תזרים לא ענתה תוך שתי דקות. אפשר לראות מה קרה עם: cd \"$INSTALL_DIR\" && docker compose logs" \
                            "Tazrim did not answer within two minutes. To see why: cd \"$INSTALL_DIR\" && docker compose logs"

# ---- 7. Open --------------------------------------------------------------------------
echo
msg "✓ תזרים רצה! פותחים את הדפדפן להגדרה הראשונה." "✓ Tazrim is running! Opening the browser for first-time setup."
open_url "http://localhost:$PORT/setup"
msg "אם הדפדפן לא נפתח: http://localhost:$PORT/setup" "If the browser did not open: http://localhost:$PORT/setup"
[ -n "$lan_ip" ] && msg "מהטלפון (באותה רשת Wi-Fi): http://$lan_ip:$PHONE_PORT" "From a phone on the same Wi-Fi: http://$lan_ip:$PHONE_PORT"
finish 0
