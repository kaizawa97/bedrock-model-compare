// Analytics & Dashboard Types

export interface DashboardSummary {
  today: {
    total_cost: number;
    total_requests: number;
    total_tokens: number;
    avg_latency: number;
    success_rate: number;
  };
  month: {
    total_cost: number;
    total_requests: number;
    total_tokens: number;
    projected_cost: number;
  };
}

export interface BudgetInfo {
  daily: {
    limit: number;
    used: number;
    remaining: number;
  };
  monthly: {
    limit: number;
    used: number;
    remaining: number;
  };
}

export interface ModelBreakdown {
  model_id: string;
  model_name: string;
  total_cost: number;
  request_count: number;
  total_tokens: number;
  avg_latency: number;
}

export interface HourlyTrend {
  hour: string;
  cost: number;
}

export interface Alert {
  type: string;
  message: string;
  current: number;
  limit: number;
  timestamp: string;
}

export interface DashboardData {
  summary: DashboardSummary;
  budget: BudgetInfo;
  model_breakdown: ModelBreakdown[];
  hourly_trend: HourlyTrend[];
  alerts: Alert[];
  timestamp: string;
}

// Explainability Types

export interface ExplanationResponse {
  selected_model: {
    id: string;
    name: string;
    quality_tier: string;
  };
  explanation: {
    summary: string;
    detailed: string;
    key_factors: string[];
  };
  scoring: {
    overall_score: number;
    breakdown: Array<{
      name: string;
      score: number;
      weight: number;
      weighted_score: number;
    }>;
    criteria_used: string;
  };
  task_analysis: {
    type: string;
    description: string;
    required_capabilities: string[];
  };
  prompt_analysis: {
    token_count: number;
    character_count: number;
    detected_features: string[];
    complexity: string;
  };
  comparison: Array<{
    model_id: string;
    model_name: string;
    score: number;
    score_difference: number;
    reason_not_selected: string;
    strengths: string[];
    weaknesses: string[];
  }>;
  confidence: {
    level: string;
    score: number;
    description: string;
  };
}

// Benchmark Types

export interface BenchmarkTask {
  id: string;
  name: string;
  category: string;
  difficulty: string;
  expected_capabilities: string[];
}

export interface BenchmarkModelStats {
  model_name: string;
  total_tasks: number;
  successful_tasks: number;
  success_rate: number;
  avg_latency: number;
  total_cost: number;
  total_tokens: number;
  avg_quality_score: number;
  by_category: Record<string, {
    success_rate: number;
    avg_latency: number;
    task_count: number;
  }>;
}

export interface BenchmarkRanking {
  model_id: string;
  model_name?: string;
  value?: number;
  overall_score?: number;
  quality_score?: number;
  speed_score?: number;
  cost_score?: number;
}

export interface BenchmarkRecommendation {
  type: string;
  title: string;
  model_id: string;
  reason: string;
}

export interface BenchmarkReport {
  summary: {
    total_models: number;
    total_tasks: number;
    total_executions: number;
    successful_executions: number;
    total_time_seconds: number;
    total_cost_usd: number;
    timestamp: string;
  };
  model_performance: Record<string, BenchmarkModelStats>;
  category_analysis: Record<string, {
    task_count: number;
    best_model: string | null;
    best_latency: number;
    best_success_rate: number;
  }>;
  rankings: {
    by_quality: BenchmarkRanking[];
    by_speed: BenchmarkRanking[];
    by_cost_efficiency: BenchmarkRanking[];
    overall: BenchmarkRanking[];
  };
  recommendations: BenchmarkRecommendation[];
  detailed_results: Array<{
    task_id: string;
    model_id: string;
    success: boolean;
    latency: number;
    cost: number;
    quality_score: number | null;
    quality_feedback: string | null;
    output_preview: string | null;
    error: string | null;
  }>;
}

export interface BenchmarkPreset {
  id: string;
  name: string;
  description: string;
  model_ids: string[];
  recommended_categories: string[] | null;
}
