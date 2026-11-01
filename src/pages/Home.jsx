import React, { useState, useEffect, useRef, useCallback } from 'react';
import OrbCanvas from '../components/tools/OrbCanvas';
import ChatPanel from '../components/tools/ChatPanel';
import AudioConfigPanel from '../components/tools/AudioConfigPanel';
import ModelPanel from '../components/tools/ModelPanel';
import IntroOverlay from '../components/tools/IntroOverlay';
import HoverCloud from '../components/tools/HoverCloud';
import MediaRepository from '../components/tools/MediaRepository';
import MainFeed from '../components/tools/MainFeed';
import ScreenRecorder from '../components/tools/ScreenRecorder';
import ThemeSwitcher, { applyTheme } from '../components/tools/ThemeSwitcher';
import PersonaManager, { PERSONAS } from '../components/tools/PersonaManager';
import OrbFullscreen from '../components/tools/OrbFullscreen';
import PersonaBackground from '../components/tools/PersonaBackground';
import TranscriptArchive from '../components/tools/TranscriptArchive';
import DBPanel from '../components/tools/DBPanel';
import CorePanel from '../components/tools/CorePanel';
import BrowserlessPanel from '../components/tools/BrowserlessPanel';
import VoiceConfigPanel, { loadVoiceConfig } from '../components/tools/VoiceConfigPanel';
import MemoryInspector, { extractKeywords, scoreMemory } from '../components/tools/MemoryInspector';
import Navbar from '../components/tools/Navbar';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { client } from '@/apis/client';
import { OLLAMA_PROXY_URL, resolveLocalEndpoints } from '@/lib/localProxies';
import { loadEsEndpoints } from '@/lib/esEndpoints';
import { fetchOrbComment } from '@/lib/orbComment';
import { createAIRequest, abortAllAI } from '@/lib/aiAbort';

export const STATE = { idle: 0, listening: 1, thinking: 2, speaking: 3, crisis: 4 };

// Keeps the boot overlay from replaying on in-app navigation (resets on a full reload)
let sessionBooted = false;

const CONFIG = {
  endpoint: OLLAMA_PROXY_URL,
  defaultModel: 'llama3:latest',
  silenceThreshold: 800,
  crisisKeywords: ['kill myself', 'suicide', 'end my life', 'die', 'hurt myself', 'overdose'],
  crisisResponse: 'I am detecting signals of severe distress. I care about your safety. Please call emergency services or a crisis hotline immediately.',
  systemPrompt: 'You are Tactical, an AI counselor. Be wise, empathetic, and very concise (1-2 sentences max).',
};

// Case-insensitive word-boundary match against the crisis keyword list
export function matchesCrisis(text) {
  return CONFIG.crisisKeywords.some(word =>
    new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)
  );
}

export const DEFAULT_ORB_SETTINGS = {
  listeningEnabled: true,
  recognitionLang: 'en-US',
  speechRate: 1.0,
  speechPitch: 1.0,
  filamentCount: 180,
  animSpeed: 0.05,
  speakingVolatility: 3,
  listeningVolatility: 1.5,
  thinkingVolatility: 0.5,
  crisisVolatility: 8,
  speakingSurge: 10,
  listeningSurge: 5,
  thinkingSurge: -5,
};

export default function Home() {
  const [initialized, setInitialized] = useState(sessionBooted);
  const [orbMode, setOrbMode] = useState(STATE.idle);
  const [statusText, setStatusText] = useState('SYSTEM OFFLINE');
  const [transcript, setTranscript] = useState('');
  const [hoverDesc, setHoverDesc] = useState('');
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  const [endpoint, setEndpoint] = useState(CONFIG.endpoint);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(CONFIG.defaultModel);
  const [prompt, setPrompt] = useLocalStorage('tactical_app_prompt', 'Explain quantum computing in simple terms.');
  const [output, setOutput] = useLocalStorage('tactical_app_output', '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [stats, setStats] = useState({ model: '-', time: '-', tokens: '-', throughput: '-' });
  const [statusIndicator, setStatusIndicator] = useState('idle');

  const [audioNodes, setAudioNodes] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useLocalStorage('tactical_app_voice_enabled', false);
  const [recShortcut, setRecShortcut] = useState(0);
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [shortcutToast, setShortcutToast] = useState({ visible: false, label: '' });
  const [missionBriefItems, setMissionBriefItems] = useLocalStorage('tactical_app_mission_brief', []);
  const [orbSettings, setOrbSettings] = useLocalStorage('tactical_app_orb_settings', DEFAULT_ORB_SETTINGS);

  const updateOrbSetting = useCallback((key, val) => {
    setOrbSettings(prev => ({ ...DEFAULT_ORB_SETTINGS, ...prev, [key]: val }));
  }, [setOrbSettings]);

  const [orbFullscreen, setOrbFullscreen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [transcriptLog, setTranscriptLog] = useLocalStorage('tactical_transcript_log', []);
  const [longTermMemory, setLongTermMemory] = useLocalStorage('tactical_ltm', []);
  const [sheetId, setSheetId] = useLocalStorage('tactical_sheet_id', '');

  // Apply saved voice config to speech params
  useEffect(() => {
    const cfg = loadVoiceConfig();
    updateOrbSetting('speechPitch', cfg.pitch);
    updateOrbSetting('speechRate', cfg.rate);
  }, []);

  const handleVoiceConfigChange = useCallback((cfg) => {
    updateOrbSetting('speechPitch', cfg.pitch);
    updateOrbSetting('speechRate', cfg.rate);
  }, [updateOrbSetting]);
  const [activeTheme, setActiveTheme] = useState(() => localStorage.getItem('tactical_app_theme') || 'tactical');
  const [activePersonaId, setActivePersonaId] = useLocalStorage('tactical_app_persona', 'tactical');
  const systemPromptRef = useRef(PERSONAS[localStorage.getItem('tactical_app_persona') || 'tactical']?.systemPrompt || CONFIG.systemPrompt);

  const handlePersonaChange = useCallback((id, custom) => {
    const persona = custom ? { ...PERSONAS.tactical, ...custom, id: 'custom' } : PERSONAS[id];
    if (!persona) return;
    setActivePersonaId(id);
    systemPromptRef.current = persona.systemPrompt;
    // Apply orb settings
    const merged = { ...DEFAULT_ORB_SETTINGS, ...persona.orbSettings };
    setOrbSettings(merged);
    // Apply theme
    if (persona.themeKey && !custom) { setActiveTheme(persona.themeKey); applyTheme(persona.themeKey); localStorage.setItem('tactical_app_theme', persona.themeKey); }
    // Speak greeting
    setTimeout(() => speakTextRef.current?.(persona.greeting || `${persona.name} persona activated.`), 300);
  }, [setOrbSettings, setActivePersonaId]);

  const handleThemeChange = useCallback((key) => {
    setActiveTheme(key);
    applyTheme(key);
    localStorage.setItem('tactical_app_theme', key);
  }, []);

  useEffect(() => { applyTheme(activeTheme); }, []);

  const showToast = useCallback((label) => {
    setShortcutToast({ visible: true, label });
    setTimeout(() => setShortcutToast({ visible: false, label: '' }), 1500);
  }, []);

  useEffect(() => {
    if (!initialized) return;
    const handleKey = (e) => {
      const tag = e.target.tagName.toLowerCase();
      const inInput = tag === 'input' || tag === 'textarea' || tag === 'select';
      if ((e.key === 'f' || e.key === 'F') && !inInput) {
        setOrbFullscreen(v => !v);
        showToast('⬡ FULLSCREEN ORB');
      } else if ((e.key === ' ' || e.code === 'Space') && !inInput) {
        if (activeTabRef.current !== 'recorder') return;
        e.preventDefault();
        setRecShortcut(v => v + 1);
        showToast('● RECORDING TOGGLE');
      } else if (e.key === 'i' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setActiveTab('ai');
        setFocusTrigger(v => v + 1);
        showToast('⌨ CHAT FOCUS');
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [initialized, showToast]);

  const [activeTab, setActiveTab] = useLocalStorage('tactical_app_tab', 'ai');
  const activeTabRef = useRef('ai');
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  const [playlist, setPlaylist] = useState([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoMode, setVideoMode] = useState('std');
  const [mediaError, setMediaError] = useState('');
  const [mediaAudioNodes, setMediaAudioNodes] = useState(null);

  const videoRef = useRef(null);
  const memoryRef = useRef([]);
  const abortRef = useRef(null);
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const speakTextRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const currentTranscriptRef = useRef('');
  const orbModeRef = useRef(STATE.idle);

  // Refs for values used inside async callbacks
  const voiceEnabledRef = useRef(voiceEnabled);
  const missionBriefRef = useRef(missionBriefItems);
  const listeningEnabledRef = useRef((orbSettings ?? DEFAULT_ORB_SETTINGS).listeningEnabled);
  const speechRateRef = useRef((orbSettings ?? DEFAULT_ORB_SETTINGS).speechRate);
  const speechPitchRef = useRef((orbSettings ?? DEFAULT_ORB_SETTINGS).speechPitch);
  const recognitionLangRef = useRef((orbSettings ?? DEFAULT_ORB_SETTINGS).recognitionLang);

  useEffect(() => { orbModeRef.current = orbMode; }, [orbMode]);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);
  useEffect(() => { missionBriefRef.current = missionBriefItems; }, [missionBriefItems]);

  const safeSettings = orbSettings ?? DEFAULT_ORB_SETTINGS;
  useEffect(() => { listeningEnabledRef.current = safeSettings.listeningEnabled; }, [safeSettings.listeningEnabled]);
  useEffect(() => { speechRateRef.current = safeSettings.speechRate; }, [safeSettings.speechRate]);
  useEffect(() => { speechPitchRef.current = safeSettings.speechPitch; }, [safeSettings.speechPitch]);
  useEffect(() => { recognitionLangRef.current = safeSettings.recognitionLang; }, [safeSettings.recognitionLang]);

  // Toggle listening on/off
  useEffect(() => {
    if (!initialized) return;
    if (safeSettings.listeningEnabled) {
      try { recognitionRef.current?.start(); } catch {}
    } else {
      recognitionRef.current?.stop();
      setOrbMode(STATE.idle);
      updateStatus('STANDBY');
    }
  }, [safeSettings.listeningEnabled, initialized]);

  // Re-setup recognition when language changes
  useEffect(() => {
    if (!initialized) return;
    recognitionRef.current?.stop();
    setupSpeechRecognition();
    if (listeningEnabledRef.current) {
      setTimeout(() => { try { recognitionRef.current?.start(); } catch {} }, 200);
    }
  }, [safeSettings.recognitionLang, initialized]);

  // ─── SSE STREAM ─────────────────────────────────────────────────────────────
  async function processSSEStream(response, onDelta, onDone) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let totalTokens = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const t = line.trim();
          if (!t || !t.startsWith('data: ')) continue;
          const payload = t.slice(6);
          if (payload === '[DONE]') { onDone(totalTokens); return; }
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) { totalTokens++; onDelta(delta); }
            if (json.usage?.completion_tokens) totalTokens = json.usage.completion_tokens;
          } catch {}
        }
      }
      onDone(totalTokens);
    } finally { reader.releaseLock(); }
  }

  // ─── GOOGLE SHEETS LOGGING ──────────────────────────────────────────────────
  const sheetIdRef = useRef(sheetId);
  useEffect(() => { sheetIdRef.current = sheetId; }, [sheetId]);

  const saveResponseToSheet = useCallback(async (promptText, responseText, model, tokens, timeTaken) => {
    const sid = sheetIdRef.current;
    if (!sid) return;
    try {
      await client.functions.invoke('logToSheet', {
        spreadsheetId: sid,
        prompt: promptText,
        response: responseText,
        model,
        datetime: new Date().toISOString(),
        tokens,
        timeTaken,
      });
    } catch {}
  }, []);

  // ─── OLLAMA ─────────────────────────────────────────────────────────────────
  const saveResponseToES = useCallback(async (promptText, responseText, model) => {
    try {
      const esEp = loadEsEndpoints()[0];
      if (!esEp?.url) return;
      await fetch(`${esEp.url}/ai_responses/_doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          response: responseText,
          model,
          datetime: new Date().toISOString(),
        }),
      });
    } catch {}
  }, []);

  const fetchModels = useCallback(async (ep = endpoint) => {
    setStatusIndicator('warning');
    try {
      const res = await fetch(`${ep}/v1/models`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const names = (data.data || []).map(m => m.id);
      setModels(names);
      if (names.length > 0) {
        const saved = localStorage.getItem('tactical_app_model');
        setSelectedModel(names.includes(saved) ? saved : names[0]);
      }
      setStatusIndicator('success');
    } catch {
      setStatusIndicator('error');
      setModels([]);
    }
  }, [endpoint]);

  // The orb remarks on a finished text-chat answer in one short spoken line
  const speakOrbComment = useCallback(async (promptText, resultText) => {
    const aiReq = createAIRequest();
    try {
      const comment = await fetchOrbComment({
        endpoint,
        model: selectedModel || CONFIG.defaultModel,
        prompt: promptText,
        result: resultText,
        persona: systemPromptRef.current,
        signal: aiReq.signal,
      });
      speakTextRef.current?.(comment || 'Response ready.');
    } catch {
      // A cancelled comment stays silent
      if (!aiReq.signal.aborted) speakTextRef.current?.('Response ready.');
    } finally {
      aiReq.release();
    }
  }, [endpoint, selectedModel]);

  const runGeneration = useCallback(async (messageOverride) => {
    // Typed in the chat field or spoken through the orb — the chat field text is what runs
    const userMessage = (typeof messageOverride === 'string' ? messageOverride : prompt).trim();
    if (!userMessage || !selectedModel) return null;
    if (abortRef.current) abortRef.current.abort();
    const aiReq = createAIRequest();
    abortRef.current = aiReq.controller;
    // The listening orb takes the message: it hears it, stays silent on it
    clearTimeout(silenceTimerRef.current);
    try { recognitionRef.current?.stop(); } catch {}
    setTranscript(`"${userMessage}"`);
    setOrbMode(STATE.thinking);
    setStatusText('PROCESSING...');
    setIsGenerating(true);
    setOutput('');
    setStatusIndicator('warning');
    setStats({ model: '-', time: '-', tokens: '-', throughput: '-' });
    const startTime = Date.now();
    let text = '';
    try {
      const pinnedFacts = (missionBriefRef.current || []).filter(i => i.pinned);
      const missionContext = pinnedFacts.length > 0
        ? `\n\n=== MISSION BRIEF (prioritize these facts in every response) ===\n${pinnedFacts.map(f => `[${f.category}] ${f.title}: ${f.content}`).join('\n')}\n===`
        : '';
      const systemContent = systemPromptRef.current + missionContext;
      const res = await fetch(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, messages: [{ role: 'system', content: systemContent }, { role: 'user', content: userMessage }], stream: true }),
        signal: aiReq.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await processSSEStream(res, (delta) => { text += delta; setOutput(text); }, (totalTokens) => {
        const dur = (Date.now() - startTime) / 1000;
        const toks = totalTokens || text.split(/\s+/).length;
        setStats({ model: selectedModel, time: `${dur.toFixed(2)}s`, tokens: toks, throughput: Math.round(toks / dur) });
        setStatusIndicator('success');
        saveResponseToES(userMessage, text, selectedModel);
        saveResponseToSheet(userMessage, text, selectedModel, toks, `${dur.toFixed(2)}s`);
        speakOrbComment(userMessage, text);
      });
      return text;
    } catch (e) {
      setStatusIndicator(e.name === 'AbortError' ? 'warning' : 'error');
      // No comment when the run was cancelled — just hand the orb back to listening
      setOrbMode(listeningEnabledRef.current ? STATE.listening : STATE.idle);
      setStatusText(listeningEnabledRef.current ? 'LISTENING...' : 'STANDBY');
      if (listeningEnabledRef.current) { try { recognitionRef.current?.start(); } catch {} }
      return null;
    } finally {
      aiReq.release();
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [endpoint, selectedModel, prompt, speakOrbComment]);

  const cancelGeneration = () => { if (abortRef.current) abortRef.current.abort(); };

  // Aborts every in-flight OpenAI-conform request, stops speech and hands the orb back
  const cancelAll = useCallback(() => {
    abortAllAI();
    clearTimeout(silenceTimerRef.current);
    synthRef.current?.cancel();
    try { recognitionRef.current?.stop(); } catch {}
    setIsGenerating(false);
    document.documentElement.style.setProperty('--iris-primary', '#00ffcc');
    setOrbMode(listeningEnabledRef.current ? STATE.listening : STATE.idle);
    setStatusText(listeningEnabledRef.current ? 'LISTENING...' : 'STANDBY');
    setStatusIndicator('idle');
    if (listeningEnabledRef.current) {
      setTimeout(() => { try { recognitionRef.current?.start(); } catch {} }, 100);
    }
  }, []);

  const pullModel = useCallback(async (name) => {
    if (!name.trim()) return;
    setOutput('Pulling model...\n');
    setStatusIndicator('warning');
    const aiReq = createAIRequest();
    try {
      const res = await fetch(`${endpoint}/api/pull`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }), signal: aiReq.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const d = JSON.parse(line.trim());
            if (d.status) setOutput(prev => prev + d.status + '\n');
            if (d.status === 'success') { setStatusIndicator('success'); fetchModels(); }
          } catch {}
        }
      }
    } catch (e) {
      const aborted = e.name === 'AbortError';
      setOutput(prev => prev + (aborted ? 'Pull cancelled.\n' : `Error: ${e.message}\n`));
      setStatusIndicator(aborted ? 'warning' : 'error');
    } finally {
      aiReq.release();
    }
  }, [endpoint, fetchModels]);

  const fetchModelInfo = useCallback(async (modelName) => {
    if (!modelName) return null;
    const res = await fetch(`${endpoint}/v1/models/${encodeURIComponent(modelName)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, [endpoint]);

  // ─── VOICE / BRAIN ──────────────────────────────────────────────────────────
  const updateStatus = (text) => setStatusText(text);

  const speakText = useCallback((text) => {
    const synth = synthRef.current;
    if (!synth) return;
    if (!voiceEnabledRef.current) {
      setTranscript(text);
      setOrbMode(STATE.listening);
      updateStatus('LISTENING...');
      if (listeningEnabledRef.current) {
        setTimeout(() => { try { recognitionRef.current?.start(); } catch {} }, 100);
      }
      return;
    }
    synth.cancel();
    setOrbMode(STATE.speaking);
    updateStatus('RESPONDING...');
    const utter = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const voice =
      voices.find(v => v.name.includes('Google UK English Female')) ||
      voices.find(v => v.lang === 'en-GB' && v.name.includes('Female')) ||
      voices.find(v => v.lang === 'en-GB');
    if (voice) utter.voice = voice;
    utter.pitch = speechPitchRef.current;
    utter.rate = speechRateRef.current;
    utter.onend = () => {
      setOrbMode(STATE.listening);
      updateStatus('LISTENING...');
      document.documentElement.style.setProperty('--iris-primary', '#00ffcc');
      currentTranscriptRef.current = '';
      if (listeningEnabledRef.current) {
        setTimeout(() => { try { recognitionRef.current?.start(); } catch {} }, 100);
      } else {
        setOrbMode(STATE.idle);
        updateStatus('STANDBY');
      }
    };
    synth.speak(utter);
    setTranscript(text);
  }, []);
  speakTextRef.current = speakText;

  const queryBrain = useCallback(async (userInput) => {
    if (matchesCrisis(userInput)) {
      setOrbMode(STATE.crisis);
      document.documentElement.style.setProperty('--iris-primary', '#ff0000');
      return CONFIG.crisisResponse;
    }
    setOrbMode(STATE.thinking);
    updateStatus('PROCESSING...');

    // Long-term memory retrieval
    const inputKws = extractKeywords(userInput);
    const relevant = longTermMemory
      .filter(m => scoreMemory(m, inputKws) >= 2)
      .sort((a, b) => scoreMemory(b, inputKws) - scoreMemory(a, inputKws))
      .slice(0, 3);
    const memContext = relevant.length > 0
      ? `\n\n=== LONG-TERM MEMORY (relevant past context) ===\n${relevant.map(m => `[${new Date(m.timestamp).toLocaleDateString()}] User said: "${m.user}" → You replied: "${m.ai.slice(0, 120)}…"`).join('\n')}\n===`
      : '';

    const pinnedFacts = (missionBriefRef.current || []).filter(i => i.pinned);
    const missionContext = pinnedFacts.length > 0
      ? `\n\n=== MISSION BRIEF (prioritize these facts in every response) ===\n${pinnedFacts.map(f => `[${f.category}] ${f.title}: ${f.content}`).join('\n')}\n===`
      : '';
    const enrichedSystemPrompt = systemPromptRef.current + missionContext + memContext;

    const messages = [
      { role: 'system', content: enrichedSystemPrompt },
      ...memoryRef.current.slice(-3).flatMap(m => ([{ role: 'user', content: m.user }, { role: 'assistant', content: m.ai }])),
      { role: 'user', content: userInput },
    ];
    const aiReq = createAIRequest();
    try {
      const res = await fetch(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel || CONFIG.defaultModel, messages, stream: false }),
        signal: aiReq.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || '';
      memoryRef.current.push({ user: userInput, ai: reply });
      saveResponseToES(userInput, reply, selectedModel || CONFIG.defaultModel);
      saveResponseToSheet(userInput, reply, selectedModel || CONFIG.defaultModel);
      // Save to long-term memory
      const keywords = [...new Set([...extractKeywords(userInput), ...extractKeywords(reply)])];
      setLongTermMemory(prev => [...prev.slice(-199), { id: Date.now(), user: userInput, ai: reply, keywords, timestamp: Date.now(), tags: [], pinned: false }]);
      if (memoryRef.current.length > 5) memoryRef.current.shift();
      return reply;
    } catch {
      return 'I am sensing a disturbance in the network. Please try again.';
    } finally {
      aiReq.release();
    }
  }, [endpoint, selectedModel]);

  // Spoken input lands in the chat field, runs through the chat pipeline,
  // and the orb only adds a short comment once the answer is finished.
  const processUserSpeech = useCallback(async (text) => {
    const spoken = (text || '').trim();
    if (!spoken) {
      setOrbMode(STATE.listening);
      try { recognitionRef.current?.start(); } catch {}
      return;
    }
    setPrompt(spoken);
    if (matchesCrisis(spoken)) {
      setOrbMode(STATE.crisis);
      document.documentElement.style.setProperty('--iris-primary', '#ff0000');
      speakText(CONFIG.crisisResponse);
      return;
    }
    const answer = await runGeneration(spoken);
    if (answer) {
      setTranscriptLog(prev => [...prev, { id: Date.now(), user: spoken, ai: answer, timestamp: Date.now() }]);
    }
  }, [runGeneration, setPrompt, setTranscriptLog, speakText]);

  const setupSpeechRecognition = useCallback(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    const rec = new Recognition();
    rec.continuous = true;
    rec.lang = recognitionLangRef.current;
    rec.interimResults = true;
    rec.onstart = () => {
      if (orbModeRef.current !== STATE.speaking) {
        setOrbMode(STATE.listening);
        updateStatus('LISTENING...');
      }
    };
    rec.onresult = (event) => {
      clearTimeout(silenceTimerRef.current);
      const lastResult = event.results[event.results.length - 1];
      currentTranscriptRef.current = lastResult[0].transcript;
      setTranscript(`"${currentTranscriptRef.current}"`);
      // The orb reads what it hears straight into the chat input field
      setPrompt(currentTranscriptRef.current);
      silenceTimerRef.current = setTimeout(() => {
        rec.stop();
        processUserSpeech(currentTranscriptRef.current);
      }, CONFIG.silenceThreshold);
    };
    rec.onend = () => {
      if (orbModeRef.current === STATE.listening && listeningEnabledRef.current) {
        try { rec.start(); } catch {}
      }
    };
    recognitionRef.current = rec;
  }, [processUserSpeech, setPrompt]);

  // ─── MEDIA ───────────────────────────────────────────────────────────────────
  const handleImportFiles = useCallback(async (e) => {
    const all = Array.from(e.target.files);
    const valid = all.filter(f => f.type.startsWith('audio/') || f.type.startsWith('video/'));
    const skipped = all.length - valid.length;
    if (skipped > 0) { setMediaError(`${skipped} file(s) skipped — unsupported format`); setTimeout(() => setMediaError(''), 4000); }
    const toProcess = valid;
    if (toProcess.length === 0) return;

    const extractMeta = (file, url) => new Promise(resolve => {
      const el = document.createElement(file.type.startsWith('audio/') ? 'audio' : 'video');
      el.src = url;
      el.onloadedmetadata = () => resolve({ duration: el.duration || 0, width: el.videoWidth || 0, height: el.videoHeight || 0 });
      el.onerror = () => resolve({ duration: 0, width: 0, height: 0 });
    });

    const newTracks = await Promise.all(toProcess.map(async f => {
      const url = URL.createObjectURL(f);
      const meta = await extractMeta(f, url);
      const bitrate = meta.duration > 0 ? Math.round((f.size * 8) / meta.duration / 1000) : 0;
      return { name: f.name, url, type: f.type, size: f.size, duration: meta.duration, width: meta.width, height: meta.height, bitrate, importedAt: Date.now() };
    }));

    setPlaylist(prev => [...prev, ...newTracks]);
    speakText(`${newTracks.length} file${newTracks.length > 1 ? 's' : ''} imported to repository.`);
  }, [playlist, speakText]);

  const playTrack = useCallback((index) => {
    if (!playlist[index]) return;
    setCurrentTrackIndex(index);
    setIsPlaying(true);
  }, [playlist]);

  const handlePlayPause = useCallback(() => {
    if (!playlist[currentTrackIndex]) return;
    setIsPlaying(v => !v);
  }, [playlist, currentTrackIndex]);

  const handlePrev = useCallback(() => { if (currentTrackIndex > 0) playTrack(currentTrackIndex - 1); }, [currentTrackIndex, playTrack]);
  const handleNext = useCallback(() => { if (currentTrackIndex < playlist.length - 1) playTrack(currentTrackIndex + 1); }, [currentTrackIndex, playlist, playTrack]);

  const handleReEngage = useCallback(async (entry, mode) => {
    const prompt = mode === 'summarize'
      ? `Please summarize in 2 sentences: "${entry.ai}"`
      : `Please elaborate further on this topic: "${entry.user}" — your previous response was: "${entry.ai}"."`;
    const answer = await queryBrain(prompt);
    setTranscriptLog(prev => [...prev, { id: Date.now(), user: `[${mode.toUpperCase()}] ${entry.user}`, ai: answer, timestamp: Date.now() }]);
    speakTextRef.current?.(answer);
  }, [queryBrain]);

  const handleVideoModeChange = useCallback((mode) => {
    setVideoMode(mode);
    const labels = { std: 'Standard Optics', night: 'Night Vision Enabled', thermal: 'Thermal Imaging Enabled' };
    speakText(labels[mode] || mode);
  }, [speakText]);

  // ─── INIT ────────────────────────────────────────────────────────────────────
  const boot = useCallback(async () => {
    sessionBooted = true;
    setInitialized(true);
    // Diagnostics already resolved the endpoints — reuse that result instead of probing again
    const targets = await resolveLocalEndpoints();
    setEndpoint(targets.ollama);
    fetchModels(targets.ollama);
    synthRef.current?.getVoices();
    setupSpeechRecognition();
    setOrbMode(STATE.speaking);
    setTimeout(() => speakText('Tactical system online. I am listening.'), 1000);
  }, [fetchModels, setupSpeechRecognition, speakText]);

  // ─── HOVER ───────────────────────────────────────────────────────────────────
  const lastHoveredRef = useRef(null);
  const handleMouseMove = useCallback((e) => {
    const target = e.target.closest('[data-desc]');
    if (target) {
      setHoverDesc(target.getAttribute('data-desc'));
      setHoverPos({ x: e.clientX + 20, y: e.clientY + 20 });
      lastHoveredRef.current = target;
    } else {
      setHoverDesc('');
      lastHoveredRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (selectedModel) localStorage.setItem('tactical_app_model', selectedModel);
  }, [selectedModel]);

  const mergedOrbSettings = { ...DEFAULT_ORB_SETTINGS, ...safeSettings };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden" onMouseMove={handleMouseMove}>
      <div className="scanlines" />
      <PersonaBackground personaId={activePersonaId} />
      <div id="canvas-container" className="fixed inset-0 z-0 pointer-events-none" />

      {shortcutToast.visible && (
        <div
          className="fixed z-[9999] top-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded text-xs tracking-widest uppercase font-bold pointer-events-none"
          style={{ background: 'rgba(0,10,10,0.95)', border: '1px solid var(--neon-primary)', color: 'var(--neon-primary)', boxShadow: '0 0 20px rgba(0,255,204,0.4), 0 0 40px rgba(0,255,204,0.15)', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '3px', animation: 'pulse-neon 1s ease-in-out' }}
        >
          ⌨ {shortcutToast.label}
        </div>
      )}

      {!initialized && <IntroOverlay onBoot={boot} />}

      {orbFullscreen && (
        <OrbFullscreen
          mode={orbMode}
          statusText={statusText}
          transcript={transcript}
          orbSettings={mergedOrbSettings}
          onClose={() => setOrbFullscreen(false)}
          onOrbClick={() => {
            if (orbMode === STATE.speaking) {
              synthRef.current?.cancel();
              setOrbMode(STATE.listening);
              updateStatus('INTERRUPTED');
              if (listeningEnabledRef.current) {
                try { recognitionRef.current?.start(); } catch {}
              }
            }
          }}
        />
      )}

      {initialized && (
        <Navbar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          activeTheme={activeTheme}
          onThemeChange={handleThemeChange}
          onArchiveToggle={() => setArchiveOpen(v => !v)}
          archiveCount={transcriptLog.length}
          onVoiceOpen={() => setVoiceOpen(v => !v)}
          onMemoryOpen={() => setMemoryOpen(v => !v)}
        />
      )}

      <TranscriptArchive
        log={transcriptLog}
        isOpen={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onClear={() => setTranscriptLog([])}
        onReEngage={handleReEngage}
      />

      <VoiceConfigPanel
        isOpen={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onConfigChange={handleVoiceConfigChange}
      />

      <MemoryInspector
        memories={longTermMemory}
        onUpdate={setLongTermMemory}
        isOpen={memoryOpen}
        onClose={() => setMemoryOpen(false)}
      />

      {initialized && (
        <div className="relative z-10 flex flex-col min-h-screen p-3 gap-3">

          {activeTab === 'ai' && (
            <div className="flex flex-col lg:flex-row gap-3 items-start">
              <div className="w-full lg:w-64 xl:w-72 flex-shrink-0">
                <OrbCanvas
                  mode={orbMode}
                  statusText={statusText}
                  transcript={transcript}
                  orbSettings={mergedOrbSettings}
                  onFullscreen={() => setOrbFullscreen(true)}
                  onOrbClick={() => {
                    if (orbMode === STATE.speaking) {
                      synthRef.current?.cancel();
                      setOrbMode(STATE.listening);
                      updateStatus('INTERRUPTED');
                      if (listeningEnabledRef.current) {
                        try { recognitionRef.current?.start(); } catch {}
                      }
                    }
                  }}
                />
              </div>

              <div className="flex-1 flex flex-col gap-3">
                <div className="flex justify-end">
                <PersonaManager activePersonaId={activePersonaId} onPersonaChange={handlePersonaChange} />
              </div>
              <ModelPanel
                  endpoint={endpoint}
                  onEndpointChange={(v) => { setEndpoint(v); fetchModels(v); }}
                  models={models}
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  onRefresh={() => fetchModels()}
                  onPullModel={pullModel}
                  onFetchInfo={fetchModelInfo}
                  statusIndicator={statusIndicator}
                />
                <div className="tactical-panel rounded px-3 py-2 flex items-center gap-2">
                  <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '2px', whiteSpace: 'nowrap' }}>📊 SHEET ID</span>
                  <input
                    type="text"
                    value={sheetId}
                    onChange={e => setSheetId(e.target.value)}
                    placeholder="Paste Google Spreadsheet ID to log responses..."
                    style={{ flex: 1, padding: '4px 8px', borderRadius: 3, fontSize: '0.72rem' }}
                  />
                  {sheetId && <span style={{ fontSize: '0.58rem', color: '#00cc66', letterSpacing: '1px', whiteSpace: 'nowrap' }}>● ACTIVE</span>}
                </div>
                <ChatPanel
                  prompt={prompt}
                  onPromptChange={setPrompt}
                  output={output}
                  onRun={runGeneration}
                  onCancel={cancelGeneration}
                  onCancelAll={cancelAll}
                  isGenerating={isGenerating}
                  stats={stats}
                  missionBriefItems={missionBriefItems}
                  onMissionBriefChange={setMissionBriefItems}
                  focusInputTrigger={focusTrigger}
                />
              </div>

              <div className="w-full lg:w-64 xl:w-72 flex-shrink-0">
                <AudioConfigPanel
                  audioNodes={audioNodes}
                  onAudioInit={setAudioNodes}
                  voiceEnabled={voiceEnabled}
                  onVoiceToggle={() => setVoiceEnabled(v => !v)}
                  orbMode={orbMode}
                  orbSettings={mergedOrbSettings}
                  onOrbSettingChange={updateOrbSetting}
                />
              </div>
            </div>
          )}

          {activeTab === 'recorder' && <ScreenRecorder shortcutTrigger={recShortcut} />}

          {activeTab === 'db' && (
            <div className="max-w-6xl mx-auto w-full"><DBPanel /></div>
          )}

          {activeTab === 'browser' && (
            <div className="max-w-4xl mx-auto w-full"><BrowserlessPanel /></div>
          )}

          {activeTab === 'core' && (
            <div className="max-w-6xl mx-auto w-full"><CorePanel aiEndpoint={endpoint} aiModel={selectedModel} /></div>
          )}

          {activeTab === 'media' && (
            <div className="flex flex-col lg:flex-row gap-3 items-start">
              <div className="w-full lg:w-64 xl:w-72 flex-shrink-0" style={{ minHeight: '500px' }}>
                <MediaRepository
                  playlist={playlist}
                  currentIndex={currentTrackIndex}
                  onImport={handleImportFiles}
                  onSelect={playTrack}
                  errorMsg={mediaError}
                />
              </div>
              <div className="flex-1">
                <MainFeed
                  videoMode={videoMode}
                  onVideoModeChange={handleVideoModeChange}
                  isPlaying={isPlaying}
                  onPlayPause={handlePlayPause}
                  onPrev={handlePrev}
                  onNext={handleNext}
                  onMediaReady={(nodes) => setMediaAudioNodes(nodes)}
                  onError={(msg) => { setMediaError(msg); setTimeout(() => setMediaError(''), 5000); }}
                  currentTrack={playlist[currentTrackIndex] || null}
                  videoRef={videoRef}
                  currentTrackIndex={currentTrackIndex}
                  playlist={playlist}
                />
              </div>
              <div className="w-full lg:w-56 xl:w-64 flex-shrink-0">
                <AudioConfigPanel
                  audioNodes={mediaAudioNodes}
                  onAudioInit={setMediaAudioNodes}
                  voiceEnabled={voiceEnabled}
                  onVoiceToggle={() => setVoiceEnabled(v => !v)}
                  orbMode={orbMode}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <HoverCloud desc={hoverDesc} pos={hoverPos} />
    </div>
  );
}
