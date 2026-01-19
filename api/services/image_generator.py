#!/usr/bin/env python3
"""
AWS Bedrock 画像生成サービス
"""
import json
import time
import os
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Dict, List, Any, Optional
import boto3
from botocore.exceptions import ClientError


class ImageParallelGenerator:
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

    def generate_image(
        self,
        model_id: str,
        prompt: str,
        negative_prompt: str = "",
        width: int = 1024,
        height: int = 1024,
        num_images: int = 1,
        cfg_scale: float = 7.0,
        seed: Optional[int] = None,
        execution_id: int = 0,
        max_retries: int = 3
    ) -> Dict[str, Any]:
        """単一の画像生成モデル呼び出し"""
        start_time = time.time()

        for attempt in range(max_retries):
            try:
                body = self._build_request_body(
                    model_id, prompt, negative_prompt,
                    width, height, num_images, cfg_scale, seed
                )

                response = self.client.invoke_model(
                    modelId=model_id,
                    body=json.dumps(body)
                )

                response_body = json.loads(response["body"].read())
                images = self._parse_response(model_id, response_body)

                elapsed_time = time.time() - start_time

                return {
                    "execution_id": execution_id,
                    "model_id": model_id,
                    "success": True,
                    "images": images,
                    "num_images": len(images),
                    "width": width,
                    "height": height,
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

    def _build_request_body(
        self, model_id: str, prompt: str, negative_prompt: str,
        width: int, height: int, num_images: int, cfg_scale: float, seed: Optional[int]
    ) -> dict:
        """モデルに応じてリクエストボディを構築"""
        if "titan-image" in model_id:
            body = {
                "taskType": "TEXT_IMAGE",
                "textToImageParams": {
                    "text": prompt
                },
                "imageGenerationConfig": {
                    "numberOfImages": num_images,
                    "height": height,
                    "width": width,
                    "cfgScale": cfg_scale
                }
            }
            if negative_prompt:
                body["textToImageParams"]["negativeText"] = negative_prompt
            if seed is not None:
                body["imageGenerationConfig"]["seed"] = seed
            return body

        elif "nova-canvas" in model_id:
            body = {
                "taskType": "TEXT_IMAGE",
                "textToImageParams": {
                    "text": prompt
                },
                "imageGenerationConfig": {
                    "numberOfImages": num_images,
                    "height": height,
                    "width": width,
                    "cfgScale": cfg_scale
                }
            }
            if negative_prompt:
                body["textToImageParams"]["negativeText"] = negative_prompt
            if seed is not None:
                body["imageGenerationConfig"]["seed"] = seed
            return body

        elif "stability" in model_id:
            body = {
                "prompt": prompt,
                "mode": "text-to-image",
                "output_format": "png",
                "aspect_ratio": self._get_aspect_ratio(width, height)
            }
            if negative_prompt:
                body["negative_prompt"] = negative_prompt
            if seed is not None:
                body["seed"] = seed
            return body

        else:
            # デフォルト形式
            return {
                "prompt": prompt,
                "num_images": num_images,
                "width": width,
                "height": height
            }

    def _get_aspect_ratio(self, width: int, height: int) -> str:
        """アスペクト比を計算"""
        ratio = width / height
        if abs(ratio - 1.0) < 0.1:
            return "1:1"
        elif abs(ratio - 16/9) < 0.1:
            return "16:9"
        elif abs(ratio - 9/16) < 0.1:
            return "9:16"
        elif abs(ratio - 4/3) < 0.1:
            return "4:3"
        elif abs(ratio - 3/4) < 0.1:
            return "3:4"
        else:
            return "1:1"

    def _parse_response(self, model_id: str, response_body: dict) -> List[str]:
        """レスポンスからBase64画像を抽出"""
        images = []

        if "titan-image" in model_id or "nova-canvas" in model_id:
            images_data = response_body.get("images", [])
            images = images_data

        elif "stability" in model_id:
            images_data = response_body.get("images", [])
            images = images_data
            if not images and "image" in response_body:
                images = [response_body["image"]]

        else:
            # デフォルト
            if "images" in response_body:
                images = response_body["images"]
            elif "image" in response_body:
                images = [response_body["image"]]

        return images

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

    def generate_parallel_images(
        self,
        model_ids: List[str],
        prompt: str,
        negative_prompt: str = "",
        width: int = 1024,
        height: int = 1024,
        num_images: int = 1,
        cfg_scale: float = 7.0,
        seed: Optional[int] = None,
        max_workers: int = 10
    ) -> List[Dict[str, Any]]:
        """複数の画像生成モデルを並列実行"""
        results = []

        print(f"🎨 {len(model_ids)}個の画像生成モデルを並列実行します...")
        print(f"リージョン: {self.region}")
        print(f"プロンプト: {prompt[:50]}..." if len(prompt) > 50 else f"プロンプト: {prompt}")
        print(f"画像サイズ: {width}x{height}")
        print("-" * 80)

        start_time = time.time()

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(
                    self.generate_image,
                    model_id,
                    prompt,
                    negative_prompt,
                    width,
                    height,
                    num_images,
                    cfg_scale,
                    seed,
                    i
                ): (i, model_id) for i, model_id in enumerate(model_ids)
            }

            for future in as_completed(futures):
                result = future.result()
                results.append(result)

                status = "✅" if result["success"] else "❌"
                model_id = result["model_id"]
                elapsed = result["elapsed_time"]
                model_short = model_id.split('.')[-1][:30]

                if result["success"]:
                    num_imgs = result.get("num_images", 0)
                    print(f"{status} [{model_short}]: {elapsed:.2f}秒 - {num_imgs}枚生成")
                else:
                    error_msg = result.get("error", "Unknown error")[:80]
                    print(f"{status} [{model_short}]: {elapsed:.2f}秒 - エラー: {error_msg}")

        total_time = time.time() - start_time

        print("-" * 80)
        print(f"🎨 完了しました！")
        print(f"総実行時間: {total_time:.2f}秒")
        print(f"成功: {sum(1 for r in results if r['success'])}/{len(model_ids)}")

        return sorted(results, key=lambda x: x["execution_id"])
