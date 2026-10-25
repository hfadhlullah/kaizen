// Story-video engine. One film = public/<folder>/film.json (beats) + words.json (VO word timings)
// + a preset from presets.json. Renders 16:9 or 9:16 from the same film (layout follows the frame).
import React from 'react';
import {
  AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, random, spring, staticFile,
  useCurrentFrame, useVideoConfig,
} from 'remotion';
import { loadFont as loadPlayfair } from '@remotion/google-fonts/PlayfairDisplay';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadFraunces } from '@remotion/google-fonts/Fraunces';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins';
import { loadFont as loadDMSans } from '@remotion/google-fonts/DMSans';
import { loadFont as loadLora } from '@remotion/google-fonts/Lora';
import { loadFont as loadJakarta } from '@remotion/google-fonts/PlusJakartaSans';
import { loadFont as loadSpace } from '@remotion/google-fonts/SpaceGrotesk';
import PRESETS from './presets.json';

const FONTS: Record<string, string> = {
  'Playfair Display': loadPlayfair('normal', { weights: ['400'], subsets: ['latin'] }).fontFamily,
  Inter: loadInter('normal', { weights: ['400', '700', '900'], subsets: ['latin'] }).fontFamily,
  Fraunces: loadFraunces('normal', { weights: ['400', '700'], subsets: ['latin'] }).fontFamily,
  Montserrat: loadMontserrat('normal', { weights: ['400', '700', '900'], subsets: ['latin'] }).fontFamily,
  Poppins: loadPoppins('normal', { weights: ['400', '700', '900'], subsets: ['latin'] }).fontFamily,
  'DM Sans': loadDMSans('normal', { weights: ['400', '700'], subsets: ['latin'] }).fontFamily,
  Lora: loadLora('normal', { weights: ['400', '700'], subsets: ['latin'] }).fontFamily,
  'Plus Jakarta Sans': loadJakarta('normal', { weights: ['400', '700', '800'], subsets: ['latin'] }).fontFamily,
  'Space Grotesk': loadSpace('normal', { weights: ['400', '700'], subsets: ['latin'] }).fontFamily,
};
loadPlayfair('italic', { weights: ['400'], subsets: ['latin'] });

// Files live in the public dir (the film folder when rendered by master.sh); `folder` is an optional prefix.
const asset = (film: Film, n: string) => staticFile(film.folder ? `${film.folder}/${n}` : n);

export type PresetName = keyof typeof PRESETS;
type Preset = (typeof PRESETS)[PresetName];
// A film's brand overrides the preset's palette/fonts; any font in FONTS may be named.
const resolve = (film: Film): Preset => {
  const base = PRESETS[film.preset];
  return { ...base, palette: { ...base.palette, ...(film.brand?.palette ?? {}) }, fonts: { ...base.fonts, ...(film.brand?.fonts ?? {}) } } as Preset;
};
export const FPS = 30;

export type Beat = {
  vo?: string;                       // key in words.json
  kind: 'photo' | 'black' | 'question' | 'reveal' | 'stat' | 'list' | 'triptych' | 'shot' | 'footage' | 'cta';
  img?: string;                      // file in the folder (photo/shot/cta/stat/list background)
  video?: string;                    // footage: mp4 in the folder
  shotRatio?: number;
  side?: 'bottom' | 'left';
  kick?: string; title?: string; sub?: string; line?: string;
  items?: string[];                  // list: staged one by one across the line
  stat?: { value: number; suffix?: string; label: string; source?: string }[];
  panels?: { img: string; title: string; sub: string }[];
  sfx?: string[];                    // extra sound effects at the beat start (files in /sfx)
  ambience?: string;                 // looped room tone under the beat (file in /sfx)
  hold?: number;                     // seconds added after the VO
};
export type Film = {
  preset: PresetName; folder?: string; logo?: string; logoOnLight?: string; qr?: string;
  language?: string; voice?: string;                    // used by scripts/vo.py (default id / Matilda)
  brand?: { palette?: Partial<Preset['palette']>; fonts?: Partial<Preset['fonts']> };
  labels?: { source?: string; next?: string };          // on-screen words, in the film's language
  cta?: { kick?: string; title: string; sub?: string; lines?: string[]; url?: string };
  beats: Beat[];
};
export type Words = Record<string, { dur: number; offset: number; text: string; words: { w: string; s: number; e: number }[] }>;

export const timeline = (film: Film, words: Words) => {
  const p = resolve(film);
  const len = (b: Beat) => Math.round(((b.vo ? p.pace.lead + words[b.vo].dur + p.pace.tail : 0) + (b.hold ?? 0)) * FPS);
  const starts: number[] = [];
  film.beats.forEach((b, i) => starts.push(i === 0 ? 0 : starts[i - 1] + len(film.beats[i - 1])));
  const total = starts[starts.length - 1] + len(film.beats[film.beats.length - 1]);
  const reveal = film.beats.findIndex((b) => b.kind === 'reveal');
  return { len, starts, total, revealAt: reveal >= 0 ? starts[reveal] : Math.round(total / 2) };
};

// ---------- helpers ----------
const useUnit = () => {
  const { width, height } = useVideoConfig();
  return { u: Math.min(width, height) / 1080, portrait: height > width, width, height };
};

const Anim: React.FC<{ p: Preset; delay: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ p, delay, children, style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bouncy = p.text === 'pop';
  const k = spring({ frame: f - delay, fps, config: bouncy ? { damping: 9, stiffness: 160 } : { damping: 200 }, durationInFrames: bouncy ? 20 : 28 });
  const t = p.text === 'rise' ? `translateY(${(1 - k) * 26}px)` : p.text === 'slide' ? `translateX(${(1 - k) * -50}px)` : `scale(${0.6 + 0.4 * k})`;
  return <div style={{ opacity: Math.min(1, k * 1.4), transform: t, transformOrigin: 'left center', ...style }}>{children}</div>;
};

const Kick: React.FC<{ p: Preset; text: string; u: number }> = ({ p, text, u }) => (
  <div style={{ fontFamily: FONTS[p.fonts.body], fontWeight: 700, fontSize: 22 * u, letterSpacing: 9 * u, color: p.palette.accent, textTransform: 'uppercase' }}>{text}</div>
);

const Title: React.FC<{ p: Preset; text: string; u: number; size?: number; italic?: boolean; color?: string }> = ({ p, text, u, size = 88, italic, color }) => (
  <div style={{
    fontFamily: FONTS[p.fonts.display], fontWeight: p.fonts.display === 'Inter' ? 900 : 400, fontStyle: italic ? 'italic' : 'normal',
    fontSize: size * u, lineHeight: 1.08, color: color ?? p.palette.fg, letterSpacing: p.fonts.display === 'Inter' ? -1 * u : 0,
  }}>{text}</div>
);

const Photo: React.FC<{ src: string; d: number; amount: number; style?: React.CSSProperties }> = ({ src, d, amount, style }) => {
  const f = useCurrentFrame();
  const z = interpolate(f, [0, d], [1, 1 + amount]);
  const x = interpolate(f, [0, d], [0, -24]);
  return <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${z}) translateX(${x}px)`, ...style }} />;
};

// ---------- beat ----------
const BeatView: React.FC<{ film: Film; b: Beat; d: number; words: Words }> = ({ film, b, d, words }) => {
  const p = resolve(film);
  const f = useCurrentFrame();
  const { u, portrait } = useUnit();
  const src = (n: string) => asset(film, n);
  const logo = (p.palette.bg.toUpperCase() > '#C' && film.logoOnLight) || film.logo;
  const lead = Math.round(p.pace.lead * FPS);
  const line = b.vo ? words[b.vo].dur * FPS : d;

  // transition in/out
  const fadeIn = interpolate(f, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(f, [d - 10, d], [1, 0], { extrapolateLeft: 'clamp' });
  let wrap: React.CSSProperties = { opacity: Math.min(fadeIn, fadeOut) };
  if (p.transition === 'wipe') wrap = { clipPath: `inset(0 ${interpolate(f, [0, 14], [100, 0], { extrapolateRight: 'clamp' })}% 0 0)`, opacity: fadeOut };
  if (p.transition === 'punch') wrap = { transform: `scale(${interpolate(f, [0, 8], [1.12, 1], { extrapolateRight: 'clamp' })})`, opacity: Math.min(1, fadeOut + 0.0) };

  const pad = portrait ? 80 * u : 140 * u;
  const bgFill = (b.kind === 'question') ? p.palette.accentBg : p.palette.bg;

  const textBlock = (maxW: number, size = 88) => (
    <div style={{ maxWidth: maxW * u }}>
      {b.kick && <Anim p={p} delay={lead}><Kick p={p} text={b.kick} u={u} /></Anim>}
      {b.title && <Anim p={p} delay={lead + 6} style={{ marginTop: 22 * u }}><Title p={p} text={b.title} u={u} size={size} /></Anim>}
      {b.sub && <Anim p={p} delay={lead + 30} style={{ marginTop: 28 * u }}><div style={{ fontFamily: FONTS[p.fonts.body], fontSize: 30 * u, color: p.palette.muted, lineHeight: 1.4 }}>{b.sub}</div></Anim>}
    </div>
  );

  let content: React.ReactNode = null;

  if (b.kind === 'black') {
    content = (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: pad }}>
        <Anim p={p} delay={lead}><Title p={p} text={b.title!} u={u} size={portrait ? 96 : 84} italic={p.fonts.display !== 'Inter'} /></Anim>
        {b.sub && <Anim p={p} delay={lead + Math.round(line * 0.55)} style={{ marginTop: 30 * u }}><div style={{ fontFamily: FONTS[p.fonts.body], fontSize: 34 * u, color: p.palette.muted }}>{b.sub}</div></Anim>}
      </AbsoluteFill>
    );
  } else if (b.kind === 'question') {
    content = (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: pad * 1.5 }}>
        <Anim p={p} delay={lead}><Title p={p} text={b.title!} u={u} size={portrait ? 92 : 88} italic={p.fonts.display !== 'Inter'} color={p.palette.bg} /></Anim>
      </AbsoluteFill>
    );
  } else if (b.kind === 'reveal') {
    const wipe = interpolate(f, [lead, lead + 24], [100, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const s = interpolate(f, [lead, d], [1.04, 1]);
    content = (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: pad }}>
        {logo
          ? <Img src={src(logo)} style={{ width: (portrait ? 760 : 820) * u, clipPath: `inset(0 ${wipe}% 0 0)`, transform: `scale(${s})` }} />
          : <Title p={p} text={b.title!} u={u} size={170} />}
        {b.sub && <Anim p={p} delay={lead + 30} style={{ marginTop: 40 * u }}><Title p={p} text={b.sub} u={u} size={46} italic={p.fonts.display !== 'Inter'} /></Anim>}
        {b.line && <Anim p={p} delay={lead + 50} style={{ marginTop: 34 * u }}><Kick p={p} text={b.line} u={u} /></Anim>}
      </AbsoluteFill>
    );
  } else if (b.kind === 'stat') {
    const n = b.stat!.length;
    content = (
      <AbsoluteFill style={{ padding: pad, justifyContent: 'center' }}>
        {b.kick && <Anim p={p} delay={lead}><Kick p={p} text={b.kick} u={u} /></Anim>}
        <div style={{ display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: 70 * u, marginTop: 40 * u }}>
          {b.stat!.map((st, i) => {
            const at = lead + Math.round((line * i) / n);
            const v = interpolate(f, [at, at + 40], [0, st.value], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return (
              <Anim key={i} p={p} delay={at}>
                <div style={{ fontFamily: FONTS[p.fonts.display], fontSize: 150 * u, color: p.palette.accent, lineHeight: 1 }}>
                  {Math.round(v).toLocaleString('id-ID')}{st.suffix ?? ''}
                </div>
                <div style={{ fontFamily: FONTS[p.fonts.body], fontSize: 30 * u, color: p.palette.muted, marginTop: 12 * u, maxWidth: 560 * u }}>{st.label}</div>
              </Anim>
            );
          })}
        </div>
        {b.title && <Anim p={p} delay={lead + Math.round(line * 0.7)} style={{ marginTop: 50 * u }}><Title p={p} text={b.title} u={u} size={52} italic={p.fonts.display !== 'Inter'} /></Anim>}
        {b.stat!.some((s) => s.source) && (
          <div style={{ position: 'absolute', left: pad, bottom: (portrait ? 330 : 70) * u, fontFamily: FONTS[p.fonts.body], fontSize: 18 * u, color: p.palette.muted, opacity: 0.8 }}>
            {film.labels?.source ?? 'Sumber'}: {b.stat!.map((s) => s.source).filter(Boolean).join(' · ')}
          </div>
        )}
      </AbsoluteFill>
    );
  } else if (b.kind === 'triptych') {
    const cw = portrait ? 300 : 420, ch = portrait ? 420 : 520;
    content = (
      <AbsoluteFill style={{ padding: pad, justifyContent: 'center' }}>
        {b.kick && <Anim p={p} delay={lead}><Kick p={p} text={b.kick} u={u} /></Anim>}
        {b.title && <Anim p={p} delay={lead + 4} style={{ marginTop: 18 * u }}><Title p={p} text={b.title} u={u} size={60} /></Anim>}
        <div style={{ display: 'flex', gap: 36 * u, marginTop: 50 * u }}>
          {b.panels!.map((pn, i) => (
            <Anim key={i} p={p} delay={lead + Math.round((line * (i + 0.3)) / 3)}>
              <div style={{ width: cw * u, height: ch * u, overflow: 'hidden', border: `2px solid ${p.palette.accent}` }}><Img src={src(pn.img)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
              <div style={{ fontFamily: FONTS[p.fonts.display], fontSize: 34 * u, color: p.palette.fg, marginTop: 16 * u }}>{pn.title}</div>
              <div style={{ fontFamily: FONTS[p.fonts.body], fontSize: 22 * u, color: p.palette.muted, marginTop: 6 * u, maxWidth: cw * u }}>{pn.sub}</div>
            </Anim>
          ))}
        </div>
      </AbsoluteFill>
    );
  } else if (b.kind === 'shot') {
    const sw = (portrait ? 920 : 1040) * u, sh = sw / (b.shotRatio ?? 1.6);
    content = (
      <AbsoluteFill style={{ padding: pad, flexDirection: portrait ? 'column' : 'row', alignItems: 'center', justifyContent: 'space-between', gap: 50 * u }}>
        {textBlock(portrait ? 900 : 560, 72)}
        <Anim p={p} delay={lead + 10}>
          <div style={{ padding: 10 * u, background: '#F3EDE3', border: `2px solid ${p.palette.accent}`, transform: `scale(${interpolate(f, [0, d], [1, 1.04])})` }}>
            <Img src={src(b.img!)} style={{ width: sw, height: sh, display: 'block' }} />
          </div>
        </Anim>
      </AbsoluteFill>
    );
  } else if (b.kind === 'cta') {
    const c = film.cta!;
    content = (
      <AbsoluteFill>
        {b.img && <AbsoluteFill style={{ opacity: 0.35 }}><Photo src={src(b.img)} d={d} amount={p.kenburns} /></AbsoluteFill>}
        <AbsoluteFill style={{ padding: pad, justifyContent: 'center', alignItems: portrait ? 'center' : 'flex-start', textAlign: portrait ? 'center' : 'left' }}>
          <Anim p={p} delay={lead}><Kick p={p} text={c.kick ?? film.labels?.next ?? 'Langkah berikutnya'} u={u} /></Anim>
          <Anim p={p} delay={lead + 6} style={{ marginTop: 24 * u }}><Title p={p} text={c.title} u={u} size={portrait ? 96 : 86} /></Anim>
          {c.sub && <Anim p={p} delay={lead + 30} style={{ marginTop: 40 * u }}><Kick p={p} text={c.sub} u={u} /></Anim>}
          {(c.lines ?? []).map((l, i) => (
            <Anim key={i} p={p} delay={lead + 36 + i * 6} style={{ marginTop: 12 * u }}><div style={{ fontFamily: FONTS[p.fonts.body], fontSize: 38 * u, color: p.palette.fg }}>{l}</div></Anim>
          ))}
          {c.url && <Anim p={p} delay={lead + 48} style={{ marginTop: 12 * u }}><div style={{ fontFamily: FONTS[p.fonts.body], fontSize: 34 * u, color: p.palette.muted }}>{c.url}</div></Anim>}
          {portrait && film.qr && <Anim p={p} delay={lead + 54} style={{ marginTop: 50 * u }}><Img src={src(film.qr)} style={{ width: 360 * u, height: 360 * u, borderRadius: 8 }} /></Anim>}
          {logo && <Anim p={p} delay={lead + 64} style={{ marginTop: 60 * u }}><Img src={src(logo)} style={{ width: 360 * u }} /></Anim>}
        </AbsoluteFill>
        {!portrait && film.qr && (
          <Anim p={p} delay={lead + 54} style={{ position: 'absolute', right: pad, bottom: 150 * u }}>
            <Img src={src(film.qr)} style={{ width: 330 * u, height: 330 * u, borderRadius: 6 }} />
          </Anim>
        )}
      </AbsoluteFill>
    );
  } else {
    // photo | footage | list — the layout depends on the preset
    const media = b.kind === 'footage' && b.video
      ? <OffthreadVideo src={src(b.video)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      : b.img ? <Photo src={src(b.img)} d={d} amount={p.kenburns} /> : null;
    const items = b.items && (
      <div style={{ marginTop: 34 * u }}>
        {b.items.map((it, i) => (
          <Anim key={i} p={p} delay={lead + 20 + Math.round(((line - 20) * i) / b.items!.length)} style={{ marginTop: 10 * u }}>
            <div style={{ fontFamily: FONTS[p.fonts.display], fontStyle: p.fonts.display === 'Inter' ? 'normal' : 'italic', fontSize: 40 * u, color: p.palette.accent }}>{it}</div>
          </Anim>
        ))}
      </div>
    );
    if (p.layout === 'window' && !portrait) {
      const open = interpolate(f, [lead, lead + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      content = (
        <AbsoluteFill style={{ flexDirection: 'row' }}>
          <div style={{ width: '52%', padding: `0 ${pad}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>{textBlock(820, 76)}{items}</div>
          <div style={{ width: '40%', margin: `${110 * u}px 0`, overflow: 'hidden', border: `2px solid ${p.palette.accent}`, clipPath: `inset(${(1 - open) * 50}% 0 ${(1 - open) * 50}% 0)` }}>{media}</div>
        </AbsoluteFill>
      );
    } else if (p.layout === 'card' && !portrait) {
      const k = spring({ frame: f - lead, fps: FPS, config: { damping: 10 } });
      content = (
        <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center' }}>
          <div style={{ width: '50%', padding: `0 ${pad}px` }}>{textBlock(780, 80)}{items}</div>
          <div style={{ width: 760 * u, height: 760 * u, borderRadius: 40 * u, overflow: 'hidden', transform: `rotate(${(1 - k) * 8 + 2}deg) scale(${0.8 + 0.2 * k})`, boxShadow: '0 30px 80px rgba(0,0,0,0.25)' }}>{media}</div>
        </AbsoluteFill>
      );
    } else {
      const top = portrait && p.captions === 'kinetic';
      const bottom = !top && (portrait || b.side !== 'left');
      content = (
        <AbsoluteFill>
          <AbsoluteFill style={{ overflow: 'hidden' }}>{media}</AbsoluteFill>
          <AbsoluteFill style={{ background: top
            ? `linear-gradient(to bottom, ${p.palette.bg}E6 0%, transparent 40%, transparent 55%, ${p.palette.bg}CC 100%)`
            : bottom
            ? `linear-gradient(to top, ${p.palette.bg}F0 0%, ${p.palette.bg}99 35%, transparent 65%)`
            : `linear-gradient(to right, ${p.palette.bg}F2 0%, ${p.palette.bg}AA 40%, transparent 70%)` }} />
          <AbsoluteFill style={{ padding: top ? `${200 * u}px ${pad}px 0` : bottom ? `0 ${pad}px ${(portrait ? 420 : 150) * u}px` : `0 ${pad}px`, justifyContent: top ? 'flex-start' : bottom ? 'flex-end' : 'center' }}>
            {textBlock(bottom ? 1400 : 900, portrait ? 92 : bottom ? 92 : 80)}{items}
          </AbsoluteFill>
        </AbsoluteFill>
      );
    }
  }

  return <AbsoluteFill style={{ background: bgFill, ...wrap }}>{content}</AbsoluteFill>;
};

// ---------- captions ----------
const Captions: React.FC<{ film: Film; words: Words; starts: number[] }> = ({ film, words, starts }) => {
  const p = resolve(film);
  const f = useCurrentFrame();
  const { u, portrait } = useUnit();
  if (p.captions === 'none') return null;
  const i = starts.findLastIndex((s) => s <= f);
  const b = film.beats[i];
  if (!b?.vo || b.kind === 'cta') return null;
  const t = (f - starts[i]) / FPS - p.pace.lead;
  const ws = words[b.vo].words;
  if (t < -0.1 || t > words[b.vo].dur + 0.4) return null;
  const cur = Math.max(0, ws.findLastIndex((w) => w.s <= t));

  if (p.captions === 'kinetic') {
    const per = ws.slice(Math.floor(cur / 3) * 3, Math.floor(cur / 3) * 3 + 3).join('').length > 16 ? 2 : 3;
    const g0 = Math.floor(cur / per) * per;
    const group = ws.slice(g0, g0 + per);
    const k = spring({ frame: Math.round((t - ws[g0].s) * FPS), fps: FPS, config: { damping: 10, stiffness: 180 }, durationInFrames: 10 });
    return (
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: (portrait ? 300 : 120) * u }}>
        <div style={{ transform: `scale(${0.85 + 0.15 * k})`, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', maxWidth: (portrait ? 940 : 1500) * u }}>
          {group.map((w, j) => (
            <span key={j} style={{
              fontFamily: FONTS.Inter, fontWeight: 900, fontSize: (portrait ? 84 : 72) * u, lineHeight: 1.15, textTransform: 'uppercase',
              color: g0 + j === cur ? p.palette.accent : '#FFFFFF', margin: `0 ${10 * u}px`,
              WebkitTextStroke: `${3 * u}px #000`, paintOrder: 'stroke', textShadow: `0 ${6 * u}px ${18 * u}px rgba(0,0,0,0.6)`,
            }}>{w.w}</span>
          ))}
        </div>
      </AbsoluteFill>
    );
  }
  // subtitle: chunks of up to 7 words, broken at sentence punctuation
  const chunks: number[][] = [];
  let c: number[] = [];
  ws.forEach((w, j) => { c.push(j); if (c.length >= 7 || /[.,?!]$/.test(w.w)) { chunks.push(c); c = []; } });
  if (c.length) chunks.push(c);
  const chunk = chunks.find((ch) => ch.includes(cur)) ?? chunks[0];
  const light = p.palette.bg.toUpperCase() > '#C';
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: (portrait ? 220 : 56) * u }}>
      <div style={{
        fontFamily: FONTS[p.fonts.body], fontSize: (portrait ? 40 : 32) * u, color: light ? p.palette.fg : '#FFFFFF', textAlign: 'center',
        background: light ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.45)', padding: `${8 * u}px ${18 * u}px`, borderRadius: 6 * u, maxWidth: 1500 * u,
      }}>{chunk.map((j) => ws[j].w).join(' ')}</div>
    </AbsoluteFill>
  );
};

// ---------- texture ----------
const Texture: React.FC<{ p: Preset; starts: number[] }> = ({ p, starts }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const sinceCut = f - (starts.findLast((s) => s <= f) ?? 0);
  const leak = p.grade.leak ? interpolate(sinceCut, [0, 8, 26], [0, 0.55, 0], { extrapolateRight: 'clamp' }) : 0;
  return (
    <>
      {p.grade.vignette > 0 && <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,${p.grade.vignette}) 100%)` }} />}
      {leak > 0 && <AbsoluteFill style={{ background: `radial-gradient(circle at ${20 + random(Math.floor(f / 40)) * 60}% 30%, rgba(255,190,120,${leak}) 0%, transparent 55%)`, mixBlendMode: 'screen' }} />}
      {p.grade.grain > 0 && (
        <AbsoluteFill style={{ opacity: p.grade.grain, mixBlendMode: 'overlay' }}>
          <svg width={width} height={height}>
            <filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={f % 50} /></filter>
            <rect width="100%" height="100%" filter="url(#g)" />
          </svg>
        </AbsoluteFill>
      )}
    </>
  );
};

// ---------- film ----------
// Props-driven: the render passes { film, words } (scripts/master.sh), the public dir is the film folder.
export const FilmView: React.FC<{ film: Film; words: Words }> = ({ film, words }) => {
  const p = resolve(film);
  const { len, starts, total, revealAt } = timeline(film, words);
  const music = (fr: number) => interpolate(
    fr, [0, 30, revealAt - 15, revealAt + 10, revealAt + 90, total - 60, total],
    [0, p.music.base, p.music.base, p.music.lift, p.music.base + 0.04, p.music.base + 0.04, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sfx = (name: string, vol = 0.6) => name ? <Audio src={staticFile(`sfx/${name}.mp3`)} volume={vol} /> : null;
  return (
    <AbsoluteFill style={{ background: p.palette.bg }}>
      <Audio src={asset(film, p.music.track)} volume={music} />
      {film.beats.map((b, i) => {
        const lead = Math.round(p.pace.lead * FPS);
        const fx = b.kind === 'reveal' ? p.sfx.reveal : b.kind === 'question' ? p.sfx.question : i > 0 ? p.sfx.cut : '';
        return (
          <Sequence key={i} from={starts[i]} durationInFrames={len(b)}>
            <BeatView film={film} b={b} d={len(b)} words={words} />
            {fx && sfx(fx, b.kind === 'reveal' ? 0.7 : 0.35)}
            {(b.sfx ?? []).map((s, j) => <Sequence key={j} from={lead}>{sfx(s, 0.45)}</Sequence>)}
            {b.ambience && <Audio src={staticFile(`sfx/${b.ambience}.mp3`)} volume={0.18} loop />}
            {p.sfx.text && b.title && i > 0 && <Sequence from={lead + 6}>{sfx(p.sfx.text, 0.25)}</Sequence>}
            {b.vo && (
              <Sequence from={lead}>
                <Audio src={asset(film, `${b.vo}.mp3`)} trimBefore={Math.round(words[b.vo].offset * FPS)} />
              </Sequence>
            )}
          </Sequence>
        );
      })}
      <Texture p={p} starts={starts} />
      <Captions film={film} words={words} starts={starts} />
    </AbsoluteFill>
  );
};
