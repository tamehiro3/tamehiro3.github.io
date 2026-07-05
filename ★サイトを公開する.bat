@echo off
chcp 65001 >nul
title しのびのゲーム工房 - サイト公開ツール
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy_to_github.ps1"
