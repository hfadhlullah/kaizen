// What the board starts once its tree is drawn, as effects of the App (so each has its teardown): the side menu's feeds, the
// Search keys and the add-project sheet asked for in the address (initRail), and the first-run onboarding (initOnboarding).
import { useEffect } from "react";
import { initOnboarding } from "@lib/home";
import { initRail } from "@lib/rail/rail-boot.ts";

export function useBoot() {
  useEffect(() => {
    const offRail = initRail({ board: true }),
      offOnboarding = initOnboarding();
    return () => (offRail(), offOnboarding());
  }, []);
}
