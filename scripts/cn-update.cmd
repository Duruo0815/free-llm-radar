@echo off
rem 国内视角定时更新：探活 -> 变更追踪 -> 推送 -> 构建 -> 提交推送
rem 由 Windows 计划任务 FreeLLMRadar-CN-Probe 每 6 小时调用；电脑关机期间错过会在下次开机补跑
setlocal
cd /d "D:\Zcode WorkSpace\free-llm-radar"
if not exist logs mkdir logs
set LOG=logs\cn-probe.log
rem 日志轮转：超过 400 行时只保留最后 200 行
if exist %LOG% (
  for /f %%A in ('type %LOG% ^| find /c /v ""') do set LINES=%%A
)
if defined LINES if %LINES% GTR 400 (
  more +200 %LOG% > %LOG%.tmp
  move /y %LOG%.tmp %LOG% >nul
)

echo ====== %date% %time% ====== >> %LOG%
git pull --rebase --autostash origin main >> %LOG% 2>&1
node scripts/probe.mjs --view=cn >> %LOG% 2>&1
node scripts/track-changes.mjs --view=cn >> %LOG% 2>&1
node scripts/notify.mjs --view=cn >> %LOG% 2>&1
node scripts/build.mjs >> %LOG% 2>&1
git add data/ site/data.js
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "probe(cn): scheduled local update %date% %time%" >> %LOG% 2>&1
  git pull --rebase --autostash origin main >> %LOG% 2>&1
  git push >> %LOG% 2>&1
  if errorlevel 1 (
    echo push failed, retry in 60s >> %LOG%
    timeout /t 60 /nobreak >> %LOG% 2>&1
    git pull --rebase --autostash origin main >> %LOG% 2>&1
    git push >> %LOG% 2>&1
  )
  echo pushed >> %LOG%
) else (
  echo no changes >> %LOG%
)
endlocal
