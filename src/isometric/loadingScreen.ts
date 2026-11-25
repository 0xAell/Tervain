/** Covers the interface while the renderer prepares the first playable frame. */
export class LoadingScreen {
  private readonly status: HTMLElement;
  private readonly retry: HTMLAnchorElement;

  constructor(
    private readonly panel: HTMLElement,
    private readonly controls: readonly HTMLElement[]
  ) {
    this.status = panel.querySelector('.vale-loading-text')!;
    this.retry = panel.querySelector('.vale-loading-retry')!;
  }

  get visible() {
    return !this.panel.hidden;
  }

  show(message: string) {
    this.panel.hidden = false;
    this.status.textContent = message;
    for (const element of this.controls) element.inert = true;
  }

  hide() {
    this.panel.hidden = true;
    for (const element of this.controls) element.inert = false;
  }

  fail(error: unknown) {
    console.error(error);
    this.show('The vale could not load.');
    this.panel.dataset.failed = '';
    this.retry.hidden = false;
    this.retry.focus();
  }
}
