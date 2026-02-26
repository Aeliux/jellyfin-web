/**
 * Example: Server Information
 *
 * This script demonstrates how to fetch and display server information.
 */

import { getSystemApi } from '@jellyfin/sdk/lib/utils/api/system-api';
import type { Api } from '@jellyfin/sdk';

export default {
    name: 'Server Information',
    description: 'Display information about the Jellyfin server',
    isExample: true,
    execute: async (api: Api, log: (message: string) => void) => {
        try {
            log('I: Fetching server information...');
            log('');

            const systemApi = getSystemApi(api);
            const { data: info } = await systemApi.getPublicSystemInfo();

            log('=== Server Information ===');
            log(`I: Server Name: ${info.ServerName}`);
            log(`I: Version: ${info.Version}`);
            log(`I: ID: ${info.Id}`);

            if (info.StartupWizardCompleted !== undefined) {
                log(`I: Startup Wizard Completed: ${info.StartupWizardCompleted ? 'Yes' : 'No'}`);
            }

            log('');

            // Get system info (requires admin privileges)
            try {
                const { data: systemInfo } = await systemApi.getSystemInfo();

                log('=== System Details ===');
                log(`I: Product Name: ${systemInfo.ProductName}`);
                log(`I: Server Protocol: ${systemInfo.LocalAddress}`);

                if (systemInfo.HasPendingRestart) {
                    log('W: Server has pending restart');
                }
            } catch {
                log('I: (Additional system info requires admin privileges)');
            }
        } catch (error) {
            log('E: ' + (error instanceof Error ? error.message : String(error)));
            throw error;
        }
    }
};
