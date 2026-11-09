@echo off
cd /d "%~dp0"
.venv\Scripts\python -m shorts.setup || (pause & exit /b 1)
start "" http://127.0.0.1:8765
.venv\Scripts\python -m uvicorn shorts.server:create_app --factory --host 127.0.0.1 --port 8765
