$ErrorActionPreference = "Stop"
$root = "C:\dev\minifixwood"

& wt.exe `
  new-tab --title "docker"  cmd.exe /k "$root\_tab_docker.cmd" `
  `; new-tab --title "web"     cmd.exe /k "$root\_tab_web.cmd" `
  `; new-tab --title "helper"  cmd.exe /k "$root\_tab_helper.cmd" `
  `; new-tab --title "desktop" cmd.exe /k "$root\_tab_desktop.cmd"
