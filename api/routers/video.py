"""
動画生成エンドポイント
"""
import asyncio
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models.requests import VideoGenerationRequest, VideoStatusRequest
from models.responses import VideoGenerationResponse, VideoStatusResponse
from services.video_generator import VideoParallelGenerator

router = APIRouter(prefix="/api", tags=["video"])


def get_s3_output_uri(request_uri: str | None) -> str:
    """S3出力URIを取得（リクエスト > 環境変数の優先順）"""
    if request_uri:
        return request_uri
    env_uri = os.getenv("VIDEO_S3_OUTPUT_URI", "")
    if not env_uri:
        raise HTTPException(
            status_code=400,
            detail="S3 output URI is required. Set VIDEO_S3_OUTPUT_URI in .env or provide s3_output_base_uri in the request."
        )
    return env_uri


@router.post("/generate-video", response_model=VideoGenerationResponse)
async def generate_video(request: VideoGenerationRequest):
    """動画生成ジョブを開始（非同期）"""
    try:
        s3_output_base_uri = get_s3_output_uri(request.s3_output_base_uri)

        print(f"📥 動画生成リクエスト受信: {len(request.model_ids)}個のモデル")
        print(f"   モデルID: {request.model_ids}")
        print(f"   プロンプト: {request.prompt[:50]}...")
        print(f"   S3出力先: {s3_output_base_uri}")

        generator = VideoParallelGenerator(region=request.region)

        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(
            None,
            generator.start_parallel_video_generation,
            request.model_ids,
            request.prompt,
            s3_output_base_uri,
            request.duration_seconds,
            request.fps,
            request.dimension,
            request.seed,
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
            "note": "動画生成は非同期で実行されます。invocation_arnを使用してステータスを確認してください。"
        }

        print(f"✅ 動画生成ジョブ開始: 成功={success_count}, 失敗={failed_count}")

        return VideoGenerationResponse(results=results, summary=summary)

    except Exception as e:
        import traceback
        print(f"❌ エラー発生:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/video-status", response_model=VideoStatusResponse)
async def get_video_status(request: VideoStatusRequest):
    """動画生成ジョブのステータスを確認"""
    try:
        print(f"📥 動画ステータス確認リクエスト受信: {len(request.invocation_arns)}件")

        generator = VideoParallelGenerator(region=request.region)
        statuses = []

        for arn in request.invocation_arns:
            status = generator.get_video_status(arn)
            statuses.append(status)

        completed = sum(1 for s in statuses if s.get("status") == "Completed")
        in_progress = sum(1 for s in statuses if s.get("status") == "InProgress")
        failed = sum(1 for s in statuses if s.get("status") == "Failed" or not s.get("success"))

        summary = {
            "total": len(statuses),
            "completed": completed,
            "in_progress": in_progress,
            "failed": failed
        }

        print(f"✅ ステータス確認完了: 完了={completed}, 進行中={in_progress}, 失敗={failed}")

        return VideoStatusResponse(statuses=statuses, summary=summary)

    except Exception as e:
        import traceback
        print(f"❌ エラー発生:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-video-stream")
async def generate_video_stream(request: VideoGenerationRequest):
    """動画生成ジョブを開始（ストリーミング）"""
    # ストリーミング開始前にS3 URIを検証
    s3_output_base_uri = get_s3_output_uri(request.s3_output_base_uri)

    async def generate():
        generator = None
        thread_executor = None
        futures_list = []

        try:
            generator = VideoParallelGenerator(region=request.region)

            yield f"data: {json.dumps({'type': 'start', 'total': len(request.model_ids)})}\n\n"

            thread_executor = ThreadPoolExecutor(max_workers=request.max_workers)

            from datetime import datetime
            futures = {}
            for i, model_id in enumerate(request.model_ids):
                model_short = model_id.replace(":", "-").replace(".", "-")
                s3_output_uri = f"{s3_output_base_uri}/{model_short}/{datetime.now().strftime('%Y%m%d-%H%M%S')}"

                future = thread_executor.submit(
                    generator.start_video_generation,
                    model_id,
                    request.prompt,
                    s3_output_uri,
                    request.duration_seconds,
                    request.fps,
                    request.dimension,
                    request.seed,
                    i
                )
                futures[future] = (i, model_id)

            futures_list = list(futures.keys())

            for future in as_completed(futures):
                try:
                    result = future.result(timeout=60)
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
