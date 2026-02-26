/**
 * Example: List Library Items
 *
 * This script demonstrates how to interact with the Jellyfin API
 * to fetch and display library items.
 */

import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { getUserApi } from '@jellyfin/sdk/lib/utils/api/user-api';
import type { Api } from '@jellyfin/sdk';

export default {
    name: 'List Recent Items',
    description: 'Fetch and display recently added items from your library',
    isExample: true,
    execute: async (api: Api, log: (message: string) => void) => {
        try {
            log('I: Fetching current user information...');
            const userApi = getUserApi(api);
            const { data: users } = await userApi.getUsers();
            const currentUser = users[0];

            if (!currentUser?.Id) {
                log('E: Could not get user information');
                return;
            }

            log(`I: Current user: ${currentUser.Name}`);
            log('');
            log('I: Fetching recently added items...');

            const itemsApi = getItemsApi(api);
            const { data: items } = await itemsApi.getItems({
                userId: currentUser.Id,
                limit: 10,
                sortBy: ['DateCreated'],
                sortOrder: ['Descending'],
                recursive: true,
                fields: ['DateCreated']
            });

            if (!items.Items || items.Items.length === 0) {
                log('W: No items found in your library.');
                return;
            }

            log(`I: Found ${items.TotalRecordCount} total items. Showing the 10 most recent:`);
            log('');

            items.Items.forEach((item, index) => {
                const date = item.DateCreated ?
                    new Date(item.DateCreated).toLocaleDateString() :
                    'Unknown';
                log(`I: ${index + 1}. ${item.Name} (${item.Type}) - Added: ${date}`);
            });
        } catch (error) {
            log('E: ' + (error instanceof Error ? error.message : String(error)));
            throw error;
        }
    }
};
