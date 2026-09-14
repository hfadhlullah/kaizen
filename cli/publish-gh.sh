#!/bin/sh
# Publish the same tarball to GitHub Packages, so the repo's "Packages" box lists
# it. GitHub only accepts names scoped to the repo owner, so the package goes there
# as @hfadhlullah/kaizen-agent while npm keeps kaizen-agent. Run after `bun publish`.
set -eu
cd "$(dirname "$0")/.."
token="${GITHUB_TOKEN:-$(gh auth token 2>/dev/null || true)}"
[ -n "$token" ] || { echo "publish-gh: no GitHub token (gh auth login, scope write:packages)"; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp package.json "$tmp/package.json.orig"
bun -e '
  const p = JSON.parse(await Bun.file("package.json").text());
  p.name = "@hfadhlullah/kaizen-agent";
  p.publishConfig = { registry: "https://npm.pkg.github.com" };
  await Bun.write("package.json", JSON.stringify(p, null, 2) + "\n");
'
# Bun reads the project's own .npmrc; a temporary one carries the token and never
# lands in git (it is removed on exit, and .gitignore refuses it besides).
[ -e .npmrc ] && cp .npmrc "$tmp/npmrc.orig"
printf '//npm.pkg.github.com/:_authToken=%s\n@hfadhlullah:registry=https://npm.pkg.github.com\n' "$token" > .npmrc
# The scoped copy must not run postpublish: the tag and release already exist.
bun publish --ignore-scripts "$@" || status=$?
cp "$tmp/package.json.orig" package.json
if [ -e "$tmp/npmrc.orig" ]; then cp "$tmp/npmrc.orig" .npmrc; else rm -f .npmrc; fi
exit "${status:-0}"
