'use client';

import { useState, useEffect } from 'react';
import {
  Sidebar,
  SettingsPanel,
  SettingsModal,
  ResultsView,
  DebateView,
  ConductorView,
  AutoRouteView,
  AnalyticsDashboard,
  ExplainabilityView,
  BenchmarkView,
  ImageGenerationView,
  VideoGenerationView,
  CodeEditorView,
  ErrorToast,
  useErrorToast,
} from '@/components';
import { Result, ExecutionRequest, DebateRequest, DebateResponse, ConductorRequest, ConductorResponse, Model, DebateStreamEvent, DebateProgress, DebateRound, ExecutionMode, AutoRouteRequest, AutoRouteResult } from '@/types';

export default function Home() {
  const [results, setResults] = useState<Result[]>([]);
  const [debateResult, setDebateResult] = useState<DebateResponse | null>(null);
  const [conductorResult, setConductorResult] = useState<ConductorResponse | null>(null);
  const [autoRouteResult, setAutoRouteResult] = useState<AutoRouteResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('compare');
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(380);
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const { errors, addError, dismissError } = useErrorToast();
  const [debateProgress, setDebateProgress] = useState<DebateProgress>({
    currentRound: 0,
    totalRounds: 0,
    currentSpeaker: null,
    speakerIndex: 0,
    isComplete: false,
    waitingForHuman: false,
    sessionId: undefined,
  });
  const [humanInputResolver, setHumanInputResolver] = useState<((message: string) => void) | null>(null);

  useEffect(() => {
    fetch('http://localhost:8000/api/models')
      .then(r => r.json())
      .then(data => setModels(data.models))
      .catch(console.error);
  }, []);

  // Hydration後にlocalStorageから読み込み
  useEffect(() => {
    const saved = localStorage.getItem('executionMode');
    if (saved) {
      setExecutionMode(saved as ExecutionMode);
    }
    setIsHydrated(true);
  }, []);

  // タブ位置をlocalStorageに保存（Hydration後のみ）
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem('executionMode', executionMode);
    }
  }, [executionMode, isHydrated]);

  // パネルリサイズ
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingPanel) return;
      const newWidth = Math.max(300, Math.min(600, panelWidth + e.movementX));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingPanel(false);
    };

    if (isResizingPanel) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingPanel, panelWidth]);

  const handleExecute = async (request: ExecutionRequest) => {
    setIsExecuting(true);
    setResults([]);
    setDebateResult(null);
    setConductorResult(null);
    setAutoRouteResult(null);
    setProgress({ current: 0, total: request.model_ids.length });

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const endpoint = request.enable_reasoning 
        ? 'http://localhost:8000/api/execute-with-reasoning'
        : 'http://localhost:8000/api/execute-stream';

      if (request.enable_reasoning) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        const data = await response.json();
        setResults(data.results);
        setProgress({ current: data.results.length, total: request.model_ids.length });
      } else {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const newResults: Result[] = [];

        if (!reader) return;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'result') {
                newResults.push(data.data);
                setResults([...newResults]);
                setProgress({ current: newResults.length, total: request.model_ids.length });
              }
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('実行エラー:', error);
      }
    } finally {
      setIsExecuting(false);
      setAbortController(null);
    }
  };

  const handleDebate = async (request: DebateRequest) => {
    setIsExecuting(true);
    setResults([]);
    setDebateResult(null);
    setConductorResult(null);
    setAutoRouteResult(null);
    setDebateProgress({
      currentRound: 0,
      totalRounds: request.rounds,
      currentSpeaker: null,
      speakerIndex: 0,
      isComplete: false,
      waitingForHuman: false,
      sessionId: undefined,
    });

    const controller = new AbortController();
    setAbortController(controller);

    const rounds: DebateRound[] = [];
    let currentRoundResults: Result[] = [];
    let currentRoundNum = 0;

    // ユーザー入力を待つPromiseを作成する関数
    const waitForHumanInput = (): Promise<string> => {
      return new Promise((resolve) => {
        setHumanInputResolver(() => resolve);
        setDebateProgress(prev => ({ ...prev, waitingForHuman: true }));
      });
    };

    try {
      const response = await fetch('http://localhost:8000/api/debate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
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
            const event: DebateStreamEvent = JSON.parse(line.slice(6));

            switch (event.type) {
              case 'start':
                setDebateProgress(prev => ({ ...prev, totalRounds: event.total_rounds || request.rounds }));
                break;
              case 'round_start':
                currentRoundNum = event.round || 0;
                currentRoundResults = [];
                setDebateProgress(prev => ({ ...prev, currentRound: currentRoundNum }));
                break;
              case 'speaking':
                setDebateProgress(prev => ({
                  ...prev,
                  currentSpeaker: event.model_id || null,
                  speakerIndex: event.speaker_index || 0,
                  waitingForHuman: false,
                }));
                break;
              case 'speech':
                if (event.data) {
                  currentRoundResults.push(event.data);
                  const existingRoundIndex = rounds.findIndex(r => r.round === currentRoundNum);
                  if (existingRoundIndex >= 0) {
                    rounds[existingRoundIndex] = { round: currentRoundNum, results: [...currentRoundResults] };
                  } else {
                    rounds.push({ round: currentRoundNum, results: [...currentRoundResults] });
                  }
                  setDebateResult({
                    mode: request.mode,
                    topic: request.topic,
                    total_rounds: request.rounds,
                    participants: request.model_ids,
                    enable_reasoning: request.enable_reasoning,
                    rounds: [...rounds],
                    summary: {
                      total_exchanges: rounds.reduce((sum, r) => sum + r.results.length, 0),
                      success_count: rounds.reduce((sum, r) => sum + r.results.filter(res => res.success).length, 0),
                      total_time: rounds.reduce((sum, r) => sum + r.results.reduce((t, res) => t + res.elapsed_time, 0), 0),
                    },
                  });
                }
                break;
              case 'waiting_human':
                // ユーザー入力を待つ
                setDebateProgress(prev => ({ 
                  ...prev, 
                  waitingForHuman: true,
                  sessionId: event.session_id,
                  currentSpeaker: 'human',
                }));
                const humanMessage = await waitForHumanInput();
                // ユーザー入力をサーバーに送信
                await fetch('http://localhost:8000/api/debate-human-input', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    session_id: event.session_id,
                    message: humanMessage,
                  }),
                });
                setDebateProgress(prev => ({ ...prev, waitingForHuman: false }));
                break;
              case 'round_end':
                setDebateProgress(prev => ({ ...prev, currentSpeaker: null }));
                break;
              case 'complete':
                setDebateProgress(prev => ({ ...prev, isComplete: true, currentSpeaker: null, waitingForHuman: false }));
                if (event.summary) {
                  setDebateResult(prev => prev ? { ...prev, summary: event.summary! } : null);
                }
                break;
              case 'error':
                addError('壁打ちエラー: ' + event.message);
                break;
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('壁打ちエラー:', error);
        addError('壁打ちエラー: ' + error.message);
      }
    } finally {
      setIsExecuting(false);
      setAbortController(null);
      setHumanInputResolver(null);
    }
  };

  // ユーザー入力を処理
  const handleHumanInput = (message: string) => {
    if (humanInputResolver) {
      humanInputResolver(message);
      setHumanInputResolver(null);
    }
  };

  const handleConductor = async (request: ConductorRequest) => {
    setIsExecuting(true);
    setResults([]);
    setDebateResult(null);
    setConductorResult(null);
    setAutoRouteResult(null);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const response = await fetch('http://localhost:8000/api/conductor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data: ConductorResponse = await response.json();
      setConductorResult(data);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('指揮者モードエラー:', error);
        addError('指揮者モードエラー: ' + error.message);
      }
    } finally {
      setIsExecuting(false);
      setAbortController(null);
    }
  };

  const handleAutoRoute = async (request: AutoRouteRequest) => {
    setIsExecuting(true);
    setResults([]);
    setDebateResult(null);
    setConductorResult(null);
    setAutoRouteResult(null);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const response = await fetch('http://localhost:8000/api/auto-execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data: AutoRouteResult = await response.json();
      setAutoRouteResult(data);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Auto Routeエラー:', error);
        addError('Auto Routeエラー: ' + error.message);
      }
    } finally {
      setIsExecuting(false);
      setAbortController(null);
    }
  };

  const handleCancel = () => {
    if (abortController) {
      abortController.abort();
      setIsExecuting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* 左サイドバー */}
      <Sidebar 
        executionMode={executionMode}
        onModeChange={setExecutionMode}
        isExecuting={isExecuting}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 設定モーダル */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />

      {/* メインコンテンツ */}
      <div className="flex-1 flex">
        {/* 設定パネル（分析ツール・画像・動画・コードエディタモードでは非表示） */}
        {executionMode !== 'analytics' && executionMode !== 'explain' && executionMode !== 'benchmark' && executionMode !== 'image' && executionMode !== 'video' && executionMode !== 'code-editor' && (
          <>
            <div 
              className={`bg-white border-r border-gray-200 flex-shrink-0 transition-all duration-300 ${
                isPanelCollapsed ? 'w-0 overflow-hidden' : 'overflow-y-auto'
              }`}
              style={{ width: isPanelCollapsed ? 0 : panelWidth }}
            >
              <div className="p-4" style={{ width: panelWidth }}>
                <SettingsPanel
                  executionMode={executionMode}
                  onExecute={handleExecute}
                  onDebate={handleDebate}
                  onConductor={handleConductor}
                  onAutoRoute={handleAutoRoute}
                  isExecuting={isExecuting}
                  onCancel={handleCancel}
                />
              </div>
            </div>

            {/* パネル開閉ボタン + リサイズハンドル */}
            <div className="flex-shrink-0 flex flex-col">
              <button
                onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
                className="h-12 w-6 bg-gray-200 hover:bg-purple-400 flex items-center justify-center text-gray-600 hover:text-white transition-colors"
                title={isPanelCollapsed ? '設定パネルを開く' : '設定パネルを閉じる'}
              >
                {isPanelCollapsed ? '▶' : '◀'}
              </button>
              {!isPanelCollapsed && (
                <div
                  className="flex-1 w-6 bg-gray-200 hover:bg-purple-400 cursor-ew-resize flex items-center justify-center"
                  onMouseDown={() => setIsResizingPanel(true)}
                >
                  <div className="w-1 h-8 bg-gray-400 rounded"></div>
                </div>
              )}
            </div>
          </>
        )}

        {/* 結果表示エリア */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {/* 分析ツールビュー */}
          {executionMode === 'analytics' && (
            <div className="p-6">
              <AnalyticsDashboard apiBase="http://localhost:8000" />
            </div>
          )}

          {executionMode === 'explain' && (
            <div className="p-6">
              <ExplainabilityView apiBase="http://localhost:8000" />
            </div>
          )}

          {executionMode === 'benchmark' && (
            <div className="p-6">
              <BenchmarkView apiBase="http://localhost:8000" />
            </div>
          )}

          {/* 画像生成ビュー */}
          {executionMode === 'image' && (
            <ImageGenerationView
              isExecuting={isExecuting}
              setIsExecuting={setIsExecuting}
            />
          )}

          {/* 動画生成ビュー */}
          {executionMode === 'video' && (
            <VideoGenerationView
              isExecuting={isExecuting}
              setIsExecuting={setIsExecuting}
            />
          )}

          {/* Code Editorビュー */}
          {executionMode === 'code-editor' && (
            <CodeEditorView
              apiBase="http://localhost:8000"
              models={models}
            />
          )}

          {/* 実行モードビュー */}
          {executionMode !== 'analytics' && executionMode !== 'explain' && executionMode !== 'benchmark' && executionMode !== 'image' && executionMode !== 'video' && executionMode !== 'code-editor' && (
            <div className="p-6">
              {autoRouteResult && (
                <AutoRouteView result={autoRouteResult} models={models} />
              )}

              {conductorResult && !autoRouteResult && (
                <ConductorView result={conductorResult} models={models} />
              )}

              {debateResult && !conductorResult && !autoRouteResult && (
                <DebateView
                  debate={debateResult}
                  models={models}
                  progress={debateProgress}
                  isExecuting={isExecuting}
                  onHumanInput={handleHumanInput}
                />
              )}

              {(isExecuting || results.length > 0) && !debateResult && !conductorResult && !autoRouteResult && (
                <ResultsView
                  results={results}
                  isExecuting={isExecuting}
                  progress={progress}
                />
              )}

              {!isExecuting && !results.length && !debateResult && !conductorResult && !autoRouteResult && (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <div className="text-center">
                    <div className="text-6xl mb-4">🚀</div>
                    <p className="text-xl">左のパネルで設定して実行してください</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* エラートースト */}
      <ErrorToast errors={errors} onDismiss={dismissError} />
    </div>
  );
}
