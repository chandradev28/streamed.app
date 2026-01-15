// TorBox API Service
// TorBox is a debrid service that caches torrents for instant streaming
// API Documentation: https://api-docs.torbox.app

import { StorageService } from './storage';

const TORBOX_API_URL = 'https://api.torbox.app/v1/api';

// ============================================================================
// URL CACHING - Avoid redundant API calls for stream URLs
// Cache expires after 30 minutes (URLs are typically valid for ~1 hour)
// ============================================================================
interface CachedUrl {
    url: string;
    timestamp: number;
}

const streamUrlCache = new Map<string, CachedUrl>();
const CACHE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Get cached stream URL if valid
 */
const getCachedStreamUrl = (torrentId: number, fileId?: number): string | null => {
    const cacheKey = `${torrentId}_${fileId ?? 'default'}`;
    const cached = streamUrlCache.get(cacheKey);

    if (cached) {
        const age = Date.now() - cached.timestamp;
        if (age < CACHE_EXPIRY_MS) {
            console.log('TorBox: Using cached URL for', cacheKey, '(age:', Math.round(age / 1000), 's)');
            return cached.url;
        }
        // Expired, remove from cache
        streamUrlCache.delete(cacheKey);
    }
    return null;
};

/**
 * Cache a stream URL
 */
const cacheStreamUrl = (torrentId: number, fileId: number | undefined, url: string): void => {
    const cacheKey = `${torrentId}_${fileId ?? 'default'}`;
    streamUrlCache.set(cacheKey, {
        url,
        timestamp: Date.now()
    });
    console.log('TorBox: Cached URL for', cacheKey);
};

/**
 * Clear expired cache entries (call periodically or on memory pressure)
 */
export const clearExpiredUrlCache = (): void => {
    const now = Date.now();
    let cleared = 0;
    for (const [key, cached] of streamUrlCache.entries()) {
        if (now - cached.timestamp >= CACHE_EXPIRY_MS) {
            streamUrlCache.delete(key);
            cleared++;
        }
    }
    if (cleared > 0) {
        console.log('TorBox: Cleared', cleared, 'expired cache entries');
    }
};

/**
 * Clear all cached URLs (call when user logs out or changes API key)
 */
export const clearAllUrlCache = (): void => {
    const size = streamUrlCache.size;
    streamUrlCache.clear();
    console.log('TorBox: Cleared all', size, 'cached URLs');
};

export interface TorBoxCachedResult {
    hash: string;
    cached: boolean;
    name?: string;
    size?: number;
}

export interface TorBoxTorrent {
    id: number;
    hash: string;
    name: string;
    size: number;
    download_state: string;
    download_speed: number;
    progress: number;
    files: TorBoxFile[];
    created_at?: string;  // ISO date string when torrent was added
    updated_at?: string;  // ISO date string when torrent was last updated
}

export interface TorBoxFile {
    id: number;
    name: string;
    size: number;
    short_name: string;
}

export interface TorBoxDownloadLink {
    success: boolean;
    data?: string; // Direct download URL
    error?: string;
}

/**
 * Get the stored TorBox API key
 */
const getApiKey = async (): Promise<string | null> => {
    return await StorageService.getTorBoxApiKey();
};

/**
 * Make an authenticated request to TorBox API
 */
const torboxFetch = async (
    endpoint: string,
    options: RequestInit = {}
): Promise<Response> => {
    const apiKey = await getApiKey();
    if (!apiKey) {
        throw new Error('TorBox API key not configured');
    }

    const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
    };

    return fetch(`${TORBOX_API_URL}${endpoint}`, {
        ...options,
        headers,
    });
};

/**
 * Check if TorBox is available and configured
 */
export const isTorBoxAvailable = async (): Promise<boolean> => {
    return await StorageService.isTorBoxConfigured();
};

/**
 * Check if torrents are cached on TorBox
 * @param hashes - Array of torrent info hashes
 */
export const checkCached = async (hashes: string[]): Promise<Map<string, boolean>> => {
    const result = new Map<string, boolean>();

    console.log('=== TorBox checkCached START ===');
    console.log('Checking', hashes.length, 'hashes');
    console.log('First few hashes:', hashes.slice(0, 3).join(', '));

    try {
        const response = await torboxFetch('/torrents/checkcached', {
            method: 'POST',
            body: JSON.stringify({
                hashes: hashes,
            }),
        });

        console.log('TorBox checkCached response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('TorBox check cached failed:', response.status, errorText);
            return result;
        }

        const data = await response.json();
        console.log('TorBox checkCached response:', JSON.stringify(data).substring(0, 500));

        if (data.success && data.data) {
            // data.data can be an object with hash as key and boolean/array as value
            // TorBox may return array of cached files or boolean
            let cachedCount = 0;
            for (const hash of hashes) {
                const lowerHash = hash.toLowerCase();
                const cacheData = data.data[lowerHash];
                // Check if cached - can be true, or an array with items
                const isCached = cacheData === true ||
                    (Array.isArray(cacheData) && cacheData.length > 0) ||
                    (typeof cacheData === 'object' && cacheData !== null);
                result.set(lowerHash, isCached);
                if (isCached) cachedCount++;
            }
            console.log('Cached torrents found:', cachedCount, 'of', hashes.length);
        } else {
            console.log('TorBox checkCached: no success or no data in response');
        }
    } catch (error: any) {
        console.error('Error checking TorBox cache:', error?.message || error);
    }

    console.log('=== TorBox checkCached END ===');
    return result;
};

/**
 * Add a torrent to TorBox for download/caching
 * @param magnetOrHash - Magnet link or info hash
 * @returns The torrent ID if successful
 */
export const addTorrent = async (magnetOrHash: string): Promise<TorBoxTorrent | null> => {
    try {
        const apiKey = await getApiKey();
        if (!apiKey) {
            console.error('TorBox API key not configured');
            return null;
        }

        // TorBox API requires FormData for adding torrents
        const formData = new FormData();

        if (magnetOrHash.startsWith('magnet:')) {
            formData.append('magnet', magnetOrHash);
        } else {
            // If it's just a hash, convert to magnet link
            const magnetLink = `magnet:?xt=urn:btih:${magnetOrHash}`;
            formData.append('magnet', magnetLink);
        }

        console.log('Adding torrent to TorBox...');

        const response = await fetch(`${TORBOX_API_URL}/torrents/createtorrent`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
            body: formData,
        });

        const data = await response.json();
        console.log('TorBox addTorrent response:', JSON.stringify(data, null, 2));

        if (!response.ok) {
            console.error('TorBox add torrent failed:', response.status, data);
            // If already exists in library, try to get the existing torrent
            if (data.detail?.includes('already') || data.error?.includes('already')) {
                console.log('Torrent already in library, fetching existing...');
                return await getTorrentByHash(magnetOrHash);
            }
            return null;
        }

        if (data.success && data.data) {
            const torrentId = data.data.torrent_id;
            const hash = data.data.hash || magnetOrHash;
            console.log('Torrent added successfully, ID:', torrentId);

            // Fetch actual torrent status to get real progress (important for already-cached torrents)
            const actualTorrent = await getTorrentByHash(hash);
            if (actualTorrent) {
                console.log('Actual torrent status - Progress:', actualTorrent.progress, '%');
                return actualTorrent;
            }

            // Fallback if fetch fails
            return {
                id: torrentId,
                hash: hash,
                name: data.data.name || 'Unknown',
                size: data.data.size || 0,
                download_state: 'downloading',
                download_speed: 0,
                progress: 0,
                files: [],
            };
        }

        return null;
    } catch (error) {
        console.error('Error adding torrent to TorBox:', error);
        return null;
    }
};

/**
 * Get download link for a cached torrent file
 * Uses caching to avoid redundant API calls
 * @param torrentId - TorBox torrent ID
 * @param fileId - File ID within the torrent (optional, defaults to largest file)
 */
export const getDownloadLink = async (
    torrentId: number,
    fileId?: number
): Promise<string | null> => {
    try {
        // Check cache first
        const cachedUrl = getCachedStreamUrl(torrentId, fileId);
        if (cachedUrl) {
            return cachedUrl;
        }

        // Get the API key to add as token parameter
        const apiKey = await getApiKey();
        if (!apiKey) {
            console.error('TorBox API key not found');
            return null;
        }

        // Build endpoint with required token parameter
        let endpoint = `/torrents/requestdl?token=${apiKey}&torrent_id=${torrentId}`;
        if (fileId !== undefined) {
            endpoint += `&file_id=${fileId}`;
        }

        console.log('TorBox requesting download link for torrent:', torrentId);

        // Use direct fetch instead of torboxFetch since token is in URL
        const response = await fetch(`${TORBOX_API_URL}${endpoint}`);

        const responseText = await response.text();
        console.log('TorBox download link response:', response.status, responseText.substring(0, 200));

        if (!response.ok) {
            console.error('TorBox get download link failed:', response.status);
            return null;
        }

        try {
            const data = JSON.parse(responseText);

            if (data.success && data.data) {
                console.log('Got download URL successfully');
                // Cache the URL for future use
                cacheStreamUrl(torrentId, fileId, data.data);
                return data.data; // Direct download URL
            } else {
                console.error('TorBox download link response not successful:', data);
            }
        } catch (parseError) {
            console.error('Failed to parse TorBox response:', parseError);
        }
    } catch (error) {
        console.error('Error getting TorBox download link:', error);
    }

    return null;
};

/**
 * Get list of user's torrents on TorBox
 */
export const getUserTorrents = async (): Promise<TorBoxTorrent[]> => {
    try {
        console.log('Fetching TorBox library...');

        // Use bypass_cache to get fresh data
        const response = await torboxFetch('/torrents/mylist?bypass_cache=true');

        console.log('TorBox mylist response status:', response.status);

        // TorBox returns 404 when library is empty (not 200 with empty data)
        if (response.status === 404) {
            console.log('TorBox library is empty (404 response)');
            return [];
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error('TorBox get torrents failed:', response.status, errorText);
            return [];
        }

        const data = await response.json();
        console.log('TorBox mylist data:', JSON.stringify(data, null, 2));

        if (data.success && data.data) {
            // data.data can be an array or null
            const rawTorrents = Array.isArray(data.data) ? data.data : [];
            console.log('Found', rawTorrents.length, 'torrents in library');

            // Map TorBox API fields to our interface
            // TorBox returns download_progress (0-1) but we use progress (0-100)
            const torrents: TorBoxTorrent[] = rawTorrents.map((t: any) => ({
                id: t.id,
                hash: t.hash || '',
                name: t.name || 'Unknown',
                size: t.size || 0,
                download_state: t.download_state || '',
                download_speed: t.download_speed || 0,
                // TorBox might return progress as 0-1 decimal OR 0-100 percentage
                // Also check 'download_progress' field as alternative
                progress: t.progress >= 0 ? (t.progress <= 1 ? t.progress * 100 : t.progress)
                    : (t.download_progress >= 0 ? (t.download_progress <= 1 ? t.download_progress * 100 : t.download_progress) : 0),
                files: t.files || [],
            }));

            return torrents;
        }

        // Sometimes TorBox returns success but data is null for empty library
        console.log('TorBox returned success but no data, library may be empty');
        return [];
    } catch (error) {
        console.error('Error getting TorBox torrents:', error);
        return [];
    }
};

/**
 * Get a specific torrent by hash (if exists in user's library)
 * @param hash - Torrent info hash
 */
export const getTorrentByHash = async (hash: string): Promise<TorBoxTorrent | null> => {
    const torrents = await getUserTorrents();
    const lowerHash = hash.toLowerCase();
    return torrents.find(t => t.hash.toLowerCase() === lowerHash) || null;
};

/**
 * Get instant stream URL for a cached torrent
 * This is the main function to use for instant playback
 * @param hash - Torrent info hash
 * @param fileIdx - Optional file index for multi-file torrents
 */
export const getInstantStreamUrl = async (
    hash: string,
    fileIdx?: number
): Promise<string | null> => {
    try {
        console.log('Getting instant stream URL for hash:', hash);

        // First check if already in user's library
        let torrent = await getTorrentByHash(hash);
        console.log('Existing torrent in library:', torrent ? `ID: ${torrent.id}` : 'Not found');

        if (!torrent) {
            // Not in library, add it (it's already cached since we're using cached-only streams)
            console.log('Torrent not in library, adding...');
            torrent = await addTorrent(hash);

            if (!torrent) {
                console.error('Failed to add torrent to library');
                return null;
            }

            console.log('Torrent added, ID:', torrent.id);

            // Wait a bit for TorBox to process
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Re-fetch to get complete torrent info with files
            torrent = await getTorrentByHash(hash);
            if (!torrent) {
                console.error('Could not find torrent after adding');
                return null;
            }
        }

        console.log('Getting download link for torrent ID:', torrent.id);

        // Get the download/stream link
        // If fileIdx is provided, find the corresponding file ID from the torrent
        let fileId: number | undefined;
        if (fileIdx !== undefined && torrent.files && torrent.files.length > fileIdx) {
            fileId = torrent.files[fileIdx].id;
            console.log('Using file ID:', fileId, 'from fileIdx:', fileIdx);
        }

        const downloadUrl = await getDownloadLink(torrent.id, fileId);
        console.log('Download URL:', downloadUrl ? 'Retrieved successfully' : 'Failed');

        return downloadUrl;
    } catch (error) {
        console.error('Error getting instant stream URL:', error);
        return null;
    }
};

/**
 * Get user's TorBox account info
 */
export const getUserInfo = async (): Promise<any | null> => {
    try {
        const response = await torboxFetch('/user/me');
        if (!response.ok) return null;
        const data = await response.json();
        return data.success ? data.data : null;
    } catch (error) {
        console.error('Error getting user info:', error);
        return null;
    }
};

/**
 * Check authentication status
 */
export const verifyApiKey = async (): Promise<boolean> => {
    try {
        const response = await torboxFetch('/user/me');
        return response.ok;
    } catch (error) {
        return false;
    }
};

/**
 * Delete a torrent from TorBox library
 * @param torrentId - TorBox torrent ID to delete
 * @returns true if deleted successfully
 */
export const deleteTorrent = async (torrentId: number): Promise<boolean> => {
    try {
        console.log('Deleting torrent from TorBox:', torrentId);

        const response = await torboxFetch(`/torrents/controltorrent`, {
            method: 'POST',
            body: JSON.stringify({
                torrent_id: torrentId,
                operation: 'delete',
            }),
        });

        const data = await response.json();
        console.log('TorBox delete response:', response.status, data);

        if (response.ok && data.success) {
            console.log('Torrent deleted successfully');
            return true;
        }

        console.error('Failed to delete torrent:', data);
        return false;
    } catch (error) {
        console.error('Error deleting torrent:', error);
        return false;
    }
};

/**
 * Get all files in a torrent with their individual stream URLs
 * Used for season pack support in video player
 * @param torrentId - TorBox torrent ID
 * @returns Array of files with stream URLs
 */
export const getTorrentFilesWithUrls = async (
    torrentId: number
): Promise<{ id: number; name: string; size: number; streamUrl: string }[]> => {
    try {
        console.log('Getting files with URLs for torrent:', torrentId);

        // First get the torrent info with file list
        const torrents = await getUserTorrents();
        const torrent = torrents.find(t => t.id === torrentId);

        if (!torrent || !torrent.files || torrent.files.length === 0) {
            console.log('No files found for torrent');
            return [];
        }

        console.log('Found', torrent.files.length, 'files in torrent');

        // For large torrents, batch the URL requests to avoid rate limiting
        const BATCH_SIZE = 5;
        const BATCH_DELAY_MS = 100;
        const files = torrent.files;
        const results: { id: number; name: string; size: number; streamUrl: string }[] = [];

        // Process in batches
        for (let i = 0; i < files.length; i += BATCH_SIZE) {
            const batch = files.slice(i, i + BATCH_SIZE);

            const batchResults = await Promise.all(
                batch.map(async (file) => {
                    try {
                        const streamUrl = await getDownloadLink(torrentId, file.id);
                        return {
                            id: file.id,
                            name: file.short_name || file.name,
                            size: file.size,
                            streamUrl: streamUrl || '',
                        };
                    } catch (error) {
                        console.error('Error getting URL for file:', file.name, error);
                        // Still return the file, just without URL - we can fetch on-demand
                        return {
                            id: file.id,
                            name: file.short_name || file.name,
                            size: file.size,
                            streamUrl: '',
                        };
                    }
                })
            );

            results.push(...batchResults);

            // Add delay between batches to avoid rate limiting
            if (i + BATCH_SIZE < files.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
            }

            // Log progress for large torrents
            if (files.length > 20 && (i + BATCH_SIZE) % 25 === 0) {
                console.log(`Fetched URLs for ${Math.min(i + BATCH_SIZE, files.length)}/${files.length} files...`);
            }
        }

        // For files without URLs, try to get them one more time (retry once)
        const filesWithoutUrls = results.filter(f => !f.streamUrl);
        if (filesWithoutUrls.length > 0 && filesWithoutUrls.length < results.length) {
            console.log(`Retrying ${filesWithoutUrls.length} failed files...`);

            for (const file of filesWithoutUrls) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 50));
                    const streamUrl = await getDownloadLink(torrentId, file.id);
                    if (streamUrl) {
                        const idx = results.findIndex(f => f.id === file.id);
                        if (idx !== -1) {
                            results[idx].streamUrl = streamUrl;
                        }
                    }
                } catch (error) {
                    // Still failed, keep empty URL
                }
            }
        }

        const validFiles = results.filter(f => f.streamUrl);
        console.log('Files with valid URLs:', validFiles.length, '/', results.length);

        return validFiles;
    } catch (error) {
        console.error('Error getting torrent files with URLs:', error);
        return [];
    }
};

/**
 * Get a quick stream URL directly using torrentId and fileId
 * This is optimized for fast playback - no file list fetching
 * @param torrentId - TorBox torrent ID
 * @param fileId - File ID within the torrent (optional)
 */
export const getQuickStreamUrl = async (
    torrentId: number,
    fileId?: number
): Promise<string | null> => {
    console.log('Getting quick stream URL for torrent:', torrentId, 'file:', fileId);
    return getDownloadLink(torrentId, fileId);
};

/**
 * Get torrent files directly by torrent ID (faster, more reliable)
 * Uses the specific torrent endpoint instead of fetching entire library
 * @param torrentId - TorBox torrent ID
 * @returns Array of files with metadata
 */
export const getTorrentFilesById = async (
    torrentId: number
): Promise<{ id: number; name: string; size: number }[]> => {
    try {
        console.log('Getting files for torrent ID:', torrentId);

        // Use the specific torrent endpoint with ID
        const response = await torboxFetch(`/torrents/mylist?id=${torrentId}&bypass_cache=true`);

        if (!response.ok) {
            console.error('Failed to get torrent by ID:', response.status);
            return [];
        }

        const data = await response.json();

        if (data.success && data.data) {
            // data.data can be an array or single torrent
            const torrents = Array.isArray(data.data) ? data.data : [data.data];
            const torrent = torrents.find((t: any) => t.id === torrentId);

            if (torrent && torrent.files && torrent.files.length > 0) {
                console.log('Found', torrent.files.length, 'files for torrent ID:', torrentId);
                return torrent.files.map((file: any) => ({
                    id: file.id,
                    name: file.short_name || file.name,
                    size: file.size,
                }));
            }
        }

        console.log('No files found for torrent ID:', torrentId);
        return [];
    } catch (error) {
        console.error('Error getting torrent files by ID:', error);
        return [];
    }
};

/**
 * Get torrent file list (metadata only, no stream URLs)
 * Used for fast file list display in video player
 * @param torrentId - TorBox torrent ID
 * @returns Array of files with metadata (no stream URLs)
 */
export const getTorrentFiles = async (
    torrentId: number
): Promise<{ id: number; name: string; size: number }[]> => {
    try {
        console.log('Getting file list for torrent:', torrentId);

        const torrents = await getUserTorrents();
        const torrent = torrents.find(t => t.id === torrentId);

        if (!torrent || !torrent.files || torrent.files.length === 0) {
            console.log('No files found for torrent');
            return [];
        }

        console.log('Found', torrent.files.length, 'files in torrent');

        // Return files with metadata only (no URL fetching)
        return torrent.files.map(file => ({
            id: file.id,
            name: file.short_name || file.name,
            size: file.size,
        }));
    } catch (error) {
        console.error('Error getting torrent files:', error);
        return [];
    }
};

