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
    .from(".hero .pill", { y: 18, autoAlpha: 0, duration: 0.8 }, 0.65);

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
