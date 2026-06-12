@echo off
cd /d "C:\Users\inday\BB dashbboard web APP"
echo === Pushing to GitHub ===
git add -A
git commit -m "Fix: use Buildpass_Schedules tab name (matches sheet)"
git push origin master:main
echo.
echo === Done ===
pause
