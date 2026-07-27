@echo off
REM NotebookLM backlog video grinder — run hourly by Windows Task Scheduler.
REM Goes through pipeline_watchdog.py, not daily_grind.py directly: the watchdog
REM probes auth first, un-sticks stalled queue entries and toasts when a human
REM has to re-run 'notebooklm login'. An expired session used to just no-op here
REM every morning in silence.
set PY=C:\Users\yairk\AppData\Local\Programs\Python\Python312\python.exe
set DIR=%~dp0
set PYTHONUTF8=1
"%PY%" "%DIR%pipeline_watchdog.py" --minutes 30 >> "%DIR%daily_grind.log" 2>&1
