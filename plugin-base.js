
class Plugin {
    constructor(api) {
        this.api = api;
    }

    onActivate(context) {
        
    }

    onDeactivate(context) {
        
    }
    
    // 打开文件时预处理，可以在这里对文件预处理，返回新的文件路径
    async onPreOpenFile(filePath) {
        return filePath;
    }

    async onDidOpenFile(context) {
        
    }

    async onWillCloseFile(context) {

    }
}

module.exports = Plugin;