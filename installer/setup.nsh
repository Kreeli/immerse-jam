!include "nsDialogs.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
  Var IJData
  Var IJPreviousData
  Var IJDrive
  Var IJMode
  Var IJModels
  Var IJAllowC
  Var IJDataEdit
  Var IJConfirm
  Var IJAuto
  Var IJCpu
  Var IJCuda
  Var IJModel0
  Var IJModel1
  Var IJModel2
  Var IJModel3
  Var IJModel4
  Var IJModel5
  Var IJSelected0
  Var IJSelected1
  Var IJSelected2
  Var IJSelected3
  Var IJSelected4
  Var IJSelected5
  Var IJModelSummary
!endif
!macro customHeader
!ifndef BUILD_UNINSTALLER
  LangString IJStorage ${LANG_ENGLISH} "Choose where your music, recordings, models and private runtime are stored."
  LangString IJStorage ${LANG_SIMPCHINESE} "选择音乐、录音、模型和专用运行环境的存放位置。"
  LangString IJPath ${LANG_ENGLISH} "Data folder (separate from the program folder):"
  LangString IJPath ${LANG_SIMPCHINESE} "数据文件夹（与程序文件夹分开）："
  LangString IJBrowse ${LANG_ENGLISH} "Browse..."
  LangString IJBrowse ${LANG_SIMPCHINESE} "浏览…"
  LangString IJConfirmC ${LANG_ENGLISH} "I explicitly allow storing data on the Windows system drive."
  LangString IJConfirmC ${LANG_SIMPCHINESE} "我明确同意将数据存放在 Windows 系统盘。"
  LangString IJLocationNote ${LANG_ENGLISH} "First download: CPU ~1-2 GB, NVIDIA ~3-5 GB, plus selected models. Usually 5-30 minutes; slow networks take longer. Reserve 10 GB or more. Uninstalling keeps this folder."
  LangString IJLocationNote ${LANG_SIMPCHINESE} "首次下载：CPU 约 1–2 GB，NVIDIA 约 3–5 GB，另加所选模型。通常 5–30 分钟，慢网络可能更久。请预留至少 10 GB 空间。卸载保留此文件夹。"
  LangString IJSelectPath ${LANG_ENGLISH} "Select a separate data folder, outside the program folder and drive root. System-drive storage requires confirmation."
  LangString IJSelectPath ${LANG_SIMPCHINESE} "请选择独立的数据文件夹，不能使用程序文件夹或磁盘根目录。使用系统盘需要勾选确认。"
  LangString IJComponents ${LANG_ENGLISH} "The installer prepares all dependencies before finishing. Select acceleration and optional models below. An internet connection is required."
  LangString IJComponents ${LANG_SIMPCHINESE} "安装完成前会自动准备所有依赖。请选择运行方式及可选模型，需要联网下载。"
  LangString IJAutoText ${LANG_ENGLISH} "Automatic NVIDIA detection (CPU otherwise)"
  LangString IJAutoText ${LANG_SIMPCHINESE} "自动检测 NVIDIA 显卡（其他设备使用 CPU）"
  LangString IJModelNote ${LANG_ENGLISH} "Default: six stems and beats. Vocal/guitar add-ons also install the six-stem base. More models can be downloaded later."
  LangString IJModelNote ${LANG_SIMPCHINESE} "默认安装六轨与节拍模型。专用人声／吉他选项会同时安装六轨基础模型，其他模型可稍后下载。"
  LangString IJPreparing ${LANG_ENGLISH} "Preparing the private environment and selected models..."
  LangString IJPreparing ${LANG_SIMPCHINESE} "正在准备专用环境和所选模型…"
  LangString IJFailed ${LANG_ENGLISH} "Preparation did not finish. Check the connection and data-folder permissions, then Retry. Downloads can resume. Details: installation.log in the selected data folder. Cancel stops installation without deleting your data."
  LangString IJFailed ${LANG_SIMPCHINESE} "环境准备尚未完成。请检查网络和数据目录权限后重试，已下载内容可以续传。详情见数据目录下的 installation.log。取消会停止安装，并保留数据。"
  LangString IJDownloadTitle ${LANG_ENGLISH} "Download and prepare components"
  LangString IJDownloadTitle ${LANG_SIMPCHINESE} "下载并准备所选组件"
  LangString IJDownloadSubtitle ${LANG_ENGLISH} "Model selection > Download progress > Finish"
  LangString IJDownloadSubtitle ${LANG_SIMPCHINESE} "选择模型 → 查看下载进度 → 完成安装"
  LangString IJDownloadSelected ${LANG_ENGLISH} "Selected models:"
  LangString IJDownloadSelected ${LANG_SIMPCHINESE} "所选模型："
  LangString IJDownloadStarting ${LANG_ENGLISH} "Starting preparation; existing downloads will be reused."
  LangString IJDownloadStarting ${LANG_SIMPCHINESE} "正在开始准备，已有模型和下载缓存会复用。"
  LangString IJDownloadNote ${LANG_ENGLISH} "The first bar shows completed steps, the second the current file. Verification and dependency installation may show activity without a percentage."
  LangString IJDownloadNote ${LANG_SIMPCHINESE} "上方为步骤进度，下方为当前文件进度。校验或安装依赖时显示活动条，不虚报百分比。"
  LangString IJDownloadComplete ${LANG_ENGLISH} "All selected components are ready"
  LangString IJDownloadComplete ${LANG_SIMPCHINESE} "所选组件已全部准备完成"
  LangString IJDownloadDone ${LANG_ENGLISH} "Click Next to finish. Your data folder is retained."
  LangString IJDownloadDone ${LANG_SIMPCHINESE} "点击下一步完成安装。原有曲库与录音保留。"
  LangString IJRetry ${LANG_ENGLISH} "Retry"
  LangString IJRetry ${LANG_SIMPCHINESE} "重试"
  LangString IJNoModels ${LANG_ENGLISH} "Runtime only; models can be added in Settings later."
  LangString IJNoModels ${LANG_SIMPCHINESE} "仅准备运行环境，模型可稍后在设置中下载。"
  LangString IJSelectModelsTitle ${LANG_ENGLISH} "Choose models"
  LangString IJSelectModelsTitle ${LANG_SIMPCHINESE} "选择要下载的模型"
  LangString IJSelectModelsSubtitle ${LANG_ENGLISH} "Select components first; the next stage shows download progress."
  LangString IJSelectModelsSubtitle ${LANG_SIMPCHINESE} "先选择组件，安装文件复制后将显示下载进度。"
!endif
!macroend

!macro customInit
  StrCpy $IJMode "auto"
  StrCpy $IJModels "roformer-sw,beat-this"
  StrCpy $IJAllowC "0"
  StrCpy $IJSelected0 ${BST_CHECKED}
  StrCpy $IJSelected5 ${BST_CHECKED}
  ReadRegStr $IJData HKCU "Software\ImmerseJam" "DataRoot"
  StrCpy $IJPreviousData $IJData
  ReadRegStr $0 HKCU "Software\ImmerseJam" "ProgramRoot"
  ${If} $0 != ""
    StrCpy $INSTDIR $0
  ${Else}
    StrCpy $IJDrive ""
    ${GetDrives} "HDD" IJChooseDrive
    ${If} $IJDrive != ""
      StrCpy $INSTDIR "$IJDrive\Immerse Jam"
    ${EndIf}
  ${EndIf}
  ${If} $IJData == ""
    StrCpy $IJData "$INSTDIR-data"
  ${EndIf}
  ${GetParameters} $0
  ${GetOptions} $0 "/DATA=" $1
  ${If} $1 != ""
    StrCpy $IJData $1
  ${EndIf}
  ${GetOptions} $0 "/MODE=" $1
  ${If} $1 != ""
    StrCpy $IJMode $1
  ${EndIf}
  ClearErrors
  ${GetOptions} $0 "/MODELS=" $1
  ${IfNot} ${Errors}
    StrCpy $IJModels $1
  ${EndIf}
  ${GetOptions} $0 "/ALLOWC=" $1
  ${If} $1 == "1"
    StrCpy $IJAllowC "1"
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom IJStoragePage IJStorageLeave
  Page custom IJComponentsPage IJComponentsLeave

  Function IJChooseDrive
    Push $0
    StrCpy $0 $WINDIR 3
    ${If} $IJDrive == ""
    ${AndIf} $9 != $0
      StrCpy $IJDrive $9 -1
    ${EndIf}
    Pop $0
    Push 1
  FunctionEnd
  Function IJBrowseData
    nsDialogs::SelectFolderDialog "$(IJPath)" $IJData
    Pop $0
    ${If} $0 != "error"
      ${NSD_SetText} $IJDataEdit $0
    ${EndIf}
  FunctionEnd
  Function IJStoragePage
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 20u "$(IJStorage)"
    Pop $0
    ${NSD_CreateLabel} 0 24u 100% 12u "$(IJPath)"
    Pop $0
    ${NSD_CreateDirRequest} 0 42u 78% 14u $IJData
    Pop $IJDataEdit
    ${NSD_CreateBrowseButton} 80% 42u 20% 14u "$(IJBrowse)"
    Pop $0
    ${NSD_OnClick} $0 IJBrowseData
    ${NSD_CreateCheckbox} 0 64u 100% 24u "$(IJConfirmC)"
    Pop $IJConfirm
    ${If} $IJAllowC == "1"
      ${NSD_Check} $IJConfirm
    ${EndIf}
    ${NSD_CreateLabel} 0 94u 100% 42u "$(IJLocationNote)"
    Pop $0
    nsDialogs::Show
  FunctionEnd
  Function IJStorageLeave
    ${NSD_GetText} $IJDataEdit $IJData
    ${NSD_GetState} $IJConfirm $IJAllowC
    GetFullPathName $IJData $IJData
    StrLen $0 $IJData
    ${If} $0 < 4
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(IJSelectPath)"
      Abort
    ${EndIf}
    GetFullPathName $1 $INSTDIR
    StrCpy $2 "$1\"
    StrLen $3 $2
    StrCpy $4 $IJData $3
    ${If} $IJData == $1
    ${OrIf} $4 == $2
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(IJSelectPath)"
      Abort
    ${EndIf}
    StrCpy $0 $IJData 1 1
    ${If} $0 != ":"
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(IJSelectPath)"
      Abort
    ${EndIf}
    StrCpy $0 $IJData 3
    StrCpy $1 $WINDIR 3
    ${If} $0 == $1
    ${AndIf} $IJAllowC != "1"
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(IJSelectPath)"
      Abort
    ${EndIf}
  FunctionEnd
  Function IJComponentsPage
    !insertmacro MUI_HEADER_TEXT "$(IJSelectModelsTitle)" "$(IJSelectModelsSubtitle)"
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 20u "$(IJComponents)"
    Pop $0
    ${NSD_CreateRadioButton} 0 24u 100% 13u "$(IJAutoText)"
    Pop $IJAuto
    ${NSD_CreateRadioButton} 0 39u 47% 13u "CPU"
    Pop $IJCpu
    ${NSD_CreateRadioButton} 50% 39u 50% 13u "NVIDIA CUDA"
    Pop $IJCuda
    ${If} $IJMode == "cpu"
      ${NSD_Check} $IJCpu
    ${ElseIf} $IJMode == "cuda"
      ${NSD_Check} $IJCuda
    ${Else}
      ${NSD_Check} $IJAuto
    ${EndIf}
    ${NSD_CreateLabel} 0 55u 100% 16u "$(IJModelNote)"
    Pop $0
    ${NSD_CreateCheckbox} 0 74u 100% 11u "BS RoFormer SW - 6 stems (~667 MiB)"
    Pop $IJModel0
    ${NSD_SetState} $IJModel0 $IJSelected0
    ${NSD_CreateCheckbox} 0 85u 100% 11u "HT Demucs - 6 stems (~52 MB)"
    Pop $IJModel1
    ${NSD_SetState} $IJModel1 $IJSelected1
    ${NSD_CreateCheckbox} 0 96u 100% 11u "SCNet Small - 4 stems"
    Pop $IJModel2
    ${NSD_SetState} $IJModel2 $IJSelected2
    ${NSD_CreateCheckbox} 0 107u 100% 11u "Lead / backing vocals"
    Pop $IJModel3
    ${NSD_SetState} $IJModel3 $IJSelected3
    ${NSD_CreateCheckbox} 0 118u 100% 11u "Lead / rhythm guitar (~337 MB)"
    Pop $IJModel4
    ${NSD_SetState} $IJModel4 $IJSelected4
    ${NSD_CreateCheckbox} 0 129u 100% 11u "Beat This! - BPM (~77 MB)"
    Pop $IJModel5
    ${NSD_SetState} $IJModel5 $IJSelected5
    nsDialogs::Show
  FunctionEnd
  Function IJComponentsLeave
    ${NSD_GetState} $IJCpu $0
    ${NSD_GetState} $IJCuda $1
    StrCpy $IJMode "auto"
    ${If} $0 == ${BST_CHECKED}
      StrCpy $IJMode "cpu"
    ${ElseIf} $1 == ${BST_CHECKED}
      StrCpy $IJMode "cuda"
    ${EndIf}
    ${NSD_GetState} $IJModel0 $IJSelected0
    ${NSD_GetState} $IJModel1 $IJSelected1
    ${NSD_GetState} $IJModel2 $IJSelected2
    ${NSD_GetState} $IJModel3 $IJSelected3
    ${NSD_GetState} $IJModel4 $IJSelected4
    ${NSD_GetState} $IJModel5 $IJSelected5
    StrCpy $IJModels ""
    StrCpy $IJModelSummary ""
    ${If} $IJSelected0 == ${BST_CHECKED}
      StrCpy $IJModels "$IJModels,roformer-sw"
      StrCpy $IJModelSummary "$IJModelSummary BS RoFormer SW;"
    ${EndIf}
    ${If} $IJSelected1 == ${BST_CHECKED}
      StrCpy $IJModels "$IJModels,demucs-6"
      StrCpy $IJModelSummary "$IJModelSummary HT Demucs;"
    ${EndIf}
    ${If} $IJSelected2 == ${BST_CHECKED}
      StrCpy $IJModels "$IJModels,scnet-small"
      StrCpy $IJModelSummary "$IJModelSummary SCNet Small;"
    ${EndIf}
    ${If} $IJSelected3 == ${BST_CHECKED}
      StrCpy $IJModels "$IJModels,karaoke"
      StrCpy $IJModelSummary "$IJModelSummary Vocals (+SW);"
    ${EndIf}
    ${If} $IJSelected4 == ${BST_CHECKED}
      StrCpy $IJModels "$IJModels,guitar-lead"
      StrCpy $IJModelSummary "$IJModelSummary Guitar (+SW);"
    ${EndIf}
    ${If} $IJSelected5 == ${BST_CHECKED}
      StrCpy $IJModels "$IJModels,beat-this"
      StrCpy $IJModelSummary "$IJModelSummary Beat This!;"
    ${EndIf}
    ${If} $IJModelSummary == ""
      StrCpy $IJModelSummary "$(IJNoModels)"
    ${EndIf}
  FunctionEnd
!macroend

!macro customFinishPage
  !include "${PROJECT_DIR}\installer\download-page.nsh"
  Page custom IJDownloadPage IJDownloadLeave
  Function IJStartApp
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
  FunctionEnd
  Function IJFinishShow
    ; Going back would start component preparation again after a successful run.
    GetDlgItem $0 $HWNDPARENT 3
    EnableWindow $0 0
  FunctionEnd
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION IJStartApp
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW IJFinishShow
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customInstall
  ; Interactive installs use the timer-driven download page after file copy.
  ; Silent installs keep the blocking preparation path and return its exit code.
  IfSilent 0 ijPrepareEnd
  DetailPrint "$(IJPreparing)"
  ijPrepareAgain:
  StrCpy $1 ""
  IfSilent 0 +2
    StrCpy $1 "--setup-silent"
  nsExec::ExecToLog /TIMEOUT=3600000 '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --prepare-installation "--data-root=$IJData" "--install-root=$INSTDIR" "--legacy-root=$IJPreviousData" --runtime-mode=$IJMode "--models=$IJModels" --allow-system-drive=$IJAllowC $1'
  Pop $0
  ${If} $0 != "0"
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(IJFailed)" IDRETRY ijPrepareAgain
    SetErrorLevel 1
    Abort
  ${EndIf}
  WriteRegStr HKCU "Software\ImmerseJam" "DataRoot" $IJData
  WriteRegStr HKCU "Software\ImmerseJam" "ProgramRoot" $INSTDIR
  ijPrepareEnd:
!macroend
