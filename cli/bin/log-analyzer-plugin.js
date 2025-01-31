#!/usr/bin/env node

const { program } = require('commander');
const { init } = require('../lib/init');
const { build } = require('../lib/build');
const { install } = require('../lib/install');

program
    .version('1.0.0')
    .description('CLI tool for creating and building Log Analyzer plugins');

program
    .command('init')
    .description('Initialize a new plugin project')
    .action(init);

program
    .command('build')
    .description('Build plugin into a zip file')
    .option('-o, --output <path>', 'output path for the zip file')
    .action(build);

program
    .command('install')
    .description('Install a plugin to Log Analyzer')
    .argument('<plugin-path>', 'path to the plugin zip file')
    .action((pluginPath) => install({ pluginPath }));

program.parse(process.argv);
