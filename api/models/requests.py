"""
リクエストモデル定義
"""
from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class ExecutionRequest(BaseModel):
    """基本的な並列実行リクエスト"""
    model_ids: List[str]
    prompt: str
    region: str = "us-east-1"
    max_tokens: int = 1000
    temperature: float = 0.7
    max_workers: int = 50


class ExecutionRequestWithReasoning(BaseModel):
    """推論モード対応の実行リクエスト"""
    model_ids: List[str]
    prompt: str
    region: str = "us-east-1"
    max_tokens: int = 1000
    temperature: float = 0.7
    max_workers: int = 50
    enable_reasoning: bool = False
    reasoning_budget_tokens: int = 5000


class AutoRouteRequest(BaseModel):
    """Auto Routerリクエスト"""
    prompt: str
    criteria: str = "balanced"  # balanced, fastest, cheapest, best_quality
    context: Optional[Dict[str, Any]] = None


class AutoExecuteRequest(BaseModel):
    """Auto Router + 実行リクエスト"""
    prompt: str
    criteria: str = "balanced"
    region: str = "us-east-1"
    max_tokens: int = 1000
    temperature: float = 0.7
    compare_with_alternatives: bool = False


class DebateRequest(BaseModel):
    """壁打ち（ディベート/ブレインストーミング）リクエスト"""
    model_ids: List[str]
    topic: str
    rounds: int = 3
    region: str = "us-east-1"
    max_tokens: int = 1000
    temperature: float = 0.7
    mode: str = "debate"  # debate, brainstorm, critique
    enable_reasoning: bool = False
    reasoning_budget_tokens: int = 5000
    include_human: bool = False  # ユーザー参加フラグ


class HumanInputRequest(BaseModel):
    """ユーザー入力リクエスト"""
    session_id: str
    message: str


class ConductorRequest(BaseModel):
    """指揮者モードリクエスト"""
    conductor_model_id: str
    worker_model_ids: List[str]
    task: str
    region: str = "us-east-1"
    max_tokens: int = 1500
    temperature: float = 0.7
    mode: str = "delegate"  # delegate, evaluate, synthesize
    enable_reasoning: bool = False
    reasoning_budget_tokens: int = 5000


class SettingsRequest(BaseModel):
    """設定更新リクエスト"""
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    aws_bearer_token: Optional[str] = None
    aws_default_region: Optional[str] = None
    aws_profile: Optional[str] = None
    video_s3_output_uri: Optional[str] = None


class ImageGenerationRequest(BaseModel):
    """画像生成リクエスト"""
    model_ids: List[str]
    prompt: str
    negative_prompt: str = ""
    region: str = "us-east-1"
    width: int = 1024
    height: int = 1024
    num_images: int = 1
    cfg_scale: float = 7.0
    seed: Optional[int] = None
    max_workers: int = 10


class VideoGenerationRequest(BaseModel):
    """動画生成リクエスト"""
    model_ids: List[str]
    prompt: str
    s3_output_base_uri: Optional[str] = None  # None時は環境変数から取得
    region: str = "us-east-1"
    duration_seconds: int = 6
    fps: int = 24
    dimension: str = "1280x720"
    seed: Optional[int] = None
    max_workers: int = 5


class VideoStatusRequest(BaseModel):
    """動画生成ステータス確認リクエスト"""
    invocation_arns: List[str]
    region: str = "us-east-1"


# ワークスペース関連
class WorkspaceCreateRequest(BaseModel):
    """ワークスペース作成リクエスト"""
    name: str
    description: Optional[str] = None


class WorkspaceTaskRequest(BaseModel):
    """ワークスペースタスク実行リクエスト"""
    model_ids: List[str]
    task: str
    region: str = "us-east-1"
    max_tokens: int = 4000
    temperature: float = 0.7
