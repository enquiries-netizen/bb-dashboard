@echo off
cd /d "C:\Users\inday\BB dashbboard web APP"
echo === Pushing to GitHub ===
git add -A
git commit -m "P4: fix end date col header casing + update sync messages"
git push origin master:main
echo.
echo === Done ===
pause
