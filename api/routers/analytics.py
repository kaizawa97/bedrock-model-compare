"""
Analytics & Dashboard エンドポイント
コスト・パフォーマンス最適化ダッシュボード
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from services.analytics import (
    CostPerformanceAnalyzer,
    get_analytics_store,
    AnalyticsStore
)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


class BudgetUpdateRequest(BaseModel):
    """予算更新リクエスト"""
    daily_budget_usd: Optional[float] = None
    monthly_budget_usd: Optional[float] = None


class OptimalModelRequest(BaseModel):
    """最適モデル推奨リクエスト"""
    budget_constraint: Optional[float] = None
    latency_constraint: Optional[float] = None
    task_type: str = "general"


@router.get("/dashboard")
async def get_dashboard():
    """
    リアルタイムダッシュボードデータを取得
    - トークン数/コスト/レイテンシの可視化データ
    - 予算使用状況
    - モデル別内訳
    - 時間帯別トレンド
    """
    try:
        analyzer = CostPerformanceAnalyzer()
        return analyzer.get_realtime_dashboard()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tradeoff")
async def get_tradeoff_analysis(task_type: Optional[str] = None):
    """
    コスト vs 品質 vs 速度の3軸トレードオフ分析
    - 各モデルのスコアリング
    - 推奨モデル
    """
    try:
        analyzer = CostPerformanceAnalyzer()
        return analyzer.get_tradeoff_analysis(task_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimal-model")
async def get_optimal_model(request: OptimalModelRequest):
    """
    予算制約下での最適モデル自動推奨
    - 予算・レイテンシ制約を考慮
    - タスクタイプに最適なモデルを推奨
    """
    try:
        analyzer = CostPerformanceAnalyzer()
        return analyzer.get_optimal_model_recommendation(
            budget_constraint=request.budget_constraint,
            latency_constraint=request.latency_constraint,
            task_type=request.task_type
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/budget")
async def update_budget(request: BudgetUpdateRequest):
    """予算設定を更新"""
    try:
        store = get_analytics_store()
        
        if request.daily_budget_usd is not None:
            store.daily_budget_usd = request.daily_budget_usd
        if request.monthly_budget_usd is not None:
            store.monthly_budget_usd = request.monthly_budget_usd
        
        return {
            "success": True,
            "daily_budget_usd": store.daily_budget_usd,
            "monthly_budget_usd": store.monthly_budget_usd
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts")
async def get_alerts():
    """アラート一覧を取得"""
    try:
        store = get_analytics_store()
        return {
            "alerts": store.alerts[-20:],  # 最新20件
            "total_count": len(store.alerts)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/executions")
async def get_recent_executions(limit: int = 20):
    """
    最近の実行履歴を取得
    - 各モデルのプロンプトとレスポンス
    - コスト・レイテンシ情報
    """
    try:
        store = get_analytics_store()
        return {
            "executions": store.get_recent_executions(limit),
            "total_count": len(store.metrics)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/alerts")
async def clear_alerts():
    """アラートをクリア"""
    try:
        store = get_analytics_store()
        store.alerts = []
        return {"success": True, "message": "アラートをクリアしました"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
