/**
 * Example: List Media Years (JavaScript)
 *
 * This script demonstrates how to list all media items and read their production year.
 * Written in plain JavaScript (no TypeScript).
 */

import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { getUserApi } from '@jellyfin/sdk/lib/utils/api/user-api';

export default {
    name: 'List Media Years (JS)',
    description: 'List all media items and their production years (JavaScript example)',
    isExample: true,
    execute: async (context) => {
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
            context.log('I: Fetching all media items...');

            const itemsApi = getItemsApi(context.api);

            // Fetch all items with ProductionYear field
            const { data: items } = await itemsApi.getItems({
                userId: currentUser.Id,
                recursive: true,
                includeItemTypes: ['Movie', 'Series', 'Episode', 'MusicAlbum', 'Audio', 'Book'],
                excludeItemTypes: ['Folder', 'BoxSet', 'CollectionFolder'],
                fields: ['ProductionYear', 'PremiereDate'],
                sortBy: ['ProductionYear'],
                sortOrder: ['Descending']
            });

            if (!items.Items || items.Items.length === 0) {
                context.log('W: No media items found in your library.');
                return;
            }

            context.log(`I: Found ${items.TotalRecordCount} total media items`);
            context.log('');

            // Group items by year
            const itemsByYear = {};
            let itemsWithYear = 0;
            let itemsWithoutYear = 0;

            items.Items.forEach((item) => {
                const year = item.ProductionYear;

                // Detect non-movie items
                if (item.Type !== 'Movie' && item.Type !== 'Series' && item.Type !== 'Episode') {
                    context.log(`W: Skipping non-movie/series/episode item: ${item.Name} [${item.Type}]`);
                    return;
                }

                if (year) {
                    itemsWithYear++;
                    if (!itemsByYear[year]) {
                        itemsByYear[year] = [];
                    }
                    itemsByYear[year].push(item);
                } else {
                    itemsWithoutYear++;
                }
            });

            context.log('=== Statistics ===');
            context.log(`I: Items with production year: ${itemsWithYear}`);
            context.log(`I: Items without production year: ${itemsWithoutYear}`);
            context.log('');

            // Display items grouped by year (showing first 50 items)
            context.log('=== Items by Production Year ===');
            const years = Object.keys(itemsByYear).sort((a, b) => b - a);
            let displayedCount = 0;
            const maxDisplay = 50;

            for (const year of years) {
                const yearItems = itemsByYear[year];
                context.log(`I: ${year} (${yearItems.length} items):`);

                for (const item of yearItems) {
                    if (displayedCount >= maxDisplay) break;

                    const type = item.Type || 'Unknown';
                    const name = item.Name || 'Untitled';
                    context.log(`   - ${name} [${type}]`);
                    displayedCount++;
                }

                if (displayedCount >= maxDisplay) {
                    context.log(`W: Showing first ${maxDisplay} items only...`);
                    break;
                }
            }

            // Show items without year
            if (itemsWithoutYear > 0) {
                context.log('');
                context.log(`I: Items without production year: ${itemsWithoutYear}`);
                const noYearItems = items.Items.filter(item => !item.ProductionYear);
                const showCount = Math.min(10, noYearItems.length);

                for (let i = 0; i < showCount; i++) {
                    const item = noYearItems[i];
                    const type = item.Type || 'Unknown';
                    const name = item.Name || 'Untitled';
                    context.log(`   - ${name} [${type}]`);
                }

                if (itemsWithoutYear > showCount) {
                    context.log(`   ... and ${itemsWithoutYear - showCount} more`);
                }
            }

            context.log('');
            context.log('S: Script completed successfully!');
        } catch (error) {
            context.log('E: ' + (error instanceof Error ? error.message : String(error)));
            throw error;
        }
    }
};
