const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class TikiStarLogDecoderPlugin {
    constructor(api) {
        this.api = api;
        this.id = 'tikistar-log-decoder';
        this.decoderPath = path.join(__dirname, 'assets', 'LogDecoder.exe');
    }

    async activate() {
        // Check if decoder exists
        if (!fs.existsSync(this.decoderPath)) {
            console.error('LogDecoder.exe not found in assets directory');
            return;
        }
    }

    async processFile(filePath, content) {
        // Only process .encoded.log files
        if (!filePath.endsWith('.encoded.log')) {
            return filePath;
        }

        // Generate output path by removing 'encoded.' from the filename
        const outputPath = filePath.replace('.encoded.log', '.log');

        try {
            // Delete existing output file if it exists
            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }

            // Run decoder
            await execAsync(`"${this.decoderPath}" "${filePath}" "${outputPath}"`);

            // Verify the output file exists
            if (!fs.existsSync(outputPath)) {
                throw new Error('Decoder failed to create output file');
            }

            // Return the path of the decoded file
            return outputPath;
        } catch (error) {
            console.error('Error decoding log file:', error);
            throw error;
        }
    }

    async deactivate() {
        // Cleanup if needed
    }
}

module.exports = TikiStarLogDecoderPlugin;
