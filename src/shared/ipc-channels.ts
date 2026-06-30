/**
 * All IPC channel name constants.
 * Centralizing channel names prevents typos and makes refactoring easier.
 */

// File operations (renderer → main, invoke)
export const IPC_FILE_OPEN = 'file:open';
export const IPC_FILE_STATS = 'file:stats';
export const IPC_FILE_RELOAD = 'file:reload';
export const IPC_FILE_READ_BY_TIMESTAMP = 'file:read-by-timestamp';

// Dialog operations (renderer → main, invoke)
export const IPC_DIALOG_OPEN_FILE = 'dialog:openFile';
export const IPC_DIALOG_SAVE_FILE = 'dialog:saveFile';

// Filter operations
export const IPC_FILTER_IMPORT = 'filter:import';
export const IPC_FILTER_SAVE_CONFIG = 'filter:save-config';

// Plugin management (renderer → main, invoke)
export const IPC_PLUGIN_LIST = 'plugin:list';
export const IPC_PLUGIN_INSTALL = 'plugin:install';
export const IPC_PLUGIN_UNINSTALL = 'plugin:uninstall';

// Command system (renderer → main, invoke)
export const IPC_COMMAND_SEARCH = 'command:search';
export const IPC_COMMAND_LIST = 'command:list';
export const IPC_COMMAND_EXECUTE = 'command:execute';

// App state (renderer → main, invoke)
export const IPC_GET_CURRENT_FILE_PATH = 'get-current-file-path';

// Plugin UI dialogs (main → renderer, send)
export const IPC_PLUGIN_SHOW_INPUTBOX = 'plugin-show-inputbox';
export const IPC_PLUGIN_SHOW_QUICKPICK = 'plugin-show-quickpick';
export const IPC_PLUGIN_SHOW_INFORMATION = 'plugin-show-informationmessage';
export const IPC_PLUGIN_SHOW_ERROR = 'plugin-show-errormessage';

// Plugin UI dialog responses (renderer → main, send)
export const IPC_PLUGIN_INPUTBOX_RESPONSE = 'plugin-inputbox-response';
export const IPC_PLUGIN_QUICKPICK_RESPONSE = 'plugin-quickpick-response';
export const IPC_PLUGIN_INFORMATION_RESPONSE = 'plugin-informationmessage-response';
export const IPC_PLUGIN_ERROR_RESPONSE = 'plugin-errormessage-response';

// Plugin file open (bidirectional)
export const IPC_PLUGIN_OPEN_FILE = 'plugin:open-file';      // main → renderer (send)
export const IPC_PLUGIN_OPEN_FILE_REQUEST = 'plugin-open-file-request'; // renderer → main (send)
export const IPC_PLUGIN_OPEN_FILE_RESPONSE = 'plugin-openfile-response'; // main → renderer (send)

// Download progress (main → renderer, send)
export const IPC_DOWNLOAD_PROGRESS = 'download:progress';
export const IPC_DOWNLOAD_COMPLETE = 'download:complete';
export const IPC_DOWNLOAD_ERROR = 'download:error';

// Menu events (main → renderer, send)
export const IPC_MENU_OPEN_FILE = 'menu:open-file';
export const IPC_MENU_RELOAD_FILE = 'menu:reload-file';
export const IPC_MENU_SHOW_IN_FOLDER = 'menu:show-in-folder';

// Filter dialog events (main → renderer, send)
export const IPC_FILTER_SAVE_CONFIG_DIALOG = 'filter:save-config-dialog';
export const IPC_FILTER_LOAD = 'filter:load';

// Command updates (main → renderer, send)
export const IPC_COMMAND_REGISTER = 'command:register';
export const IPC_COMMAND_UNREGISTER = 'command:unregister';

// Dev/misc (renderer → main, send)
export const IPC_SHOW_ITEM_IN_FOLDER = 'show-item-in-folder';
export const IPC_OPEN_USER_PLUGINS_DIR = 'open-user-plugins-dir';
export const IPC_TOGGLE_LOGGING = 'toggle-logging';

// Editor window (main → renderer, send)
export const IPC_SET_CONTENT = 'set-content';
export const IPC_CONTENT_CHANGED = 'content-changed';

// Window controls (renderer → main, send/invoke)
export const IPC_WINDOW_MINIMIZE = 'window-minimize';
export const IPC_WINDOW_MAXIMIZE = 'window-maximize';
export const IPC_WINDOW_CLOSE = 'window-close';
export const IPC_WINDOW_IS_MAXIMIZED = 'window-is-maximized';

// Menu save file (main → renderer, send)
export const IPC_MENU_SAVE_FILE = 'menu:save-file';

// Configuration system (renderer → main, invoke)
export const IPC_CONFIG_GET_ALL = 'config:getAll';
export const IPC_CONFIG_SET_VALUE = 'config:setValue';
export const IPC_CONFIG_RESET_VALUE = 'config:resetValue';

// Editor context menu (bidirectional)
export const IPC_EDITOR_GET_SELECTED_TEXT = 'editor:getSelectedText';
export const IPC_EDITOR_REGISTER_CONTEXT_MENU = 'editor:registerContextMenu';
export const IPC_EDITOR_UNREGISTER_CONTEXT_MENU = 'editor:unregisterContextMenu';
export const IPC_EDITOR_CONTEXT_MENU_ACTION = 'editor:contextMenuAction';
