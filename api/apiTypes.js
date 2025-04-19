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