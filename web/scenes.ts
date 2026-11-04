// The one entry of /scenes.js: the dungeon and the town share a single three.js copy. The Game
// page loads this script the first time either is opened and finds them on the window.
import { mount } from "./dungeon.ts";
import { mountTown } from "./town.ts";

const w = window as unknown as { KzDungeon: unknown; KzTown: unknown };
w.KzDungeon = { mount };
w.KzTown = { mount: mountTown };
