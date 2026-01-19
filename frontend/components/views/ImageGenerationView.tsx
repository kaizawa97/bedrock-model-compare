'use client';

import { useState, useEffect } from 'react';
import { ImageGenerationRequest, ImageResult, ImageGenerationResponse, MediaStreamEvent } from '@/types';
import ImageResultCard from '@/components/results/ImageResultCard';

interface ImageGenerationViewProps {
  isExecuting: boolean;
  setIsExecuting: (value: boolean) => void;
}

interface ImageModel {
  id: string;
  name: string;
  provider: string;
}

const IMAGE_MODELS: ImageModel[] = [
  { id: 'amazon.titan-image-generator-v2:0', name: 'Titan Image Generator v2', provider: 'Amazon' },
  { id: 'amazon.nova-canvas-v1:0', name: 'Nova Canvas', provider: 'Amazon' },
];

const IMAGE_SIZES = [
  { label: '512x512', width: 512, height: 512 },
  { label: '768x768', width: 768, height: 768 },
  { label: '1024x1024', width: 1024, height: 1024 },
  { label: '1280x720 (HD)', width: 1280, height: 720 },
  { label: '720x1280 (Vertical)', width: 720, height: 1280 },
];

export default function ImageGenerationView({ isExecuting, setIsExecuting }: ImageGenerationViewProps) {
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [selectedSize, setSelectedSize] = useState(IMAGE_SIZES[2]);
  const [numImages, setNumImages] = useState(1);
  const [cfgScale, setCfgScale] = useState(7.0);
  const [seed, setSeed] = useState<string>('');
  const [region, setRegion] = useState('us-east-1');
  const [results, setResults] = useState<ImageResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<ImageResult | null>(null);
  const abortControllerRef = { current: null as AbortController | null };

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

    setIsExecuting(true);
    setResults([]);

    const request: ImageGenerationRequest = {
      model_ids: selectedModels,
      prompt: prompt.trim(),
      negative_prompt: negativePrompt.trim(),
      region,
      width: selectedSize.width,
      height: selectedSize.height,
      num_images: numImages,
      cfg_scale: cfgScale,
      seed: seed ? parseInt(seed) : undefined,
    };

    try {
      abortControllerRef.current = new AbortController();
      // Use non-streaming endpoint to avoid JSON parse issues with large base64 data
      const response = await fetch('http://localhost:8000/api/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const data: ImageGenerationResponse = await response.json();
      setResults(data.results);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error:', error);
        alert('Error generating images: ' + error.message);
      }
    } finally {
      setIsExecuting(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    setIsExecuting(false);
  };

  return (
    <div className="flex h-full">
      {/* Settings Panel */}
      <div className="w-96 bg-white border-r border-gray-200 p-6 overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <span>🎨</span> Image Generation
          </h2>

          {/* Model Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Models</label>
            <div className="space-y-2">
              {IMAGE_MODELS.map(model => (
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
              placeholder="Describe the image you want to generate..."
              className="w-full p-3 border border-gray-300 rounded-lg text-sm resize-y min-h-24 focus:border-blue-500 focus:outline-none"
              required
            />
          </div>

          {/* Negative Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Negative Prompt (Optional)</label>
            <textarea
              value={negativePrompt}
              onChange={e => setNegativePrompt(e.target.value)}
              placeholder="What to avoid in the image..."
              className="w-full p-3 border border-gray-300 rounded-lg text-sm resize-y min-h-16 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Image Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Image Size</label>
            <select
              value={`${selectedSize.width}x${selectedSize.height}`}
              onChange={e => {
                const size = IMAGE_SIZES.find(s => `${s.width}x${s.height}` === e.target.value);
                if (size) setSelectedSize(size);
              }}
              className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
            >
              {IMAGE_SIZES.map(size => (
                <option key={size.label} value={`${size.width}x${size.height}`}>
                  {size.label}
                </option>
              ))}
            </select>
          </div>

          {/* Advanced Settings */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Images per Model</label>
              <input
                type="number"
                value={numImages}
                onChange={e => setNumImages(Math.max(1, Math.min(4, parseInt(e.target.value) || 1)))}
                min={1}
                max={4}
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">CFG Scale</label>
              <input
                type="number"
                value={cfgScale}
                onChange={e => setCfgScale(parseFloat(e.target.value) || 7.0)}
                min={1}
                max={20}
                step={0.5}
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
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
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-800 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-900 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isExecuting ? 'Generating...' : 'Generate Images'}
          </button>

          {isExecuting && (
            <button
              type="button"
              onClick={handleCancel}
              className="w-full py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition"
            >
              Cancel
            </button>
          )}
        </form>
      </div>

      {/* Results Panel */}
      <div className="flex-1 bg-gray-50 p-6 overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-800 mb-4">
          Results {results.length > 0 && `(${results.length})`}
        </h3>

        {results.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <div className="text-center">
              <p className="text-4xl mb-2">🎨</p>
              <p>Select models and enter a prompt to generate images</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {results.map((result, index) => (
              <ImageResultCard
                key={`${result.model_id}-${index}`}
                result={result}
                onClick={() => setSelectedResult(result)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedResult && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setSelectedResult(null)}
        >
          <div
            className="bg-white rounded-xl max-w-4xl max-h-[90vh] overflow-auto p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">{selectedResult.model_id.split('.').pop()}</h3>
              <button
                onClick={() => setSelectedResult(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>
            {selectedResult.success && selectedResult.images && (
              <div className="grid gap-4">
                {selectedResult.images.map((img, idx) => (
                  <img
                    key={idx}
                    src={`data:image/png;base64,${img}`}
                    alt={`Generated ${idx + 1}`}
                    className="max-w-full rounded-lg shadow-lg"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
