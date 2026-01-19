"""
設定管理エンドポイント
"""
import os
from fastapi import APIRouter, HTTPException
from dotenv import load_dotenv

from models.requests import SettingsRequest
from services.bedrock_executor import BedrockParallelExecutor

router = APIRouter(prefix="/api", tags=["settings"])

ENV_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')


@router.get("/settings")
async def get_settings():
    """現在の設定を取得（機密情報はマスク）"""
    settings = {
        "aws_access_key_id": "",
        "aws_secret_access_key": "",
        "aws_bearer_token": "",
        "aws_default_region": os.getenv("AWS_DEFAULT_REGION", "us-east-1"),
        "aws_profile": os.getenv("AWS_PROFILE", ""),
        "auth_method": "none",
        "video_s3_output_uri": os.getenv("VIDEO_S3_OUTPUT_URI", ""),
    }
    
    if os.getenv("AWS_BEARER_TOKEN_BEDROCK"):
        settings["auth_method"] = "bearer"
        token = os.getenv("AWS_BEARER_TOKEN_BEDROCK", "")
        settings["aws_bearer_token"] = f"****{token[-8:]}" if len(token) > 8 else "****"
    elif os.getenv("AWS_ACCESS_KEY_ID"):
        settings["auth_method"] = "access_key"
        key_id = os.getenv("AWS_ACCESS_KEY_ID", "")
        settings["aws_access_key_id"] = f"****{key_id[-4:]}" if len(key_id) > 4 else "****"
        settings["aws_secret_access_key"] = "****"
    elif os.getenv("AWS_PROFILE"):
        settings["auth_method"] = "profile"
    
    return settings


@router.post("/settings")
async def update_settings(request: SettingsRequest):
    """設定を更新"""
    try:
        env_content = {}
        if os.path.exists(ENV_FILE_PATH):
            with open(ENV_FILE_PATH, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        env_content[key] = value
        
        if request.aws_access_key_id and not request.aws_access_key_id.startswith('****'):
            env_content['AWS_ACCESS_KEY_ID'] = request.aws_access_key_id
        if request.aws_secret_access_key and not request.aws_secret_access_key.startswith('****'):
            env_content['AWS_SECRET_ACCESS_KEY'] = request.aws_secret_access_key
        if request.aws_bearer_token and not request.aws_bearer_token.startswith('****'):
            env_content['AWS_BEARER_TOKEN_BEDROCK'] = request.aws_bearer_token
        if request.aws_default_region:
            env_content['AWS_DEFAULT_REGION'] = request.aws_default_region
        if request.aws_profile is not None:
            if request.aws_profile:
                env_content['AWS_PROFILE'] = request.aws_profile
            elif 'AWS_PROFILE' in env_content:
                del env_content['AWS_PROFILE']
        if request.video_s3_output_uri is not None:
            if request.video_s3_output_uri:
                env_content['VIDEO_S3_OUTPUT_URI'] = request.video_s3_output_uri
            elif 'VIDEO_S3_OUTPUT_URI' in env_content:
                del env_content['VIDEO_S3_OUTPUT_URI']

        with open(ENV_FILE_PATH, 'w') as f:
            f.write("# AWS認証情報\n")
            f.write("# 自動生成 - Webから更新\n\n")
            for key, value in env_content.items():
                f.write(f"{key}={value}\n")
        
        load_dotenv(ENV_FILE_PATH, override=True)
        
        return {"success": True, "message": "設定を更新しました"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/settings/test")
async def test_connection():
    """AWS接続テスト"""
    try:
        executor = BedrockParallelExecutor(region=os.getenv("AWS_DEFAULT_REGION", "us-east-1"))
        result = executor.invoke_model(
            "amazon.nova-micro-v1:0",
            "Say 'OK' in one word.",
            max_tokens=10,
            temperature=0,
            execution_id=0
        )
        if result["success"]:
            return {"success": True, "message": "接続成功！"}
        else:
            return {"success": False, "message": f"接続失敗: {result.get('error', 'Unknown error')}"}
    except Exception as e:
        return {"success": False, "message": f"接続エラー: {str(e)}"}
