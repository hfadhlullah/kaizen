import { Toaster } from "@web/ui";
import { UpdateCard } from "@components/settings";
import { AddProjectDialog, WsMenu } from "@components/project";
import { BoardPopups } from "@components/board";
import { FileViewer, KeyHint } from "@components/run";
import { SearchPalette } from "@components/search";
import { HomeWindow, HomeWsButton, OnboardingDialog } from "@components/home";
import { Haptic, PhoneSheets } from "@components/phone";
import { AskHost } from "@components/shared";

// #kz-portal: where every popup, menu, dialog and toast the kit opens is drawn (ui/*'s portalRoot() finds it by id, and pages
// test for it to know they are the board). The toaster is the one every page and the old modules share.
export function Portal() {
  return (
    <div id="kz-portal" className="kz-ui">
      <div>
        <Toaster />
      </div>
      <div>
        <BoardPopups />
        <AskHost />
        <PhoneSheets />
        <OnboardingDialog />
        <SearchPalette />
        <FileViewer />
        <WsMenu />
        <AddProjectDialog />
        <UpdateCard />
        <KeyHint />
        <HomeWindow />
        <HomeWsButton />
        <Haptic />
      </div>
    </div>
  );
}
