#!/bin/sh
# Runs after `bun publish`: tag the published version and draft its GitHub release.
# desktop.yml publishes the draft once the installers are attached and green.
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

# The release is made as a draft: the desktop workflow publishes it once its
# installers are attached, so the app's updater never meets a release without them.
# A draft already there is the desktop job's placeholder (it ran first): fill it in.
draft="$(gh release view "$tag" --json isDraft -q .isDraft 2>/dev/null || echo none)"
if [ "$draft" = "false" ]; then
  echo "release: $tag already released"
  exit 0
fi

# Kaizen Bot as an app per OS (macOS .dmg, or .zip without mkisofs; Windows setup .exe;
# Linux binaries), attached so users can download it. A failed build still publishes
# the release, just without the app files.
rm -rf bot/dist
assets=""
if (cd bot && bun run build >/dev/null 2>&1); then
  assets="$(ls bot/dist/Kaizen-Bot-* bot/dist/kaizen-bot-linux-* 2>/dev/null)"
  ls bot/dist/*.zip >/dev/null 2>&1 && echo "release: mkisofs not found (install cdrtools), macOS app attached as .zip instead of .dmg"
else
  echo "release: Kaizen Bot app build failed, releasing without it"
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
if [ "$draft" = "true" ]; then
  err="$(gh release edit "$tag" --title "$title" --notes-file "$notes" 2>&1 >/dev/null \
    && { [ -z "$assets" ] || gh release upload "$tag" $assets --clobber 2>&1 >/dev/null; })" \
    && echo "release: filled in the desktop job's draft $tag; publish it by hand  https://github.com/hfadhlullah/kaizen/releases" \
    || echo "release: tag pushed, draft not filled in: $err"
else
  err="$(gh release create "$tag" --draft --title "$title" --notes-file "$notes" $assets 2>&1 >/dev/null)" \
    && echo "release: drafted $tag; the desktop workflow publishes it once its installers are attached" \
    || echo "release: tag pushed, release not created: $err"
fi
rm -f "$notes"
exit 0
