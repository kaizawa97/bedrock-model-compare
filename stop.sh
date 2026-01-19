#!/bin/bash

# Model Compare - 停止スクリプト

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.pids"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Model Compare サービスを停止中...${NC}"

# PIDファイルからプロセスを停止
if [ -f "$PID_FILE" ]; then
    while read -r pid; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            echo -e "${GREEN}PID $pid を停止しました${NC}"
        fi
    done < "$PID_FILE"
    rm -f "$PID_FILE"
fi

# ポートを使用しているプロセスも停止
for port in 8000 3000 8443; do
    pid=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        kill $pid 2>/dev/null || true
        echo -e "${GREEN}ポート $port のプロセス (PID: $pid) を停止しました${NC}"
    fi
done

echo -e "${GREEN}全てのサービスを停止しました${NC}"
