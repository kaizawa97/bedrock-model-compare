'use client';

import { ExecutionMode } from '@/types';

interface SidebarProps {
  executionMode: ExecutionMode;
  onModeChange: (mode: ExecutionMode) => void;
  isExecuting: boolean;
  onOpenSettings: () => void;
}

export default function Sidebar({ executionMode, onModeChange, isExecuting, onOpenSettings }: SidebarProps) {
  const executionModes = [
    { id: 'compare' as ExecutionMode, icon: '🚀', label: 'モデル比較', description: '複数モデルを並列実行' },
    { id: 'autoroute' as ExecutionMode, icon: '🎯', label: 'Auto Route', description: '最適モデルを自動選択' },
    { id: 'debate' as ExecutionMode, icon: '🎭', label: 'モデル壁打ち', description: 'モデル同士で議論' },
    { id: 'conductor' as ExecutionMode, icon: '🎼', label: '指揮者モード', description: '1つが他を指揮' },
    { id: 'image' as ExecutionMode, icon: '🎨', label: '画像生成', description: '画像生成モデル比較' },
    { id: 'video' as ExecutionMode, icon: '🎬', label: '動画生成', description: '動画生成モデル比較' },
    { id: 'code-editor' as ExecutionMode, icon: '💻', label: 'Code Editor', description: 'VSCode + Claude Code' },
  ];

  const analyticsModes = [
    { id: 'analytics' as ExecutionMode, icon: '📊', label: 'ダッシュボード', description: 'コスト・パフォーマンス分析' },
    { id: 'explain' as ExecutionMode, icon: '🔍', label: '選択根拠説明', description: 'モデル選択の理由を表示' },
    { id: 'benchmark' as ExecutionMode, icon: '🏁', label: 'ベンチマーク', description: '自動テスト＆レポート' },
  ];

  const renderModeList = (modes: typeof executionModes) => (
    <ul className="space-y-2">
      {modes.map((mode) => (
        <li key={mode.id}>
          <button
            onClick={() => !isExecuting && onModeChange(mode.id)}
            disabled={isExecuting}
            className={`w-full text-left p-3 rounded-lg transition-all ${
              executionMode === mode.id
                ? 'bg-purple-600 text-white shadow-lg'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            } ${isExecuting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{mode.icon}</span>
              <div>
                <div className="font-medium">{mode.label}</div>
                <div className="text-xs opacity-70">{mode.description}</div>
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col min-h-screen">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <span className="text-2xl">⚡</span>
          Bedrock Compare
        </h1>
        <p className="text-xs text-gray-400 mt-1">50+ モデル対応</p>
      </div>

      <nav className="flex-1 p-4 overflow-y-auto">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">実行モード</p>
        {renderModeList(executionModes)}

        <div className="border-t border-gray-700 my-4"></div>

        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">分析ツール</p>
        {renderModeList(analyticsModes)}
      </nav>

      <div className="p-4 border-t border-gray-700 space-y-3">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 p-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition"
        >
          <span>⚙️</span>
          <span className="text-sm">AWS設定</span>
        </button>
        <div className="text-xs text-gray-500">
          <p>🧠 推論対応</p>
          <p className="mt-1">Claude 4 / DeepSeek R1 / Kimi K2</p>
        </div>
      </div>
    </aside>
  );
}
