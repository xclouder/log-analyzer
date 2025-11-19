@echo off
echo ========================================
echo 清理构建文件
echo ========================================
echo.

echo [1/3] 关闭所有相关进程...
taskkill /F /IM LogAnalyzer.exe 2>nul
taskkill /F /IM electron.exe 2>nul
echo 等待进程完全退出...
timeout /t 3 /nobreak >nul

echo.
echo [2/3] 删除构建目录...
if exist dist (
    echo 正在删除 dist 目录...
    rmdir /s /q dist
    if exist dist (
        echo 警告: 某些文件可能仍在使用中
        echo 请手动关闭所有相关程序后重试
    ) else (
        echo ✓ dist 目录已删除
    )
)

echo.
echo [3/3] 清理完成！
echo ========================================
pause
