// 动态创建输入框并通过 IPC 发送结果
// 使用 preload.js 暴露的 window.electronAPI

window.createInputBox = function(options, requestId) {
    // 防止重复创建
    if (document.getElementById('electron-plugin-inputbox-mask')) return;

    // 遮罩
    const mask = document.createElement('div');
    mask.id = 'electron-plugin-inputbox-mask';
    mask.style.position = 'fixed';
    mask.style.top = 0;
    mask.style.left = 0;
    mask.style.width = '100vw';
    mask.style.height = '100vh';
    mask.style.background = 'rgba(0,0,0,0.35)';
    mask.style.zIndex = 9998;
    mask.style.display = 'block';
    document.body.appendChild(mask);

    // 输入框
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'electron-plugin-inputbox';
    input.placeholder = (options && options.placeholder) || '请输入内容';
    input.value = (options && options.defaultValue) || '';
    input.style.background = '#444';
    input.style.color = '#fff';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.borderRadius = '6px';
    input.style.boxShadow = '0 8px 32px 0 rgba(0,0,0,0.32)';
    input.style.fontSize = '18px';
    input.style.fontFamily = 'inherit';
    input.style.width = '320px';
    input.style.height = '40px';
    input.style.padding = '0 16px';
    input.style.transition = 'box-shadow 0.2s, border 0.2s';
    input.style.zIndex = 9999;
    input.style.display = 'block';
    input.style.boxSizing = 'border-box';
    input.style.letterSpacing = '0.5px';
    input.style.caretColor = '#6cf';
    input.style.position = 'fixed';
    input.style.left = '50%';
    input.style.top = '80px';
    input.style.transform = 'translateX(-50%)';

    // placeholder 字体色
    input.onfocus = function() { input.style.boxShadow = '0 0 0 2px #1565C0, 0 8px 32px 0 rgba(0,0,0,0.32)'; };
    input.onblur = function() { input.style.boxShadow = '0 8px 32px 0 rgba(0,0,0,0.32)'; };
    // 兼容 placeholder 颜色
    input.setAttribute('style', input.getAttribute('style') + '::placeholder { color: #bbb; opacity: 1; }');

    mask.appendChild(input);
    input.focus();

    function cleanup() {
        if (input.parentNode) input.parentNode.removeChild(input);
        if (mask.parentNode) mask.parentNode.removeChild(mask);
        window.removeEventListener('keydown', onKeyDown, true);
    }

    function onKeyDown(e) {
        if (e.key === 'Enter') {
            window.electronAPI.ipcSend('plugin-inputbox-response', { requestId, value: input.value });
            cleanup();
        } else if (e.key === 'Escape') {
            window.electronAPI.ipcSend('plugin-inputbox-response', { requestId, value: null });
            cleanup();
        }
    }
    window.addEventListener('keydown', onKeyDown, true);
};

// 监听主进程请求弹出输入框
window.electronAPI.ipcOn('plugin-show-inputbox', (event, { options, requestId }) => {
    window.createInputBox(options, requestId);
});
