#!/bin/sh
# Runs after `npm publish`: tag the published version and open a GitHub release
# for it, so a version can never exist on npm with nothing to read on GitHub.
#
# Never fails the publish. The package is already public by the time this runs;
# exiting non-zero here would report a failure that did not happen.
set -u
v="${npm_package_version:-$(node -p "require('./package.json').version" 2>/dev/null)}"
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

# --generate-notes lists the commits since the last tag. Good enough to never be
# empty; rewrite it with what actually changed when the release matters.
gh release create "$tag" --title "$tag" --generate-notes >/dev/null 2>&1 \
  && echo "release: published $tag  https://github.com/hfadhlullah/kaizen/releases/tag/$tag" \
  || echo "release: tag pushed, release not created"
exit 0
