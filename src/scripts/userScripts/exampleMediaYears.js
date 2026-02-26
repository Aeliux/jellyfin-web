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
    execute: async (api, log) => {
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
            log('I: Fetching all media items...');

            const itemsApi = getItemsApi(api);

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
                log('W: No media items found in your library.');
                return;
            }

            log(`I: Found ${items.TotalRecordCount} total media items`);
            log('');

            // Group items by year
            const itemsByYear = {};
            let itemsWithYear = 0;
            let itemsWithoutYear = 0;

            items.Items.forEach((item) => {
                const year = item.ProductionYear;

                // Detect non-movie items
                if (item.Type !== 'Movie' && item.Type !== 'Series' && item.Type !== 'Episode') {
                    log(`W: Skipping non-movie/series/episode item: ${item.Name} [${item.Type}]`);
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

            log('=== Statistics ===');
            log(`I: Items with production year: ${itemsWithYear}`);
            log(`I: Items without production year: ${itemsWithoutYear}`);
            log('');

            // Display items grouped by year (showing first 50 items)
            log('=== Items by Production Year ===');
            const years = Object.keys(itemsByYear).sort((a, b) => b - a);
            let displayedCount = 0;
            const maxDisplay = 50;

            for (const year of years) {
                const yearItems = itemsByYear[year];
                log(`I: ${year} (${yearItems.length} items):`);

                for (const item of yearItems) {
                    if (displayedCount >= maxDisplay) break;

                    const type = item.Type || 'Unknown';
                    const name = item.Name || 'Untitled';
                    log(`   - ${name} [${type}]`);
                    displayedCount++;
                }

                if (displayedCount >= maxDisplay) {
                    log(`W: Showing first ${maxDisplay} items only...`);
                    break;
                }
            }

            // Show items without year
            if (itemsWithoutYear > 0) {
                log('');
                log(`I: Items without production year: ${itemsWithoutYear}`);
                const noYearItems = items.Items.filter(item => !item.ProductionYear);
                const showCount = Math.min(10, noYearItems.length);

                for (let i = 0; i < showCount; i++) {
                    const item = noYearItems[i];
                    const type = item.Type || 'Unknown';
                    const name = item.Name || 'Untitled';
                    log(`   - ${name} [${type}]`);
                }

                if (itemsWithoutYear > showCount) {
                    log(`   ... and ${itemsWithoutYear - showCount} more`);
                }
            }

            log('');
            log('S: Script completed successfully!');
        } catch (error) {
            log('E: ' + (error instanceof Error ? error.message : String(error)));
            throw error;
        }
    }
};
