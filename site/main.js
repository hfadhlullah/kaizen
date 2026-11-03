const cmd = document.getElementById("cmd");
const copy = document.getElementById("copy");
const os = [...document.querySelectorAll(".os button")];

os.forEach((b) =>
  b.addEventListener("click", () => {
    os.forEach((o) => o.setAttribute("aria-pressed", o === b));
    cmd.textContent = b.dataset.cmd;
  }),
);

copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(cmd.textContent);
    copy.textContent = "Copied";
  } catch {
    getSelection().selectAllChildren(cmd);
    copy.textContent = "Press Ctrl+C";
  }
  setTimeout(() => (copy.textContent = "Copy"), 1600);
});

// Desktop app: links come straight from the latest GitHub release, so a card only
// appears for a file that exists. No desktop files there (or no network): the section
// stays hidden and the install line above is the whole offer.
const ASSET = {
  "mac-arm64": /-mac-arm64\.dmg$/,
  "mac-x64": /-mac-x64\.dmg$/,
  "win-x64": /-win-x64\.exe$/,
  "linux-appimage": /-linux-x86_64\.AppImage$/,
  "linux-deb": /-linux-amd64\.deb$/,
  "linux-rpm": /-linux-x86_64\.rpm$/,
  "linux-pacman": /-linux-x64\.pacman$/,
  "linux-arm64": /-linux-arm64\.AppImage$/,
};
const NOTE = {
  mac: "macOS: not signed by Apple yet, so the first time, right-click the app and choose Open.",
  win: "Windows may show a SmartScreen warning: choose More info, then Run anyway.",
  linux: "Linux: make the AppImage executable and open it. It adds itself to your app menu and updates itself. The .deb, .rpm and .pacman packages update by hand.",
};
// Phones and tablets first: iOS says "like Mac OS X" and Android says "Linux".
const ua = navigator.userAgent;
const myOs = /iPhone|iPad|iPod|Android|Mobile/.test(ua) ? null : /Win/.test(ua) ? "win" : /Mac/.test(ua) ? "mac" : /Linux|X11|CrOS/.test(ua) ? "linux" : null;
fetch("https://api.github.com/repos/hfadhlullah/kaizen/releases/latest", { headers: { accept: "application/vnd.github+json" } })
  .then((r) => (r.ok ? r.json() : null))
  .then((rel) => {
    let any = false;
    for (const el of document.querySelectorAll("#desktop [data-asset]")) {
      const a = rel?.assets?.find((x) => ASSET[el.dataset.asset].test(x.name));
      if (!a) continue;
      (el.matches("a") ? el : el.querySelector("a")).href = a.browser_download_url;
      el.hidden = false;
      any = true;
    }
    if (!any) return;
    // The card for this computer is marked; Apple silicon stands for "a Mac", since
    // a browser cannot tell an Intel Mac apart.
    const mine = { mac: "mac-arm64", win: "win-x64", linux: "linux-appimage" }[myOs];
    document.querySelector(`.dl[data-asset="${mine}"]:not([hidden])`)?.classList.add("mine");
    document.getElementById("desk-more").hidden = !document.querySelector("#desk-more a:not([hidden])");
    document.getElementById("desk-ver").textContent = `Latest: ${rel.tag_name}.`;
    document.getElementById("desk-note").textContent = myOs ? NOTE[myOs] : `${NOTE.mac} ${NOTE.win}`;
    document.getElementById("desktop").hidden = false;
    // The nav's Download goes to the builds once there are some; until then, to Install.
    document.getElementById("nav-dl").href = "#desktop";
  })
  .catch(() => {});

// Motion only ever starts from a visible page: without JS, or with reduced motion, nothing is hidden.
const mm = gsap.matchMedia();
mm.add("(prefers-reduced-motion: no-preference)", () => {
  gsap.registerPlugin(ScrollTrigger);
  const ease = "power3.out";

  gsap
    .timeline({ defaults: { ease } })
    .from(".ascii", { autoAlpha: 0, duration: 1.4 }, 0)
    .from(".kanji", { autoAlpha: 0, duration: 0.8 }, 0)
    .from("h1 span", { yPercent: 40, autoAlpha: 0, duration: 1.1, stagger: 0.12 }, 0.1)
    .from(".sub", { y: 24, autoAlpha: 0, duration: 0.9 }, 0.5)
    .from(".hero .pill", { y: 18, autoAlpha: 0, duration: 0.8, clearProps: "all" }, 0.65);

  gsap.to(".ascii", { yPercent: 18, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });

  gsap.from(".frame", {
    scale: 0.72,
    borderRadius: 44,
    ease: "none",
    scrollTrigger: { trigger: ".stage", start: "top 95%", end: "top 20%", scrub: 0.6 },
  });

  gsap.utils.toArray(".tile").forEach((t, i) =>
    gsap.from(t, {
      y: 70,
      autoAlpha: 0,
      scale: 0.97,
      duration: 1,
      ease,
      delay: (i % 2) * 0.08,
      scrollTrigger: { trigger: t, start: "top 90%", toggleActions: "play none none reverse" },
    }),
  );

  gsap.from(".cold img", { y: 120, ease: "none", scrollTrigger: { trigger: ".cold", start: "top 80%", end: "bottom 60%", scrub: 0.6 } });
  gsap.from(".iphone", { y: 110, ease: "none", scrollTrigger: { trigger: ".phone", start: "top 85%", end: "bottom 70%", scrub: 0.6 } });
  gsap.from(".ring", { strokeDashoffset: 1, duration: 1.6, ease: "power2.inOut", scrollTrigger: { trigger: ".loop", start: "top 80%", toggleActions: "play none none reverse" } });
  gsap.from(".approve", { scale: 0.8, autoAlpha: 0, duration: 0.7, ease: "back.out(2.2)", scrollTrigger: { trigger: ".plan", start: "top 75%", toggleActions: "play none none reverse" } });

  // Each block's words stutter in one after another as it enters, and clear on the way back.
  gsap.utils.toArray(".tile h2:not(.words), .tile p, .words span, .flow span, .install h2").forEach((block) => {
    const words = block.textContent.trim().split(/\s+/);
    block.textContent = "";
    block.classList.add("armed");
    words.forEach((word, i) => {
      const w = document.createElement("span");
      w.className = "w";
      w.style.setProperty("--i", i);
      w.textContent = word;
      block.append(w, " ");
    });
    ScrollTrigger.create({
      trigger: block,
      start: "top 88%",
      onEnter: () => block.classList.add("in"),
      onLeaveBack: () => block.classList.remove("in"),
    });
  });
});

addEventListener("load", () => ScrollTrigger.refresh());
