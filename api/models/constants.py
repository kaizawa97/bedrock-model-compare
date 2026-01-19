"""
定数定義（利用可能なモデル・リージョン）
AWS Bedrock list-foundation-models から取得（2025年1月更新）
※ 動作確認済みモデルのみ有効
※ INFERENCE_PROFILE必須のモデルは us. プレフィックス版を使用
"""

AVAILABLE_MODELS = [
    # =============================================================================
    # テキスト生成モデル (type: "text")
    # =============================================================================

    # ===== Anthropic Claude =====

    # Claude 4.5シリーズ（最新）
    {"id": "us.anthropic.claude-sonnet-4-5-20250929-v1:0", "name": "Claude Sonnet 4.5", "provider": "Anthropic", "type": "text"},
    # {"id": "anthropic.claude-sonnet-4-5-20250929-v1:0", "name": "Claude Sonnet 4.5", "provider": "Anthropic", "type": "text"},  # INFERENCE_PROFILE必須
    {"id": "us.anthropic.claude-opus-4-5-20251101-v1:0", "name": "Claude Opus 4.5", "provider": "Anthropic", "type": "text"},
    # {"id": "anthropic.claude-opus-4-5-20251101-v1:0", "name": "Claude Opus 4.5", "provider": "Anthropic", "type": "text"},  # INFERENCE_PROFILE必須
    {"id": "us.anthropic.claude-haiku-4-5-20251001-v1:0", "name": "Claude Haiku 4.5", "provider": "Anthropic", "type": "text"},
    # {"id": "anthropic.claude-haiku-4-5-20251001-v1:0", "name": "Claude Haiku 4.5", "provider": "Anthropic", "type": "text"},  # INFERENCE_PROFILE必須

    # Claude 4シリーズ
    {"id": "us.anthropic.claude-sonnet-4-20250514-v1:0", "name": "Claude Sonnet 4", "provider": "Anthropic", "type": "text"},
    # {"id": "anthropic.claude-sonnet-4-20250514-v1:0", "name": "Claude Sonnet 4", "provider": "Anthropic", "type": "text"},  # INFERENCE_PROFILE必須
    {"id": "us.anthropic.claude-opus-4-20250514-v1:0", "name": "Claude Opus 4", "provider": "Anthropic", "type": "text"},
    # {"id": "anthropic.claude-opus-4-20250514-v1:0", "name": "Claude Opus 4", "provider": "Anthropic", "type": "text"},  # INFERENCE_PROFILE必須
    {"id": "us.anthropic.claude-opus-4-1-20250805-v1:0", "name": "Claude Opus 4.1", "provider": "Anthropic", "type": "text"},
    # {"id": "anthropic.claude-opus-4-1-20250805-v1:0", "name": "Claude Opus 4.1", "provider": "Anthropic", "type": "text"},  # INFERENCE_PROFILE必須

    # Claude 3.7シリーズ
    {"id": "us.anthropic.claude-3-7-sonnet-20250219-v1:0", "name": "Claude 3.7 Sonnet", "provider": "Anthropic", "type": "text"},
    # {"id": "anthropic.claude-3-7-sonnet-20250219-v1:0", "name": "Claude 3.7 Sonnet", "provider": "Anthropic", "type": "text"},  # INFERENCE_PROFILE必須

    # Claude 3.5シリーズ
    {"id": "us.anthropic.claude-3-5-sonnet-20241022-v2:0", "name": "Claude 3.5 Sonnet v2", "provider": "Anthropic", "type": "text"},
    # {"id": "anthropic.claude-3-5-sonnet-20241022-v2:0", "name": "Claude 3.5 Sonnet v2", "provider": "Anthropic", "type": "text"},  # INFERENCE_PROFILE必須
    {"id": "us.anthropic.claude-3-5-sonnet-20240620-v1:0", "name": "Claude 3.5 Sonnet", "provider": "Anthropic", "type": "text"},
    {"id": "anthropic.claude-3-5-sonnet-20240620-v1:0", "name": "Claude 3.5 Sonnet", "provider": "Anthropic", "type": "text"},
    {"id": "us.anthropic.claude-3-5-haiku-20241022-v1:0", "name": "Claude 3.5 Haiku", "provider": "Anthropic", "type": "text"},
    # {"id": "anthropic.claude-3-5-haiku-20241022-v1:0", "name": "Claude 3.5 Haiku", "provider": "Anthropic", "type": "text"},  # INFERENCE_PROFILE必須

    # Claude 3シリーズ
    {"id": "us.anthropic.claude-3-sonnet-20240229-v1:0", "name": "Claude 3 Sonnet", "provider": "Anthropic", "type": "text"},
    {"id": "anthropic.claude-3-sonnet-20240229-v1:0", "name": "Claude 3 Sonnet", "provider": "Anthropic", "type": "text"},
    {"id": "us.anthropic.claude-3-opus-20240229-v1:0", "name": "Claude 3 Opus", "provider": "Anthropic", "type": "text"},
    # {"id": "anthropic.claude-3-opus-20240229-v1:0", "name": "Claude 3 Opus", "provider": "Anthropic", "type": "text"},  # INFERENCE_PROFILE必須
    {"id": "us.anthropic.claude-3-haiku-20240307-v1:0", "name": "Claude 3 Haiku", "provider": "Anthropic", "type": "text"},
    {"id": "anthropic.claude-3-haiku-20240307-v1:0", "name": "Claude 3 Haiku", "provider": "Anthropic", "type": "text"},

    # ===== Amazon =====
    {"id": "us.amazon.nova-premier-v1:0", "name": "Nova Premier", "provider": "Amazon", "type": "text"},
    # {"id": "amazon.nova-premier-v1:0", "name": "Nova Premier", "provider": "Amazon", "type": "text"},  # INFERENCE_PROFILE必須
    {"id": "amazon.nova-pro-v1:0", "name": "Nova Pro", "provider": "Amazon", "type": "text"},
    {"id": "amazon.nova-lite-v1:0", "name": "Nova Lite", "provider": "Amazon", "type": "text"},
    {"id": "amazon.nova-micro-v1:0", "name": "Nova Micro", "provider": "Amazon", "type": "text"},
    {"id": "us.amazon.nova-2-lite-v1:0", "name": "Nova 2 Lite", "provider": "Amazon", "type": "text"},
    {"id": "us.amazon.nova-2-pro-v1:0", "name": "Nova 2 Pro (Preview)", "provider": "Amazon", "type": "text"},
    # Nova Sonic系は音声処理モデル（Speech-to-Text/Text-to-Speech）- テキスト生成には使用不可
    # {"id": "amazon.nova-2-sonic-v1:0", "name": "Nova 2 Sonic", "provider": "Amazon", "type": "audio"},
    # {"id": "amazon.nova-sonic-v1:0", "name": "Nova Sonic", "provider": "Amazon", "type": "audio"},
    # {"id": "amazon.titan-tg1-large", "name": "Titan Text Large", "provider": "Amazon", "type": "text"},  # NOT_FOUND

    # ===== Meta Llama =====

    # Llama 4シリーズ
    {"id": "us.meta.llama4-scout-17b-instruct-v1:0", "name": "Llama 4 Scout 17B", "provider": "Meta", "type": "text"},
    # {"id": "meta.llama4-scout-17b-instruct-v1:0", "name": "Llama 4 Scout 17B", "provider": "Meta", "type": "text"},  # INFERENCE_PROFILE必須
    {"id": "us.meta.llama4-maverick-17b-instruct-v1:0", "name": "Llama 4 Maverick 17B", "provider": "Meta", "type": "text"},
    # {"id": "meta.llama4-maverick-17b-instruct-v1:0", "name": "Llama 4 Maverick 17B", "provider": "Meta", "type": "text"},  # INFERENCE_PROFILE必須

    # Llama 3.3シリーズ
    {"id": "us.meta.llama3-3-70b-instruct-v1:0", "name": "Llama 3.3 70B", "provider": "Meta", "type": "text"},
    # {"id": "meta.llama3-3-70b-instruct-v1:0", "name": "Llama 3.3 70B", "provider": "Meta", "type": "text"},  # INFERENCE_PROFILE必須

    # Llama 3.2シリーズ
    {"id": "us.meta.llama3-2-90b-instruct-v1:0", "name": "Llama 3.2 90B", "provider": "Meta", "type": "text"},
    # {"id": "meta.llama3-2-90b-instruct-v1:0", "name": "Llama 3.2 90B", "provider": "Meta", "type": "text"},  # INFERENCE_PROFILE必須
    {"id": "us.meta.llama3-2-11b-instruct-v1:0", "name": "Llama 3.2 11B", "provider": "Meta", "type": "text"},
    # {"id": "meta.llama3-2-11b-instruct-v1:0", "name": "Llama 3.2 11B", "provider": "Meta", "type": "text"},  # INFERENCE_PROFILE必須
    {"id": "us.meta.llama3-2-3b-instruct-v1:0", "name": "Llama 3.2 3B", "provider": "Meta", "type": "text"},
    # {"id": "meta.llama3-2-3b-instruct-v1:0", "name": "Llama 3.2 3B", "provider": "Meta", "type": "text"},  # INFERENCE_PROFILE必須
    {"id": "us.meta.llama3-2-1b-instruct-v1:0", "name": "Llama 3.2 1B", "provider": "Meta", "type": "text"},
    # {"id": "meta.llama3-2-1b-instruct-v1:0", "name": "Llama 3.2 1B", "provider": "Meta", "type": "text"},  # INFERENCE_PROFILE必須

    # Llama 3.1シリーズ
    {"id": "us.meta.llama3-1-70b-instruct-v1:0", "name": "Llama 3.1 70B", "provider": "Meta", "type": "text"},
    # {"id": "meta.llama3-1-70b-instruct-v1:0", "name": "Llama 3.1 70B", "provider": "Meta", "type": "text"},  # INFERENCE_PROFILE必須
    {"id": "us.meta.llama3-1-8b-instruct-v1:0", "name": "Llama 3.1 8B", "provider": "Meta", "type": "text"},
    # {"id": "meta.llama3-1-8b-instruct-v1:0", "name": "Llama 3.1 8B", "provider": "Meta", "type": "text"},  # INFERENCE_PROFILE必須

    # Llama 3シリーズ
    {"id": "meta.llama3-70b-instruct-v1:0", "name": "Llama 3 70B", "provider": "Meta", "type": "text"},
    {"id": "meta.llama3-8b-instruct-v1:0", "name": "Llama 3 8B", "provider": "Meta", "type": "text"},

    # ===== Mistral AI =====
    {"id": "mistral.mistral-large-3-675b-instruct", "name": "Mistral Large 3", "provider": "Mistral AI", "type": "text"},
    # {"id": "mistral.pixtral-large-2502-v1:0", "name": "Pixtral Large 25.02", "provider": "Mistral AI", "type": "text"},  # INFERENCE_PROFILE必須
    {"id": "mistral.mistral-large-2402-v1:0", "name": "Mistral Large 24.02", "provider": "Mistral AI", "type": "text"},
    {"id": "mistral.mistral-small-2402-v1:0", "name": "Mistral Small 24.02", "provider": "Mistral AI", "type": "text"},
    {"id": "mistral.mixtral-8x7b-instruct-v0:1", "name": "Mixtral 8x7B", "provider": "Mistral AI", "type": "text"},
    {"id": "mistral.mistral-7b-instruct-v0:2", "name": "Mistral 7B", "provider": "Mistral AI", "type": "text"},
    {"id": "mistral.ministral-3-14b-instruct", "name": "Ministral 14B", "provider": "Mistral AI", "type": "text"},
    {"id": "mistral.ministral-3-8b-instruct", "name": "Ministral 8B", "provider": "Mistral AI", "type": "text"},
    {"id": "mistral.ministral-3-3b-instruct", "name": "Ministral 3B", "provider": "Mistral AI", "type": "text"},
    {"id": "mistral.magistral-small-2509", "name": "Magistral Small", "provider": "Mistral AI", "type": "text"},
    {"id": "mistral.voxtral-small-24b-2507", "name": "Voxtral Small 24B", "provider": "Mistral AI", "type": "text"},
    {"id": "mistral.voxtral-mini-3b-2507", "name": "Voxtral Mini 3B", "provider": "Mistral AI", "type": "text"},

    # ===== DeepSeek =====
    {"id": "us.deepseek.r1-v1:0", "name": "DeepSeek-R1", "provider": "DeepSeek", "type": "text"},
    # {"id": "deepseek.r1-v1:0", "name": "DeepSeek-R1", "provider": "DeepSeek", "type": "text"},  # INFERENCE_PROFILE必須

    # ===== Cohere =====
    {"id": "cohere.command-r-plus-v1:0", "name": "Command R+", "provider": "Cohere", "type": "text"},
    {"id": "cohere.command-r-v1:0", "name": "Command R", "provider": "Cohere", "type": "text"},

    # ===== AI21 Labs =====
    {"id": "ai21.jamba-1-5-large-v1:0", "name": "Jamba 1.5 Large", "provider": "AI21 Labs", "type": "text"},
    {"id": "ai21.jamba-1-5-mini-v1:0", "name": "Jamba 1.5 Mini", "provider": "AI21 Labs", "type": "text"},

    # ===== Writer =====
    # {"id": "writer.palmyra-x5-v1:0", "name": "Palmyra X5", "provider": "Writer", "type": "text"},  # INFERENCE_PROFILE必須
    # {"id": "writer.palmyra-x4-v1:0", "name": "Palmyra X4", "provider": "Writer", "type": "text"},  # INFERENCE_PROFILE必須

    # ===== NVIDIA =====
    {"id": "nvidia.nemotron-nano-3-30b", "name": "Nemotron Nano 3 30B", "provider": "NVIDIA", "type": "text"},
    {"id": "nvidia.nemotron-nano-12b-v2", "name": "Nemotron Nano 12B v2", "provider": "NVIDIA", "type": "text"},
    {"id": "nvidia.nemotron-nano-9b-v2", "name": "Nemotron Nano 9B v2", "provider": "NVIDIA", "type": "text"},

    # ===== Google =====
    {"id": "google.gemma-3-27b-it", "name": "Gemma 3 27B", "provider": "Google", "type": "text"},
    {"id": "google.gemma-3-12b-it", "name": "Gemma 3 12B", "provider": "Google", "type": "text"},
    {"id": "google.gemma-3-4b-it", "name": "Gemma 3 4B", "provider": "Google", "type": "text"},

    # ===== Qwen =====
    {"id": "qwen.qwen3-vl-235b-a22b", "name": "Qwen3 VL 235B", "provider": "Qwen", "type": "text"},
    {"id": "qwen.qwen3-next-80b-a3b", "name": "Qwen3 Next 80B", "provider": "Qwen", "type": "text"},
    {"id": "qwen.qwen3-32b-v1:0", "name": "Qwen3 32B", "provider": "Qwen", "type": "text"},
    {"id": "qwen.qwen3-coder-30b-a3b-v1:0", "name": "Qwen3 Coder 30B", "provider": "Qwen", "type": "text"},

    # ===== OpenAI =====
    {"id": "openai.gpt-oss-120b-1:0", "name": "GPT OSS 120B", "provider": "OpenAI", "type": "text"},
    {"id": "openai.gpt-oss-20b-1:0", "name": "GPT OSS 20B", "provider": "OpenAI", "type": "text"},

    # ===== MiniMax =====
    {"id": "minimax.minimax-m2", "name": "MiniMax M2", "provider": "MiniMax", "type": "text"},

    # ===== Moonshot AI =====
    {"id": "moonshot.kimi-k2-thinking", "name": "Kimi K2 Thinking", "provider": "Moonshot AI", "type": "text"},

    # ===== TwelveLabs =====
    # {"id": "twelvelabs.pegasus-1-2-v1:0", "name": "Pegasus v1.2", "provider": "TwelveLabs", "type": "text"},  # INFERENCE_PROFILE必須

    # =============================================================================
    # 画像生成モデル (type: "image")
    # =============================================================================

    # ===== Amazon =====
    {"id": "amazon.titan-image-generator-v2:0", "name": "Titan Image Generator v2", "provider": "Amazon", "type": "image"},
    {"id": "amazon.nova-canvas-v1:0", "name": "Nova Canvas", "provider": "Amazon", "type": "image"},

    # ===== Stability AI =====
    # 注: Stability AIの画像編集モデルは全てINFERENCE_PROFILE必須
    # {"id": "stability.stable-image-core-v1:0", "name": "Stable Image Core", "provider": "Stability AI", "type": "image"},  # INFERENCE_PROFILE必須
    # {"id": "stability.stable-image-ultra-v1:0", "name": "Stable Image Ultra", "provider": "Stability AI", "type": "image"},  # INFERENCE_PROFILE必須
    # {"id": "stability.stable-creative-upscale-v1:0", "name": "Stable Image Creative Upscale", "provider": "Stability AI", "type": "image"},  # INFERENCE_PROFILE必須
    # {"id": "stability.stable-conservative-upscale-v1:0", "name": "Stable Image Conservative Upscale", "provider": "Stability AI", "type": "image"},  # INFERENCE_PROFILE必須
    # {"id": "stability.stable-fast-upscale-v1:0", "name": "Stable Image Fast Upscale", "provider": "Stability AI", "type": "image"},  # INFERENCE_PROFILE必須
    # {"id": "stability.stable-image-inpaint-v1:0", "name": "Stable Image Inpaint", "provider": "Stability AI", "type": "image"},  # INFERENCE_PROFILE必須
    # {"id": "stability.stable-outpaint-v1:0", "name": "Stable Image Outpaint", "provider": "Stability AI", "type": "image"},  # INFERENCE_PROFILE必須
    # {"id": "stability.stable-image-erase-object-v1:0", "name": "Stable Image Erase Object", "provider": "Stability AI", "type": "image"},  # INFERENCE_PROFILE必須
    # {"id": "stability.stable-image-search-replace-v1:0", "name": "Stable Image Search and Replace", "provider": "Stability AI", "type": "image"},  # INFERENCE_PROFILE必須
    # {"id": "stability.stable-image-search-recolor-v1:0", "name": "Stable Image Search and Recolor", "provider": "Stability AI", "type": "image"},  # INFERENCE_PROFILE必須
    # {"id": "stability.stable-image-remove-background-v1:0", "name": "Stable Image Remove Background", "provider": "Stability AI", "type": "image"},  # INFERENCE_PROFILE必須
    # {"id": "stability.stable-image-control-sketch-v1:0", "name": "Stable Image Control Sketch", "provider": "Stability AI", "type": "image"},  # INFERENCE_PROFILE必須
    # {"id": "stability.stable-image-control-structure-v1:0", "name": "Stable Image Control Structure", "provider": "Stability AI", "type": "image"},  # INFERENCE_PROFILE必須
    # {"id": "stability.stable-image-style-guide-v1:0", "name": "Stable Image Style Guide", "provider": "Stability AI", "type": "image"},  # INFERENCE_PROFILE必須
    # {"id": "stability.stable-style-transfer-v1:0", "name": "Stable Image Style Transfer", "provider": "Stability AI", "type": "image"},  # INFERENCE_PROFILE必須

    # =============================================================================
    # 動画生成モデル (type: "video")
    # =============================================================================

    # ===== Amazon =====
    {"id": "amazon.nova-reel-v1:0", "name": "Nova Reel", "provider": "Amazon", "type": "video"},
    {"id": "amazon.nova-reel-v1:1", "name": "Nova Reel v1.1", "provider": "Amazon", "type": "video"},
]

AVAILABLE_REGIONS = [
    {"id": "us-east-1", "name": "US East (N. Virginia)"},
    {"id": "us-west-2", "name": "US West (Oregon)"},
    {"id": "ap-northeast-1", "name": "Asia Pacific (Tokyo)"},
    {"id": "ap-southeast-1", "name": "Asia Pacific (Singapore)"},
    {"id": "eu-west-1", "name": "Europe (Ireland)"},
    {"id": "eu-central-1", "name": "Europe (Frankfurt)"},
]
