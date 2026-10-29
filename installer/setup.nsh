!include "nsDialogs.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
  Var IJData
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
  LangString IJLocationNote ${LANG_ENGLISH} "Python, FFmpeg, models and download caches all stay here. Allow several GB (NVIDIA may need more). Uninstalling the app keeps this folder."
  LangString IJLocationNote ${LANG_SIMPCHINESE} "Python、FFmpeg、模型及下载缓存均放在这里。请预留数 GB 空间（NVIDIA 环境可能更多）。卸载程序保留此数据文件夹。"
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
!endif
!macroend

!macro customInit
  StrCpy $IJMode "auto"
  StrCpy $IJModels "roformer-sw,beat-this"
  StrCpy $IJAllowC "0"
  StrCpy $IJSelected0 ${BST_CHECKED}
  StrCpy $IJSelected5 ${BST_CHECKED}
  ReadRegStr $IJData HKCU "Software\ImmerseJam" "DataRoot"
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
    ${NSD_CreateLabel} 0 0 100% 28u "$(IJStorage)"
    Pop $0
    ${NSD_CreateLabel} 0 34u 100% 14u "$(IJPath)"
    Pop $0
    ${NSD_CreateDirRequest} 0 52u 78% 14u $IJData
    Pop $IJDataEdit
    ${NSD_CreateBrowseButton} 80% 52u 20% 14u "$(IJBrowse)"
    Pop $0
    ${NSD_OnClick} $0 IJBrowseData
    ${NSD_CreateCheckbox} 0 83u 100% 24u "$(IJConfirmC)"
    Pop $IJConfirm
    ${If} $IJAllowC == "1"
      ${NSD_Check} $IJConfirm
    ${EndIf}
    ${NSD_CreateLabel} 0 120u 100% 65u "$(IJLocationNote)"
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
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 28u "$(IJComponents)"
    Pop $0
    ${NSD_CreateRadioButton} 0 32u 100% 13u "$(IJAutoText)"
    Pop $IJAuto
    ${NSD_CreateRadioButton} 0 48u 47% 13u "CPU"
    Pop $IJCpu
    ${NSD_CreateRadioButton} 50% 48u 50% 13u "NVIDIA CUDA"
    Pop $IJCuda
    ${If} $IJMode == "cpu"
      ${NSD_Check} $IJCpu
    ${ElseIf} $IJMode == "cuda"
      ${NSD_Check} $IJCuda
    ${Else}
      ${NSD_Check} $IJAuto
    ${EndIf}
    ${NSD_CreateLabel} 0 70u 100% 24u "$(IJModelNote)"
    Pop $0
    ${NSD_CreateCheckbox} 0 98u 100% 13u "BS RoFormer SW - 6 stems (~667 MiB)"
    Pop $IJModel0
    ${NSD_SetState} $IJModel0 $IJSelected0
    ${NSD_CreateCheckbox} 0 114u 100% 13u "HT Demucs - 6 stems (~52 MB)"
    Pop $IJModel1
    ${NSD_SetState} $IJModel1 $IJSelected1
    ${NSD_CreateCheckbox} 0 130u 100% 13u "SCNet Small - 4 stems"
    Pop $IJModel2
    ${NSD_SetState} $IJModel2 $IJSelected2
    ${NSD_CreateCheckbox} 0 146u 100% 13u "Lead / backing vocals"
    Pop $IJModel3
    ${NSD_SetState} $IJModel3 $IJSelected3
    ${NSD_CreateCheckbox} 0 162u 100% 13u "Lead / rhythm guitar (~337 MB)"
    Pop $IJModel4
    ${NSD_SetState} $IJModel4 $IJSelected4
    ${NSD_CreateCheckbox} 0 178u 100% 13u "Beat This! - BPM (~77 MB)"
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
    ${If} $IJSelected0 == ${BST_CHECKED}
      StrCpy $IJModels "$IJModels,roformer-sw"
    ${EndIf}
    ${If} $IJSelected1 == ${BST_CHECKED}
      StrCpy $IJModels "$IJModels,demucs-6"
    ${EndIf}
    ${If} $IJSelected2 == ${BST_CHECKED}
      StrCpy $IJModels "$IJModels,scnet-small"
    ${EndIf}
    ${If} $IJSelected3 == ${BST_CHECKED}
      StrCpy $IJModels "$IJModels,karaoke"
    ${EndIf}
    ${If} $IJSelected4 == ${BST_CHECKED}
      StrCpy $IJModels "$IJModels,guitar-lead"
    ${EndIf}
    ${If} $IJSelected5 == ${BST_CHECKED}
      StrCpy $IJModels "$IJModels,beat-this"
    ${EndIf}
  FunctionEnd
!macroend

!macro customInstall
  DetailPrint "$(IJPreparing)"
  ijPrepareAgain:
  nsExec::ExecToLog /TIMEOUT=3600000 '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --prepare-installation "--data-root=$IJData" "--install-root=$INSTDIR" --runtime-mode=$IJMode "--models=$IJModels" --allow-system-drive=$IJAllowC'
  Pop $0
  ${If} $0 != "0"
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(IJFailed)" IDRETRY ijPrepareAgain
    SetErrorLevel 1
    Abort
  ${EndIf}
  WriteRegStr HKCU "Software\ImmerseJam" "DataRoot" $IJData
  WriteRegStr HKCU "Software\ImmerseJam" "ProgramRoot" $INSTDIR
!macroend
