import log4js from 'log4js';
import * as path from 'path';
import * as fs from 'fs';

let configured = false;

/**
 * Configure log4js once. Must be called after app is ready (so userData path is available).
 */
export function configureLogger(userDataPath: string): void {
  if (configured) return;
  configured = true;

  const logPath = path.join(userDataPath, 'logs');
  if (!fs.existsSync(logPath)) {
    fs.mkdirSync(logPath, { recursive: true });
  }

  log4js.configure({
    appenders: {
      console: {
        type: 'console',
        layout: {
          type: 'pattern',
          pattern: '%[[%d{yyyy-MM-dd hh:mm:ss.SSS}] [%p] %c%] - %m',
        },
      },
      file: {
        type: 'dateFile',
        filename: path.join(logPath, 'loganalyzer.log'),
        pattern: 'yyyy-MM-dd',
        keepFileExt: true,
        compress: true,
        alwaysIncludePattern: true,
        layout: {
          type: 'pattern',
          pattern: '[%d{yyyy-MM-dd hh:mm:ss.SSS}] [%p] [%c] - %m',
        },
      },
    },
    categories: {
      default: { appenders: ['console', 'file'], level: 'debug', enableCallStack: true },
      Main: { appenders: ['console', 'file'], level: 'debug' },
      PluginManager: { appenders: ['console', 'file'], level: 'debug' },
      CommandPalette: { appenders: ['console', 'file'], level: 'debug' },
    },
  });
}

export function getLogger(category = 'default'): log4js.Logger {
  return log4js.getLogger(category);
}

export function shutdown(): Promise<void> {
  return new Promise((resolve) => log4js.shutdown(() => resolve()));
}
