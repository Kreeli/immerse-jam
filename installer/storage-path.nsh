; Normalize lexically using Win32, without requiring the directory to exist.
; NSIS GetFullPathName can return empty for a new path's missing parent.
Function IJNormalizePath
  Exch $0
  Push $1
  Push $2
  Push $3
  StrCpy $3 $0 1 1
  ${If} $3 != ":"
    StrCpy $0 ""
    Goto ijNormalizeDone
  ${EndIf}
  StrCpy $3 $0 1 2
  ${If} $3 != "\"
  ${AndIf} $3 != "/"
    StrCpy $0 ""
    Goto ijNormalizeDone
  ${EndIf}
  System::Call 'kernel32::GetFullPathNameW(w r0, i ${NSIS_MAX_STRLEN}, w .r1, p 0) i .r2'
  ${If} $2 == 0
  ${OrIf} $2 >= ${NSIS_MAX_STRLEN}
    StrCpy $0 ""
    Goto ijNormalizeDone
  ${EndIf}
  StrCpy $0 $1
  ijNormalizeTrim:
    StrLen $2 $0
    StrCpy $3 $0 1 -1
    ${If} $2 > 3
    ${AndIf} $3 == "\"
      StrCpy $0 $0 -1
      Goto ijNormalizeTrim
    ${EndIf}
  ijNormalizeDone:
  Pop $3
  Pop $2
  Pop $1
  Exch $0
FunctionEnd

; Returns a reason, allowing the wizard and native regression fixture to use
; exactly the same validation. A new folder is only created during installation.
Function IJCheckStorage
  Push $IJData
  Call IJNormalizePath
  Pop $IJData
  StrLen $0 $IJData
  ${If} $0 < 4
    Push "invalid"
    Return
  ${EndIf}
  Push $INSTDIR
  Call IJNormalizePath
  Pop $1
  ${If} $1 == ""
    Push "invalid"
    Return
  ${EndIf}
  StrCpy $2 "$1\"
  StrLen $3 $2
  StrCpy $4 $IJData $3
  ${If} $IJData == $1
  ${OrIf} $4 == $2
    Push "nested"
    Return
  ${EndIf}
  StrCpy $2 "$IJData\"
  StrLen $3 $2
  StrCpy $4 $1 $3
  ${If} $4 == $2
    Push "nested"
    Return
  ${EndIf}
  StrCpy $0 $IJData 3
  StrCpy $1 $WINDIR 3
  ${If} $0 == $1
  ${AndIf} $IJAllowC != "1"
    Push "system"
    Return
  ${EndIf}
  Push "ok"
FunctionEnd
