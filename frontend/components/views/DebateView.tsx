'use client';

import { DebateResponse, Model, DebateProgress } from '@/types';
import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DebateViewProps {
  debate: DebateResponse;
  models: Model[];
  progress?: DebateProgress;
  isExecuting?: boolean;
  onHumanInput?: (message: string) => void;
}

export default function DebateView({ debate, models, progress, isExecuting, onHumanInput }: DebateViewProps) {
  const [expandedThinking, setExpandedThinking] = useState<string | null>(null);
  const [humanMessage, setHumanMessage] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isExecuting && bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [debate.rounds, isExecuting]);

  useEffect(() => {
    if (progress?.waitingForHuman && inputRef.current) inputRef.current.focus();
  }, [progress?.waitingForHuman]);

  const handleSubmitHumanInput = () => {
    if (humanMessage.trim() && onHumanInput) { onHumanInput(humanMessage.trim()); setHumanMessage(''); }
  };

  const getModelName = (modelId: string) => {
    if (modelId === 'human') return 'あなた';
    const model = models.find(m => m.id === modelId);
    return model?.name || modelId.split('.').pop()?.slice(0, 25) || modelId;
  };

  const getModelColor = (index: number, modelId?: string) => {
    if (modelId === 'human') return 'bg-green-100 border-green-500';
    const colors = ['bg-blue-100 border-blue-400', 'bg-green-100 border-green-400', 'bg-orange-100 border-orange-400', 'bg-pink-100 border-pink-400'];
    return colors[index % colors.length];
  };

  const getModelBgColor = (index: number, modelId?: string) => {
    if (modelId === 'human') return 'bg-green-600';
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500'];
    return colors[index % colors.length];
  };

  const getModeLabel = (mode: string) => {
    const labels: Record<string, string> = { debate: '🎭 ディベート', brainstorm: '💡 ブレインストーミング', critique: '🔍 批評' };
    return labels[mode] || mode;
  };

  const getConclusion = () => {
    if (debate.rounds.length === 0) return null;
    const lastRound = debate.rounds[debate.rounds.length - 1];
    if (!lastRound || lastRound.results.length === 0) return null;
    const lastResult = lastRound.results[lastRound.results.length - 1];
    if (!lastResult.success) return null;
    return { result: lastResult, speakerIndex: lastResult.speaker_index ?? lastRound.results.length - 1 };
  };

  const conclusion = !isExecuting && progress?.isComplete ? getConclusion() : null;
  const isConclusion = (roundIndex: number, resultIndex: number) => {
    if (isExecuting || !progress?.isComplete) return false;
    return roundIndex === debate.rounds.length - 1 && resultIndex === debate.rounds[roundIndex].results.length - 1;
  };

  return (
    <div className="space-y-6">
      {conclusion && (
        <div className="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-2xl shadow-2xl p-6 border-2 border-yellow-400">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">🏆</span>
            <div><h2 className="text-xl font-bold text-gray-800">最終結論</h2><p className="text-sm text-gray-600">{getModelName(conclusion.result.model_id)} による最終発言</p></div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-yellow-300">
            <div className="prose prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{conclusion.result.output}</ReactMarkdown></div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-2xl p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-bold text-gray-800">{getModeLabel(debate.mode)}</h2>
            {isExecuting && progress && (
              <div className="flex items-center gap-2 text-purple-600">
                <div className="animate-spin h-5 w-5 border-2 border-purple-600 border-t-transparent rounded-full"></div>
                <span className="font-medium">ラウンド {progress.currentRound}/{progress.totalRounds}</span>
              </div>
            )}
            {!isExecuting && progress?.isComplete && <span className="text-green-600 font-medium">✅ 完了</span>}
          </div>
          <p className="text-gray-600 mb-4"><span className="font-semibold">トピック:</span> {debate.topic}</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {debate.participants.map((modelId, index) => {
              const isSpeaking = isExecuting && progress?.currentSpeaker === modelId;
              const isLastSpeaker = conclusion && conclusion.result.model_id === modelId;
              const isHuman = modelId === 'human';
              return (
                <span key={modelId} className={`px-3 py-1 rounded-full text-sm font-medium border-2 transition-all ${isHuman ? 'bg-green-100 border-green-500' : getModelColor(index)} ${isSpeaking ? 'ring-2 ring-purple-500 ring-offset-2 animate-pulse' : ''} ${isLastSpeaker ? 'ring-2 ring-yellow-500 ring-offset-2' : ''}`}>
                  {isSpeaking && <span className="mr-1">💬</span>}{isLastSpeaker && <span className="mr-1">🏆</span>}{isHuman && <span className="mr-1">🙋</span>}{getModelName(modelId)}
                </span>
              );
            })}
          </div>
          {isExecuting && progress && (
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1"><span>進捗</span><span>{Math.round((progress.currentRound / progress.totalRounds) * 100)}%</span></div>
              <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-purple-600 h-2 rounded-full transition-all duration-300" style={{ width: `${(progress.currentRound / progress.totalRounds) * 100}%` }}></div></div>
              {progress.currentSpeaker && <p className="text-sm text-purple-600 mt-2 animate-pulse">💬 {getModelName(progress.currentSpeaker)} が発言中...</p>}
            </div>
          )}
          <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
            <div><span className="font-semibold">ラウンド数:</span> {debate.total_rounds}</div>
            <div><span className="font-semibold">総発言数:</span> {debate.summary.total_exchanges}</div>
            <div><span className="font-semibold">総時間:</span> {debate.summary.total_time.toFixed(1)}秒</div>
            {(debate.summary as any).skipped_count > 0 && (
              <div className="text-orange-600"><span className="font-semibold">⏭️ スキップ:</span> {(debate.summary as any).skipped_count}件</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {debate.rounds.map((round, roundIndex) => (
            <div key={round.round} className="border-t pt-4">
              <h3 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
                ラウンド {round.round}
                {round.round === debate.total_rounds && !isExecuting && progress?.isComplete && <span className="text-sm bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">最終ラウンド</span>}
                {isExecuting && progress?.currentRound === round.round && <span className="text-sm text-purple-600 font-normal animate-pulse">(進行中)</span>}
              </h3>
              <div className="space-y-4">
                {round.results.map((result, idx) => {
                  const speakerIndex = result.speaker_index ?? idx;
                  const thinkingKey = `${round.round}-${idx}`;
                  const isFinalConclusion = isConclusion(roundIndex, idx);
                  return (
                    <div key={idx} className={`p-4 rounded-lg border-l-4 transition-all duration-300 ${isFinalConclusion ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-500 ring-2 ring-yellow-400 shadow-lg' : getModelColor(speakerIndex, result.model_id)}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          {isFinalConclusion && <span className="text-xl">🏆</span>}
                          {result.model_id === 'human' && <span className="text-xl">🙋</span>}
                          <span className={`w-3 h-3 rounded-full ${getModelBgColor(speakerIndex, result.model_id)}`}></span>
                          <span className="font-semibold text-gray-800">{getModelName(result.model_id)}</span>
                          {isFinalConclusion && <span className="text-xs bg-yellow-500 text-white px-2 py-0.5 rounded-full">最終結論</span>}
                        </div>
                        <span className="text-sm text-gray-500">{result.elapsed_time.toFixed(2)}秒</span>
                      </div>
                      {result.success ? (
                        <>
                          {result.thinking && (
                            <div className="mb-3">
                              <button onClick={() => setExpandedThinking(expandedThinking === thinkingKey ? null : thinkingKey)} className="text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1">🧠 推論内容を{expandedThinking === thinkingKey ? '隠す' : '表示'}</button>
                              {expandedThinking === thinkingKey && <div className="mt-2 p-3 bg-purple-50 rounded text-sm text-gray-700 prose prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{result.thinking}</ReactMarkdown></div>}
                            </div>
                          )}
                          {(result as any).skipped ? (
                            <div className="text-gray-400 italic">（スキップしました）</div>
                          ) : (
                            <div className="text-gray-700 prose prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{result.output}</ReactMarkdown></div>
                          )}
                        </>
                      ) : (
                        <div className="text-orange-600 bg-orange-50 p-2 rounded">
                          <span className="font-medium">⏭️ スキップ:</span> {result.error}
                        </div>
                      )}
                    </div>
                  );
                })}
                {isExecuting && progress?.currentRound === round.round && progress.currentSpeaker && progress.currentSpeaker !== 'human' && !round.results.find(r => r.model_id === progress.currentSpeaker) && (
                  <div className={`p-4 rounded-lg border-l-4 ${getModelColor(progress.speakerIndex)} animate-pulse`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-3 h-3 rounded-full ${getModelBgColor(progress.speakerIndex)}`}></span>
                      <span className="font-semibold text-gray-800">{getModelName(progress.currentSpeaker)}</span>
                      <span className="text-sm text-purple-600">発言中...</span>
                    </div>
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef}></div>
          {progress?.waitingForHuman && onHumanInput && (
            <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border-2 border-green-400 animate-pulse">
              <div className="flex items-center gap-2 mb-3"><span className="text-2xl">🙋</span><span className="font-bold text-green-800">あなたの番です！</span></div>
              <textarea ref={inputRef} value={humanMessage} onChange={(e) => setHumanMessage(e.target.value)} placeholder="反論や意見を入力してください..." className="w-full p-3 border border-green-300 rounded-lg focus:border-green-500 focus:outline-none min-h-24 resize-y" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmitHumanInput(); }} />
              <div className="flex justify-between items-center mt-2">
                <span className="text-xs text-gray-500">Cmd/Ctrl + Enter で送信</span>
                <div className="flex gap-2">
                  <button onClick={() => { onHumanInput('[スキップ]'); setHumanMessage(''); }} className="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition">⏭️ スキップ</button>
                  <button onClick={handleSubmitHumanInput} disabled={!humanMessage.trim()} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition">💬 発言する</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
