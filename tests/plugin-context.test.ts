import { Disposable, PluginContext } from '../src/main/plugin-context';

// ─── Disposable ───────────────────────────────────────────────────────────────

describe('Disposable', () => {
  it('calls dispose action once', () => {
    const action = jest.fn();
    const d = new Disposable(action);
    d.dispose();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('does not call action on second dispose', () => {
    const action = jest.fn();
    const d = new Disposable(action);
    d.dispose();
    d.dispose();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('does not call action on third or more dispose calls', () => {
    const action = jest.fn();
    const d = new Disposable(action);
    d.dispose();
    d.dispose();
    d.dispose();
    d.dispose();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('calls the action immediately on first dispose', () => {
    let called = false;
    const d = new Disposable(() => { called = true; });
    expect(called).toBe(false);
    d.dispose();
    expect(called).toBe(true);
  });

  it('does not throw when action throws', () => {
    const d = new Disposable(() => { throw new Error('oops'); });
    expect(() => d.dispose()).toThrow('oops'); // propagates by design
  });

  it('action receives no arguments', () => {
    const action = jest.fn();
    const d = new Disposable(action);
    d.dispose();
    expect(action).toHaveBeenCalledWith();
  });
});

// ─── PluginContext ────────────────────────────────────────────────────────────

describe('PluginContext', () => {
  it('disposeAll calls all disposables', () => {
    const api = {} as any;
    const instance = {} as any;
    const ctx = new PluginContext(instance, api);

    const a1 = jest.fn();
    const a2 = jest.fn();
    ctx.disposables.push(new Disposable(a1));
    ctx.disposables.push(new Disposable(a2));

    ctx.disposeAll();

    expect(a1).toHaveBeenCalledTimes(1);
    expect(a2).toHaveBeenCalledTimes(1);
  });

  it('disposeAll empties the disposables array', () => {
    const api = {} as any;
    const instance = {} as any;
    const ctx = new PluginContext(instance, api);
    ctx.disposables.push(new Disposable(() => {}));
    ctx.disposables.push(new Disposable(() => {}));

    ctx.disposeAll();

    expect(ctx.disposables).toHaveLength(0);
  });

  it('disposeAll is safe to call on empty context', () => {
    const ctx = new PluginContext({} as any, {} as any);
    expect(() => ctx.disposeAll()).not.toThrow();
  });

  it('disposeAll is safe to call multiple times', () => {
    const api = {} as any;
    const instance = {} as any;
    const ctx = new PluginContext(instance, api);
    const action = jest.fn();
    ctx.disposables.push(new Disposable(action));

    ctx.disposeAll();
    ctx.disposeAll(); // second call: disposables array is empty, no-op

    expect(action).toHaveBeenCalledTimes(1);
  });

  it('disposeAll does not call already-disposed disposable action again', () => {
    const ctx = new PluginContext({} as any, {} as any);
    const action = jest.fn();
    const d = new Disposable(action);
    d.dispose(); // pre-dispose it
    ctx.disposables.push(d);

    ctx.disposeAll(); // should call d.dispose() which is now a no-op

    expect(action).toHaveBeenCalledTimes(1); // only the pre-dispose call
  });

  it('exposes instance and api as readonly properties', () => {
    const api = { name: 'testApi' } as any;
    const instance = { name: 'testInstance' } as any;
    const ctx = new PluginContext(instance, api);

    expect(ctx.instance).toBe(instance);
    expect(ctx.api).toBe(api);
  });

  it('starts with empty disposables array', () => {
    const ctx = new PluginContext({} as any, {} as any);
    expect(ctx.disposables).toEqual([]);
  });

  it('disposeAll calls disposables in order', () => {
    const ctx = new PluginContext({} as any, {} as any);
    const callOrder: number[] = [];
    ctx.disposables.push(new Disposable(() => callOrder.push(1)));
    ctx.disposables.push(new Disposable(() => callOrder.push(2)));
    ctx.disposables.push(new Disposable(() => callOrder.push(3)));

    ctx.disposeAll();

    expect(callOrder).toEqual([1, 2, 3]);
  });

  it('can add more disposables after disposeAll', () => {
    const ctx = new PluginContext({} as any, {} as any);
    const action1 = jest.fn();
    const action2 = jest.fn();

    ctx.disposables.push(new Disposable(action1));
    ctx.disposeAll();
    expect(action1).toHaveBeenCalledTimes(1);

    ctx.disposables.push(new Disposable(action2));
    ctx.disposeAll();
    expect(action2).toHaveBeenCalledTimes(1);
  });
});
