#!/bin/sh
# Runs after `bun publish`: tag the published version and open a GitHub release
# for it, so a version can never exist on npm with nothing to read on GitHub.
#
# Never fails the publish. The package is already public by the time this runs;
# exiting non-zero here would report a failure that did not happen.
set -u
v="${npm_package_version:-$(bun -p "require('./package.json').version" 2>/dev/null)}"
[ -n "$v" ] || { echo "release: no version, skipping"; exit 0; }
tag="v$v"

git rev-parse --git-dir >/dev/null 2>&1 || { echo "release: not a git checkout, skipping"; exit 0; }

if git rev-parse "$tag" >/dev/null 2>&1; then
  echo "release: $tag already tagged"
else
  git tag -a "$tag" -m "kaizen-agent $tag" || { echo "release: could not tag"; exit 0; }
  git push origin "$tag" >/dev/null 2>&1 || echo "release: tag made but not pushed"
fi

command -v gh >/dev/null 2>&1 || { echo "release: gh not installed — tag pushed, write the release by hand"; exit 0; }
gh auth status >/dev/null 2>&1 || { echo "release: gh not logged in — tag pushed, write the release by hand"; exit 0; }

if gh release view "$tag" >/dev/null 2>&1; then
  echo "release: $tag already released"
  exit 0
fi

# --generate-notes only lists pull requests, and this repo merges none, so the
# notes are built here: the title from the release commit's subject, the body from
# every commit since the previous tag with its message, oldest first.
prev="$(git describe --tags --abbrev=0 "$tag^" 2>/dev/null || true)"
subject="$(git log -1 --format=%s "$tag" | sed -n 's/^Release [0-9.]*: //p')"
title="$tag${subject:+: $subject}"
notes="$(mktemp)"
git log --reverse --format='### %s%n%n%b' ${prev:+"$prev.."}"$tag" \
  | grep -vE '^(Co-Authored-By|Claude-Session):' \
  | grep -vE '^### Release [0-9.]+:' \
  | cat -s > "$notes"
[ -n "$prev" ] && printf '\n**Full Changelog**: https://github.com/hfadhlullah/kaizen/compare/%s...%s\n' "$prev" "$tag" >> "$notes"
gh release create "$tag" --title "$title" --notes-file "$notes" >/dev/null 2>&1 \
  && echo "release: published $tag  https://github.com/hfadhlullah/kaizen/releases/tag/$tag" \
  || echo "release: tag pushed, release not created"
rm -f "$notes"
exit 0
