Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d ""c:\Users\user\Desktop\music-web"" && npx cross-env PORT=3000 node auto-start.js", 0, False
