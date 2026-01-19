"""
Explainability エンドポイント
モデル選択の根拠説明機能
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from services.explainability import ModelExplainer, get_explainer
from services.auto_router import BedrockAutoRouter

router = APIRouter(prefix="/api/explain", tags=["explainability"])


class ExplainRequest(BaseModel):
    """説明リクエスト"""
    prompt: str
    selected_model: Optional[str] = None
    criteria: str = "balanced"
    include_alternatives: bool = True


class CompareModelsRequest(BaseModel):
    """モデル比較リクエスト"""
    model_ids: List[str]
    task_type: str = "general"


@router.post("/selection")
async def explain_model_selection(request: ExplainRequest):
    """
    モデル選択の根拠を説明
    
    レスポンス例:
    {
        "selected_model": {
            "id": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            "name": "Claude Sonnet 4.5"
        },
        "explanation": {
            "summary": "Claude Sonnet 4.5を選択しました。",
            "detailed": "このモデルは「アイデア出し・創造的タスク」タスクに最適化されています...",
            "key_factors": [
                "✅ タスク適合度: 85/100（優秀）",
                "⚡ コスト効率: 72/100（良好）",
                "⚡ 応答速度: 60/100（良好）"
            ]
        },
        "scoring": {
            "overall_score": 75,
            "breakdown": [...]
        },
        "comparison": [
            {
                "model_id": "amazon.nova-pro-v1:0",
                "score_difference": -5,
                "reason_not_selected": "選択モデルより5ポイント低いスコア"
            }
        ]
    }
    """
    try:
        explainer = get_explainer()
        auto_router = BedrockAutoRouter()
        
        # モデルが指定されていない場合は自動選択
        if not request.selected_model:
            routing = auto_router.route(request.prompt, criteria=request.criteria)
            selected_model = routing["selected_model"]
            task_type = routing["task_type"]
            alternatives = [alt["model_id"] for alt in routing.get("alternatives", [])]
        else:
            selected_model = request.selected_model
            task_type = auto_router.classifier.classify(request.prompt)
            alternatives = []
        
        # 説明生成
        explanation = explainer.explain_selection(
            selected_model=selected_model,
            task_type=task_type,
            prompt=request.prompt,
            criteria=request.criteria,
            alternatives=alternatives if request.include_alternatives else None
        )
        
        return explanation
        
    except Exception as e:
        import traceback
        print(f"❌ エラー: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/compare")
async def compare_models(request: CompareModelsRequest):
    """
    複数モデルの能力を比較
    """
    try:
        explainer = get_explainer()
        
        comparisons = []
        for model_id in request.model_ids:
            model_info = explainer.MODEL_CAPABILITIES.get(
                model_id, 
                explainer._get_default_model_info(model_id)
            )
            
            scoring = explainer._calculate_scoring(model_id, request.task_type, "balanced")
            
            comparisons.append({
                "model_id": model_id,
                "name": model_info.get("name", model_id),
                "quality_tier": model_info.get("quality_tier", "unknown"),
                "strengths": model_info.get("strengths", []),
                "weaknesses": model_info.get("weaknesses", []),
                "best_for": model_info.get("best_for", []),
                "capabilities": {
                    "reasoning": model_info.get("reasoning_capability", 50),
                    "code": model_info.get("code_capability", 50),
                    "creative": model_info.get("creative_capability", 50),
                    "speed": model_info.get("speed_rating", 50)
                },
                "scoring": scoring
            })
        
        # ランキング
        ranked = sorted(comparisons, key=lambda x: x["scoring"]["overall"], reverse=True)
        
        return {
            "task_type": request.task_type,
            "comparisons": comparisons,
            "ranking": [
                {"rank": i+1, "model_id": m["model_id"], "score": m["scoring"]["overall"]}
                for i, m in enumerate(ranked)
            ],
            "recommendation": {
                "best_overall": ranked[0]["model_id"] if ranked else None,
                "reason": f"総合スコア {ranked[0]['scoring']['overall']}/100 で最高評価" if ranked else None
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/capabilities")
async def get_model_capabilities(model_id: Optional[str] = None):
    """
    モデルの能力情報を取得
    model_idを指定しない場合は全モデルの情報を返す
    """
    try:
        explainer = get_explainer()
        
        if model_id:
            info = explainer.MODEL_CAPABILITIES.get(
                model_id,
                explainer._get_default_model_info(model_id)
            )
            return {
                "model_id": model_id,
                **info
            }
        else:
            return {
                "models": [
                    {"model_id": mid, **info}
                    for mid, info in explainer.MODEL_CAPABILITIES.items()
                ]
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/task-types")
async def get_task_types():
    """
    サポートされているタスクタイプと要件を取得
    """
    try:
        explainer = get_explainer()
        return {
            "task_types": [
                {
                    "id": task_id,
                    "description": info["description"],
                    "primary_capability": info["primary"],
                    "secondary_capabilities": info["secondary"]
                }
                for task_id, info in explainer.TASK_REQUIREMENTS.items()
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
