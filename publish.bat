@echo off
echo ========================================
echo 正在准备发布 LogAnalyzer...
echo ========================================
echo.

echo [2/4] 清理旧的构建文件...
if exist dist\win-unpacked (
    echo 正在删除 dist\win-unpacked...
    rmdir /s /q dist\win-unpacked 2>nul
    timeout /t 1 /nobreak >nul
)

if exist dist\*.exe (
    echo 正在删除旧的安装包...
    del /q dist\*.exe 2>nul
)

echo [3/4] 开始构建...
set DEBUG=electron-builder
npm run dist

echo.
echo [4/4] 构建完成！
echo ========================================

pause