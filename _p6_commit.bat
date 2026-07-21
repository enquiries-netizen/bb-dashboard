@echo off
cd /d "C:\Users\inday\BB dashbboard web APP"
(
echo === GIT STATUS ===
git status
echo === GIT DIFF index.html ===
git diff index.html
echo === GIT ADD ===
git add -A
echo === GIT COMMIT ===
git commit -m "P6: fix labour table headers, remove hourly rate"
echo COMMIT_EXIT=%ERRORLEVEL%
echo === GIT PUSH ===
git push origin master:main --force
echo PUSH_EXIT=%ERRORLEVEL%
) > "_p6_commit.log" 2>&1
