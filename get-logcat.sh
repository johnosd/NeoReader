#!/bin/bash
PACKAGE="com.johnny.neoreader"

adb logcat -c
echo "Reproduza o bug agora..."
sleep 30
PID=$(adb shell pidof -s $PACKAGE)
adb logcat --pid=$PID -d > logcat.txt

echo "Log salvo em logcat.txt"