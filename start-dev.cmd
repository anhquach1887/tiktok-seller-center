@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
pushd "%~dp0"
call npm run dev
popd
pause
