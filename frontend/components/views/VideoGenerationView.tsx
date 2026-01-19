'use client';

import { useState, useEffect, useRef } from 'react';
import { VideoGenerationRequest, VideoResult, VideoStatus, VideoStatusResponse, MediaStreamEvent } from '@/types';
import VideoResultCard from '@/components/results/VideoResultCard';

interface VideoGenerationViewProps {
  isExecuting: boolean;
  setIsExecuting: (value: boolean) => void;
}

interface VideoModel {
  id: string;
  name: string;
  provider: string;
}

const VIDEO_MODELS: VideoModel[] = [
  { id: 'amazon.nova-reel-v1:0', name: 'Nova Reel v1.0', provider: 'Amazon' },
  { id: 'amazon.nova-reel-v1:1', name: 'Nova Reel v1.1', provider: 'Amazon' },
];

const VIDEO_DIMENSIONS = [
  { label: '1280x720 (HD)', value: '1280x720' },
  { label: '720x1280 (Vertical)', value: '720x1280' },
];

const VIDEO_DURATIONS = [
  { label: '6 seconds', value: 6 },
];

export default function VideoGenerationView({ isExecuting, setIsExecuting }: VideoGenerationViewProps) {
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [s3OutputUri, setS3OutputUri] = useState('');
  const [defaultS3Uri, setDefaultS3Uri] = useState('');
  const [dimension, setDimension] = useState('1280x720');
  const [duration, setDuration] = useState(6);
  const [fps, setFps] = useState(24);
  const [seed, setSeed] = useState<string>('');
  const [region, setRegion] = useState('us-east-1');
  const [results, setResults] = useState<VideoResult[]>([]);
  const [statuses, setStatuses] = useState<Record<string, VideoStatus>>({});
  const [isPolling, setIsPolling] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch default S3 URI from settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/settings');
        if (response.ok) {
          const settings = await response.json();
          if (settings.video_s3_output_uri) {
            setDefaultS3Uri(settings.video_s3_output_uri);
            // Only set if user hasn't already entered a value
            if (!s3OutputUri) {
              setS3OutputUri(settings.video_s3_output_uri);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      }
    };
    fetchSettings();
  }, []);

  const toggleModel = (modelId: string) => {
    setSelectedModels(prev =>
      prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedModels.length === 0) {
      alert('Please select at least one model');
      return;
    }
    if (!prompt.trim()) {
      alert('Please enter a prompt');
      return;
    }
    // S3 URI is optional if default is set in .env
    const effectiveS3Uri = s3OutputUri.trim() || defaultS3Uri;
    if (!effectiveS3Uri) {
      alert('Please enter an S3 output URI or configure VIDEO_S3_OUTPUT_URI in settings');
      return;
    }

    setIsExecuting(true);
    setResults([]);
    setStatuses({});

    const request: VideoGenerationRequest = {
      model_ids: selectedModels,
      prompt: prompt.trim(),
      s3_output_base_uri: s3OutputUri.trim() || undefined,  // Send undefined to use server default
      region,
      duration_seconds: duration,
      fps,
      dimension,
      seed: seed ? parseInt(seed) : undefined,
    };

    try {
      abortControllerRef.current = new AbortController();
      const response = await fetch('http://localhost:8000/api/generate-video-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: abortControllerRef.current.signal,
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No reader available');

      const newResults: VideoResult[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: MediaStreamEvent = JSON.parse(line.slice(6));
              if (event.type === 'result' && event.data) {
                const result = event.data as VideoResult;
                newResults.push(result);
                setResults(prev => [...prev, result]);
              }
            } catch (parseError) {
              console.error('Parse error:', parseError);
            }
          }
        }
      }

      // Start polling for status updates
      if (newResults.some(r => r.success && r.invocation_arn)) {
        startPolling(newResults);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error:', error);
        alert('Error starting video generation: ' + error.message);
      }
    } finally {
      setIsExecuting(false);
      abortControllerRef.current = null;
    }
  };

  const startPolling = (videoResults: VideoResult[]) => {
    setIsPolling(true);
    const arns = videoResults
      .filter(r => r.success && r.invocation_arn)
      .map(r => r.invocation_arn!);

    if (arns.length === 0) return;

    const poll = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/video-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invocation_arns: arns, region }),
        });

        const data: VideoStatusResponse = await response.json();

        const newStatuses: Record<string, VideoStatus> = {};
        data.statuses.forEach(status => {
          newStatuses[status.invocation_arn] = status;
        });
        setStatuses(newStatuses);

        // Stop polling if all completed or failed
        const allDone = data.statuses.every(
          s => s.status === 'Completed' || s.status === 'Failed' || !s.success
        );
        if (allDone) {
          stopPolling();
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    // Initial poll
    poll();

    // Poll every 10 seconds
    pollingIntervalRef.current = setInterval(poll, 10000);
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    stopPolling();
    setIsExecuting(false);
  };

  const handleRefreshStatus = () => {
    const arns = results
      .filter(r => r.success && r.invocation_arn)
      .map(r => r.invocation_arn!);

    if (arns.length > 0) {
      startPolling(results);
    }
  };

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  return (
    <div className="flex h-full">
      {/* Settings Panel */}
      <div className="w-96 bg-white border-r border-gray-200 p-6 overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <span>🎬</span> Video Generation
          </h2>

          {/* Model Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Models</label>
            <div className="space-y-2">
              {VIDEO_MODELS.map(model => (
                <label key={model.id} className="flex items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={selectedModels.includes(model.id)}
                    onChange={() => toggleModel(model.id)}
                    className="mr-3"
                  />
                  <div>
                    <div className="font-medium text-sm">{model.name}</div>
                    <div className="text-xs text-gray-500">{model.provider}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prompt</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe the video you want to generate..."
              className="w-full p-3 border border-gray-300 rounded-lg text-sm resize-y min-h-24 focus:border-purple-500 focus:outline-none"
              required
            />
          </div>

          {/* S3 Output URI */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              S3 Output URI
              {defaultS3Uri && <span className="text-gray-400 font-normal ml-1">(optional)</span>}
            </label>
            <input
              type="text"
              value={s3OutputUri}
              onChange={e => setS3OutputUri(e.target.value)}
              placeholder={defaultS3Uri || "s3://your-bucket/output-path"}
              className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:border-purple-500 focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              {defaultS3Uri
                ? `Default: ${defaultS3Uri} (from settings)`
                : 'Set VIDEO_S3_OUTPUT_URI in settings for a default value'}
            </p>
          </div>

          {/* Video Settings */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Dimension</label>
              <select
                value={dimension}
                onChange={e => setDimension(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
              >
                {VIDEO_DIMENSIONS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Duration</label>
              <select
                value={duration}
                onChange={e => setDuration(parseInt(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
              >
                {VIDEO_DURATIONS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">FPS</label>
              <input
                type="number"
                value={fps}
                onChange={e => setFps(parseInt(e.target.value) || 24)}
                min={12}
                max={30}
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Seed (Optional)</label>
              <input
                type="text"
                value={seed}
                onChange={e => setSeed(e.target.value.replace(/\D/g, ''))}
                placeholder="Random"
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          {/* Region */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Region</label>
            <select
              value={region}
              onChange={e => setRegion(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="us-east-1">us-east-1</option>
              <option value="us-west-2">us-west-2</option>
            </select>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isExecuting}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-800 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-purple-900 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isExecuting ? 'Starting...' : 'Start Video Generation'}
          </button>

          {(isExecuting || isPolling) && (
            <button
              type="button"
              onClick={handleCancel}
              className="w-full py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition"
            >
              Cancel
            </button>
          )}

          {results.length > 0 && !isPolling && (
            <button
              type="button"
              onClick={handleRefreshStatus}
              className="w-full py-3 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 transition"
            >
              Refresh Status
            </button>
          )}
        </form>
      </div>

      {/* Results Panel */}
      <div className="flex-1 bg-gray-50 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">
            Results {results.length > 0 && `(${results.length})`}
          </h3>
          {isPolling && (
            <span className="flex items-center gap-2 text-sm text-purple-600">
              <span className="animate-pulse">Polling status...</span>
            </span>
          )}
        </div>

        {results.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <div className="text-center">
              <p className="text-4xl mb-2">🎬</p>
              <p>Select models and enter a prompt to generate videos</p>
              <p className="text-sm mt-2">Videos are generated asynchronously and stored in S3</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {results.map((result, index) => (
              <VideoResultCard
                key={`${result.model_id}-${index}`}
                result={result}
                status={result.invocation_arn ? statuses[result.invocation_arn] : undefined}
                onClick={() => {}}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
