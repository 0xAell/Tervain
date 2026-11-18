import { S } from '../../core/content/strings';
import { coastX } from '../../core/world/coast';
import { ARRIVAL_ROUTE, ARRIVAL_WRECK, SPAWN } from '../../core/world/layout';

/** A north-up chart of the actual landing. Canvas 2D stays available while the world takes ownership of WebGL. */
export function mountStrandChart(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return () => {};
  let lastWidth = 0, lastHeight = 0;
  const draw = () => {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 1920 / Math.max(width, height));
    if (canvas.width === Math.round(width * ratio) && canvas.height === Math.round(height * ratio) && width === lastWidth && height === lastHeight) return;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    lastWidth = width; lastHeight = height;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const narrow = width < 700, centreX = width * (narrow ? .42 : .66), centreY = height * (narrow ? .26 : .44);
    const scale = Math.min(5, width / (narrow ? 107 : 215), height / (narrow ? 155 : 123));
    const x = (metres: number) => centreX + (metres - SPAWN.x) * scale;
    const y = (metres: number) => centreY + (metres - 9) * scale;
    const zMin = 9 - centreY / scale, zMax = 10 + (height - centreY) / scale;
    const shore: [number, number][] = [];
    for (let z = zMin; z <= zMax + 1; z += 1) shore.push([x(coastX(z)), y(z)]);
    const edge = (offset: number) => {
      ctx.beginPath();
      shore.forEach(([px, py], i) => {
        if (i === 0) ctx.moveTo(px + offset * scale, py);
        else ctx.lineTo(px + offset * scale, py);
      });
    };
    const sea = ctx.createLinearGradient(0, 0, width, height);
    sea.addColorStop(0, '#11252b'); sea.addColorStop(1, '#344749');
    ctx.fillStyle = sea; ctx.fillRect(0, 0, width, height);
    for (const distance of [-3, -8, -16, -28, -44, -66]) {
      edge(distance); ctx.strokeStyle = distance > -20 ? '#77928b5c' : '#78948e30'; ctx.stroke();
    }
    edge(0); ctx.lineTo(width, height + 5); ctx.lineTo(width, -5); ctx.closePath();
    const land = ctx.createLinearGradient(centreX - 80, 0, width, height);
    land.addColorStop(0, '#545641'); land.addColorStop(.42, '#3a4435'); land.addColorStop(1, '#202e29');
    ctx.fillStyle = land; ctx.fill();
    edge(0); ctx.strokeStyle = '#d5c494'; ctx.lineWidth = 1.4; ctx.stroke();
    for (const dist of [2, 6, 12]) { edge(dist); ctx.lineWidth = .7; ctx.strokeStyle = '#d0c09242'; ctx.stroke(); }
    ctx.lineWidth = 1.6; ctx.setLineDash([4, 5]); ctx.strokeStyle = '#d9cda281'; ctx.beginPath();
    ARRIVAL_ROUTE.forEach((p, i) => i ? ctx.lineTo(x(p.x), y(p.z)) : ctx.moveTo(x(p.x), y(p.z))); ctx.stroke(); ctx.setLineDash([]);
    const sx = x(SPAWN.x), sy = y(SPAWN.z), wx = x(ARRIVAL_WRECK.x), wy = y(ARRIVAL_WRECK.z);
    ctx.save(); ctx.translate(wx, wy); ctx.rotate(-ARRIVAL_WRECK.yaw);
    ctx.beginPath(); ctx.moveTo(0, -13); ctx.bezierCurveTo(6, -8, 7, 5, 1, 12); ctx.lineTo(-4, 6); ctx.lineTo(-2, 2); ctx.lineTo(-6, 0); ctx.quadraticCurveTo(-6,-9,0,-13);
    ctx.fillStyle = '#1a2b2a'; ctx.strokeStyle = '#e0c292'; ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.fillStyle = '#182d30'; ctx.fill(); ctx.strokeStyle = '#eed8a1'; ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2); ctx.fillStyle = '#eed8a1'; ctx.fill();
    ctx.font = `italic ${narrow ? 15 : 19}px Georgia, serif`; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#192321'; ctx.shadowBlur = 3; ctx.fillStyle = '#f2e2c2';
    ctx.fillText(S('loading.chart.wreck'), wx + 15, wy - 2);
    ctx.fillText(S('loading.chart.start'), sx + 15, sy + 1);
    ctx.shadowBlur = 0;
    // The symbols share the chart's scale and north, so the player can judge both the walk and its direction.
    const keyX = width - (narrow ? 26 : 44), keyY = narrow ? 35 : 51;
    ctx.lineWidth = 1; ctx.strokeStyle = '#ddcea5bd'; ctx.fillStyle = '#eee0bc';
    ctx.beginPath(); ctx.moveTo(keyX, keyY - 7); ctx.lineTo(keyX - 4, keyY + 8);
    ctx.lineTo(keyX, keyY + 5); ctx.lineTo(keyX + 4, keyY + 8); ctx.closePath(); ctx.stroke();
    ctx.font = '12px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('N', keyX, keyY - 17);
    const barX = keyX - 26, end = barX - 10 * scale;
    ctx.beginPath(); ctx.moveTo(barX, keyY + 3); ctx.lineTo(barX, keyY + 7);
    ctx.lineTo(end, keyY + 7); ctx.lineTo(end, keyY + 3); ctx.stroke();
    ctx.fillText('10 m', (barX + end) / 2, keyY - 3);
    ctx.textAlign = 'start';
  };
  draw();
  const observer = new ResizeObserver(draw); observer.observe(canvas);
  return () => observer.disconnect();
}
