@echo off
cd /d C:\myan
echo M;Y An - Cloudflare Workers 배포 중...
npx wrangler deploy
echo.
echo 완료! https://myan.riger7070.workers.dev
pause
