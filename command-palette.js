class CommandPalette {
    constructor() {
        this.commands = [
            { id: 'open-file', title: '打开文件', action: () => showOpenFileDialog() },
            { id: 'reload-file', title: '重新加载文件', action: () => window.electronAPI.reloadCurrentFile() },
            { id: 'save-filter', title: '保存过滤配置', action: () => applyFilters() },
            { id: 'load-filter', title: '加载过滤配置', action: () => window.electronAPI.onFilterLoadConfig() },
            { id: 'show-in-folder', title: '在文件夹中显示', action: () => window.electronAPI.showItemInFolder(currentFilePath) },
            { id: 'open-plugin-manager', title: '打开插件管理器', action: () => window.electronAPI.openPluginManager() }
        ].sort((a, b) => a.title.localeCompare(b.title));

        this.palette = document.getElementById('commandPalette');
        this.overlay = document.getElementById('commandOverlay');
        this.input = document.getElementById('commandInput');
        this.list = document.getElementById('commandList');
        this.selectedIndex = -1;

        this.setupEventListeners();
        this.renderCommands();
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'P') {
                e.preventDefault();
                this.show();
            } else if (e.key === 'Escape' && this.isVisible()) {
                this.hide();
            }
        });

        this.input.addEventListener('input', () => {
            this.filterCommands();
        });

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

        this.overlay.addEventListener('click', () => this.hide());
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

    filterCommands() {
        const query = this.input.value.toLowerCase();
        const filtered = this.commands.filter(cmd => 
            cmd.title.toLowerCase().includes(query)
        );
        this.renderCommands(filtered);
        this.selectedIndex = filtered.length > 0 ? 0 : -1;
        this.updateSelection();
    }

    renderCommands(commands = this.commands) {
        this.list.innerHTML = '';
        commands.forEach((cmd, index) => {
            const item = document.createElement('div');
            item.className = 'command-item';
            item.textContent = cmd.title;
            item.addEventListener('click', () => {
                this.selectedIndex = index;
                this.executeSelected();
            });
            this.list.appendChild(item);
        });
        this.updateSelection();
    }

    selectNext() {
        const items = this.list.children;
        if (items.length === 0) return;
        this.selectedIndex = (this.selectedIndex + 1) % items.length;
        this.updateSelection();
    }

    selectPrevious() {
        const items = this.list.children;
        if (items.length === 0) return;
        this.selectedIndex = this.selectedIndex <= 0 ? items.length - 1 : this.selectedIndex - 1;
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

    executeSelected() {
        const items = this.list.children;
        if (this.selectedIndex >= 0 && this.selectedIndex < items.length) {
            const filteredCommands = this.commands.filter(cmd =>
                cmd.title.toLowerCase().includes(this.input.value.toLowerCase())
            );
            const command = filteredCommands[this.selectedIndex];
            if (command) {
                this.hide();
                command.action();
            }
        }
    }
}

// Initialize Command Palette after the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.commandPalette = new CommandPalette();
});
