class Command {
    constructor(id, title, category = '') {
        this.id = id;
        this.title = title;
        this.category = category;
    }
}

class CommandManager {
    constructor() {
        this.commands = new Map();
    }

    registerCommand(id, title, category, action) {
        console.log('Registering command:', { id, title, category });
        if (this.commands.has(id)) {
            console.warn(`Command ${id} already registered`);
            return;
        }

        const command = new Command(id, title, category);
        this.commands.set(id, { command, action });
    }

    unregisterCommand(id) {
        if (!this.commands.has(id)) {
            console.warn(`Command ${id} not found`);
            return;
        }

        this.commands.delete(id);
    }

    executeCommand(id) {
        console.log('Executing command:', id);
        const cmd = this.commands.get(id);
        if (!cmd) {
            console.error(`Command ${id} not found`);
            return;
        }

        try {
            cmd.action();
        } catch (error) {
            console.error('Error executing command:', error);
        }
    }

    getAllCommands() {
        return Array.from(this.commands.values()).map(({ command }) => command);
    }

    searchCommands(query) {
        if (!query) {
            return this.getAllCommands();
        }

        query = query.toLowerCase();
        return this.getAllCommands().filter(cmd => 
            cmd.title.toLowerCase().includes(query) ||
            cmd.category.toLowerCase().includes(query)
        );
    }
}

module.exports = { CommandManager, Command };
