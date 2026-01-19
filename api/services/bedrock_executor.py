#!/usr/bin/env python3
"""
AWS Bedrock並列実行ツール
複数の異なるBedrockモデルを並列実行して結果を比較
"""
import json
import time
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Dict, List, Any
import boto3
from botocore.exceptions import ClientError
from .pricing import calculate_cost, estimate_tokens


class BedrockParallelExecutor:
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

    def invoke_model(
        self,
        model_id: str,
        prompt: str,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        execution_id: int = 0,
        max_retries: int = 3
    ) -> Dict[str, Any]:
        """単一のモデル呼び出しを実行（リトライ機能付き）"""
        start_time = time.time()
        
        for attempt in range(max_retries):
            try:
                body = self._build_request_body(model_id, prompt, max_tokens, temperature)
                
                response = self.client.invoke_model(
                    modelId=model_id,
                    body=json.dumps(body)
                )

                response_body = json.loads(response["body"].read())
                output_text = self._parse_response(model_id, response_body)
                
                if isinstance(output_text, dict):
                    output_text = json.dumps(output_text, ensure_ascii=False, indent=2)

                elapsed_time = time.time() - start_time
                
                usage = response_body.get("usage", {})
                input_tokens = usage.get("input_tokens") or usage.get("prompt_tokens") or estimate_tokens(prompt)
                output_tokens = usage.get("output_tokens") or usage.get("completion_tokens") or estimate_tokens(output_text)
                
                cost_info = calculate_cost(model_id, input_tokens, output_tokens)

                return {
                    "execution_id": execution_id,
                    "model_id": model_id,
                    "success": True,
                    "output": output_text,
                    "elapsed_time": elapsed_time,
                    "timestamp": datetime.now().isoformat(),
                    "cost": cost_info
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

    def _build_request_body(self, model_id: str, prompt: str, max_tokens: int, temperature: float) -> dict:
        """モデルに応じてリクエストボディを構築"""
        if "anthropic.claude" in model_id or "us.anthropic.claude" in model_id or "global.anthropic.claude" in model_id:
            return {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature
            }
        elif "amazon.nova" in model_id or "us.amazon.nova" in model_id:
            return {
                "messages": [{"role": "user", "content": [{"text": prompt}]}],
                "inferenceConfig": {
                    "max_new_tokens": max_tokens,
                    "temperature": temperature
                }
            }
        elif "meta.llama" in model_id or "us.meta.llama" in model_id:
            return {
                "prompt": prompt,
                "max_gen_len": max_tokens,
                "temperature": temperature
            }
        else:
            return {
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": max_tokens,
                "temperature": temperature
            }

    def _parse_response(self, model_id: str, response_body: dict) -> str:
        """モデルに応じてレスポンスを解析"""
        if "anthropic.claude" in model_id or "us.anthropic.claude" in model_id or "global.anthropic.claude" in model_id:
            return response_body.get("content", [{}])[0].get("text", "")
        elif "amazon.nova" in model_id or "us.amazon.nova" in model_id:
            return response_body.get("output", {}).get("message", {}).get("content", [{}])[0].get("text", "")
        elif "meta.llama" in model_id or "us.meta.llama" in model_id:
            return response_body.get("generation", "")
        else:
            choices = response_body.get("choices", [])
            if choices:
                output_text = choices[0].get("message", {}).get("content", "")
                if not output_text:
                    output_text = choices[0].get("text", "")
                return output_text
            return str(response_body)

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

    def invoke_model_with_reasoning(
        self,
        model_id: str,
        prompt: str,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        execution_id: int = 0,
        enable_reasoning: bool = True,
        reasoning_budget_tokens: int = 5000,
        max_retries: int = 3
    ) -> Dict[str, Any]:
        """推論（拡張思考）モード対応のモデル呼び出し"""
        start_time = time.time()
        
        reasoning_supported = any(x in model_id for x in [
            "claude-sonnet-4", "claude-opus-4", "claude-3-7",
            "deepseek.r1", "kimi-k2-thinking"
        ])
        
        if not reasoning_supported or not enable_reasoning:
            return self.invoke_model(model_id, prompt, max_tokens, temperature, execution_id, max_retries)
        
        for attempt in range(max_retries):
            try:
                body = self._build_reasoning_request_body(model_id, prompt, max_tokens, reasoning_budget_tokens)
                
                response = self.client.invoke_model(
                    modelId=model_id,
                    body=json.dumps(body)
                )

                response_body = json.loads(response["body"].read())
                output_text, thinking_text = self._parse_reasoning_response(model_id, response_body)

                elapsed_time = time.time() - start_time
                
                usage = response_body.get("usage", {})
                input_tokens = usage.get("input_tokens") or usage.get("prompt_tokens") or estimate_tokens(prompt)
                output_tokens = usage.get("output_tokens") or usage.get("completion_tokens") or estimate_tokens(output_text)
                
                cost_info = calculate_cost(model_id, input_tokens, output_tokens)

                return {
                    "execution_id": execution_id,
                    "model_id": model_id,
                    "success": True,
                    "output": output_text,
                    "thinking": thinking_text,
                    "reasoning_enabled": True,
                    "elapsed_time": elapsed_time,
                    "timestamp": datetime.now().isoformat(),
                    "cost": cost_info
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

    def _build_reasoning_request_body(self, model_id: str, prompt: str, max_tokens: int, reasoning_budget_tokens: int) -> dict:
        """推論モード用のリクエストボディを構築"""
        if "anthropic.claude" in model_id or "us.anthropic.claude" in model_id:
            # Extended Thinking: max_tokens must be greater than thinking.budget_tokens
            effective_max_tokens = max(max_tokens, reasoning_budget_tokens + 1000)
            return {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": effective_max_tokens,
                "messages": [{"role": "user", "content": prompt}],
                "thinking": {
                    "type": "enabled",
                    "budget_tokens": reasoning_budget_tokens
                }
            }
        elif "deepseek.r1" in model_id:
            return {
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": max_tokens,
                "temperature": 0.7
            }
        else:
            return {
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": max_tokens,
                "temperature": 0.7
            }

    def _parse_reasoning_response(self, model_id: str, response_body: dict) -> tuple:
        """推論レスポンスを解析"""
        output_text = ""
        thinking_text = ""
        
        if "anthropic.claude" in model_id or "us.anthropic.claude" in model_id:
            content = response_body.get("content", [])
            for block in content:
                if block.get("type") == "thinking":
                    thinking_text = block.get("thinking", "")
                elif block.get("type") == "text":
                    output_text = block.get("text", "")
        elif "deepseek.r1" in model_id:
            choices = response_body.get("choices", [])
            if choices:
                message = choices[0].get("message", {})
                output_text = message.get("content", "")
                thinking_text = message.get("reasoning_content", "")
        else:
            choices = response_body.get("choices", [])
            if choices:
                output_text = choices[0].get("message", {}).get("content", "")
        
        return output_text, thinking_text

    def execute_parallel_models(
        self,
        model_ids: List[str],
        prompt: str,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        max_workers: int = 50
    ) -> List[Dict[str, Any]]:
        """複数の異なるモデルを並列実行"""
        results = []
        
        print(f"🚀 {len(model_ids)}個のモデルを並列実行します...")
        print(f"リージョン: {self.region}")
        print(f"プロンプト: {prompt[:50]}..." if len(prompt) > 50 else f"プロンプト: {prompt}")
        print("-" * 80)

        start_time = time.time()

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(
                    self.invoke_model,
                    model_id,
                    prompt,
                    max_tokens,
                    temperature,
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
                    output_preview = result["output"][:80].replace("\n", " ")
                    cost = result.get("cost", {}).get("total_cost", 0)
                    print(f"{status} [{model_short}]: {elapsed:.2f}秒 - ${cost:.6f} - {output_preview}...")
                else:
                    error_msg = result.get("error", "Unknown error")[:80]
                    print(f"{status} [{model_short}]: {elapsed:.2f}秒 - エラー: {error_msg}")

        total_time = time.time() - start_time
        
        print("-" * 80)
        print(f"✨ 完了しました！")
        print(f"総実行時間: {total_time:.2f}秒")
        print(f"成功: {sum(1 for r in results if r['success'])}/{len(model_ids)}")
        print(f"失敗: {sum(1 for r in results if not r['success'])}/{len(model_ids)}")
        
        if results:
            avg_time = sum(r["elapsed_time"] for r in results) / len(results)
            print(f"平均応答時間: {avg_time:.2f}秒")
            
            total_cost = sum(r.get("cost", {}).get("total_cost", 0) for r in results if r["success"])
            if total_cost > 0:
                print(f"💰 総コスト: ${total_cost:.6f} USD")

        return sorted(results, key=lambda x: x["execution_id"])

    def execute_parallel_models_with_reasoning(
        self,
        model_ids: List[str],
        prompt: str,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        max_workers: int = 50,
        reasoning_budget_tokens: int = 5000
    ) -> List[Dict[str, Any]]:
        """推論モード対応の並列実行"""
        results = []
        
        print(f"🧠 推論モードで{len(model_ids)}個のモデルを並列実行します...")
        print(f"   推論トークン予算: {reasoning_budget_tokens}")
        print("-" * 80)

        start_time = time.time()

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(
                    self.invoke_model_with_reasoning,
                    model_id,
                    prompt,
                    max_tokens,
                    temperature,
                    i,
                    True,
                    reasoning_budget_tokens
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
                    has_thinking = "🧠" if result.get("thinking") else ""
                    output_preview = result["output"][:60].replace("\n", " ")
                    print(f"{status}{has_thinking} [{model_short}]: {elapsed:.2f}秒 - {output_preview}...")
                else:
                    error_msg = result.get("error", "Unknown error")[:80]
                    print(f"{status} [{model_short}]: {elapsed:.2f}秒 - エラー: {error_msg}")

        total_time = time.time() - start_time
        print("-" * 80)
        print(f"✨ 完了！総実行時間: {total_time:.2f}秒")

        return sorted(results, key=lambda x: x["execution_id"])
