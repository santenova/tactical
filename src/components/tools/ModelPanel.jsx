import React, { useState } from 'react';
import { RefreshCw, Download, Info } from 'lucide-react';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import EndpointManager from './EndpointManager';

const INDICATOR_COLORS = {
  idle: 'rgba(0,255,204,0.3)',
  success: '#00ffcc',
  error: '#ff3333',
  warning: '#ffcc00',
};

const DEFAULT_ENDPOINTS = ['http://localhost:11434', 'http://127.0.0.1:11434'];

export default function ModelPanel({
  endpoint, onEndpointChange,
  models, selectedModel, onModelChange,
  onRefresh, onPullModel, onFetchInfo,
  statusIndicator,
}) {
  const [endpoints, setEndpoints] = useLocalStorage('tactical_endpoints', DEFAULT_ENDPOINTS);
  const [pullName, setPullName] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [modelInfo, setModelInfo] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  const handlePull = () => {
    if (!pullName.trim()) return;
    onPullModel(pullName.trim());
    setPullName('');
  };

  const handleInfo = async () => {
    setLoadingInfo(true);
    setShowInfo(true);
    setModelInfo(null);
    try {
      const data = await onFetchInfo(selectedModel);
      setModelInfo(JSON.stringify(data, null, 2));
    } catch (e) {
      setModelInfo(`Error: ${e.message}`);
    } finally {
      setLoadingInfo(false);
    }
  };

  return (
    <div className="tactical-panel rounded p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs tracking-widest text-muted-foreground uppercase flex-shrink-0">ENDPOINT</span>
        <select
          className="flex-1 px-2 py-1 rounded text-xs"
          value={endpoint}
          onChange={e => onEndpointChange(e.target.value)}
        >
          {endpoints.map(ep => <option key={ep} value={ep}>{ep}</option>)}
        </select>
        <EndpointManager
          endpoints={endpoints}
          onEndpointsChange={setEndpoints}
          selected={endpoint}
          onSelect={onEndpointChange}
        />
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{
            background: INDICATOR_COLORS[statusIndicator],
            boxShadow: `0 0 6px ${INDICATOR_COLORS[statusIndicator]}`,
            transition: 'all 0.3s',
          }}
        />
      </div>

      <div className="flex items-center gap-2">
        <select
          className="flex-1 px-2 py-1 rounded text-xs"
          value={selectedModel}
          onChange={e => onModelChange(e.target.value)}
        >
          {models.length === 0
            ? <option value="">No models loaded</option>
            : models.map(m => <option key={m} value={m}>{m}</option>)
          }
        </select>
        <button
          className="neon-btn p-2 rounded"
          onClick={onRefresh}
          title="Refresh models"
          data-desc="Refresh Model List"
        >
          <RefreshCw size={14} />
        </button>
        <button
          className="neon-btn p-2 rounded"
          onClick={handleInfo}
          disabled={!selectedModel}
          title="Model info"
          data-desc="View Model Information"
        >
          <Info size={14} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          className="flex-1 px-2 py-1 rounded text-xs"
          placeholder="Model name to pull (e.g. llama3)"
          value={pullName}
          onChange={e => setPullName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handlePull()}
          data-desc="Enter model name to download from Ollama"
        />
        <button
          className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1"
          onClick={handlePull}
          data-desc="Pull/Download Model"
        >
          <Download size={12} /> PULL
        </button>
      </div>

      {showInfo && (
        <div className="rounded p-3" style={{ background: 'rgba(0,5,5,0.95)', border: '1px solid rgba(0,255,204,0.2)' }}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs tracking-widest neon-text uppercase">MODEL INFO: {selectedModel}</span>
            <button className="neon-btn px-2 py-0.5 rounded text-xs" onClick={() => setShowInfo(false)}>✕ CLOSE</button>
          </div>
          <pre className="text-xs overflow-auto max-h-48" style={{ color: 'rgba(0,255,204,0.7)', fontFamily: 'monospace' }}>
            {loadingInfo ? 'Loading...' : modelInfo}
          </pre>
        </div>
      )}
    </div>
  );
}