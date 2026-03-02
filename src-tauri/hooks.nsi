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
