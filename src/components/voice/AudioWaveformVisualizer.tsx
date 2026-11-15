import React, { useEffect, useRef } from 'react';
import { voiceChanger } from '../../services/voiceChangerEngine';

interface Props {
  className?: string;
  mode?: 'frequency' | 'oscilloscope';
  accentColor?: string;
  height?: number;
}

export const AudioWaveformVisualizer: React.FC<Props> = ({
  className = '',
  mode = 'frequency',
  accentColor = '#1F8BFF',
  height = 48,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRunning = true;

    const render = () => {
      if (!isRunning) return;

      const analyser = voiceChanger.analyserNode;
      const width = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, width, h);

      if (!analyser) {
        ctx.strokeStyle = 'rgba(31, 139, 255, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(width, h / 2);
        ctx.stroke();
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      if (mode === 'frequency') {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        const barCount = 36;
        const barWidth = width / barCount - 2;
        const step = Math.floor(bufferLength / barCount);

        for (let i = 0; i < barCount; i++) {
          const value = dataArray[i * step] || 0;
          const percent = value / 255;
          const barHeight = Math.max(3, percent * h * 0.85);
          const x = i * (barWidth + 2);
          const y = (h - barHeight) / 2;

          ctx.fillStyle = accentColor;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 2);
          ctx.fill();
        }
      } else {
        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        ctx.lineWidth = 2;
        ctx.strokeStyle = accentColor;
        ctx.beginPath();

        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * h) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        ctx.lineTo(width, h / 2);
        ctx.stroke();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      isRunning = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [mode, accentColor]);

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-elevated dark:bg-canvas p-1 border border-outline dark:border-outline ${className}`}
    >
      <canvas
        ref={canvasRef}
        width={300}
        height={height}
        className="w-full block"
        style={{ height: `${height}px` }}
      />
    </div>
  );
};
