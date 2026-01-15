// Watch History Service
// Tracks user's viewing progress for Continue Watching feature

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@streamed_watch_history';

export interface WatchHistoryItem {
    id: string;                    // Unique ID (tmdbId + optional season/episode)
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    posterPath: string | null;
    backdropPath?: string | null;
    // For TV shows
    seasonNumber?: number;
    episodeNumber?: number;
    episodeName?: string;
    // Progress tracking
    progress: number;              // 0-100 percentage
    currentTime: number;           // Current position in seconds
    duration: number;              // Total duration in seconds
    // Stream info
    streamUrl?: string;
    torrentHash?: string;
    currentFileIndex?: number;          // For multi-file torrents: which file was playing
    // For scrapers - needed for proper resume
    streamType?: 'hls' | 'mp4' | 'mkv' | 'embed';  // 'embed' for WebView, others for VLC
    provider?: string;             // 'xprime', 'vidnest', 'torbox', etc.
    streamHeaders?: Record<string, string>;  // Headers for authenticated streams
    // Timestamps
    lastWatched: number;           // Unix timestamp
    addedAt: number;               // Unix timestamp
}

const MAX_HISTORY_ITEMS = 50;

/**
 * Get all watch history items
 */
export const getWatchHistory = async (): Promise<WatchHistoryItem[]> => {
    try {
        const data = await AsyncStorage.getItem(STORAGE_KEY);
        if (data) {
            const history = JSON.parse(data) as WatchHistoryItem[];
            // Sort by last watched (most recent first)
            return history.sort((a, b) => b.lastWatched - a.lastWatched);
        }
    } catch (error) {
        console.error('Error getting watch history:', error);
    }
    return [];
};

/**
 * Add or update a watch history item
 */
export const updateWatchProgress = async (item: Omit<WatchHistoryItem, 'lastWatched' | 'addedAt'>): Promise<void> => {
    try {
        const history = await getWatchHistory();

        // Find existing item
        const existingIndex = history.findIndex(h => h.id === item.id);

        const now = Date.now();
        const updatedItem: WatchHistoryItem = {
            ...item,
            lastWatched: now,
            addedAt: existingIndex >= 0 ? history[existingIndex].addedAt : now,
        };

        if (existingIndex >= 0) {
            // Update existing
            history[existingIndex] = updatedItem;
        } else {
            // Add new
            history.unshift(updatedItem);
        }

        // Limit history size
        const trimmedHistory = history.slice(0, MAX_HISTORY_ITEMS);

        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedHistory));
        console.log('Watch history updated:', item.title, `${item.progress}%`);
    } catch (error) {
        console.error('Error updating watch history:', error);
    }
};

/**
 * Get recently watched items for Continue Watching section
 * Only returns items with progress < 95% (not finished)
 */
export const getContinueWatching = async (limit: number = 20): Promise<WatchHistoryItem[]> => {
    try {
        const history = await getWatchHistory();
        // Filter out completed items (> 95% progress) and items with no watch time
        // Using currentTime > 0 ensures items appear after even 1 second of playback
        return history
            .filter(item => item.progress < 95 && item.currentTime > 0)
            .slice(0, limit);
    } catch (error) {
        console.error('Error getting continue watching:', error);
    }
    return [];
};

/**
 * Remove an item from watch history
 */
export const removeFromHistory = async (itemId: string): Promise<void> => {
    try {
        const history = await getWatchHistory();
        const filtered = history.filter(h => h.id !== itemId);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
        console.error('Error removing from history:', error);
    }
};

/**
 * Clear all watch history
 */
export const clearWatchHistory = async (): Promise<void> => {
    try {
        await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.error('Error clearing watch history:', error);
    }
};

/**
 * Get a specific history item
 */
export const getHistoryItem = async (itemId: string): Promise<WatchHistoryItem | null> => {
    try {
        const history = await getWatchHistory();
        return history.find(h => h.id === itemId) || null;
    } catch (error) {
        console.error('Error getting history item:', error);
    }
    return null;
};

/**
 * Create a unique ID for a watch history item
 * For TV shows: ONE entry per series (episodes update the same entry)
 * For movies: ONE entry per movie
 */
export const createHistoryId = (
    tmdbId: number,
    mediaType: 'movie' | 'tv',
    _seasonNumber?: number,  // Ignored - kept for backward compatibility
    _episodeNumber?: number  // Ignored - kept for backward compatibility
): string => {
    // For TV shows, use just the tmdbId so all episodes share one history entry
    // This means switching episodes updates the same Continue Watching card
    return `${mediaType}-${tmdbId}`;
};
