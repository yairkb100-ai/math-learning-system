@echo off
REM NotebookLM session keepalive — run every 15 minutes by Windows Task Scheduler.
REM Without it an idle profile stales out within hours, so a login done in the
REM evening is dead before the next morning's grind. See auth_keepalive.py.
REM
REM Wrapped in a .bat for the same reason daily_grind.bat is: the repo lives
REM under a Hebrew path, and a Hebrew path handed to Task Scheduler as an
REM ARGUMENT is mangled through the ANSI code page — python.exe then gets a
REM path that does not exist and the task dies instantly with 0xC000013A. Only
REM the .bat's own path goes through the scheduler; %~dp0 resolves the rest
REM here, where it is correct.
set PY=C:\Users\yairk\AppData\Local\Programs\Python\Python312\python.exe
set DIR=%~dp0
set PYTHONUTF8=1
"%PY%" "%DIR%auth_keepalive.py" --quiet >> "%DIR%auth_keepalive_task.log" 2>&1
