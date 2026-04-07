@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "ROOT=%CD%"
set "CLIENT_DIR=%ROOT%\client"
set "RUNTIME_DIR=%ROOT%\.finai-runtime"
set "ENV_FILE=%ROOT%\.env"
set "ENV_TEMPLATE=%ROOT%\.env.example"
set "API_PID_FILE=%RUNTIME_DIR%\api.pid"
set "UI_PID_FILE=%RUNTIME_DIR%\ui.pid"
set "API_OUT_LOG=%RUNTIME_DIR%\api.out.log"
set "API_ERR_LOG=%RUNTIME_DIR%\api.err.log"
set "UI_OUT_LOG=%RUNTIME_DIR%\ui.out.log"
set "UI_ERR_LOG=%RUNTIME_DIR%\ui.err.log"
set "API_HEALTH_URL=http://localhost:3001/api/health"
set "UI_URL=http://localhost:5173"

if /i "%~1"=="start" (
  call :start_all
  exit /b %ERRORLEVEL%
)
if /i "%~1"=="stop" (
  call :stop_all
  exit /b %ERRORLEVEL%
)
if /i "%~1"=="restart" (
  call :restart_all
  exit /b %ERRORLEVEL%
)
if /i "%~1"=="status" (
  call :print_banner
  call :print_snapshot
  exit /b 0
)
if /i "%~1"=="open" (
  call :open_app
  exit /b %ERRORLEVEL%
)
if /i "%~1"=="install" (
  call :install_all
  exit /b %ERRORLEVEL%
)
if /i "%~1"=="start-api" (
  call :start_api_only
  exit /b %ERRORLEVEL%
)
if /i "%~1"=="start-ui" (
  call :start_ui_only
  exit /b %ERRORLEVEL%
)
if /i "%~1"=="stop-api" (
  call :stop_api
  exit /b %ERRORLEVEL%
)
if /i "%~1"=="stop-ui" (
  call :stop_ui
  exit /b %ERRORLEVEL%
)
if /i "%~1"=="restart-api" (
  call :restart_api_only
  exit /b %ERRORLEVEL%
)
if /i "%~1"=="restart-ui" (
  call :restart_ui_only
  exit /b %ERRORLEVEL%
)
if /i "%~1"=="help" (
  call :print_help
  exit /b 0
)
if not "%~1"=="" (
  echo Unknown command: %~1
  echo.
  call :print_help
  exit /b 1
)

:menu
cls
call :print_banner
call :print_snapshot
echo 1. Start app
echo 2. Stop app
echo 3. Restart app
echo 4. Restart API only
echo 5. Restart UI only
echo 6. Open app in browser
echo 7. Install or update dependencies
echo 8. Show help
echo 9. Exit
echo.
set "choice="
set /p "choice=Choose an option: "

if /i "!choice!"=="1" (
  call :start_all
  call :wait_user
  goto menu
)
if /i "!choice!"=="2" (
  call :stop_all
  call :wait_user
  goto menu
)
if /i "!choice!"=="3" (
  call :restart_all
  call :wait_user
  goto menu
)
if /i "!choice!"=="4" (
  call :restart_api_only
  call :wait_user
  goto menu
)
if /i "!choice!"=="5" (
  call :restart_ui_only
  call :wait_user
  goto menu
)
if /i "!choice!"=="6" (
  call :open_app
  call :wait_user
  goto menu
)
if /i "!choice!"=="7" (
  call :install_all
  call :wait_user
  goto menu
)
if /i "!choice!"=="8" (
  call :print_help
  call :wait_user
  goto menu
)
if /i "!choice!"=="9" exit /b 0

echo Invalid option.
call :wait_user
goto menu

:print_banner
echo ==================================================
echo FinAI Control Panel
echo ==================================================
echo Project root: %ROOT%
echo.
exit /b 0

:print_snapshot
call :print_service_status "API" "%API_PID_FILE%" "%API_HEALTH_URL%"
call :print_service_status "UI" "%UI_PID_FILE%" "%UI_URL%"

if exist "%ENV_FILE%" (
  echo [.env] Ready
) else (
  echo [.env] Missing - it will be created automatically on first start
)

if exist "%ROOT%\node_modules" (
  echo [root deps] Installed
) else (
  echo [root deps] Missing
)

if exist "%CLIENT_DIR%\node_modules" (
  echo [client deps] Installed
) else (
  echo [client deps] Missing
)

echo [logs] %RUNTIME_DIR%

echo.
exit /b 0

:print_service_status
set "SERVICE_NAME=%~1"
set "PID_FILE=%~2"
set "SERVICE_URL=%~3"

call :cleanup_stale_pid "%PID_FILE%"
call :read_pid "%PID_FILE%" SERVICE_PID
if defined SERVICE_PID (
  call :is_pid_running "!SERVICE_PID!"
  if not errorlevel 1 (
    echo [%SERVICE_NAME%] Running - PID !SERVICE_PID! - !SERVICE_URL!
    exit /b 0
  )
)

echo [%SERVICE_NAME%] Stopped
exit /b 0

:print_help
echo Usage:
echo   finai-panel.bat
echo   finai-panel.bat start
echo   finai-panel.bat stop
echo   finai-panel.bat restart
echo   finai-panel.bat status
echo   finai-panel.bat open
echo   finai-panel.bat install
echo   finai-panel.bat start-api
echo   finai-panel.bat start-ui
echo   finai-panel.bat stop-api
echo   finai-panel.bat stop-ui
echo   finai-panel.bat restart-api
echo   finai-panel.bat restart-ui
echo.
echo Double-click the file to use the interactive control panel.
echo Runtime logs are written to .finai-runtime\*.log
exit /b 0

:wait_user
echo.
pause
exit /b 0

:check_prerequisites
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH. Install Node.js 20 or newer first.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH. Reinstall Node.js and try again.
  exit /b 1
)

if not exist "%ROOT%\package.json" (
  echo [ERROR] package.json was not found in the project root.
  exit /b 1
)

if not exist "%CLIENT_DIR%\package.json" (
  echo [ERROR] client\package.json was not found.
  exit /b 1
)

exit /b 0

:ensure_runtime_dir
if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%" >nul 2>nul
exit /b 0

:ensure_env
if exist "%ENV_FILE%" exit /b 0

if exist "%ENV_TEMPLATE%" (
  copy /Y "%ENV_TEMPLATE%" "%ENV_FILE%" >nul
  echo [.env] Created from .env.example
  exit /b 0
)

(
  echo PORT=3001
  echo.
  echo # Optional:
  echo # GEMINI_API_KEY=your_gemini_api_key_here
) > "%ENV_FILE%"
echo [.env] Created with default values
exit /b 0

:prepare_runtime
call :check_prerequisites
if errorlevel 1 exit /b 1

call :ensure_runtime_dir
call :ensure_env
if errorlevel 1 exit /b 1

call :ensure_dependencies
exit /b %ERRORLEVEL%

:ensure_dependencies
if exist "%ROOT%\node_modules" if exist "%CLIENT_DIR%\node_modules" exit /b 0

echo Dependencies are missing. Running first-time setup...
call :install_all
exit /b %ERRORLEVEL%

:install_all
call :check_prerequisites
if errorlevel 1 exit /b 1

call :ensure_runtime_dir
call :ensure_env
if errorlevel 1 exit /b 1

echo Installing project dependencies...
call npm install
if errorlevel 1 (
  echo [ERROR] Root dependency installation failed.
  exit /b 1
)

pushd "%CLIENT_DIR%"
call npm install
if errorlevel 1 (
  popd
  echo [ERROR] Client dependency installation failed.
  exit /b 1
)
popd

echo Dependencies are ready.
exit /b 0

:start_all
call :prepare_runtime
if errorlevel 1 exit /b 1

call :start_api
if errorlevel 1 exit /b 1

call :start_ui
if errorlevel 1 exit /b 1

echo Waiting for the UI to boot...
timeout /t 2 /nobreak >nul
call :open_app
echo FinAI is starting in the background.
exit /b 0

:stop_all
call :stop_api
set "STOP_API_RC=%ERRORLEVEL%"
call :stop_ui
set "STOP_UI_RC=%ERRORLEVEL%"

if %STOP_API_RC% neq 0 if %STOP_UI_RC% neq 0 exit /b 1
exit /b 0

:restart_all
call :stop_all
call :start_all
exit /b %ERRORLEVEL%

:start_api_only
call :prepare_runtime
if errorlevel 1 exit /b 1
call :start_api
exit /b %ERRORLEVEL%

:start_ui_only
call :prepare_runtime
if errorlevel 1 exit /b 1
call :start_ui
exit /b %ERRORLEVEL%

:restart_api_only
call :stop_api
call :start_api_only
exit /b %ERRORLEVEL%

:restart_ui_only
call :stop_ui
call :start_ui_only
exit /b %ERRORLEVEL%

:start_api
call :start_service "API" "%API_PID_FILE%" "%ROOT%" "node" "server/index.js" "%API_OUT_LOG%" "%API_ERR_LOG%"
exit /b %ERRORLEVEL%

:start_ui
call :start_service "UI" "%UI_PID_FILE%" "%CLIENT_DIR%" "node" "node_modules/vite/bin/vite.js" "%UI_OUT_LOG%" "%UI_ERR_LOG%"
exit /b %ERRORLEVEL%

:start_service
set "SERVICE_NAME=%~1"
set "PID_FILE=%~2"
set "WORK_DIR=%~3"
set "EXECUTABLE=%~4"
set "EXEC_ARG=%~5"
set "OUT_LOG=%~6"
set "ERR_LOG=%~7"

call :cleanup_stale_pid "%PID_FILE%"
call :read_pid "%PID_FILE%" SERVICE_PID
if defined SERVICE_PID (
  call :is_pid_running "!SERVICE_PID!"
  if not errorlevel 1 (
    echo [%SERVICE_NAME%] Already running with PID !SERVICE_PID!.
    exit /b 0
  )
)

if exist "%OUT_LOG%" del /q "%OUT_LOG%" >nul 2>nul
if exist "%ERR_LOG%" del /q "%ERR_LOG%" >nul 2>nul

set "SERVICE_PID="
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Start-Process -FilePath '%EXECUTABLE%' -ArgumentList '%EXEC_ARG%' -WorkingDirectory '%WORK_DIR%' -RedirectStandardOutput '%OUT_LOG%' -RedirectStandardError '%ERR_LOG%' -PassThru; Set-Content -Path '%PID_FILE%' -Value $p.Id"

if errorlevel 1 (
  echo [%SERVICE_NAME%] Failed to start.
  exit /b 1
)

call :read_pid "%PID_FILE%" SERVICE_PID
if not defined SERVICE_PID (
  echo [%SERVICE_NAME%] Failed to capture the process PID.
  exit /b 1
)

timeout /t 1 /nobreak >nul
call :is_pid_running !SERVICE_PID!
if errorlevel 1 (
  del /q "%PID_FILE%" >nul 2>nul
  echo [%SERVICE_NAME%] Failed during startup. Check logs:
  echo   %OUT_LOG%
  echo   %ERR_LOG%
  exit /b 1
)

echo [%SERVICE_NAME%] Running in the background. PID !SERVICE_PID!.
exit /b 0

:stop_api
call :stop_service "API" "%API_PID_FILE%"
exit /b %ERRORLEVEL%

:stop_ui
call :stop_service "UI" "%UI_PID_FILE%"
exit /b %ERRORLEVEL%

:stop_service
set "SERVICE_NAME=%~1"
set "PID_FILE=%~2"

call :cleanup_stale_pid "%PID_FILE%"
call :read_pid "%PID_FILE%" SERVICE_PID
if not defined SERVICE_PID (
  echo [%SERVICE_NAME%] Already stopped.
  exit /b 0
)

call :is_pid_running "!SERVICE_PID!"
if errorlevel 1 (
  del /q "%PID_FILE%" >nul 2>nul
  echo [%SERVICE_NAME%] Stale PID removed.
  exit /b 0
)

taskkill /PID !SERVICE_PID! /T /F >nul 2>nul
if errorlevel 1 (
  echo [%SERVICE_NAME%] Failed to stop PID !SERVICE_PID!.
  exit /b 1
)

del /q "%PID_FILE%" >nul 2>nul
echo [%SERVICE_NAME%] Stopped.
exit /b 0

:open_app
start "" "%UI_URL%"
echo Browser opened at %UI_URL%
exit /b 0

:read_pid
set "%~2="
if exist "%~1" set /p "%~2="<"%~1"
exit /b 0

:cleanup_stale_pid
call :read_pid "%~1" STALE_PID
if not defined STALE_PID exit /b 0

call :is_pid_running "!STALE_PID!"
if errorlevel 1 del /q "%~1" >nul 2>nul
exit /b 0

:is_pid_running
if "%~1"=="" exit /b 1

powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-Process -Id %~1 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
exit /b %ERRORLEVEL%
