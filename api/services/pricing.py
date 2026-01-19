"""
AWS Bedrock モデルの料金情報
公式料金ページから取得: https://aws.amazon.com/bedrock/pricing/
価格は1000トークンあたりのUSD（US East (N. Virginia), US East (Ohio), US West (Oregon)リージョン）
最終更新: 2025年1月
"""

MODEL_PRICING = {
    # ===== Anthropic Claude =====
    
    # Claude 4.5シリーズ
    "us.anthropic.claude-sonnet-4-5-20250929-v1:0": {"input": 0.006, "output": 0.030},
    "anthropic.claude-sonnet-4-5-20250929-v1:0": {"input": 0.006, "output": 0.030},
    "global.anthropic.claude-sonnet-4-5-20250929-v1:0": {"input": 0.006, "output": 0.030},
    "us.anthropic.claude-opus-4-5-20251101-v1:0": {"input": 0.015, "output": 0.075},
    "anthropic.claude-opus-4-5-20251101-v1:0": {"input": 0.015, "output": 0.075},
    "global.anthropic.claude-opus-4-5-20251101-v1:0": {"input": 0.015, "output": 0.075},
    "us.anthropic.claude-haiku-4-5-20251001-v1:0": {"input": 0.001, "output": 0.005},
    "anthropic.claude-haiku-4-5-20251001-v1:0": {"input": 0.001, "output": 0.005},
    "global.anthropic.claude-haiku-4-5-20251001-v1:0": {"input": 0.001, "output": 0.005},
    
    # Claude 4シリーズ
    "us.anthropic.claude-sonnet-4-20250514-v1:0": {"input": 0.006, "output": 0.030},
    "anthropic.claude-sonnet-4-20250514-v1:0": {"input": 0.006, "output": 0.030},
    "global.anthropic.claude-sonnet-4-20250514-v1:0": {"input": 0.006, "output": 0.030},
    "us.anthropic.claude-opus-4-20250514-v1:0": {"input": 0.015, "output": 0.075},
    "anthropic.claude-opus-4-20250514-v1:0": {"input": 0.015, "output": 0.075},
    "us.anthropic.claude-opus-4-1-20250805-v1:0": {"input": 0.015, "output": 0.075},
    "anthropic.claude-opus-4-1-20250805-v1:0": {"input": 0.015, "output": 0.075},
    
    # Claude 3.7シリーズ
    "us.anthropic.claude-3-7-sonnet-20250219-v1:0": {"input": 0.006, "output": 0.030},
    "anthropic.claude-3-7-sonnet-20250219-v1:0": {"input": 0.006, "output": 0.030},
    
    # Claude 3.5シリーズ（公式料金）
    "us.anthropic.claude-3-5-sonnet-20241022-v2:0": {"input": 0.006, "output": 0.030},
    "anthropic.claude-3-5-sonnet-20241022-v2:0": {"input": 0.006, "output": 0.030},
    "us.anthropic.claude-3-5-sonnet-20240620-v1:0": {"input": 0.006, "output": 0.030},
    "anthropic.claude-3-5-sonnet-20240620-v1:0": {"input": 0.006, "output": 0.030},
    "us.anthropic.claude-3-5-haiku-20241022-v1:0": {"input": 0.001, "output": 0.005},
    "anthropic.claude-3-5-haiku-20241022-v1:0": {"input": 0.001, "output": 0.005},
    
    # Claude 3シリーズ（公式料金）
    "us.anthropic.claude-3-sonnet-20240229-v1:0": {"input": 0.003, "output": 0.015},
    "anthropic.claude-3-sonnet-20240229-v1:0": {"input": 0.003, "output": 0.015},
    "us.anthropic.claude-3-opus-20240229-v1:0": {"input": 0.015, "output": 0.075},
    "anthropic.claude-3-opus-20240229-v1:0": {"input": 0.015, "output": 0.075},
    "us.anthropic.claude-3-haiku-20240307-v1:0": {"input": 0.00025, "output": 0.00125},
    "anthropic.claude-3-haiku-20240307-v1:0": {"input": 0.00025, "output": 0.00125},
    
    # ===== Amazon =====
    "us.amazon.nova-premier-v1:0": {"input": 0.0024, "output": 0.012},
    "amazon.nova-premier-v1:0": {"input": 0.0024, "output": 0.012},
    "amazon.nova-pro-v1:0": {"input": 0.0008, "output": 0.0032},
    "amazon.nova-lite-v1:0": {"input": 0.00006, "output": 0.00024},
    "amazon.nova-micro-v1:0": {"input": 0.000035, "output": 0.00014},
    "us.amazon.nova-2-lite-v1:0": {"input": 0.00006, "output": 0.00024},
    "amazon.nova-2-lite-v1:0": {"input": 0.00006, "output": 0.00024},
    "us.amazon.nova-2-pro-v1:0": {"input": 0.0008, "output": 0.0032},  # プレビュー - 仮の価格
    "amazon.nova-2-pro-v1:0": {"input": 0.0008, "output": 0.0032},  # プレビュー - 仮の価格
    "amazon.titan-tg1-large": {"input": 0.0008, "output": 0.0008},
    
    # ===== Meta Llama =====
    
    # Llama 4シリーズ
    "us.meta.llama4-scout-17b-instruct-v1:0": {"input": 0.0003, "output": 0.0006},
    "meta.llama4-scout-17b-instruct-v1:0": {"input": 0.0003, "output": 0.0006},
    "us.meta.llama4-maverick-17b-instruct-v1:0": {"input": 0.0003, "output": 0.0006},
    "meta.llama4-maverick-17b-instruct-v1:0": {"input": 0.0003, "output": 0.0006},
    
    # Llama 3.3シリーズ
    "us.meta.llama3-3-70b-instruct-v1:0": {"input": 0.00099, "output": 0.00099},
    "meta.llama3-3-70b-instruct-v1:0": {"input": 0.00099, "output": 0.00099},
    
    # Llama 3.2シリーズ
    "us.meta.llama3-2-90b-instruct-v1:0": {"input": 0.002, "output": 0.002},
    "meta.llama3-2-90b-instruct-v1:0": {"input": 0.002, "output": 0.002},
    "us.meta.llama3-2-11b-instruct-v1:0": {"input": 0.00035, "output": 0.00035},
    "meta.llama3-2-11b-instruct-v1:0": {"input": 0.00035, "output": 0.00035},
    "us.meta.llama3-2-3b-instruct-v1:0": {"input": 0.00015, "output": 0.00015},
    "meta.llama3-2-3b-instruct-v1:0": {"input": 0.00015, "output": 0.00015},
    "us.meta.llama3-2-1b-instruct-v1:0": {"input": 0.0001, "output": 0.0001},
    "meta.llama3-2-1b-instruct-v1:0": {"input": 0.0001, "output": 0.0001},
    
    # Llama 3.1シリーズ
    "us.meta.llama3-1-70b-instruct-v1:0": {"input": 0.00099, "output": 0.00099},
    "meta.llama3-1-70b-instruct-v1:0": {"input": 0.00099, "output": 0.00099},
    "us.meta.llama3-1-8b-instruct-v1:0": {"input": 0.0003, "output": 0.0006},
    "meta.llama3-1-8b-instruct-v1:0": {"input": 0.0003, "output": 0.0006},
    
    # Llama 3シリーズ
    "meta.llama3-70b-instruct-v1:0": {"input": 0.00265, "output": 0.0035},
    "meta.llama3-8b-instruct-v1:0": {"input": 0.0003, "output": 0.0006},
    
    # ===== Mistral AI =====（公式料金）
    "mistral.mistral-large-3-675b-instruct": {"input": 0.0005, "output": 0.0015},
    "us.mistral.pixtral-large-2502-v1:0": {"input": 0.003, "output": 0.009},
    "mistral.pixtral-large-2502-v1:0": {"input": 0.003, "output": 0.009},
    "mistral.mistral-large-2402-v1:0": {"input": 0.004, "output": 0.012},
    "mistral.mistral-small-2402-v1:0": {"input": 0.001, "output": 0.003},
    "mistral.mixtral-8x7b-instruct-v0:1": {"input": 0.00045, "output": 0.0007},
    "mistral.mistral-7b-instruct-v0:2": {"input": 0.00015, "output": 0.0002},
    
    # Ministralシリーズ（公式料金）
    "mistral.ministral-3-14b-instruct": {"input": 0.0002, "output": 0.0002},
    "mistral.ministral-3-8b-instruct": {"input": 0.00015, "output": 0.00015},
    "mistral.ministral-3-3b-instruct": {"input": 0.0001, "output": 0.0001},
    
    # Magistral（公式料金）
    "mistral.magistral-small-2509": {"input": 0.0005, "output": 0.0015},
    
    # Voxtral（公式料金）
    "mistral.voxtral-small-24b-2507": {"input": 0.0001, "output": 0.0003},
    "mistral.voxtral-mini-3b-2507": {"input": 0.00004, "output": 0.00004},
    
    # ===== DeepSeek =====
    "us.deepseek.r1-v1:0": {"input": 0.00135, "output": 0.0054},
    "deepseek.r1-v1:0": {"input": 0.00135, "output": 0.0054},
    
    # ===== Cohere =====（公式料金）
    "cohere.command-r-plus-v1:0": {"input": 0.003, "output": 0.015},
    "cohere.command-r-v1:0": {"input": 0.0005, "output": 0.0015},
    
    # ===== AI21 Labs =====（公式料金）
    "ai21.jamba-1-5-large-v1:0": {"input": 0.002, "output": 0.008},
    "ai21.jamba-1-5-mini-v1:0": {"input": 0.0002, "output": 0.0004},
    
    # ===== Writer =====
    "writer.palmyra-x5-v1:0": {"input": 0.005, "output": 0.015},
    "writer.palmyra-x4-v1:0": {"input": 0.003, "output": 0.009},
    
    # ===== NVIDIA =====
    "nvidia.nemotron-nano-3-30b": {"input": 0.0005, "output": 0.0005},
    "nvidia.nemotron-nano-12b-v2": {"input": 0.0002, "output": 0.0002},
    "nvidia.nemotron-nano-9b-v2": {"input": 0.0002, "output": 0.0002},
    
    # ===== Google Gemma =====（公式料金）
    "google.gemma-3-27b-it": {"input": 0.00023, "output": 0.00038},
    "google.gemma-3-12b-it": {"input": 0.00009, "output": 0.00029},
    "google.gemma-3-4b-it": {"input": 0.00004, "output": 0.00008},
    
    # ===== Qwen =====
    "qwen.qwen3-vl-235b-a22b": {"input": 0.002, "output": 0.002},
    "qwen.qwen3-next-80b-a3b": {"input": 0.001, "output": 0.001},
    "qwen.qwen3-32b-v1:0": {"input": 0.0005, "output": 0.0005},
    "qwen.qwen3-coder-30b-a3b-v1:0": {"input": 0.0005, "output": 0.0005},
    
    # ===== OpenAI =====
    "openai.gpt-oss-120b-1:0": {"input": 0.002, "output": 0.002},
    "openai.gpt-oss-20b-1:0": {"input": 0.0003, "output": 0.0003},
    
    # ===== MiniMax =====
    "minimax.minimax-m2": {"input": 0.0005, "output": 0.0005},
    
    # ===== Moonshot AI =====
    "moonshot.kimi-k2-thinking": {"input": 0.001, "output": 0.001},
}


def calculate_cost(model_id: str, input_tokens: int, output_tokens: int) -> dict:
    """コストを計算"""
    pricing = MODEL_PRICING.get(model_id)
    
    if not pricing:
        return {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "input_cost": 0.0,
            "output_cost": 0.0,
            "total_cost": 0.0,
            "currency": "USD",
            "note": "料金情報なし（推定価格が未設定）"
        }
    
    input_cost = (input_tokens / 1000) * pricing["input"]
    output_cost = (output_tokens / 1000) * pricing["output"]
    total_cost = input_cost + output_cost
    
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "input_cost": round(input_cost, 6),
        "output_cost": round(output_cost, 6),
        "total_cost": round(total_cost, 6),
        "currency": "USD"
    }


def get_model_pricing(model_id: str) -> dict | None:
    """モデルの料金情報を取得"""
    pricing = MODEL_PRICING.get(model_id)
    if pricing:
        return {
            "model_id": model_id,
            "input_per_1k_tokens": pricing["input"],
            "output_per_1k_tokens": pricing["output"],
            "currency": "USD"
        }
    return None


def estimate_tokens(text: str) -> int:
    """テキストからトークン数を推定（簡易版）"""
    japanese_chars = sum(1 for c in text if ord(c) > 0x3000)
    english_chars = len(text) - japanese_chars
    
    estimated_tokens = (japanese_chars / 1.5) + (english_chars / 4)
    return int(estimated_tokens)
