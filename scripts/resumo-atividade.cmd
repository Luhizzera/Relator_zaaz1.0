@echo off
REM Wrapper chamado pelo Agendador de Tarefas do Windows.
REM
REM Existe por três motivos que o schtasks sozinho não resolve:
REM   1. garante o diretório de trabalho certo (o agendador inicia em system32);
REM   2. acumula log com data, senão uma falha às 8h passa despercebida;
REM   3. devolve o código de saída, pra tarefa aparecer como "falhou" no painel.

setlocal
set RAIZ=%~dp0..
cd /d "%RAIZ%"

if not exist "logs" mkdir "logs"
set LOG=logs\resumo-atividade.log

echo. >> "%LOG%"
echo ===== %DATE% %TIME% ===== >> "%LOG%"
node scripts\resumo-atividade.mjs >> "%LOG%" 2>&1
set CODIGO=%ERRORLEVEL%

if %CODIGO% NEQ 0 (
  echo [FALHOU] codigo %CODIGO% >> "%LOG%"
) else (
  echo [OK] >> "%LOG%"
)

exit /b %CODIGO%
