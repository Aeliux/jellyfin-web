/**
 * Convert production years to premiere dates for media items in a Jellyfin library.
 * This script fetches all media items, checks their production years, and if a premiere date is missing, it can be set based on the production year.
 */

import { Api } from '@jellyfin/sdk';
import { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { getUserApi } from '@jellyfin/sdk/lib/utils/api/user-api';
import confirm from 'components/confirm/confirm';
import { ServerConnections } from 'lib/jellyfin-apiclient';

export default {
    name: 'Convert Production Year to Premiere Date',
    description: 'Convert production years to premiere dates for media items without premiere dates',
    execute: async (api: Api, log: (message: string) => void) => {
        try {
            const userApi = getUserApi(api);
            const { data: users } = await userApi.getUsers();
            const currentUser = users[0];

            if (!currentUser?.Id) {
                log('E: Could not get user information');
                return;
            }

            log('I: Fetching all media items...');

            const itemsApi = getItemsApi(api);

            const { data: items } = await itemsApi.getItems({
                userId: currentUser.Id,
                recursive: true,
                includeItemTypes: ['Movie', 'Series', 'Episode', 'MusicAlbum', 'Audio', 'Book'],
                sortBy: ['ProductionYear'],
                sortOrder: ['Descending']
            });

            if (!items.Items || items.Items.length === 0) {
                log('W: No media items found in your library.');
                return;
            }

            // Extract items from boxsets
            for (const item of items.Items) {
                if (item.Type === 'BoxSet' && item.Id) {
                    // Fetch child items of the boxset
                    const boxSetItems = await itemsApi.getItems({
                        userId: currentUser.Id,
                        parentId: item.Id,
                        recursive: true,
                        includeItemTypes: ['Movie', 'Series', 'Episode', 'MusicAlbum', 'Audio', 'Book']
                    });
                    if (boxSetItems.data.Items) {
                        items.Items.push(...boxSetItems.data.Items);
                        log(`I: Added ${boxSetItems.data.Items.length} items from boxset "${item.Name}"`);
                    }
                }
            }

            // Remove all boxsets from the main list
            items.Items = items.Items.filter(item => item.Type !== 'BoxSet');

            // List of items with year and without prod date
            const itemsWithYearNoPremiere: BaseItemDto[] = [];

            items.Items.forEach((item) => {
                const year = item.ProductionYear;
                if (!year) {
                    log(`W: Item ${item.Name} have no year`);
                    return;
                }
                if (item.PremiereDate) {
                    return;
                }

                // Validate year is in format YYYYMMDD
                const yearStr = year.toString();
                if (!/^\d{8}$/.test(yearStr)) {
                    log(`W: Item "${item.Name}" has an invalid production year: ${year}`);
                    return;
                }

                // Split year into components                const yearPart = yearStr.substring(0, 4);
                const yearPart = parseInt(yearStr.substring(0, 4), 10);
                const monthPart = parseInt(yearStr.substring(4, 6), 10);
                const dayPart = parseInt(yearStr.substring(6, 8), 10);

                if (isNaN(yearPart) || isNaN(monthPart) || isNaN(dayPart)) {
                    log(`W: Item "${item.Name}" has an invalid production year: ${year}`);
                    return;
                }

                // Validate month and day are within valid ranges
                if (monthPart < 1 || monthPart > 12) {
                    log(`W: Item "${item.Name}" has an invalid month in production year: ${monthPart}`);
                    return;
                }

                if (dayPart < 1 || dayPart > 31) {
                    log(`W: Item "${item.Name}" has an invalid day in production year: ${dayPart}`);
                    return;
                }

                itemsWithYearNoPremiere.push(item);
            });

            log(`All items: ${items.Items.length}`);
            log(`Items with production year but no premiere date: ${itemsWithYearNoPremiere.length}`);

            if (itemsWithYearNoPremiere.length === 0) {
                log('No items need premiere date updates.');
                return;
            }

            try {
                await confirm({
                    title: 'Update Premiere Dates',
                    text: `This will update premiere dates for ${itemsWithYearNoPremiere.length} items based on their production year. Do you want to continue?`,
                    confirmText: 'Yes, Update',
                    cancelText: 'No, Cancel'
                });

                log('I: User confirmed. Starting updates...');
            } catch {
                log('W: User cancelled the operation');
                return;
            }

            try {
                const apiClient = ServerConnections.currentApiClient();
                if (!apiClient) {
                    log('E: Can\'t get api client');
                    return;
                }

                for (const item of itemsWithYearNoPremiere) {
                    log(`I: Processing: ${item.Name}`);
                    let fullItem;

                    try {
                        fullItem = await apiClient.getItem(
                            apiClient.getCurrentUserId(),
                            item.Id!
                        );
                    } catch {
                        log('W: Can\'t get the full item');
                        continue;
                    }

                    if (fullItem.PremiereDate) {
                        log('W: Item already has premire date');
                        continue;
                    }

                    // Convert production year to premiere date
                    const yearStr = item.ProductionYear!.toString();
                    const yearPart = parseInt(yearStr.substring(0, 4), 10);
                    const monthPart = parseInt(yearStr.substring(4, 6), 10);
                    const dayPart = parseInt(yearStr.substring(6, 8), 10);

                    const newPremiereDate = new Date(Date.UTC(yearPart, monthPart - 1, dayPart, 0, 0, 0, 0)).toISOString();

                    fullItem.PremiereDate = newPremiereDate;
                    fullItem.Trickplay = undefined;

                    try {
                        await apiClient.updateItem(fullItem);
                    } catch {
                        log('W: Can\'t update item');
                        continue;
                    }

                    log(`S: Updated item with premiere date ${newPremiereDate}`);
                }
            } catch (error) {
                log('E: Error updating items: ' + (error instanceof Error ? error.message : String(error)));
                throw error;
            }
        } catch (error) {
            log('E: ' + (error instanceof Error ? error.message : String(error)));
            throw error;
        }
    }
};
