#!/bin/bash
set -e

# Claude Code用の環境変数を設定
export CLAUDE_CODE_USE_BEDROCK="${CLAUDE_CODE_USE_BEDROCK:-true}"
export CLAUDECODE=1

# AWS_BEARER_TOKEN_BEDROCKをANTHROPIC_API_KEYとして設定
# (Claude CodeはANTHROPIC_API_KEYを読み込む)
if [ -n "$AWS_BEARER_TOKEN_BEDROCK" ]; then
    export ANTHROPIC_API_KEY="$AWS_BEARER_TOKEN_BEDROCK"
    echo "ANTHROPIC_API_KEY set from AWS_BEARER_TOKEN_BEDROCK"
fi

# code-serverの設定ディレクトリを作成
mkdir -p /home/coder/.local/share/code-server/User

# VSCode設定を作成（Claude Code拡張機能の自動有効化）
cat > /home/coder/.local/share/code-server/User/settings.json << 'EOF'
{
    "claude-code.enableAutoStart": true,
    "terminal.integrated.defaultProfile.linux": "bash",
    "editor.fontSize": 14,
    "workbench.colorTheme": "Default Dark+"
}
EOF

echo "=========================================="
echo "Starting code-server with Claude Code..."
echo "CLAUDE_CODE_USE_BEDROCK: $CLAUDE_CODE_USE_BEDROCK"
echo "ANTHROPIC_API_KEY is set: $([ -n "$ANTHROPIC_API_KEY" ] && echo 'yes' || echo 'no')"
echo "AWS_DEFAULT_REGION: ${AWS_DEFAULT_REGION:-us-east-1}"
echo "=========================================="

# code-serverを起動
exec /usr/bin/entrypoint.sh --bind-addr 0.0.0.0:8080 /workspace
