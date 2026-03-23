/**
 * renderer-inputbox.ts - Plugin UI widget layer for the renderer process.
 *
 * Listens for IPC events from the main process and dynamically creates
 * floating UI widgets:
 *   - InputBox      : single-line text input (plugin-show-inputbox)
 *   - QuickPick     : list-selection dropdown  (plugin-show-quickpick)
 *   - InformationMessage : modal info dialog   (plugin-show-informationmessage)
 *   - ErrorMessage  : modal error dialog       (plugin-show-errormessage)
 *
 * Responses are sent back via window.electronAPI.sendInputBoxResponse /
 * sendQuickPickResponse / sendInformationResponse / sendErrorResponse.
 */

// Types inlined to avoid `import type` which causes `exports` preamble in compiled JS.
interface InputBoxOptions { placeholder?: string; defaultValue?: string; prompt?: string; }
interface QuickPickOptions { title?: string; placeHolder?: string; }
interface QuickPickItem { label: string; description?: string; detail?: string; [key: string]: unknown; }
interface MessageOptions { modal?: boolean; detail?: string; }

// ─── Shared modal helper ─────────────────────────────────────────────────────

interface ModalResult {
  mask: HTMLDivElement;
  container: HTMLDivElement;
  cleanup: () => void;
}

function createModal(
  id: string,
  containerCSS: string,
  onEscape?: () => void,
): ModalResult {
  // Prevent duplicates
  const existing = document.getElementById(`${id}-mask`);
  if (existing) existing.remove();

  const mask = document.createElement('div');
  mask.id = `${id}-mask`;
  mask.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.35);z-index:9998;display:block;';
  document.body.appendChild(mask);

  const container = document.createElement('div');
  container.id = id;
  container.style.cssText = containerCSS;
  mask.appendChild(container);

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && onEscape) onEscape();
  }

  if (onEscape) window.addEventListener('keydown', onKeyDown, true);

  function cleanup(): void {
    if (container.parentNode) container.parentNode.removeChild(container);
    if (mask.parentNode) mask.parentNode.removeChild(mask);
    window.removeEventListener('keydown', onKeyDown, true);
  }

  return { mask, container, cleanup };
}

const PANEL_CSS = [
  'background:#444', 'color:#fff', 'border:none', 'outline:none',
  'border-radius:6px', 'box-shadow:0 8px 32px 0 rgba(0,0,0,0.32)',
  'font-family:inherit',
  'z-index:9999', 'position:fixed', 'left:50%', 'top:80px', 'transform:translateX(-50%)',
].join(';');

// ─── InputBox ─────────────────────────────────────────────────────────────────

function createInputBox(options: InputBoxOptions, requestId: string): void {
  let modal: ModalResult | null = null;

  function send(value: string | null): void {
    window.electronAPI.sendInputBoxResponse(requestId, value);
    modal?.cleanup();
  }

  modal = createModal(
    'electron-plugin-inputbox',
    PANEL_CSS + ';font-size:18px;width:800px;height:40px;padding:0;',
    () => send(null),
  );

  // Replace the container with just the input (InputBox is special — no wrapper)
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = options?.placeholder ?? '请输入内容';
  input.value = options?.defaultValue ?? '';
  input.style.cssText = [
    'background:#444', 'color:#fff', 'border:none', 'outline:none',
    'border-radius:6px', 'box-shadow:0 8px 32px 0 rgba(0,0,0,0.32)',
    'font-size:18px', 'font-family:inherit',
    'width:800px', 'height:40px', 'padding:0 16px',
    'transition:box-shadow 0.2s,border 0.2s',
    'z-index:9999', 'display:block', 'box-sizing:border-box',
    'letter-spacing:0.5px', 'caret-color:#6cf',
    'position:fixed', 'left:50%', 'top:80px', 'transform:translateX(-50%)',
  ].join(';');

  input.onfocus = () => { input.style.boxShadow = '0 0 0 2px #1565C0, 0 8px 32px 0 rgba(0,0,0,0.32)'; };
  input.onblur = () => { input.style.boxShadow = '0 8px 32px 0 rgba(0,0,0,0.32)'; };

  // Remove the default container, place input directly in mask
  modal.container.remove();
  modal.mask.appendChild(input);
  input.focus();

  // Override escape to also handle Enter
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter') send(input.value);
    else if (e.key === 'Escape') send(null);
  }
  window.addEventListener('keydown', onKeyDown, true);

  // Extend cleanup to also remove this listener
  const origCleanup = modal.cleanup;
  modal.cleanup = () => {
    window.removeEventListener('keydown', onKeyDown, true);
    if (input.parentNode) input.parentNode.removeChild(input);
    origCleanup();
  };
}

window.electronAPI.onPluginShowInputBox((_event, { options, requestId }) => {
  createInputBox(options, requestId);
});

// ─── QuickPick ────────────────────────────────────────────────────────────────

function createQuickPick(
  items: (string | QuickPickItem)[],
  options: QuickPickOptions,
  requestId: string,
): void {
  let modal: ModalResult | null = null;

  function send(value: string | QuickPickItem | null): void {
    window.electronAPI.sendQuickPickResponse(requestId, value);
    modal?.cleanup();
  }

  modal = createModal(
    'electron-plugin-quickpick',
    PANEL_CSS + ';font-size:16px;width:800px;max-height:400px;overflow-y:auto;padding:8px 0;',
    () => send(null),
  );

  const { container } = modal;

  if (options?.title) {
    const title = document.createElement('div');
    title.textContent = options.title;
    title.style.cssText = 'padding:8px 16px;font-weight:bold;border-bottom:1px solid #555;';
    container.appendChild(title);
  }

  if (options?.placeHolder) {
    const placeholder = document.createElement('div');
    placeholder.textContent = options.placeHolder;
    placeholder.style.cssText = 'padding:8px 16px;color:#bbb;font-style:italic;';
    container.appendChild(placeholder);
  }

  items.forEach((item) => {
    const option = document.createElement('div');
    option.textContent = typeof item === 'string' ? item : (item.label ?? String(item));
    option.style.cssText = 'padding:8px 16px;cursor:pointer;transition:background 0.2s;';
    option.onmouseover = () => { option.style.background = '#555'; };
    option.onmouseout = () => { option.style.background = 'transparent'; };
    option.onclick = () => send(item);
    container.appendChild(option);
  });
}

window.electronAPI.onPluginShowQuickPick((_event, { items, options, requestId }) => {
  createQuickPick(items, options, requestId);
});

// ─── Message Dialog (shared between Information and Error) ────────────────────

function createMessageDialog(
  id: string,
  message: string,
  options: MessageOptions,
  requestId: string,
  sendResponse: (requestId: string) => void,
  config: { bg: string; buttonBg: string; buttonHover: string; icon?: string; detailColor?: string },
): void {
  let modal: ModalResult | null = null;

  function done(): void {
    sendResponse(requestId);
    modal?.cleanup();
  }

  modal = createModal(
    id,
    PANEL_CSS + `;font-size:16px;width:320px;padding:16px;background:${config.bg};`,
    done,
  );

  const { container } = modal;

  // Override escape to also handle Enter
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === 'Escape') done();
  }
  window.addEventListener('keydown', onKeyDown, true);
  const origCleanup = modal.cleanup;
  modal.cleanup = () => {
    window.removeEventListener('keydown', onKeyDown, true);
    origCleanup();
  };

  if (config.icon) {
    const icon = document.createElement('div');
    icon.textContent = config.icon;
    icon.style.cssText = 'float:left;margin-right:12px;font-size:24px;';
    container.appendChild(icon);
  }

  const messageText = document.createElement('div');
  messageText.textContent = message;
  messageText.style.cssText = 'margin-bottom:16px;overflow:hidden;';
  container.appendChild(messageText);

  if (options?.modal && options.detail) {
    const detailText = document.createElement('div');
    detailText.textContent = options.detail;
    detailText.style.cssText = `margin-bottom:16px;color:${config.detailColor ?? '#bbb'};font-size:14px;`;
    container.appendChild(detailText);
  }

  const button = document.createElement('button');
  button.textContent = 'OK';
  button.style.cssText = `background:${config.buttonBg};color:#fff;border:none;border-radius:4px;padding:8px 16px;cursor:pointer;transition:background 0.2s;`;
  button.onmouseover = () => { button.style.background = config.buttonHover; };
  button.onmouseout = () => { button.style.background = config.buttonBg; };
  button.onclick = done;
  container.appendChild(button);
  button.focus();
}

// ─── InformationMessage ───────────────────────────────────────────────────────

function createInformationMessage(message: string, options: MessageOptions, requestId: string): void {
  createMessageDialog(
    'electron-plugin-informationmessage',
    message, options, requestId,
    (rid) => window.electronAPI.sendInformationResponse(rid),
    { bg: '#444', buttonBg: '#1565C0', buttonHover: '#104d8e' },
  );
}

window.electronAPI.onPluginShowInformation((_event, { message, options, requestId }) => {
  createInformationMessage(message, options ?? {}, requestId);
});

// ─── ErrorMessage ─────────────────────────────────────────────────────────────

function createErrorMessage(message: string, options: MessageOptions, requestId: string): void {
  createMessageDialog(
    'electron-plugin-errormessage',
    message, options, requestId,
    (rid) => window.electronAPI.sendErrorResponse(rid),
    { bg: '#4a1a1a', buttonBg: '#c62828', buttonHover: '#9c0000', icon: '\u274C', detailColor: '#ffcccc' },
  );
}

window.electronAPI.onPluginShowError((_event, { message, options, requestId }) => {
  createErrorMessage(message, options ?? {}, requestId);
});
