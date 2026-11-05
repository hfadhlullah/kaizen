# Verify: play it, look at it, measure it

## Browsers
- **Swiftshader** (CPU WebGL, works headless everywhere, deterministic): use it for screenshots and play-throughs.
  Args: `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`. Frame times here are meaningless.
- **Real GPU** (`--gpu` in the scripts): `--enable-gpu --ignore-gpu-blocklist --use-angle=vulkan --enable-features=Vulkan`.
  Use it for any claim about smoothness. The scripts print the WebGL renderer string, so check that it is not SwiftShader.

## The minimum, every pass
1. `node $S/smoke.mjs <url> --screens <list>` at 390×844 (touch, DPR 2) and 1440×900. It fails on page errors, console errors,
   failed requests and horizontal overflow, and writes a screenshot per screen and size.
2. **Read every screenshot yourself.** Text overflowing a button, a label hidden behind a control, or a field under the dock show only in pictures.
   Longer translated sentences break layouts that fitted the English sample.
3. **Play every round by real input** (Playwright `page.touchscreen.tap`, `page.mouse`, `page.keyboard`) to the result and the review screen.
   Do it once clean and once with deliberate mistakes, and once let a round time out. Never call game functions to skip play, because that hides input bugs.
4. **Check the rules end to end.** Unlock gates fire without the URL shortcut, the final is closed to non-qualifiers,
   a replay does not change the score, the review rows match what happened, and the podium leads back to the hub.
5. **Check leaks.** Read `__game.gpu` and `document.querySelectorAll('*').length` in the hub, then after playing several rounds in a row and returning.
   The numbers should come back to about the hub baseline.
6. `file://` and no-WebGL fallbacks load without errors.

Write the long play-through as one `e2e.mjs` in the scratchpad and rerun it after every fix pass, adapting the selectors as the markup changes.

## When the user says it stutters
Measure before you change anything:
```
node $S/frames.mjs '<url>?screen=hub' --size 2000x1100 --click 700,600 --gpu --ms 2500
```
It wraps `requestAnimationFrame` and reports frame gaps (p50, p95, max, frames over 33 ms) plus long tasks around one interaction.
- **Gaps over 33 ms or long tasks:** it is a rendering or JS cost. Look for per-frame scene traversal, shader compiles on first view (warm them up with `renderer.compile`), and texture uploads.
- **A steady 60 fps that still "feels" jerky:** it is the motion. Log the camera every frame (a `page.route` that injects a log line into the page's render call).
  Look for two tweens fighting, a clamp stopping a tween, a target that moves while it is being eased towards, or a spin that stops abruptly.
- Repeat at the user's window size. If it still feels wrong after a clean measurement, ask which browser and device they use. Don't guess further.
