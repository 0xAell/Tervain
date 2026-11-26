type Ink = CanvasRenderingContext2D;
const outlineOffsets = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

/** Trace the current pose only where opaque foreground pixels have actually covered it. */
export class HeroReveal {
  private covering = document.createElement('canvas').getContext('2d')!;
  private pose = document.createElement('canvas').getContext('2d')!;
  private outline = document.createElement('canvas').getContext('2d')!;
  private drawPose?: (ctx: Ink) => void;
  private covered = false;
  private x = 0;
  private y = 0;
  private w = 0;
  private h = 0;

  constructor(
    private tint = 'rgba(49,72,73,.72)',
    private rim = '#f1e1b6',
    private opacity = 0.53
  ) {}

  reset() {
    this.drawPose = undefined;
    this.covered = false;
  }

  track(x: number, foot: number, width: number, height: number, drawPose: (ctx: Ink) => void) {
    this.x = Math.floor(x - width / 2) - 2;
    this.y = Math.floor(foot - height) - 2;
    this.w = Math.ceil(width) + 5;
    this.h = Math.ceil(height) + 5;
    this.drawPose = drawPose;
  }

  private clear(g: Ink) {
    if (g.canvas.width < this.w) g.canvas.width = this.w;
    if (g.canvas.height < this.h) g.canvas.height = this.h;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, g.canvas.width, g.canvas.height);
    g.setTransform(1, 0, 0, 1, -this.x, -this.y);
    g.imageSmoothingEnabled = false;
  }

  foreground(left: number, top: number, width: number, height: number) {
    if (!this.drawPose || left >= this.x + this.w || left + width <= this.x ||
      top >= this.y + this.h || top + height <= this.y) return;
    if (!this.covered) this.clear(this.covering);
    this.covered = true;
    return this.covering;
  }

  finish(ctx: Ink) {
    if (!this.covered || !this.drawPose) return;
    const g = this.pose;
    this.clear(g);
    g.save();
    this.drawPose(g);
    g.restore();
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = this.tint;
    g.fillRect(0, 0, this.w, this.h);
    g.restore();

    const edge = this.outline;
    this.clear(edge);
    edge.save();
    edge.setTransform(1, 0, 0, 1, 0, 0);
    for (const [dx, dy] of outlineOffsets) edge.drawImage(g.canvas, dx, dy);
    edge.globalCompositeOperation = 'source-in';
    edge.fillStyle = this.rim;
    edge.fillRect(0, 0, this.w, this.h);
    edge.globalCompositeOperation = 'source-over';
    edge.drawImage(g.canvas, 0, 0);
    edge.globalCompositeOperation = 'destination-in';
    edge.drawImage(this.covering.canvas, 0, 0);
    edge.restore();
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.drawImage(edge.canvas, 0, 0, this.w, this.h, this.x, this.y, this.w, this.h);
    ctx.restore();
  }
}
