/**
 * Options to configure the behavior of the input box UI.
 */
class InputBoxOptions {
    /**
     * @param {Object} options
     * @param {boolean} [options.ignoreFocusOut]
     * @param {boolean} [options.password]
     * @param {string} [options.placeHolder]
     * @param {string} [options.prompt]
     * @param {string} [options.title]
     * @param {string} [options.value]
     * @param {[number, number]} [options.valueSelection]
     */
    constructor(options = {}) {
        this.ignoreFocusOut = options.ignoreFocusOut;
        this.password = options.password;
        this.placeHolder = options.placeHolder;
        this.prompt = options.prompt;
        this.title = options.title;
        this.value = options.value;
        this.valueSelection = options.valueSelection;
    }
}

/**
 * Options to configure the behavior of the quick pick UI.
 *
 * Events:
 *   onDidSelectItem(item: string | QuickPickItem): any
 *
 * Properties:
 *   canPickMany?: boolean
 *   ignoreFocusOut?: boolean
 *   matchOnDescription?: boolean
 *   matchOnDetail?: boolean
 *   placeHolder?: string
 *   title?: string
 */
class QuickPickOptions {
    /**
     * @param {Object} options
     * @param {boolean} [options.canPickMany]
     * @param {boolean} [options.ignoreFocusOut]
     * @param {boolean} [options.matchOnDescription]
     * @param {boolean} [options.matchOnDetail]
     * @param {string} [options.placeHolder]
     * @param {string} [options.title]
     * @param {(item: string|QuickPickItem)=>any} [options.onDidSelectItem]
     */
    constructor(options = {}) {
        this.canPickMany = options.canPickMany;
        this.ignoreFocusOut = options.ignoreFocusOut;
        this.matchOnDescription = options.matchOnDescription;
        this.matchOnDetail = options.matchOnDetail;
        this.placeHolder = options.placeHolder;
        this.title = options.title;
        this.onDidSelectItem = typeof options.onDidSelectItem === 'function' ? options.onDidSelectItem : undefined;
    }
}