#!/usr/bin/env bash
# The kind of release, from the titles of the PRs merged since the last one (one title per line on stdin):
#
#   fix: …              patch   (so are chore:, docs:, refactor:, perf:, test:, ci:, build:, style:)
#   feat: …             minor
#   feat!: …            major   (any <type>!: …, also with a scope: fix(cards)!: …)
#   no prefix           minor   (so nothing is released as a mere patch by mistake)
#
#   release-bump.sh          prints the biggest bump among the titles (major > minor > patch);
#                            no titles at all gives minor
#   release-bump.sh --each   prints "<bump><TAB><title>" for every title, unprefixed ones as "minor (no prefix)"
set -euo pipefail

mode="${1:-}"
case "$mode" in
  "" | --each) ;;
  *) echo "usage: release-bump.sh [--each] < titles" >&2; exit 2 ;;
esac

bump_of() {
  local t="$1"
  if [[ "$t" =~ ^[a-z]+(\([^\)]*\))?\!:\  ]]; then echo major
  elif [[ "$t" =~ ^feat(\([^\)]*\))?:\  ]]; then echo minor
  elif [[ "$t" =~ ^(fix|chore|docs|refactor|perf|test|ci|build|style)(\([^\)]*\))?:\  ]]; then echo patch
  else echo "minor (no prefix)"
  fi
}

best=""
while IFS= read -r title || [ -n "$title" ]; do
  [ -z "$title" ] && continue
  b=$(bump_of "$title")
  if [ "$mode" = --each ]; then printf '%s\t%s\n' "$b" "$title"; fi
  case "$b" in
    major) best=major ;;
    minor*) [ "$best" = major ] || best=minor ;;
    patch) [ -n "$best" ] || best=patch ;;
  esac
done

if [ "$mode" = "" ]; then echo "${best:-minor}"; fi
