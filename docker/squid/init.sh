# Squid's wrapper (ENG-131, ENG-142): makes sure every file squid.conf names exists, then starts the
# image's own entrypoint. Runs as root in the squid container, with ./egress mounted at /etc/squid/extra.
#
#   extra-domains.txt            the owner's additions for all providers (empty)
#   providers/<id>.txt           what the provider's port may reach. The UPDATER keeps these: the
#                                household's providers get their domains, the others an empty list.
#   providers/extra-<id>.txt     the owner's additions for one provider (empty)
#
# A file that is missing is created here and never touched again. Until the app has told the updater
# which providers the household uses (POST /v1/egress/providers, right after the app starts), nobody
# knows, so a MISSING provider file starts FULL (that provider's domains, from banks.txt): the same
# reach as before per-provider lists. After that call every file exists and only the updater changes it.
set -e
E=/etc/squid/extra
P=$E/providers
mkdir -p "$P"
[ -e "$E/extra-domains.txt" ] || : > "$E/extra-domains.txt"
# banks.txt: "# --- <id>: <name>" starts a provider; its lines (without comments) are its domains
D=$(mktemp -d)
awk -v dir="$D" '
  /^# --- / { id = $3; sub(/:$/, "", id); out = dir "/" id ".txt"; printf "" > out; next }
  /^#/ || /^[ \t]*$/ { next }
  out != "" { print > out }
' /etc/squid/banks.txt
for f in "$D"/*.txt; do
  id=$(basename "$f" .txt)
  [ -e "$P/$id.txt" ] || cp "$f" "$P/$id.txt"
  [ -e "$P/extra-$id.txt" ] || : > "$P/extra-$id.txt"
done
rm -rf "$D"
# Files made here belong to whoever owns the folder (not root), as the updater's do
chown -R "$(stat -c %u:%g "$E")" "$P" "$E/extra-domains.txt" 2>/dev/null || true
exec entrypoint.sh "$@"
