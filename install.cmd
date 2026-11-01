@echo off
rem Epoch installer launcher: runs install.ps1 with Bypass execution policy.
rem Usage: install.cmd [install.ps1 parameters]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
exit /b %ERRORLEVEL%
