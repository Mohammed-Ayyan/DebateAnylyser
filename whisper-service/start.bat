@echo off
echo ========================================================
echo Starting Debate Analyzer Local Whisper Service (Port 5001)
echo ========================================================

python -c "import faster_whisper" 2>nul
if %errorlevel% neq 0 (
    echo [Info] faster-whisper not detected. Installing dependencies...
    pip install -r requirements.txt
)

python server.py
pause
