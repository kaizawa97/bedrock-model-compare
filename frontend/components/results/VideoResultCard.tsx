'use client';

import { VideoResult, VideoStatus } from '@/types';

interface VideoResultCardProps {
  result: VideoResult;
  status?: VideoStatus;
  onClick: () => void;
}

function getProviderFromModelId(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.includes('nova-reel')) return 'Amazon';
  return 'Unknown';
}

function getShortModelName(modelId: string): string {
  const lastPart = modelId.split('.').pop()?.split(':')[0] || modelId;
  if (lastPart.includes('nova-reel-v1-1')) return 'Nova Reel v1.1';
  if (lastPart.includes('nova-reel')) return 'Nova Reel v1.0';
  return lastPart.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getStatusBadge(status?: string) {
  switch (status) {
    case 'Completed':
      return <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-semibold">Completed</span>;
    case 'InProgress':
      return <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-semibold animate-pulse">In Progress</span>;
    case 'Failed':
      return <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-semibold">Failed</span>;
    default:
      return <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs font-semibold">{status || 'Unknown'}</span>;
  }
}

export default function VideoResultCard({ result, status, onClick }: VideoResultCardProps) {
  const modelName = getShortModelName(result.model_id);
  const provider = getProviderFromModelId(result.model_id);
  const currentStatus = status?.status || result.status;

  return (
    <div
      onClick={onClick}
      className={`
        grid grid-cols-[280px_1fr] gap-6 p-6 rounded-xl cursor-pointer
        transition-all duration-200 hover:translate-x-2 hover:shadow-lg
        ${result.success
          ? 'bg-gradient-to-r from-purple-50 to-white border-l-4 border-purple-500'
          : 'bg-gradient-to-r from-red-50 to-white border-l-4 border-red-500'
        }
      `}
    >
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-purple-600">{modelName}</h3>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Provider</span>
            <span>{provider}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">Time</span>
            <span>{result.elapsed_time.toFixed(2)}s</span>
          </div>
          {result.success && (
            <>
              <div className="flex items-center gap-2">
                <span className="font-semibold">Duration</span>
                <span>{result.duration_seconds}s</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">Resolution</span>
                <span>{result.dimension}</span>
              </div>
            </>
          )}
          <div className="flex items-center gap-2">
            {getStatusBadge(currentStatus)}
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border border-gray-200 overflow-hidden">
        {result.success ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center h-32 bg-gray-100 rounded-lg">
              {currentStatus === 'Completed' && status?.output_location ? (
                <div className="text-center">
                  <p className="text-green-600 font-medium mb-2">Video Generated</p>
                  <p className="text-xs text-gray-500 break-all px-4">{status.output_location}</p>
                </div>
              ) : currentStatus === 'InProgress' ? (
                <div className="text-center">
                  <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                  <p className="text-gray-600">Generating video...</p>
                </div>
              ) : currentStatus === 'Failed' ? (
                <div className="text-center text-red-600">
                  <p className="font-medium">Generation Failed</p>
                  <p className="text-xs mt-1">{status?.failure_message}</p>
                </div>
              ) : (
                <div className="text-center text-gray-500">
                  <p>Job started</p>
                  <p className="text-xs mt-1">Check status for updates</p>
                </div>
              )}
            </div>
            {result.invocation_arn && (
              <div className="text-xs text-gray-400 break-all">
                ARN: {result.invocation_arn.split('/').pop()}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32">
            <pre className="text-sm text-red-600 whitespace-pre-wrap break-words">{result.error}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
