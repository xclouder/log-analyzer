// Mock for Electron in Jest tests
const app = {
  getPath: jest.fn((name: string) => {
    if (name === 'userData') return '/tmp/test-userData';
    if (name === 'cache') return '/tmp/test-cache';
    return '/tmp';
  }),
  getVersion: jest.fn(() => '1.0.0'),
  isPackaged: false,
};

const ipcMain = {
  handle: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  removeHandler: jest.fn(),
};

const ipcRenderer = {
  invoke: jest.fn(),
  send: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
};

const BrowserWindow = jest.fn().mockImplementation(() => ({
  loadFile: jest.fn(),
  webContents: {
    send: jest.fn(),
    openDevTools: jest.fn(),
  },
  on: jest.fn(),
  setTitle: jest.fn(),
  setMenu: jest.fn(),
  focus: jest.fn(),
  isDestroyed: jest.fn(() => false),
  close: jest.fn(),
}));

BrowserWindow.getAllWindows = jest.fn(() => []);
BrowserWindow.fromWebContents = jest.fn();

const dialog = {
  showOpenDialog: jest.fn(),
  showSaveDialog: jest.fn(),
  showMessageBox: jest.fn(),
  showErrorBox: jest.fn(),
};

const shell = {
  showItemInFolder: jest.fn(),
  openPath: jest.fn(),
};

const contextBridge = {
  exposeInMainWorld: jest.fn(),
};

const Menu = {
  buildFromTemplate: jest.fn(),
  setApplicationMenu: jest.fn(),
};

export {
  app,
  ipcMain,
  ipcRenderer,
  BrowserWindow,
  dialog,
  shell,
  contextBridge,
  Menu,
};
