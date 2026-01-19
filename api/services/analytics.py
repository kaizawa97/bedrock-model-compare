"""
コスト・パフォーマンス分析サービス
リアルタイムメトリクス、トレードオフ分析、予算管理
"""
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from collections import defaultdict
import json
from .pricing import MODEL_PRICING, calculate_cost, estimate_tokens


@dataclass
class ExecutionMetric:
    """実行メトリクス"""
    model_id: str
    input_tokens: int
    output_tokens: int
    latency_seconds: float
    cost_usd: float
    success: bool
    timestamp: datetime
    task_type: str = "general"
    quality_score: Optional[float] = None
    prompt: str = ""
    response: str = ""
    execution_id: int = 0


class AnalyticsStore:
    """メトリクス保存（インメモリ、本番ではDynamoDB/CloudWatch推奨）"""
    
    def __init__(self):
        self.metrics: List[ExecutionMetric] = []
        self.daily_budget_usd: float = 10.0
        self.monthly_budget_usd: float = 300.0
        self.alerts: List[Dict] = []
    
    def add_metric(self, metric: ExecutionMetric):
        self.metrics.append(metric)
        self._check_budget_alerts()
    
    def add_from_result(self, result: Dict, task_type: str = "general", prompt: str = ""):
        """実行結果からメトリクスを追加"""
        if not result.get("success"):
            return
        
        cost_info = result.get("cost", {})
        metric = ExecutionMetric(
            model_id=result["model_id"],
            input_tokens=cost_info.get("input_tokens", 0),
            output_tokens=cost_info.get("output_tokens", 0),
            latency_seconds=result.get("elapsed_time", 0),
            cost_usd=cost_info.get("total_cost", 0),
            success=result["success"],
            timestamp=datetime.fromisoformat(result["timestamp"]),
            task_type=task_type,
            prompt=prompt[:500] if prompt else "",  # 最大500文字
            response=result.get("output", "")[:1000],  # 最大1000文字
            execution_id=result.get("execution_id", 0)
        )
        self.add_metric(metric)
    
    def get_recent_executions(self, limit: int = 20) -> List[Dict]:
        """最近の実行履歴を取得"""
        sorted_metrics = sorted(self.metrics, key=lambda m: m.timestamp, reverse=True)
        return [
            {
                "model_id": m.model_id,
                "model_name": m.model_id.split(".")[-1][:30],
                "prompt": m.prompt,
                "response": m.response,
                "input_tokens": m.input_tokens,
                "output_tokens": m.output_tokens,
                "cost_usd": m.cost_usd,
                "latency_seconds": m.latency_seconds,
                "timestamp": m.timestamp.isoformat(),
                "task_type": m.task_type
            }
            for m in sorted_metrics[:limit]
        ]
    
    def _check_budget_alerts(self):
        """予算アラートをチェック"""
        today = datetime.now().date()
        today_cost = sum(
            m.cost_usd for m in self.metrics 
            if m.timestamp.date() == today
        )
        
        month_start = today.replace(day=1)
        month_cost = sum(
            m.cost_usd for m in self.metrics 
            if m.timestamp.date() >= month_start
        )
        
        # 日次予算の80%超過
        if today_cost > self.daily_budget_usd * 0.8:
            self.alerts.append({
                "type": "daily_budget_warning",
                "message": f"日次予算の{(today_cost/self.daily_budget_usd)*100:.0f}%を使用",
                "current": today_cost,
                "limit": self.daily_budget_usd,
                "timestamp": datetime.now().isoformat()
            })
        
        # 月次予算の80%超過
        if month_cost > self.monthly_budget_usd * 0.8:
            self.alerts.append({
                "type": "monthly_budget_warning", 
                "message": f"月次予算の{(month_cost/self.monthly_budget_usd)*100:.0f}%を使用",
                "current": month_cost,
                "limit": self.monthly_budget_usd,
                "timestamp": datetime.now().isoformat()
            })


# グローバルストア
_analytics_store = AnalyticsStore()


def get_analytics_store() -> AnalyticsStore:
    return _analytics_store


class CostPerformanceAnalyzer:
    """コスト・パフォーマンス分析"""
    
    def __init__(self, store: AnalyticsStore = None):
        self.store = store or get_analytics_store()
    
    def get_realtime_dashboard(self) -> Dict:
        """リアルタイムダッシュボードデータ"""
        now = datetime.now()
        today = now.date()
        month_start = today.replace(day=1)
        
        # 今日のメトリクス
        today_metrics = [m for m in self.store.metrics if m.timestamp.date() == today]
        month_metrics = [m for m in self.store.metrics if m.timestamp.date() >= month_start]
        
        # モデル別集計
        model_stats = self._aggregate_by_model(month_metrics)
        
        # 時間帯別コスト（過去24時間）
        hourly_costs = self._get_hourly_costs(now - timedelta(hours=24), now)
        
        return {
            "summary": {
                "today": {
                    "total_cost": sum(m.cost_usd for m in today_metrics),
                    "total_requests": len(today_metrics),
                    "total_tokens": sum(m.input_tokens + m.output_tokens for m in today_metrics),
                    "avg_latency": self._safe_avg([m.latency_seconds for m in today_metrics]),
                    "success_rate": self._safe_avg([1 if m.success else 0 for m in today_metrics]) * 100
                },
                "month": {
                    "total_cost": sum(m.cost_usd for m in month_metrics),
                    "total_requests": len(month_metrics),
                    "total_tokens": sum(m.input_tokens + m.output_tokens for m in month_metrics),
                    "projected_cost": self._project_monthly_cost(month_metrics)
                }
            },
            "budget": {
                "daily": {
                    "limit": self.store.daily_budget_usd,
                    "used": sum(m.cost_usd for m in today_metrics),
                    "remaining": max(0, self.store.daily_budget_usd - sum(m.cost_usd for m in today_metrics))
                },
                "monthly": {
                    "limit": self.store.monthly_budget_usd,
                    "used": sum(m.cost_usd for m in month_metrics),
                    "remaining": max(0, self.store.monthly_budget_usd - sum(m.cost_usd for m in month_metrics))
                }
            },
            "model_breakdown": model_stats,
            "hourly_trend": hourly_costs,
            "alerts": self.store.alerts[-10:],  # 最新10件
            "timestamp": now.isoformat()
        }
    
    def get_tradeoff_analysis(self, task_type: str = None) -> Dict:
        """コスト vs 品質 vs 速度の3軸トレードオフ分析"""
        metrics = self.store.metrics
        if task_type:
            metrics = [m for m in metrics if m.task_type == task_type]
        
        model_analysis = {}
        for model_id in set(m.model_id for m in metrics):
            model_metrics = [m for m in metrics if m.model_id == model_id]
            if not model_metrics:
                continue
            
            avg_cost = self._safe_avg([m.cost_usd for m in model_metrics])
            avg_latency = self._safe_avg([m.latency_seconds for m in model_metrics])
            avg_tokens = self._safe_avg([m.input_tokens + m.output_tokens for m in model_metrics])
            
            # スコア計算（0-100）
            cost_score = self._normalize_score(avg_cost, 0, 0.01, inverse=True)
            speed_score = self._normalize_score(avg_latency, 0, 5, inverse=True)
            
            model_analysis[model_id] = {
                "metrics": {
                    "avg_cost_per_request": round(avg_cost, 6),
                    "avg_latency_seconds": round(avg_latency, 2),
                    "avg_tokens": round(avg_tokens),
                    "request_count": len(model_metrics),
                    "success_rate": self._safe_avg([1 if m.success else 0 for m in model_metrics]) * 100
                },
                "scores": {
                    "cost_efficiency": round(cost_score),
                    "speed": round(speed_score),
                    "balanced": round((cost_score + speed_score) / 2)
                }
            }
        
        # 推奨モデル
        recommendations = self._generate_recommendations(model_analysis)
        
        return {
            "analysis": model_analysis,
            "recommendations": recommendations,
            "task_type": task_type or "all"
        }
    
    def get_optimal_model_recommendation(
        self, 
        budget_constraint: float = None,
        latency_constraint: float = None,
        task_type: str = "general"
    ) -> Dict:
        """予算制約下での最適モデル自動推奨"""
        candidates = []
        
        for model_id, pricing in MODEL_PRICING.items():
            # 推定コスト（1000トークン想定）
            est_cost = pricing["input"] + pricing["output"]
            
            # 推定レイテンシ
            est_latency = self._estimate_model_latency(model_id)
            
            # 制約チェック
            if budget_constraint and est_cost > budget_constraint:
                continue
            if latency_constraint and est_latency > latency_constraint:
                continue
            
            # スコア計算
            cost_score = self._normalize_score(est_cost, 0, 0.1, inverse=True)
            speed_score = self._normalize_score(est_latency, 0, 5, inverse=True)
            quality_score = self._estimate_quality_score(model_id, task_type)
            
            candidates.append({
                "model_id": model_id,
                "estimated_cost_per_1k": est_cost,
                "estimated_latency": est_latency,
                "scores": {
                    "cost": round(cost_score),
                    "speed": round(speed_score),
                    "quality": round(quality_score),
                    "overall": round((cost_score + speed_score + quality_score) / 3)
                }
            })
        
        # スコアでソート
        candidates.sort(key=lambda x: x["scores"]["overall"], reverse=True)
        
        return {
            "recommended": candidates[0] if candidates else None,
            "alternatives": candidates[1:4] if len(candidates) > 1 else [],
            "constraints": {
                "budget": budget_constraint,
                "latency": latency_constraint,
                "task_type": task_type
            },
            "total_candidates": len(candidates)
        }
    
    def _aggregate_by_model(self, metrics: List[ExecutionMetric]) -> List[Dict]:
        """モデル別集計"""
        model_data = defaultdict(lambda: {"cost": 0, "requests": 0, "tokens": 0, "latency_sum": 0})
        
        for m in metrics:
            model_data[m.model_id]["cost"] += m.cost_usd
            model_data[m.model_id]["requests"] += 1
            model_data[m.model_id]["tokens"] += m.input_tokens + m.output_tokens
            model_data[m.model_id]["latency_sum"] += m.latency_seconds
        
        result = []
        for model_id, data in model_data.items():
            result.append({
                "model_id": model_id,
                "model_name": model_id.split(".")[-1][:30],
                "total_cost": round(data["cost"], 6),
                "request_count": data["requests"],
                "total_tokens": data["tokens"],
                "avg_latency": round(data["latency_sum"] / data["requests"], 2) if data["requests"] > 0 else 0
            })
        
        return sorted(result, key=lambda x: x["total_cost"], reverse=True)
    
    def _get_hourly_costs(self, start: datetime, end: datetime) -> List[Dict]:
        """時間帯別コスト"""
        hourly = defaultdict(float)
        
        for m in self.store.metrics:
            if start <= m.timestamp <= end:
                hour_key = m.timestamp.strftime("%Y-%m-%d %H:00")
                hourly[hour_key] += m.cost_usd
        
        return [{"hour": k, "cost": round(v, 6)} for k, v in sorted(hourly.items())]
    
    def _project_monthly_cost(self, month_metrics: List[ExecutionMetric]) -> float:
        """月間コスト予測"""
        if not month_metrics:
            return 0
        
        today = datetime.now().date()
        days_elapsed = today.day
        total_cost = sum(m.cost_usd for m in month_metrics)
        
        # 月末までの日数
        if today.month == 12:
            next_month = today.replace(year=today.year + 1, month=1, day=1)
        else:
            next_month = today.replace(month=today.month + 1, day=1)
        days_in_month = (next_month - today.replace(day=1)).days
        
        return round(total_cost * days_in_month / days_elapsed, 2) if days_elapsed > 0 else 0
    
    def _safe_avg(self, values: List[float]) -> float:
        return sum(values) / len(values) if values else 0
    
    def _normalize_score(self, value: float, min_val: float, max_val: float, inverse: bool = False) -> float:
        """0-100のスコアに正規化"""
        if max_val == min_val:
            return 50
        score = (value - min_val) / (max_val - min_val) * 100
        score = max(0, min(100, score))
        return 100 - score if inverse else score
    
    def _estimate_model_latency(self, model_id: str) -> float:
        """モデルの推定レイテンシ"""
        if "micro" in model_id:
            return 0.3
        elif "lite" in model_id or "haiku" in model_id:
            return 0.8
        elif "pro" in model_id or "sonnet" in model_id:
            return 1.5
        elif "opus" in model_id or "premier" in model_id:
            return 2.5
        return 1.0
    
    def _estimate_quality_score(self, model_id: str, task_type: str) -> float:
        """モデルの品質スコア推定"""
        base_scores = {
            "opus": 95, "premier": 90, "sonnet": 85, "pro": 80,
            "haiku": 70, "lite": 65, "micro": 55
        }
        
        for key, score in base_scores.items():
            if key in model_id.lower():
                return score
        return 70
    
    def _generate_recommendations(self, model_analysis: Dict) -> Dict:
        """推奨モデルを生成"""
        if not model_analysis:
            return {}
        
        models = list(model_analysis.items())
        
        # 各軸でベスト
        best_cost = min(models, key=lambda x: x[1]["metrics"]["avg_cost_per_request"])
        best_speed = min(models, key=lambda x: x[1]["metrics"]["avg_latency_seconds"])
        best_balanced = max(models, key=lambda x: x[1]["scores"]["balanced"])
        
        return {
            "best_cost_efficiency": {
                "model_id": best_cost[0],
                "reason": f"最低コスト: ${best_cost[1]['metrics']['avg_cost_per_request']:.6f}/リクエスト"
            },
            "best_speed": {
                "model_id": best_speed[0],
                "reason": f"最速レスポンス: {best_speed[1]['metrics']['avg_latency_seconds']:.2f}秒"
            },
            "best_balanced": {
                "model_id": best_balanced[0],
                "reason": f"バランススコア: {best_balanced[1]['scores']['balanced']}/100"
            }
        }
