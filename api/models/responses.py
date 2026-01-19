"""
レスポンスモデル定義
"""
from pydantic import BaseModel
from typing import List, Optional


class ExecutionResponse(BaseModel):
    """実行結果レスポンス"""
    results: List[dict]
    summary: dict


class ImageGenerationResponse(BaseModel):
    """画像生成結果レスポンス"""
    results: List[dict]
    summary: dict


class VideoGenerationResponse(BaseModel):
    """動画生成開始結果レスポンス"""
    results: List[dict]
    summary: dict


class VideoStatusResponse(BaseModel):
    """動画生成ステータスレスポンス"""
    statuses: List[dict]
    summary: dict
