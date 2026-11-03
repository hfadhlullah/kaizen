// Installers for the kaizen desktop app. Version follows the kaizen package, so the
// app, the npm package and the GitHub release share one tag.
const { version } = require("../package.json");

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "id.sarahdigital.kaizen",
  productName: "Kaizen",
  executableName: "kaizen-desktop",
  extraMetadata: { version },
  artifactName: "kaizen-desktop-${version}-${os}-${arch}.${ext}",
  directories: { output: "release", buildResources: "build-resources" },
  files: ["dist/**", "package.json"],
  extraResources: [
    { from: "build/kaizen", to: "kaizen" },
    { from: "build/bun-${arch}", to: "bun" },
    // The AppImage copies it into the icon theme for its own menu entry (src/appimage.ts).
    { from: "../assets/kaizen-logo.png", to: "icon.png" },
  ],
  icon: "../assets/kaizen-logo.png",
  // Orca ships Electron's default fuses; these close the "run this binary as plain
  // Node" and inspector doors at no cost to the app.
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    onlyLoadAppFromAsar: true,
  },
  // scripts/update-test.ts builds against a local feed; every other build, GitHub.
  publish: process.env.KAIZEN_UPDATE_TEST_FEED
    ? { provider: "generic", url: process.env.KAIZEN_UPDATE_TEST_FEED }
    : { provider: "github", owner: "hfadhlullah", repo: "kaizen", releaseType: "draft" },
  linux: {
    target: ["AppImage", "deb", "rpm", "pacman"],
    category: "Development",
    maintainer: "Husein Fadhlullah <firman.solihuddin@gmail.com>",
    synopsis: "The kaizen board in its own window",
    desktop: { entry: { StartupWMClass: "kaizen" } },
  },
  // electron-builder's default pacman depends name libappindicator-gtk3, which is
  // only in the AUR, so `pacman -U` fails on Arch. These are all in the official repos.
  pacman: { depends: ["gtk3", "nss", "alsa-lib", "libxss", "libnotify", "libsecret", "xdg-utils"] },
  mac: {
    target: ["dmg", "zip"],
    category: "public.app-category.developer-tools",
    // Unsigned for now (approved decision 2): no identity, no notarization.
    identity: null,
  },
  // SignPath signs the built installer in CI (approved decision 1); nothing here.
  win: { target: ["nsis"] },
  nsis: { oneClick: true, perMachine: false },
};
