FROM codercom/code-server:latest

# Node.js インストール（Claude Code用）
USER root
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs git

# Claude Code CLIインストール
RUN npm install -g @anthropic-ai/claude-code

# ワークスペースディレクトリ
RUN mkdir -p /workspace && chown coder:coder /workspace

# Claude Code VSCode拡張機能をインストール
USER coder
RUN code-server --install-extension anthropic.claude-code || true

# Claude Code設定ディレクトリを作成
RUN mkdir -p /home/coder/.claude

# 初期設定ファイルを作成
COPY --chown=coder:coder claude-config.json /home/coder/.claude.json
COPY --chown=coder:coder entrypoint.sh /home/coder/entrypoint.sh
RUN chmod +x /home/coder/entrypoint.sh

WORKDIR /workspace

# Claude CodeはBedrock経由で動作
# 認証: ANTHROPIC_API_KEY環境変数を使用
EXPOSE 8080

ENTRYPOINT ["/home/coder/entrypoint.sh"]
