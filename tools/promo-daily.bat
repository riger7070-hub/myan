@echo off
chcp 65001 > nul
REM ---------------------------------------------------------------
REM  Every morning: build the promo sheet by itself.
REM
REM  Windows Task Scheduler runs this at 08:30, every day.
REM  The owner types no commands. A browser window opens saying
REM  what to post today and where.
REM
REM  Steps
REM    1. pull (docs/홍보.md and promo/기록.md may have changed)
REM    2. build promo/promo-page.html from those two files + live /tti
REM    3. open it in a browser
REM
REM  It never commits or pushes. Pull only.
REM  If the owner has local edits, the pull stops - that is correct.
REM
REM  ! Must NOT overlap blog-morning.bat. Two `git pull` running at the
REM    same moment in one clone both write FETCH_HEAD and the second dies
REM    with "Cannot fast-forward to multiple branches." That happened.
REM    Blog runs 08:15 (weekdays), this runs 08:45 - 30 minutes apart.
REM
REM  NOTE: this file is ASCII on purpose, including its name.
REM  A Korean filename could not be found by cmd.exe when the task
REM  scheduler called it (codepage mismatch), and the task failed
REM  with result 1 and no log. Keep it ASCII.
REM ---------------------------------------------------------------

cd /d "%~dp0.."

set "LOG=%~dp0promo-log.txt"
echo. >> "%LOG%"
echo ===== %DATE% %TIME% ===== >> "%LOG%"

echo [1/3] pulling...
git pull --ff-only >> "%LOG%" 2>&1
REM  A failed pull must NOT stop the sheet. The record and the copy are
REM  already on this disk; only today's ranking comes from the network.
REM  Losing "what do I post today" because of a merge conflict is worse
REM  than showing a sheet built from slightly older files.
if errorlevel 1 echo PULL FAILED - building from local files anyway >> "%LOG%"

echo [2/3] building...
call npm run promo >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo   Build failed. See tools\promo-log.txt
  echo.
  echo BUILD FAILED >> "%LOG%"
  pause
  exit /b 1
)

echo [3/3] opening...
start "" "%~dp0..\promo\promo-page.html"
echo OK >> "%LOG%"

REM  Do NOT call `timeout` here. It needs a console; under Task
REM  Scheduler it fails with "Input redirection is not supported"
REM  and the whole task is reported as Last Result 1 even though
REM  every step succeeded.
exit /b 0
