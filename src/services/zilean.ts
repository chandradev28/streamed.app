// Zilean API Service
// Zilean aggregates pre-cached torrents from DebridMediaManager users
// API: https://zileanfortheweebs.midnightignite.me

import { EnhancedStream } from './torrentio';

const ZILEAN_API = 'https://zileanfortheweebs.midnightignite.me';
const ZILEAN_TIMEOUT = 15000; // 15 seconds

// Zilean API response types
export interface ZileanResult {
    raw_title: string;
    parsed_title?: string | null;
    normalized_title?: string | null;
    info_hash: string;
    resolution?: string | null;
    quality?: string | null;
    size?: string | null;
    seasons?: number[] | null;
    episodes?: number[] | null;
    languages?: string[] | null;
    codec?: string | null;
    audio?: string[] | null;
    hdr?: string[] | null;
    imdb_id?: string | null;
    year?: number | null;
    group?: string | null;
}

/**
 * Search Zilean for movie torrents by IMDB ID
 */
export async function searchZileanMovie(imdbId: string): Promise<ZileanResult[]> {
    try {
        console.log('[Zilean] Searching for movie:', imdbId);

        const params = new URLSearchParams();
        params.set('ImdbId', imdbId);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), ZILEAN_TIMEOUT);

        const response = await fetch(`${ZILEAN_API}/dmm/filtered?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error('[Zilean] API error:', response.status, response.statusText);
            return [];
        }

        const results: ZileanResult[] = await response.json();
        console.log('[Zilean] Found', results.length, 'movie results');

        return results;
    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.error('[Zilean] Request timed out');
        } else {
            console.error('[Zilean] Error searching movie:', error.message);
        }
        return [];
    }
}

/**
 * Search Zilean for TV episode torrents by IMDB ID, season, and episode
 */
export async function searchZileanTV(
    imdbId: string,
    season: number,
    episode: number
): Promise<ZileanResult[]> {
    try {
        console.log('[Zilean] Searching for TV:', imdbId, 'S' + season + 'E' + episode);

        const params = new URLSearchParams();
        params.set('ImdbId', imdbId);
        params.set('Season', season.toString());
        params.set('Episode', episode.toString());

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), ZILEAN_TIMEOUT);

        const response = await fetch(`${ZILEAN_API}/dmm/filtered?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error('[Zilean] API error:', response.status, response.statusText);
            return [];
        }

        const results: ZileanResult[] = await response.json();
        console.log('[Zilean] Found', results.length, 'TV results');

        return results;
    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.error('[Zilean] Request timed out');
        } else {
            console.error('[Zilean] Error searching TV:', error.message);
        }
        return [];
    }
}

/**
 * Parse size string to bytes for display
 */
function parseSizeString(sizeStr: string | null | undefined): string {
    if (!sizeStr) return '';
    // Already formatted like "15.2 GB"
    return sizeStr;
}

/**
 * Extract quality from resolution/quality fields
 */
function extractQuality(result: ZileanResult): string {
    if (result.resolution) {
        // Normalize resolution to standard format
        const res = result.resolution.toLowerCase();
        if (res.includes('2160') || res.includes('4k')) return '4K';
        if (res.includes('1080')) return '1080p';
        if (res.includes('720')) return '720p';
        if (res.includes('480')) return '480p';
        return result.resolution;
    }
    if (result.quality) {
        return result.quality;
    }
    return 'Unknown';
}

/**
 * Convert bytes to human-readable format
 */
function formatBytes(bytes: string | null | undefined): string {
    if (!bytes) return '';
    const num = parseInt(bytes, 10);
    if (isNaN(num)) return '';

    if (num >= 1073741824) {
        return (num / 1073741824).toFixed(2) + ' GB';
    } else if (num >= 1048576) {
        return (num / 1048576).toFixed(2) + ' MB';
    } else if (num >= 1024) {
        return (num / 1024).toFixed(2) + ' KB';
    }
    return num + ' B';
}

/**
 * Build description string from Zilean result metadata
 */
function buildDescription(result: ZileanResult): string {
    const parts: string[] = [];

    // Format size from bytes to human-readable
    const formattedSize = formatBytes(result.size);
    if (formattedSize) {
        parts.push(formattedSize);
    }

    if (result.codec) {
        parts.push(result.codec.toUpperCase());
    }

    if (result.audio && result.audio.length > 0) {
        parts.push(result.audio.join('/'));
    }

    if (result.hdr && result.hdr.length > 0) {
        parts.push(result.hdr.join('/'));
    }

    if (result.quality) {
        parts.push(result.quality);
    }

    if (result.languages && result.languages.length > 0 && result.languages.length <= 3) {
        parts.push(result.languages.map(l => l.toUpperCase()).join('/'));
    }

    if (result.group) {
        parts.push(result.group);
    }

    return parts.join(' • ');
}

/**
 * Convert Zilean results to EnhancedStream format for compatibility with existing UI
 */
export function convertZileanToStreams(results: ZileanResult[]): EnhancedStream[] {
    return results.map((result, index) => {
        const quality = extractQuality(result);
        const description = buildDescription(result);

        // Build title with quality info
        let title = result.raw_title || result.parsed_title || 'Zilean Stream';

        // Truncate very long titles
        if (title.length > 100) {
            title = title.substring(0, 97) + '...';
        }

        // Include quality in the name for display
        const stream: EnhancedStream = {
            name: `⚡ Zilean • ${quality}`,
            title: title,
            url: '', // Will be resolved via TorBox using infoHash
            infoHash: result.info_hash,
            description: description, // Contains size, codec, audio, etc.
            addonName: 'Zilean',
            addonId: 'zilean',
            behaviorHints: {
                bingeGroup: `zilean-${result.info_hash}`,
            },
        };

        return stream;
    });
}

/**
 * Fetch and convert Zilean movie streams, optionally filtering for TorBox-cached only
 * @param imdbId - IMDB ID of the movie
 * @param torboxApiKey - Optional TorBox API key for cache checking
 * @param cachedOnly - If true, only return results cached on TorBox
 */
export async function fetchZileanMovieStreams(
    imdbId: string,
    torboxApiKey?: string,
    cachedOnly: boolean = false
): Promise<EnhancedStream[]> {
    const results = await searchZileanMovie(imdbId);
    let streams = convertZileanToStreams(results);

    // If we have a TorBox API key and cachedOnly is true, filter for cached results
    if (torboxApiKey && cachedOnly && streams.length > 0) {
        try {
            // Import dynamically to avoid circular dependency
            const { checkCached } = await import('./torbox');
            const hashes = streams.map(s => s.infoHash).filter((h): h is string => !!h);

            if (hashes.length > 0) {
                console.log('[Zilean] Checking TorBox cache for', hashes.length, 'hashes');
                const cachedMap = await checkCached(hashes);

                // Filter to only cached streams
                const cachedStreams = streams.filter(s => {
                    if (!s.infoHash) return false;
                    return cachedMap.get(s.infoHash.toLowerCase()) === true;
                });

                console.log('[Zilean] TorBox cached:', cachedStreams.length, 'of', streams.length);
                streams = cachedStreams;
            }
        } catch (err: any) {
            console.error('[Zilean] TorBox cache check failed:', err.message);
            // Return all streams if cache check fails
        }
    }

    return streams;
}

/**
 * Fetch and convert Zilean TV streams, optionally filtering for TorBox-cached only
 * @param imdbId - IMDB ID of the show
 * @param season - Season number
 * @param episode - Episode number
 * @param torboxApiKey - Optional TorBox API key for cache checking
 * @param cachedOnly - If true, only return results cached on TorBox
 */
export async function fetchZileanTVStreams(
    imdbId: string,
    season: number,
    episode: number,
    torboxApiKey?: string,
    cachedOnly: boolean = false
): Promise<EnhancedStream[]> {
    const results = await searchZileanTV(imdbId, season, episode);
    let streams = convertZileanToStreams(results);

    // If we have a TorBox API key and cachedOnly is true, filter for cached results
    if (torboxApiKey && cachedOnly && streams.length > 0) {
        try {
            // Import dynamically to avoid circular dependency
            const { checkCached } = await import('./torbox');
            const hashes = streams.map(s => s.infoHash).filter((h): h is string => !!h);

            if (hashes.length > 0) {
                console.log('[Zilean] Checking TorBox cache for', hashes.length, 'hashes');
                const cachedMap = await checkCached(hashes);

                // Filter to only cached streams
                const cachedStreams = streams.filter(s => {
                    if (!s.infoHash) return false;
                    return cachedMap.get(s.infoHash.toLowerCase()) === true;
                });

                console.log('[Zilean] TorBox cached:', cachedStreams.length, 'of', streams.length);
                streams = cachedStreams;
            }
        } catch (err: any) {
            console.error('[Zilean] TorBox cache check failed:', err.message);
            // Return all streams if cache check fails
        }
    }

    return streams;
}

/**
 * Test Zilean API connection
 */
export async function testZileanConnection(): Promise<{ success: boolean; latency: number; error?: string }> {
    try {
        const startTime = Date.now();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${ZILEAN_API}/healthchecks/ping`, {
            method: 'GET',
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const latency = Date.now() - startTime;

        if (response.ok) {
            return { success: true, latency };
        } else {
            return { success: false, latency, error: `HTTP ${response.status}` };
        }
    } catch (error: any) {
        return {
            success: false,
            latency: 0,
            error: error.name === 'AbortError' ? 'Timeout' : error.message
        };
    }
}
