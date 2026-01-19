"""
Auto Router エンドポイント
"""
import asyncio
from fastapi import APIRouter, HTTPException

from models.requests import AutoRouteRequest, AutoExecuteRequest
from services.auto_router import BedrockAutoRouter
from services.bedrock_executor import BedrockParallelExecutor
from services.analytics import get_analytics_store

router = APIRouter(prefix="/api", tags=["auto-route"])


@router.post("/auto-route")
async def auto_route(request: AutoRouteRequest):
    """
    プロンプトから最適なモデルを自動選択
    実行はせず、ルーティング結果のみを返す
    """
    try:
        auto_router = BedrockAutoRouter()
        result = auto_router.route(request.prompt, request.context, request.criteria)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auto-execute")
async def auto_execute(request: AutoExecuteRequest):
    """
    Auto Routerで選択したモデルで実行
    オプションで代替案とも比較
    """
    try:
        # 1. 最適なモデルを選択
        auto_router = BedrockAutoRouter()
        routing = auto_router.route(request.prompt, criteria=request.criteria)
        
        print(f"🎯 Auto Router選択: {routing['selected_model']}")
        print(f"   タスクタイプ: {routing['task_type']}")
        print(f"   理由: {routing['reason']}")
        
        # 2. 実行するモデルリストを作成
        model_ids = [routing['selected_model']]
        
        if request.compare_with_alternatives:
            for alt in routing['alternatives']:
                model_ids.append(alt['model_id'])
        
        # 3. 並列実行
        executor = BedrockParallelExecutor(region=request.region)
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(
            None,
            executor.execute_parallel_models,
            model_ids,
            request.prompt,
            request.max_tokens,
            request.temperature,
            len(model_ids)
        )
        
        # 4. ルーティング情報を追加
        # メトリクスを記録
        store = get_analytics_store()
        for result in results:
            store.add_from_result(result, routing['task_type'])
        
        return {
            "routing": routing,
            "results": results,
            "summary": {
                "total": len(results),
                "success": sum(1 for r in results if r["success"]),
                "primary_result": results[0] if results else None
            }
        }
        
    except Exception as e:
        import traceback
        print(f"❌ エラー: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))
