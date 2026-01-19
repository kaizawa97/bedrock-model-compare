'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Workspace, WorkspaceFile, WorkspaceTaskResult, Model, Result } from '@/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface CodeEditorViewProps {
  apiBase: string;
  models: Model[];
}

interface CodeServerStatus {
  code_server_running: boolean;
  code_server_url: string;
  workspace_path: string;
  message?: string;
}

interface BackgroundTask {
  id: string;
  workspace: string;
  task: string;
  status: 'pending' | 'running' | 'completed' | 'stopped' | 'error' | 'cancelled';
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  iteration: number;
  progress: number;
  analysis: string;
  files_created: string[];
  current_phase: string | null;
  current_phase_name?: string;
  current_phase_id?: number;
  total_phases?: number;
  phases?: Array<{
    phase_id: number;
    name: string;
    description: string;
  }>;
  is_complete: boolean;
  error: string | null;
  // モデル情報
  conductor_model?: string;
  worker_models?: string[];
  worker_count?: number;
  max_parallel_workers?: number;
  active_workers?: number;
}

interface TaskLog {
  type: string;
  message: string;
  timestamp: string;
}

export default function CodeEditorView({ apiBase, models }: CodeEditorViewProps) {
  // ワークスペース関連
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);

  // code-server関連
  const [codeServerStatus, setCodeServerStatus] = useState<CodeServerStatus | null>(null);
  const [showIframe, setShowIframe] = useState(false);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  // タスク実行関連
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [task, setTask] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [taskResults, setTaskResults] = useState<WorkspaceTaskResult | null>(null);
  const [showTaskPanel, setShowTaskPanel] = useState(false);
  const [taskMode, setTaskMode] = useState<'compare' | 'debate' | 'autonomous'>('compare');

  // 結果モーダル
  const [selectedResult, setSelectedResult] = useState<Result | null>(null);

  // 壁打ち関連
  const [debateRounds, setDebateRounds] = useState(3);
  const [debateResults, setDebateResults] = useState<Array<{ round: number; model: string; output: string; elapsed_time: number }>>([]);

  // 自律型指揮者関連
  const [conductorModel, setConductorModel] = useState<string>('');
  const [maxIterations, setMaxIterations] = useState(100);
  const [maxParallelWorkers, setMaxParallelWorkers] = useState(10);
  const [autonomousProgress, setAutonomousProgress] = useState<{
    iteration: number;
    progress: number;
    analysis: string;
    filesCreated: string[];
    isComplete: boolean;
    logs: Array<{ type: string; message: string; timestamp: Date }>;
    currentPhase?: string;
    currentPhaseName?: string;
    currentPhaseId?: number;
    totalPhases?: number;
    phases?: Array<{ phase_id: number; name: string; description: string }>;
    task?: string;
    startedAt?: string;
  }>(() => {
    // LocalStorageから復元
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('autonomousProgress');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // timestampをDateオブジェクトに変換
          if (parsed.logs) {
            parsed.logs = parsed.logs.map((log: { type: string; message: string; timestamp: string }) => ({
              ...log,
              timestamp: new Date(log.timestamp),
            }));
          }
          return parsed;
        } catch {
          // パースエラーは無視
        }
      }
    }
    return {
      iteration: 0,
      progress: 0,
      analysis: '',
      filesCreated: [],
      isComplete: false,
      logs: [],
      workerCount: 0,
      maxParallelWorkers: 0,
      activeWorkers: 0,
    };
  });

  // 計画関連
  const [planningPhase, setPlanningPhase] = useState<'none' | 'generating' | 'review' | 'executing'>('none');

  // ログモーダル
  const [showLogModal, setShowLogModal] = useState(false);

  // 汎用モーダル
  const [modal, setModal] = useState<{
    show: boolean;
    type: 'info' | 'error' | 'success' | 'warning' | 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
    onCancel?: () => void;
    onThird?: () => void;
    confirmText?: string;
    cancelText?: string;
    thirdText?: string;
  }>({
    show: false,
    type: 'info',
    title: '',
    message: '',
  });

  // モーダル表示ヘルパー関数
  const showModal = useCallback((
    type: 'info' | 'error' | 'success' | 'warning' | 'confirm',
    title: string,
    message: string,
    options?: {
      onConfirm?: () => void;
      onCancel?: () => void;
      onThird?: () => void;
      confirmText?: string;
      cancelText?: string;
      thirdText?: string;
    }
  ) => {
    setModal({
      show: true,
      type,
      title,
      message,
      onConfirm: options?.onConfirm,
      onCancel: options?.onCancel,
      onThird: options?.onThird,
      confirmText: options?.confirmText,
      cancelText: options?.cancelText,
      thirdText: options?.thirdText,
    });
  }, []);

  const closeModal = useCallback(() => {
    setModal(prev => ({ ...prev, show: false }));
  }, []);
  const [generatedPlan, setGeneratedPlan] = useState<{
    project_name: string;
    description: string;
    architecture: string;
    phases: Array<{
      phase_id: number;
      name: string;
      description: string;
      estimated_iterations: number;
      files_to_create: Array<{
        path: string;
        description: string;
        dependencies: string[];
        can_parallelize: boolean;
      }>;
      completion_criteria: string;
    }>;
    final_structure: string[];
    completion_criteria: string;
    risks: string[];
  } | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planFeedback, setPlanFeedback] = useState<string>('');  // 計画へのフィードバック

  // バックグラウンドタスク関連
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([]);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('currentTaskId');
    }
    return null;
  });
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
  const [showTaskList, setShowTaskList] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [additionalInstruction, setAdditionalInstruction] = useState<string>('');  // 追加指示
  const [isSendingInstruction, setIsSendingInstruction] = useState(false);

  // 新規ワークスペース作成
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');

  // ファイルアップロード
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // ファイルソート
  const [fileSortBy, setFileSortBy] = useState<'name' | 'modified' | 'size'>('name');
  const [fileSortOrder, setFileSortOrder] = useState<'asc' | 'desc'>('asc');

  // code-serverステータス取得
  const fetchCodeServerStatus = async () => {
    try {
      const response = await fetch(`${apiBase}/api/workspace/status`);
      const data = await response.json();
      setCodeServerStatus(data);
    } catch (error) {
      console.error('Failed to fetch code-server status:', error);
    }
  };

  // ワークスペース一覧取得
  const fetchWorkspaces = async () => {
    try {
      setIsLoadingWorkspaces(true);
      const response = await fetch(`${apiBase}/api/workspace/list`);
      const data = await response.json();
      setWorkspaces(data.workspaces);
    } catch (error) {
      console.error('Failed to fetch workspaces:', error);
    } finally {
      setIsLoadingWorkspaces(false);
    }
  };

  // ワークスペースファイル一覧取得
  const fetchWorkspaceFiles = async (name: string) => {
    try {
      const response = await fetch(`${apiBase}/api/workspace/${name}/files`);
      const data = await response.json();
      setWorkspaceFiles(data.files);
    } catch (error) {
      console.error('Failed to fetch workspace files:', error);
    }
  };

  // ソートされたファイル一覧
  const sortedFiles = useMemo(() => {
    const sorted = [...workspaceFiles].sort((a, b) => {
      let comparison = 0;
      switch (fileSortBy) {
        case 'name':
          comparison = a.path.localeCompare(b.path);
          break;
        case 'modified':
          comparison = new Date(a.modified_at).getTime() - new Date(b.modified_at).getTime();
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
      }
      return fileSortOrder === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [workspaceFiles, fileSortBy, fileSortOrder]);

  // ファイルをVSCodeで開く（iframe内で開く）
  const openFileInVSCode = (filePath: string) => {
    if (codeServerStatus?.code_server_url && selectedWorkspace) {
      // code-serverのURLにファイルパスを追加してiframe内で開く
      const workspacePath = `/workspace/${selectedWorkspace}`;
      const fullPath = `${workspacePath}/${filePath}`;
      const url = `${codeServerStatus.code_server_url}/?folder=${encodeURIComponent(workspacePath)}&file=${encodeURIComponent(fullPath)}`;
      setIframeUrl(url);
      setShowIframe(true);
    }
  };

  // ソートを切り替える
  const toggleSort = (sortKey: 'name' | 'modified' | 'size') => {
    if (fileSortBy === sortKey) {
      // 同じキーならorderを反転
      setFileSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // 違うキーなら新しいキーでascにリセット
      setFileSortBy(sortKey);
      setFileSortOrder('asc');
    }
  };

  // ソートアイコン
  const SortIcon = ({ sortKey }: { sortKey: 'name' | 'modified' | 'size' }) => {
    if (fileSortBy !== sortKey) return null;
    return (
      <span className="ml-1">
        {fileSortOrder === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  // autonomousProgressをlocalStorageに保存
  useEffect(() => {
    if (autonomousProgress.logs.length > 0 || autonomousProgress.iteration > 0) {
      localStorage.setItem('autonomousProgress', JSON.stringify(autonomousProgress));
    }
  }, [autonomousProgress]);

  // currentTaskIdをlocalStorageに保存
  useEffect(() => {
    if (currentTaskId) {
      localStorage.setItem('currentTaskId', currentTaskId);
    } else {
      localStorage.removeItem('currentTaskId');
    }
  }, [currentTaskId]);

  // バックグラウンドタスク一覧を取得
  const fetchBackgroundTasks = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/workspace/tasks/list`);
      const data = await response.json();
      setBackgroundTasks(data.tasks || []);
    } catch (error) {
      console.error('Failed to fetch background tasks:', error);
    }
  }, [apiBase]);

  // 特定タスクの状態を取得
  const fetchTaskStatus = useCallback(async (taskId: string) => {
    try {
      const response = await fetch(`${apiBase}/api/workspace/tasks/${taskId}`);
      if (!response.ok) return null;
      return await response.json() as BackgroundTask;
    } catch (error) {
      console.error('Failed to fetch task status:', error);
      return null;
    }
  }, [apiBase]);

  // タスクログを取得
  const fetchTaskLogs = useCallback(async (taskId: string): Promise<Array<{ type: string; message: string; timestamp: string }>> => {
    try {
      const response = await fetch(`${apiBase}/api/workspace/tasks/${taskId}/logs?limit=500`);
      if (!response.ok) return [];
      const data = await response.json();
      const logs = data.logs || [];
      setTaskLogs(logs);
      return logs;
    } catch (error) {
      console.error('Failed to fetch task logs:', error);
      return [];
    }
  }, [apiBase]);

  // ポーリング開始
  const startPolling = useCallback((taskId: string) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    const poll = async () => {
      const task = await fetchTaskStatus(taskId);
      if (task) {
        // autonomousProgressを更新
        setAutonomousProgress(prev => ({
          ...prev,
          iteration: task.iteration,
          progress: task.progress,
          analysis: task.analysis,
          filesCreated: task.files_created,
          isComplete: task.is_complete,
          currentPhase: task.current_phase || undefined,
          currentPhaseName: task.current_phase_name || undefined,
          currentPhaseId: task.current_phase_id || undefined,
          totalPhases: task.total_phases || undefined,
          phases: task.phases || undefined,
          workerCount: task.worker_count || prev.workerCount,
          maxParallelWorkers: task.max_parallel_workers || prev.maxParallelWorkers,
          activeWorkers: task.active_workers ?? prev.activeWorkers,
        }));

        // ログを取得してautonomousProgressに反映
        const logs = await fetchTaskLogs(taskId);
        if (logs.length > 0) {
          setAutonomousProgress(prev => ({
            ...prev,
            logs: logs.map(log => ({
              type: log.type,
              message: log.message,
              timestamp: new Date(log.timestamp),
            })),
          }));
        }

        // ワークスペースのファイル一覧を更新
        if (selectedWorkspace) {
          fetchWorkspaceFiles(selectedWorkspace);
        }

        // タスクが完了またはエラーの場合はポーリング停止
        if (['completed', 'stopped', 'error', 'cancelled'].includes(task.status)) {
          stopPolling();
          setIsExecuting(false);
          setPlanningPhase('none');
        }
      }
    };

    // 即時実行してから定期実行
    poll();
    pollingIntervalRef.current = setInterval(poll, 2000);
  }, [fetchTaskStatus, fetchTaskLogs, selectedWorkspace]);

  // ポーリング停止
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // バックグラウンドタスク開始
  const startBackgroundTask = async () => {
    if (!selectedWorkspace || !conductorModel || selectedModels.length === 0 || !task.trim()) {
      showModal('warning', '入力エラー', 'ワークスペース、指揮者モデル、ワーカーモデル、タスクを選択/入力してください');
      return;
    }

    setIsExecuting(true);
    setPlanningPhase('executing');
    setAutonomousProgress({
      iteration: 0,
      progress: 0,
      analysis: '',
      filesCreated: [],
      isComplete: false,
      logs: [],
    });

    try {
      const response = await fetch(`${apiBase}/api/workspace/${selectedWorkspace}/autonomous-conductor/background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conductor_model_id: conductorModel,
          worker_model_ids: selectedModels.filter(m => m !== conductorModel),
          task: task.trim(),
          max_iterations: maxIterations,
          max_tokens: 4000,
          temperature: 0.7,
          max_parallel_workers: maxParallelWorkers,
          approved_plan: generatedPlan,
        }),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      if (data.success && data.task_id) {
        setCurrentTaskId(data.task_id);
        startPolling(data.task_id);
      }
    } catch (error) {
      console.error('Failed to start background task:', error);
      showModal('error', 'エラー', 'バックグラウンドタスクの開始に失敗しました');
      setIsExecuting(false);
      setPlanningPhase('none');
    }
  };

  // タスクをキャンセル（パージオプション付き）
  const cancelTask = async (taskId: string, purgeFiles: boolean = false, purgeLogs: boolean = false) => {
    try {
      const response = await fetch(`${apiBase}/api/workspace/tasks/${taskId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purge_files: purgeFiles,
          purge_logs: purgeLogs,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        stopPolling();
        setIsExecuting(false);
        setPlanningPhase('none');
        setCurrentTaskId(null);
        // ログもクリア
        if (purgeLogs) {
          setAutonomousProgress(prev => ({
            ...prev,
            logs: [],
            filesCreated: [],
          }));
        }
        // ワークスペースファイル一覧を更新
        if (purgeFiles && selectedWorkspace) {
          fetchWorkspaceFiles(selectedWorkspace);
        }
        fetchBackgroundTasks();

        if (data.purged_files?.length > 0) {
          showModal('success', '削除完了', `${data.purged_files.length}個のファイルを削除しました`);
        }
      }
    } catch (error) {
      console.error('Failed to cancel task:', error);
    }
  };

  // パージ確認付きキャンセル
  const cancelTaskWithConfirm = (taskId: string) => {
    showModal('confirm', 'タスクをキャンセル',
      '作成されたファイルをどうしますか？',
      {
        confirmText: 'ファイルを削除してキャンセル',
        cancelText: 'ファイルを残してキャンセル',
        thirdText: '何もしない',
        onConfirm: () => cancelTask(taskId, true, true),
        onCancel: () => cancelTask(taskId, false, false),
        onThird: () => {}, // モーダルを閉じるだけ
      }
    );
  };

  // 追加指示を送信
  const sendAdditionalInstruction = async () => {
    if (!currentTaskId || !additionalInstruction.trim()) return;

    setIsSendingInstruction(true);
    try {
      const response = await fetch(`${apiBase}/api/workspace/tasks/${currentTaskId}/instruction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: additionalInstruction.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // ログに追加
        setAutonomousProgress(prev => ({
          ...prev,
          logs: [...prev.logs, {
            type: 'instruction',
            message: `追加指示を送信: ${additionalInstruction.trim().slice(0, 50)}...`,
            timestamp: new Date(),
          }],
        }));
        setAdditionalInstruction('');
        showModal('success', '送信完了', data.message || '追加指示を送信しました');
      } else {
        const error = await response.json();
        showModal('error', 'エラー', error.detail || '追加指示の送信に失敗しました');
      }
    } catch (error) {
      console.error('Failed to send instruction:', error);
      showModal('error', 'エラー', '追加指示の送信に失敗しました');
    } finally {
      setIsSendingInstruction(false);
    }
  };

  // タスクを再開
  const resumeTask = async (taskId: string) => {
    try {
      const response = await fetch(`${apiBase}/api/workspace/tasks/${taskId}/resume`, {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        if (data.task_id) {
          setCurrentTaskId(data.task_id);
          setIsExecuting(true);
          setPlanningPhase('executing');
          startPolling(data.task_id);
        }
      }
    } catch (error) {
      console.error('Failed to resume task:', error);
      showModal('error', 'エラー', 'タスクの再開に失敗しました');
    }
  };

  // タスクを削除
  const deleteTask = (taskId: string) => {
    showModal('confirm', 'タスクを削除', 'このタスクを削除しますか？', {
      confirmText: '削除',
      cancelText: 'キャンセル',
      onConfirm: async () => {
        try {
          const response = await fetch(`${apiBase}/api/workspace/tasks/${taskId}`, {
            method: 'DELETE',
          });
          if (response.ok) {
            if (currentTaskId === taskId) {
              setCurrentTaskId(null);
              stopPolling();
            }
            fetchBackgroundTasks();
          }
        } catch (error) {
          console.error('Failed to delete task:', error);
        }
      },
    });
  };

  // 初期ロード
  useEffect(() => {
    fetchCodeServerStatus();
    fetchWorkspaces();
    fetchBackgroundTasks();
  }, [fetchBackgroundTasks]);

  // currentTaskIdがある場合はポーリング開始
  useEffect(() => {
    if (currentTaskId) {
      fetchTaskStatus(currentTaskId).then(task => {
        if (task && task.status === 'running') {
          setTaskMode('autonomous');
          setIsExecuting(true);
          setPlanningPhase('executing');
          startPolling(currentTaskId);
        } else if (task) {
          // 完了済みタスクの状態を復元
          setTaskMode('autonomous');
          setAutonomousProgress({
            iteration: task.iteration,
            progress: task.progress,
            analysis: task.analysis,
            filesCreated: task.files_created,
            isComplete: task.is_complete,
            logs: [],
            currentPhase: task.current_phase || undefined,
            currentPhaseName: task.current_phase_name || undefined,
            currentPhaseId: task.current_phase_id || undefined,
            totalPhases: task.total_phases || undefined,
            phases: task.phases || undefined,
          });
          fetchTaskLogs(currentTaskId);
        }
      });
    }
    return () => stopPolling();
  }, []);

  // ワークスペース選択時にファイル一覧を取得
  useEffect(() => {
    if (selectedWorkspace) {
      fetchWorkspaceFiles(selectedWorkspace);
    }
  }, [selectedWorkspace]);

  // ワークスペース作成
  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;

    try {
      const response = await fetch(`${apiBase}/api/workspace/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWorkspaceName.trim() }),
      });

      if (response.ok) {
        await fetchWorkspaces();
        setNewWorkspaceName('');
        setShowCreateModal(false);
      } else {
        const error = await response.json();
        showModal('error', 'エラー', error.detail || 'ワークスペース作成に失敗しました');
      }
    } catch (error) {
      console.error('Failed to create workspace:', error);
    }
  };

  // ワークスペース削除
  const handleDeleteWorkspace = (name: string) => {
    showModal('confirm', 'ワークスペースを削除', `ワークスペース "${name}" を削除しますか？`, {
      confirmText: '削除',
      cancelText: 'キャンセル',
      onConfirm: async () => {
        try {
          const response = await fetch(`${apiBase}/api/workspace/${name}`, {
            method: 'DELETE',
          });

          if (response.ok) {
            if (selectedWorkspace === name) {
              setSelectedWorkspace(null);
              setWorkspaceFiles([]);
            }
            await fetchWorkspaces();
          }
        } catch (error) {
          console.error('Failed to delete workspace:', error);
        }
      },
    });
  };

  // ファイルアップロード
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedWorkspace) return;

    const formData = new FormData();
    formData.append('workspace_name', selectedWorkspace);

    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const response = await fetch(`${apiBase}/api/workspace/upload`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        await fetchWorkspaceFiles(selectedWorkspace);
        await fetchWorkspaces();
      } else {
        const error = await response.json();
        showModal('error', 'エラー', error.detail || 'アップロードに失敗しました');
      }
    } catch (error) {
      console.error('Failed to upload files:', error);
    }
  };

  // ドラッグ&ドロップ
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  }, [selectedWorkspace]);

  // モデル選択トグル
  const toggleModel = (modelId: string) => {
    setSelectedModels(prev =>
      prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    );
  };

  // タスク実行
  const handleExecuteTask = async () => {
    if (!selectedWorkspace || selectedModels.length === 0 || !task.trim()) {
      showModal('warning', '入力エラー', 'ワークスペース、モデル、タスクを選択/入力してください');
      return;
    }

    setIsExecuting(true);
    setTaskResults(null);

    try {
      const response = await fetch(`${apiBase}/api/workspace/${selectedWorkspace}/execute-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_ids: selectedModels,
          task: task.trim(),
          max_tokens: 4000,
          temperature: 0.7,
        }),
      });

      const data: WorkspaceTaskResult = await response.json();
      setTaskResults(data);
    } catch (error) {
      console.error('Failed to execute task:', error);
      showModal('error', 'エラー', 'タスク実行に失敗しました');
    } finally {
      setIsExecuting(false);
    }
  };

  // 壁打ち実行
  const handleDebateTask = async () => {
    if (!selectedWorkspace || selectedModels.length < 2 || !task.trim()) {
      showModal('warning', '入力エラー', 'ワークスペース、2つ以上のモデル、タスクを選択/入力してください');
      return;
    }

    setIsExecuting(true);
    setDebateResults([]);
    setTaskResults(null);

    try {
      const response = await fetch(`${apiBase}/api/workspace/${selectedWorkspace}/debate-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_ids: selectedModels,
          task: task.trim(),
          rounds: debateRounds,
          max_tokens: 4000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'speech' && event.data) {
              setDebateResults(prev => [...prev, {
                round: event.round || 0,
                model: event.data.model_id,
                output: event.data.output || '',
                elapsed_time: event.data.elapsed_time || 0,
              }]);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to execute debate:', error);
      showModal('error', 'エラー', '壁打ち実行に失敗しました');
    } finally {
      setIsExecuting(false);
    }
  };

  // 計画生成
  const handleGeneratePlan = async (feedback?: string) => {
    if (!selectedWorkspace || !conductorModel || selectedModels.length === 0 || !task.trim()) {
      showModal('warning', '入力エラー', 'ワークスペース、指揮者モデル、ワーカーモデル、タスクを選択/入力してください');
      return;
    }

    const feedbackToSend = feedback || planFeedback || undefined;

    // 前回の計画を安全にコピー（フィードバックがある場合のみ）
    let previousPlanCopy: typeof generatedPlan | undefined = undefined;
    if (feedbackToSend && generatedPlan) {
      try {
        // 必要なフィールドのみを抽出してコピー
        previousPlanCopy = {
          project_name: generatedPlan.project_name,
          description: generatedPlan.description,
          architecture: generatedPlan.architecture,
          phases: generatedPlan.phases.map(phase => ({
            phase_id: phase.phase_id,
            name: phase.name,
            description: phase.description,
            estimated_iterations: phase.estimated_iterations,
            files_to_create: phase.files_to_create.map(file => ({
              path: file.path,
              description: file.description,
              dependencies: [...file.dependencies],
              can_parallelize: file.can_parallelize,
            })),
            completion_criteria: phase.completion_criteria,
          })),
          final_structure: [...generatedPlan.final_structure],
          completion_criteria: generatedPlan.completion_criteria,
          risks: generatedPlan.risks ? [...generatedPlan.risks] : [],
        };
      } catch (copyError) {
        console.error('Failed to copy previous plan:', copyError);
        // コピーに失敗した場合は前回の計画なしで続行
        previousPlanCopy = undefined;
      }
    }

    setPlanningPhase('generating');
    setGeneratedPlan(null);
    setPlanError(null);

    try {
      const requestBody: Record<string, unknown> = {
        conductor_model_id: conductorModel,
        worker_model_ids: selectedModels.filter(m => m !== conductorModel),
        task: task.trim(),
        max_iterations: maxIterations,
        max_tokens: 4000,
        temperature: 0.7,
        max_parallel_workers: maxParallelWorkers,
      };

      // フィードバックがある場合のみ追加
      if (feedbackToSend) {
        requestBody.feedback = feedbackToSend;
        if (previousPlanCopy) {
          requestBody.previous_plan = previousPlanCopy;
        }
      }

      const response = await fetch(`${apiBase}/api/workspace/${selectedWorkspace}/autonomous-conductor/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      if (data.success && data.plan) {
        setGeneratedPlan(data.plan);
        setPlanningPhase('review');
        setPlanFeedback('');  // フィードバックをクリア
      } else {
        setPlanError('計画の生成に失敗しました: ' + (data.raw_output || 'Unknown error'));
        setPlanningPhase('none');
      }
    } catch (error) {
      console.error('Failed to generate plan:', error);
      setPlanError('計画生成中にエラーが発生しました');
      setPlanningPhase('none');
    }
  };

  // 計画を承認して実行
  const handleApprovePlanAndExecute = async () => {
    if (!generatedPlan) return;

    setPlanningPhase('executing');
    setIsExecuting(true);
    setAutonomousProgress({
      iteration: 0,
      progress: 0,
      analysis: '',
      filesCreated: [],
      isComplete: false,
      logs: [],
      task: task.trim(),
      startedAt: new Date().toISOString(),
    });
    setTaskResults(null);
    setDebateResults([]);

    try {
      // バックグラウンドタスクとして実行
      const response = await fetch(`${apiBase}/api/workspace/${selectedWorkspace}/autonomous-conductor/background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conductor_model_id: conductorModel,
          worker_model_ids: selectedModels.filter(m => m !== conductorModel),
          task: task.trim(),
          max_iterations: maxIterations,
          max_tokens: 4000,
          temperature: 0.7,
          max_parallel_workers: maxParallelWorkers,
          approved_plan: generatedPlan,
        }),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      if (data.success && data.task_id) {
        setCurrentTaskId(data.task_id);
        startPolling(data.task_id);
      } else {
        throw new Error('タスクIDが取得できませんでした');
      }
    } catch (error) {
      console.error('Failed to execute with plan:', error);
      showModal('error', 'エラー', '計画に基づく実行に失敗しました');
      setIsExecuting(false);
      setPlanningPhase('none');
    }
  };

  // 計画なしで直接実行（バックグラウンドタスク）
  const handleAutonomousConductorDirect = async () => {
    if (!selectedWorkspace || !conductorModel || selectedModels.length === 0 || !task.trim()) {
      showModal('warning', '入力エラー', 'ワークスペース、指揮者モデル、ワーカーモデル、タスクを選択/入力してください');
      return;
    }

    setIsExecuting(true);
    setPlanningPhase('executing');
    setAutonomousProgress({
      iteration: 0,
      progress: 0,
      analysis: '',
      filesCreated: [],
      isComplete: false,
      logs: [],
      task: task.trim(),
      startedAt: new Date().toISOString(),
    });
    setTaskResults(null);
    setDebateResults([]);

    try {
      // バックグラウンドタスクとして実行
      const response = await fetch(`${apiBase}/api/workspace/${selectedWorkspace}/autonomous-conductor/background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conductor_model_id: conductorModel,
          worker_model_ids: selectedModels.filter(m => m !== conductorModel),
          task: task.trim(),
          max_iterations: maxIterations,
          max_tokens: 4000,
          temperature: 0.7,
          max_parallel_workers: maxParallelWorkers,
        }),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      if (data.success && data.task_id) {
        setCurrentTaskId(data.task_id);
        startPolling(data.task_id);
      } else {
        throw new Error('タスクIDが取得できませんでした');
      }
    } catch (error) {
      console.error('Failed to execute autonomous conductor:', error);
      showModal('error', 'エラー', '自律型指揮者の実行に失敗しました');
      setIsExecuting(false);
      setPlanningPhase('none');
    }
  };

  // ストリームレスポンスを処理する共通関数
  const processAutonomousStream = async (response: Response) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    if (!reader) return;

    const addLog = (type: string, message: string) => {
      setAutonomousProgress(prev => ({
        ...prev,
        logs: [...prev.logs.slice(-50), { type, message, timestamp: new Date() }],
      }));
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const event = JSON.parse(line.slice(6));

          switch (event.type) {
            case 'start':
              addLog('info', `タスク開始: ${event.task}${event.parallel_mode ? ` (並列モード: ${event.worker_count}ワーカー)` : ''}${event.has_plan ? ' [計画あり]' : ''}`);
              break;
            case 'plan_loaded':
              addLog('plan', `計画読み込み: ${event.plan?.project_name || 'N/A'} (${event.plan?.phases?.length || 0}フェーズ)`);
              break;
            case 'iteration_start':
              setAutonomousProgress(prev => ({ ...prev, iteration: event.iteration }));
              addLog('iteration', `イテレーション ${event.iteration} 開始`);
              break;
            case 'phase_start':
              setAutonomousProgress(prev => ({ ...prev, currentPhase: event.phase_name }));
              addLog('phase', `フェーズ開始: ${event.phase_name}`);
              break;
            case 'decision':
              setAutonomousProgress(prev => ({
                ...prev,
                progress: event.progress || 0,
                analysis: event.analysis || '',
              }));
              const parallelInfo = event.parallel_tasks_count ? ` (${event.parallel_tasks_count}タスク並列)` : '';
              addLog('decision', `進捗 ${event.progress}%${parallelInfo}: ${event.analysis?.slice(0, 80)}`);
              break;
            case 'parallel_start':
              addLog('parallel', `並列実行開始: ${event.task_count}タスクを同時実行`);
              break;
            case 'parallel_complete':
              addLog('parallel', `並列実行完了: ${event.files_created}ファイル作成`);
              break;
            case 'file_created':
              setAutonomousProgress(prev => ({
                ...prev,
                filesCreated: [...new Set([...prev.filesCreated, event.path])],
              }));
              const parallelTag = event.parallel ? ' [並列]' : '';
              addLog('file', `ファイル作成${parallelTag}: ${event.path}`);
              // ファイル一覧を更新
              if (selectedWorkspace) fetchWorkspaceFiles(selectedWorkspace);
              break;
            case 'file_deleted':
              addLog('file', `ファイル削除: ${event.path}`);
              if (selectedWorkspace) fetchWorkspaceFiles(selectedWorkspace);
              break;
            case 'worker_start':
              addLog('worker', `ワーカー実行開始: ${event.task?.slice(0, 50)}`);
              break;
            case 'worker_complete':
              addLog('worker', `ワーカー完了: ${event.count}件の結果`);
              break;
            case 'task_complete':
              setAutonomousProgress(prev => ({ ...prev, isComplete: true, progress: 100 }));
              addLog('success', `タスク完了: ${event.reason}`);
              break;
            case 'complete':
              addLog('info', `処理終了: ${event.total_iterations}イテレーション, ${event.files_created?.length || 0}ファイル作成`);
              break;
            case 'error':
              addLog('error', `エラー: ${event.message}`);
              break;
          }
        }
      }
    }
  };

  // code-serverをiframeで開く
  const openCodeServer = () => {
    if (codeServerStatus?.code_server_running) {
      setShowIframe(true);
    } else {
      showModal('warning', 'code-server未起動', 'code-serverが起動していません。\n\n./start.sh を実行してください。');
    }
  };

  // ファイルサイズフォーマット
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // テキストモデルのみをフィルタ
  const textModels = models.filter(m => m.type === 'text');

  // プロバイダーごとにグループ化
  const modelsByProvider = textModels.reduce((acc, model) => {
    const provider = model.provider || 'Other';
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(model);
    return acc;
  }, {} as Record<string, Model[]>);

  // プロバイダーの表示順序
  const providerOrder = ['Anthropic', 'Amazon', 'Meta', 'Mistral', 'Cohere', 'AI21', 'DeepSeek', 'Other'];
  const sortedProviders = Object.keys(modelsByProvider).sort((a, b) => {
    const aIndex = providerOrder.indexOf(a);
    const bIndex = providerOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return (
    <div className="flex h-full">
      {/* 左パネル: ワークスペース管理 */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        {/* ヘッダー */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <span>💻</span> Code Editor
            </h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
            >
              + 新規
            </button>
          </div>

          {/* code-serverステータス */}
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className={`w-2 h-2 rounded-full ${codeServerStatus?.code_server_running ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-gray-600">
              {codeServerStatus?.code_server_running ? 'code-server稼働中' : 'code-server停止中'}
            </span>
            {codeServerStatus?.code_server_running && (
              <button
                onClick={openCodeServer}
                className="ml-auto text-purple-600 hover:underline"
              >
                開く
              </button>
            )}
          </div>
        </div>

        {/* ワークスペース一覧 */}
        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-2">ワークスペース</h3>

          {isLoadingWorkspaces ? (
            <div className="text-center py-4 text-gray-400">読み込み中...</div>
          ) : workspaces.length === 0 ? (
            <div className="text-center py-4 text-gray-400">
              <p>ワークスペースがありません</p>
              <p className="text-xs mt-1">「+ 新規」で作成してください</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {workspaces.map(ws => (
                <li
                  key={ws.name}
                  className={`p-3 rounded-lg cursor-pointer transition ${
                    selectedWorkspace === ws.name
                      ? 'bg-purple-100 border border-purple-300'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                  onClick={() => {
                    setSelectedWorkspace(ws.name);
                    setShowTaskPanel(true);  // タスクパネルを自動で開く
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{ws.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteWorkspace(ws.name);
                      }}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >
                      削除
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {ws.file_count} files / {formatFileSize(ws.total_size_bytes)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ファイルアップロード */}
        {selectedWorkspace && (
          <div
            className={`p-4 border-t border-gray-200 ${isDragOver ? 'bg-purple-50' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition ${
                isDragOver ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-purple-400'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <p className="text-sm text-gray-600">
                ファイルをドラッグ&ドロップ
              </p>
              <p className="text-xs text-gray-400 mt-1">
                またはクリックして選択（ZIP対応）
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
          </div>
        )}
      </div>

      {/* 中央パネル: code-server iframe or ファイル一覧 */}
      <div className="flex-1 bg-gray-100 flex flex-col">
        {showIframe && codeServerStatus?.code_server_running ? (
          <div className="flex-1 relative">
            <div className="absolute top-2 right-2 z-10 flex gap-2">
              {selectedWorkspace && (
                <button
                  onClick={() => fetchWorkspaceFiles(selectedWorkspace)}
                  className="px-3 py-1 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 flex items-center gap-1"
                  title="ファイル一覧を更新"
                >
                  🔄 更新
                </button>
              )}
              <button
                onClick={() => {
                  setShowIframe(false);
                  setIframeUrl(null);
                }}
                className="px-3 py-1 bg-gray-800 text-white text-sm rounded hover:bg-gray-700"
              >
                閉じる
              </button>
            </div>
            <iframe
              src={iframeUrl || (selectedWorkspace
                ? `${codeServerStatus.code_server_url}/?folder=/workspace/${selectedWorkspace}`
                : codeServerStatus.code_server_url)
              }
              className="w-full h-full border-0"
              title="code-server"
            />
          </div>
        ) : (
          <>
            {/* ヘッダー */}
            <div className="p-4 bg-white border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-800">
                  {selectedWorkspace ? `📁 ${selectedWorkspace}` : 'ワークスペースを選択'}
                </h3>
                {selectedWorkspace && (
                  <p className="text-xs text-gray-500">{workspaceFiles.length} files</p>
                )}
              </div>
              <div className="flex gap-2">
                {selectedWorkspace && (
                  <button
                    onClick={() => fetchWorkspaceFiles(selectedWorkspace)}
                    className="px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200 flex items-center gap-1"
                    title="ファイル一覧を更新"
                  >
                    🔄 更新
                  </button>
                )}
                {codeServerStatus?.code_server_running && selectedWorkspace && (
                  <button
                    onClick={openCodeServer}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                  >
                    VSCodeで開く
                  </button>
                )}
                <button
                  onClick={() => setShowTaskPanel(!showTaskPanel)}
                  className={`px-4 py-2 text-sm rounded ${
                    showTaskPanel
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {showTaskPanel ? 'タスクパネルを閉じる' : 'マルチモデルタスク'}
                </button>
              </div>
            </div>

            {/* ファイル一覧 */}
            <div className="flex-1 overflow-y-auto p-4">
              {!selectedWorkspace ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <div className="text-center">
                    <p className="text-4xl mb-2">📂</p>
                    <p>左のパネルからワークスペースを選択してください</p>
                  </div>
                </div>
              ) : workspaceFiles.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <div className="text-center">
                    <p className="text-4xl mb-2">📄</p>
                    <p>ファイルがありません</p>
                    <p className="text-sm mt-1">下のエリアにファイルをドロップしてください</p>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th
                          className="px-4 py-2 text-left text-xs font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => toggleSort('name')}
                        >
                          ファイル名<SortIcon sortKey="name" />
                        </th>
                        <th
                          className="px-4 py-2 text-right text-xs font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => toggleSort('size')}
                        >
                          サイズ<SortIcon sortKey="size" />
                        </th>
                        <th
                          className="px-4 py-2 text-right text-xs font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => toggleSort('modified')}
                        >
                          更新日時<SortIcon sortKey="modified" />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {sortedFiles.map(file => (
                        <tr
                          key={file.path}
                          className="hover:bg-blue-50 cursor-pointer transition-colors"
                          onClick={() => openFileInVSCode(file.path)}
                          title="クリックしてVSCodeで開く"
                        >
                          <td className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 font-mono">{file.path}</td>
                          <td className="px-4 py-2 text-sm text-gray-500 text-right">{formatFileSize(file.size)}</td>
                          <td className="px-4 py-2 text-sm text-gray-500 text-right">
                            {new Date(file.modified_at).toLocaleString('ja-JP')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 右パネル: マルチモデルタスク実行 */}
      {showTaskPanel && (
        <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-bold text-gray-800">マルチモデルタスク</h3>
            <p className="text-xs text-gray-500 mt-1">
              複数モデルで同じタスクを実行して比較
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* モデル選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">モデル選択</label>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => setSelectedModels(textModels.map(m => m.id))}
                  className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                >
                  全選択
                </button>
                <button
                  onClick={() => setSelectedModels([])}
                  className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  全解除
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-lg">
                {sortedProviders.map(provider => (
                  <div key={provider} className="border-b border-gray-100 last:border-b-0">
                    <div
                      className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100"
                      onClick={() => {
                        const providerModelIds = modelsByProvider[provider].map(m => m.id);
                        const allSelected = providerModelIds.every(id => selectedModels.includes(id));
                        if (allSelected) {
                          setSelectedModels(prev => prev.filter(id => !providerModelIds.includes(id)));
                        } else {
                          setSelectedModels(prev => [...new Set([...prev, ...providerModelIds])]);
                        }
                      }}
                    >
                      <span className="text-xs font-semibold text-gray-700">{provider}</span>
                      <span className="text-xs text-gray-500">
                        {modelsByProvider[provider].filter(m => selectedModels.includes(m.id)).length}/{modelsByProvider[provider].length}
                      </span>
                    </div>
                    <div className="px-2 py-1">
                      {modelsByProvider[provider].map(model => (
                        <label key={model.id} className="flex items-center p-1 hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedModels.includes(model.id)}
                            onChange={() => toggleModel(model.id)}
                            className="mr-2"
                          />
                          <span className="text-xs">{model.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">{selectedModels.length} / {textModels.length} モデル選択中</p>
            </div>

            {/* モード切替 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">実行モード</label>
              <div className="flex gap-1">
                <button
                  onClick={() => setTaskMode('compare')}
                  className={`flex-1 py-2 text-xs rounded-lg ${
                    taskMode === 'compare'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  比較
                </button>
                <button
                  onClick={() => setTaskMode('debate')}
                  className={`flex-1 py-2 text-xs rounded-lg ${
                    taskMode === 'debate'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  壁打ち
                </button>
                <button
                  onClick={() => setTaskMode('autonomous')}
                  className={`flex-1 py-2 text-xs rounded-lg ${
                    taskMode === 'autonomous'
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  自律型
                </button>
              </div>
            </div>

            {/* 壁打ちラウンド数 */}
            {taskMode === 'debate' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ラウンド数</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={debateRounds}
                  onChange={(e) => setDebateRounds(Number(e.target.value))}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            )}

            {/* 自律型指揮者設定 */}
            {taskMode === 'autonomous' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">指揮者モデル</label>
                  <select
                    value={conductorModel}
                    onChange={(e) => setConductorModel(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">選択してください</option>
                    {textModels.map(model => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">タスクを管理・判断するモデル</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">最大イテレーション</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={maxIterations}
                    onChange={(e) => setMaxIterations(Number(e.target.value))}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1">タスク完了まで繰り返す最大回数</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">最大並列数</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={maxParallelWorkers}
                    onChange={(e) => setMaxParallelWorkers(Math.min(50, Math.max(1, Number(e.target.value))))}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    同時に実行するワーカー数（1-50）
                    <br />
                    <span className="text-orange-500">※ Bedrockのレート制限に注意</span>
                  </p>
                </div>
              </>
            )}

            {/* タスク入力 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">タスク</label>
              <textarea
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder={
                  taskMode === 'compare'
                    ? "例: このコードにユニットテストを追加して"
                    : taskMode === 'debate'
                    ? "例: このコードのリファクタリング案を議論して"
                    : "例: シンプルなOSを作成して"
                }
                className="w-full p-3 border border-gray-300 rounded-lg text-sm resize-y min-h-24"
              />
            </div>

            {/* 実行ボタン（比較・壁打ちモード） */}
            {taskMode !== 'autonomous' && (
              <button
                onClick={taskMode === 'compare' ? handleExecuteTask : handleDebateTask}
                disabled={
                  isExecuting ||
                  !selectedWorkspace ||
                  selectedModels.length === 0 ||
                  !task.trim() ||
                  (taskMode === 'debate' && selectedModels.length < 2)
                }
                className="w-full py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExecuting
                  ? '実行中...'
                  : taskMode === 'compare'
                  ? 'タスクを実行'
                  : '壁打ちを開始'}
              </button>
            )}

            {/* 自律型モードのボタン */}
            {taskMode === 'autonomous' && planningPhase === 'none' && (
              <div className="space-y-2">
                <button
                  onClick={() => handleGeneratePlan()}
                  disabled={
                    isExecuting ||
                    !selectedWorkspace ||
                    selectedModels.length === 0 ||
                    !task.trim() ||
                    !conductorModel
                  }
                  className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  計画を生成
                </button>
                <button
                  onClick={startBackgroundTask}
                  disabled={
                    isExecuting ||
                    !selectedWorkspace ||
                    selectedModels.length === 0 ||
                    !task.trim() ||
                    !conductorModel
                  }
                  className="w-full py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  バックグラウンドで実行（ページ更新OK）
                </button>
                <button
                  onClick={() => {
                    fetchBackgroundTasks();
                    setShowTaskList(true);
                  }}
                  className="w-full py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 flex items-center justify-center gap-2"
                >
                  <span>タスク履歴</span>
                  {backgroundTasks.filter(t => t.status === 'running').length > 0 && (
                    <span className="px-1.5 py-0.5 bg-orange-500 text-white text-xs rounded-full">
                      {backgroundTasks.filter(t => t.status === 'running').length}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* 計画生成中 */}
            {taskMode === 'autonomous' && planningPhase === 'generating' && (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">計画を生成中...</p>
              </div>
            )}

            {/* 計画レビュー */}
            {taskMode === 'autonomous' && planningPhase === 'review' && generatedPlan && (
              <div className="space-y-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <h4 className="font-bold text-blue-800 mb-2">{generatedPlan.project_name}</h4>
                  <p className="text-xs text-blue-700 mb-2">{generatedPlan.description}</p>

                  <div className="text-xs text-gray-600 mb-2">
                    <span className="font-medium">アーキテクチャ:</span> {generatedPlan.architecture}
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {generatedPlan.phases.map((phase, idx) => (
                      <div key={idx} className="bg-white rounded p-2 border border-blue-100">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm text-blue-700">
                            Phase {phase.phase_id}: {phase.name}
                          </span>
                          <span className="text-xs text-gray-500">
                            ~{phase.estimated_iterations}回
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mb-1">{phase.description}</p>
                        <div className="text-xs text-gray-500">
                          <span className="font-medium">ファイル:</span>{' '}
                          {phase.files_to_create.map(f => f.path).join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>

                  {generatedPlan.risks && generatedPlan.risks.length > 0 && (
                    <div className="mt-2 text-xs">
                      <span className="font-medium text-orange-700">リスク:</span>
                      <ul className="list-disc list-inside text-orange-600">
                        {generatedPlan.risks.map((risk, i) => (
                          <li key={i}>{risk}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleApprovePlanAndExecute}
                    className="flex-1 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700"
                  >
                    承認して実行
                  </button>
                  <button
                    onClick={() => {
                      setPlanningPhase('none');
                      setGeneratedPlan(null);
                      setPlanFeedback('');
                    }}
                    className="flex-1 py-2 bg-gray-400 text-white font-semibold rounded-lg hover:bg-gray-500"
                  >
                    キャンセル
                  </button>
                </div>

                {/* フィードバック入力欄 */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <label className="block text-xs font-medium text-yellow-800 mb-1">
                    計画へのフィードバック（再生成時に反映）
                  </label>
                  <textarea
                    value={planFeedback}
                    onChange={(e) => setPlanFeedback(e.target.value)}
                    placeholder="例: もっとシンプルにして、テストコードも追加して、Pythonではなく TypeScript で実装して..."
                    className="w-full px-2 py-1.5 text-sm border border-yellow-300 rounded focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 resize-none"
                    rows={2}
                  />
                </div>

                <button
                  onClick={() => handleGeneratePlan()}
                  disabled={!planFeedback.trim()}
                  className={`w-full py-2 text-sm rounded-lg ${
                    planFeedback.trim()
                      ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  {planFeedback.trim() ? 'フィードバックを反映して再生成' : '計画を再生成'}
                </button>
              </div>
            )}

            {/* 実行中 - 目立つパネル */}
            {taskMode === 'autonomous' && planningPhase === 'executing' && (
              <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border-2 border-orange-300 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-orange-500 border-t-transparent rounded-full" />
                    <span className="text-sm font-bold text-orange-700">
                      バックグラウンド実行中
                    </span>
                  </div>
                  {currentTaskId && (
                    <button
                      onClick={() => cancelTaskWithConfirm(currentTaskId)}
                      className="px-3 py-1 bg-red-500 text-white text-xs font-medium rounded hover:bg-red-600 transition-colors"
                    >
                      中止
                    </button>
                  )}
                </div>

                {/* プログレス */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>イテレーション {autonomousProgress.iteration}</span>
                    <span>{autonomousProgress.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="h-2.5 rounded-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-300"
                      style={{ width: `${autonomousProgress.progress}%` }}
                    />
                  </div>
                </div>

                {/* タスク情報 */}
                {autonomousProgress.task && (
                  <div className="text-xs text-gray-600 bg-white/50 p-2 rounded">
                    <span className="font-medium">タスク:</span> {autonomousProgress.task.slice(0, 80)}{autonomousProgress.task.length > 80 ? '...' : ''}
                  </div>
                )}

                {/* 現在のフェーズ */}
                {(autonomousProgress.currentPhase || autonomousProgress.totalPhases) && (
                  <div className="text-xs bg-orange-100 p-2 rounded space-y-1">
                    <div className="text-orange-700 font-medium flex items-center gap-2">
                      <span>📍 {autonomousProgress.currentPhase || `Phase ${autonomousProgress.currentPhaseId || 1}/${autonomousProgress.totalPhases || '?'}`}</span>
                      {autonomousProgress.currentPhaseName && (
                        <span className="text-orange-600">: {autonomousProgress.currentPhaseName}</span>
                      )}
                    </div>
                    {/* フェーズ一覧（展開可能） */}
                    {autonomousProgress.phases && autonomousProgress.phases.length > 0 && (
                      <details className="text-orange-600">
                        <summary className="cursor-pointer hover:text-orange-800">全{autonomousProgress.totalPhases}フェーズを表示</summary>
                        <ul className="mt-1 ml-2 space-y-0.5">
                          {autonomousProgress.phases.map((phase, idx) => (
                            <li
                              key={phase.phase_id}
                              className={`${
                                phase.phase_id === autonomousProgress.currentPhaseId
                                  ? 'font-bold text-orange-800'
                                  : phase.phase_id < (autonomousProgress.currentPhaseId || 1)
                                  ? 'text-gray-400 line-through'
                                  : ''
                              }`}
                            >
                              {phase.phase_id === autonomousProgress.currentPhaseId ? '▶ ' : phase.phase_id < (autonomousProgress.currentPhaseId || 1) ? '✓ ' : '○ '}
                              Phase {phase.phase_id}: {phase.name}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}

                {currentTaskId && (
                  <div className="text-xs text-gray-500 text-center">
                    タスクID: {currentTaskId}
                  </div>
                )}

                {/* 追加指示入力欄 */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                  <label className="block text-xs font-medium text-blue-800">
                    軌道修正（追加指示を送信）
                  </label>
                  <textarea
                    value={additionalInstruction}
                    onChange={(e) => setAdditionalInstruction(e.target.value)}
                    placeholder="例: テストコードも追加して、エラーハンドリングを強化して..."
                    className="w-full px-2 py-1.5 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-blue-400 focus:border-blue-400 resize-none bg-white"
                    rows={2}
                    disabled={isSendingInstruction}
                  />
                  <button
                    onClick={sendAdditionalInstruction}
                    disabled={!additionalInstruction.trim() || isSendingInstruction}
                    className={`w-full py-1.5 text-xs font-medium rounded transition-colors ${
                      additionalInstruction.trim() && !isSendingInstruction
                        ? 'bg-blue-500 text-white hover:bg-blue-600'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {isSendingInstruction ? '送信中...' : '次のイテレーションに反映'}
                  </button>
                  <p className="text-xs text-blue-600 text-center">
                    送信した指示は次のイテレーションで反映されます
                  </p>
                </div>

                <p className="text-xs text-gray-500 text-center">
                  ページを閉じても実行は継続されます
                </p>
              </div>
            )}

            {/* 計画エラー */}
            {planError && (
              <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                {planError}
              </div>
            )}

            {taskMode === 'debate' && selectedModels.length < 2 && (
              <p className="text-xs text-orange-600">壁打ちには2つ以上のモデルが必要です</p>
            )}
            {taskMode === 'autonomous' && !conductorModel && (
              <p className="text-xs text-orange-600">指揮者モデルを選択してください</p>
            )}

            {/* 自律型進捗表示 */}
            {taskMode === 'autonomous' && (autonomousProgress.iteration > 0 || autonomousProgress.logs.length > 0) && (
              <div className="space-y-3">
                {/* プログレスバー */}
                <div>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>進捗: {autonomousProgress.progress}%</span>
                    <span>イテレーション: {autonomousProgress.iteration}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${autonomousProgress.isComplete ? 'bg-green-500' : 'bg-orange-500'}`}
                      style={{ width: `${autonomousProgress.progress}%` }}
                    />
                  </div>
                </div>

                {/* ワーカー状態 */}
                {(autonomousProgress.workerCount > 0 || autonomousProgress.activeWorkers > 0) && (
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">ワーカー:</span>
                      <span className="font-medium">{autonomousProgress.workerCount}モデル</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">最大並列:</span>
                      <span className="font-medium">{autonomousProgress.maxParallelWorkers}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
                        autonomousProgress.activeWorkers > 0
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {autonomousProgress.activeWorkers > 0 && (
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        )}
                        稼働中: {autonomousProgress.activeWorkers}
                      </span>
                    </div>
                  </div>
                )}

                {/* 現在の分析 */}
                {autonomousProgress.analysis && (
                  <div className="text-xs bg-orange-50 p-2 rounded border border-orange-200">
                    <span className="font-medium text-orange-700">分析: </span>
                    {autonomousProgress.analysis}
                  </div>
                )}

                {/* 作成ファイル */}
                {autonomousProgress.filesCreated.length > 0 && (
                  <div className="text-xs">
                    <span className="font-medium text-gray-700">作成ファイル ({autonomousProgress.filesCreated.length}):</span>
                    <div className="mt-1 max-h-20 overflow-y-auto bg-gray-50 p-2 rounded">
                      {autonomousProgress.filesCreated.map((f, i) => (
                        <div key={i} className="text-green-600">{f}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ログ */}
                <div className="text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-700">ログ:</span>
                    <button
                      onClick={() => setShowLogModal(true)}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      詳細を表示
                    </button>
                  </div>
                  <div
                    className="mt-1 max-h-40 overflow-y-auto bg-gray-900 text-gray-100 p-2 rounded font-mono cursor-pointer hover:ring-2 hover:ring-blue-400"
                    onClick={() => setShowLogModal(true)}
                  >
                    {autonomousProgress.logs.slice(-10).map((log, i) => (
                      <div key={i} className={`${
                        log.type === 'error' ? 'text-red-400' :
                        log.type === 'success' ? 'text-green-400' :
                        log.type === 'file' ? 'text-blue-400' :
                        log.type === 'worker' ? 'text-yellow-400' :
                        log.type === 'parallel' ? 'text-cyan-400' :
                        log.type === 'plan' ? 'text-purple-400' :
                        log.type === 'phase' ? 'text-pink-400' :
                        log.type === 'conductor' ? 'text-orange-400' :
                        log.type === 'output' ? 'text-lime-400' :
                        'text-gray-300'
                      }`}>
                        [{log.timestamp.toLocaleTimeString()}] {log.message.slice(0, 80)}{log.message.length > 80 ? '...' : ''}
                      </div>
                    ))}
                    {autonomousProgress.logs.length > 10 && (
                      <div className="text-gray-500 text-center mt-1">
                        ... 他 {autonomousProgress.logs.length - 10} 件 (クリックで全て表示)
                      </div>
                    )}
                  </div>
                </div>

                {/* VSCodeで開くボタン */}
                {autonomousProgress.filesCreated.length > 0 && codeServerStatus?.code_server_running && (
                  <button
                    onClick={openCodeServer}
                    className="w-full py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                  >
                    VSCodeで進捗を確認
                  </button>
                )}
              </div>
            )}

            {/* 比較モード結果表示 */}
            {taskMode === 'compare' && taskResults && (
              <div className="space-y-3">
                <div className="text-sm text-gray-600">
                  成功: {taskResults.summary.success} / {taskResults.summary.total}
                </div>
                {taskResults.results.map((result, idx) => (
                  <div
                    key={idx}
                    className="border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition"
                    onClick={() => setSelectedResult(result)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{result.model_id.split('.').pop()}</span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        result.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {result.success ? '成功' : '失敗'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mb-2">
                      {result.elapsed_time.toFixed(2)}秒
                    </div>
                    {result.success ? (
                      <div className="text-xs max-h-20 overflow-hidden bg-gray-50 p-2 rounded text-gray-600">
                        {result.output?.slice(0, 200)}...
                        <span className="text-purple-600 ml-1">クリックで詳細</span>
                      </div>
                    ) : (
                      <div className="text-xs text-red-600">{result.error}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 壁打ちモード結果表示 */}
            {taskMode === 'debate' && debateResults.length > 0 && (
              <div className="space-y-3">
                <div className="text-sm text-gray-600 font-medium">
                  壁打ち結果 ({debateResults.length}件)
                </div>
                {debateResults.map((result, idx) => (
                  <div
                    key={idx}
                    className="border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition"
                    onClick={() => setSelectedResult({
                      model_id: result.model,
                      output: result.output,
                      elapsed_time: result.elapsed_time,
                      success: true,
                    })}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                        Round {result.round}
                      </span>
                      <span className="font-medium text-sm">{result.model.split('.').pop()}</span>
                    </div>
                    <div className="text-xs text-gray-500 mb-2">
                      {result.elapsed_time.toFixed(2)}秒
                    </div>
                    <div className="text-xs max-h-20 overflow-hidden bg-gray-50 p-2 rounded text-gray-600">
                      {result.output.slice(0, 200)}...
                      <span className="text-purple-600 ml-1">クリックで詳細</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ワークスペース作成モーダル */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-bold text-gray-800 mb-4">新規ワークスペース</h3>
            <input
              type="text"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              placeholder="ワークスペース名"
              className="w-full p-3 border border-gray-300 rounded-lg mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreateWorkspace}
                disabled={!newWorkspaceName.trim()}
                className="flex-1 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                作成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 結果詳細モーダル */}
      {selectedResult && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setSelectedResult(null)}
        >
          <div
            className="bg-white rounded-lg w-[90vw] max-w-4xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-gray-800">
                  {selectedResult.model_id.split('.').pop()}
                </h3>
                <span className={`text-xs px-2 py-1 rounded ${
                  selectedResult.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {selectedResult.success ? '成功' : '失敗'}
                </span>
                <span className="text-sm text-gray-500">
                  {selectedResult.elapsed_time.toFixed(2)}秒
                </span>
              </div>
              <button
                onClick={() => setSelectedResult(null)}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ✕
              </button>
            </div>

            {/* コンテンツ */}
            <div className="flex-1 overflow-y-auto p-6">
              {selectedResult.success ? (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selectedResult.output || ''}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="text-red-600">{selectedResult.error}</div>
              )}
            </div>

            {/* フッター */}
            <div className="flex items-center justify-between p-4 border-t border-gray-200">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedResult.output || selectedResult.error || '');
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
              >
                コピー
              </button>
              <button
                onClick={() => setSelectedResult(null)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ログ詳細モーダル */}
      {showLogModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowLogModal(false)}
        >
          <div
            className="bg-gray-900 rounded-lg w-[95vw] max-w-6xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-bold text-white">実行ログ詳細</h3>
                <span className="text-sm text-gray-400">
                  {autonomousProgress.logs.length}件のログ
                </span>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs ${autonomousProgress.isComplete ? 'bg-green-600 text-white' : 'bg-orange-600 text-white'}`}>
                    {autonomousProgress.isComplete ? '完了' : `実行中 (${autonomousProgress.iteration}回目)`}
                  </span>
                  <span className="text-sm text-gray-400">
                    進捗: {autonomousProgress.progress}%
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowLogModal(false)}
                className="text-gray-400 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>

            {/* サマリー */}
            <div className="p-4 border-b border-gray-700 bg-gray-800">
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">イテレーション</span>
                  <div className="text-white font-bold text-lg">{autonomousProgress.iteration}</div>
                </div>
                <div>
                  <span className="text-gray-400">作成ファイル</span>
                  <div className="text-blue-400 font-bold text-lg">{autonomousProgress.filesCreated.length}</div>
                </div>
                <div>
                  <span className="text-gray-400">エラー</span>
                  <div className="text-red-400 font-bold text-lg">
                    {autonomousProgress.logs.filter(l => l.type === 'error').length}
                  </div>
                </div>
                <div>
                  <span className="text-gray-400">現在のフェーズ</span>
                  <div className="text-purple-400 font-bold text-sm truncate">
                    {autonomousProgress.currentPhase || 'N/A'}
                  </div>
                </div>
              </div>

              {/* 現在の分析 */}
              {autonomousProgress.analysis && (
                <div className="mt-3 p-3 bg-gray-700 rounded">
                  <span className="text-orange-400 font-medium text-sm">現在の分析:</span>
                  <p className="text-gray-200 text-sm mt-1">{autonomousProgress.analysis}</p>
                </div>
              )}
            </div>

            {/* ログ一覧 */}
            <div className="flex-1 overflow-y-auto p-4 font-mono text-sm">
              {autonomousProgress.logs.map((log, i) => (
                <div
                  key={i}
                  className={`py-2 px-3 border-b border-gray-800 hover:bg-gray-800 ${
                    log.type === 'error' ? 'bg-red-900/20' :
                    log.type === 'success' ? 'bg-green-900/20' :
                    ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-gray-500 whitespace-nowrap">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${
                      log.type === 'error' ? 'bg-red-600 text-white' :
                      log.type === 'success' ? 'bg-green-600 text-white' :
                      log.type === 'file' ? 'bg-blue-600 text-white' :
                      log.type === 'worker' ? 'bg-yellow-600 text-black' :
                      log.type === 'parallel' ? 'bg-cyan-600 text-white' :
                      log.type === 'plan' ? 'bg-purple-600 text-white' :
                      log.type === 'phase' ? 'bg-pink-600 text-white' :
                      log.type === 'iteration' ? 'bg-indigo-600 text-white' :
                      log.type === 'decision' ? 'bg-orange-600 text-white' :
                      log.type === 'conductor' ? 'bg-orange-500 text-white' :
                      log.type === 'output' ? 'bg-lime-600 text-white' :
                      'bg-gray-600 text-white'
                    }`}>
                      {log.type}
                    </span>
                    <span className={`flex-1 break-all ${
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'success' ? 'text-green-400' :
                      log.type === 'file' ? 'text-blue-400' :
                      log.type === 'worker' ? 'text-yellow-400' :
                      log.type === 'parallel' ? 'text-cyan-400' :
                      log.type === 'plan' ? 'text-purple-400' :
                      log.type === 'phase' ? 'text-pink-400' :
                      log.type === 'conductor' ? 'text-orange-400' :
                      log.type === 'output' ? 'text-lime-400' :
                      'text-gray-300'
                    }`}>
                      {log.message}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* 作成ファイル一覧 */}
            {autonomousProgress.filesCreated.length > 0 && (
              <div className="p-4 border-t border-gray-700 bg-gray-800">
                <div className="text-sm text-gray-400 mb-2">作成されたファイル ({autonomousProgress.filesCreated.length})</div>
                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                  {autonomousProgress.filesCreated.map((f, i) => (
                    <span key={i} className="px-2 py-1 bg-blue-900 text-blue-300 rounded text-xs">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* フッター */}
            <div className="flex items-center justify-between p-4 border-t border-gray-700">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const logText = autonomousProgress.logs
                      .map(l => `[${l.timestamp.toLocaleTimeString()}] [${l.type}] ${l.message}`)
                      .join('\n');
                    navigator.clipboard.writeText(logText);
                  }}
                  className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 text-sm"
                >
                  ログをコピー
                </button>
                <button
                  onClick={() => {
                    showModal('confirm', '履歴をクリア', '実行履歴をクリアしますか？', {
                      confirmText: 'クリア',
                      cancelText: 'キャンセル',
                      onConfirm: () => {
                        setAutonomousProgress({
                          iteration: 0,
                          progress: 0,
                          analysis: '',
                          filesCreated: [],
                          isComplete: false,
                          logs: [],
                        });
                        localStorage.removeItem('autonomousProgress');
                        setShowLogModal(false);
                      },
                    });
                  }}
                  className="px-4 py-2 bg-red-700 text-red-100 rounded-lg hover:bg-red-600 text-sm"
                >
                  履歴をクリア
                </button>
              </div>
              <div className="flex gap-2">
                {codeServerStatus?.code_server_running && autonomousProgress.filesCreated.length > 0 && (
                  <button
                    onClick={() => {
                      setShowLogModal(false);
                      openCodeServer();
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    VSCodeで開く
                  </button>
                )}
                <button
                  onClick={() => setShowLogModal(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 text-sm"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* タスク履歴モーダル */}
      {showTaskList && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowTaskList(false)}
        >
          <div
            className="bg-white rounded-lg w-[95vw] max-w-4xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-bold text-gray-800">タスク履歴</h3>
                <span className="text-sm text-gray-500">
                  {backgroundTasks.length}件
                </span>
                <button
                  onClick={() => fetchBackgroundTasks()}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  更新
                </button>
              </div>
              <button
                onClick={() => setShowTaskList(false)}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ✕
              </button>
            </div>

            {/* タスク一覧 */}
            <div className="flex-1 overflow-y-auto p-4">
              {backgroundTasks.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  タスク履歴がありません
                </div>
              ) : (
                <div className="space-y-3">
                  {backgroundTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`border rounded-lg p-4 ${
                        task.status === 'running' ? 'border-orange-400 bg-orange-50' :
                        task.status === 'completed' ? 'border-green-400 bg-green-50' :
                        task.status === 'error' ? 'border-red-400 bg-red-50' :
                        'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              task.status === 'running' ? 'bg-orange-500 text-white' :
                              task.status === 'completed' ? 'bg-green-500 text-white' :
                              task.status === 'stopped' ? 'bg-yellow-500 text-white' :
                              task.status === 'error' ? 'bg-red-500 text-white' :
                              task.status === 'cancelled' ? 'bg-gray-500 text-white' :
                              'bg-gray-400 text-white'
                            }`}>
                              {task.status === 'running' ? '実行中' :
                               task.status === 'completed' ? '完了' :
                               task.status === 'stopped' ? '停止' :
                               task.status === 'error' ? 'エラー' :
                               task.status === 'cancelled' ? 'キャンセル' :
                               task.status}
                            </span>
                            <span className="text-xs text-gray-500">
                              ID: {task.id}
                            </span>
                            <span className="text-xs text-gray-500">
                              {task.workspace}
                            </span>
                          </div>
                          <p className="text-sm text-gray-800 font-medium">
                            {task.task.slice(0, 100)}{task.task.length > 100 ? '...' : ''}
                          </p>
                          {/* モデル情報 */}
                          {task.conductor_model && (
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                                指揮者: {task.conductor_model.split('.')[0]}
                              </span>
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                ワーカー: {task.worker_count || 0}モデル
                              </span>
                              {task.status === 'running' && task.active_workers !== undefined && (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded flex items-center gap-1">
                                  {task.active_workers > 0 && (
                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                  )}
                                  稼働中: {task.active_workers}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 進捗 */}
                      <div className="mb-2">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>進捗: {task.progress}%</span>
                          <span>イテレーション: {task.iteration}</span>
                          <span>ファイル: {task.files_created.length}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${
                              task.status === 'running' ? 'bg-orange-500' :
                              task.status === 'completed' ? 'bg-green-500' :
                              'bg-gray-400'
                            }`}
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                      </div>

                      {/* 分析 */}
                      {task.analysis && (
                        <p className="text-xs text-gray-600 mb-2">
                          {task.analysis.slice(0, 150)}{task.analysis.length > 150 ? '...' : ''}
                        </p>
                      )}

                      {/* エラー */}
                      {task.error && (
                        <p className="text-xs text-red-600 mb-2">
                          エラー: {task.error}
                        </p>
                      )}

                      {/* 時間情報 */}
                      <div className="text-xs text-gray-500 mb-2">
                        <span>作成: {new Date(task.created_at).toLocaleString()}</span>
                        {task.completed_at && (
                          <span className="ml-4">完了: {new Date(task.completed_at).toLocaleString()}</span>
                        )}
                      </div>

                      {/* アクションボタン */}
                      <div className="flex gap-2">
                        {task.status === 'running' && (
                          <>
                            <button
                              onClick={() => {
                                setCurrentTaskId(task.id);
                                setTaskMode('autonomous');
                                // モデル情報を復元
                                if (task.conductor_model) {
                                  setConductorModel(task.conductor_model);
                                }
                                if (task.worker_models) {
                                  setSelectedModels(task.worker_models);
                                }
                                // ワーカー情報を復元
                                setAutonomousProgress(prev => ({
                                  ...prev,
                                  workerCount: task.worker_count || 0,
                                  maxParallelWorkers: task.max_parallel_workers || 0,
                                  activeWorkers: task.active_workers || 0,
                                }));
                                startPolling(task.id);
                                setShowTaskList(false);
                                setIsExecuting(true);
                                setPlanningPhase('executing');
                              }}
                              className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                            >
                              進捗を表示
                            </button>
                            <button
                              onClick={() => cancelTask(task.id)}
                              className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                            >
                              キャンセル
                            </button>
                          </>
                        )}
                        {(task.status === 'stopped' || task.status === 'error' || task.status === 'cancelled') && !task.is_complete && (
                          <button
                            onClick={() => {
                              resumeTask(task.id);
                              setShowTaskList(false);
                            }}
                            className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                          >
                            再開
                          </button>
                        )}
                        {task.status !== 'running' && (
                          <button
                            onClick={() => deleteTask(task.id)}
                            className="px-3 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600"
                          >
                            削除
                          </button>
                        )}
                        {task.files_created.length > 0 && (
                          <button
                            onClick={() => {
                              setSelectedWorkspace(task.workspace);
                              setShowTaskPanel(true);  // タスクパネルを自動で開く
                              setShowTaskList(false);
                            }}
                            className="px-3 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700"
                          >
                            ワークスペースを開く
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* フッター */}
            <div className="p-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowTaskList(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 text-sm"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 汎用モーダル */}
      {modal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            {/* ヘッダー */}
            <div className={`px-6 py-4 ${
              modal.type === 'error' ? 'bg-red-500' :
              modal.type === 'success' ? 'bg-green-500' :
              modal.type === 'warning' ? 'bg-yellow-500' :
              modal.type === 'confirm' ? 'bg-blue-500' :
              'bg-gray-500'
            }`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {modal.type === 'error' ? '❌' :
                   modal.type === 'success' ? '✅' :
                   modal.type === 'warning' ? '⚠️' :
                   modal.type === 'confirm' ? '❓' :
                   'ℹ️'}
                </span>
                <h3 className="text-lg font-bold text-white">{modal.title}</h3>
              </div>
            </div>

            {/* コンテンツ */}
            <div className="px-6 py-4">
              <p className="text-gray-700 whitespace-pre-wrap">{modal.message}</p>
            </div>

            {/* フッター */}
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              {modal.type === 'confirm' ? (
                <>
                  {modal.thirdText && (
                    <button
                      onClick={() => {
                        closeModal();
                        modal.onThird?.();
                      }}
                      className="px-4 py-2 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 text-sm font-medium"
                    >
                      {modal.thirdText}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      closeModal();
                      modal.onCancel?.();
                    }}
                    className="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 text-sm font-medium"
                  >
                    {modal.cancelText || 'キャンセル'}
                  </button>
                  <button
                    onClick={() => {
                      closeModal();
                      modal.onConfirm?.();
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                  >
                    {modal.confirmText || 'OK'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    closeModal();
                    modal.onConfirm?.();
                  }}
                  className={`px-4 py-2 text-white rounded-lg text-sm font-medium ${
                    modal.type === 'error' ? 'bg-red-600 hover:bg-red-700' :
                    modal.type === 'success' ? 'bg-green-600 hover:bg-green-700' :
                    modal.type === 'warning' ? 'bg-yellow-600 hover:bg-yellow-700' :
                    'bg-gray-600 hover:bg-gray-700'
                  }`}
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
