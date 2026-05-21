import React, { useState, useEffect, useRef, useCallback } from 'react';
import CanvasOutput from './CanvasOutput';
import { Play, Square, Trash2 } from 'lucide-react';
import MissionBrief from './MissionBrief';
import OutputViewer from './OutputViewer';
import PromptLibrary from './PromptLibrary';
import PromptHistory from './PromptHistory';
import { useLocalStorage } from '../../hooks/useLocalStorage';

const TEMPLATES = {
  coding: 'Write a complete HTML page with inline CSS and JavaScript:\n\n<!-- Your description here -->',
  explanation: 'Explain the following concept in simple terms:\n\nConcept: [ENTER CONCEPT HERE]',
  creative: 'Write a short story about:\n\nTopic: [ENTER STORY TOPIC HERE]',
};

export default function ChatPanel({
  prompt, onPromptChange, output, onRun, onCancel, isGenerating, stats,
  missionBriefItems = [], onMissionBriefChange, focusInputTrigger = 0,
}) {
  const [showCanvas, setShowCanvas] = useState(false);
  const textareaRef = useRef(null);
  useEffect(() => {
    if (focusInputTrigger === 0) return;
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [focusInputTrigger]);

  const [varDialog, setVarDialog] = useState(null); // { vars: string[], values: {[k]:string} }

  const handleRun = useCallback(() => {
    const found = [...new Set((prompt.match(/\[([A-Za-z][\w\s]*)\]/g) || []).map(m => m.slice(1, -1)))];
    if (found.length > 0) {
      setVarDialog({ vars: found, values: Object.fromEntries(found.map(v => [v, ''])) });
    } else {
      onRun();
    }
  }, [prompt, onRun]);

  const confirmVars = useCallback(() => {
    if (!varDialog) return;
    let substituted = prompt;
    Object.entries(varDialog.values).forEach(([k, v]) => {
      substituted = substituted.replaceAll(`[${k}]`, v || `[${k}]`);
    });
    onPromptChange(substituted);
    setVarDialog(null);
    setTimeout(() => onRun(), 0);
  }, [varDialog, prompt, onPromptChange, onRun]);
  const [history, setHistory] = useLocalStorage('tactical_history', []);

  useEffect(() => {
    if (!isGenerating && output && stats.model !== '-' && stats.time !== '-') {
      const last = history[history.length - 1];
      if (last && last.prompt === prompt && last.output === output) return;
      const entry = {
        id: Date.now(),
        prompt,
        output,
        model: stats.model,
        time: stats.time,
        tokens: stats.tokens,
        date: new Date().toLocaleString(),
      };
      setHistory(prev => [...prev.slice(-49), entry]);
    }
  }, [isGenerating]);

  const handleTemplate = (e) => {
    const tpl = TEMPLATES[e.target.value];
    if (tpl) onPromptChange(tpl);
    e.target.value = '';
  };

  const handleLoad = (item) => {
    onPromptChange(item.prompt);
  };

  return (
    <div className="tactical-panel rounded p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs tracking-widest text-muted-foreground uppercase flex-shrink-0">TEMPLATE</span>
        <select className="flex-1 min-w-0 px-2 py-1 rounded text-xs" onChange={handleTemplate} defaultValue="">
          <option value="" disabled>Select template...</option>
          <option value="coding">Coding (HTML)</option>
          <option value="explanation">Explanation</option>
          <option value="creative">Creative Writing</option>
        </select>
        <MissionBrief items={missionBriefItems} onChange={onMissionBriefChange} />
        <PromptHistory
          history={history}
          onLoad={handleLoad}
          onClear={() => setHistory([])}
        />
        <PromptLibrary onInsert={onPromptChange} />
      </div>

      <textarea
        ref={textareaRef}
        className="w-full rounded px-3 py-2 text-sm resize-none"
        rows={4}
        value={prompt}
        onChange={e => onPromptChange(e.target.value)}
        placeholder="Type your prompt..."
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isGenerating) handleRun();
        }}
      />

      <div className="flex gap-2">
        {!isGenerating ? (
          <button
            className="neon-btn px-4 py-2 rounded text-sm flex items-center gap-2 flex-1 justify-center"
            onClick={handleRun}
            data-desc="Run Generation"
          >
            <Play size={14} /> RUN <span className="text-xs opacity-50">(Ctrl+Enter)</span>
          </button>
        ) : (
          <button
            className="neon-btn neon-btn-danger px-4 py-2 rounded text-sm flex items-center gap-2 flex-1 justify-center"
            onClick={onCancel}
            data-desc="Cancel Generation"
          >
            <Square size={14} /> CANCEL
          </button>
        )}
        <button
          className="neon-btn px-3 py-2 rounded text-sm flex items-center gap-1"
          onClick={() => onPromptChange('')}
          title="Clear prompt"
          data-desc="Clear Prompt"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {varDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="tactical-panel rounded p-5 flex flex-col gap-4" style={{ width: 420, maxWidth: '95vw', border: '1px solid rgba(0,255,204,0.3)', boxShadow: '0 0 40px rgba(0,255,204,0.15)' }}>
            <div className="flex items-center justify-between">
              <span className="neon-text text-xs tracking-widest uppercase">⌥ VARIABLE SUBSTITUTION</span>
              <button className="neon-btn px-2 py-1 rounded text-xs" onClick={() => setVarDialog(null)}>✕</button>
            </div>
            <p className="text-xs opacity-50 tracking-wide">Fill in values for each placeholder found in your prompt.</p>
            <div className="flex flex-col gap-3">
              {varDialog.vars.map(v => (
                <div key={v} className="flex flex-col gap-1">
                  <label className="text-xs tracking-widest uppercase" style={{ color: 'rgba(0,255,204,0.6)' }}>[{v}]</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded text-sm"
                    placeholder={`Enter value for ${v}…`}
                    value={varDialog.values[v]}
                    autoFocus={varDialog.vars[0] === v}
                    onChange={e => setVarDialog(prev => ({ ...prev, values: { ...prev.values, [v]: e.target.value } }))}
                    onKeyDown={e => { if (e.key === 'Enter') confirmVars(); }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button className="neon-btn px-4 py-2 rounded text-xs tracking-widest" onClick={() => setVarDialog(null)}>CANCEL</button>
              <button className="neon-btn px-4 py-2 rounded text-xs tracking-widest" onClick={confirmVars}
                style={{ background: 'rgba(0,255,204,0.1)' }}>▶ RUN WITH VALUES</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs tracking-widest uppercase neon-text">OUTPUT</span>
          <button
            onClick={() => setShowCanvas(v => !v)}
            style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.6rem', letterSpacing: '2px', padding: '2px 9px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${showCanvas ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)'}`, color: showCanvas ? 'var(--neon-primary)' : 'rgba(0,255,204,0.4)', background: showCanvas ? 'rgba(0,255,204,0.06)' : 'transparent' }}
          >▦ CANVAS</button>
        </div>
        <OutputViewer output={output} />
        <CanvasOutput output={output} visible={showCanvas} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'MODEL', value: stats.model },
          { label: 'TIME', value: stats.time },
          { label: 'TOKENS', value: stats.tokens },
          { label: 'T/S', value: stats.throughput },
        ].map(({ label, value }) => (
          <div key={label} className="rounded p-2 text-center" style={{ background: 'rgba(0,20,20,0.6)', border: '1px solid rgba(0,255,204,0.1)' }}>
            <div className="text-xs opacity-50 tracking-widest">{label}</div>
            <div className="neon-text text-sm font-semibold truncate" title={value}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}