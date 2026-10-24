#!/usr/bin/env bash
# The newest release: the highest vX.Y.Z tag by version order (not by date, not other tag names).
# Prints the version without the v, or nothing when there is no release yet.
set -euo pipefail

git tag --list 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sed 's/^v//' | sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1 || true
