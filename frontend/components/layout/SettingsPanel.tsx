'use client';

import { useState, useEffect } from 'react';
import { Model, Region, ExecutionRequest, DebateRequest, ExecutionMode, ConductorRequest, AutoRouteRequest } from '@/types';

interface SettingsPanelProps {
  executionMode: ExecutionMode;
  onExecute: (request: ExecutionRequest) => void;
  onDebate: (request: DebateRequest) => void;
  onConductor: (request: ConductorRequest) => void;
  onAutoRoute: (request: AutoRouteRequest) => void;
  isExecuting: boolean;
  onCancel: () => void;
}

function CollapsibleSection({ 
  title, icon, children, defaultOpen = true 
}: { 
  title: string; icon: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition"
      >
        <span className="flex items-center gap-2 font-medium text-gray-700">
          <span>{icon}</span>
          <span>{title}</span>
        </span>
        <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {isOpen && <div className="p-3 border-t border-gray-200">{children}</div>}
    </div>
  );
}

function OrderableModelList({
  models, selectedModels, onReorder, onRemove,
}: {
  models: Model[]; selectedModels: string[]; onReorder: (newOrder: string[]) => void; onRemove: (modelId: string) => void;
}) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const getModelName = (modelId: string) => {
    const model = models.find(m => m.id === modelId);
    return model?.name || modelId.split('.').pop()?.slice(0, 25) || modelId;
  };

  const handleDragStart = (index: number) => setDraggedIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const newOrder = [...selectedModels];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(index, 0, removed);
    onReorder(newOrder);
    setDraggedIndex(index);
  };
  const handleDragEnd = () => setDraggedIndex(null);
  const moveUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...selectedModels];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    onReorder(newOrder);
  };
  const moveDown = (index: number) => {
    if (index === selectedModels.length - 1) return;
    const newOrder = [...selectedModels];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    onReorder(newOrder);
  };

  if (selectedModels.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">モデルを選択してください</p>;
  }

  return (
    <div className="space-y-1">
      {selectedModels.map((modelId, index) => (
        <div
          key={modelId}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragEnd={handleDragEnd}
          className={`flex items-center gap-2 p-2 bg-white border rounded-lg cursor-move hover:bg-gray-50 ${draggedIndex === index ? 'opacity-50 border-purple-400' : 'border-gray-200'}`}
        >
          <span className="text-gray-400 text-sm font-mono w-5">{index + 1}.</span>
          <span className="flex-1 text-sm truncate">{getModelName(modelId)}</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => moveUp(index)} disabled={index === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30" title="上へ">▲</button>
            <button type="button" onClick={() => moveDown(index)} disabled={index === selectedModels.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30" title="下へ">▼</button>
            <button type="button" onClick={() => onRemove(modelId)} className="p-1 text-red-400 hover:text-red-600" title="削除">✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SettingsPanel({ executionMode, onExecute, onDebate, onConductor, onAutoRoute, isExecuting, onCancel }: SettingsPanelProps) {
  const [models, setModels] = useState<Model[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [maxTokens, setMaxTokens] = useState(1000);
  const [temperature, setTemperature] = useState(0.7);
  const [enableReasoning, setEnableReasoning] = useState(false);
  const [reasoningBudget, setReasoningBudget] = useState(5000);
  const [debateMode, setDebateMode] = useState<'debate' | 'brainstorm' | 'critique'>('debate');
  const [debateRounds, setDebateRounds] = useState(3);
  const [includeHuman, setIncludeHuman] = useState(false);
  const [conductorModel, setConductorModel] = useState('');
  const [conductorMode, setConductorMode] = useState<'delegate' | 'evaluate' | 'synthesize'>('synthesize');
  const [autoRouteCriteria, setAutoRouteCriteria] = useState<'balanced' | 'fastest' | 'cheapest' | 'best_quality'>('balanced');
  const [compareWithAlternatives, setCompareWithAlternatives] = useState(false);
  const [modelListHeight, setModelListHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('http://localhost:8000/api/models').then(r => r.json()),
      fetch('http://localhost:8000/api/regions').then(r => r.json()),
    ]).then(([modelsData, regionsData]) => {
      setModels(modelsData.models);
      setRegions(regionsData.regions);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newHeight = Math.max(150, Math.min(600, modelListHeight + e.movementY));
      setModelListHeight(newHeight);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, modelListHeight]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (executionMode === 'autoroute') {
      if (!prompt.trim()) return;
      onAutoRoute({ prompt, criteria: autoRouteCriteria, region, max_tokens: maxTokens, temperature, compare_with_alternatives: compareWithAlternatives });
    } else if (executionMode === 'conductor') {
      if (!conductorModel) { alert('指揮者モデルを選択してください'); return; }
      if (selectedModels.length < 1) { alert('少なくとも1つのワーカーモデルを選択してください'); return; }
      onConductor({ conductor_model_id: conductorModel, worker_model_ids: selectedModels.filter(m => m !== conductorModel), task: prompt, region, max_tokens: maxTokens, temperature, mode: conductorMode, enable_reasoning: enableReasoning, reasoning_budget_tokens: reasoningBudget });
    } else if (executionMode === 'debate') {
      if (selectedModels.length < 2) { alert('壁打ちモードでは2つ以上のモデルを選択してください'); return; }
      onDebate({ model_ids: selectedModels, topic: prompt, rounds: debateRounds, region, max_tokens: maxTokens, temperature, mode: debateMode, enable_reasoning: enableReasoning, reasoning_budget_tokens: reasoningBudget, include_human: includeHuman });
    } else {
      if (selectedModels.length === 0) { alert('少なくとも1つのモデルを選択してください'); return; }
      onExecute({ model_ids: selectedModels, prompt, region, max_tokens: maxTokens, temperature, enable_reasoning: enableReasoning, reasoning_budget_tokens: reasoningBudget });
    }
  };

  const toggleModel = (modelId: string) => setSelectedModels(prev => prev.includes(modelId) ? prev.filter(id => id !== modelId) : [...prev, modelId]);
  const selectAll = () => setSelectedModels(models.map(m => m.id));
  const deselectAll = () => setSelectedModels([]);
  const selectByProvider = (provider: string) => {
    const providerModels = models.filter(m => m.provider === provider).map(m => m.id);
    setSelectedModels(prev => [...new Set([...prev, ...providerModels])]);
  };
  const isReasoningSupported = (modelId: string) => ['claude-sonnet-4', 'claude-opus-4', 'claude-3-7', 'deepseek.r1', 'kimi-k2-thinking'].some(x => modelId.includes(x));
  const getModeTitle = () => {
    switch (executionMode) {
      case 'debate': return '🎭 モデル壁打ち';
      case 'conductor': return '🎼 指揮者モード';
      case 'autoroute': return '🎯 Auto Route';
      default: return '🚀 モデル比較';
    }
  };
  const modelsByProvider = models.reduce((acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = [];
    acc[model.provider].push(model);
    return acc;
  }, {} as Record<string, Model[]>);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">{getModeTitle()}</h2>

      <CollapsibleSection title={executionMode === 'conductor' ? '指揮者設定' : executionMode === 'debate' ? '壁打ち設定' : executionMode === 'autoroute' ? 'Auto Route設定' : 'モード設定'} icon={executionMode === 'conductor' ? '🎼' : executionMode === 'debate' ? '🎭' : executionMode === 'autoroute' ? '🎯' : '⚙️'} defaultOpen={true}>
        {executionMode === 'autoroute' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">選択基準</label>
              <select value={autoRouteCriteria} onChange={(e) => setAutoRouteCriteria(e.target.value as any)} className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:border-indigo-500 focus:outline-none">
                <option value="balanced">⚖️ バランス重視</option>
                <option value="fastest">⚡ 速度重視</option>
                <option value="cheapest">💰 コスト重視</option>
                <option value="best_quality">🏆 品質重視</option>
              </select>
            </div>
            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">📊 代替案と比較</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={compareWithAlternatives} onChange={(e) => setCompareWithAlternatives(e.target.checked)} className="sr-only peer" />
                  <div className="w-10 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
              {compareWithAlternatives && <p className="text-xs text-indigo-700 mt-2">選択されたモデルと代替案も同時に実行して比較します</p>}
            </div>
          </div>
        )}
        {executionMode === 'conductor' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">指揮者モデル</label>
              <select value={conductorModel} onChange={(e) => setConductorModel(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:border-yellow-500 focus:outline-none">
                <option value="">選択...</option>
                {models.filter(m => m.provider === 'Anthropic').map(model => (<option key={model.id} value={model.id}>{model.name}</option>))}
                <optgroup label="その他">{models.filter(m => m.provider !== 'Anthropic').slice(0, 10).map(model => (<option key={model.id} value={model.id}>{model.name}</option>))}</optgroup>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">実行モード</label>
              <select value={conductorMode} onChange={(e) => setConductorMode(e.target.value as any)} className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:border-yellow-500 focus:outline-none">
                <option value="delegate">📋 タスク分割</option>
                <option value="evaluate">📊 評価</option>
                <option value="synthesize">🔗 統合</option>
              </select>
            </div>
          </div>
        )}
        {executionMode === 'debate' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">壁打ちモード</label>
              <select value={debateMode} onChange={(e) => setDebateMode(e.target.value as any)} className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:border-purple-500 focus:outline-none">
                <option value="debate">🎭 ディベート</option>
                <option value="brainstorm">💡 ブレスト</option>
                <option value="critique">🔍 批評</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ラウンド数</label>
              <input type="number" value={debateRounds} onChange={(e) => setDebateRounds(Number(e.target.value))} min={1} max={10} className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:border-purple-500 focus:outline-none" />
            </div>
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">🙋 自分も参加する</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={includeHuman} onChange={(e) => setIncludeHuman(e.target.checked)} className="sr-only peer" />
                  <div className="w-10 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                </label>
              </div>
              {includeHuman && <p className="text-xs text-green-700 mt-2">各ラウンドでモデルの発言後に反論できます</p>}
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">発言順序（ドラッグで並び替え）</label>
                <button type="button" onClick={deselectAll} className="px-2 py-1 text-xs bg-gray-400 text-white rounded hover:bg-gray-500">全解除</button>
              </div>
              <div className="bg-purple-50 rounded-lg p-2 border border-purple-200">
                <OrderableModelList models={models} selectedModels={selectedModels} onReorder={setSelectedModels} onRemove={(modelId) => setSelectedModels(prev => prev.filter(id => id !== modelId))} />
              </div>
            </div>
          </div>
        )}
        {executionMode === 'compare' && <p className="text-sm text-gray-500">選択したモデルを並列実行して結果を比較します</p>}
      </CollapsibleSection>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{executionMode === 'debate' ? 'トピック' : executionMode === 'conductor' ? 'タスク' : 'プロンプト'}</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} required placeholder={executionMode === 'debate' ? "議論したいトピックを入力..." : executionMode === 'conductor' ? "タスクを入力..." : "プロンプトを入力..."} className="w-full p-3 border border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none min-h-24 text-sm resize-y" />
      </div>

      {executionMode !== 'autoroute' && (
      <CollapsibleSection title={`${executionMode === 'conductor' ? 'ワーカー' : 'モデル'}選択（${selectedModels.length}個）`} icon="🤖" defaultOpen={true}>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={selectAll} className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700">全選択</button>
            <button type="button" onClick={deselectAll} className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600">全解除</button>
            <span className="text-gray-300">|</span>
            {Object.keys(modelsByProvider).map(provider => (
              <button key={provider} type="button" onClick={() => selectByProvider(provider)} className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">{provider}</button>
            ))}
          </div>
          <div className="border border-gray-300 rounded-lg overflow-hidden" style={{ height: modelListHeight }}>
            <div className="h-full overflow-y-auto p-2 space-y-1">
              {Object.entries(modelsByProvider).map(([provider, providerModels]) => (
                <div key={provider} className="mb-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1 py-1 bg-gray-50 rounded">{provider} ({providerModels.filter(m => selectedModels.includes(m.id)).length}/{providerModels.length})</div>
                  {providerModels.map(model => (
                    <label key={model.id} className="flex items-center p-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm">
                      <input type="checkbox" checked={selectedModels.includes(model.id)} onChange={() => toggleModel(model.id)} className="mr-2 w-3.5 h-3.5" />
                      <span className="flex-1 truncate">{model.name}{isReasoningSupported(model.id) && <span className="ml-1 text-xs bg-purple-100 text-purple-700 px-1 rounded">🧠</span>}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="h-2 bg-gray-200 hover:bg-purple-300 cursor-ns-resize rounded flex items-center justify-center" onMouseDown={() => setIsResizing(true)}>
            <div className="w-8 h-1 bg-gray-400 rounded"></div>
          </div>
        </div>
      </CollapsibleSection>
      )}

      <CollapsibleSection title="詳細設定" icon="🔧" defaultOpen={false}>
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 mb-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">🧠 推論モード</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={enableReasoning} onChange={(e) => setEnableReasoning(e.target.checked)} className="sr-only peer" />
              <div className="w-10 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>
          {enableReasoning && (
            <div className="mt-2">
              <input type="number" value={reasoningBudget} onChange={(e) => setReasoningBudget(Number(e.target.value))} min={1000} max={50000} step={1000} className="w-full p-2 border border-gray-300 rounded text-sm" placeholder="トークン予算" />
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">リージョン</label>
            <select value={region} onChange={(e) => setRegion(e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm">
              {regions.map(r => (<option key={r.id} value={r.id}>{r.id}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Max Tokens</label>
            <input type="number" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Temp</label>
            <input type="number" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} min={0} max={1} step={0.1} className="w-full p-2 border border-gray-300 rounded text-sm" />
          </div>
        </div>
      </CollapsibleSection>

      <button type="submit" disabled={isExecuting} className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-800 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-purple-900 disabled:opacity-50 disabled:cursor-not-allowed transition">
        {isExecuting ? '実行中...' : '▶ 実行'}
      </button>

      {isExecuting && (
        <button type="button" onClick={onCancel} className="w-full py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition">⏹ キャンセル</button>
      )}
    </form>
  );
}
