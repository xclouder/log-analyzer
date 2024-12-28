// 添加拖拽相关变量
let isDragging = false;
let currentX;
let initialWidth;

// 获取 DOM 元素
const divider = document.querySelector('.divider');
const leftEditor = document.getElementById('editor');

// 添加鼠标事件监听器
divider.addEventListener('mousedown', startDragging);
document.addEventListener('mousemove', handleDragging);
document.addEventListener('mouseup', stopDragging);

function startDragging(e) {
    isDragging = true;
    currentX = e.clientX;
    initialWidth = leftEditor.getBoundingClientRect().width;
}

function handleDragging(e) {
    if (!isDragging) return;

    const delta = e.clientX - currentX;
    const newWidth = initialWidth + delta;
    
    // 设置最小宽度限制
    if (newWidth > 200) {
        leftEditor.style.width = `${newWidth}px`;
        leftEditor.style.flex = 'none';
    }
}

function stopDragging() {
    isDragging = false;
    // 通知 Monaco Editor 更新布局
    if (editor && filteredEditor) {
        editor.layout();
        filteredEditor.layout();
    }
}