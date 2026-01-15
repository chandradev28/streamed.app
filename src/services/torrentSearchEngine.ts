/**
 * Torrent Search Engine Service
 * Handles searching across multiple torrent engines and TorBox cloud
 */

import { StorageService } from './storage';
import { checkCached, addTorrent } from './torbox';
import { searchAllEnginesYaml, TorrentResultFromYaml } from './yamlEngineParser';

// Enable YAML-based engine parsing from GitLab
// Disabled for now - using hardcoded engines with proxy for reliability
const USE_YAML_PARSER = false;

// GitLab API for engine configs
const GITLAB_API = 'https://gitlab.com/api/v4/projects/mediacontent%2Fsearch-engines/repository';
const GITLAB_RAW = 'https://gitlab.com/mediacontent/search-engines/-/raw/main/torrents';

// Engine Config Interface (based on YAML structure)
export interface EngineConfig {
    id: string;
    displayName: string;
    icon: string;
    enabled: boolean;
    maxResults: number;
    capabilities: {
        keywordSearch: boolean;
        imdbSearch: boolean;
        seriesSupport: boolean;
    };
    api: {
        urls: {
            keyword: string;
            imdb?: string;
        };
    };
    queryParams: {
        paramName: string;
    };
}

// Torrent Result Interface
export interface TorrentResult {
    id: string;
    title: string;
    infoHash: string;
    magnetLink?: string;
    size: string;
    sizeBytes: number;
    seeders: number;
    leechers: number;
    source: string; // Engine ID (tcsv, yts, tpb)
    sourceDisplayName: string;
    date?: string;
    dateUnix?: number;
    isCached?: boolean;
}

// Search Results with metadata
export interface SearchResults {
    query: string;
    totalResults: number;
    resultsByEngine: Map<string, number>;
    results: TorrentResult[];
    cachedOnly: boolean;
}

// Default engines (fallback if GitLab fails)
const DEFAULT_ENGINES: EngineConfig[] = [
    {
        id: 'torrents_csv',
        displayName: 'Torrents CSV',
        icon: 'table_chart',
        enabled: true,
        maxResults: 100,
        capabilities: { keywordSearch: true, imdbSearch: false, seriesSupport: false },
        api: { urls: { keyword: 'https://torrents-csv.com/service/search' } },
        queryParams: { paramName: 'q' },
    },
    {
        id: 'yts',
        displayName: 'YTS',
        icon: 'movie_creation',
        enabled: true,
        maxResults: 50,
        capabilities: { keywordSearch: true, imdbSearch: true, seriesSupport: false },
        api: { urls: { keyword: 'https://yts.mx/api/v2/list_movies.json' } },
        queryParams: { paramName: 'query_term' },
    },
    {
        id: 'pirate_bay',
        displayName: 'The Pirate Bay',
        icon: 'sailing',
        enabled: true,
        maxResults: 100,
        capabilities: { keywordSearch: true, imdbSearch: false, seriesSupport: true },
        api: { urls: { keyword: 'https://apibay.org/q.php' } },
        queryParams: { paramName: 'q' },
    },
    {
        id: 'knaben',
        displayName: 'Knaben',
        icon: 'search',
        enabled: true,
        maxResults: 100,
        capabilities: { keywordSearch: true, imdbSearch: false, seriesSupport: true },
        api: { urls: { keyword: 'https://knaben.org/api.php' } },
        queryParams: { paramName: 'search' },
    },
    {
        id: 'solid_torrents',
        displayName: 'SolidTorrents',
        icon: 'cube',
        enabled: false, // Disabled - domain blocked and jina.ai can't resolve
        maxResults: 100,
        capabilities: { keywordSearch: true, imdbSearch: false, seriesSupport: true },
        api: { urls: { keyword: 'https://solidtorrents.to/api/v1/search' } },
        queryParams: { paramName: 'q' },
    },
];

// Storage keys
const ENGINE_SETTINGS_KEY = '@torboxers_engine_settings';
const CACHED_ONLY_KEY = '@torboxers_cached_only';

/**
 * Fetch available engines from GitLab
 */
export const fetchEngineList = async (): Promise<string[]> => {
    try {
        const response = await fetch(`${GITLAB_API}/tree?path=torrents&ref=main`);
        if (!response.ok) {
            console.log('GitLab API failed, using defaults');
            return DEFAULT_ENGINES.map(e => e.id);
        }

        const files = await response.json();
        return files
            .filter((f: any) => f.name.endsWith('.yaml') && !f.name.startsWith('_'))
            .map((f: any) => f.name.replace('.yaml', ''));
    } catch (error) {
        console.error('Error fetching engine list:', error);
        return DEFAULT_ENGINES.map(e => e.id);
    }
};

/**
 * Get enabled engines with settings
 */
export const getEnabledEngines = async (): Promise<EngineConfig[]> => {
    // For now, return default engines - later can load from storage
    return DEFAULT_ENGINES.filter(e => e.enabled);
};

/**
 * Format bytes to human readable
 */
const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Format unix timestamp to date
 */
const formatDate = (unix: number): string => {
    if (!unix) return '';
    const date = new Date(unix * 1000);
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
};

/**
 * Fetch via jina.ai proxy (for YTS, SolidTorrents)
 * jina.ai returns markdown but embeds JSON in code blocks - we need to extract it
 */
const jinaFetch = async (url: string): Promise<any | null> => {
    try {
        console.log(`Fetching via jina.ai: ${url}`);
        const jinaUrl = `https://r.jina.ai/${url}`;

        const response = await fetch(jinaUrl, {
            headers: {
                'Accept': 'text/plain',
            },
        });

        if (!response.ok) {
            console.log(`jina.ai returned ${response.status}`);
            return null;
        }

        const text = await response.text();

        // jina.ai wraps JSON in markdown code blocks like ```json ... ```
        // Extract JSON from the response
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch && jsonMatch[1]) {
            try {
                const parsed = JSON.parse(jsonMatch[1].trim());
                console.log('Successfully extracted JSON from jina response');
                return parsed;
            } catch (e) {
                console.log('Failed to parse extracted JSON');
            }
        }

        // Try parsing the whole response as JSON (in case jina returns raw JSON)
        try {
            const parsed = JSON.parse(text);
            return parsed;
        } catch (e) {
            console.log('Response is not JSON');
        }

        return null;
    } catch (error) {
        console.log('jinaFetch error:', error);
        return null;
    }
};

/**
 * Fetch with proxy for direct APIs (TPB doesn't need jina)
 * AllOrigins returns raw JSON
 */
const proxyFetch = async (url: string): Promise<Response | null> => {
    const proxies = [
        // Direct first - works when VPN is on or site is not blocked
        { type: 'direct', url: url },
        // AllOrigins - returns raw JSON
        { type: 'allorigins', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
    ];

    for (const proxy of proxies) {
        try {
            console.log(`Trying ${proxy.type}: ${url}`);
            const response = await fetch(proxy.url, {
                headers: {
                    'Accept': 'application/json',
                },
            });

            if (response.ok) {
                console.log(`Success with ${proxy.type}`);
                return response;
            }
        } catch (error) {
            console.log(`${proxy.type} failed:`, error);
        }
    }

    return null;
};

/**
 * Search Torrents CSV API
 */
const searchTorrentsCSV = async (query: string, maxResults: number): Promise<TorrentResult[]> => {
    try {
        const url = `https://torrents-csv.com/service/search?q=${encodeURIComponent(query)}&size=${maxResults}`;
        const response = await fetch(url);

        if (!response.ok) return [];

        const data = await response.json();
        const torrents = data.torrents || [];

        return torrents.map((t: any) => ({
            id: `tcsv_${t.infohash}`,
            title: t.name || 'Unknown',
            infoHash: t.infohash?.toLowerCase() || '',
            magnetLink: `magnet:?xt=urn:btih:${t.infohash}`,
            size: formatBytes(t.size_bytes || 0),
            sizeBytes: t.size_bytes || 0,
            seeders: t.seeders || 0,
            leechers: t.leechers || 0,
            source: 'tcsv',
            sourceDisplayName: 'Torrents CSV',
            date: formatDate(t.created_unix),
            dateUnix: t.created_unix || 0,
            isCached: false,
        }));
    } catch (error) {
        console.error('Torrents CSV search error:', error);
        return [];
    }
};

/**
 * Search YTS API (movies only) - Direct fetch to yts.lt (works without proxy!)
 */
const searchYTS = async (query: string, maxResults: number): Promise<TorrentResult[]> => {
    try {
        // Use yts.lt domain directly (faster than jina.ai proxy)
        const url = `https://yts.lt/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}&limit=${Math.min(maxResults, 50)}`;
        const response = await fetch(url);

        if (!response.ok) return [];

        const data = await response.json();

        if (!data || data.status !== 'ok' || !data.data?.movies) return [];

        const results: TorrentResult[] = [];

        for (const movie of data.data.movies) {
            for (const torrent of movie.torrents || []) {
                results.push({
                    id: `yts_${torrent.hash}`,
                    title: `${movie.title_long || movie.title} [${torrent.quality} ${torrent.type}]`,
                    infoHash: torrent.hash?.toLowerCase() || '',
                    magnetLink: `magnet:?xt=urn:btih:${torrent.hash}`,
                    size: formatBytes(torrent.size_bytes || 0),
                    sizeBytes: torrent.size_bytes || 0,
                    seeders: torrent.seeds || 0,
                    leechers: torrent.peers || 0,
                    source: 'yts',
                    sourceDisplayName: 'YTS',
                    date: formatDate(torrent.date_uploaded_unix),
                    dateUnix: torrent.date_uploaded_unix || 0,
                    isCached: false,
                });
            }
        }

        return results.slice(0, maxResults);
    } catch (error) {
        console.error('YTS search error:', error);
        return [];
    }
};

/**
 * Search The Pirate Bay API - Direct fetch works (tested via curl)
 */
const searchPirateBay = async (query: string, maxResults: number): Promise<TorrentResult[]> => {
    try {
        const url = `https://apibay.org/q.php?q=${encodeURIComponent(query)}`;
        const response = await proxyFetch(url);

        if (!response) return [];

        const data = await response.json();
        if (!data || !Array.isArray(data)) return [];

        // Filter out "No results" placeholder
        const torrents = data.filter((t: any) => t.id !== '0');

        return torrents.slice(0, maxResults).map((t: any) => ({
            id: `tpb_${t.info_hash}`,
            title: t.name || 'Unknown',
            infoHash: t.info_hash?.toLowerCase() || '',
            magnetLink: `magnet:?xt=urn:btih:${t.info_hash}`,
            size: formatBytes(parseInt(t.size) || 0),
            sizeBytes: parseInt(t.size) || 0,
            seeders: parseInt(t.seeders) || 0,
            leechers: parseInt(t.leechers) || 0,
            source: 'tpb',
            sourceDisplayName: 'The Pirate Bay',
            date: formatDate(parseInt(t.added)),
            dateUnix: parseInt(t.added) || 0,
            isCached: false,
        }));
    } catch (error) {
        console.error('Pirate Bay search error:', error);
        return [];
    }
};

/**
 * Search Knaben API (POST to api.knaben.org/v1)
 */
const searchKnaben = async (query: string, maxResults: number): Promise<TorrentResult[]> => {
    try {
        // Knaben uses POST with JSON body
        const url = 'https://api.knaben.org/v1';

        const body = {
            query: query,
            search_field: 'title',
            size: Math.min(maxResults, 100),
            hide_unsafe: true,
            hide_xxx: false,
        };

        console.log('Searching Knaben:', url);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            console.log('Knaben returned', response.status);
            return [];
        }

        const data = await response.json();
        const hits = data.hits || [];

        if (!Array.isArray(hits)) return [];

        return hits.slice(0, maxResults).map((t: any) => ({
            id: `knaben_${t.hash || t.id}`,
            title: t.title || t.name || 'Unknown',
            infoHash: (t.hash || t.infohash || '').toLowerCase(),
            magnetLink: `magnet:?xt=urn:btih:${t.hash}`,
            size: formatBytes(t.bytes || t.size || 0),
            sizeBytes: t.bytes || t.size || 0,
            seeders: parseInt(t.seeders) || 0,
            leechers: parseInt(t.peers || t.leechers) || 0,
            source: 'knaben',
            sourceDisplayName: 'Knaben',
            date: '',
            dateUnix: 0,
            isCached: false,
        }));
    } catch (error) {
        console.error('Knaben search error:', error);
        return [];
    }
};

/**
 * Search SolidTorrents API - Uses jina.ai like Debrify
 */
const searchSolidTorrents = async (query: string, maxResults: number): Promise<TorrentResult[]> => {
    try {
        // Use jina.ai proxy like Debrify does, with limit and sort params
        const url = `https://solidtorrents.to/api/v1/search?q=${encodeURIComponent(query)}&limit=100&sort=seeders`;
        const data = await jinaFetch(url);

        if (!data) return [];

        const torrents = data.results || [];

        return torrents.slice(0, maxResults).map((t: any) => ({
            id: `solid_${t.infohash || t._id}`,
            title: t.title || 'Unknown',
            infoHash: (t.infohash || '').toLowerCase(),
            magnetLink: t.magnet || `magnet:?xt=urn:btih:${t.infohash}`,
            size: formatBytes(t.size || 0),
            sizeBytes: t.size || 0,
            seeders: t.swarm?.seeders || t.seeders || 0,
            leechers: t.swarm?.leechers || t.leechers || 0,
            source: 'solid',
            sourceDisplayName: 'SolidTorrents',
            date: t.imported ? new Date(t.imported).toLocaleDateString('en-GB') : '',
            dateUnix: t.imported ? Math.floor(new Date(t.imported).getTime() / 1000) : 0,
            isCached: false,
        }));
    } catch (error) {
        console.error('SolidTorrents search error:', error);
        return [];
    }
};

/**
 * Search all enabled engines
 * @param query - Search query
 * @param cachedOnly - If true, only return TorBox cached results
 * @param engineSettings - Optional custom engine settings from UI (enabled, maxResults)
 */
export const searchAllEngines = async (
    query: string,
    cachedOnly: boolean = false,
    engineSettings?: { id: string; enabled: boolean; maxResults: number }[]
): Promise<SearchResults> => {
    console.log('=== searchAllEngines START ===');
    console.log('Query:', query, 'Cached Only:', cachedOnly, 'Use YAML:', USE_YAML_PARSER);
    console.log('Custom engine settings:', engineSettings ? engineSettings.length + ' engines' : 'using defaults');

    let resultsByEngine = new Map<string, number>();
    let allResults: TorrentResult[] = [];

    // Try YAML-based engines first
    if (USE_YAML_PARSER) {
        try {
            console.log('Trying YAML parser...');
            const yamlResults = await searchAllEnginesYaml(query, 100);

            if (yamlResults.totalResults > 0) {
                console.log('YAML parser returned', yamlResults.totalResults, 'results');
                resultsByEngine = yamlResults.resultsByEngine;
                // Convert TorrentResultFromYaml to TorrentResult (they're compatible)
                allResults = yamlResults.results as TorrentResult[];
            } else {
                console.log('YAML parser returned 0 results, falling back to hardcoded');
            }
        } catch (error) {
            console.error('YAML parser failed, falling back to hardcoded:', error);
        }
    }

    // Fall back to hardcoded engines if YAML returned nothing
    if (allResults.length === 0) {
        console.log('Using hardcoded engine searches...');

        // Get default engines and apply custom settings if provided
        let engines = await getEnabledEngines();

        if (engineSettings && engineSettings.length > 0) {
            // Override with custom settings from UI
            engines = engines.map(engine => {
                const customSetting = engineSettings.find(s => s.id === engine.id);
                if (customSetting) {
                    return {
                        ...engine,
                        enabled: customSetting.enabled,
                        maxResults: customSetting.maxResults,
                    };
                }
                return engine;
            }).filter(e => e.enabled); // Only search enabled engines
            console.log('Enabled engines:', engines.map(e => e.id).join(', '));
        }

        // Search in parallel across all enabled engines
        const searchPromises = engines.map(async (engine) => {
            let results: TorrentResult[] = [];

            switch (engine.id) {
                case 'torrents_csv':
                    results = await searchTorrentsCSV(query, engine.maxResults);
                    break;
                case 'yts':
                    results = await searchYTS(query, engine.maxResults);
                    break;
                case 'pirate_bay':
                    results = await searchPirateBay(query, engine.maxResults);
                    break;
                case 'knaben':
                    results = await searchKnaben(query, engine.maxResults);
                    break;
                case 'solid_torrents':
                    results = await searchSolidTorrents(query, engine.maxResults);
                    break;
            }

            return { engineId: engine.id, displayName: engine.displayName, results };
        });

        const engineResults = await Promise.all(searchPromises);

        for (const { engineId, displayName, results } of engineResults) {
            resultsByEngine.set(displayName, results.length);
            allResults.push(...results);
        }
    }

    console.log('Total results before cache check:', allResults.length);

    // If cached only mode, check which torrents are cached on TorBox global cloud
    if (cachedOnly && allResults.length > 0) {
        const hashes = allResults.map(r => r.infoHash).filter(h => h);
        console.log('Checking cache status for', hashes.length, 'hashes');

        const cacheStatus = await checkCached(hashes);

        // Mark cached results and filter
        allResults = allResults.map(r => ({
            ...r,
            isCached: cacheStatus.get(r.infoHash.toLowerCase()) || false,
        })).filter(r => r.isCached);

        console.log('Cached results:', allResults.length);

        // Recalculate resultsByEngine with cached-only counts
        resultsByEngine.clear();
        for (const result of allResults) {
            const current = resultsByEngine.get(result.sourceDisplayName) || 0;
            resultsByEngine.set(result.sourceDisplayName, current + 1);
        }
    }

    console.log('=== searchAllEngines END ===');

    return {
        query,
        totalResults: allResults.length,
        resultsByEngine,
        results: allResults,
        cachedOnly,
    };
};

/**
 * Sort search results
 */
export const sortResults = (
    results: TorrentResult[],
    sortBy: 'relevance' | 'name' | 'size' | 'seeders' | 'date'
): TorrentResult[] => {
    const sorted = [...results];

    switch (sortBy) {
        case 'name':
            sorted.sort((a, b) => a.title.localeCompare(b.title));
            break;
        case 'size':
            sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
            break;
        case 'seeders':
            sorted.sort((a, b) => b.seeders - a.seeders);
            break;
        case 'date':
            sorted.sort((a, b) => (b.dateUnix || 0) - (a.dateUnix || 0));
            break;
        case 'relevance':
        default:
            // Keep original order (already by relevance from engine)
            break;
    }

    return sorted;
};

/**
 * Add torrent to TorBox and return result
 */
export const addToTorBox = async (infoHash: string): Promise<boolean> => {
    try {
        const result = await addTorrent(infoHash);
        return result !== null;
    } catch (error) {
        console.error('Error adding to TorBox:', error);
        return false;
    }
};

/**
 * Get/Set cached only mode
 * FORCED ON: Always returns true - users can only see cached content
 * To restore user choice, uncomment the original logic below
 */
export const getCachedOnlyMode = async (): Promise<boolean> => {
    // FORCED ON - always return true
    return true;
    /* Original logic - uncomment to restore user choice:
    try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const value = await AsyncStorage.getItem(CACHED_ONLY_KEY);
        return value === 'true';
    } catch {
        return false;
    }
    */
};

export const setCachedOnlyMode = async (enabled: boolean): Promise<void> => {
    try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.setItem(CACHED_ONLY_KEY, enabled ? 'true' : 'false');
    } catch (error) {
        console.error('Error saving cached only mode:', error);
    }
};
