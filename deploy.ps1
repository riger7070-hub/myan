Write-Host "M;Y An - Cloudflare Workers 배포 시작..." -ForegroundColor Cyan
Set-Location "C:\myan"
npx wrangler deploy
Write-Host ""
Write-Host "배포 완료! myan.riger7070.workers.dev 에서 확인하세요." -ForegroundColor Green
Read-Host "엔터를 눌러 닫기"
