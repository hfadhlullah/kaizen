// Finds Playwright: KAIZEN_GAME_HOME, then ~/.kaizen/kaizen-game, then kaizen-book's copy, then a normal import.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const homes = [process.env.KAIZEN_GAME_HOME, path.join(os.homedir(), '.kaizen', 'kaizen-game'), path.join(os.homedir(), '.kaizen', 'kaizen-book')].filter(Boolean);
let pw;
for (const h of homes) {
  if (!fs.existsSync(path.join(h, 'package.json'))) continue;
  try { pw = createRequire(path.join(h, 'package.json'))('playwright'); break; } catch {}
}
if (!pw) try { pw = await import('playwright'); } catch { console.error('Playwright not found: run scripts/setup.sh'); process.exit(2); }
export const { chromium } = pw;
export const SOFT = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
export const GPU = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'];
export const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i < 0 ? def : (process.argv[i + 1] ?? true); };
export const flag = name => process.argv.includes('--' + name);
