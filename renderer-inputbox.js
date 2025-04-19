// 动态创建输入框并通过 IPC 发送结果
const { ipcRenderer } = require('electron');

window.createInputBox = function(options, requestId) {
    // 防止重复创建
    if (document.getElementById('electron-plugin-inputbox')) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'electron-plugin-inputbox';
    input.placeholder = (options && options.placeholder) || '请输入内容';
    input.value = (options && options.defaultValue) || '';
    input.style.position = 'fixed';
    input.style.top = '40%';
    input.style.left = '50%';
    input.style.transform = 'translate(-50%, -50%)';
    input.style.zIndex = 9999;
    input.style.fontSize = '18px';
    input.style.padding = '8px 16px';
    input.style.border = '1px solid #888';
    input.style.borderRadius = '6px';
    input.style.background = '#fff';
    input.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    document.body.appendChild(input);
    input.focus();

    function cleanup() {
        input.parentNode && input.parentNode.removeChild(input);
        window.removeEventListener('keydown', onKeyDown, true);
    }

    function onKeyDown(e) {
        if (e.key === 'Enter') {
            ipcRenderer.send('plugin-inputbox-response', { requestId, value: input.value });
            cleanup();
        } else if (e.key === 'Escape') {
            ipcRenderer.send('plugin-inputbox-response', { requestId, value: null });
            cleanup();
        }
    }
    window.addEventListener('keydown', onKeyDown, true);
};

// 监听主进程请求弹出输入框
ipcRenderer.on('plugin-show-inputbox', (event, { options, requestId }) => {
    window.createInputBox(options, requestId);
});
