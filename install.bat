@echo off
chcp 65001 >nul
setlocal

echo === Установка Cherry Proxy Lite ===
set /p CF_ACCOUNT_ID="1. Введите ваш Account ID: "
set /p CF_API_TOKEN="2. Введите ваш API Token: "
set WORKER_NAME=cherry-proxy-lampa

echo.
echo Отправка скрипта в Cloudflare...
curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/%CF_ACCOUNT_ID%/workers/scripts/%WORKER_NAME%" ^
     -H "Authorization: Bearer %CF_API_TOKEN%" ^
     -H "Content-Type: application/javascript" ^
     --data-binary @worker.js

echo.
echo === Готово! ===
pause
