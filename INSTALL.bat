@echo off
setlocal
title TAPE + PLAYTAPE installer
echo.
echo  TAPE + PLAYTAPE : installer
echo  ---------------------------------------

REM --- Resolve the REAL pythonw.exe (NOT the WindowsApps alias). The alias
REM     runs with MSIX package identity and Windows then virtualizes its
REM     AppData reads/writes, which broke TAPE with phantom 404s.
set "PYW="
for /f "usebackq delims=" %%i in (`python -c "import sys,os;print(os.path.join(os.path.dirname(sys.executable),'pythonw.exe'))" 2^>nul`) do set "PYW=%%i"
if defined PYW if not exist "%PYW%" set "PYW="
if not defined PYW (
  for /f "usebackq delims=" %%i in (`py -c "import sys,os;print(os.path.join(os.path.dirname(sys.executable),'pythonw.exe'))" 2^>nul`) do set "PYW=%%i"
)
if defined PYW if not exist "%PYW%" set "PYW="
if not defined PYW (
  echo  [!] Python was not found. Install it from python.org
  echo      and tick "Add python.exe to PATH", then run this again.
  pause & exit /b 1
)
echo  Using: %PYW%

set "DEST=%LOCALAPPDATA%\TAPE"
echo  Installing to %DEST% ...
if not exist "%DEST%" mkdir "%DEST%"
xcopy /E /I /Y "%~dp0app" "%DEST%\app\" >nul
xcopy /E /I /Y "%~dp0playtape" "%DEST%\playtape\" >nul
copy /Y "%~dp0tape_launcher.pyw" "%DEST%\" >nul
copy /Y "%~dp0tape.ico" "%DEST%\" >nul
copy /Y "%~dp0playtape.ico" "%DEST%\" >nul 2>nul
copy /Y "%~dp0README.txt" "%DEST%\" >nul 2>nul

REM --- PLAYTAPE Next (optional): only if its single-file build exists.
REM     Build it first: in playtape-next run "npm install" then "npm run build:single".
set "HASNEXT="
if exist "%~dp0playtape-next\dist-single\index.html" (
  if not exist "%DEST%\playtape-next" mkdir "%DEST%\playtape-next"
  copy /Y "%~dp0playtape-next\dist-single\index.html" "%DEST%\playtape-next\index.html" >nul
  set "HASNEXT=1"
)

REM --- shortcuts: Desktop + Start Menu for both apps ---
powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "foreach($p in @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs'))){" ^
  "  $s = $ws.CreateShortcut((Join-Path $p 'TAPE.lnk'));" ^
  "  $s.TargetPath = '%PYW%'; $s.Arguments = '\"%DEST%\tape_launcher.pyw\"';" ^
  "  $s.WorkingDirectory = '%DEST%'; $s.IconLocation = '%DEST%\tape.ico';" ^
  "  $s.Description = 'TAPE - multitrack recorder'; $s.Save();" ^
  "  $s2 = $ws.CreateShortcut((Join-Path $p 'PLAYTAPE.lnk'));" ^
  "  $s2.TargetPath = '%PYW%'; $s2.Arguments = '\"%DEST%\tape_launcher.pyw\" playtape';" ^
  "  $s2.WorkingDirectory = '%DEST%'; $s2.IconLocation = '%DEST%\playtape.ico';" ^
  "  $s2.Description = 'PLAYTAPE - young tape machine'; $s2.Save() }"
if errorlevel 1 ( echo  [!] Could not create shortcuts. & pause & exit /b 1 )

if defined HASNEXT powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "foreach($p in @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs'))){" ^
  "  $s3 = $ws.CreateShortcut((Join-Path $p 'PLAYTAPE Next.lnk'));" ^
  "  $s3.TargetPath = '%PYW%'; $s3.Arguments = '\"%DEST%\tape_launcher.pyw\" next';" ^
  "  $s3.WorkingDirectory = '%DEST%'; $s3.IconLocation = '%DEST%\playtape.ico';" ^
  "  $s3.Description = 'PLAYTAPE Next - capture ideas fast'; $s3.Save() }"
if defined HASNEXT if errorlevel 1 ( echo  [!] Could not create the PLAYTAPE Next shortcut. )

REM --- uninstaller ---
(
  echo @echo off
  echo title TAPE uninstaller
  echo echo Removing TAPE + PLAYTAPE...
  echo del "%%USERPROFILE%%\Desktop\TAPE.lnk" 2^>nul
  echo del "%%USERPROFILE%%\Desktop\PLAYTAPE.lnk" 2^>nul
  echo del "%%APPDATA%%\Microsoft\Windows\Start Menu\Programs\TAPE.lnk" 2^>nul
  echo del "%%APPDATA%%\Microsoft\Windows\Start Menu\Programs\PLAYTAPE.lnk" 2^>nul
  echo del "%%USERPROFILE%%\Desktop\PLAYTAPE Next.lnk" 2^>nul
  echo del "%%APPDATA%%\Microsoft\Windows\Start Menu\Programs\PLAYTAPE Next.lnk" 2^>nul
  echo rd /s /q "%LOCALAPPDATA%\TAPE"
  echo echo Done. Your saved projects are NOT touched.
  echo pause
) > "%DEST%\UNINSTALL.bat"

echo.
echo  Installed. TAPE and PLAYTAPE are on the Desktop and Start Menu.
if defined HASNEXT echo  PLAYTAPE Next was found and installed alongside them.
echo  (Projects are never stored inside the install folder, so
echo   reinstalling/updating never touches your music.)
echo.
pause
