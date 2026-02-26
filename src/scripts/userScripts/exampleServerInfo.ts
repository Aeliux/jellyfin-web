/**
 * Example: Server Information
 *
 * This script demonstrates how to fetch and display server information.
 */

import { getSystemApi } from '@jellyfin/sdk/lib/utils/api/system-api';
import type { ScriptContext } from '../types/ScriptContext';

export default {
    name: 'Server Information',
    description: 'Display information about the Jellyfin server',
    isExample: true,
    execute: async (context: ScriptContext) => {
        try {
            context.log('I: Fetching server information...');
            context.log('');

            const systemApi = getSystemApi(context.api);
            const { data: info } = await systemApi.getPublicSystemInfo();

            context.log('=== Server Information ===');
            context.log(`I: Server Name: ${info.ServerName}`);
            context.log(`I: Version: ${info.Version}`);
            context.log(`I: ID: ${info.Id}`);

            if (info.StartupWizardCompleted !== undefined) {
                context.log(`I: Startup Wizard Completed: ${info.StartupWizardCompleted ? 'Yes' : 'No'}`);
            }

            context.log('');

            // Get system info (requires admin privileges)
            try {
                const { data: systemInfo } = await systemApi.getSystemInfo();

                context.log('=== System Details ===');
                context.log(`I: Product Name: ${systemInfo.ProductName}`);
                context.log(`I: Server Protocol: ${systemInfo.LocalAddress}`);

                if (systemInfo.HasPendingRestart) {
                    context.log('W: Server has pending restart');
                }
            } catch {
                context.log('I: (Additional system info requires admin privileges)');
            }
        } catch (error) {
            context.log('E: ' + (error instanceof Error ? error.message : String(error)));
            throw error;
        }
    }
};
