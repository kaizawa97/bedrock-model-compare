'use client';

import { useState, useEffect } from 'react';
import { DashboardData } from '@/types/analytics';
import ReactMarkdown from 'react-markdown';

interface ExecutionRecord {
  model_id: string;
  model_name: string;
  prompt: string;
  response: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_seconds: number;
  timestamp: string;
  task_type: string;
}

interface AnalyticsDashboardProps {
  apiBase: string;
}

export default function AnalyticsDashboard({ apiBase }: AnalyticsDashboardProps) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [dailyBudget, setDailyBudget] = useState(10);
  const [monthlyBudget, setMonthlyBudget] = useState(300);
  const [expandedExecution, setExpandedExecution] = useState<number | null>(null);

  const fetchDashboard = async () => {
    try {
      const [dashRes, execRes] = await Promise.all([
        fetch(`${apiBase}/api/analytics/dashboard`),
        fetch(`${apiBase}/api/analytics/executions?limit=20`)
      ]);
      if (!dashRes.ok) throw new Error('Failed to fetch dashboard');
      const dashData = await dashRes.json();
      const execData = await execRes.json();
      setDashboard(dashData);
      setExecutions(execData.executions || []);
      setDailyBudget(dashData.budget.daily.limit);
      setMonthlyBudget(dashData.budget.monthly.limit);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000);
    return () => clearInterval(interval);
  }, [apiBase]);

  const updateBudget = async () => {
    try {
      await fetch(`${apiBase}/api/analytics/budget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daily_budget_usd: dailyBudget, monthly_budget_usd: monthlyBudget })
      });
      setEditingBudget(false);
      fetchDashboard();
    } catch (err) {
      console.error('Failed to update budget:', err);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div></div>;
  if (error || !dashboard) return <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error || 'データの取得に失敗しました'}</div>;

  const { summary, budget, model_breakdown, hourly_trend, alerts } = dashboard;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">📊 コスト・パフォーマンスダッシュボード</h2>
        <button onClick={fetchDashboard} className="px-3 py-1.5 sm:px-4 sm:py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition text-sm">🔄 更新</button>
      </div>

      {alerts.length > 0 && <div className="space-y-2">{alerts.slice(-3).map((alert, i) => <div key={i} className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded"><p className="text-yellow-800 font-medium">⚠️ {alert.message}</p></div>)}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SummaryCard title="今日のコスト" value={`$${summary.today.total_cost.toFixed(4)}`} subtitle={`${summary.today.total_requests}リクエスト`} icon="💰" color="green" />
        <SummaryCard title="今日のトークン" value={summary.today.total_tokens.toLocaleString()} subtitle={`平均: ${summary.today.avg_latency.toFixed(2)}秒`} icon="📝" color="blue" />
        <SummaryCard title="月間コスト" value={`$${summary.month.total_cost.toFixed(4)}`} subtitle={`予測: $${summary.month.projected_cost.toFixed(2)}`} icon="📅" color="purple" />
        <SummaryCard title="成功率" value={`${summary.today.success_rate.toFixed(1)}%`} subtitle="今日の実行" icon="✅" color="emerald" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800">💳 予算管理</h3>
          <button onClick={() => setEditingBudget(!editingBudget)} className="text-xs sm:text-sm text-purple-600 hover:text-purple-800">{editingBudget ? 'キャンセル' : '編集'}</button>
        </div>
        {editingBudget ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-sm text-gray-600 mb-1">日次予算 (USD)</label><input type="number" value={dailyBudget} onChange={(e) => setDailyBudget(Number(e.target.value))} className="w-full px-3 py-2 border rounded-lg" step="0.1" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">月次予算 (USD)</label><input type="number" value={monthlyBudget} onChange={(e) => setMonthlyBudget(Number(e.target.value))} className="w-full px-3 py-2 border rounded-lg" step="1" /></div>
            </div>
            <button onClick={updateBudget} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">保存</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <BudgetProgress label="日次予算" used={budget.daily.used} limit={budget.daily.limit} />
            <BudgetProgress label="月次予算" used={budget.monthly.used} limit={budget.monthly.limit} />
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-4">📦 モデル別コスト内訳</h3>
        {model_breakdown.length > 0 ? (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-xs sm:text-sm min-w-[500px]">
              <thead><tr className="border-b bg-gray-50"><th className="text-left py-2 px-2 sm:px-3 font-medium">モデル</th><th className="text-right py-2 px-2 sm:px-3 font-medium">リクエスト</th><th className="text-right py-2 px-2 sm:px-3 font-medium hidden sm:table-cell">トークン</th><th className="text-right py-2 px-2 sm:px-3 font-medium">レイテンシ</th><th className="text-right py-2 px-2 sm:px-3 font-medium">コスト</th></tr></thead>
              <tbody>{model_breakdown.map((model, i) => <tr key={i} className="border-b hover:bg-gray-50"><td className="py-2 px-2 sm:px-3 font-medium truncate max-w-[120px] sm:max-w-none">{model.model_name}</td><td className="text-right py-2 px-2 sm:px-3">{model.request_count}</td><td className="text-right py-2 px-2 sm:px-3 hidden sm:table-cell">{model.total_tokens.toLocaleString()}</td><td className="text-right py-2 px-2 sm:px-3">{model.avg_latency.toFixed(2)}s</td><td className="text-right py-2 px-2 sm:px-3 font-semibold text-green-600">${model.total_cost.toFixed(4)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="text-gray-500 text-center py-8">まだデータがありません</p>}
      </div>

      {hourly_trend.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-4">📈 時間帯別コスト（過去24時間）</h3>
          <div className="h-32 sm:h-40 flex items-end gap-0.5 sm:gap-1">
            {hourly_trend.map((item, i) => {
              const maxCost = Math.max(...hourly_trend.map(h => h.cost));
              const height = maxCost > 0 ? (item.cost / maxCost) * 100 : 0;
              return <div key={i} className="flex-1 bg-purple-400 hover:bg-purple-500 transition rounded-t cursor-pointer" style={{ height: `${Math.max(height, 2)}%` }} title={`${item.hour}: $${item.cost.toFixed(6)}`} />;
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-4">🔄 実行履歴（コスト対レスポンス）</h3>
        {executions.length > 0 ? (
          <div className="space-y-3">
            {executions.map((exec, i) => (
              <div key={i} className="border rounded-lg overflow-hidden">
                <button onClick={() => setExpandedExecution(expandedExecution === i ? null : i)} className="w-full p-3 bg-gray-50 hover:bg-gray-100 transition flex items-center justify-between text-left">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-lg">🤖</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-800 truncate">{exec.model_name}</div>
                      <div className="text-xs text-gray-500 truncate">{exec.prompt || '(プロンプトなし)'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs sm:text-sm flex-shrink-0">
                    <span className="text-green-600 font-semibold">${exec.cost_usd.toFixed(6)}</span>
                    <span className="text-gray-500">{exec.latency_seconds.toFixed(2)}s</span>
                    <span className="text-gray-400">{expandedExecution === i ? '▲' : '▼'}</span>
                  </div>
                </button>
                {expandedExecution === i && (
                  <div className="p-4 border-t bg-white">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
                      <div className="bg-blue-50 p-2 rounded"><div className="text-gray-500">入力トークン</div><div className="font-semibold">{exec.input_tokens.toLocaleString()}</div></div>
                      <div className="bg-green-50 p-2 rounded"><div className="text-gray-500">出力トークン</div><div className="font-semibold">{exec.output_tokens.toLocaleString()}</div></div>
                      <div className="bg-purple-50 p-2 rounded"><div className="text-gray-500">コスト</div><div className="font-semibold">${exec.cost_usd.toFixed(6)}</div></div>
                      <div className="bg-orange-50 p-2 rounded"><div className="text-gray-500">レイテンシ</div><div className="font-semibold">{exec.latency_seconds.toFixed(2)}秒</div></div>
                    </div>
                    {exec.prompt && <div className="mb-3"><div className="text-xs font-medium text-gray-500 mb-1">📝 プロンプト</div><div className="bg-gray-100 p-2 rounded text-sm text-gray-700 max-h-24 overflow-y-auto">{exec.prompt}</div></div>}
                    {exec.response && <div><div className="text-xs font-medium text-gray-500 mb-1">💬 レスポンス</div><div className="bg-gray-50 p-3 rounded text-sm text-gray-700 max-h-64 overflow-y-auto prose prose-sm max-w-none"><ReactMarkdown>{exec.response}</ReactMarkdown></div></div>}
                    <div className="text-xs text-gray-400 mt-2">{new Date(exec.timestamp).toLocaleString('ja-JP')}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : <p className="text-gray-500 text-center py-8">まだ実行履歴がありません。モデル比較を実行すると表示されます。</p>}
      </div>
    </div>
  );
}

function SummaryCard({ title, value, subtitle, icon, color }: { title: string; value: string; subtitle: string; icon: string; color: string }) {
  const colorClasses: Record<string, string> = { green: 'bg-green-50 border-green-200', blue: 'bg-blue-50 border-blue-200', purple: 'bg-purple-50 border-purple-200', emerald: 'bg-emerald-50 border-emerald-200' };
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${colorClasses[color]}`}>
      <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2"><span className="text-lg sm:text-2xl">{icon}</span><span className="text-xs sm:text-sm text-gray-600 truncate">{title}</span></div>
      <p className="text-lg sm:text-2xl font-bold text-gray-800 truncate">{value}</p>
      <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1 truncate">{subtitle}</p>
    </div>
  );
}

function BudgetProgress({ label, used, limit }: { label: string; used: number; limit: number }) {
  const percentage = limit > 0 ? (used / limit) * 100 : 0;
  const isWarning = percentage > 80;
  const isDanger = percentage > 95;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1"><span className="text-gray-600">{label}</span><span className={isDanger ? 'text-red-600' : isWarning ? 'text-yellow-600' : 'text-gray-600'}>${used.toFixed(4)} / ${limit.toFixed(2)}</span></div>
      <div className="h-3 bg-gray-200 rounded-full overflow-hidden"><div className={`h-full transition-all ${isDanger ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min(percentage, 100)}%` }} /></div>
      <p className="text-xs text-gray-500 mt-1">残り: ${Math.max(0, limit - used).toFixed(4)} ({(100 - percentage).toFixed(1)}%)</p>
    </div>
  );
}
