/**
 * Example: List Library Items
 *
 * This script demonstrates how to interact with the Jellyfin API
 * to fetch and display library items.
 */

import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { getUserApi } from '@jellyfin/sdk/lib/utils/api/user-api';
import type { ScriptContext } from '../types/ScriptContext';

export default {
    name: 'List Recent Items',
    description: 'Fetch and display recently added items from your library',
    isExample: true,
    execute: async (context: ScriptContext) => {
        try {
            context.log('I: Fetching current user information...');
            const userApi = getUserApi(context.api);
            const { data: users } = await userApi.getUsers();
            const currentUser = users[0];

            if (!currentUser?.Id) {
                context.log('E: Could not get user information');
                return;
            }

            context.log(`I: Current user: ${currentUser.Name}`);
            context.log('');
            context.log('I: Fetching recently added items...');

            const itemsApi = getItemsApi(context.api);
            const { data: items } = await itemsApi.getItems({
                userId: currentUser.Id,
                limit: 10,
                sortBy: ['DateCreated'],
                sortOrder: ['Descending'],
                recursive: true,
                fields: ['DateCreated']
            });

            if (!items.Items || items.Items.length === 0) {
                context.log('W: No items found in your library.');
                return;
            }

            context.log(`I: Found ${items.TotalRecordCount} total items. Showing the 10 most recent:`);
            context.log('');

            items.Items.forEach((item, index) => {
                const date = item.DateCreated ?
                    new Date(item.DateCreated).toLocaleDateString() :
                    'Unknown';
                context.log(`I: ${index + 1}. ${item.Name} (${item.Type}) - Added: ${date}`);
            });
        } catch (error) {
            context.log('E: ' + (error instanceof Error ? error.message : String(error)));
            throw error;
        }
    }
};
