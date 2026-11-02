; Runs after files have been copied, inside the same installation wizard.
; The child writes UTF-16 snapshots; a timer keeps this page responsive.
!ifndef IJ_PREPARE_PREFIX
  !define IJ_PREPARE_PREFIX ""
!endif
!define /ifndef PBS_MARQUEE 0x08
Var IJStatusFile
Var IJWorker
Var IJDownloadState
Var IJStageLabel
Var IJStepLabel
Var IJOverallBar
Var IJFileLabel
Var IJPercentLabel
Var IJDownloadBar
Var IJTransferLabel
Var IJMessageLabel
Var IJRetryButton
Var IJMarquee

Function IJDownloadPage
  !insertmacro MUI_HEADER_TEXT "$(IJDownloadTitle)" "$(IJDownloadSubtitle)"
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 22u "$(IJDownloadSelected) $IJModelSummary"
  Pop $0
  ${NSD_CreateLabel} 0 25u 82% 12u "$(IJPreparing)"
  Pop $IJStageLabel
  ${NSD_CreateLabel} 85% 25u 15% 12u ""
  Pop $IJStepLabel
  ${NSD_CreateProgressBar} 0 40u 100% 6u ""
  Pop $IJOverallBar
  ${NSD_CreateLabel} 0 52u 82% 12u ""
  Pop $IJFileLabel
  ${NSD_CreateLabel} 85% 52u 15% 12u ""
  Pop $IJPercentLabel
  ${NSD_CreateProgressBar} 0 67u 100% 8u ""
  Pop $IJDownloadBar
  ${NSD_CreateLabel} 0 80u 100% 12u ""
  Pop $IJTransferLabel
  ${NSD_CreateLabel} 0 96u 100% 24u ""
  Pop $IJMessageLabel
  ${NSD_CreateLabel} 0 122u 76% 18u "$(IJDownloadNote)"
  Pop $0
  ${NSD_CreateButton} 80% 122u 20% 18u "$(IJRetry)"
  Pop $IJRetryButton
  ${NSD_OnClick} $IJRetryButton IJDownloadStart
  StrCpy $IJStatusFile "$PLUGINSDIR\immerse-download.ini"
  StrCpy $IJMarquee "0"
  Call IJDownloadStart
  nsDialogs::Show
  ${NSD_KillTimer} IJDownloadPoll
FunctionEnd

Function IJDownloadStart
  ShowWindow $IJRetryButton ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1
  EnableWindow $0 0
  GetDlgItem $0 $HWNDPARENT 2
  EnableWindow $0 0
  GetDlgItem $0 $HWNDPARENT 3
  EnableWindow $0 0
  StrCpy $IJDownloadState "running"
  Delete $IJStatusFile
  ${NSD_SetText} $IJStageLabel "$(IJPreparing)"
  ${NSD_SetText} $IJMessageLabel "$(IJDownloadStarting)"
  StrCpy $1 ""
  ${If} $LANGUAGE == 1033
    StrCpy $1 "--setup-en"
  ${EndIf}
  ${StdUtils.ExecShellWaitEx} $0 $IJWorker "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "open" '${IJ_PREPARE_PREFIX}--prepare-installation "--data-root=$IJData" "--install-root=$INSTDIR" "--legacy-root=$IJPreviousData" --runtime-mode=$IJMode "--models=$IJModels" --allow-system-drive=$IJAllowC --setup-silent "--setup-status=$IJStatusFile" $1'
  ${If} $0 != "ok"
    StrCpy $IJWorker ""
    ${NSD_SetText} $IJMessageLabel "$(IJFailed)"
    Call IJDownloadFailed
    Return
  ${EndIf}
  ; The bundled StdUtils returns an opaque "hProc:XXXXXXXX" token, not
  ; a number. Decode its fixed hexadecimal payload for nonblocking polling.
  StrCpy $IJWorker $IJWorker "" 6
  StrCpy $IJWorker "0x$IJWorker"
  ${NSD_CreateTimer} IJDownloadPoll 250
FunctionEnd

Function IJDownloadFailed
  StrCpy $IJDownloadState "failed"
  GetDlgItem $0 $HWNDPARENT 2
  EnableWindow $0 1
  ShowWindow $IJRetryButton ${SW_SHOW}
  SendMessage $IJDownloadBar ${PBM_SETMARQUEE} 0 0
FunctionEnd

Function IJDownloadPoll
  ${If} ${FileExists} $IJStatusFile
    ReadINIStr $0 $IJStatusFile "Progress" "stage"
    ${NSD_SetText} $IJStageLabel $0
    ReadINIStr $0 $IJStatusFile "Progress" "steps"
    ${NSD_SetText} $IJStepLabel $0
    ReadINIStr $0 $IJStatusFile "Progress" "overall"
    ${NSD_ProgressBar_SetPos} $IJOverallBar $0
    ReadINIStr $0 $IJStatusFile "Progress" "file"
    ${NSD_SetText} $IJFileLabel $0
    ReadINIStr $0 $IJStatusFile "Progress" "transfer"
    ${NSD_SetText} $IJTransferLabel $0
    ReadINIStr $0 $IJStatusFile "Progress" "message"
    ${NSD_SetText} $IJMessageLabel $0
    ReadINIStr $0 $IJStatusFile "Progress" "percent"
    ${If} $0 == ""
      ${If} $IJMarquee != "1"
        ${NSD_AddStyle} $IJDownloadBar ${PBS_MARQUEE}
        SendMessage $IJDownloadBar ${PBM_SETMARQUEE} 1 40
        StrCpy $IJMarquee "1"
      ${EndIf}
      ${NSD_SetText} $IJPercentLabel ""
    ${Else}
      ${If} $IJMarquee == "1"
        SendMessage $IJDownloadBar ${PBM_SETMARQUEE} 0 0
        ${NSD_GetStyle} $IJDownloadBar $2
        IntOp $2 $2 & 0xFFFFFFF7
        System::Call 'user32::SetWindowLong(p $IJDownloadBar, i ${GWL_STYLE}, i r2)'
        StrCpy $IJMarquee "0"
      ${EndIf}
      ${NSD_ProgressBar_SetPos} $IJDownloadBar $0
      ${NSD_SetText} $IJPercentLabel "$0%"
    ${EndIf}
  ${EndIf}
  ; Do not trust a "complete" file until the worker has also exited cleanly.
  System::Call 'kernel32::GetExitCodeProcess(p $IJWorker, *i .r1) i .r0'
  ${If} $0 == 0
    StrCpy $1 -1
  ${EndIf}
  ${If} $0 != 0
  ${AndIf} $1 == 259
    Return
  ${EndIf}
  System::Call 'kernel32::CloseHandle(p $IJWorker)'
  StrCpy $IJWorker ""
  ${NSD_KillTimer} IJDownloadPoll
  ReadINIStr $0 $IJStatusFile "Progress" "state"
  ${If} $1 == 0
  ${AndIf} $0 == "complete"
    StrCpy $IJDownloadState "complete"
    WriteRegStr HKCU "Software\ImmerseJam" "DataRoot" $IJData
    WriteRegStr HKCU "Software\ImmerseJam" "ProgramRoot" $INSTDIR
    ${NSD_SetText} $IJStageLabel "$(IJDownloadComplete)"
    ${NSD_SetText} $IJMessageLabel "$(IJDownloadDone)"
    ${NSD_ProgressBar_SetPos} $IJOverallBar 100
    GetDlgItem $0 $HWNDPARENT 1
    EnableWindow $0 1
    GetDlgItem $0 $HWNDPARENT 2
    EnableWindow $0 1
  ${Else}
    ReadINIStr $0 $IJStatusFile "Progress" "message"
    ${If} $0 == ""
      StrCpy $0 "$(IJFailed)"
    ${EndIf}
    ${NSD_SetText} $IJMessageLabel $0
    Call IJDownloadFailed
  ${EndIf}
FunctionEnd

Function IJDownloadLeave
  ${If} $IJDownloadState != "complete"
    Abort
  ${EndIf}
FunctionEnd
