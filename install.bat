@echo off
setlocal

echo === Cherry Proxy Lite Installer ===
set /p CF_ACCOUNT_ID="1. Enter your Account ID: "
set /p CF_API_TOKEN="2. Enter your API Token: "
set WORKER_NAME=cherry-proxy-lampa

echo.
echo Deploying script to Cloudflare...
curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/%CF_ACCOUNT_ID%/workers/scripts/%WORKER_NAME%" -H "Authorization: Bearer %CF_API_TOKEN%" -H "Content-Type: application/javascript" --data-binary @worker.js

echo.
echo === Done! ===
pause
