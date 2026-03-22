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

// ─── Types ────────────────────────────────────────────────────────────────────

interface InputBoxOptions {
  placeholder?: string;
  defaultValue?: string;
}

interface QuickPickOptions {
  title?: string;
  placeHolder?: string;
}

interface QuickPickItem {
  label: string;
  [key: string]: unknown;
}

interface MessageOptions {
  modal?: boolean;
  detail?: string;
}

// ─── InputBox ─────────────────────────────────────────────────────────────────

function createInputBox(options: InputBoxOptions, requestId: string): void {
  // Prevent duplicate
  if (document.getElementById('electron-plugin-inputbox-mask')) return;

  // Overlay mask
  const mask = document.createElement('div');
  mask.id = 'electron-plugin-inputbox-mask';
  mask.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.35);z-index:9998;display:block;';
  document.body.appendChild(mask);

  // Input element
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'electron-plugin-inputbox';
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

  mask.appendChild(input);
  input.focus();

  function cleanup(): void {
    if (input.parentNode) input.parentNode.removeChild(input);
    if (mask.parentNode) mask.parentNode.removeChild(mask);
    window.removeEventListener('keydown', onKeyDown, true);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      (window as any).electronAPI.sendInputBoxResponse(requestId, input.value);
      cleanup();
    } else if (e.key === 'Escape') {
      (window as any).electronAPI.sendInputBoxResponse(requestId, null);
      cleanup();
    }
  }

  window.addEventListener('keydown', onKeyDown, true);
}

(window as any).createInputBox = createInputBox;

// Listen for main-process requests to show an InputBox
(window as any).electronAPI.onPluginShowInputBox((_event: any, { options, requestId }: { options: InputBoxOptions; requestId: string }) => {
  createInputBox(options, requestId);
});

// ─── QuickPick ────────────────────────────────────────────────────────────────

function createQuickPick(
  items: (string | QuickPickItem)[],
  options: QuickPickOptions,
  requestId: string,
): void {
  // Prevent duplicate
  if (document.getElementById('electron-plugin-quickpick-mask')) return;

  // Overlay mask
  const mask = document.createElement('div');
  mask.id = 'electron-plugin-quickpick-mask';
  mask.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.35);z-index:9998;display:block;';
  document.body.appendChild(mask);

  // Container
  const container = document.createElement('div');
  container.id = 'electron-plugin-quickpick';
  container.style.cssText = [
    'background:#444', 'color:#fff', 'border:none', 'outline:none',
    'border-radius:6px', 'box-shadow:0 8px 32px 0 rgba(0,0,0,0.32)',
    'font-size:16px', 'font-family:inherit',
    'width:800px', 'max-height:400px', 'overflow-y:auto', 'padding:8px 0',
    'z-index:9999', 'position:fixed', 'left:50%', 'top:80px', 'transform:translateX(-50%)',
  ].join(';');
  mask.appendChild(container);

  // Optional title
  if (options?.title) {
    const title = document.createElement('div');
    title.textContent = options.title;
    title.style.cssText = 'padding:8px 16px;font-weight:bold;border-bottom:1px solid #555;';
    container.appendChild(title);
  }

  // Optional placeholder hint
  if (options?.placeHolder) {
    const placeholder = document.createElement('div');
    placeholder.textContent = options.placeHolder;
    placeholder.style.cssText = 'padding:8px 16px;color:#bbb;font-style:italic;';
    container.appendChild(placeholder);
  }

  // Item list
  items.forEach((item) => {
    const option = document.createElement('div');
    option.textContent = typeof item === 'string' ? item : (item.label ?? String(item));
    option.style.cssText = 'padding:8px 16px;cursor:pointer;transition:background 0.2s;';
    option.onmouseover = () => { option.style.background = '#555'; };
    option.onmouseout = () => { option.style.background = 'transparent'; };
    option.onclick = () => {
      (window as any).electronAPI.sendQuickPickResponse(requestId, item);
      cleanup();
    };
    container.appendChild(option);
  });

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      (window as any).electronAPI.sendQuickPickResponse(requestId, null);
      cleanup();
    }
  }
  window.addEventListener('keydown', onKeyDown, true);

  function cleanup(): void {
    if (container.parentNode) container.parentNode.removeChild(container);
    if (mask.parentNode) mask.parentNode.removeChild(mask);
    window.removeEventListener('keydown', onKeyDown, true);
  }
}

(window as any).createQuickPick = createQuickPick;

// Listen for main-process requests to show a QuickPick
(window as any).electronAPI.onPluginShowQuickPick((_event: any, { items, options, requestId }: {
  items: (string | QuickPickItem)[];
  options: QuickPickOptions;
  requestId: string;
}) => {
  createQuickPick(items, options, requestId);
});

// ─── InformationMessage ───────────────────────────────────────────────────────

function createInformationMessage(
  message: string,
  options: MessageOptions,
  requestId: string,
): void {
  if (document.getElementById('electron-plugin-informationmessage-mask')) return;

  const mask = document.createElement('div');
  mask.id = 'electron-plugin-informationmessage-mask';
  mask.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.35);z-index:9998;display:block;';
  document.body.appendChild(mask);

  const container = document.createElement('div');
  container.id = 'electron-plugin-informationmessage';
  container.style.cssText = [
    'background:#444', 'color:#fff', 'border:none', 'outline:none',
    'border-radius:6px', 'box-shadow:0 8px 32px 0 rgba(0,0,0,0.32)',
    'font-size:16px', 'font-family:inherit',
    'width:320px', 'padding:16px',
    'z-index:9999', 'position:fixed', 'left:50%', 'top:80px', 'transform:translateX(-50%)',
  ].join(';');
  mask.appendChild(container);

  // Message text
  const messageText = document.createElement('div');
  messageText.textContent = message;
  messageText.style.marginBottom = '16px';
  container.appendChild(messageText);

  // Optional detail text (only in modal mode)
  if (options?.modal && options.detail) {
    const detailText = document.createElement('div');
    detailText.textContent = options.detail;
    detailText.style.cssText = 'margin-bottom:16px;color:#bbb;font-size:14px;';
    container.appendChild(detailText);
  }

  // OK button
  const button = document.createElement('button');
  button.textContent = 'OK';
  button.style.cssText = 'background:#1565C0;color:#fff;border:none;border-radius:4px;padding:8px 16px;cursor:pointer;transition:background 0.2s;';
  button.onmouseover = () => { button.style.background = '#104d8e'; };
  button.onmouseout = () => { button.style.background = '#1565C0'; };
  button.onclick = () => {
    (window as any).electronAPI.sendInformationResponse(requestId, 'OK');
    cleanup();
  };
  container.appendChild(button);

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === 'Escape') {
      (window as any).electronAPI.sendInformationResponse(requestId, 'OK');
      cleanup();
    }
  }
  window.addEventListener('keydown', onKeyDown, true);

  function cleanup(): void {
    if (container.parentNode) container.parentNode.removeChild(container);
    if (mask.parentNode) mask.parentNode.removeChild(mask);
    window.removeEventListener('keydown', onKeyDown, true);
  }

  button.focus();
}

(window as any).createInformationMessage = createInformationMessage;

// Listen for main-process requests to show an InformationMessage
(window as any).electronAPI.onPluginShowInformation((_event: any, { message, options, requestId }: {
  message: string;
  options: MessageOptions;
  requestId: string;
}) => {
  createInformationMessage(message, options ?? {}, requestId);
});

// ─── ErrorMessage ─────────────────────────────────────────────────────────────

function createErrorMessage(
  message: string,
  options: MessageOptions,
  requestId: string,
): void {
  if (document.getElementById('electron-plugin-errormessage-mask')) return;

  const mask = document.createElement('div');
  mask.id = 'electron-plugin-errormessage-mask';
  mask.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.35);z-index:9998;display:block;';
  document.body.appendChild(mask);

  // Dark-red container
  const container = document.createElement('div');
  container.id = 'electron-plugin-errormessage';
  container.style.cssText = [
    'background:#4a1a1a', 'color:#fff', 'border:none', 'outline:none',
    'border-radius:6px', 'box-shadow:0 8px 32px 0 rgba(0,0,0,0.32)',
    'font-size:16px', 'font-family:inherit',
    'width:320px', 'padding:16px',
    'z-index:9999', 'position:fixed', 'left:50%', 'top:80px', 'transform:translateX(-50%)',
  ].join(';');
  mask.appendChild(container);

  // Error icon
  const icon = document.createElement('div');
  icon.textContent = '❌';
  icon.style.cssText = 'float:left;margin-right:12px;font-size:24px;';
  container.appendChild(icon);

  // Message text
  const messageText = document.createElement('div');
  messageText.textContent = message;
  messageText.style.cssText = 'margin-bottom:16px;overflow:hidden;';
  container.appendChild(messageText);

  // Optional detail text (modal only)
  if (options?.modal && options.detail) {
    const detailText = document.createElement('div');
    detailText.textContent = options.detail;
    detailText.style.cssText = 'margin-bottom:16px;color:#ffcccc;font-size:14px;';
    container.appendChild(detailText);
  }

  // OK button (red)
  const button = document.createElement('button');
  button.textContent = 'OK';
  button.style.cssText = 'background:#c62828;color:#fff;border:none;border-radius:4px;padding:8px 16px;cursor:pointer;transition:background 0.2s;';
  button.onmouseover = () => { button.style.background = '#9c0000'; };
  button.onmouseout = () => { button.style.background = '#c62828'; };
  button.onclick = () => {
    (window as any).electronAPI.sendErrorResponse(requestId, 'OK');
    cleanup();
  };
  container.appendChild(button);

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === 'Escape') {
      (window as any).electronAPI.sendErrorResponse(requestId, 'OK');
      cleanup();
    }
  }
  window.addEventListener('keydown', onKeyDown, true);

  function cleanup(): void {
    if (container.parentNode) container.parentNode.removeChild(container);
    if (mask.parentNode) mask.parentNode.removeChild(mask);
    window.removeEventListener('keydown', onKeyDown, true);
  }

  button.focus();
}

(window as any).createErrorMessage = createErrorMessage;

// Listen for main-process requests to show an ErrorMessage
(window as any).electronAPI.onPluginShowError((_event: any, { message, options, requestId }: {
  message: string;
  options: MessageOptions;
  requestId: string;
}) => {
  createErrorMessage(message, options ?? {}, requestId);
});
