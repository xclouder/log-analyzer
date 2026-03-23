import { CommandManager } from '../src/main/command-manager';

// The logger mock must be created inside jest.mock() factory (hoisted before imports).
// We retrieve the same instance through the mocked module.
jest.mock('../src/main/log-util', () => {
  const logger = {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
  return {
    __esModule: true,
    getLogger: jest.fn(() => logger),
    configureLogger: jest.fn(),
    shutdown: jest.fn(),
    // Expose for test access
    _mockLogger: logger,
  };
});

// Retrieve the mock logger after jest.mock has been set up
import * as logUtil from '../src/main/log-util';
const mockLogger = (logUtil as any)._mockLogger as {
  warn: jest.Mock;
  error: jest.Mock;
  info: jest.Mock;
  debug: jest.Mock;
};

describe('CommandManager', () => {
  let manager: CommandManager;

  beforeEach(() => {
    manager = new CommandManager();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  // ─── Registration ───────────────────────────────────────────────────────────

  it('registers and retrieves a command', () => {
    manager.registerCommand('test.cmd', 'Test Command', 'Test', () => {});
    const cmds = manager.getAllCommands();
    expect(cmds).toHaveLength(1);
    expect(cmds[0].id).toBe('test.cmd');
    expect(cmds[0].title).toBe('Test Command');
    expect(cmds[0].category).toBe('Test');
  });

  it('warns and skips duplicate registration', () => {
    manager.registerCommand('test.cmd', 'Test', 'Cat', () => {});
    manager.registerCommand('test.cmd', 'Test2', 'Cat', () => {});
    expect(manager.getAllCommands()).toHaveLength(1);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('preserves first registration on duplicate', () => {
    manager.registerCommand('test.cmd', 'Original Title', 'Cat', () => {});
    manager.registerCommand('test.cmd', 'Different Title', 'Cat', () => {});
    expect(manager.getAllCommands()[0].title).toBe('Original Title');
  });

  it('registers multiple distinct commands', () => {
    manager.registerCommand('cmd.a', 'A', 'Cat', () => {});
    manager.registerCommand('cmd.b', 'B', 'Cat', () => {});
    manager.registerCommand('cmd.c', 'C', 'Cat', () => {});
    expect(manager.getAllCommands()).toHaveLength(3);
  });

  // ─── Unregistration ─────────────────────────────────────────────────────────

  it('unregisters a command', () => {
    manager.registerCommand('test.cmd', 'Test', 'Cat', () => {});
    manager.unregisterCommand('test.cmd');
    expect(manager.getAllCommands()).toHaveLength(0);
  });

  it('warns when unregistering a non-existent command', () => {
    manager.unregisterCommand('does.not.exist');
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('unregistering one command does not affect others', () => {
    manager.registerCommand('cmd.a', 'A', 'Cat', () => {});
    manager.registerCommand('cmd.b', 'B', 'Cat', () => {});
    manager.unregisterCommand('cmd.a');
    expect(manager.getAllCommands()).toHaveLength(1);
    expect(manager.getAllCommands()[0].id).toBe('cmd.b');
  });

  // ─── Execution ──────────────────────────────────────────────────────────────

  it('executes a registered command', () => {
    const action = jest.fn();
    manager.registerCommand('test.cmd', 'Test', 'Cat', action);
    manager.executeCommand('test.cmd');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('logs error for unknown command execution', () => {
    manager.executeCommand('nonexistent');
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('does not throw when executing command that throws', () => {
    manager.registerCommand('bad.cmd', 'Bad', 'Test', () => {
      throw new Error('boom');
    });
    expect(() => manager.executeCommand('bad.cmd')).not.toThrow();
  });

  it('logs the error when the action throws', () => {
    manager.registerCommand('bad.cmd', 'Bad', 'Test', () => {
      throw new Error('boom');
    });
    manager.executeCommand('bad.cmd');
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('executes only the intended command when multiple are registered', () => {
    const actionA = jest.fn();
    const actionB = jest.fn();
    manager.registerCommand('cmd.a', 'A', 'Cat', actionA);
    manager.registerCommand('cmd.b', 'B', 'Cat', actionB);
    manager.executeCommand('cmd.a');
    expect(actionA).toHaveBeenCalledTimes(1);
    expect(actionB).not.toHaveBeenCalled();
  });

  // ─── Search ─────────────────────────────────────────────────────────────────

  it('searches commands by title (case-insensitive)', () => {
    manager.registerCommand('cmd1', 'Open File', 'File', () => {});
    manager.registerCommand('cmd2', 'Save File', 'File', () => {});
    manager.registerCommand('cmd3', 'Run Tests', 'Dev', () => {});

    const results = manager.searchCommands('file');
    expect(results).toHaveLength(2);
    expect(results.map((c) => c.id)).toContain('cmd1');
    expect(results.map((c) => c.id)).toContain('cmd2');
  });

  it('searches commands by category (case-insensitive)', () => {
    manager.registerCommand('cmd1', 'Open File', 'File Operations', () => {});
    manager.registerCommand('cmd2', 'Run', 'Developer', () => {});

    const results = manager.searchCommands('developer');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('cmd2');
  });

  it('returns all commands when query is empty', () => {
    manager.registerCommand('cmd1', 'A', 'Cat', () => {});
    manager.registerCommand('cmd2', 'B', 'Cat', () => {});
    expect(manager.searchCommands('')).toHaveLength(2);
  });

  it('returns empty array when nothing matches search query', () => {
    manager.registerCommand('cmd1', 'Open File', 'File', () => {});
    expect(manager.searchCommands('IMPOSSIBLEMATCH_XYZ')).toHaveLength(0);
  });

  it('search matches partial title substring', () => {
    manager.registerCommand('cmd1', 'OpenLogFromUrl', 'Log', () => {});
    const results = manager.searchCommands('FromUrl');
    expect(results).toHaveLength(1);
  });

  it('returns empty when no commands are registered and search is performed', () => {
    expect(manager.searchCommands('anything')).toHaveLength(0);
    expect(manager.searchCommands('')).toHaveLength(0);
  });

  // ─── getAllCommands ──────────────────────────────────────────────────────────

  it('getAllCommands returns empty array initially', () => {
    expect(manager.getAllCommands()).toEqual([]);
  });

  it('getAllCommands returns independent copy (no direct mutation risk)', () => {
    manager.registerCommand('cmd1', 'A', 'Cat', () => {});
    const first = manager.getAllCommands();
    manager.registerCommand('cmd2', 'B', 'Cat', () => {});
    // first snapshot should still have length 1
    expect(first).toHaveLength(1);
  });
});
