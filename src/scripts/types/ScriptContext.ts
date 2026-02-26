/**
 * Script Context Interface
 *
 * Provides the execution context for user scripts with API access,
 * logging, user input, and flow control capabilities.
 */

import type { Api } from '@jellyfin/sdk';

export interface ScriptContext {
    /**
     * Jellyfin API instance for making API calls
     */
    api: Api;

    /**
     * Log a message to the script console
     * @param message The message to log
     */
    log: (message: string) => void;

    /**
     * Request text input from the user
     * @param prompt The prompt to display to the user
     * @returns Promise that resolves with the user's input (or empty string if cancelled)
     */
    input: (prompt: string) => Promise<string>;

    /**
     * Request confirmation from the user
     * @param question The yes/no question to ask
     * @returns Promise that resolves with true for yes, false for no
     */
    confirm: (question: string) => Promise<boolean>;

    /**
     * Mark the script as skipped (must be called before script exits)
     * @param reason Optional reason for skipping
     */
    skip: (reason?: string) => void;

    /**
     * Mark the script as failed (must be called before script exits)
     * @param reason Optional reason for failure
     */
    fail: (reason?: string) => void;
}
