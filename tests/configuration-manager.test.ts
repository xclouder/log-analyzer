import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { ConfigurationManager } from '../src/main/configuration-manager';

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
  };
});

const openLogManifest = require('../src/plugins/openlog-from-url/package.json');

describe('ConfigurationManager plugin settings', () => {
  const userDataDir = app.getPath('userData');
  const settingsFile = path.join(userDataDir, 'settings.json');

  beforeEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  it('exposes OpenLogFromUrl downloader path as a plugin setting with manifest default', () => {
    const manager = new ConfigurationManager();
    manager.init();
    manager.registerPluginConfiguration(
      openLogManifest.name,
      openLogManifest.contributes.configuration,
    );

    const sections = manager.getAllConfigurationForUI();
    const openLogSection = sections.find((section) => section.pluginName === 'openlog-from-url');
    const downloaderPath = openLogSection?.properties.find(
      (property) => property.key === 'openLogFromUrl.cosLogDownloaderPath',
    );

    expect(downloaderPath?.value).toBe('E:\\CosLogDownloader.exe');
    expect(downloaderPath?.isDefault).toBe(true);
  });

  it('persists edited downloader path to settings.json', async () => {
    const manager = new ConfigurationManager();
    manager.init();
    manager.registerPluginConfiguration(
      openLogManifest.name,
      openLogManifest.contributes.configuration,
    );

    await manager.setValue('openLogFromUrl.cosLogDownloaderPath', 'D:\\Tools\\CosLogDownloader.exe');

    const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    expect(saved).toEqual({
      'openLogFromUrl.cosLogDownloaderPath': 'D:\\Tools\\CosLogDownloader.exe',
    });
  });
});
