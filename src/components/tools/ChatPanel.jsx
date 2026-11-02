import React, { useState, useEffect, useRef, useCallback } from 'react';
import CanvasOutput from './CanvasOutput';
import { Play, Square, Trash2, Ban, Download } from 'lucide-react';
import MissionBrief from './MissionBrief';
import PromptLibrary from './PromptLibrary';
import PromptHistory from './PromptHistory';
import MessageStream from './MessageStream';
import ConversationList from './ConversationList';
import { useLocalStorage } from '../../hooks/useLocalStorage';

const TEMPLATES = {
  coding: 'Write a complete HTML page with inline CSS and JavaScript:\n\n<!-- Your description here -->',
  explanation: 'Explain the following concept in simple terms:\n\nConcept: [ENTER CONCEPT HERE]',
  creative: 'Write a short story about:\n\nTopic: [ENTER STORY TOPIC HERE]',
};

export default function ChatPanel({
  prompt, onPromptChange, output, onRun, onCancel, onCancelAll, isGenerating, stats,
  messages = [], streamingText = '', streamingConversationId = '',
  conversations = [], activeConversationId = '',
  onSelectConversation, onNewConversation, onDeleteConversation,
  missionBriefItems = [], onMissionBriefChange, focusInputTrigger = 0,
}) {
  const [showCanvas, setShowCanvas] = useState(false);
  const [varDialog, setVarDialog] = useState(null); // { vars: string[], values: {[k]:string} }
  const textareaRef = useRef(null);

  const [history, setHistory] = useLocalStorage('tactical_history', []);
  // Library items are edited in their own panel — re-read them whenever the picker opens
  const [library, setLibrary] = useState([]);
  const refreshLibrary = useCallback(() => {
    try { setLibrary(JSON.parse(localStorage.getItem('tactical_prompt_library')) || []); } catch { setLibrary([]); }
  }, []);
  useEffect(() => { refreshLibrary(); }, [refreshLibrary]);

  useEffect(() => {
    if (focusInputTrigger === 0) return;
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [focusInputTrigger]);

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

  // One picker for every ready-to-use prompt: built-ins, saved library items and recent runs
  const handleTemplate = (e) => {
    const value = e.target.value;
    e.target.value = '';
    if (!value) return;
    const sep = value.indexOf(':');
    const kind = value.slice(0, sep);
    const key = value.slice(sep + 1);
    let content = '';
    if (kind === 'builtin') content = TEMPLATES[key] || '';
    else if (kind === 'library') content = library.find(t => String(t.id) === key)?.content || '';
    else if (kind === 'history') content = history.find(h => String(h.id) === key)?.prompt || '';
    if (content) onPromptChange(content);
  };

  const downloadTranscript = useCallback(() => {
    if (messages.length === 0) return;
    const payload = {
      exported_at: new Date().toISOString(),
      conversation_id: activeConversationId || null,
      message_count: messages.length,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        datetime: new Date(m.ts || Date.now()).toISOString(),
        ...(m.meta ? { model: m.meta.model, tokens: m.meta.tokens } : {}),
        ...(m.stopped ? { stopped: true } : {}),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages, activeConversationId]);

  return (
    <div className="tactical-panel rounded p-4 flex flex-col gap-3">
      {/* Conversation history */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs tracking-widest uppercase flex-shrink-0" style={{ color: 'rgba(0,255,204,0.4)' }}>CONVERSATION</span>
        <ConversationList
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={onSelectConversation}
          onNew={onNewConversation}
          onDelete={onDeleteConversation}
        />
        <span className="text-xs tracking-widest flex-shrink-0" style={{ color: 'rgba(0,255,204,0.25)' }}>
          {messages.length} MSG
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs tracking-widest text-muted-foreground uppercase flex-shrink-0">TEMPLATE</span>
        <select
          className="flex-1 min-w-0 px-2 py-1 rounded text-xs"
          onChange={handleTemplate}
          onMouseDown={refreshLibrary}
          onFocus={refreshLibrary}
          defaultValue=""
          title="Load a built-in template, a library prompt, or a recent run"
        >
          <option value="" disabled>Select prompt...</option>
          <optgroup label="Built-in templates">
            <option value="builtin:coding">Coding (HTML)</option>
            <option value="builtin:explanation">Explanation</option>
            <option value="builtin:creative">Creative Writing</option>
          </optgroup>
          {library.length > 0 && (
            <optgroup label={`Library (${library.length})`}>
              {library.map(t => (
                <option key={t.id} value={`library:${t.id}`}>{t.name}{t.category ? ` · ${t.category}` : ''}</option>
              ))}
            </optgroup>
          )}
          {history.length > 0 && (
            <optgroup label={`Recent runs (${history.length})`}>
              {[...history].reverse().map(h => {
                const text = String(h.prompt || '').replace(/\s+/g, ' ').trim();
                return <option key={h.id} value={`history:${h.id}`}>{text.slice(0, 60)}{text.length > 60 ? '…' : ''}</option>;
              })}
            </optgroup>
          )}
        </select>
        <MissionBrief items={missionBriefItems} onChange={onMissionBriefChange} />
        <PromptHistory
          history={history}
          onLoad={(item) => onPromptChange(item.prompt)}
          onClear={() => setHistory([])}
        />
        <PromptLibrary onInsert={onPromptChange} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs tracking-widest uppercase neon-text">CONVERSATION TRANSCRIPT</span>
        <div className="flex items-center gap-1">
          <button
            onClick={downloadTranscript}
            disabled={messages.length === 0}
            title="Download this conversation as JSON"
            data-desc="Download Conversation JSON"
            style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.6rem', letterSpacing: '2px', padding: '2px 9px', borderRadius: 3, cursor: messages.length === 0 ? 'not-allowed' : 'pointer', opacity: messages.length === 0 ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: 4, border: '1px solid rgba(0,255,204,0.2)', color: 'rgba(0,255,204,0.7)', background: 'transparent' }}
          >
            <Download size={11} /> JSON
          </button>
          <button
            onClick={() => setShowCanvas(v => !v)}
            style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.6rem', letterSpacing: '2px', padding: '2px 9px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${showCanvas ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)'}`, color: showCanvas ? 'var(--neon-primary)' : 'rgba(0,255,204,0.4)', background: showCanvas ? 'rgba(0,255,204,0.06)' : 'transparent' }}
          >▦ CANVAS</button>
        </div>
      </div>

      <MessageStream
        messages={messages}
        streamingText={streamingText}
        isGenerating={isGenerating && (!streamingConversationId || streamingConversationId === activeConversationId)}
      />
      <CanvasOutput output={output} visible={showCanvas} />

      <textarea
        ref={textareaRef}
        className="w-full rounded px-3 py-2 text-sm resize-none"
        rows={3}
        value={prompt}
        onChange={e => onPromptChange(e.target.value)}
        placeholder="Type your message..."
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
            <Play size={14} /> SEND <span className="text-xs opacity-50">(Ctrl+Enter)</span>
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
          className="neon-btn neon-btn-danger px-3 py-2 rounded text-xs tracking-widest flex items-center gap-1"
          onClick={onCancelAll}
          title="Abort every in-flight AI request and stop speech"
          data-desc="Cancel All AI Activity"
        >
          <Ban size={14} /> CANCEL ALL
        </button>
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