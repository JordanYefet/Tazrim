@echo off
rem Tazrim installer for Windows: double-click this file. It runs install-tazrim.ps1 (same folder).
rem If Windows warns "Windows protected your PC": More info -> Run anyway.
title Tazrim installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-tazrim.ps1"
