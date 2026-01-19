#!/usr/bin/env python3
"""
AWS Bedrock 動画生成サービス
Nova Reel は非同期生成のためStartAsyncInvokeを使用
"""
import json
import time
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Dict, List, Any, Optional
import boto3
from botocore.exceptions import ClientError


class VideoParallelGenerator:
    def __init__(self, region: str = "us-east-1"):
        self.region = region

        bearer_token = os.environ.get("AWS_BEARER_TOKEN_BEDROCK")

        if bearer_token:
            print(f"🔑 Bearer Token認証を使用します (リージョン: {region})")
            os.environ["AWS_SESSION_TOKEN"] = bearer_token
            os.environ.setdefault("AWS_ACCESS_KEY_ID", "dummy")
            os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "dummy")
        else:
            print(f"🔑 IAM認証を使用します (リージョン: {region})")

        self.client = boto3.client(
            service_name="bedrock-runtime",
            region_name=region
        )

    def start_video_generation(
        self,
        model_id: str,
        prompt: str,
        s3_output_uri: str,
        duration_seconds: int = 6,
        fps: int = 24,
        dimension: str = "1280x720",
        seed: Optional[int] = None,
        execution_id: int = 0,
        max_retries: int = 3
    ) -> Dict[str, Any]:
        """動画生成を開始（非同期）"""
        start_time = time.time()

        for attempt in range(max_retries):
            try:
                body = self._build_request_body(
                    model_id, prompt, duration_seconds, fps, dimension, seed
                )

                # Nova Reelは非同期実行
                response = self.client.start_async_invoke(
                    modelId=model_id,
                    modelInput=body,
                    outputDataConfig={
                        "s3OutputDataConfig": {
                            "s3Uri": s3_output_uri
                        }
                    }
                )

                invocation_arn = response.get("invocationArn", "")
                elapsed_time = time.time() - start_time

                return {
                    "execution_id": execution_id,
                    "model_id": model_id,
                    "success": True,
                    "invocation_arn": invocation_arn,
                    "s3_output_uri": s3_output_uri,
                    "status": "IN_PROGRESS",
                    "duration_seconds": duration_seconds,
                    "dimension": dimension,
                    "elapsed_time": elapsed_time,
                    "timestamp": datetime.now().isoformat()
                }

            except ClientError as e:
                error_code = e.response.get("Error", {}).get("Code", "Unknown")

                if error_code in ["ThrottlingException", "TooManyRequestsException"] and attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 2
                    print(f"⚠️  [{model_id.split('.')[-1][:20]}] レート制限 - {wait_time}秒後にリトライ")
                    time.sleep(wait_time)
                    continue

                return self._create_error_response(execution_id, model_id, e, start_time)
            except Exception as e:
                return {
                    "execution_id": execution_id,
                    "model_id": model_id,
                    "success": False,
                    "error": str(e),
                    "error_code": "UnknownError",
                    "elapsed_time": time.time() - start_time,
                    "timestamp": datetime.now().isoformat()
                }

        return {
            "execution_id": execution_id,
            "model_id": model_id,
            "success": False,
            "error": "Max retries exceeded",
            "error_code": "MaxRetriesExceeded",
            "elapsed_time": time.time() - start_time,
            "timestamp": datetime.now().isoformat()
        }

    def get_video_status(self, invocation_arn: str) -> Dict[str, Any]:
        """動画生成のステータスを確認"""
        try:
            response = self.client.get_async_invoke(
                invocationArn=invocation_arn
            )

            status = response.get("status", "UNKNOWN")
            output_location = None

            if status == "Completed":
                output_config = response.get("outputDataConfig", {})
                s3_config = output_config.get("s3OutputDataConfig", {})
                output_location = s3_config.get("s3Uri", "")

            return {
                "success": True,
                "invocation_arn": invocation_arn,
                "status": status,
                "output_location": output_location,
                "failure_message": response.get("failureMessage", ""),
                "submit_time": str(response.get("submitTime", "")),
                "end_time": str(response.get("endTime", ""))
            }

        except Exception as e:
            return {
                "success": False,
                "invocation_arn": invocation_arn,
                "error": str(e)
            }

    def _build_request_body(
        self, model_id: str, prompt: str,
        duration_seconds: int, fps: int, dimension: str, seed: Optional[int]
    ) -> dict:
        """モデルに応じてリクエストボディを構築"""
        if "nova-reel" in model_id:
            body = {
                "taskType": "TEXT_VIDEO",
                "textToVideoParams": {
                    "text": prompt
                },
                "videoGenerationConfig": {
                    "durationSeconds": duration_seconds,
                    "fps": fps,
                    "dimension": dimension
                }
            }
            if seed is not None:
                body["videoGenerationConfig"]["seed"] = seed
            return body
        else:
            return {
                "prompt": prompt,
                "duration_seconds": duration_seconds
            }

    def _create_error_response(self, execution_id: int, model_id: str, e: ClientError, start_time: float) -> dict:
        """エラーレスポンスを作成"""
        error_detail = e.response.get("Error", {})
        error_code = error_detail.get("Code", "Unknown")
        error_message = error_detail.get("Message", str(e))

        return {
            "execution_id": execution_id,
            "model_id": model_id,
            "success": False,
            "error": f"{error_code}: {error_message}",
            "error_code": error_code,
            "elapsed_time": time.time() - start_time,
            "timestamp": datetime.now().isoformat()
        }

    def start_parallel_video_generation(
        self,
        model_ids: List[str],
        prompt: str,
        s3_output_base_uri: str,
        duration_seconds: int = 6,
        fps: int = 24,
        dimension: str = "1280x720",
        seed: Optional[int] = None,
        max_workers: int = 5
    ) -> List[Dict[str, Any]]:
        """複数の動画生成モデルを並列で開始"""
        results = []

        print(f"🎬 {len(model_ids)}個の動画生成モデルを並列実行します...")
        print(f"リージョン: {self.region}")
        print(f"プロンプト: {prompt[:50]}..." if len(prompt) > 50 else f"プロンプト: {prompt}")
        print(f"動画長さ: {duration_seconds}秒, 解像度: {dimension}")
        print("-" * 80)

        start_time = time.time()

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {}
            for i, model_id in enumerate(model_ids):
                # 各モデルに固有のS3出力パスを設定
                model_short = model_id.replace(":", "-").replace(".", "-")
                s3_output_uri = f"{s3_output_base_uri}/{model_short}/{datetime.now().strftime('%Y%m%d-%H%M%S')}"

                futures[executor.submit(
                    self.start_video_generation,
                    model_id,
                    prompt,
                    s3_output_uri,
                    duration_seconds,
                    fps,
                    dimension,
                    seed,
                    i
                )] = (i, model_id)

            for future in as_completed(futures):
                result = future.result()
                results.append(result)

                status = "✅" if result["success"] else "❌"
                model_id = result["model_id"]
                elapsed = result["elapsed_time"]
                model_short = model_id.split('.')[-1][:30]

                if result["success"]:
                    job_status = result.get("status", "UNKNOWN")
                    print(f"{status} [{model_short}]: {elapsed:.2f}秒 - ジョブ開始 ({job_status})")
                else:
                    error_msg = result.get("error", "Unknown error")[:80]
                    print(f"{status} [{model_short}]: {elapsed:.2f}秒 - エラー: {error_msg}")

        total_time = time.time() - start_time

        print("-" * 80)
        print(f"🎬 ジョブ開始完了！")
        print(f"総実行時間: {total_time:.2f}秒")
        print(f"成功: {sum(1 for r in results if r['success'])}/{len(model_ids)}")
        print("※ 動画生成は非同期で実行されます。ステータスを確認してください。")

        return sorted(results, key=lambda x: x["execution_id"])
