#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const program = new Command();

program
  .name('log-analyzer-plugin')
  .description('CLI tool for LogAnalyzer plugin development')
  .version('1.0.0');

program
  .command('init')
  .description('Scaffold a new plugin project')
  .action(async () => {
    const { init } = require('../lib/init');
    await init();
  });

program
  .command('build')
  .description('Build current plugin directory into a .zip file')
  .option('-o, --output <path>', 'Output zip file path')
  .action(async (options) => {
    const { build } = require('../lib/build');
    await build(options);
  });

program
  .command('install <plugin-path>')
  .description('Install a plugin .zip into ~/.log-analyzer/plugins/')
  .action(async (pluginPath) => {
    const { install } = require('../lib/install');
    await install({ pluginPath });
  });

program.parse(process.argv);
