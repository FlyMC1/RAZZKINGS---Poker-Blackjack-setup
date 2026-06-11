!macro customInstall
  FileOpen $0 "$INSTDIR\start-razzkings-debug.ps1" w
  FileWrite $0 "$log = Join-Path $env:USERPROFILE 'Desktop\\razzkings-launch.log'$\r$\n"
  FileWrite $0 "$exe = Join-Path $PSScriptRoot 'RAZZKINGS.exe'$\r$\n"
  FileWrite $0 "\"===== RAZZKINGS DEBUG START $(Get-Date -Format o) =====\" | Out-File -FilePath $log -Encoding utf8$\r$\n"
  FileWrite $0 "\"Installer path: $PSScriptRoot\" | Add-Content -Path $log$\r$\n"
  FileWrite $0 "\"Executable path: $exe\" | Add-Content -Path $log$\r$\n"
  FileWrite $0 "try { (Get-Command cloudflared -ErrorAction Stop).Source | ForEach-Object {\"cloudflared: $_\"} | Add-Content -Path $log } catch {\"cloudflared: not found\" | Add-Content -Path $log }$\r$\n"
  FileWrite $0 "if (-not (Test-Path -LiteralPath $exe)) {$\r$\n"
  FileWrite $0 "  \"ERROR: EXE missing from install directory.\" | Add-Content -Path $log$\r$\n"
  FileWrite $0 "  Write-Host \"RAZZKINGS.exe not found. See $log\"$\r$\n"
  FileWrite $0 "  exit 1$\r$\n"
  FileWrite $0 "}$\r$\n"
  FileWrite $0 "\"Launching app...\" | Add-Content -Path $log$\r$\n"
  FileWrite $0 "$p = Start-Process -FilePath $exe -ArgumentList '--public-host' -PassThru -WindowStyle Normal$\r$\n"
  FileWrite $0 "\"Started PID: $($p.Id)\" | Add-Content -Path $log$\r$\n"
  FileWrite $0 "\"Debug log saved to: $log\" | Add-Content -Path $log$\r$\n"
  FileWrite $0 "Write-Host \"RAZZKINGS launch attempted. Log: $log\"$\r$\n"
  FileClose $0

  CreateShortCut "$DESKTOP\RAZZKINGS.lnk" "$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -NoExit -File "$INSTDIR\start-razzkings-debug.ps1"' "$appExe" 0 "" "" "RAZZKINGS"
  Exec '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -NoExit -File "$INSTDIR\start-razzkings-debug.ps1"'
!macroend