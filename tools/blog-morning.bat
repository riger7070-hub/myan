@echo off
chcp 65001 > nul
REM ---------------------------------------------------------------
REM  Weekday morning: build the blog paste page by itself.
REM
REM  Windows Task Scheduler runs this at 08:15 on weekdays.
REM  The owner types no commands. A browser window opens with the
REM  paste page ready; they copy from it.
REM
REM  Steps
REM    1. pull what the cloud routine pushed overnight
REM    2. split photos per post and build the paste page
REM    3. open the page in a browser
REM
REM  It never commits or pushes. Pull only.
REM  If the owner has local edits, the pull stops - that is correct.
REM  Stopping and saying so beats overwriting their work silently.
REM
REM  NOTE: this file is ASCII on purpose, including its name.
REM  A Korean filename could not be found by cmd.exe when the task
REM  scheduler called it (codepage mismatch), and the task failed
REM  with result 1 and no log. Keep it ASCII.
REM ---------------------------------------------------------------

cd /d "%~dp0.."

REM  Keep the log OUT of blog\ . Every .txt in blog\ is treated as a
REM  blog post by test/blog-plaintext.test.mjs, so a log file there
REM  failed seven tests. It lives next to this script instead.
set "LOG=%~dp0morning-log.txt"
echo. >> "%LOG%"
echo ===== %DATE% %TIME% ===== >> "%LOG%"

echo [1/3] pulling new posts...
git pull --ff-only >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo   Could not pull. You may have local edits.
  echo   See tools\morning-log.txt
  echo.
  echo PULL FAILED >> "%LOG%"
  pause
  exit /b 1
)

echo [2/3] building the paste page...
call npm run blog >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo   Build failed. See tools\morning-log.txt
  echo.
  echo BUILD FAILED >> "%LOG%"
  pause
  exit /b 1
)

echo [3/3] opening...
start "" "%~dp0..\blog\blog-page.html"
echo OK >> "%LOG%"

REM  Do NOT call `timeout` here. It needs a console; under Task
REM  Scheduler it fails with "Input redirection is not supported"
REM  and the whole task is reported as Last Result 1 even though
REM  every step succeeded. That happened and it looked broken.
exit /b 0
