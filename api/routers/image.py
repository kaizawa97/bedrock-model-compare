"""
画像生成エンドポイント
"""
import asyncio
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models.requests import ImageGenerationRequest
from models.responses import ImageGenerationResponse
from services.image_generator import ImageParallelGenerator

router = APIRouter(prefix="/api", tags=["image"])


@router.post("/generate-images", response_model=ImageGenerationResponse)
async def generate_images(request: ImageGenerationRequest):
    """複数の画像生成モデルを並列実行"""
    try:
        print(f"📥 画像生成リクエスト受信: {len(request.model_ids)}個のモデル")
        print(f"   モデルID: {request.model_ids}")
        print(f"   プロンプト: {request.prompt[:50]}...")

        generator = ImageParallelGenerator(region=request.region)

        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(
            None,
            generator.generate_parallel_images,
            request.model_ids,
            request.prompt,
            request.negative_prompt,
            request.width,
            request.height,
            request.num_images,
            request.cfg_scale,
            request.seed,
            request.max_workers
        )

        success_count = sum(1 for r in results if r["success"])
        failed_count = sum(1 for r in results if not r["success"])
        avg_time = sum(r["elapsed_time"] for r in results) / len(results) if results else 0
        total_images = sum(r.get("num_images", 0) for r in results if r["success"])

        summary = {
            "total": len(results),
            "success": success_count,
            "failed": failed_count,
            "total_images": total_images,
            "average_time": round(avg_time, 2)
        }

        print(f"✅ 画像生成完了: 成功={success_count}, 失敗={failed_count}, 画像数={total_images}")

        return ImageGenerationResponse(results=results, summary=summary)

    except Exception as e:
        import traceback
        print(f"❌ エラー発生:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-images-stream")
async def generate_images_stream(request: ImageGenerationRequest):
    """複数の画像生成モデルを並列実行（ストリーミング）"""
    async def generate():
        generator = None
        thread_executor = None
        futures_list = []

        try:
            generator = ImageParallelGenerator(region=request.region)

            yield f"data: {json.dumps({'type': 'start', 'total': len(request.model_ids)})}\n\n"

            thread_executor = ThreadPoolExecutor(max_workers=request.max_workers)
            futures = {
                thread_executor.submit(
                    generator.generate_image,
                    model_id,
                    request.prompt,
                    request.negative_prompt,
                    request.width,
                    request.height,
                    request.num_images,
                    request.cfg_scale,
                    request.seed,
                    i
                ): (i, model_id) for i, model_id in enumerate(request.model_ids)
            }

            futures_list = list(futures.keys())

            for future in as_completed(futures):
                try:
                    result = future.result(timeout=120)
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
