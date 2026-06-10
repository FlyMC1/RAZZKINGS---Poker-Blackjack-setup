!macro customInstall
  CreateShortCut "$DESKTOP\RAZZKINGS.lnk" "$appExe" "--public-host" "$appExe" 0 "" "" "RAZZKINGS"
  Exec '"$appExe" --public-host'
!macroend