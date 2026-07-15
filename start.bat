@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title CampusConnect 360 - Arranque en un clic

REM Situarse en la carpeta del proyecto (donde vive este .bat)
cd /d "%~dp0"

echo ============================================================
echo    CampusConnect 360 - Arranque en un clic
echo ============================================================
echo.

REM --- 1) Verificar que Docker esta disponible y corriendo -----------------
docker version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker no responde. Abre Docker Desktop, espera a que
  echo         quede "Running" y vuelve a ejecutar start.bat.
  echo.
  pause
  exit /b 1
)

REM --- 2) Levantar todo el ecosistema -------------------------------------
echo [1/4] Construyendo y levantando contenedores...
echo       (docker compose up --build -d)
echo.
docker compose up --build -d
if errorlevel 1 (
  echo.
  echo [ERROR] Fallo "docker compose up". Revisa el mensaje de arriba.
  pause
  exit /b 1
)

REM --- 3) Esperar a que el API Gateway responda ---------------------------
echo.
echo [2/4] Esperando a que el API Gateway este listo (localhost:8080)...
set /a tries=0
:waitloop
set /a tries+=1
curl -s -o nul http://localhost:8080/health
if not errorlevel 1 goto ready
if !tries! GEQ 60 (
  echo       [AVISO] El gateway aun no responde. Continua igual;
  echo               puedes revisar "docker compose logs -f".
  goto seed
)
timeout /t 2 /nobreak >nul
goto waitloop
:ready
echo       Gateway OK.

REM --- 4) Datos semilla opcionales ----------------------------------------
:seed
echo.
set "seed="
set /p seed="[3/4] Cargar datos semilla de demostracion? (s/N): "
if /i "!seed!"=="s" (
  where bash >nul 2>&1
  if not errorlevel 1 (
    echo       Ejecutando scripts/seed.sh ...
    bash scripts/seed.sh
  ) else (
    echo       [AVISO] No se encontro "bash". Instala Git Bash o ejecuta
    echo               manualmente:  bash scripts/seed.sh
  )
)

REM --- 5) Abrir los portales en el navegador ------------------------------
echo.
echo [4/4] Abriendo portales en el navegador...
start "" http://localhost:8090

echo.
echo ============================================================
echo    Listo. CampusConnect 360 esta arriba:
echo.
echo    Portales           http://localhost:8090
echo    API Gateway        http://localhost:8080
echo    Swagger x servicio http://localhost:8080/api/^<servicio^>/docs
echo    RabbitMQ UI        http://localhost:15672   (guest/guest)
echo.
echo    Usuarios: secretaria, finanzas, docente, bienestar,
echo              director, admin   -   clave: campus123
echo.
echo    Para detener todo:   docker compose down
echo ============================================================
echo.
pause
endlocal
