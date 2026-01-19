'use client';

import { useState, useMemo } from 'react';
import { Result } from '@/types';
import ResultCard from './ResultCard';
import DetailModal from '../modals/DetailModal';
import ComparisonModal from '../modals/ComparisonModal';

interface ResultsViewProps {
  results: Result[];
  isExecuting: boolean;
  progress: { current: number; total: number };
}

export default function ResultsView({ results, isExecuting, progress }: ResultsViewProps) {
  const [sortBy, setSortBy] = useState('default');
  const [selectedResult, setSelectedResult] = useState<Result | null>(null);
  const [selectedForComparison, setSelectedForComparison] = useState<number[]>([]);
  const [showComparison, setShowComparison] = useState(false);

  const sortedResults = useMemo(() => {
    const getProviderFromModelId = (modelId: string): string => {
      if (typeof window !== 'undefined' && (window as any).bedrockModels) {
        const model = (window as any).bedrockModels.find((m: any) => m.id === modelId);
        return model?.provider || 'Unknown';
      }
      return 'Unknown';
    };
    const sorted = [...results];
    switch (sortBy) {
      case 'time-asc': return sorted.sort((a, b) => a.elapsed_time - b.elapsed_time);
      case 'time-desc': return sorted.sort((a, b) => b.elapsed_time - a.elapsed_time);
      case 'cost-asc': return sorted.sort((a, b) => (a.cost?.total_cost || 0) - (b.cost?.total_cost || 0));
      case 'cost-desc': return sorted.sort((a, b) => (b.cost?.total_cost || 0) - (a.cost?.total_cost || 0));
      case 'status': return sorted.sort((a, b) => (a.success === b.success ? 0 : a.success ? -1 : 1));
      case 'provider-asc': return sorted.sort((a, b) => getProviderFromModelId(a.model_id).localeCompare(getProviderFromModelId(b.model_id)));
      case 'provider-desc': return sorted.sort((a, b) => getProviderFromModelId(b.model_id).localeCompare(getProviderFromModelId(a.model_id)));
      default: return sorted.sort((a, b) => a.execution_id - b.execution_id);
    }
  }, [results, sortBy]);

  const summary = useMemo(() => {
    const success = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const avgTime = results.length > 0 ? results.reduce((sum, r) => sum + r.elapsed_time, 0) / results.length : 0;
    const totalCost = results.filter(r => r.success && r.cost).reduce((sum, r) => sum + (r.cost?.total_cost || 0), 0);
    return { success, failed, avgTime, totalCost };
  }, [results]);

  const toggleComparison = (executionId: number) => {
    setSelectedForComparison(prev => prev.includes(executionId) ? prev.filter(id => id !== executionId) : [...prev, executionId]);
  };
  const comparisonResults = useMemo(() => results.filter(r => selectedForComparison.includes(r.execution_id)), [results, selectedForComparison]);

  return (
    <div className="bg-white rounded-2xl shadow-2xl p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-gray-800">実行結果</h2>
        <div className="flex items-center gap-4">
          {selectedForComparison.length > 0 && (
            <button onClick={() => setShowComparison(true)} className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-semibold">比較 ({selectedForComparison.length}個)</button>
          )}
          {isExecuting && <span className="text-purple-600 font-semibold">実行中... ({progress.current}/{progress.total})</span>}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-purple-600 focus:outline-none">
            <option value="default">実行順</option>
            <option value="time-asc">時間（速い順）</option>
            <option value="time-desc">時間（遅い順）</option>
            <option value="cost-asc">コスト（安い順）</option>
            <option value="cost-desc">コスト（高い順）</option>
            <option value="status">ステータス順</option>
            <option value="provider-asc">プロバイダー（A-Z）</option>
            <option value="provider-desc">プロバイダー（Z-A）</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-8">
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 sm:p-6 rounded-xl text-center">
          <div className="text-2xl sm:text-3xl font-bold text-purple-600">{results.length}</div>
          <div className="text-xs sm:text-sm text-gray-600 mt-1 sm:mt-2">完了</div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 sm:p-6 rounded-xl text-center">
          <div className="text-2xl sm:text-3xl font-bold text-green-600">{summary.success}</div>
          <div className="text-xs sm:text-sm text-gray-600 mt-1 sm:mt-2">成功</div>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 sm:p-6 rounded-xl text-center">
          <div className="text-2xl sm:text-3xl font-bold text-red-600">{summary.failed}</div>
          <div className="text-xs sm:text-sm text-gray-600 mt-1 sm:mt-2">失敗</div>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 sm:p-6 rounded-xl text-center">
          <div className="text-xl sm:text-2xl font-bold text-blue-600">{summary.avgTime.toFixed(2)}<span className="text-sm">s</span></div>
          <div className="text-xs sm:text-sm text-gray-600 mt-1 sm:mt-2">平均時間</div>
        </div>
        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-4 sm:p-6 rounded-xl text-center col-span-2 sm:col-span-1">
          <div className="text-xl sm:text-2xl font-bold text-yellow-600">${summary.totalCost.toFixed(4)}</div>
          <div className="text-xs sm:text-sm text-gray-600 mt-1 sm:mt-2">総コスト</div>
        </div>
      </div>

      <div className="space-y-3">
        {sortedResults.map(result => (
          <div key={result.execution_id} className="relative">
            <div className="absolute left-2 top-2 z-10">
              <input type="checkbox" checked={selectedForComparison.includes(result.execution_id)} onChange={() => toggleComparison(result.execution_id)} onClick={(e) => e.stopPropagation()} className="w-5 h-5 cursor-pointer" />
            </div>
            <div className="pl-10"><ResultCard result={result} onClick={() => setSelectedResult(result)} /></div>
          </div>
        ))}
      </div>

      {selectedResult && <DetailModal result={selectedResult} onClose={() => setSelectedResult(null)} />}
      {showComparison && comparisonResults.length > 0 && <ComparisonModal results={comparisonResults} onClose={() => setShowComparison(false)} />}
    </div>
  );
}
