; Kaizen Bot setup wizard, built by `bun run build` (scripts/package.ts) with makensis.
; Per-user install, no admin. Opened again over an installed copy, it asks whether to
; reinstall/upgrade or uninstall. ~/.kaizen-bot (chats and settings) is never removed
; unless the uninstaller's checkbox asks for it.
; Defines from package.ts: VERSION, EXE (the compiled app), ICO, OUT.
Unicode true
!include MUI2.nsh
!include nsDialogs.nsh
!include LogicLib.nsh

!define NAME "Kaizen Bot"
!define KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\KaizenBot"

Name "${NAME}"
OutFile "${OUT}"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\${NAME}"
InstallDirRegKey HKCU "${KEY}" "InstallLocation"
SetCompressor /SOLID lzma

!define MUI_ICON "${ICO}"
!define MUI_UNICON "${ICO}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${NAME}.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${NAME}"

Var Existing
Var Choice
Var RadioUninstall
Var WantShortcut
Var ShortcutBox
Var DeleteData
Var DeleteDataBox

!insertmacro MUI_PAGE_WELCOME
Page custom MaintenancePage MaintenanceLeave
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfMaintaining
!insertmacro MUI_PAGE_DIRECTORY
Page custom OptionsPage OptionsLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
UninstPage custom un.DataPage un.DataLeave
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ReadRegStr $Existing HKCU "${KEY}" "DisplayVersion"
  StrCpy $WantShortcut ${BST_CHECKED}
FunctionEnd

; Only shown when a copy is already installed.
Function MaintenancePage
  ${If} $Existing == ""
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "${NAME} is already installed" "Version $Existing is installed. This setup is version ${VERSION}."
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateRadioButton} 0 10u 100% 12u "&Reinstall or upgrade to ${VERSION} (keeps your chats and settings)"
  Pop $1
  ${NSD_Check} $1
  ${NSD_CreateRadioButton} 0 30u 100% 12u "&Uninstall ${NAME}"
  Pop $RadioUninstall
  nsDialogs::Show
FunctionEnd

Function MaintenanceLeave
  ${NSD_GetState} $RadioUninstall $Choice
  ${If} $Choice == ${BST_CHECKED}
    ReadRegStr $0 HKCU "${KEY}" "UninstallString"
    HideWindow
    ExecWait '$0'
    Quit
  ${EndIf}
FunctionEnd

; An upgrade goes where the installed copy already is.
Function SkipIfMaintaining
  ${If} $Existing != ""
    Abort
  ${EndIf}
FunctionEnd

Function OptionsPage
  !insertmacro MUI_HEADER_TEXT "Shortcuts" "A Start menu shortcut is always added."
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateCheckbox} 0 10u 100% 12u "Create a &desktop shortcut"
  Pop $ShortcutBox
  ${NSD_SetState} $ShortcutBox $WantShortcut
  nsDialogs::Show
FunctionEnd

Function OptionsLeave
  ${NSD_GetState} $ShortcutBox $WantShortcut
FunctionEnd

Section "Install"
  ; A running copy holds its exe open.
  nsExec::Exec 'taskkill /f /im "${NAME}.exe"'
  Sleep 500
  SetOutPath "$INSTDIR"
  File "/oname=${NAME}.exe" "${EXE}"
  File "/oname=kaizen.ico" "${ICO}"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$SMPROGRAMS\${NAME}.lnk" "$INSTDIR\${NAME}.exe" "" "$INSTDIR\kaizen.ico"
  ${If} $WantShortcut == ${BST_CHECKED}
    CreateShortcut "$DESKTOP\${NAME}.lnk" "$INSTDIR\${NAME}.exe" "" "$INSTDIR\kaizen.ico"
  ${EndIf}
  WriteRegStr HKCU "${KEY}" "DisplayName" "${NAME}"
  WriteRegStr HKCU "${KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${KEY}" "Publisher" "Kaizen"
  WriteRegStr HKCU "${KEY}" "DisplayIcon" "$INSTDIR\kaizen.ico"
  WriteRegStr HKCU "${KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${KEY}" "NoRepair" 1
SectionEnd

Function un.DataPage
  !insertmacro MUI_HEADER_TEXT "Your data" "Chats and settings live in $PROFILE\.kaizen-bot."
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateCheckbox} 0 10u 100% 12u "Also &delete my chats and settings"
  Pop $DeleteDataBox
  nsDialogs::Show
FunctionEnd

Function un.DataLeave
  ${NSD_GetState} $DeleteDataBox $DeleteData
FunctionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /f /im "${NAME}.exe"'
  Sleep 500
  Delete "$SMPROGRAMS\${NAME}.lnk"
  Delete "$DESKTOP\${NAME}.lnk"
  Delete "$INSTDIR\${NAME}.exe"
  Delete "$INSTDIR\kaizen.ico"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${KEY}"
  ${If} $DeleteData == ${BST_CHECKED}
    RMDir /r "$PROFILE\.kaizen-bot"
  ${EndIf}
SectionEnd
