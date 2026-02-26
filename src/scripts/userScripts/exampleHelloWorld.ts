/**
 * Example: Hello World Script
 *
 * This is a simple example script that demonstrates the basic structure.
 */

export default {
    name: 'Hello World',
    description: 'A simple example script that greets the user',
    execute: async (api: any, log: (message: string) => void) => {
        log('I: Hello from the Jellyfin Scripts system!');
        log('I: This is a basic example script.');

        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 1000));

        log('I: Current server time: ' + new Date().toLocaleString());
    }
};
