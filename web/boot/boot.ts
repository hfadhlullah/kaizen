// A blocking script in the head of the board and the Notebook (served as /boot.js): the stored theme, colour, motion and menu
// fold are on <html> before the first paint, however long the bundle takes. Everything else starts with the bundle (bootShell).
import { applyStoredLook, fitStandalone } from "@lib/shell/stored-look.ts";

applyStoredLook();
fitStandalone();
document.documentElement.dataset.boot = "1";
