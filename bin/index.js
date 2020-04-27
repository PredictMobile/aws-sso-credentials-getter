#!/usr/bin/env node

// Delete the 0 and 1 argument (node and script.js)
const args = process.argv.splice(process.execArgv.length + 2);

// Retrieve the first argument
const profile = args[0];

import SetCreds from '../lib/index.js';

// Displays the text in the console
SetCreds(profile);