import AsyncStorage from '@react-native-async-storage/async-storage';
import { TorrentResult } from './torrentSearchEngine';

const STORAGE_KEY = '@torboxers_playlist';

export const TorboxPlaylistService = {
    /**
     * Get all items in the playlist
     */
    async getPlaylist(): Promise<TorrentResult[]> {
        try {
            const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
            return jsonValue != null ? JSON.parse(jsonValue) : [];
        } catch (e) {
            console.error('Error reading playlist:', e);
            return [];
        }
    },

    /**
     * Add an item to the playlist
     */
    async addToPlaylist(item: TorrentResult): Promise<boolean> {
        try {
            const currentPlaylist = await this.getPlaylist();
            // Check if already exists
            if (currentPlaylist.some(i => i.infoHash === item.infoHash)) {
                return false; // Already exists
            }

            // Add timestamp for sorting
            const itemWithDate = {
                ...item,
                addedToPlaylistAt: Date.now()
            };

            const newPlaylist = [itemWithDate, ...currentPlaylist];
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newPlaylist));
            return true;
        } catch (e) {
            console.error('Error adding to playlist:', e);
            return false;
        }
    },

    /**
     * Remove an item from the playlist
     */
    async removeFromPlaylist(infoHash: string): Promise<boolean> {
        try {
            const currentPlaylist = await this.getPlaylist();
            const newPlaylist = currentPlaylist.filter(item => item.infoHash !== infoHash);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newPlaylist));
            return true;
        } catch (e) {
            console.error('Error removing from playlist:', e);
            return false;
        }
    },

    /**
     * Check if an item is in the playlist
     */
    async isInPlaylist(infoHash: string): Promise<boolean> {
        try {
            const currentPlaylist = await this.getPlaylist();
            return currentPlaylist.some(item => item.infoHash === infoHash);
        } catch (e) {
            console.error('Error checking playlist:', e);
            return false;
        }
    }
};
