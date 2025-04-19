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

// 动态创建 QuickPick 选择器并通过 IPC 发送结果
window.createQuickPick = function(items, options, requestId) {
    // 防止重复创建
    if (document.getElementById('electron-plugin-quickpick-mask')) return;

    // 遮罩
    const mask = document.createElement('div');
    mask.id = 'electron-plugin-quickpick-mask';
    mask.style.position = 'fixed';
    mask.style.top = 0;
    mask.style.left = 0;
    mask.style.width = '100vw';
    mask.style.height = '100vh';
    mask.style.background = 'rgba(0,0,0,0.35)';
    mask.style.zIndex = 9998;
    mask.style.display = 'block';
    document.body.appendChild(mask);

    // 选择器容器
    const container = document.createElement('div');
    container.id = 'electron-plugin-quickpick';
    container.style.background = '#444';
    container.style.color = '#fff';
    container.style.border = 'none';
    container.style.outline = 'none';
    container.style.borderRadius = '6px';
    container.style.boxShadow = '0 8px 32px 0 rgba(0,0,0,0.32)';
    container.style.fontSize = '16px';
    container.style.fontFamily = 'inherit';
    container.style.width = '320px';
    container.style.maxHeight = '400px';
    container.style.overflowY = 'auto';
    container.style.padding = '8px 0';
    container.style.zIndex = 9999;
    container.style.position = 'fixed';
    container.style.left = '50%';
    container.style.top = '80px';
    container.style.transform = 'translateX(-50%)';
    mask.appendChild(container);

    // 如果有标题，添加标题
    if (options && options.title) {
        const title = document.createElement('div');
        title.textContent = options.title;
        title.style.padding = '8px 16px';
        title.style.fontWeight = 'bold';
        title.style.borderBottom = '1px solid #555';
        container.appendChild(title);
    }

    // 如果有 placeholder，添加占位符提示
    if (options && options.placeHolder) {
        const placeholder = document.createElement('div');
        placeholder.textContent = options.placeHolder;
        placeholder.style.padding = '8px 16px';
        placeholder.style.color = '#bbb';
        placeholder.style.fontStyle = 'italic';
        container.appendChild(placeholder);
    }

    // 创建选项列表
    items.forEach((item, index) => {
        const option = document.createElement('div');
        option.textContent = typeof item === 'string' ? item : item.label || item;
        option.style.padding = '8px 16px';
        option.style.cursor = 'pointer';
        option.style.transition = 'background 0.2s';
        option.onmouseover = function() {
            option.style.background = '#555';
        };
        option.onmouseout = function() {
            option.style.background = 'transparent';
        };
        option.onclick = function() {
            window.electronAPI.ipcSend('plugin-quickpick-response', { requestId, value: item });
            cleanup();
        };
        container.appendChild(option);
    });

    // 键盘事件处理
    function onKeyDown(e) {
        if (e.key === 'Escape') {
            window.electronAPI.ipcSend('plugin-quickpick-response', { requestId, value: null });
            cleanup();
        }
    }
    window.addEventListener('keydown', onKeyDown, true);

    // 清理函数
    function cleanup() {
        if (container.parentNode) container.parentNode.removeChild(container);
        if (mask.parentNode) mask.parentNode.removeChild(mask);
        window.removeEventListener('keydown', onKeyDown, true);
    }

    // 设置焦点（容器本身不焦点，依靠键盘事件）
    container.focus();
};

// 监听主进程请求弹出 QuickPick
window.electronAPI.ipcOn('plugin-show-quickpick', (event, { items, options, requestId }) => {
    window.createQuickPick(items, options, requestId);
});

// 动态创建 Information Message 消息弹窗并通过 IPC 发送结果
window.createInformationMessage = function(message, options, requestId) {
    // 防止重复创建
    if (document.getElementById('electron-plugin-informationmessage-mask')) return;

    // 遮罩
    const mask = document.createElement('div');
    mask.id = 'electron-plugin-informationmessage-mask';
    mask.style.position = 'fixed';
    mask.style.top = 0;
    mask.style.left = 0;
    mask.style.width = '100vw';
    mask.style.height = '100vh';
    mask.style.background = 'rgba(0,0,0,0.35)';
    mask.style.zIndex = 9998;
    mask.style.display = 'block';
    document.body.appendChild(mask);

    // 消息容器
    const container = document.createElement('div');
    container.id = 'electron-plugin-informationmessage';
    container.style.background = '#444';
    container.style.color = '#fff';
    container.style.border = 'none';
    container.style.outline = 'none';
    container.style.borderRadius = '6px';
    container.style.boxShadow = '0 8px 32px 0 rgba(0,0,0,0.32)';
    container.style.fontSize = '16px';
    container.style.fontFamily = 'inherit';
    container.style.width = '320px';
    container.style.padding = '16px';
    container.style.zIndex = 9999;
    container.style.position = 'fixed';
    container.style.left = '50%';
    container.style.top = '80px';
    container.style.transform = 'translateX(-50%)';
    mask.appendChild(container);

    // 消息内容
    const messageText = document.createElement('div');
    messageText.textContent = message;
    messageText.style.marginBottom = '16px';
    container.appendChild(messageText);

    // 如果有详细信息并且是模态消息，添加详细信息
    if (options && options.modal && options.detail) {
        const detailText = document.createElement('div');
        detailText.textContent = options.detail;
        detailText.style.marginBottom = '16px';
        detailText.style.color = '#bbb';
        detailText.style.fontSize = '14px';
        container.appendChild(detailText);
    }

    // 确认按钮
    const button = document.createElement('button');
    button.textContent = 'OK';
    button.style.background = '#1565C0';
    button.style.color = '#fff';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.padding = '8px 16px';
    button.style.cursor = 'pointer';
    button.style.transition = 'background 0.2s';
    button.onmouseover = function() {
        button.style.background = '#104d8e';
    };
    button.onmouseout = function() {
        button.style.background = '#1565C0';
    };
    button.onclick = function() {
        window.electronAPI.ipcSend('plugin-informationmessage-response', { requestId, value: 'OK' });
        cleanup();
    };
    container.appendChild(button);

    // 键盘事件处理
    function onKeyDown(e) {
        if (e.key === 'Enter' || e.key === 'Escape') {
            window.electronAPI.ipcSend('plugin-informationmessage-response', { requestId, value: 'OK' });
            cleanup();
        }
    }
    window.addEventListener('keydown', onKeyDown, true);

    // 清理函数
    function cleanup() {
        if (container.parentNode) container.parentNode.removeChild(container);
        if (mask.parentNode) mask.parentNode.removeChild(mask);
        window.removeEventListener('keydown', onKeyDown, true);
    }

    // 设置焦点到按钮
    button.focus();
};

// 监听主进程请求弹出 Information Message
window.electronAPI.ipcOn('plugin-show-informationmessage', (event, { message, options, requestId }) => {
    window.createInformationMessage(message, options || {}, requestId);
});
