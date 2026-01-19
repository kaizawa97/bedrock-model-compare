"""
モデル選択の根拠説明機能（Explainability）
なぜそのモデルが選ばれたかを自然言語で説明
"""
from typing import Dict, List, Optional
from dataclasses import dataclass
from .pricing import MODEL_PRICING, estimate_tokens


@dataclass
class ScoringCriteria:
    """スコアリング基準"""
    name: str
    weight: float
    score: float
    max_score: float = 100
    explanation: str = ""


class ModelExplainer:
    """モデル選択の説明生成"""
    
    # モデル特性データベース
    MODEL_CAPABILITIES = {
        "us.anthropic.claude-opus-4-5-20251101-v1:0": {
            "name": "Claude Opus 4.5",
            "strengths": ["複雑な論理推論", "長文生成", "創造的タスク", "マルチステップ分析"],
            "weaknesses": ["高コスト", "レイテンシが長い"],
            "best_for": ["reasoning", "brainstorming", "analysis"],
            "quality_tier": "premium",
            "reasoning_capability": 95,
            "code_capability": 90,
            "creative_capability": 95,
            "speed_rating": 40
        },
        "us.anthropic.claude-sonnet-4-5-20250929-v1:0": {
            "name": "Claude Sonnet 4.5",
            "strengths": ["バランスの良い性能", "コスト効率", "汎用性"],
            "weaknesses": ["最高品質ではない"],
            "best_for": ["general", "brainstorming", "analysis", "documentation"],
            "quality_tier": "high",
            "reasoning_capability": 85,
            "code_capability": 85,
            "creative_capability": 85,
            "speed_rating": 60
        },
        "us.anthropic.claude-3-5-haiku-20241022-v1:0": {
            "name": "Claude 3.5 Haiku",
            "strengths": ["高速レスポンス", "低コスト", "シンプルタスク"],
            "weaknesses": ["複雑なタスクに弱い"],
            "best_for": ["simple_qa", "documentation"],
            "quality_tier": "standard",
            "reasoning_capability": 65,
            "code_capability": 70,
            "creative_capability": 60,
            "speed_rating": 90
        },
        "amazon.nova-micro-v1:0": {
            "name": "Amazon Nova Micro",
            "strengths": ["超高速", "超低コスト", "シンプルQA"],
            "weaknesses": ["複雑なタスク不可"],
            "best_for": ["simple_qa"],
            "quality_tier": "basic",
            "reasoning_capability": 40,
            "code_capability": 35,
            "creative_capability": 30,
            "speed_rating": 98
        },
        "amazon.nova-lite-v1:0": {
            "name": "Amazon Nova Lite",
            "strengths": ["高速", "低コスト", "ドキュメント生成"],
            "weaknesses": ["高度な推論に弱い"],
            "best_for": ["documentation", "simple_qa"],
            "quality_tier": "standard",
            "reasoning_capability": 55,
            "code_capability": 50,
            "creative_capability": 50,
            "speed_rating": 92
        },
        "amazon.nova-pro-v1:0": {
            "name": "Amazon Nova Pro",
            "strengths": ["バランス", "コスト効率", "汎用性"],
            "weaknesses": ["特化性能は劣る"],
            "best_for": ["general", "analysis", "documentation"],
            "quality_tier": "high",
            "reasoning_capability": 75,
            "code_capability": 70,
            "creative_capability": 70,
            "speed_rating": 75
        },
        "us.deepseek.r1-v1:0": {
            "name": "DeepSeek R1",
            "strengths": ["推論特化", "思考プロセス可視化", "数学・論理"],
            "weaknesses": ["創造的タスクに弱い"],
            "best_for": ["reasoning"],
            "quality_tier": "high",
            "reasoning_capability": 92,
            "code_capability": 80,
            "creative_capability": 60,
            "speed_rating": 50
        },
        "qwen.qwen3-coder-30b-a3b-v1:0": {
            "name": "Qwen3 Coder",
            "strengths": ["コード生成特化", "プログラミング言語理解"],
            "weaknesses": ["非コードタスクに弱い"],
            "best_for": ["code_generation"],
            "quality_tier": "high",
            "reasoning_capability": 70,
            "code_capability": 95,
            "creative_capability": 50,
            "speed_rating": 70
        }
    }
    
    # タスクタイプ別の重要な能力
    TASK_REQUIREMENTS = {
        "simple_qa": {
            "primary": "speed_rating",
            "secondary": ["reasoning_capability"],
            "description": "シンプルな質問応答"
        },
        "code_generation": {
            "primary": "code_capability",
            "secondary": ["reasoning_capability"],
            "description": "コード生成・プログラミング"
        },
        "reasoning": {
            "primary": "reasoning_capability",
            "secondary": ["code_capability"],
            "description": "複雑な論理推論・分析"
        },
        "brainstorming": {
            "primary": "creative_capability",
            "secondary": ["reasoning_capability"],
            "description": "アイデア出し・創造的タスク"
        },
        "documentation": {
            "primary": "speed_rating",
            "secondary": ["creative_capability"],
            "description": "ドキュメント・説明文生成"
        },
        "analysis": {
            "primary": "reasoning_capability",
            "secondary": ["creative_capability"],
            "description": "データ分析・評価"
        },
        "general": {
            "primary": "reasoning_capability",
            "secondary": ["creative_capability", "code_capability"],
            "description": "汎用タスク"
        }
    }
    
    def explain_selection(
        self,
        selected_model: str,
        task_type: str,
        prompt: str,
        criteria: str = "balanced",
        alternatives: List[str] = None
    ) -> Dict:
        """モデル選択の根拠を説明"""
        
        # 選択されたモデルの情報
        model_info = self.MODEL_CAPABILITIES.get(selected_model, self._get_default_model_info(selected_model))
        task_req = self.TASK_REQUIREMENTS.get(task_type, self.TASK_REQUIREMENTS["general"])
        
        # スコアリング詳細
        scoring_details = self._calculate_scoring(selected_model, task_type, criteria)
        
        # 自然言語での説明生成
        explanation = self._generate_natural_explanation(
            model_info, task_type, task_req, scoring_details, criteria
        )
        
        # 代替モデルとの比較
        comparison = []
        if alternatives:
            comparison = self._compare_with_alternatives(selected_model, alternatives, task_type)
        
        # プロンプト分析
        prompt_analysis = self._analyze_prompt(prompt)
        
        return {
            "selected_model": {
                "id": selected_model,
                "name": model_info.get("name", selected_model),
                "quality_tier": model_info.get("quality_tier", "unknown")
            },
            "explanation": {
                "summary": explanation["summary"],
                "detailed": explanation["detailed"],
                "key_factors": explanation["key_factors"]
            },
            "scoring": {
                "overall_score": scoring_details["overall"],
                "breakdown": scoring_details["breakdown"],
                "criteria_used": criteria
            },
            "task_analysis": {
                "type": task_type,
                "description": task_req["description"],
                "required_capabilities": [task_req["primary"]] + task_req["secondary"]
            },
            "prompt_analysis": prompt_analysis,
            "comparison": comparison,
            "confidence": self._calculate_confidence(scoring_details)
        }
    
    def _calculate_scoring(self, model_id: str, task_type: str, criteria: str) -> Dict:
        """スコアリング計算"""
        model_info = self.MODEL_CAPABILITIES.get(model_id, self._get_default_model_info(model_id))
        task_req = self.TASK_REQUIREMENTS.get(task_type, self.TASK_REQUIREMENTS["general"])
        pricing = MODEL_PRICING.get(model_id, {"input": 0.001, "output": 0.001})
        
        # 各軸のスコア
        primary_cap = task_req["primary"]
        capability_score = model_info.get(primary_cap, 50)
        
        # コストスコア（低いほど良い）
        cost_per_1k = pricing["input"] + pricing["output"]
        cost_score = max(0, 100 - (cost_per_1k * 1000))  # $0.1で0点
        
        # 速度スコア
        speed_score = model_info.get("speed_rating", 50)
        
        # 基準による重み付け
        if criteria == "fastest":
            weights = {"capability": 0.2, "cost": 0.2, "speed": 0.6}
        elif criteria == "cheapest":
            weights = {"capability": 0.2, "cost": 0.6, "speed": 0.2}
        elif criteria == "best_quality":
            weights = {"capability": 0.7, "cost": 0.1, "speed": 0.2}
        else:  # balanced
            weights = {"capability": 0.4, "cost": 0.3, "speed": 0.3}
        
        overall = (
            capability_score * weights["capability"] +
            cost_score * weights["cost"] +
            speed_score * weights["speed"]
        )
        
        return {
            "overall": round(overall),
            "breakdown": [
                {
                    "name": f"タスク適合度（{primary_cap}）",
                    "score": round(capability_score),
                    "weight": weights["capability"],
                    "weighted_score": round(capability_score * weights["capability"])
                },
                {
                    "name": "コスト効率",
                    "score": round(cost_score),
                    "weight": weights["cost"],
                    "weighted_score": round(cost_score * weights["cost"])
                },
                {
                    "name": "応答速度",
                    "score": round(speed_score),
                    "weight": weights["speed"],
                    "weighted_score": round(speed_score * weights["speed"])
                }
            ]
        }
    
    def _generate_natural_explanation(
        self, 
        model_info: Dict, 
        task_type: str, 
        task_req: Dict,
        scoring: Dict,
        criteria: str
    ) -> Dict:
        """自然言語での説明を生成"""
        
        model_name = model_info.get("name", "選択されたモデル")
        strengths = model_info.get("strengths", [])
        
        # サマリー生成
        summary = f"{model_name}を選択しました。"
        
        # 詳細説明
        detailed_parts = []
        
        # タスクタイプに基づく説明
        if task_type in model_info.get("best_for", []):
            detailed_parts.append(f"このモデルは「{task_req['description']}」タスクに最適化されています。")
        
        # 強みの説明
        if strengths:
            detailed_parts.append(f"主な強み: {', '.join(strengths[:3])}")
        
        # スコアに基づく説明
        overall = scoring["overall"]
        if overall >= 80:
            detailed_parts.append(f"総合スコア {overall}/100 で、このタスクに非常に適しています。")
        elif overall >= 60:
            detailed_parts.append(f"総合スコア {overall}/100 で、バランスの取れた選択です。")
        else:
            detailed_parts.append(f"総合スコア {overall}/100 です。制約条件下での最適解です。")
        
        # キーファクター
        key_factors = []
        for item in scoring["breakdown"]:
            if item["score"] >= 80:
                key_factors.append(f"✅ {item['name']}: {item['score']}/100（優秀）")
            elif item["score"] >= 60:
                key_factors.append(f"⚡ {item['name']}: {item['score']}/100（良好）")
            else:
                key_factors.append(f"⚠️ {item['name']}: {item['score']}/100（改善余地あり）")
        
        return {
            "summary": summary,
            "detailed": " ".join(detailed_parts),
            "key_factors": key_factors
        }
    
    def _compare_with_alternatives(
        self, 
        selected: str, 
        alternatives: List[str], 
        task_type: str
    ) -> List[Dict]:
        """代替モデルとの比較"""
        comparisons = []
        selected_scoring = self._calculate_scoring(selected, task_type, "balanced")
        
        for alt_model in alternatives[:3]:
            alt_info = self.MODEL_CAPABILITIES.get(alt_model, self._get_default_model_info(alt_model))
            alt_scoring = self._calculate_scoring(alt_model, task_type, "balanced")
            
            diff = selected_scoring["overall"] - alt_scoring["overall"]
            
            if diff > 0:
                reason = f"選択モデルより{abs(diff)}ポイント低いスコア"
            else:
                reason = f"選択モデルより{abs(diff)}ポイント高いが、他の制約で除外"
            
            comparisons.append({
                "model_id": alt_model,
                "model_name": alt_info.get("name", alt_model),
                "score": alt_scoring["overall"],
                "score_difference": diff,
                "reason_not_selected": reason,
                "strengths": alt_info.get("strengths", [])[:2],
                "weaknesses": alt_info.get("weaknesses", [])[:2]
            })
        
        return comparisons
    
    def _analyze_prompt(self, prompt: str) -> Dict:
        """プロンプトの分析"""
        token_count = estimate_tokens(prompt)
        
        # 特徴検出
        features = []
        prompt_lower = prompt.lower()
        
        if any(word in prompt_lower for word in ["code", "function", "implement", "コード", "実装"]):
            features.append("コード関連")
        if any(word in prompt_lower for word in ["analyze", "分析", "評価", "compare"]):
            features.append("分析タスク")
        if any(word in prompt_lower for word in ["idea", "brainstorm", "アイデア", "提案"]):
            features.append("創造的タスク")
        if len(prompt) > 2000:
            features.append("長文入力")
        if "?" in prompt or "？" in prompt:
            features.append("質問形式")
        
        return {
            "token_count": token_count,
            "character_count": len(prompt),
            "detected_features": features,
            "complexity": "high" if token_count > 500 else "medium" if token_count > 100 else "low"
        }
    
    def _calculate_confidence(self, scoring: Dict) -> Dict:
        """選択の信頼度を計算"""
        overall = scoring["overall"]
        
        if overall >= 85:
            level = "high"
            description = "この選択に高い信頼性があります"
        elif overall >= 70:
            level = "medium"
            description = "妥当な選択ですが、代替案も検討の価値があります"
        else:
            level = "low"
            description = "制約条件下での選択です。要件の見直しを推奨します"
        
        return {
            "level": level,
            "score": overall,
            "description": description
        }
    
    def _get_default_model_info(self, model_id: str) -> Dict:
        """デフォルトのモデル情報"""
        return {
            "name": model_id.split(".")[-1],
            "strengths": ["汎用性"],
            "weaknesses": ["詳細情報なし"],
            "best_for": ["general"],
            "quality_tier": "unknown",
            "reasoning_capability": 60,
            "code_capability": 60,
            "creative_capability": 60,
            "speed_rating": 60
        }


def get_explainer() -> ModelExplainer:
    """シングルトンExplainerを取得"""
    return ModelExplainer()
