/**
 * Example: Hello World Script
 *
 * This is a simple example script that demonstrates the basic structure.
 */

import type { ScriptContext } from '../types/ScriptContext';

export default {
    name: 'Hello World',
    description: 'A simple example script that greets the user',
    isExample: true,
    execute: async (context: ScriptContext) => {
        context.log('I: Hello from the Jellyfin Scripts system!');
        context.log('I: This is a basic example script.');

        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 1000));

        context.log('I: Current server time: ' + new Date().toLocaleString());
    }
};
