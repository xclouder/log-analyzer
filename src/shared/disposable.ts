/**
 * Disposable — a cleanup action that runs at most once.
 * Shared between main and renderer processes.
 */
export interface IDisposable {
  dispose(): void;
}

export class Disposable implements IDisposable {
  private disposed = false;
  private readonly disposeAction: () => void;

  constructor(disposeAction: () => void) {
    this.disposeAction = disposeAction;
  }

  dispose(): void {
    if (!this.disposed) {
      this.disposed = true;
      this.disposeAction();
    }
  }
}
