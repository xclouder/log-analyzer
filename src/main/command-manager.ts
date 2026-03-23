/**
 * CommandManager: registry for named commands that can be executed by the command palette.
 * Commands are registered by plugins and the core app. The renderer can search and execute them.
 */

import { getLogger } from './log-util';

const logger = getLogger('CommandManager');

export interface Command {
  id: string;
  title: string;
  category: string;
}

interface CommandEntry {
  command: Command;
  action: () => void;
}

export class CommandManager {
  private commands = new Map<string, CommandEntry>();

  /** Register a command. Warns if already registered. */
  registerCommand(id: string, title: string, category: string, action: () => void): void {
    if (this.commands.has(id)) {
      logger.warn(`Command already registered: ${id}`);
      return;
    }
    this.commands.set(id, { command: { id, title, category }, action });
  }

  /** Remove a registered command. */
  unregisterCommand(id: string): void {
    if (!this.commands.has(id)) {
      logger.warn(`Command not found: ${id}`);
      return;
    }
    this.commands.delete(id);
  }

  /** Execute a registered command by ID. */
  executeCommand(id: string): void {
    const entry = this.commands.get(id);
    if (!entry) {
      logger.error(`Command not found: ${id}`);
      return;
    }
    try {
      entry.action();
    } catch (error) {
      logger.error(`Error executing command ${id}:`, error);
    }
  }

  /** Return all registered commands. */
  getAllCommands(): Command[] {
    return Array.from(this.commands.values()).map((e) => e.command);
  }

  /** Search commands by title or category (case-insensitive). Empty query returns all. */
  searchCommands(query: string): Command[] {
    if (!query) return this.getAllCommands();
    const q = query.toLowerCase();
    return this.getAllCommands().filter(
      (cmd) =>
        cmd.title.toLowerCase().includes(q) || cmd.category.toLowerCase().includes(q),
    );
  }
}
