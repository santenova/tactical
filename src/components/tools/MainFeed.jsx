import React, { useRef, useEffect, useCallback, useState } from 'react';

const VIDEO_MODES = {
  std: { label: 'STD', desc: 'Standard Optical', filter: 'none' },
  night: { label: 'NV', desc: 'Night Vision Intensifier', filter: 'grayscale(100%) sepia(100%) hue-rotate(90deg) contrast(1.2) brightness(1.1)' },
  thermal: { label: 'THM', desc: 'Thermal Imaging', filter: 'invert(100%) grayscale(100%) contrast(200%)' },
};

export default function MainFeed({
  videoMode, onVideoModeChange,
  isPlaying, onPlayPause, onPrev, onNext,
  onMediaReady, onError,
  currentTrack,
  videoRef: externalVideoRef,
  playlist,
  currentTrackIndex,
}) {
  const internalVideoRef = useRef(null);
  const videoRef = externalVideoRef || internalVideoRef;
  const canvasRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

  const formatTime = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const initAudio = useCallback((videoEl) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const bass = audioCtx.createBiquadFilter();
      bass.type = 'lowshelf';
      bass.frequency.value = 200;
      const treble = audioCtx.createBiquadFilter();
      treble.type = 'highshelf';
      treble.frequency.value = 2000;
      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      let panner;
      if (audioCtx.createStereoPanner) {
        panner = audioCtx.createStereoPanner();
        panner.pan.value = 0;
      } else {
        panner = audioCtx.createGain();
      }
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      const source = audioCtx.createMediaElementSource(videoEl);
      source.connect(bass);
      bass.connect(treble);
      treble.connect(compressor);
      compressor.connect(panner);
      panner.connect(analyser);
      analyser.connect(audioCtx.destination);
      onMediaReady({ audioCtx, bass, treble, compressor, panner, analyser });
    } catch (e) {
      onError('AudioContext failed: ' + e.message);
    }
  }, [onMediaReady, onError]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      const w = canvas.width, h = canvas.height;
      const cx = w / 2, cy = h / 2, radius = 50;
      ctx2d.clearRect(0, 0, w, h);
      if (analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const bars = 60;
        const step = (Math.PI * 2) / bars;
        for (let i = 0; i < bars; i++) {
          const dataIndex = Math.floor((i / bars) * (dataArray.length / 1.5));
          const value = dataArray[dataIndex];
          const barLen = (value / 255) * 60;
          const angle = i * step;
          const hue = 180 + (value / 255) * 100;
          ctx2d.strokeStyle = `hsl(${hue}, 100%, 50%)`;
          ctx2d.lineWidth = 3;
          ctx2d.lineCap = 'round';
          ctx2d.beginPath();
          ctx2d.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
          ctx2d.lineTo(cx + Math.cos(angle) * (radius + barLen), cy + Math.sin(angle) * (radius + barLen));
          ctx2d.stroke();
        }
        let bassAvg = 0;
        for (let i = 0; i < 20; i++) bassAvg += dataArray[i];
        bassAvg /= 20;
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, radius - 5, 0, Math.PI * 2);
        ctx2d.fillStyle = `rgba(0,243,255,${bassAvg / 500})`;
        ctx2d.fill();
        ctx2d.strokeStyle = '#00f3ff';
        ctx2d.lineWidth = 2;
        ctx2d.stroke();
      } else {
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx2d.strokeStyle = 'rgba(0,243,255,0.15)';
        ctx2d.lineWidth = 1;
        ctx2d.stroke();
        ctx2d.fillStyle = 'rgba(0,243,255,0.03)';
        ctx2d.fill();
      }
    }
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playlist || playlist[currentTrackIndex] === undefined) return;
    v.src = playlist[currentTrackIndex].url;
    if (isPlaying) v.play().catch(() => {});
  }, [currentTrackIndex, playlist]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !v.src) return;
    if (isPlaying) { v.play().catch(() => {}); } else { v.pause(); }
  }, [isPlaying]);

  const handleLoadedData = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration || 0);
    setCurrentTime(0);
    v.volume = volume;
    v.playbackRate = playbackSpeed;
    if (!analyserRef.current) initAudio(v);
  };

  const handleSeek = (e) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const t = parseFloat(e.target.value);
    v.currentTime = t;
    setCurrentTime(t);
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) videoRef.current.volume = val;
  };

  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
  };

  return (
    <div className="tactical-panel rounded p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs tracking-widest uppercase m-0" style={{ color: 'white' }}>MAIN FEED</h3>
        <div className="flex gap-1">
          {Object.entries(VIDEO_MODES).map(([key, { label, desc }]) => (
            <button
              key={key}
              className={`neon-btn px-3 py-1 rounded text-xs ${videoMode === key ? 'bg-[var(--neon-primary)] text-black' : ''}`}
              onClick={() => onVideoModeChange(key)}
              data-desc={desc}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Seek Bar */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between" style={{ fontSize: '0.65rem', color: 'rgba(0,255,204,0.45)', letterSpacing: '1px' }}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
        <input
          type="range" min={0} max={duration || 1} step={0.1} value={currentTime}
          onChange={handleSeek}
          style={{ cursor: 'pointer' }}
          data-desc="Seek"
        />
      </div>

      <div style={{ border: '1px solid #333', boxShadow: '0 0 30px rgba(0,0,0,0.8)', background: 'black', position: 'relative' }}>
        <button
          onClick={() => {
            const el = videoRef.current;
            if (!el) return;
            if (document.fullscreenElement) document.exitFullscreen();
            else el.requestFullscreen?.();
          }}
          title="Toggle Fullscreen"
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(0,255,204,0.4)', color: 'var(--neon-primary)', borderRadius: 3, padding: '3px 8px', fontSize: '0.7rem', cursor: 'pointer', letterSpacing: '1px', fontFamily: 'Rajdhani, sans-serif' }}
          data-desc="Toggle Fullscreen Video"
        >
          ⛶ FULL
        </button>
        <video
          ref={videoRef}
          crossOrigin="anonymous"
          style={{ width: '100%', maxHeight: '45vh', display: 'block', background: 'black', transition: 'filter 0.5s ease', filter: VIDEO_MODES[videoMode]?.filter || 'none' }}
          onLoadedData={handleLoadedData}
          onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
          onError={() => onError('Media Decode Error: Format unsupported')}
          onEnded={() => onNext()}
        />
        {!currentTrack && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,243,255,0.2)', fontSize: '0.75rem', letterSpacing: '3px', textTransform: 'uppercase' }}>
            NO SIGNAL — IMPORT FILES
          </div>
        )}
      </div>

      <div style={{ width: '100%', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,243,255,0.15)', borderRadius: '4px', position: 'relative' }} data-desc="Real-time Spectral Analysis">
        <canvas ref={canvasRef} width={360} height={160} />
        {currentTrack && (
          <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center', fontSize: '0.65rem', color: 'rgba(0,243,255,0.4)', letterSpacing: '1px' }}>
            {currentTrack.name}
          </div>
        )}
      </div>

      <div className="flex justify-center gap-4">
        {[
          { id: 'prev', label: '⏮ PREV', desc: 'Previous Track', action: onPrev },
          { id: 'play', label: isPlaying ? '⏸ PAUSE' : '▶ PLAY', desc: 'Play / Pause', action: onPlayPause },
          { id: 'next', label: 'NEXT ⏭', desc: 'Next Track', action: onNext },
        ].map(({ id, label, desc, action }) => (
          <button key={id} className="neon-btn px-5 py-2 rounded text-sm font-bold tracking-widest" onClick={action} data-desc={desc}>
            {label}
          </button>
        ))}
      </div>

      {/* Volume + Speed */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex items-center gap-2 flex-1">
          <span style={{ fontSize: '0.65rem', color: 'rgba(0,255,204,0.5)', letterSpacing: '2px', whiteSpace: 'nowrap' }}>VOL</span>
          <input type="range" min={0} max={1} step={0.01} value={volume} onChange={handleVolumeChange} style={{ flex: 1, cursor: 'pointer' }} data-desc="Volume" />
          <span style={{ fontSize: '0.65rem', color: 'rgba(0,255,204,0.45)', width: 28, textAlign: 'right' }}>{Math.round(volume * 100)}%</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span style={{ fontSize: '0.65rem', color: 'rgba(0,255,204,0.5)', letterSpacing: '2px', marginRight: 4 }}>SPD</span>
          {SPEEDS.map(s => (
            <button key={s} onClick={() => handleSpeedChange(s)}
              style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '1px', cursor: 'pointer', padding: '2px 6px', borderRadius: 3, border: `1px solid ${playbackSpeed === s ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)'}`, color: playbackSpeed === s ? '#000' : 'rgba(0,255,204,0.6)', background: playbackSpeed === s ? 'var(--neon-primary)' : 'transparent', transition: 'all 0.15s' }}
              data-desc={`Playback speed ${s}x`}
            >{s}x</button>
          ))}
        </div>
      </div>
    </div>
  );
}