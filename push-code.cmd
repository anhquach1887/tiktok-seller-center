@echo off
setlocal
set "PATH=C:\Program Files\Git\cmd;%PATH%"
pushd "%~dp0"
git --version
if errorlevel 1 goto failed
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 git init -b main
if errorlevel 1 goto failed
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin https://github.com/anhquach1887/tiktok-seller-center.git
) else (
  for /f "delims=" %%R in ('git remote get-url origin') do if not "%%R"=="https://github.com/anhquach1887/tiktok-seller-center.git" (
    echo Origin points to another repository. Original remote was preserved.
    goto failed
  )
)
git add .gitignore .dockerignore .env.example .nvmrc package.json package-lock.json next.config.mjs vercel.json app lib scripts tests schema.sql .github README.md DEPLOY_VERCEL.md Dockerfile compose.yaml install-web.cmd start-dev.cmd push-code.cmd
if errorlevel 1 goto failed
git diff --cached --name-only
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Build TikTok ROI Guard for Vercel Hobby"
  if errorlevel 1 goto failed
)
git branch -M main
if errorlevel 1 goto failed
git push -u origin main
if errorlevel 1 goto failed
echo Code pushed to https://github.com/anhquach1887/tiktok-seller-center
popd
pause
exit /b 0
:failed
echo Push did not complete. Check the error above. No force push was used.
popd
pause
exit /b 1
