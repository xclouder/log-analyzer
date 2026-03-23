/**
 * command-palette.ts - Command palette UI for LogAnalyzer.
 *
 * Provides a VSCode-style command palette (Ctrl+Shift+P) that allows
 * users to search for and execute registered plugin commands.
 *
 * Uses window.electronAPI to search and execute commands via IPC.
 */

// IDisposable inlined to avoid `import type` which causes `exports` preamble.
interface IDisposable { dispose(): void; }

// Re-implement Disposable locally since renderer can't use require()
class Disposable implements IDisposable {
  private disposed = false;
  private readonly disposeAction: () => void;
  constructor(disposeAction: () => void) { this.disposeAction = disposeAction; }
  dispose(): void {
    if (!this.disposed) { this.disposed = true; this.disposeAction(); }
  }
}

interface CommandEntry {
  id: string;
  title: string;
  category?: string;
}

class CommandPalette {
  private readonly palette: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly list: HTMLElement;

  private selectedIndex: number = -1;
  private filteredCommands: CommandEntry[] = [];

  constructor() {
    const palette = document.getElementById('commandPalette');
    const overlay = document.getElementById('commandOverlay');
    const input = document.getElementById('commandInput');
    const list = document.getElementById('commandList');

    if (!palette || !overlay || !input || !list) {
      console.error('Command palette DOM elements not found');
      // Assign dummy elements to satisfy TS – constructor bails out below
      this.palette = document.createElement('div');
      this.overlay = document.createElement('div');
      this.input = document.createElement('input') as HTMLInputElement;
      this.list = document.createElement('div');
      return;
    }

    this.palette = palette;
    this.overlay = overlay;
    this.input = input as HTMLInputElement;
    this.list = list;

    this.setupEventListeners();
    console.log('Command palette initialized');
  }

  private setupEventListeners(): void {
    // Keyboard shortcut: Ctrl+Shift+P to open
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        this.show();
      } else if (e.key === 'Escape' && this.isVisible()) {
        this.hide();
      }
    });

    // Filter on input change
    this.input.addEventListener('input', () => {
      void this.filterCommands();
    });

    // Keyboard navigation within the input
    this.input.addEventListener('keydown', (e: KeyboardEvent) => {
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
          void this.executeSelected();
          break;
      }
    });

    // Click on overlay to close
    this.overlay.addEventListener('click', () => this.hide());

    // Listen for command registry changes (main → renderer)
    window.electronAPI.onCommandRegister(() => {
      console.log('Commands updated (registered)');
      void this.filterCommands();
    });

    window.electronAPI.onCommandUnregister(() => {
      console.log('Commands updated (unregistered)');
      void this.filterCommands();
    });
  }

  show(): void {
    this.palette.classList.add('show');
    this.overlay.classList.add('show');
    this.input.value = '';
    this.input.focus();
    void this.filterCommands();
  }

  hide(): void {
    this.palette.classList.remove('show');
    this.overlay.classList.remove('show');
    this.selectedIndex = -1;
  }

  isVisible(): boolean {
    return this.palette.classList.contains('show');
  }

  private async filterCommands(): Promise<void> {
    const query = this.input.value;
    this.filteredCommands = await window.electronAPI.searchCommands(query);
    this.renderCommands();
    this.selectedIndex = this.filteredCommands.length > 0 ? 0 : -1;
    this.updateSelection();
  }

  private renderCommands(): void {
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
        void this.executeSelected();
      });

      this.list.appendChild(item);
    });

    this.updateSelection();
  }

  private selectNext(): void {
    if (this.filteredCommands.length === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % this.filteredCommands.length;
    this.updateSelection();
  }

  private selectPrevious(): void {
    if (this.filteredCommands.length === 0) return;
    this.selectedIndex = (this.selectedIndex - 1 + this.filteredCommands.length) % this.filteredCommands.length;
    this.updateSelection();
  }

  private updateSelection(): void {
    const items = this.list.children;
    Array.from(items).forEach((item, index) => {
      item.classList.toggle('selected', index === this.selectedIndex);
    });

    if (this.selectedIndex >= 0) {
      const selected = items[this.selectedIndex] as HTMLElement | undefined;
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  private async executeSelected(): Promise<void> {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.filteredCommands.length) {
      const command = this.filteredCommands[this.selectedIndex];
      console.log('Executing command:', command.id);
      this.hide();
      await window.electronAPI.executeCommand(command.id);
    }
  }
}

// Initialise after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  (window as any).commandPalette = new CommandPalette(); // exposed for external access
});
