/**
 * Example: Test Script
 *
 * This script demonstrates all console features including the new context API
 * with user input, confirmation, skip, and fail capabilities.
 */

import type { ScriptContext } from '../types/ScriptContext';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default {
    name: 'Test Script (Interactive)',
    description: 'Interactive test demonstrating new context features: input, confirm, skip, fail',
    isExample: true,
    execute: async (context: ScriptContext) => {
        context.log('I: Starting interactive test script...');
        context.log('I: This demonstrates the new context-based API');
        context.log('');

        // Test basic logging
        await sleep(500);
        context.log('I: Testing info messages');
        context.log('S: Testing success messages');
        context.log('W: Testing warning messages');
        context.log('E: Testing error messages (non-fatal)');
        context.log('');

        // Test user confirmation
        await sleep(500);
        context.log('I: Testing confirmation feature...');
        const shouldContinue = await context.confirm('Do you want to continue with the test?');

        if (!shouldContinue) {
            context.skip('User chose not to continue');
            return;
        }

        context.log('S: User confirmed, continuing...');
        context.log('');

        // Test user input
        await sleep(500);
        context.log('I: Testing input feature...');
        const userName = await context.input('What is your name?');

        if (!userName) {
            context.fail('No name provided');
            return;
        }

        context.log(`S: Hello, ${userName}!`);
        context.log('');

        // Test another confirmation
        await sleep(500);
        const runLongTest = await context.confirm('Run a longer test (10 seconds)?');

        if (runLongTest) {
            context.log('I: Running extended test...');
            for (let i = 1; i <= 10; i++) {
                await sleep(1000);
                context.log(`I: Progress: ${i * 10}% complete (${i}/10 seconds)`);
            }
            context.log('S: Extended test complete!');
        } else {
            context.log('I: Skipping extended test');
        }

        context.log('');

        // Final choice
        await sleep(500);
        const finalChoice = await context.confirm('Mark this test as successful?');

        if (finalChoice) {
            context.log('S: Test completed successfully!');
            context.log(`I: Thank you for testing, ${userName}!`);
        } else {
            context.fail('User chose to fail the test');
        }
    }
};
