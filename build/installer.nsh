!macro customInstall
  CreateShortCut "$DESKTOP\RAZZKINGS.lnk" "$SYSDIR\cmd.exe" '/c ""$INSTDIR\start-public-host.cmd""' "$appExe" 0 SW_SHOWNORMAL "" "RAZZKINGS"
  ExecShell "open" "$INSTDIR\start-public-host.cmd"
!macroend