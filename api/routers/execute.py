"""
並列実行エンドポイント
"""
import asyncio
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models.requests import ExecutionRequest, ExecutionRequestWithReasoning
from models.responses import ExecutionResponse
from services.bedrock_executor import BedrockParallelExecutor
from services.analytics import get_analytics_store

router = APIRouter(prefix="/api", tags=["execute"])


@router.post("/execute", response_model=ExecutionResponse)
async def execute_parallel(request: ExecutionRequest):
    """複数モデルを並列実行"""
    try:
        print(f"📥 リクエスト受信: {len(request.model_ids)}個のモデル")
        print(f"   モデルID: {request.model_ids}")
        print(f"   プロンプト: {request.prompt[:50]}...")
        
        executor = BedrockParallelExecutor(region=request.region)
        
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(
            None,
            executor.execute_parallel_models,
            request.model_ids,
            request.prompt,
            request.max_tokens,
            request.temperature,
            request.max_workers
        )
        
        success_count = sum(1 for r in results if r["success"])
        failed_count = sum(1 for r in results if not r["success"])
        avg_time = sum(r["elapsed_time"] for r in results) / len(results) if results else 0
        
        summary = {
            "total": len(results),
            "success": success_count,
            "failed": failed_count,
            "average_time": round(avg_time, 2)
        }
        
        # メトリクスを記録
        store = get_analytics_store()
        for result in results:
            store.add_from_result(result, "general", request.prompt)
        
        print(f"✅ 実行完了: 成功={success_count}, 失敗={failed_count}")
        
        return ExecutionResponse(results=results, summary=summary)
        
    except Exception as e:
        import traceback
        print(f"❌ エラー発生:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/execute-stream")
async def execute_parallel_stream(request: ExecutionRequest):
    """複数モデルを並列実行（ストリーミング）"""
    async def generate():
        executor = None
        thread_executor = None
        futures_list = []
        
        try:
            executor = BedrockParallelExecutor(region=request.region)
            
            yield f"data: {json.dumps({'type': 'start', 'total': len(request.model_ids)})}\n\n"
            
            thread_executor = ThreadPoolExecutor(max_workers=request.max_workers)
            futures = {
                thread_executor.submit(
                    executor.invoke_model,
                    model_id,
                    request.prompt,
                    request.max_tokens,
                    request.temperature,
                    i
                ): (i, model_id) for i, model_id in enumerate(request.model_ids)
            }
            
            futures_list = list(futures.keys())
            
            for future in as_completed(futures):
                try:
                    result = future.result(timeout=1)
                    yield f"data: {json.dumps({'type': 'result', 'data': result})}\n\n"
                    await asyncio.sleep(0)
                except TimeoutError:
                    print(f"⚠️ タスクタイムアウト")
                    continue
                except Exception as e:
                    print(f"⚠️ タスクエラー: {e}")
                    continue
            
            yield f"data: {json.dumps({'type': 'complete'})}\n\n"
            
        except asyncio.CancelledError:
            print("🛑 ストリーミングがキャンセルされました")
            for future in futures_list:
                future.cancel()
            if thread_executor:
                thread_executor.shutdown(wait=False, cancel_futures=True)
            raise
        except GeneratorExit:
            print("🛑 クライアントが切断しました")
            for future in futures_list:
                future.cancel()
            if thread_executor:
                thread_executor.shutdown(wait=False, cancel_futures=True)
            raise
        except Exception as e:
            print(f"❌ ストリーミングエラー: {e}")
            for future in futures_list:
                future.cancel()
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            print("🧹 クリーンアップ中...")
            for future in futures_list:
                if not future.done():
                    future.cancel()
            if thread_executor:
                thread_executor.shutdown(wait=False, cancel_futures=True)
            print("✅ クリーンアップ完了")
    
    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/execute-with-reasoning", response_model=ExecutionResponse)
async def execute_with_reasoning(request: ExecutionRequestWithReasoning):
    """推論モードのオン・オフに対応した並列実行"""
    try:
        print(f"📥 リクエスト受信: {len(request.model_ids)}個のモデル")
        print(f"   推論モード: {'ON' if request.enable_reasoning else 'OFF'}")
        
        executor = BedrockParallelExecutor(region=request.region)
        loop = asyncio.get_event_loop()
        
        if request.enable_reasoning:
            results = await loop.run_in_executor(
                None,
                executor.execute_parallel_models_with_reasoning,
                request.model_ids,
                request.prompt,
                request.max_tokens,
                request.temperature,
                request.max_workers,
                request.reasoning_budget_tokens
            )
        else:
            results = await loop.run_in_executor(
                None,
                executor.execute_parallel_models,
                request.model_ids,
                request.prompt,
                request.max_tokens,
                request.temperature,
                request.max_workers
            )
        
        success_count = sum(1 for r in results if r["success"])
        failed_count = sum(1 for r in results if not r["success"])
        avg_time = sum(r["elapsed_time"] for r in results) / len(results) if results else 0
        
        summary = {
            "total": len(results),
            "success": success_count,
            "failed": failed_count,
            "average_time": round(avg_time, 2),
            "reasoning_enabled": request.enable_reasoning
        }
        
        # メトリクスを記録
        store = get_analytics_store()
        for result in results:
            store.add_from_result(result, "general", request.prompt)
        
        return ExecutionResponse(results=results, summary=summary)
        
    except Exception as e:
        import traceback
        print(f"❌ エラー: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))
