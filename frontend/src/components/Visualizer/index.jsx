import React, { useRef, useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setVolume, toggleVisualizer } from '../../store/slices/playerSlice';
import {
  CloseOutlined,
  SoundOutlined,
  SettingOutlined,
  ExpandOutlined,
} from '@ant-design/icons';
import { Slider, Tooltip, Select } from 'antd';
import './Visualizer.css';

const QUALITY_OPTIONS = [
  { value: 64, label: '低' },
  { value: 128, label: '标准' },
  { value: 256, label: '高' },
  { value: 512, label: '超高' },
  { value: 1024, label: '极致' },
];

const MODE_OPTIONS = [
  { value: 'bars', label: '柱状' },
  { value: 'circular', label: '圆形' },
  { value: 'wave', label: '波形' },
];

const Visualizer = ({ analyserRef, analyserVersion = 0, inline = false }) => {
  const dispatch = useDispatch();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animRef = useRef(null);
  const runningRef = useRef(false);
  const { volume } = useSelector((s) => s.player);

  const [fftSize, setFftSize] = useState(256);
  const [mode, setMode] = useState('bars');
  const [showSettings, setShowSettings] = useState(false);

  // Apply FFT size to analyser
  useEffect(() => {
    const a = analyserRef?.current;
    if (a && !inline) {
      try { a.fftSize = fftSize; } catch (e) { /* ignore */ }
    }
  }, [fftSize, analyserRef, inline]);

  useEffect(() => {
    const analyser = analyserRef?.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;

    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const freqData = new Uint8Array(bufferLength);
    const freqSmooth = new Float32Array(bufferLength); // smoothed frequency data
    const timeData = new Uint8Array(bufferLength);
    const wavePrev = new Float32Array(120); // inter-frame smoothing for waveform bars

    function resize() {
      const parent = containerRef.current || canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth * 2;
        canvas.height = parent.clientHeight * 2;
      }
    }
    resize();

    runningRef.current = true;
    let lastMode = mode;

    // ── Fixed visual element counts (independent of fftSize) ──
    const BAR_COUNT = 80;       // bars mode: always 80 bars

    // ─── Log-frequency mapping helper ───
    function logFreqIndex(i, total, bins) {
      const minFreq = 2;
      const maxFreq = 0.85 * bins;
      const ratio = i / Math.max(total - 1, 1);
      return Math.floor(minFreq * Math.pow(maxFreq / minFreq, ratio));
    }

    // Stronger smoothing for a calmer, less chaotic look
    const SMOOTH_FACTOR = 0.18;

    // ─── Circular Mode (soft pulsing orbit) ───
    const drawCircular = () => {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const baseRadius = Math.min(cx, cy) * 0.65;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // ── Ambient glow background ──
      const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 1.5);
      glowGrad.addColorStop(0, 'rgba(29, 185, 84, 0.04)');
      glowGrad.addColorStop(0.5, 'rgba(29, 185, 84, 0.02)');
      glowGrad.addColorStop(1, 'rgba(29, 185, 84, 0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // ── Outer ring (subtle) ──
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(29, 185, 84, 0.1)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // ── Soft frequency bands (6 bands) ──
      const BANDS = 6;
      const bandEnergies = [];
      for (let b = 0; b < BANDS; b++) {
        let sum = 0;
        const start = Math.floor(logFreqIndex(b, BANDS, bufferLength));
        const end = Math.floor(logFreqIndex(b + 1, BANDS, bufferLength));
        for (let j = start; j < end && j < bufferLength; j++) {
          sum += freqSmooth[j];
        }
        bandEnergies.push(sum / (end - start) / 255);
      }

      // Draw soft pulsing arcs for each band
      for (let b = 0; b < BANDS; b++) {
        const energy = bandEnergies[b];
        const arcRadius = baseRadius * (0.3 + (b / BANDS) * 0.7);
        const arcWidth = Math.max(3, energy * 25);
        
        // Soft arc
        const startAngle = -Math.PI * 0.8 + (b * Math.PI * 0.3);
        const endAngle = startAngle + Math.PI * 0.5 + energy * Math.PI * 0.3;
        
        ctx.beginPath();
        ctx.arc(cx, cy, arcRadius, startAngle, endAngle);
        ctx.strokeStyle = `rgba(29, 185, 84, ${0.15 + energy * 0.35})`;
        ctx.lineWidth = arcWidth;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // ── Inner pulsing circle (reacts to bass) ──
      const bassEnergy = bandEnergies[0] || 0;
      const innerRadius = 8 + bassEnergy * 35;
      
      ctx.save();
      ctx.shadowBlur = 15 + bassEnergy * 20;
      ctx.shadowColor = 'rgba(29, 185, 84, 0.4)';
      ctx.beginPath();
      ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
      
      const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerRadius);
      innerGrad.addColorStop(0, `rgba(29, 185, 84, ${0.6 + bassEnergy * 0.4})`);
      innerGrad.addColorStop(1, `rgba(29, 185, 84, ${0.2 + bassEnergy * 0.3})`);
      ctx.fillStyle = innerGrad;
      ctx.fill();
      ctx.restore();

      // ── Subtle particle ring (32 particles) ──
      const PARTICLE_COUNT = 32;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
        const bandIdx = Math.floor((i / PARTICLE_COUNT) * BANDS) % BANDS;
        const particleEnergy = bandEnergies[bandIdx] || 0;
        const particleRadius = baseRadius * (0.85 + particleEnergy * 0.15);
        
        const px = cx + Math.cos(angle) * particleRadius;
        const py = cy + Math.sin(angle) * particleRadius;
        const size = 1.5 + particleEnergy * 4;
        
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(29, 185, 84, ${0.3 + particleEnergy * 0.5})`;
        ctx.fill();
      }
    };

    // ─── Waveform Mode (vertical bar style, like reference image) ───
    const drawWave = () => {
      const w = canvas.width;
      const h = canvas.height;
      const midY = h / 2;

      // ── Dark background ──
      ctx.fillStyle = '#0e0c1a';
      ctx.fillRect(0, 0, w, h);

      // ── Smooth the time-domain data ──
      const SMOOTH_WINDOW = 4;
      const smoothed = new Float32Array(bufferLength);
      for (let i = 0; i < bufferLength; i++) {
        let sum = 0;
        let count = 0;
        for (let j = -SMOOTH_WINDOW; j <= SMOOTH_WINDOW; j++) {
          const idx = i + j;
          if (idx >= 0 && idx < bufferLength) {
            sum += Math.abs(timeData[idx] - 128) / 128;
            count++;
          }
        }
        smoothed[i] = sum / count;
      }

      // ── Inter-frame smoothing (key to calm animation) ──
      const WAVE_SMOOTH = 0.12; // lower = calmer (0.06 ~ 0.15 is good)
      const barCount = 60;
      const barGap = w / barCount;

      // Compute target values
      const targets = new Float32Array(barCount);
      for (let i = 0; i < barCount; i++) {
        const idx = Math.floor((i / barCount) * bufferLength);
        let val = smoothed[idx] || 0;
        val = Math.pow(val, 0.7);
        targets[i] = val;
      }

      // Smoothly interpolate from previous frame
      for (let i = 0; i < barCount; i++) {
        wavePrev[i] += (targets[i] - wavePrev[i]) * WAVE_SMOOTH;
      }

      // ── Draw vertical bars ──
      for (let i = 0; i < barCount; i++) {
        const val = wavePrev[i];
        const halfH = val * h * 0.6;
        if (halfH < 2) continue;

        const x = i * barGap + barGap / 2;
        const barW = Math.max(3, barGap * 0.58);
        const yTop = midY - halfH;
        const barH = halfH * 2;

        // Muted 2-tone: teal → soft purple
        const t = i / (barCount - 1);
        const r = Math.round(80 + t * 100);
        const g = Math.round(160 - t * 60);
        const b = Math.round(180 + t * 50);
        const alpha = 0.45 + val * 0.4;

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.roundRect(x - barW / 2, yTop, barW, barH, barW / 2);
        ctx.fill();
      }
    };

    // ─── Bars Mode ───
    const drawBars = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const numBars = BAR_COUNT;
      const barW = (canvas.width / numBars) * 0.78;
      const spacing = canvas.width / numBars;

      for (let i = 0; i < numBars; i++) {
        const idx = logFreqIndex(i, numBars - 1, bufferLength);
        const rawVal = freqSmooth[idx] / 255;
        // Compression for quieter parts to be visible, taper loud parts
        const val = Math.pow(rawVal, 0.65);
        const h = val * canvas.height * 0.85;

        const hue = 128 + (i / numBars) * 40;
        const light = 30 + val * 35;

        const grad = ctx.createLinearGradient(0, canvas.height - h, 0, canvas.height);
        grad.addColorStop(0, `hsl(${hue}, 80%, ${Math.min(light + 15, 60)}%)`);
        grad.addColorStop(0.6, `hsl(${hue}, 70%, ${light}%)`);
        grad.addColorStop(1, `hsl(${hue}, 50%, 16%)`);

        const x = i * spacing + (spacing - barW) / 2;
        if (val > 0.3) {
          ctx.save();
          ctx.shadowBlur = 6 + val * 8;
          ctx.shadowColor = `hsla(${hue}, 70%, 45%, ${val * 0.3})`;
          ctx.fillStyle = grad;
          ctx.fillRect(x, canvas.height - h, barW, h);
          ctx.restore();
        } else {
          ctx.fillStyle = grad;
          ctx.fillRect(x, canvas.height - h, barW, h);
        }
      }
    };

    // ─── Animation Loop ───
    const frame = () => {
      if (!runningRef.current) return;
      animRef.current = requestAnimationFrame(frame);
      analyser.getByteFrequencyData(freqData);
      analyser.getByteTimeDomainData(timeData);

      // Smooth frequency data (exponential moving average per bin)
      for (let i = 0; i < bufferLength; i++) {
        freqSmooth[i] += (freqData[i] - freqSmooth[i]) * SMOOTH_FACTOR;
      }

      // Detect mode change for resize
      if (mode !== lastMode) { resize(); lastMode = mode; }

      if (mode === 'circular') drawCircular();
      else if (mode === 'wave') drawWave();
      else drawBars();
    };

    frame();
    window.addEventListener('resize', resize);

    return () => {
      runningRef.current = false;
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [analyserRef, analyserVersion, mode]);

  const canvasEl = (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        borderRadius: inline ? 4 : 0,
      }}
    />
  );

  if (inline) return canvasEl;

  return (
    <div className="visualizer-popup">
      <div className="visualizer-popup-header">
        <h3><ExpandOutlined style={{ marginRight: 8 }} />音乐可视化</h3>
        <div className="visualizer-popup-controls">
          <Tooltip title="音量">
            <div className="visualizer-volume-wrap">
              <SoundOutlined className="visualizer-icon" />
              <Slider
                className="visualizer-volume-slider"
                value={volume}
                onChange={(v) => dispatch(setVolume(v))}
                min={0}
                max={100}
                style={{ width: 80 }}
              />
            </div>
          </Tooltip>
          <Tooltip title="设置">
            <button
              className={`vis-btn ${showSettings ? 'vis-btn-active' : ''}`}
              onClick={() => setShowSettings(!showSettings)}
            >
              <SettingOutlined />
            </button>
          </Tooltip>
          <Tooltip title="关闭">
            <button className="vis-btn vis-close-btn" onClick={() => dispatch(toggleVisualizer())}>
              <CloseOutlined />
            </button>
          </Tooltip>
        </div>
      </div>

      {showSettings && (
        <div className="visualizer-settings-bar">
          <div className="vis-setting-item">
            <span>清晰度: </span>
            <Select
              value={fftSize}
              onChange={setFftSize}
              options={QUALITY_OPTIONS}
              size="small"
              style={{ width: 100 }}
            />
          </div>
          <div className="vis-setting-item">
            <span>模式: </span>
            <Select
              value={mode}
              onChange={setMode}
              options={MODE_OPTIONS}
              size="small"
              style={{ width: 100 }}
            />
          </div>
        </div>
      )}

      <div className="visualizer-canvas-wrap" ref={containerRef}>
        {canvasEl}
      </div>
    </div>
  );
};

export default Visualizer;
