#!/bin/bash

# Model Compare - 一括起動スクリプト
# API, Frontend, code-server を起動します

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

# 色の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# PIDファイル
PID_FILE="$SCRIPT_DIR/.pids"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Model Compare - 起動スクリプト${NC}"
echo -e "${BLUE}========================================${NC}"

# 既存のプロセスを停止
cleanup() {
    echo -e "\n${YELLOW}プロセスを停止中...${NC}"
    if [ -f "$PID_FILE" ]; then
        while read -r pid; do
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null || true
                echo -e "${GREEN}PID $pid を停止しました${NC}"
            fi
        done < "$PID_FILE"
        rm -f "$PID_FILE"
    fi
    # 子プロセスも停止
    pkill -P $$ 2>/dev/null || true
    echo -e "${GREEN}停止完了${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# 既存プロセスの確認と停止
echo -e "${YELLOW}既存のプロセスを確認中...${NC}"

# ポートを使用しているプロセスを確認
check_port() {
    local port=$1
    local pid=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        echo -e "${YELLOW}ポート $port は既に使用中です (PID: $pid)${NC}"
        read -p "停止しますか? (y/N): " answer
        if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
            kill $pid 2>/dev/null || true
            sleep 1
        else
            echo -e "${RED}起動を中止します${NC}"
            exit 1
        fi
    fi
}

check_port 8000  # API
check_port 3000  # Frontend
check_port 8443  # code-server

# 1. API サーバー起動
echo -e "\n${GREEN}[1/3] API サーバーを起動中...${NC}"
cd "$SCRIPT_DIR/api"

if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

uvicorn main:app --host 0.0.0.0 --port 8000 --reload > "$LOG_DIR/api.log" 2>&1 &
API_PID=$!
echo $API_PID >> "$PID_FILE"
echo -e "${GREEN}  → API サーバー起動 (PID: $API_PID)${NC}"
echo -e "${GREEN}  → http://localhost:8000${NC}"

# API起動を待機
sleep 2

# 2. Frontend 起動
echo -e "\n${GREEN}[2/3] Frontend を起動中...${NC}"
cd "$SCRIPT_DIR/frontend"

npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID >> "$PID_FILE"
echo -e "${GREEN}  → Frontend 起動 (PID: $FRONTEND_PID)${NC}"
echo -e "${GREEN}  → http://localhost:3000${NC}"

# 3. code-server 起動
echo -e "\n${GREEN}[3/3] code-server を起動中...${NC}"
cd "$SCRIPT_DIR"

# workspacesディレクトリを作成
mkdir -p "$SCRIPT_DIR/workspaces"

# code-serverがインストールされているか確認
if command -v code-server &> /dev/null; then
    code-server --bind-addr 0.0.0.0:8443 --auth none "$SCRIPT_DIR/workspaces" > "$LOG_DIR/code-server.log" 2>&1 &
    CODE_SERVER_PID=$!
    echo $CODE_SERVER_PID >> "$PID_FILE"
    echo -e "${GREEN}  → code-server 起動 (PID: $CODE_SERVER_PID)${NC}"
    echo -e "${GREEN}  → http://localhost:8443${NC}"
else
    echo -e "${YELLOW}  → code-server がインストールされていません${NC}"
    echo -e "${YELLOW}  → インストール: npm install -g code-server${NC}"
    echo -e "${YELLOW}  → または: brew install code-server${NC}"
fi

echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}全てのサービスが起動しました！${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e ""
echo -e "  ${GREEN}API:${NC}          http://localhost:8000"
echo -e "  ${GREEN}Frontend:${NC}     http://localhost:3000"
echo -e "  ${GREEN}code-server:${NC}  http://localhost:8443"
echo -e ""
echo -e "  ${YELLOW}ログファイル:${NC} $LOG_DIR/"
echo -e ""
echo -e "${YELLOW}Ctrl+C で全てのサービスを停止します${NC}"
echo -e "${BLUE}========================================${NC}"

# ログを表示しながら待機
echo -e "\n${BLUE}ログ出力 (Ctrl+C で終了):${NC}\n"
tail -f "$LOG_DIR/api.log" "$LOG_DIR/frontend.log" "$LOG_DIR/code-server.log" 2>/dev/null &
TAIL_PID=$!
echo $TAIL_PID >> "$PID_FILE"

# 終了を待機
wait
