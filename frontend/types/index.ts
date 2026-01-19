export interface Model {
  id: string;
  name: string;
  provider: string;
  type: 'text' | 'image' | 'video' | 'audio';
}

export interface CostInfo {
  input_tokens: number;
  output_tokens: number;
  input_cost: number;
  output_cost: number;
  total_cost: number;
  currency: string;
}

export interface Result {
  execution_id: number;
  model_id: string;
  success: boolean;
  output: string;
  thinking?: string;  // 推論内容
  reasoning_enabled?: boolean;
  error?: string;
  error_code?: string;
  elapsed_time: number;
  timestamp: string;
  cost?: CostInfo;
  round?: number;  // 壁打ち用
  speaker_index?: number;
}

export interface ExecutionRequest {
  model_ids: string[];
  prompt: string;
  region: string;
  max_tokens: number;
  temperature: number;
  enable_reasoning?: boolean;
  reasoning_budget_tokens?: number;
}

export interface DebateRequest {
  model_ids: string[];
  topic: string;
  rounds: number;
  region: string;
  max_tokens: number;
  temperature: number;
  mode: 'debate' | 'brainstorm' | 'critique';
  enable_reasoning: boolean;
  reasoning_budget_tokens: number;
  include_human?: boolean;  // ユーザー参加フラグ
}

export interface DebateRound {
  round: number;
  results: Result[];
}

export interface DebateResponse {
  mode: string;
  topic: string;
  total_rounds: number;
  participants: string[];
  enable_reasoning: boolean;
  rounds: DebateRound[];
  summary: {
    total_exchanges: number;
    success_count: number;
    total_time: number;
  };
}

export interface Region {
  id: string;
  name: string;
}

export type ExecutionMode = 'compare' | 'debate' | 'conductor' | 'autoroute' | 'analytics' | 'explain' | 'benchmark' | 'image' | 'video' | 'code-editor';

// Auto Route
export interface AutoRouteRequest {
  prompt: string;
  criteria: 'balanced' | 'fastest' | 'cheapest' | 'best_quality';
  region: string;
  max_tokens: number;
  temperature: number;
  compare_with_alternatives: boolean;
}

export interface AutoRouteResult {
  routing: {
    selected_model: string;
    task_type: string;
    reason: string;
    alternatives: Array<{
      model_id: string;
      reason: string;
    }>;
  };
  results: Result[];
  summary: {
    total: number;
    success: number;
    primary_result: Result | null;
  };
}

// 指揮者モード
export interface ConductorRequest {
  conductor_model_id: string;
  worker_model_ids: string[];
  task: string;
  region: string;
  max_tokens: number;
  temperature: number;
  mode: 'delegate' | 'evaluate' | 'synthesize';
  enable_reasoning: boolean;
  reasoning_budget_tokens: number;
}

export interface ConductorPhase {
  phase: string;
  conductor_response?: Result;
  results?: Result[];
}

export interface ConductorResponse {
  mode: string;
  conductor_model: string;
  worker_models: string[];
  original_task: string;
  phases: ConductorPhase[];
  final_answer: string;
  summary: {
    total_calls: number;
    success_count: number;
    total_time: number;
    total_cost: number;
  };
}

// 壁打ちストリーミング用の型
export interface DebateStreamEvent {
  type: 'start' | 'round_start' | 'speaking' | 'speech' | 'round_end' | 'complete' | 'error' | 'waiting_human';
  mode?: string;
  topic?: string;
  total_rounds?: number;
  participants?: string[];
  round?: number;
  speaker_index?: number;
  model_id?: string;
  data?: Result;
  summary?: {
    total_exchanges: number;
    success_count: number;
    total_time: number;
  };
  message?: string;
  session_id?: string;  // ユーザー入力待ち用
}

export interface DebateProgress {
  currentRound: number;
  totalRounds: number;
  currentSpeaker: string | null;
  speakerIndex: number;
  isComplete: boolean;
  waitingForHuman?: boolean;  // ユーザー入力待ち
  sessionId?: string;
}

// 画像生成
export interface ImageGenerationRequest {
  model_ids: string[];
  prompt: string;
  negative_prompt?: string;
  region: string;
  width: number;
  height: number;
  num_images: number;
  cfg_scale: number;
  seed?: number;
  max_workers?: number;
}

export interface ImageResult {
  execution_id: number;
  model_id: string;
  success: boolean;
  images?: string[];  // Base64エンコードされた画像
  num_images?: number;
  width?: number;
  height?: number;
  error?: string;
  error_code?: string;
  elapsed_time: number;
  timestamp: string;
}

export interface ImageGenerationResponse {
  results: ImageResult[];
  summary: {
    total: number;
    success: number;
    failed: number;
    total_images: number;
    average_time: number;
  };
}

// 動画生成
export interface VideoGenerationRequest {
  model_ids: string[];
  prompt: string;
  s3_output_base_uri?: string;  // Optional - uses VIDEO_S3_OUTPUT_URI from .env if not provided
  region: string;
  duration_seconds: number;
  fps: number;
  dimension: string;
  seed?: number;
  max_workers?: number;
}

export interface VideoResult {
  execution_id: number;
  model_id: string;
  success: boolean;
  invocation_arn?: string;
  s3_output_uri?: string;
  status?: string;
  duration_seconds?: number;
  dimension?: string;
  error?: string;
  error_code?: string;
  elapsed_time: number;
  timestamp: string;
}

export interface VideoGenerationResponse {
  results: VideoResult[];
  summary: {
    total: number;
    success: number;
    failed: number;
    average_time: number;
    note?: string;
  };
}

export interface VideoStatusRequest {
  invocation_arns: string[];
  region: string;
}

export interface VideoStatus {
  success: boolean;
  invocation_arn: string;
  status: string;
  output_location?: string;
  failure_message?: string;
  submit_time?: string;
  end_time?: string;
  error?: string;
}

export interface VideoStatusResponse {
  statuses: VideoStatus[];
  summary: {
    total: number;
    completed: number;
    in_progress: number;
    failed: number;
  };
}

// 画像/動画ストリーミングイベント
export interface MediaStreamEvent {
  type: 'start' | 'result' | 'complete' | 'error';
  total?: number;
  data?: ImageResult | VideoResult;
  message?: string;
}

// ワークスペース関連
export interface Workspace {
  name: string;
  path: string;
  created_at: string;
  modified_at: string;
  file_count: number;
  total_size_bytes: number;
}

export interface WorkspaceFile {
  path: string;
  name: string;
  size: number;
  modified_at: string;
}

export interface WorkspaceTaskResult {
  workspace: string;
  task: string;
  results: Result[];
  summary: {
    total: number;
    success: number;
    failed: number;
  };
}
