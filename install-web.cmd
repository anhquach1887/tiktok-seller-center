@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
pushd "%~dp0"
call npm install --no-audit --no-fund
if errorlevel 1 goto failed
call npm run build
if errorlevel 1 goto failed
echo Installation and production build completed.
popd
pause
exit /b 0
:failed
echo Installation or build failed. Copy the error shown above.
popd
pause
exit /b 1
