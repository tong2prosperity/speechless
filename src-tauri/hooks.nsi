!macro NSIS_HOOK_PREINSTALL
  ; Silently install VC++ Redistributable if VCOMP140.DLL is missing
  IfFileExists "$SYSDIR\VCOMP140.DLL" vcredist_done
    DetailPrint "Installing Visual C++ Redistributable..."
    InitPluginsDir
    NSISdl::download "https://aka.ms/vs/17/release/vc_redist.x64.exe" "$PLUGINSDIR\vc_redist.x64.exe"
    Pop $0
    StrCmp $0 "success" 0 vcredist_done
    ExecWait '"$PLUGINSDIR\vc_redist.x64.exe" /install /quiet /norestart'
  vcredist_done:
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Positioning DLLs for runtime loading in $INSTDIR..."
  
  # Copy all DLLs from the resources folder to the main directory
  # This makes them discoverable by the Windows DLL loader
  IfFileExists "$INSTDIR\resources\sherpa-onnx-c-api.dll" 0 +3
    DetailPrint "Found sherpa DLLs in resources, moving to root..."
    CopyFiles "$INSTDIR\resources\*.dll" "$INSTDIR\"
    Goto done

  # Fallback: check if Tauri put them in nested paths
  IfFileExists "$INSTDIR\resources\resources\sherpa-onnx-c-api.dll" 0 +2
    CopyFiles "$INSTDIR\resources\resources\*.dll" "$INSTDIR\"
    Goto done

done:
!macroend
