@echo off
REM Daily NotebookLM backlog video grinder — run by Windows Task Scheduler.
REM Drains the video backlog within the daily quota, ships new mp4s, logs output.
set PY=C:\Users\yairk\AppData\Local\Programs\Python\Python312\python.exe
set DIR=%~dp0
set PYTHONUTF8=1
"%PY%" "%DIR%daily_grind.py" --minutes 30 >> "%DIR%daily_grind.log" 2>&1
