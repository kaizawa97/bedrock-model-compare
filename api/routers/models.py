"""
モデル・リージョン情報エンドポイント
"""
from fastapi import APIRouter
from models.constants import AVAILABLE_MODELS, AVAILABLE_REGIONS

router = APIRouter(prefix="/api", tags=["models"])


@router.get("/models")
async def get_models():
    """利用可能なモデルリストを返す"""
    return {"models": AVAILABLE_MODELS}


@router.get("/regions")
async def get_regions():
    """利用可能なリージョンリストを返す"""
    return {"regions": AVAILABLE_REGIONS}
