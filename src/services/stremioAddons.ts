// Stremio Addon Service
// Manages pre-built Stremio-compatible addons with TorBox integration

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@streamed_enabled_addons';
const CUSTOM_URLS_KEY = '@streamed_custom_addon_urls';

// Addon definition
export interface StremioAddon {
    id: string;
    name: string;
    description: string;
    icon: string;
    defaultEnabled: boolean;
    // URL builder - takes TorBox API key and returns base URL
    buildBaseUrl: (torboxApiKey: string) => string;
    // Whether this addon requires a custom manifest URL from user
    requiresManifestUrl?: boolean;
    // Configuration URL where user can generate their manifest
    configUrl?: string;
}

// Pre-built addon registry
export const ADDON_REGISTRY: StremioAddon[] = [
    {
        id: 'torrentio',
        name: 'Torrentio',
        description: 'Popular torrent indexer - configure debrid on website',
        icon: '🔥',
        defaultEnabled: false,
        requiresManifestUrl: true,
        configUrl: 'https://torrentio.strem.fun/configure',
        buildBaseUrl: () => '',
    },
    {
        id: 'comet',
        name: 'Comet',
        description: 'Fast indexer with debrid support',
        icon: '☄️',
        defaultEnabled: false,
        requiresManifestUrl: true,
        configUrl: 'https://comet.elfhosted.com/configure',
        buildBaseUrl: () => '',
    },
    {
        id: 'mediafusion',
        name: 'MediaFusion',
        description: 'Multi-source aggregator with debrid',
        icon: '🌀',
        defaultEnabled: false,
        requiresManifestUrl: true,
        configUrl: 'https://mediafusion.elfhosted.com/configure',
        buildBaseUrl: () => '',
    },
    {
        id: 'stremthru',
        name: 'StremThru',
        description: 'Debrid proxy service',
        icon: '🚀',
        defaultEnabled: false,
        requiresManifestUrl: true,
        configUrl: 'https://stremthru.elfhosted.com/configure',
        buildBaseUrl: () => '',
    },
    {
        id: 'jackettio',
        name: 'Jackettio',
        description: 'Jackett integration for Stremio',
        icon: '🎯',
        defaultEnabled: false,
        requiresManifestUrl: true,
        configUrl: 'https://jackettio.elfhosted.com/configure',
        buildBaseUrl: () => '',
    },
    {
        id: 'annatar',
        name: 'Annatar',
        description: 'Fast torrent indexer',
        icon: '💍',
        defaultEnabled: false,
        requiresManifestUrl: true,
        configUrl: 'https://annatar.elfhosted.com/configure',
        buildBaseUrl: () => '',
    },
    {
        id: 'knightcrawler',
        name: 'KnightCrawler',
        description: 'Torrent crawler with debrid',
        icon: '⚔️',
        defaultEnabled: false,
        requiresManifestUrl: true,
        configUrl: 'https://knightcrawler.elfhosted.com/configure',
        buildBaseUrl: () => '',
    },
    {
        id: 'custom',
        name: 'Custom Addon',
        description: 'Add any Stremio addon by manifest URL',
        icon: '➕',
        defaultEnabled: false,
        requiresManifestUrl: true,
        buildBaseUrl: () => '',
    },
];

// Stream response from Stremio addon
export interface StremioStream {
    name?: string;
    title?: string;
    description?: string;  // MediaFusion uses description for details
    infoHash?: string;
    url?: string;
    fileIdx?: number;
    behaviorHints?: {
        bingeGroup?: string;
        notWebReady?: boolean;
        filename?: string;    // MediaFusion provides filename
        videoSize?: number;   // MediaFusion provides file size in bytes
    };
    // Added for grouping by addon
    addonId?: string;
    addonName?: string;
    // Direct URL streams (from debrid-configured addons like MediaFusion/Comet)
    isDirectUrl?: boolean;
}

export interface AddonStreamResult {
    addonId: string;
    addonName: string;
    streams: StremioStream[];
    error?: string;
}

// Get enabled addon IDs from storage
export const getEnabledAddons = async (): Promise<string[]> => {
    try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
        // Return default enabled addons
        return ADDON_REGISTRY.filter(a => a.defaultEnabled).map(a => a.id);
    } catch (error) {
        console.error('Error loading enabled addons:', error);
        return ADDON_REGISTRY.filter(a => a.defaultEnabled).map(a => a.id);
    }
};

// Save enabled addon IDs to storage
export const setEnabledAddons = async (addonIds: string[]): Promise<boolean> => {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(addonIds));
        return true;
    } catch (error) {
        console.error('Error saving enabled addons:', error);
        return false;
    }
};

// Toggle a specific addon
export const toggleAddon = async (addonId: string, enabled: boolean): Promise<boolean> => {
    try {
        const current = await getEnabledAddons();
        let updated: string[];

        if (enabled) {
            updated = current.includes(addonId) ? current : [...current, addonId];
        } else {
            updated = current.filter(id => id !== addonId);
        }

        return await setEnabledAddons(updated);
    } catch (error) {
        console.error('Error toggling addon:', error);
        return false;
    }
};

// Get custom manifest URL for an addon
export const getCustomAddonUrl = async (addonId: string): Promise<string | null> => {
    try {
        const stored = await AsyncStorage.getItem(CUSTOM_URLS_KEY);
        if (stored) {
            const urls = JSON.parse(stored);
            return urls[addonId] || null;
        }
        return null;
    } catch (error) {
        console.error('Error getting custom addon URL:', error);
        return null;
    }
};

// Save custom manifest URL for an addon
export const setCustomAddonUrl = async (addonId: string, url: string): Promise<boolean> => {
    try {
        const stored = await AsyncStorage.getItem(CUSTOM_URLS_KEY);
        const urls = stored ? JSON.parse(stored) : {};
        urls[addonId] = url;
        await AsyncStorage.setItem(CUSTOM_URLS_KEY, JSON.stringify(urls));
        return true;
    } catch (error) {
        console.error('Error saving custom addon URL:', error);
        return false;
    }
};

// Clear custom manifest URL for an addon
export const clearCustomAddonUrl = async (addonId: string): Promise<boolean> => {
    try {
        const stored = await AsyncStorage.getItem(CUSTOM_URLS_KEY);
        if (stored) {
            const urls = JSON.parse(stored);
            delete urls[addonId];
            await AsyncStorage.setItem(CUSTOM_URLS_KEY, JSON.stringify(urls));
        }
        return true;
    } catch (error) {
        console.error('Error clearing custom addon URL:', error);
        return false;
    }
};

// Fetch streams from a single addon
const fetchFromAddon = async (
    addon: StremioAddon,
    type: 'movie' | 'series',
    id: string,
    torboxApiKey: string
): Promise<AddonStreamResult> => {
    try {
        let baseUrl: string;
        let queryParams: string | undefined;

        // Check if addon requires custom manifest URL
        if (addon.requiresManifestUrl) {
            const customUrl = await getCustomAddonUrl(addon.id);
            console.log(`[${addon.name}] Stored custom URL: ${customUrl ? customUrl.substring(0, 80) + '...' : 'NONE'}`);

            if (!customUrl) {
                console.log(`[${addon.name}] No custom URL configured, skipping`);
                return {
                    addonId: addon.id,
                    addonName: addon.name,
                    streams: [],
                    error: 'Not configured',
                };
            }

            // Parse the manifest URL like NuvioStreaming does
            // Extract query parameters if they exist
            const [urlPart, queryString] = customUrl.split('?');
            queryParams = queryString;

            // Remove trailing manifest.json and slashes
            let cleanBaseUrl = urlPart.replace(/\/manifest\.json$/i, '').replace(/\/$/, '');

            // Ensure URL has protocol
            if (!cleanBaseUrl.startsWith('http')) {
                cleanBaseUrl = `https://${cleanBaseUrl}`;
            }

            baseUrl = cleanBaseUrl;
            console.log(`[${addon.name}] Parsed base URL: ${baseUrl}`);
        } else {
            baseUrl = addon.buildBaseUrl(torboxApiKey);
            console.log(`[${addon.name}] Built base URL: ${baseUrl.substring(0, 50)}...`);
        }

        // Build the stream URL (following Stremio protocol)
        // Format: {baseUrl}/stream/{type}/{id}.json[?queryParams]
        // NuvioStreaming uses encodeURIComponent - this encodes colons in TV IDs
        const encodedId = encodeURIComponent(id);
        let url = `${baseUrl}/stream/${type}/${encodedId}.json`;

        // Append query params if present (from manifest URL)
        if (queryParams) {
            url += `?${queryParams}`;
        }

        console.log(`[${addon.name}] Full stream URL: ${url}`);

        // Add timeout for fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        console.log(`[${addon.name}] Starting fetch...`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
            },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        console.log(`[${addon.name}] Response status: ${response.status}`);

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error(`[${addon.name}] HTTP ${response.status}: ${errorText.substring(0, 200)}`);
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const streams = data.streams || [];

        console.log(`[${addon.name}] Found ${streams.length} streams`);

        // Debug: Log response details if no streams found
        if (streams.length === 0) {
            console.log(`[${addon.name}] Empty response body:`, JSON.stringify(data).substring(0, 200));
        } else {
            // Log first stream for debugging
            console.log(`[${addon.name}] First stream:`, JSON.stringify(streams[0]).substring(0, 150));
        }

        // Add addon info to each stream and detect direct URL streams
        const streamsWithAddon = streams.map((s: any) => {
            // Detect direct URL/debrid streams in multiple ways:
            // 1. Has url but no infoHash = definitely direct stream
            // 2. Has url containing debrid service domains
            // 3. behaviorHints.cached = true (some addons set this)
            const hasUrl = !!s.url;
            const hasHash = !!s.infoHash;

            // Check if URL contains known debrid domains
            const debridDomains = ['torbox', 'real-debrid', 'alldebrid', 'premiumize', 'debrid', 'cached'];
            const urlLower = (s.url || '').toLowerCase();
            const isDebridUrl = debridDomains.some(d => urlLower.includes(d));

            // Direct URL stream conditions:
            // - Has URL and no hash (definitely direct)
            // - OR has URL with debrid domain (resolved by debrid even if hash present)
            // - OR behaviorHints.cached is true
            const isDirectStream = (hasUrl && !hasHash) || isDebridUrl || s.behaviorHints?.cached === true;

            console.log(`[Stream] name: ${(s.name || s.title || '').substring(0, 40)}, hasUrl: ${hasUrl}, hasHash: ${hasHash}, isDebridUrl: ${isDebridUrl}, isDirectStream: ${isDirectStream}`);

            return {
                ...s,
                addonId: addon.id,
                addonName: addon.name,
                isDirectUrl: isDirectStream,
            };
        });

        return {
            addonId: addon.id,
            addonName: addon.name,
            streams: streamsWithAddon,
        };
    } catch (error: any) {
        console.error(`[${addon.name}] Error:`, error.message);
        return {
            addonId: addon.id,
            addonName: addon.name,
            streams: [],
            error: error.message,
        };
    }
};


// Fetch movie streams from all enabled addons
export const getMovieStreamsFromAddons = async (
    imdbId: string,
    torboxApiKey: string
): Promise<AddonStreamResult[]> => {
    const enabledIds = await getEnabledAddons();
    console.log('=== ADDON DEBUG ===');
    console.log('Enabled addon IDs:', enabledIds);
    console.log('Registry addon IDs:', ADDON_REGISTRY.map(a => a.id));

    const enabledAddons = ADDON_REGISTRY.filter(a => enabledIds.includes(a.id));

    if (enabledAddons.length === 0) {
        console.log('No addons enabled (or IDs dont match registry)');
        return [];
    }

    console.log(`Fetching from ${enabledAddons.length} addons:`, enabledAddons.map(a => a.name));

    // Fetch from all addons in parallel
    const results = await Promise.all(
        enabledAddons.map(addon => fetchFromAddon(addon, 'movie', imdbId, torboxApiKey))
    );

    return results;
};

// Fetch TV streams from all enabled addons
export const getTVStreamsFromAddons = async (
    imdbId: string,
    season: number,
    episode: number,
    torboxApiKey: string
): Promise<AddonStreamResult[]> => {
    const enabledIds = await getEnabledAddons();
    const enabledAddons = ADDON_REGISTRY.filter(a => enabledIds.includes(a.id));

    if (enabledAddons.length === 0) {
        console.log('No addons enabled');
        return [];
    }

    // Stremio TV format: imdbId:season:episode
    const stremioId = `${imdbId}:${season}:${episode}`;

    console.log(`Fetching TV from ${enabledAddons.length} addons:`, enabledAddons.map(a => a.name));

    // Fetch from all addons in parallel
    const results = await Promise.all(
        enabledAddons.map(addon => fetchFromAddon(addon, 'series', stremioId, torboxApiKey))
    );

    return results;
};

// Merge streams from multiple addons, deduplicate by infoHash, keeping addon source info
export const mergeAddonStreams = (results: AddonStreamResult[]): StremioStream[] => {
    const seenHashes = new Set<string>();
    const merged: StremioStream[] = [];

    for (const result of results) {
        for (const stream of result.streams) {
            const hash = stream.infoHash?.toLowerCase();
            if (hash && !seenHashes.has(hash)) {
                seenHashes.add(hash);
                // Stream already has addonId and addonName from fetchFromAddon
                merged.push(stream);
            } else if (!hash && stream.url) {
                // Direct URLs (no hash), add all
                merged.push(stream);
            }
        }
    }

    return merged;
};

// Group streams by addon name (for UI display)
export const groupStreamsByAddon = (streams: StremioStream[]): Map<string, StremioStream[]> => {
    const grouped = new Map<string, StremioStream[]>();

    for (const stream of streams) {
        const addonName = stream.addonName || 'Unknown';
        if (!grouped.has(addonName)) {
            grouped.set(addonName, []);
        }
        grouped.get(addonName)!.push(stream);
    }

    return grouped;
};

