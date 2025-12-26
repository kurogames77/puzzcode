@echo off
echo Starting Algorithm Testing Servers...
echo.
echo Starting Backend API on port 5000...
start "Backend API" cmd /k "cd /d %~dp0 && python backend.py"
timeout /t 3 /nobreak >nul
echo.
echo Starting Frontend Server on port 8000...
start "Frontend Server" cmd /k "cd /d %~dp0 && python -m http.server 8000"
timeout /t 2 /nobreak >nul
echo.
echo ✅ Servers are starting!
echo.
echo Backend API: http://localhost:5000
echo Frontend UI: http://localhost:8000
echo.
echo Press any key to open the tester in your browser...
pause >nul
start http://localhost:8000/index.html
