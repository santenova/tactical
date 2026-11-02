import React, { useState, useRef, useCallback, useEffect } from 'react';

function CropModal({ video, onApply, onCancel }) {
  const cropRef = useRef(null);
  const containerRef = useRef(null);

  React.useEffect(() => {
    const area = cropRef.current;
    if (!area) return;
    area.style.width = '80%';
    area.style.height = '80%';
    area.style.left = '10%';
    area.style.top = '10%';
  }, []);

  const startDrag = (e) => {
    if (e.target.dataset.handle) return;
    e.preventDefault();
    const area = cropRef.current;
    const container = containerRef.current;
    let x = e.clientX, y = e.clientY;
    const move = (ev) => {
      const dx = x - ev.clientX, dy = y - ev.clientY;
      x = ev.clientX; y = ev.clientY;
      area.style.left = Math.max(0, Math.min(container.clientWidth - area.offsetWidth, area.offsetLeft - dx)) + 'px';
      area.style.top = Math.max(0, Math.min(container.clientHeight - area.offsetHeight, area.offsetTop - dy)) + 'px';
    };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const startResize = (e, handle) => {
    e.stopPropagation(); e.preventDefault();
    const area = cropRef.current;
    const container = containerRef.current;
    const sx = e.clientX, sy = e.clientY;
    const sw = area.offsetWidth, sh = area.offsetHeight;
    const sl = area.offsetLeft, st = area.offsetTop;
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (handle === 'tl') {
        const nl = Math.max(0, Math.min(sl + sw - 50, sl + dx));
        const nt = Math.max(0, Math.min(st + sh - 50, st + dy));
        area.style.left = nl + 'px'; area.style.top = nt + 'px';
        area.style.width = (sw - (nl - sl)) + 'px'; area.style.height = (sh - (nt - st)) + 'px';
      } else if (handle === 'tr') {
        const nt = Math.max(0, Math.min(st + sh - 50, st + dy));
        area.style.top = nt + 'px';
        area.style.width = Math.max(50, Math.min(container.clientWidth - sl, sw + dx)) + 'px';
        area.style.height = (sh - (nt - st)) + 'px';
      } else if (handle === 'bl') {
        const nl = Math.max(0, Math.min(sl + sw - 50, sl + dx));
        area.style.left = nl + 'px';
        area.style.width = (sw - (nl - sl)) + 'px';
        area.style.height = Math.max(50, Math.min(container.clientHeight - st, sh + dy)) + 'px';
      } else if (handle === 'br') {
        area.style.width = Math.max(50, Math.min(container.clientWidth - sl, sw + dx)) + 'px';
        area.style.height = Math.max(50, Math.min(container.clientHeight - st, sh + dy)) + 'px';
      }
    };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const apply = () => {
    const area = cropRef.current;
    const container = containerRef.current;
    if (!area || !container) return;
    onApply({ x: area.offsetLeft / container.clientWidth, y: area.offsetTop / container.clientHeight, width: area.offsetWidth / container.clientWidth, height: area.offsetHeight / container.clientHeight });
  };

  const handleStyle = { position: 'absolute', width: 12, height: 12, background: 'var(--neon-primary)', cursor: 'nwse-resize' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div className="tactical-panel rounded p-4 flex flex-col gap-3" style={{ width: 560 }}>
        <div className="flex justify-between items-center">
          <span className="neon-text text-xs tracking-widest uppercase">CROP EDITOR</span>
          <button className="neon-btn px-3 py-1 rounded text-xs" onClick={onCancel}>✕ CLOSE</button>
        </div>
        <div ref={containerRef} className="relative overflow-hidden rounded" style={{ background: '#000', height: 320 }}>
          <video src={video?.url} className="w-full h-full object-contain" muted />
          <div ref={cropRef} onMouseDown={startDrag} style={{ position: 'absolute', border: '2px solid var(--neon-primary)', boxSizing: 'border-box', cursor: 'move', boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' }}>
            {['tl','tr','bl','br'].map(h => (
              <div key={h} data-handle={h} onMouseDown={e => startResize(e, h)}
                style={{ ...handleStyle, top: h.startsWith('t') ? -6 : 'auto', bottom: h.startsWith('b') ? -6 : 'auto', left: h.endsWith('l') ? -6 : 'auto', right: h.endsWith('r') ? -6 : 'auto', cursor: (h === 'tl' || h === 'br') ? 'nwse-resize' : 'nesw-resize' }}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button className="neon-btn px-4 py-2 rounded text-xs tracking-widest" onClick={onCancel}>CANCEL</button>
          <button className="neon-btn px-4 py-2 rounded text-xs tracking-widest" onClick={apply}>APPLY CROP</button>
        </div>
      </div>
    </div>
  );
}

function TimelineClip({ clip, onSelect, selected }) {
  const width = Math.max(60, (clip.video.trimEnd - clip.video.trimStart) * 40);
  return (
    <div
      onClick={() => onSelect(clip.video)}
      style={{ display: 'inline-flex', alignItems: 'center', width, minWidth: 60, height: 40, marginRight: 4, background: selected ? 'rgba(0,255,204,0.2)' : 'rgba(0,255,204,0.08)', border: `1px solid ${selected ? 'var(--neon-primary)' : 'rgba(0,255,204,0.3)'}`, borderRadius: 3, cursor: 'pointer', padding: '0 6px', fontSize: '0.65rem', color: 'var(--neon-primary)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flexShrink: 0 }}
      title={clip.video.name}
    >
      {clip.video.name.substring(0, 14)}
    </div>
  );
}

export default function ScreenRecorder({ shortcutTrigger = 0 }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recTime, setRecTime] = useState('00:00');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [status, setStatus] = useState('STANDBY — SELECT RECORD TO BEGIN');
  const [library, setLibrary] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [showCrop, setShowCrop] = useState(false);
  const [trimStart, setTrimStart] = useState('');
  const [trimEnd, setTrimEnd] = useState('');
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);
  const previewRef = useRef(null);
  const isRecordingRef = useRef(false);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => {
    if (shortcutTrigger === 0) return;
    if (isRecordingRef.current) stopRecording();
    else startRecording();
  }, [shortcutTrigger]);

  const startRecording = async () => {
    let displayStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false });
    } catch (err) {
      setStatus(`ERROR: ${err.message || 'Screen capture denied'}`);
      return;
    }
    if (audioEnabled) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStream.getAudioTracks().forEach(t => displayStream.addTrack(t));
      } catch {}
    }
    try {
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm;codecs=vp8';
      const mr = new MediaRecorder(displayStream, { mimeType });
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = handleStop;
      mr.start(100);
      mediaRecorderRef.current = mr;
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const e = Date.now() - startTimeRef.current;
        const m = Math.floor(e / 60000), s = Math.floor((e % 60000) / 1000);
        setRecTime(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
      }, 1000);
      setIsRecording(true);
      setStatus('● RECORDING IN PROGRESS');
      displayStream.getVideoTracks()[0].addEventListener('ended', stopRecording);
    } catch (err) {
      displayStream.getTracks().forEach(t => t.stop());
      setStatus(`ERROR: ${err.message}`);
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') { mr.stop(); mr.stream.getTracks().forEach(t => t.stop()); }
    clearInterval(timerRef.current);
    setIsRecording(false);
    setStatus('PROCESSING...');
  };

  const handleStop = () => {
    const blob = new Blob(chunksRef.current, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const dur = (Date.now() - startTimeRef.current) / 1000;
    const vid = { id: Date.now(), url, blob, duration: dur, name: `REC ${new Date().toLocaleTimeString()}`, trimStart: 0, trimEnd: dur, crop: null };
    setLibrary(prev => [...prev, vid]);
    setTimeline(prev => [...prev, { video: vid }]);
    selectVideo(vid);
    setStatus(`RECORDING SAVED — ${dur.toFixed(1)}s`);
    const a = document.createElement('a');
    a.href = url; a.download = `tactical-rec-${Date.now()}.webm`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const selectVideo = (vid) => {
    setCurrentVideo(vid);
    setTrimStart(vid.trimStart.toFixed(1));
    setTrimEnd(vid.trimEnd.toFixed(1));
    if (previewRef.current) { previewRef.current.src = vid.url; previewRef.current.load(); }
  };

  const insertVideo = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'video/*';
    inp.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const tmpVid = document.createElement('video');
      tmpVid.src = url;
      tmpVid.onloadedmetadata = () => {
        const dur = tmpVid.duration;
        const vid = { id: Date.now(), url, blob: file, duration: dur, name: file.name, trimStart: 0, trimEnd: dur, crop: null };
        setLibrary(prev => [...prev, vid]);
        setTimeline(prev => [...prev, { video: vid }]);
        selectVideo(vid);
        setStatus(`INSERTED: ${file.name} (${dur.toFixed(1)}s)`);
      };
    };
    inp.click();
  };

  const applyTrim = () => {
    if (!currentVideo) return;
    const s = Math.max(0, parseFloat(trimStart) || 0);
    const e = Math.min(currentVideo.duration, parseFloat(trimEnd) || currentVideo.duration);
    const updated = { ...currentVideo, trimStart: s, trimEnd: e };
    setCurrentVideo(updated);
    setLibrary(prev => prev.map(v => v.id === updated.id ? updated : v));
    setTimeline(prev => prev.map(c => c.video.id === updated.id ? { video: updated } : c));
    setStatus(`TRIM APPLIED: ${s.toFixed(1)}s → ${e.toFixed(1)}s`);
  };

  const applyCrop = (cropData) => {
    if (!currentVideo) return;
    const updated = { ...currentVideo, crop: cropData };
    setCurrentVideo(updated);
    setLibrary(prev => prev.map(v => v.id === updated.id ? updated : v));
    setTimeline(prev => prev.map(c => c.video.id === updated.id ? { video: updated } : c));
    setShowCrop(false);
    setStatus('CROP SETTINGS SAVED');
  };

  const exportVideo = () => {
    if (timeline.length === 0) { setStatus('NO CLIPS TO EXPORT'); return; }
    const target = currentVideo || timeline[0].video;
    const a = document.createElement('a');
    a.href = target.url;
    a.download = `tactical-export-${Date.now()}.webm`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setStatus('EXPORT COMPLETE');
  };

  const hasVideo = !!currentVideo;

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="tactical-panel rounded px-4 py-2 flex items-center justify-between">
        <span className="text-xs tracking-widest" style={{ color: isRecording ? '#ff3333' : 'var(--neon-primary)' }}>
          {isRecording && <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-2 pulse-neon" />}
          {status}
        </span>
        <span className="neon-text text-sm font-bold tabular-nums">{recTime}</span>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 items-start">
        <div className="w-full lg:w-64 flex-shrink-0 flex flex-col gap-3">
          <div className="tactical-panel rounded p-4 flex flex-col gap-3">
            <h3 className="text-xs tracking-widest uppercase" style={{ color: 'var(--neon-secondary)' }}>CAPTURE</h3>
            <label className="flex items-center gap-2 text-xs tracking-wider cursor-pointer" style={{ color: 'rgba(0,255,204,0.7)' }}>
              <div onClick={() => setAudioEnabled(v => !v)} style={{ width: 32, height: 18, borderRadius: 9, position: 'relative', cursor: 'pointer', background: audioEnabled ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)', border: '1px solid rgba(0,255,204,0.4)', transition: 'background 0.2s' }}>
                <div style={{ position: 'absolute', top: 2, left: audioEnabled ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: audioEnabled ? '#000' : 'var(--neon-primary)', transition: 'left 0.2s' }} />
              </div>
              AUDIO {audioEnabled ? 'ON' : 'OFF'}
            </label>
            <button className={`neon-btn py-2 rounded text-xs tracking-widest ${isRecording ? 'neon-btn-danger pulse-neon' : ''}`} onClick={isRecording ? stopRecording : startRecording} data-desc={isRecording ? 'Stop Recording' : 'Start Screen Recording'}>
              {isRecording ? '■ STOP RECORDING' : '● START RECORDING'}
            </button>
          </div>

          <div className="tactical-panel rounded p-4 flex flex-col gap-3">
            <h3 className="text-xs tracking-widest uppercase" style={{ color: 'var(--neon-secondary)' }}>EDIT</h3>
            <div className="flex flex-col gap-1">
              <span className="text-xs tracking-wider opacity-60">TRIM (seconds)</span>
              <div className="flex gap-2">
                <input type="text" value={trimStart} onChange={e => setTrimStart(e.target.value)} placeholder="Start" className="flex-1 px-2 py-1 rounded text-xs" disabled={!hasVideo} />
                <input type="text" value={trimEnd} onChange={e => setTrimEnd(e.target.value)} placeholder="End" className="flex-1 px-2 py-1 rounded text-xs" disabled={!hasVideo} />
              </div>
              <button className="neon-btn py-1 rounded text-xs tracking-widest" onClick={applyTrim} disabled={!hasVideo}>APPLY TRIM</button>
            </div>
            <button className="neon-btn py-1 rounded text-xs tracking-widest" onClick={() => setShowCrop(true)} disabled={!hasVideo}>✂ CROP EDITOR</button>
            <button className="neon-btn py-1 rounded text-xs tracking-widest" onClick={insertVideo}>+ INSERT VIDEO</button>
            <button className="neon-btn py-1 rounded text-xs tracking-widest" onClick={exportVideo} disabled={timeline.length === 0}>↓ EXPORT VIDEO</button>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-3">
          <div className="tactical-panel rounded p-3 flex flex-col gap-2">
            <h3 className="text-xs tracking-widest uppercase" style={{ color: 'var(--neon-secondary)' }}>PREVIEW</h3>
            <div className="relative rounded overflow-hidden" style={{ background: '#000', minHeight: 240 }}>
              {currentVideo ? (
                <video ref={previewRef} controls className="w-full" style={{ maxHeight: 360 }} />
              ) : (
                <div className="flex items-center justify-center" style={{ height: 240, color: 'rgba(0,255,204,0.2)', fontSize: '0.75rem', letterSpacing: '0.2em' }}>NO SIGNAL</div>
              )}
            </div>
            {currentVideo && (
              <div className="text-xs" style={{ color: 'rgba(0,255,204,0.5)' }}>
                {currentVideo.name} — {currentVideo.duration.toFixed(1)}s
                {currentVideo.crop && <span className="ml-2 neon-text">[CROP ACTIVE]</span>}
              </div>
            )}
          </div>

          <div className="tactical-panel rounded p-3 flex flex-col gap-2">
            <h3 className="text-xs tracking-widest uppercase" style={{ color: 'var(--neon-secondary)' }}>TIMELINE</h3>
            <div className="flex gap-1 overflow-x-auto pb-1" style={{ minHeight: 48 }}>
              {timeline.length === 0 ? (
                <span style={{ color: 'rgba(0,255,204,0.2)', fontSize: '0.7rem', letterSpacing: '0.15em', alignSelf: 'center' }}>EMPTY — RECORD OR INSERT CLIPS</span>
              ) : (
                timeline.map((clip) => (
                  <TimelineClip key={clip.video.id} clip={clip} selected={currentVideo?.id === clip.video.id} onSelect={selectVideo} />
                ))
              )}
            </div>
          </div>
        </div>

        <div className="w-full lg:w-56 flex-shrink-0">
          <div className="tactical-panel rounded p-3 flex flex-col gap-2 h-full">
            <h3 className="text-xs tracking-widest uppercase" style={{ color: 'var(--neon-secondary)' }}>LIBRARY</h3>
            {library.length === 0 ? (
              <div className="text-xs opacity-30 tracking-wider">NO RECORDINGS</div>
            ) : (
              <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 480 }}>
                {library.map(vid => (
                  <div key={vid.id} onClick={() => selectVideo(vid)} style={{ border: `1px solid ${currentVideo?.id === vid.id ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)'}`, borderRadius: 4, padding: '6px 8px', cursor: 'pointer', background: currentVideo?.id === vid.id ? 'rgba(0,255,204,0.08)' : 'transparent' }}>
                    <video src={vid.url} muted className="w-full rounded" style={{ maxHeight: 60, objectFit: 'cover' }} />
                    <div className="text-xs mt-1 truncate neon-text" title={vid.name}>{vid.name}</div>
                    <div className="text-xs opacity-50">{vid.duration.toFixed(1)}s</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showCrop && <CropModal video={currentVideo} onApply={applyCrop} onCancel={() => setShowCrop(false)} />}
    </div>
  );
}