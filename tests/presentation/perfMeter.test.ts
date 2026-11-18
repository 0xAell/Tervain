import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { perfLine, summarise, type FrameSample } from '../../src/presentation/perfMeter';

const sample = (i: number, gpu: number | null): FrameSample => ({ interval: 10 + i, cpu: 2 + i / 10, gpu, calls: 100 + i, triangles: 1e6 + i * 1e4 });

describe('frame cost summary (A76)', () => {
  it('reports medians, tails and the GPU only for frames it timed', () => {
    const samples = Array.from({ length: 100 }, (_, i) => sample(i, i % 2 ? 4 + i / 100 : null));
    const s = summarise(samples);
    expect(s.frames).toBe(100);
    expect(s.interval.median).toBe(60);
    expect(s.interval.p95).toBe(105);
    expect(s.interval.worst).toBe(109);
    expect(s.cpu.median).toBeCloseTo(7, 6);
    expect(s.gpu?.frames).toBe(50);
    expect(s.calls).toEqual({ median: 150, max: 199 });
    expect(s.triangles.max).toBe(1e6 + 99e4);
  });

  it('says plainly when the GPU cannot be timed', () => {
    const s = summarise([sample(0, null), sample(1, null)]);
    expect(s.gpu).toBeNull();
    expect(perfLine(s, false)).toContain('gpu n/a');
    expect(perfLine(s, true)).toContain('gpu …');
    expect(perfLine(summarise([sample(0, 3.24)]), true)).toContain('gpu 3.2 ms');
  });

  it('summarises nothing without failing', () => {
    const s = summarise([]);
    expect(s.frames).toBe(0);
    expect(s.interval.median).toBe(0);
    expect(s.gpu).toBeNull();
  });
});

describe('a frame that threw before it ended (A90 scout)', () => {
  it('lets the next frame end the stale query and time itself, rather than failing for the rest of the session', async () => {
    const { PerfMeter: Meter } = await import('../../src/presentation/perfMeter');
    class FakeGl {
      active: object | null = null; errors = 0; deleted = 0; made = 0;
      QUERY_RESULT_AVAILABLE = 1; QUERY_RESULT = 2;
      getExtension() { return { TIME_ELAPSED_EXT: 10, GPU_DISJOINT_EXT: 11 }; }
      createQuery() { this.made++; return {}; }
      beginQuery(_target: number, query: object) { if (this.active) { this.errors++; return; } this.active = query; }
      endQuery() { if (!this.active) { this.errors++; return; } this.active = null; }
      deleteQuery() { this.deleted++; }
      getParameter() { return false; }
      getQueryParameter() { return false; }
    }
    vi.stubGlobal('WebGL2RenderingContext', FakeGl);
    const gl = new FakeGl();
    const meter = new Meter({ getContext: () => gl, info: { reset() {}, render: { calls: 0, triangles: 0 } } } as unknown as THREE.WebGLRenderer);
    meter.begin();
    // The frame threw: end() never ran. The next frame begins.
    meter.begin();
    expect(gl.deleted).toBe(1);
    expect(gl.active).not.toBeNull();
    meter.end(16);
    expect(gl.active).toBeNull();
    expect(gl.errors).toBe(0);
    vi.unstubAllGlobals();
  });
});

describe('timer-query collection during ordinary play', () => {
  class QueryContext {
    QUERY_RESULT_AVAILABLE = 1;
    QUERY_RESULT = 2;
    disjoint = false;
    ready = true;
    reads = 0;
    created = 0;
    deleted = 0;
    resultReads = 0;
    getExtension() { return { TIME_ELAPSED_EXT: 10, GPU_DISJOINT_EXT: 11 }; }
    createQuery() { return { elapsed: ++this.created * 1e6 }; }
    beginQuery() {}
    endQuery() {}
    deleteQuery() { this.deleted++; }
    getParameter() {
      this.reads++;
      const reset = this.disjoint;
      this.disjoint = false;
      return reset;
    }
    getQueryParameter(query: { elapsed: number }, parameter: number) {
      if (parameter === this.QUERY_RESULT_AVAILABLE) return this.ready;
      if (!this.ready) throw new Error('Read a pending timer');
      this.resultReads++;
      return query.elapsed;
    }
  }

  async function measure(run: (context: QueryContext, frame: (immediate?: boolean) => FrameSample) => void) {
    const { PerfMeter } = await import('../../src/presentation/perfMeter');
    const context = new QueryContext();
    vi.stubGlobal('WebGL2RenderingContext', QueryContext);
    try {
      const meter = new PerfMeter({ getContext: () => context, info: { reset() {}, render: { calls: 11, triangles: 200 } } } as unknown as THREE.WebGLRenderer);
      run(context, (immediate = false) => { meter.begin(immediate); return meter.end(16); });
    } finally { vi.unstubAllGlobals(); }
  }

  it('retains all timed frames with one disjoint read per four, and immediately drains for diagnostics', async () => {
    await measure((gl, frame) => {
      const samples = Array.from({ length: 60 }, () => frame());
      expect(gl.reads).toBe(15);
      frame(true);
      expect(samples.map(s => s.gpu)).toEqual(samples.map((_, i) => i + 1));
      expect(samples.every(s => s.calls === 11 && s.triangles === 200)).toBe(true);
      expect(gl.deleted).toBe(60);
      for (let i = 0; i < 5; i++) frame(true);
      expect(gl.reads).toBe(21);
    });
  });

  it('bounds unavailable queries and discards an entire disjoint batch before accepting later results', async () => {
    await measure((gl, frame) => {
      gl.ready = false;
      const before = Array.from({ length: 12 }, () => frame());
      expect(gl.created).toBe(6);
      expect(gl.resultReads).toBe(0);
      gl.disjoint = true;
      frame();
      expect(gl.deleted).toBe(6);
      expect(before.every(s => s.gpu === null)).toBe(true);
      gl.ready = true;
      const valid = frame(true);
      frame(true);
      expect(valid.gpu).toBe(8);
      expect(gl.resultReads).toBe(2);
    });
  });
});
