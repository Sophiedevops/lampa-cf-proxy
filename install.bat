@echo off
setlocal enabledelayedexpansion

echo === Cherry Proxy Installer ===
set /p CF_ACCOUNT_ID="1. Enter Account ID: "
set /p CF_API_TOKEN="2. Enter API Token: "
set WORKER_NAME=cherry-proxy-lampa

REM Generate a random 8-digit secret key (easy for TV remote)
set RAND_STR=%RANDOM%%RANDOM%%RANDOM%
set PROXY_KEY=!RAND_STR:~0,8!

REM Create metadata JSON for bindings
echo {"main_module":"worker.js","bindings":[{"type":"secret_text","name":"PROXY_KEY","text":"!PROXY_KEY!"}]} > meta.json

echo.
echo Deploying script to Cloudflare...
curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/%CF_ACCOUNT_ID%/workers/scripts/%WORKER_NAME%" -H "Authorization: Bearer %CF_API_TOKEN%" -F "metadata=@meta.json;type=application/json" -F "script=@worker.js;type=application/javascript+module" > deploy_log.txt

echo Fetching your Cloudflare subdomain...
curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/%CF_ACCOUNT_ID%/workers/subdomain" -H "Authorization: Bearer %CF_API_TOKEN%" > sub_log.txt

REM Safe JSON extraction of subdomain
for /f %%a in ('powershell -NoProfile -Command "(Get-Content sub_log.txt | ConvertFrom-Json).result.subdomain" 2^>nul') do set SUBDOMAIN=%%a

if "%SUBDOMAIN%"=="" (
    set SUBDOMAIN=YOUR-SUBDOMAIN
)

echo.
echo =========================================
echo SUCCESS! YOUR DATA FOR LAMPA:
echo Worker URL : https://%WORKER_NAME%.%SUBDOMAIN%.workers.dev/proxy
echo Secret Key : !PROXY_KEY!
echo =========================================

del meta.json deploy_log.txt sub_log.txt 2>nul
pause
