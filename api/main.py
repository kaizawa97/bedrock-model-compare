#!/usr/bin/env python3
"""
Bedrock並列実行ツール - FastAPI Server
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv

# .envファイルを読み込み
load_dotenv()

# ルーターをインポート
from routers import (
    execute_router,
    debate_router,
    conductor_router,
    auto_route_router,
    settings_router,
    models_router,
    image_router,
    video_router,
    workspace_router,
)
from routers.analytics import router as analytics_router
from routers.explainability import router as explainability_router
from routers.benchmark import router as benchmark_router

app = FastAPI(title="Bedrock Parallel Executor")

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ルーターを登録
app.include_router(models_router)
app.include_router(execute_router)
app.include_router(debate_router)
app.include_router(conductor_router)
app.include_router(auto_route_router)
app.include_router(settings_router)
app.include_router(analytics_router)
app.include_router(explainability_router)
app.include_router(benchmark_router)
app.include_router(image_router)
app.include_router(video_router)
app.include_router(workspace_router)


@app.get("/")
async def read_root():
    """フロントエンドHTMLを返す"""
    try:
        with open("static/index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(content="<h1>Bedrock Parallel Executor API</h1><p>API is running.</p>")


@app.get("/health")
async def health_check():
    """ヘルスチェック"""
    return {"status": "healthy"}


def main():
    """エントリーポイント"""
    import uvicorn
    print("🚀 Bedrock Parallel Executor サーバーを起動します...")
    print("📍 http://localhost:8000")
    print("🔄 ホットリロード有効")
    print("-" * 60)
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        log_level="info",
        reload=True,
        reload_dirs=["."]
    )


if __name__ == "__main__":
    main()
