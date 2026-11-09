@echo off
cd /d "%~dp0"
rem nginx (the app) and the API with the models on the GPU, in Docker: the first start builds the images
docker compose up -d --build || (pause & exit /b 1)
start "" http://127.0.0.1:8765
