import { useEffect, useRef } from 'react';

interface SensorChartProps {
  data: number[];
  label: string;
  unit: string;
  color: string;
  minVal: number;
  maxVal: number;
}

export default function SensorChart({ data, label, unit, color, minVal, maxVal }: SensorChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Clear background
    ctx.clearRect(0, 0, width, height);

    // Draw subtle grid lines
    ctx.strokeStyle = 'rgba(0, 201, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridRows = 4;
    for (let i = 1; i < gridRows; i++) {
      const y = (height / gridRows) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (data.length === 0) {
      // Draw placeholder text
      ctx.fillStyle = '#64748b'; // Slate 500
      ctx.font = '12px "Rajdhani"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Menunggu data...', width / 2, height / 2);
      return;
    }

    // Min & Max bounds for plotting
    const displayMin = Math.min(...data, minVal) - 2;
    const displayMax = Math.max(...data, maxVal) + 2;
    const range = displayMax - displayMin || 1;

    // Generate points
    const points = data.map((val, i) => {
      const x = data.length > 1 ? (width / (data.length - 1)) * i : width / 2;
      const y = height - ((val - displayMin) / range) * (height - 16) - 8;
      return { x, y, value: val };
    });

    // Draw area under the curve (gradient)
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, color.replace('1)', '0.35)'));
    gradient.addColorStop(1, color.replace('1)', '0.0)'));

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, height);
    points.forEach((pt, idx) => {
      if (idx === 0) {
        ctx.lineTo(pt.x, pt.y);
      } else {
        // Draw elegant curve to prevent robotic straight lines
        const prev = points[idx - 1];
        const cpX1 = prev.x + (pt.x - prev.x) / 2;
        const cpY1 = prev.y;
        const cpX2 = prev.x + (pt.x - prev.x) / 2;
        const cpY2 = pt.y;
        ctx.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, pt.x, pt.y);
      }
    });
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Draw main line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((pt, idx) => {
      if (idx === 0) {
        ctx.moveTo(pt.x, pt.y);
      } else {
        const prev = points[idx - 1];
        const cpX1 = prev.x + (pt.x - prev.x) / 2;
        const cpY1 = prev.y;
        const cpX2 = prev.x + (pt.x - prev.x) / 2;
        const cpY2 = pt.y;
        ctx.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, pt.x, pt.y);
      }
    });
    ctx.stroke();

    // Highlight the last/newest point with a pulsing neon ring
    const lastPt = points[points.length - 1];
    if (lastPt) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#020617'; // background color
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(lastPt.x, lastPt.y, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Show floating text values for last point
      ctx.fillStyle = '#f8fafc'; // Slate 50
      ctx.font = 'bold 11px "Orbitron"';
      ctx.textAlign = lastPt.x > width - 40 ? 'right' : 'left';
      ctx.fillText(
        `${lastPt.value.toFixed(1)}${unit}`,
        lastPt.x > width - 40 ? lastPt.x - 8 : lastPt.x + 8,
        lastPt.y < 20 ? lastPt.y + 12 : lastPt.y - 4
      );
    }
  }, [data, color, minVal, maxVal, unit]);

  return (
    <div className="w-full h-24 relative mt-2 rounded border border-cyan-500/10 bg-slate-950/40 p-1">
      <div className="absolute top-1 left-2 pointer-events-none">
        <span className="text-[10px] leading-none text-slate-500 uppercase tracking-widest block font-orbitron">
          Tren {label} ({unit})
        </span>
      </div>
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
