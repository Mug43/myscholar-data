@echo off
setlocal
cd /d "%~dp0"

set "PY=E:\Programs\anaconda3\envs\conda312\python.exe"
if not exist "%PY%" set "PY=python"

echo [MyScholar] Step 1/2: Downloading public sources and building JSON...
"%PY%" fetch_data.py
if errorlevel 1 (
    echo [ERROR] Build failed. Check network or run: pip install -r requirements.txt
    pause
    exit /b 1
)

echo.
echo [MyScholar] Step 2/2: Pushing public files to GitHub (Mug43/myscholar-data)...
if not exist ".git" (
    echo [INFO] Git repo not initialized yet. Run git init and add remote first.
    pause
    exit /b 0
)

git add my_journals.json my_journals.min.json build_report.md build_journals.py fetch_data.py myscholar.user.js README.md requirements.txt .gitignore
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "chore: update journal datasets"
    git push origin main
    if errorlevel 1 (
        echo [WARN] git push failed. Please check GitHub login or network.
    ) else (
        echo [OK] Pushed to GitHub!
    )
) else (
    echo [OK] No changes to push.
)

echo.
echo Done! Raw sync URL:
echo https://raw.githubusercontent.com/Mug43/myscholar-data/main/my_journals.json
pause
