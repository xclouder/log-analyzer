// 在渲染进程中，我们通过 window.electronAPI 获取功能
const PluginAPI = window.electronAPI;

class Disposable {
    constructor(disposeAction) {
        this.disposeAction = disposeAction;
    }
    dispose() {
        this.disposeAction();
    }
}

class Command {
    constructor(id, title, action) {
        this.id = id;
        this.title = title;
        this.action = action;
    }
}

class CommandPalette {
    constructor() {
        // 获取DOM元素
        this.palette = document.getElementById('commandPalette');
        this.overlay = document.getElementById('commandOverlay');
        this.input = document.getElementById('commandInput');
        this.list = document.getElementById('commandList');

        // 检查DOM元素是否存在
        if (!this.palette || !this.overlay || !this.input || !this.list) {
            console.error('Command palette DOM elements not found');
            return;
        }

        this.selectedIndex = -1;
        this.filteredCommands = [];
        
        this.setupEventListeners();
        console.log('Command palette initialized');
    }

    setupEventListeners() {
        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'P') {
                e.preventDefault();
                this.show();
            } else if (e.key === 'Escape' && this.isVisible()) {
                this.hide();
            }
        });

        // 输入框事件
        this.input.addEventListener('input', () => {
            this.filterCommands();
        });

        // 键盘导航
        this.input.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    this.selectNext();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.selectPrevious();
                    break;
                case 'Enter':
                    e.preventDefault();
                    this.executeSelected();
                    break;
            }
        });

        // 点击遮罩层关闭
        this.overlay.addEventListener('click', () => this.hide());

        // 监听命令变化
        window.electronAPI.onCommandRegister(() => {
            console.log('Commands updated');
            this.filterCommands();
        });

        window.electronAPI.onCommandUnregister(() => {
            console.log('Commands updated');
            this.filterCommands();
        });
    }

    show() {
        this.palette.classList.add('show');
        this.overlay.classList.add('show');
        this.input.value = '';
        this.input.focus();
        this.filterCommands();
    }

    hide() {
        this.palette.classList.remove('show');
        this.overlay.classList.remove('show');
        this.selectedIndex = -1;
    }

    isVisible() {
        return this.palette.classList.contains('show');
    }

    async filterCommands() {
        const query = this.input.value;
        this.filteredCommands = await window.electronAPI.searchCommands(query);
        this.renderCommands();
        this.selectedIndex = this.filteredCommands.length > 0 ? 0 : -1;
        this.updateSelection();
    }

    renderCommands() {
        if (!this.list) {
            console.error('Command list element not found');
            return;
        }

        this.list.innerHTML = '';
        this.filteredCommands.forEach((cmd, index) => {
            const item = document.createElement('div');
            item.className = 'command-item';
            
            const title = document.createElement('span');
            title.textContent = cmd.title;
            item.appendChild(title);

            if (cmd.category) {
                const category = document.createElement('span');
                category.className = 'command-category';
                category.textContent = cmd.category;
                item.appendChild(category);
            }

            item.addEventListener('click', () => {
                this.selectedIndex = index;
                this.executeSelected();
            });
            
            this.list.appendChild(item);
        });
        this.updateSelection();
    }

    selectNext() {
        if (this.filteredCommands.length === 0) return;
        this.selectedIndex = (this.selectedIndex + 1) % this.filteredCommands.length;
        this.updateSelection();
    }

    selectPrevious() {
        if (this.filteredCommands.length === 0) return;
        this.selectedIndex = (this.selectedIndex - 1 + this.filteredCommands.length) % this.filteredCommands.length;
        this.updateSelection();
    }

    updateSelection() {
        const items = this.list.children;
        Array.from(items).forEach((item, index) => {
            item.classList.toggle('selected', index === this.selectedIndex);
        });

        if (this.selectedIndex >= 0) {
            const selected = items[this.selectedIndex];
            if (selected) {
                selected.scrollIntoView({ block: 'nearest' });
            }
        }
    }

    async executeSelected() {
        if (this.selectedIndex >= 0 && this.selectedIndex < this.filteredCommands.length) {
            const command = this.filteredCommands[this.selectedIndex];
            console.log('Executing command:', command.id);
            this.hide();
            await window.electronAPI.executeCommand(command.id);
        }
    }
}

// Initialize Command Palette after the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.commandPalette = new CommandPalette();
});
