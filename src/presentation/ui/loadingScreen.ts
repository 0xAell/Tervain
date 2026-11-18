import { S } from '../../core/content/strings';
import { clear, h } from './dom';
import { LOADING_PHASES, LoadingProgress } from './loadingProgress';
import type { LoadingPhase, LoadingUpdate } from './loadingProgress';

export type LoadingMode = 'initial' | 'rebuild';
export type LoadingTip = 'explore' | 'hunt' | 'supplies';

export interface LoadingStart {
  mode: LoadingMode;
  phase?: LoadingPhase;
  tip?: LoadingTip;
}

export interface LoadingFailure {
  title?: string;
  message?: string;
  /** What actually went wrong, in small print under the message, so a report names the cause. */
  detail?: string;
  retry?: () => void | Promise<void>;
  retryLabel?: string;
  back?: () => void;
  backLabel?: string;
}

let screenId = 0;

/** Painted journey screen with a progress rail driven by the work actually completed. */
export class LoadingScreen {
  readonly el: HTMLElement;
  readonly progress: LoadingProgress;
  private readonly id = `loading-${++screenId}`;
  private mode: LoadingMode = 'initial';
  private focusBefore: HTMLElement | null = null;
  private status!: HTMLElement;
  private detail!: HTMLElement;
  private count!: HTMLElement;
  private bar!: HTMLElement;
  private segments: HTMLElement[] = [];
  private failed = false;
  private retry: HTMLButtonElement | null = null;
  private controls: HTMLButtonElement[] = [];
  private errorCard: HTMLElement | null = null;

  get retryButton(): HTMLButtonElement | null { return this.retry; }

  constructor(el: HTMLElement = h('div', { class: 'loading', style: { zIndex: '6' } }), phases = LOADING_PHASES as readonly LoadingPhase[]) {
    this.el = el;
    this.el.classList.add('loading');
    this.progress = new LoadingProgress(phases);
  }

  start(options: LoadingStart) {
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body && !this.el.contains(active)) this.focusBefore = active;
    this.mode = options.mode;
    this.el.setAttribute('data-journey', this.mode);
    this.failed = false;
    this.retry = null;
    this.controls = [];
    this.errorCard = null;
    this.progress.reset(options.phase);
    this.el.classList.remove('off', 'loading-failed');
    this.el.removeAttribute('role');
    this.el.removeAttribute('aria-modal');
    this.el.removeAttribute('aria-describedby');
    this.el.removeAttribute('aria-labelledby');
    this.el.setAttribute('aria-label', S(`loading.title.${this.mode}`));
    this.el.setAttribute('aria-busy', 'true');
    clear(this.el);
    const title = h('h1', { class: 'loading-title', id: `${this.id}-title` }, S('game.title'));
    this.status = h('p', { class: 'loading-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    this.detail = h('p', { class: 'loading-detail' });
    this.count = h('span', { class: 'loading-count', 'aria-hidden': 'true' });
    this.bar = h('div', { class: 'loading-bar', role: 'progressbar' });
    this.segments = this.progress.phases.map(() => h('span', { class: 'loading-segment', 'aria-hidden': 'true' }, h('span', { class: 'loading-fill' })));
    this.bar.append(...this.segments);
    this.el.append(h('section', { class: 'loading-page', 'aria-labelledby': `${this.id}-title` },
      h('header', { class: 'loading-heading' }, h('p', { class: 'loading-kicker' }, S(`loading.title.${this.mode}`)), title),
      h('div', { class: 'loading-work' }, h('div', { class: 'loading-status-line' }, this.status, this.count), this.bar, this.detail),
      h('aside', { class: 'loading-tip' }, h('p', { class: 'loading-tip-label' }, S('loading.tip.label')),
        h('p', {}, S(`loading.tip.${options.tip ?? 'explore'}`)))));
    this.render();
  }

  update(update: LoadingUpdate) {
    if (this.failed || !this.status) return;
    this.progress.update(update);
    this.render();
  }

  /** Returns Retry for the app's existing controller navigation and held-confirmation guard. */
  fail(options: LoadingFailure): HTMLButtonElement | null {
    this.failed = true;
    this.el.classList.remove('off');
    this.el.classList.add('loading-failed');
    this.el.setAttribute('role', 'alertdialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-busy', 'false');
    this.el.setAttribute('aria-labelledby', `${this.id}-failure-title`);
    this.el.setAttribute('aria-describedby', `${this.id}-failure-message`);
    this.el.removeAttribute('aria-label');
    clear(this.el);
    const retry = options.retry ? h('button', { class: 'btn primary', 'data-nav': '', onClick: async () => {
      if (!retry || retry.disabled) return;
      retry.disabled = true;
      try { await options.retry!(); }
      finally {
        retry.disabled = false;
        if (retry.isConnected && this.failed) retry.focus();
      }
    } }, options.retryLabel ?? S('loading.retry')) : null;
    const back = options.back ? h('button', { class: 'btn', 'data-nav': '', onClick: options.back }, options.backLabel ?? S('menu.back')) : null;
    this.retry = retry;
    this.controls = [retry, back].filter((button): button is HTMLButtonElement => !!button);
    const card = h('section', { class: 'loading-error', tabindex: '-1' },
      h('p', { class: 'loading-kicker' }, S('game.title')),
      h('h1', { id: `${this.id}-failure-title` }, options.title ?? S(`loading.failure.${this.mode}.title`)),
      h('p', { id: `${this.id}-failure-message` }, options.message ?? S(`loading.failure.${this.mode}.message`)),
      options.detail ? h('p', { class: 'loading-error-detail' }, options.detail) : null,
      h('div', { class: 'loading-error-actions' }, retry, back));
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      this.navigate(event.shiftKey ? -1 : 1, 0);
    });
    this.errorCard = card;
    this.el.append(card);
    (retry ?? back ?? card).focus();
    return retry;
  }

  /** Recovery owns controller navigation; the paused title and world never receive these presses. */
  navigate(dx: number, dy: number) {
    if (!this.failed || (dx === 0 && dy === 0)) return;
    const controls = this.controls.filter((button) => !button.disabled && button.isConnected);
    if (!controls.length) { this.errorCard?.focus(); return; }
    const index = controls.indexOf(document.activeElement as HTMLButtonElement);
    const step = Math.sign(dy || dx);
    controls[index < 0 ? 0 : (index + step + controls.length) % controls.length]?.focus();
  }

  confirm() {
    if (!this.failed) return;
    const controls = this.controls.filter((button) => !button.disabled && button.isConnected);
    const focused = document.activeElement as HTMLButtonElement;
    (controls.includes(focused) ? focused : controls[0])?.click();
  }

  finish(restoreFocus = true) {
    this.el.classList.add('off');
    this.el.setAttribute('aria-busy', 'false');
    this.el.removeAttribute('role');
    this.el.removeAttribute('aria-modal');
    this.el.removeAttribute('aria-label');
    this.el.removeAttribute('aria-labelledby');
    this.el.removeAttribute('aria-describedby');
    this.retry = null;
    this.controls = [];
    this.errorCard = null;
    if (restoreFocus && this.focusBefore?.isConnected && !this.focusBefore.closest('[inert], [hidden]')) this.focusBefore.focus();
    this.focusBefore = null;
  }

  private render() {
    const snapshot = this.progress.snapshot;
    const label = S(`loading.phase.${snapshot.phase}`);
    if (this.status.textContent !== label) this.status.textContent = label;
    this.detail.textContent = snapshot.detail ?? (this.mode === 'rebuild' ? S('loading.rebuild.paused') : '');
    const count = snapshot.completed !== null && snapshot.total !== null
      ? S('loading.count', { completed: snapshot.completed, total: snapshot.total }) : '';
    this.count.textContent = count;
    this.bar.setAttribute('aria-label', label);
    this.bar.setAttribute('aria-valuetext', count ? `${label}: ${count}` : label);
    if (snapshot.completed !== null && snapshot.total !== null) {
      this.bar.setAttribute('aria-valuemin', '0');
      this.bar.setAttribute('aria-valuemax', String(snapshot.total));
      this.bar.setAttribute('aria-valuenow', String(snapshot.completed));
    } else {
      this.bar.removeAttribute('aria-valuemin');
      this.bar.removeAttribute('aria-valuemax');
      this.bar.removeAttribute('aria-valuenow');
    }
    this.segments.forEach((segment, index) => {
      segment.classList.toggle('complete', index < snapshot.index);
      segment.classList.toggle('active', index === snapshot.index);
      segment.classList.toggle('indeterminate', index === snapshot.index && snapshot.fraction === null);
      const fraction = index < snapshot.index ? 1 : index === snapshot.index ? snapshot.fraction ?? 0 : 0;
      segment.style.setProperty('--loading-fill', String(fraction));
    });
  }
}
