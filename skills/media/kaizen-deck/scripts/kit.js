// Cinematic story deck helpers: A5 landscape, dark ink + one accent, serif display + sans body.
// Branding is adjustable: makeDeck(title, { INK, CREAM, MUTED, GOLD, GOLD_BG, SERIF, SANS, logo, logoRatio, cardBg }).
const pptxgen = require("pptxgenjs");

const W = 8.268, H = 5.827, M = 0.6;
const DEFAULTS = {
  INK: "14110F", CREAM: "F3EDE3", MUTED: "B8AFA3", GOLD: "C9A24E", GOLD_BG: "C9A96E", cardBg: "1E1A17",
  SERIF: "Playfair Display", SANS: "Inter",
  logo: null,        // path to a light-on-dark logo PNG; null = no logo drawn
  logoRatio: 0.226,  // logo height / width
};

function makeDeck(title, brand = {}) {
  const { INK, CREAM, MUTED, GOLD, GOLD_BG, SERIF, SANS, logo: logoPath, logoRatio, cardBg } = { ...DEFAULTS, ...brand };
  const pres = new pptxgen();
  pres.defineLayout({ name: "A5L", width: W, height: H });
  pres.layout = "A5L";
  pres.title = title;
  let page = 0;

  const notesWith = (notes, credit) => notes + (credit ? `\n\nFoto: ${credit} / Unsplash.` : "");

  function slide(bgFile, notes, dark = true) {
    const s = pres.addSlide();
    page++;
    s.background = { color: dark ? INK : GOLD_BG };
    if (bgFile) s.addImage({ path: `bg/${bgFile}.jpg`, x: 0, y: 0, w: W, h: H });
    s.addText(String(page).padStart(2, "0"), {
      x: W - M - 0.6, y: H - 0.45, w: 0.6, h: 0.25, align: "right", margin: 0,
      fontFace: SANS, fontSize: 8, color: dark ? MUTED : INK, charSpacing: 2, isTextBox: true,
    });
    s.addNotes(notes);
    return s;
  }

  function kicker(s, text, y, x = M) {
    s.addText(text.toUpperCase(), {
      x, y, w: W - x - M, h: 0.3, margin: 0, fontFace: SANS, fontSize: 9, bold: true,
      color: GOLD, charSpacing: 4, isTextBox: true,
    });
  }

  function headline(s, text, y, h, opts = {}) {
    s.addText(text, {
      x: opts.x || M, y, w: opts.w || 5.6, h, margin: 0, fontFace: SERIF, fontSize: opts.size || 30,
      color: opts.color || CREAM, valign: "top", lineSpacingMultiple: 0.95, isTextBox: true, ...opts.extra,
    });
  }

  function body(s, text, y, h, opts = {}) {
    s.addText(text, {
      x: opts.x || M, y, w: opts.w || 4.6, h, margin: 0, fontFace: SANS, fontSize: opts.size || 12,
      color: opts.color || MUTED, valign: "top", lineSpacingMultiple: 1.2, isTextBox: true,
    });
  }

  function logo(s, x, y, w) {
    if (logoPath) s.addImage({ path: logoPath, x, y, w, h: w * logoRatio });
  }

  // Photo story beat: text sits low on the slide (photo gradient is at the bottom or left).
  function story(bgFile, { kick, title, sub, notes, credit, top = 3.2 }) {
    const s = slide(bgFile, notesWith(notes, credit));
    kicker(s, kick, top);
    headline(s, title, top + 0.35, 1.1, { size: 28, w: 6.2 });
    if (sub) body(s, sub, top + 1.6, 0.6, { w: 5.2 });
    return s;
  }

  // Black pause slide.
  function pause(line, sub, notes) {
    const s = slide(null, notes);
    s.addText(line, {
      x: 0.8, y: 2.1, w: W - 1.6, h: 0.9, align: "center", valign: "middle", margin: 0,
      fontFace: SERIF, fontSize: 28, italic: true, color: CREAM, isTextBox: true,
    });
    if (sub) s.addText(sub, {
      x: 0.8, y: 3.1, w: W - 1.6, h: 0.5, align: "center", margin: 0, fontFace: SANS, fontSize: 12,
      color: MUTED, isTextBox: true,
    });
    return s;
  }

  // Gold statement slide.
  function question(line, notes) {
    const s = slide(null, notes, false);
    s.addText(line, {
      x: 1.0, y: 1.9, w: W - 2.0, h: 1.8, align: "center", valign: "middle", margin: 0,
      fontFace: SERIF, fontSize: 32, italic: true, color: INK, isTextBox: true,
    });
    return s;
  }

  // Product name reveal.
  function reveal(name, tagline, line, notes) {
    const s = slide(null, notes);
    s.addText(name, {
      x: 0, y: 1.75, w: W, h: 1.0, align: "center", margin: 0, fontFace: SERIF, fontSize: 54,
      color: CREAM, isTextBox: true,
    });
    s.addText(tagline, {
      x: 0, y: 2.85, w: W, h: 0.5, align: "center", margin: 0, fontFace: SERIF, fontSize: 17,
      italic: true, color: CREAM, isTextBox: true,
    });
    s.addText(line.toUpperCase(), {
      x: 0, y: 3.45, w: W, h: 0.3, align: "center", margin: 0, fontFace: SANS, fontSize: 9,
      bold: true, color: GOLD, charSpacing: 4, isTextBox: true,
    });
    return s;
  }

  // Feature slide: kicker, headline, feature rows in a left text column.
  // shot: product screenshot path shown framed on the right (bgFile may be null); shotRatio = w/h.
  function scene(bgFile, { kick, title, features, notes, credit, shot, shotRatio = 1.6 }) {
    const s = slide(bgFile, notesWith(notes, credit));
    if (shot) {
      const sw = 3.0, sh = sw / shotRatio, sx = W - M - sw, sy = (H - sh) / 2;
      s.addShape(pres.shapes.RECTANGLE, { x: sx - 0.06, y: sy - 0.06, w: sw + 0.12, h: sh + 0.12, fill: { color: cardBg }, line: { color: GOLD, width: 0.75 } });
      s.addImage({ path: shot, x: sx, y: sy, w: sw, h: sh });
    }
    kicker(s, kick, M);
    headline(s, title, 0.95, 1.0, { size: 24, w: 4.3 });
    let y = 2.1;
    features.forEach(([name, desc]) => {
      s.addText([
        { text: name, options: { fontFace: SANS, fontSize: 11, bold: true, color: CREAM, breakLine: true } },
        { text: desc, options: { fontFace: SANS, fontSize: 9.5, color: MUTED } },
      ], { x: M, y, w: shot ? 3.85 : 4.3, h: 0.62, margin: 0, valign: "top", lineSpacingMultiple: 1.1, isTextBox: true });
      y += 0.7;
    });
    return s;
  }

  // Three dark cards.
  function cards(kick, title, items, notes, footnote) {
    const s = slide(null, notes);
    kicker(s, kick, M);
    headline(s, title, 0.95, 0.9, { size: 26, w: 6.8 });
    const cw = 2.2, gap = (W - 2 * M - 3 * cw) / 2, cy = 2.3;
    items.forEach(([label, name, desc], i) => {
      const x = M + i * (cw + gap);
      s.addShape(pres.shapes.RECTANGLE, { x, y: cy, w: cw, h: 2.0, fill: { color: cardBg } });
      s.addText([
        { text: label.toUpperCase(), options: { fontFace: SANS, fontSize: 8, bold: true, color: GOLD, charSpacing: 1, breakLine: true } },
        { text: name, options: { fontFace: SERIF, fontSize: 17, color: CREAM, breakLine: true } },
        { text: desc, options: { fontFace: SANS, fontSize: 10, color: MUTED } },
      ], { x: x + 0.2, y: cy + 0.2, w: cw - 0.4, h: 1.6, margin: 0, valign: "top", paraSpaceAfter: 6, isTextBox: true });
    });
    if (footnote) body(s, footnote, 4.6, 0.3, { size: 10, w: 7.0 });
    return s;
  }

  function cta(bgFile, { title, sub, facts, notes, credit, kick = "Langkah berikutnya", label = "Jadwalkan demo",
    contact = "[Nama]  ·  [WhatsApp]  ·  [Email]", site = "[website]", qr = null }) {
    const s = slide(bgFile, notesWith(notes, credit));
    kicker(s, kick, 1.5);
    headline(s, title, 1.85, 1.0, { size: 30, w: 6.2 }); // room for two lines
    body(s, sub, 2.95, 0.5, { w: 4.4 });
    s.addText([
      { text: label.toUpperCase(), options: { fontFace: SANS, fontSize: 9, bold: true, color: GOLD, charSpacing: 4, breakLine: true } },
      { text: contact, options: { fontFace: SANS, fontSize: 12, color: CREAM, breakLine: true } },
      { text: site, options: { fontFace: SANS, fontSize: 12, color: MUTED } },
    ], { x: M, y: 3.55, w: 4.4, h: 0.9, margin: 0, valign: "top", paraSpaceAfter: 4, isTextBox: true });
    if (qr) s.addImage({ path: qr, x: W - M - 1.3, y: 3.2, w: 1.3, h: 1.3 });
    else { s.addShape(pres.shapes.RECTANGLE, { x: W - M - 1.3, y: 3.2, w: 1.3, h: 1.3, fill: { color: CREAM } }); s.addText("[QR]", { x: W - M - 1.3, y: 3.2, w: 1.3, h: 1.3, align: "center", valign: "middle", margin: 0, fontFace: SANS, fontSize: 12, color: INK, isTextBox: true }); }
    if (facts) body(s, facts, 4.45, 0.3, { size: 9 });
    logo(s, M, H - 0.55, 1.6);
    return s;
  }

  return { pres, slide, kicker, headline, body, logo, story, pause, question, reveal, scene, cards, cta };
}

module.exports = { makeDeck, W, H, M };
