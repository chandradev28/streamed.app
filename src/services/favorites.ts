// Favorites Service
// Manages user's favorite movies and TV shows

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@streamed_favorites';

export interface FavoriteItem {
    id: number;                    // TMDB ID
    mediaType: 'movie' | 'tv';
    title: string;
    posterPath: string | null;
    backdropPath?: string | null;
    rating?: number;
    year?: string;
    addedAt: number;               // Unix timestamp
}

/**
 * Get all favorite items
 */
export const getFavorites = async (): Promise<FavoriteItem[]> => {
    try {
        const data = await AsyncStorage.getItem(STORAGE_KEY);
        if (data) {
            const favorites = JSON.parse(data) as FavoriteItem[];
            // Sort by added date (most recent first)
            return favorites.sort((a, b) => b.addedAt - a.addedAt);
        }
    } catch (error) {
        // Silent error handling
    }
    return [];
};

/**
 * Check if an item is in favorites
 */
export const isFavorite = async (tmdbId: number, mediaType: 'movie' | 'tv'): Promise<boolean> => {
    try {
        const favorites = await getFavorites();
        return favorites.some(f => f.id === tmdbId && f.mediaType === mediaType);
    } catch (error) {
        return false;
    }
};

/**
 * Add an item to favorites
 */
export const addToFavorites = async (item: Omit<FavoriteItem, 'addedAt'>): Promise<void> => {
    try {
        const favorites = await getFavorites();

        // Check if already exists
        const exists = favorites.some(f => f.id === item.id && f.mediaType === item.mediaType);
        if (exists) return;

        const newItem: FavoriteItem = {
            ...item,
            addedAt: Date.now(),
        };

        favorites.unshift(newItem);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    } catch (error) {
        // Silent error handling
    }
};

/**
 * Remove an item from favorites
 */
export const removeFromFavorites = async (tmdbId: number, mediaType: 'movie' | 'tv'): Promise<void> => {
    try {
        const favorites = await getFavorites();
        const filtered = favorites.filter(f => !(f.id === tmdbId && f.mediaType === mediaType));
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
        // Silent error handling
    }
};

/**
 * Toggle favorite status
 * Returns new favorite state (true = added, false = removed)
 */
export const toggleFavorite = async (item: Omit<FavoriteItem, 'addedAt'>): Promise<boolean> => {
    const isCurrentlyFavorite = await isFavorite(item.id, item.mediaType);

    if (isCurrentlyFavorite) {
        await removeFromFavorites(item.id, item.mediaType);
        return false;
    } else {
        await addToFavorites(item);
        return true;
    }
};

/**
 * Clear all favorites
 */
export const clearFavorites = async (): Promise<void> => {
    try {
        await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        // Silent error handling
    }
};
