#!/usr/bin/env bash
# The next release version, from the newest release tag (vX.Y.Z, latest-release.sh) and the kind
# of release (the Release workflow gets it from the merged PRs' titles with release-bump.sh):
#
#   next-version.sh patch   1.4.2 -> 1.4.3   fixes only
#   next-version.sh minor   1.4.2 -> 1.5.0   new features
#   next-version.sh major   1.4.2 -> 2.0.0   big or breaking changes
#
# With no release tag yet, the first version is 1.0.0. Prints the version without the v.
set -euo pipefail

bump="${1:-}"
case "$bump" in
  patch | minor | major) ;;
  *) echo "usage: next-version.sh patch|minor|major" >&2; exit 2 ;;
esac

latest=$(bash "$(dirname "$0")/latest-release.sh")
if [ -z "$latest" ]; then
  echo "1.0.0"
  exit 0
fi

IFS=. read -r major minor patch <<< "$latest"
case "$bump" in
  major) echo "$((major + 1)).0.0" ;;
  minor) echo "$major.$((minor + 1)).0" ;;
  patch) echo "$major.$minor.$((patch + 1))" ;;
esac
