# Routers package
from .execute import router as execute_router
from .debate import router as debate_router
from .conductor import router as conductor_router
from .auto_route import router as auto_route_router
from .settings import router as settings_router
from .models import router as models_router
from .image import router as image_router
from .video import router as video_router
from .workspace import router as workspace_router

__all__ = [
    "execute_router",
    "debate_router",
    "conductor_router",
    "auto_route_router",
    "settings_router",
    "models_router",
    "image_router",
    "video_router",
    "workspace_router",
]
