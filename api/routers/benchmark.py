"""
Benchmark エンドポイント
ベンチマーク自動実行 & レポート生成
"""
import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from services.benchmark import BenchmarkSuite, get_benchmark_suite

router = APIRouter(prefix="/api/benchmark", tags=["benchmark"])


class BenchmarkRequest(BaseModel):
    """ベンチマーク実行リクエスト"""
    model_ids: List[str]
    task_ids: Optional[List[str]] = None
    categories: Optional[List[str]] = None
    region: str = "us-east-1"


class QuickBenchmarkRequest(BaseModel):
    """クイックベンチマークリクエスト"""
    model_ids: List[str]
    category: str = "simple_qa"
    region: str = "us-east-1"


@router.get("/tasks")
async def get_available_tasks():
    """
    利用可能なベンチマークタスク一覧を取得
    """
    try:
        suite = get_benchmark_suite()
        tasks = suite.get_available_tasks()
        
        # カテゴリ別にグループ化
        by_category = {}
        for task in tasks:
            cat = task["category"]
            if cat not in by_category:
                by_category[cat] = []
            by_category[cat].append(task)
        
        return {
            "tasks": tasks,
            "by_category": by_category,
            "categories": list(by_category.keys()),
            "total_count": len(tasks)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run")
async def run_benchmark(request: BenchmarkRequest):
    """
    ベンチマークを実行してレポートを生成
    
    リクエスト例:
    {
        "model_ids": [
            "amazon.nova-micro-v1:0",
            "amazon.nova-lite-v1:0",
            "us.anthropic.claude-3-5-haiku-20241022-v1:0"
        ],
        "categories": ["simple_qa", "code_generation"]
    }
    
    レスポンス:
    - summary: 実行サマリー
    - model_performance: モデル別パフォーマンス
    - category_analysis: カテゴリ別分析
    - rankings: 各軸でのランキング
    - recommendations: 推奨事項
    - detailed_results: 詳細結果
    """
    try:
        if not request.model_ids:
            raise HTTPException(status_code=400, detail="model_ids is required")
        
        suite = get_benchmark_suite(region=request.region)
        
        # 非同期で実行
        loop = asyncio.get_event_loop()
        report = await loop.run_in_executor(
            None,
            suite.run_benchmark,
            request.model_ids,
            request.task_ids,
            request.categories
        )
        
        return report
        
    except Exception as e:
        import traceback
        print(f"❌ ベンチマークエラー: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/quick")
async def run_quick_benchmark(request: QuickBenchmarkRequest):
    """
    クイックベンチマーク（単一カテゴリ）
    素早く特定カテゴリのモデル比較を行う
    """
    try:
        if not request.model_ids:
            raise HTTPException(status_code=400, detail="model_ids is required")
        
        suite = get_benchmark_suite(region=request.region)
        
        loop = asyncio.get_event_loop()
        report = await loop.run_in_executor(
            None,
            suite.run_benchmark,
            request.model_ids,
            None,
            [request.category]
        )
        
        # クイック版は簡略化したレスポンス
        return {
            "category": request.category,
            "summary": report["summary"],
            "rankings": report["rankings"]["overall"],
            "winner": report["rankings"]["overall"][0] if report["rankings"]["overall"] else None,
            "recommendations": report["recommendations"][:3]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/presets")
async def get_benchmark_presets():
    """
    ベンチマークプリセットを取得
    よく使われるモデル組み合わせ
    """
    return {
        "presets": [
            {
                "id": "budget_comparison",
                "name": "コスト重視比較",
                "description": "低コストモデルの比較",
                "model_ids": [
                    "amazon.nova-micro-v1:0",
                    "amazon.nova-lite-v1:0",
                    "google.gemma-3-4b-it"
                ],
                "recommended_categories": ["simple_qa", "documentation"]
            },
            {
                "id": "quality_comparison",
                "name": "品質重視比較",
                "description": "高品質モデルの比較",
                "model_ids": [
                    "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
                    "us.anthropic.claude-opus-4-5-20251101-v1:0",
                    "amazon.nova-pro-v1:0"
                ],
                "recommended_categories": ["reasoning", "analysis"]
            },
            {
                "id": "code_comparison",
                "name": "コード生成比較",
                "description": "コード生成に特化したモデル比較",
                "model_ids": [
                    "qwen.qwen3-coder-30b-a3b-v1:0",
                    "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
                    "amazon.nova-pro-v1:0"
                ],
                "recommended_categories": ["code_generation"]
            },
            {
                "id": "speed_comparison",
                "name": "速度重視比較",
                "description": "高速レスポンスモデルの比較",
                "model_ids": [
                    "amazon.nova-micro-v1:0",
                    "amazon.nova-lite-v1:0",
                    "us.anthropic.claude-3-5-haiku-20241022-v1:0"
                ],
                "recommended_categories": ["simple_qa"]
            },
            {
                "id": "all_rounder",
                "name": "総合比較",
                "description": "主要モデルの総合比較",
                "model_ids": [
                    "amazon.nova-micro-v1:0",
                    "amazon.nova-lite-v1:0",
                    "amazon.nova-pro-v1:0",
                    "us.anthropic.claude-3-5-haiku-20241022-v1:0",
                    "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
                ],
                "recommended_categories": None  # 全カテゴリ
            }
        ]
    }


@router.get("/history")
async def get_benchmark_history():
    """
    過去のベンチマーク結果履歴を取得
    （現在はインメモリのため、サーバー再起動でリセット）
    """
    try:
        suite = get_benchmark_suite()
        
        if not suite.results:
            return {
                "message": "ベンチマーク履歴がありません",
                "results": [],
                "total_count": 0
            }
        
        # 最新100件
        recent = suite.results[-100:]
        
        return {
            "results": [
                {
                    "task_id": r.task_id,
                    "model_id": r.model_id,
                    "success": r.success,
                    "latency": round(r.latency_seconds, 2),
                    "cost": round(r.cost_usd, 6),
                    "timestamp": r.timestamp.isoformat()
                }
                for r in recent
            ],
            "total_count": len(suite.results)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
