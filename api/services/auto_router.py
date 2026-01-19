"""
Bedrock Auto Router - インテリジェントなモデル自動選択
Cursor/Copilotスタイルの自動ルーティング実装
"""
from typing import Dict, List, Optional
from .pricing import MODEL_PRICING, estimate_tokens


class TaskClassifier:
    """タスクタイプを分類"""
    
    @staticmethod
    def classify(prompt: str, context: Optional[Dict] = None) -> str:
        """
        プロンプトからタスクタイプを分類
        
        Returns:
            タスクタイプ: simple_qa, code_generation, reasoning, 
                         brainstorming, documentation, analysis, general
        """
        prompt_lower = prompt.lower()
        
        # 簡単なQA（短い質問）
        if len(prompt) < 100 and any(word in prompt_lower for word in 
                ['what is', 'who is', 'when', 'where', 'how many', '何', 'いつ', 'どこ']):
            return "simple_qa"
        
        # コード生成
        code_keywords = ['code', 'function', 'implement', 'class', 'def ', 'const ', 
                        'let ', 'import', 'コード', '実装', '関数', 'プログラム']
        if any(word in prompt_lower for word in code_keywords):
            return "code_generation"
        
        # 推論・思考タスク
        reasoning_keywords = ['analyze', 'explain why', 'reasoning', 'proof', 'logic',
                             'step by step', 'think through', '分析', '理由', '推論', '証明']
        if any(word in prompt_lower for word in reasoning_keywords):
            return "reasoning"
        
        # ブレインストーミング・壁打ち
        brainstorm_keywords = ['brainstorm', 'ideas', 'suggestions', 'improve', 'strategy',
                              'アイデア', '提案', '改善', '戦略', 'どうすべき', 'どう思う']
        if any(word in prompt_lower for word in brainstorm_keywords):
            return "brainstorming"
        
        # ドキュメント生成
        doc_keywords = ['document', 'readme', 'explain', 'describe', 'summary',
                       'ドキュメント', '説明', '要約', 'まとめ']
        if any(word in prompt_lower for word in doc_keywords):
            return "documentation"
        
        # 分析タスク
        analysis_keywords = ['review', 'evaluate', 'assess', 'compare', 'レビュー', '評価', '比較']
        if any(word in prompt_lower for word in analysis_keywords):
            return "analysis"
        
        return "general"


class BedrockAutoRouter:
    """Bedrockモデルの自動ルーティング"""
    
    ROUTING_TABLE = {
        "simple_qa": {
            "primary": "amazon.nova-micro-v1:0",
            "fallback": "amazon.nova-lite-v1:0",
            "reason": "Simple QA - fastest and cheapest"
        },
        "code_generation": {
            "primary": "qwen.qwen3-coder-30b-a3b-v1:0",
            "fallback": "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
            "reason": "Code generation - specialized model"
        },
        "reasoning": {
            "primary": "us.deepseek.r1-v1:0",
            "fallback": "us.anthropic.claude-opus-4-5-20251101-v1:0",
            "reason": "Complex reasoning - thinking process visible"
        },
        "brainstorming": {
            "primary": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            "fallback": "us.anthropic.claude-opus-4-5-20251101-v1:0",
            "reason": "Brainstorming - creative and multi-perspective"
        },
        "documentation": {
            "primary": "amazon.nova-lite-v1:0",
            "fallback": "amazon.nova-pro-v1:0",
            "reason": "Documentation - fast and cost-effective"
        },
        "analysis": {
            "primary": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            "fallback": "amazon.nova-pro-v1:0",
            "reason": "Analysis - balanced performance"
        },
        "general": {
            "primary": "amazon.nova-pro-v1:0",
            "fallback": "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
            "reason": "General purpose - best balance"
        }
    }
    
    def __init__(self):
        self.classifier = TaskClassifier()
    
    def route(self, prompt: str, context: Optional[Dict] = None, 
              criteria: str = "balanced") -> Dict:
        """プロンプトから最適なモデルを自動選択"""
        task_type = self.classifier.classify(prompt, context)
        token_count = estimate_tokens(prompt)
        
        routing = self.ROUTING_TABLE[task_type]
        selected_model = routing["primary"]
        
        # 大コンテキストの場合は強制的に大規模モデル
        if token_count > 5000:
            selected_model = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
            routing["reason"] = "Large context (>5K tokens) - upgraded to Claude Sonnet"
        
        # 基準による調整
        if criteria == "fastest":
            selected_model = self._get_fastest_for_task(task_type)
        elif criteria == "cheapest":
            selected_model = self._get_cheapest_for_task(task_type)
        elif criteria == "best_quality":
            selected_model = self._get_best_quality_for_task(task_type)
        
        pricing = MODEL_PRICING.get(selected_model, {"input": 0, "output": 0})
        estimated_cost = (token_count / 1000) * pricing["input"] + (token_count / 1000) * pricing["output"]
        
        alternatives = self._get_alternatives(task_type, selected_model)
        
        return {
            "selected_model": selected_model,
            "task_type": task_type,
            "reason": routing["reason"],
            "estimated_tokens": token_count,
            "estimated_cost": round(estimated_cost, 6),
            "estimated_latency": self._estimate_latency(selected_model),
            "alternatives": alternatives,
            "routing_metadata": {
                "criteria": criteria,
                "context_size": token_count,
                "fallback_model": routing["fallback"]
            }
        }
    
    def _get_fastest_for_task(self, task_type: str) -> str:
        speed_map = {
            "simple_qa": "amazon.nova-micro-v1:0",
            "code_generation": "amazon.nova-lite-v1:0",
            "reasoning": "amazon.nova-pro-v1:0",
            "brainstorming": "us.anthropic.claude-3-5-haiku-20241022-v1:0",
            "documentation": "amazon.nova-lite-v1:0",
            "analysis": "amazon.nova-pro-v1:0",
            "general": "amazon.nova-pro-v1:0"
        }
        return speed_map.get(task_type, "amazon.nova-pro-v1:0")
    
    def _get_cheapest_for_task(self, task_type: str) -> str:
        cost_map = {
            "simple_qa": "amazon.nova-micro-v1:0",
            "code_generation": "google.gemma-3-4b-it",
            "reasoning": "amazon.nova-lite-v1:0",
            "brainstorming": "amazon.nova-lite-v1:0",
            "documentation": "amazon.nova-micro-v1:0",
            "analysis": "amazon.nova-lite-v1:0",
            "general": "amazon.nova-lite-v1:0"
        }
        return cost_map.get(task_type, "amazon.nova-lite-v1:0")
    
    def _get_best_quality_for_task(self, task_type: str) -> str:
        quality_map = {
            "simple_qa": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            "code_generation": "us.anthropic.claude-opus-4-5-20251101-v1:0",
            "reasoning": "us.anthropic.claude-opus-4-5-20251101-v1:0",
            "brainstorming": "us.anthropic.claude-opus-4-5-20251101-v1:0",
            "documentation": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            "analysis": "us.anthropic.claude-opus-4-5-20251101-v1:0",
            "general": "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
        }
        return quality_map.get(task_type, "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
    
    def _estimate_latency(self, model_id: str) -> float:
        if "micro" in model_id:
            return 0.3
        elif "lite" in model_id or "haiku" in model_id:
            return 0.8
        elif "pro" in model_id or "sonnet" in model_id:
            return 1.5
        elif "opus" in model_id or "premier" in model_id:
            return 2.5
        else:
            return 1.0
    
    def _get_alternatives(self, task_type: str, selected_model: str) -> List[Dict]:
        routing = self.ROUTING_TABLE[task_type]
        alternatives = []
        
        if routing["fallback"] != selected_model:
            fallback_pricing = MODEL_PRICING.get(routing["fallback"], {"input": 0, "output": 0})
            alternatives.append({
                "model_id": routing["fallback"],
                "reason": "Fallback option - higher quality",
                "cost_multiplier": round(fallback_pricing["input"] / MODEL_PRICING.get(selected_model, {"input": 0.001})["input"], 1)
            })
        
        if selected_model != "us.anthropic.claude-sonnet-4-5-20250929-v1:0":
            alternatives.append({
                "model_id": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
                "reason": "Industry standard (Claude Sonnet)",
                "cost_multiplier": round(0.006 / MODEL_PRICING.get(selected_model, {"input": 0.001})["input"], 1)
            })
        
        return alternatives[:3]


def get_router() -> BedrockAutoRouter:
    """シングルトンルーターを取得"""
    return BedrockAutoRouter()
