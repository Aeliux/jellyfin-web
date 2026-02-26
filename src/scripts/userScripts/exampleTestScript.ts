/**
 * Example: Test Script
 *
 * This script demonstrates all console features by running for 20 seconds
 * with various message types and lengths, then failing at the end.
 */

import type { Api } from '@jellyfin/sdk';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default {
    name: 'Test Script (20s Failure)',
    description: 'Runs for 20 seconds with various outputs, then fails - tests all console features',
    isExample: true,
    execute: async (api: Api, log: (message: string) => void) => {
        log('I: Starting comprehensive test script...');
        log('I: This will run for 20 seconds and then fail intentionally');
        log('');

        // Second 1-5: Basic messages
        await sleep(1000);
        log('I: Testing info messages');
        log('S: Testing success messages');
        log('W: Testing warning messages');
        log('E: Testing error messages (non-fatal)');

        await sleep(1000);
        log('');
        log('I: Testing short message');

        await sleep(1000);
        log('I: Testing medium length message with some additional information to demonstrate text wrapping');

        await sleep(1000);
        log('I: Testing a very long message that contains a lot of text to properly demonstrate the word wrapping functionality in the console output area and how it handles extensive content that spans multiple lines when word wrap is enabled versus when it is disabled');

        await sleep(1000);
        log('');
        log('=== Progress Update ===');
        log('I: 25% complete (5/20 seconds)');

        // Second 6-10: Simulated progress
        await sleep(1000);
        log('I: Processing item 1 of 10...');

        await sleep(1000);
        log('S: Item 1 completed successfully');
        log('I: Processing item 2 of 10...');

        await sleep(1000);
        log('W: Item 2 had warnings but continued');
        log('I: Processing item 3 of 10...');

        await sleep(1000);
        log('S: Item 3 completed successfully');
        log('I: Processing item 4 of 10...');

        await sleep(1000);
        log('');
        log('=== Progress Update ===');
        log('I: 50% complete (10/20 seconds)');

        // Second 11-15: Mixed content
        await sleep(1000);
        log('I: Testing code output:');
        log('    {');
        log('        "name": "test",');
        log('        "value": 12345,');
        log('        "enabled": true');
        log('    }');

        await sleep(1000);
        log('');
        log('I: Testing special characters: !@#$%^&*()_+-={}[]|\\:";\'<>?,./');

        await sleep(1000);
        log('W: Simulating potential issues...');
        log('W: Memory usage: 75%');
        log('W: Network latency detected');

        await sleep(1000);
        log('');
        log('S: Warnings resolved, continuing...');

        await sleep(1000);
        log('');
        log('=== Progress Update ===');
        log('I: 75% complete (15/20 seconds)');

        // Second 16-19: Final messages
        await sleep(1000);
        log('I: Approaching end of test...');

        await sleep(1000);
        log('I: Testing Unicode characters: ✓ ✗ ★ ♥ ☆ → ← ↑ ↓');
        log('I: Testing emoji: 🚀 ⚠️ ✅ ❌ 💡 🔥');

        await sleep(1000);
        log('W: Critical threshold approaching...');
        log('W: Error state imminent...');

        await sleep(1000);
        log('E: Critical error detected!');
        log('E: System instability...');

        await sleep(1000);
        log('');
        log('=== Final Status ===');
        log('I: 100% complete (20/20 seconds)');
        log('E: Script completed with errors');
        log('');

        // Intentionally fail
        throw new Error('This is an intentional failure to test error handling and UI status changes');
    }
};
