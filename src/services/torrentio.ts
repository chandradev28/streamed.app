// Torrentio API Service
// Torrentio is a Stremio addon that provides torrent streams from public trackers

const TORRENTIO_BASE_URL = 'https://torrentio.strem.fun';

export interface TorrentStream {
    name: string;
    title: string;
    description?: string;  // MediaFusion uses description for details
    infoHash?: string;     // Optional - direct URL streams may not have this
    url?: string;          // Direct streaming URL (MediaFusion/Comet with debrid)
    fileIdx?: number;
    behaviorHints?: {
        bingeGroup?: string;
        notWebReady?: boolean;
        filename?: string;    // MediaFusion provides filename
        videoSize?: number;   // MediaFusion provides file size in bytes
    };
    // Addon source info (added by stremioAddons.ts)
    addonId?: string;
    addonName?: string;
}

export interface TorrentioResponse {
    streams: TorrentStream[];
}

export interface IndexerStatus {
    name: string;
    status: 'online' | 'offline' | 'slow';
    responseTime: number;
    lastChecked: Date;
}

// List of indexers/trackers that Torrentio uses
export const INDEXERS = [
    { id: '1337x', name: '1337x' },
    { id: 'yts', name: 'YTS' },
    { id: 'tpb', name: 'The Pirate Bay' },
    { id: 'rarbg', name: 'RARBG' },
    { id: 'eztv', name: 'EZTV' },
    { id: 'nyaa', name: 'Nyaa' },
    { id: 'kickass', name: 'KickassTorrents' },
];

/**
 * Get torrent streams for a movie by IMDB ID
 */
export const getMovieStreams = async (imdbId: string): Promise<TorrentioResponse> => {
    try {
        const response = await fetch(`${TORRENTIO_BASE_URL}/stream/movie/${imdbId}.json`);
        if (!response.ok) {
            throw new Error(`Torrentio error: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching movie streams:', error);
        return { streams: [] };
    }
};

/**
 * Get torrent streams for a TV show episode by IMDB ID and season/episode
 */
export const getTVStreams = async (
    imdbId: string,
    season: number,
    episode: number
): Promise<TorrentioResponse> => {
    try {
        // Format: series/{imdbId}:{season}:{episode}.json
        const response = await fetch(
            `${TORRENTIO_BASE_URL}/stream/series/${imdbId}:${season}:${episode}.json`
        );
        if (!response.ok) {
            throw new Error(`Torrentio error: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching TV streams:', error);
        return { streams: [] };
    }
};

/**
 * Parse stream info from Torrentio stream name
 */
export interface ParsedStreamInfo {
    source: string;
    quality: string;
    size: string;
    seeders: string;
    fullTitle: string;
    // Enhanced info
    codec: string | null;      // hevc, x265, x264, av1
    hdr: string | null;        // DV, HDR, HDR10, HDR10+
    audio: string | null;      // Atmos, DTS, DTS-HD, TrueHD, AAC
    sourceType: string | null; // WEB-DL, BluRay, HDTV, CAM
    languages: string[];       // EN, IT, ES, etc.
    isCached: boolean;         // TorBox/RealDebrid cached
}

export const parseStreamInfo = (stream: TorrentStream): ParsedStreamInfo => {
    // Try to get text from multiple fields (addons use name/description, Torrentio uses title)
    const title = stream.title || '';
    const name = (stream as any).name || '';
    const description = (stream as any).description || '';

    // Combine all available text for parsing
    const fullText = `${name}\n${title}\n${description}`;
    const lines = fullText.split('\n').filter(l => l.trim());

    // Extract quality (720p, 1080p, 4K, etc.)
    const qualityMatch = fullText.match(/(\d{3,4}p|4K|2160p)/i);
    let quality = qualityMatch ? qualityMatch[1].toUpperCase() : 'Unknown';
    if (quality === '2160P') quality = '4K';

    // Extract size - look for patterns like "2.5 GB" or "1.5GB" or "📦 5.0 GB"
    const sizeMatch = fullText.match(/(\d+\.?\d*)\s*(GB|MB|TB)/i);
    const size = sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}` : 'Unknown';

    // Extract seeders - patterns like "👤 123" or "S:123" or "Seeders: 123" or "🌱 45"
    const seedersMatch = fullText.match(/(?:👤|🌱|S:|Seeders?:?)\s*(\d+)/i);
    const seeders = seedersMatch ? seedersMatch[1] : '0';

    // Extract codec (hevc, x265, x264, av1, h264, h265)
    let codec: string | null = null;
    const codecMatch = fullText.match(/\b(hevc|x265|h\.?265|x264|h\.?264|av1|xvid|divx)\b/i);
    if (codecMatch) {
        const c = codecMatch[1].toLowerCase();
        if (c.includes('265') || c === 'hevc') codec = 'HEVC';
        else if (c.includes('264')) codec = 'x264';
        else if (c === 'av1') codec = 'AV1';
        else codec = c.toUpperCase();
    }

    // Extract HDR info (DV, Dolby Vision, HDR, HDR10, HDR10+)
    let hdr: string | null = null;
    if (/\b(dolby\s*vision|dovi|dv)\b/i.test(fullText)) hdr = 'DV';
    else if (/\bhdr10\+/i.test(fullText)) hdr = 'HDR10+';
    else if (/\bhdr10\b/i.test(fullText)) hdr = 'HDR10';
    else if (/\bhdr\b/i.test(fullText)) hdr = 'HDR';

    // Extract audio info (Atmos, DTS, TrueHD, AAC, AC3, EAC3)
    let audio: string | null = null;
    if (/\b(atmos)\b/i.test(fullText)) audio = 'Atmos';
    else if (/\b(dts[-\s]?hd|dts[-\s]?ma)\b/i.test(fullText)) audio = 'DTS-HD';
    else if (/\b(truehd)\b/i.test(fullText)) audio = 'TrueHD';
    else if (/\b(dts)\b/i.test(fullText)) audio = 'DTS';
    else if (/\b(dd\+|ddp|e[-\s]?ac[-\s]?3|eac3)\b/i.test(fullText)) audio = 'DD+';
    else if (/\b(dd5\.?1|ac[-\s]?3)\b/i.test(fullText)) audio = 'DD';
    else if (/\b(aac)\b/i.test(fullText)) audio = 'AAC';

    // Extract source type (WEB-DL, BluRay, HDTV, etc.)
    let sourceType: string | null = null;
    if (/\b(web[-\s]?dl)\b/i.test(fullText)) sourceType = 'WEB-DL';
    else if (/\b(webrip)\b/i.test(fullText)) sourceType = 'WEBRip';
    else if (/\b(blu[-\s]?ray|bdrip|brrip|bdremux)\b/i.test(fullText)) sourceType = 'BluRay';
    else if (/\b(hdtv)\b/i.test(fullText)) sourceType = 'HDTV';
    else if (/\b(dvdrip)\b/i.test(fullText)) sourceType = 'DVDRip';
    else if (/\b(cam|hdcam|ts|telesync|hdts)\b/i.test(fullText)) sourceType = 'CAM';
    else if (/\b(remux)\b/i.test(fullText)) sourceType = 'Remux';

    // Extract languages - look for common language codes and flags
    const languages: string[] = [];
    const langPatterns = [
        { pattern: /\b(english|eng)\b/i, code: 'EN' },
        { pattern: /\b(italian|ita)\b/i, code: 'IT' },
        { pattern: /\b(spanish|spa|esp)\b/i, code: 'ES' },
        { pattern: /\b(french|fra|fre)\b/i, code: 'FR' },
        { pattern: /\b(german|ger|deu)\b/i, code: 'DE' },
        { pattern: /\b(portuguese|por)\b/i, code: 'PT' },
        { pattern: /\b(russian|rus)\b/i, code: 'RU' },
        { pattern: /\b(hindi|hin)\b/i, code: 'HI' },
        { pattern: /\b(japanese|jpn)\b/i, code: 'JA' },
        { pattern: /\b(korean|kor)\b/i, code: 'KO' },
        { pattern: /\b(chinese|chi|zho)\b/i, code: 'ZH' },
        { pattern: /\b(multi)\b/i, code: 'Multi' },
    ];
    for (const { pattern, code } of langPatterns) {
        if (pattern.test(fullText) && !languages.includes(code)) {
            languages.push(code);
        }
    }
    // Also check for language flags like 🇬🇧 🇮🇹 or short codes GB/IT
    const flagMatch = fullText.match(/\b([A-Z]{2})\/([A-Z]{2})\b/);
    if (flagMatch) {
        if (!languages.includes(flagMatch[1])) languages.push(flagMatch[1]);
        if (!languages.includes(flagMatch[2])) languages.push(flagMatch[2]);
    }

    // Check if cached (TorBox, RealDebrid indicators)
    const isCached = /\b(⚡|cached|instant|tb|torbox|rd|realdebrid)\b/i.test(fullText) ||
        (stream as any).behaviorHints?.cached === true;

    // Get source/release name - prefer name field, then first meaningful line
    let source = 'Unknown';
    if (name && name.trim()) {
        source = name.trim();
    } else if (lines[0]) {
        source = lines[0].replace(/\[.*?\]/g, '').trim() || 'Unknown';
    }

    // Get full title for display (clean release name)
    const fullTitle = name || lines[0] || title || 'Unknown';

    return {
        source,
        quality,
        size,
        seeders,
        fullTitle,
        codec,
        hdr,
        audio,
        sourceType,
        languages,
        isCached
    };
};

/**
 * Check the status of Torrentio/indexers
 */
export const checkIndexerStatus = async (): Promise<IndexerStatus[]> => {
    const results: IndexerStatus[] = [];

    // Test Torrentio with a known movie (The Matrix - tt0133093)
    const testImdbId = 'tt0133093';

    for (const indexer of INDEXERS) {
        const startTime = Date.now();
        let status: 'online' | 'offline' | 'slow' = 'offline';
        let responseTime = 0;

        try {
            const response = await fetch(
                `${TORRENTIO_BASE_URL}/${indexer.id}/stream/movie/${testImdbId}.json`,
                {
                    method: 'HEAD',
                    signal: AbortSignal.timeout(5000) // 5 second timeout
                }
            );

            responseTime = Date.now() - startTime;

            if (response.ok) {
                status = responseTime > 2000 ? 'slow' : 'online';
            }
        } catch (error) {
            responseTime = Date.now() - startTime;
            status = 'offline';
        }

        results.push({
            name: indexer.name,
            status,
            responseTime,
            lastChecked: new Date(),
        });
    }

    return results;
};

/**
 * Quick health check for Torrentio service
 */
export const checkTorrentioHealth = async (): Promise<{
    isOnline: boolean;
    responseTime: number;
    streamCount: number;
}> => {
    const startTime = Date.now();

    try {
        // Test with The Matrix (tt0133093)
        const response = await getMovieStreams('tt0133093');
        const responseTime = Date.now() - startTime;

        return {
            isOnline: response.streams.length > 0,
            responseTime,
            streamCount: response.streams.length,
        };
    } catch (error) {
        return {
            isOnline: false,
            responseTime: Date.now() - startTime,
            streamCount: 0,
        };
    }
};

// ============================================================
// TorBox Integration - Background service for instant streams
// ============================================================

import { isTorBoxAvailable, checkCached, getInstantStreamUrl } from './torbox';

export interface EnhancedStream extends TorrentStream {
    isCached?: boolean;
    instantStreamUrl?: string;
    isDirectUrl?: boolean;  // True for MediaFusion/Comet debrid streams
}

/**
 * Get streams with TorBox cache status
 * This is a background process that enhances streams with cache info
 * @param streams - Raw streams from Torrentio
 * @returns Enhanced streams with cache status
 */
export const enhanceStreamsWithTorBox = async (
    streams: TorrentStream[]
): Promise<EnhancedStream[]> => {
    // Check if TorBox is configured
    const torboxAvailable = await isTorBoxAvailable();

    if (!torboxAvailable || streams.length === 0) {
        // Return streams without TorBox enhancement
        return streams.map(s => ({ ...s, isCached: false }));
    }

    try {
        // Get all info hashes (filter out undefined)
        const hashes = streams.map(s => s.infoHash).filter((h): h is string => !!h);

        // Check cache status for all hashes
        const cacheStatus = await checkCached(hashes);

        // Enhance streams with cache info
        return streams.map(stream => ({
            ...stream,
            isCached: cacheStatus.get(stream.infoHash?.toLowerCase() || '') || false,
        }));
    } catch (error) {
        console.error('Error enhancing streams with TorBox:', error);
        return streams.map(s => ({ ...s, isCached: false }));
    }
};

/**
 * Get the best stream URL for playback
 * Prioritizes TorBox cached streams for instant playback
 * Falls back to info hash for regular torrent streaming
 * @param stream - The stream to get URL for
 * @returns Object with stream URL or info hash
 */
export const getPlayableStream = async (
    stream: TorrentStream
): Promise<{
    type: 'instant' | 'torrent';
    url?: string;
    infoHash?: string;
    fileIdx?: number;
}> => {
    const torboxAvailable = await isTorBoxAvailable();

    if (torboxAvailable && stream.infoHash) {
        try {
            // Try to get instant stream from TorBox
            const instantUrl = await getInstantStreamUrl(stream.infoHash, stream.fileIdx);

            if (instantUrl) {
                return {
                    type: 'instant',
                    url: instantUrl,
                };
            }
        } catch (error) {
            console.error('Error getting TorBox stream:', error);
        }
    }

    // Fallback to regular torrent info hash
    return {
        type: 'torrent',
        infoHash: stream.infoHash,
        fileIdx: stream.fileIdx,
    };
};

/**
 * Get movie streams with TorBox integration
 * Automatically fetches and enhances streams with cache status
 */
export const getMovieStreamsWithTorBox = async (
    imdbId: string
): Promise<EnhancedStream[]> => {
    const streams = await getMovieStreams(imdbId);
    return enhanceStreamsWithTorBox(streams.streams);
};

/**
 * Get TV streams with TorBox integration
 * Automatically fetches and enhances streams with cache status  
 */
export const getTVStreamsWithTorBox = async (
    imdbId: string,
    season: number,
    episode: number
): Promise<EnhancedStream[]> => {
    const streams = await getTVStreams(imdbId, season, episode);
    return enhanceStreamsWithTorBox(streams.streams);
};

/**
 * Get ONLY cached TV streams using Torrentio's TorBox provider
 * This uses Torrentio's built-in TorBox integration which only returns cached results
 * Falls back to fetching all streams and checking cache if needed
 * @param imdbId - IMDB ID of the TV show
 * @param season - Season number
 * @param episode - Episode number
 * @param torboxApiKey - TorBox API key
 */
export const getTVCachedOnlyStreams = async (
    imdbId: string,
    season: number,
    episode: number,
    torboxApiKey: string
): Promise<EnhancedStream[]> => {
    console.log('=== getTVCachedOnlyStreams CALLED ===');
    console.log('Parameters: IMDB=' + imdbId + ', S=' + season + ', E=' + episode);
    console.log('API Key length:', torboxApiKey?.length || 0);

    try {
        // Check if multi-source addons are enabled
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const addonsEnabled = await AsyncStorage.getItem('@streamed_addons_enabled');

        // ADDONS MODE: Only use installed addons from stremioService, NO fallback to indexer
        if (addonsEnabled !== 'false') {
            const { stremioService } = require('./stremioService');
            const hasAddons = await stremioService.hasStreamAddons();

            console.log('=== ADDONS MODE (TV) ===');
            console.log('Has installed addons:', hasAddons);

            if (!hasAddons) {
                console.log('No addons installed - returning empty');
                return [];  // No fallback to indexer
            }

            const streams = await stremioService.getTVStreams(imdbId, season, episode);
            console.log('stremioService TV results:', streams.length, 'streams');

            // Convert to EnhancedStream format
            const allStreams: EnhancedStream[] = streams.map((stream: any) => ({
                ...stream,
                title: stream.title || stream.name || '',
                infoHash: stream.infoHash || '',
                url: stream.url,
                isCached: stream.isCached || stream.isDirectUrl || false,
                isDirectUrl: stream.isDirectUrl || false,
                addonId: stream.addonId,
                addonName: stream.addonName,
            }));

            console.log('Addon mode TV results:', allStreams.length, 'streams');
            return allStreams;  // Return addon results (even if empty, no fallback)
        }

        // INDEXER MODE: Addons disabled, use Torrentio with TorBox cache check
        console.log('=== INDEXER MODE (TV) ===');

        // Single-source mode: Use Torrentio's TorBox provider URL (returns only cached torrents)
        const torboxUrl = `${TORRENTIO_BASE_URL}/torbox=${torboxApiKey}/stream/series/${imdbId}:${season}:${episode}.json`;

        console.log('TorBox Torrentio URL:', torboxUrl.substring(0, 80) + '...');

        // Import dohFetch dynamically to avoid circular dependencies
        const { dohFetch } = require('./doh');

        // Add timeout of 15 seconds
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        let streams: EnhancedStream[] = [];

        try {
            console.log('Making fetch request to Torrentio...');
            const response = await dohFetch(torboxUrl, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' },
            });

            clearTimeout(timeoutId);
            console.log('Torrentio TorBox response status:', response.status);

            if (response.ok) {
                const data = await response.json();
                console.log('Response data:', JSON.stringify(data).substring(0, 300));
                console.log('Response streams count:', data.streams?.length || 0);

                if (data.streams && data.streams.length > 0) {
                    streams = parseStreamsWithHash(data.streams);
                    console.log('Parsed streams with hash:', streams.length);
                }
            } else {
                console.log('Torrentio response not OK:', response.status);
                const text = await response.text();
                console.log('Response text:', text.substring(0, 200));
            }
        } catch (e: any) {
            clearTimeout(timeoutId);
            console.log('TorBox provider request failed:', e.message);
        }

        // If no results from TorBox provider, try fallback: get all streams
        if (streams.length === 0) {
            console.log('=== FALLBACK: Fetching all streams + TorBox cache check ===');
            streams = await getStreamsWithCacheCheck(imdbId, season, episode, torboxApiKey);
        }

        console.log('Total cached streams found:', streams.length);
        return streams;

    } catch (error: any) {
        console.error('Error in getTVCachedOnlyStreams:', error.message || error);
        return [];
    }
};


/**
 * Fallback method: Get all streams from Torrentio and check TorBox cache
 */
const getStreamsWithCacheCheck = async (
    imdbId: string,
    season: number,
    episode: number,
    torboxApiKey: string
): Promise<EnhancedStream[]> => {
    console.log('=== getStreamsWithCacheCheck START ===');
    console.log('IMDB:', imdbId, 'S' + season + 'E' + episode);

    try {
        const { dohFetch } = require('./doh');
        const { checkCached } = require('./torbox');

        // Fetch regular Torrentio streams (without any debrid filter)
        const url = `${TORRENTIO_BASE_URL}/stream/series/${imdbId}:${season}:${episode}.json`;

        console.log('Fetching Torrentio URL:', url);
        const response = await dohFetch(url);

        console.log('Torrentio response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.log('Torrentio response not OK:', response.status, errorText.substring(0, 200));
            return [];
        }

        const data = await response.json();
        console.log('Torrentio streams count:', data.streams?.length || 0);

        if (data.streams && data.streams.length > 0) {
            console.log('First stream sample:', JSON.stringify(data.streams[0]).substring(0, 300));
        }

        if (!data.streams || data.streams.length === 0) {
            console.log('No streams returned from Torrentio');
            return [];
        }

        // Parse streams to get infoHashes
        const parsedStreams = parseStreamsWithHash(data.streams);
        const hashes = parsedStreams
            .map(s => s.infoHash)
            .filter(h => h && h.length === 40) as string[];

        console.log('Parsed streams:', parsedStreams.length, 'Valid hashes:', hashes.length);

        if (hashes.length === 0) {
            console.log('No valid hashes extracted from streams');
            return [];
        }

        // Check which hashes are cached on TorBox
        console.log('Checking TorBox cache for', hashes.length, 'hashes...');
        const cachedMap = await checkCached(hashes);

        // Filter to only cached streams
        const cachedStreams = parsedStreams.filter(stream => {
            const hash = stream.infoHash?.toLowerCase();
            return hash && cachedMap.get(hash);
        }).map(stream => ({
            ...stream,
            isCached: true,
        }));

        console.log('Cached streams found:', cachedStreams.length, 'of', parsedStreams.length);
        console.log('=== getStreamsWithCacheCheck END ===');
        return cachedStreams;

    } catch (error: any) {
        console.error('Error in cache check fallback:', error.message || error);
        console.log('=== getStreamsWithCacheCheck END (error) ===');
        return [];
    }
};

/**
 * Helper function to parse streams and extract infoHash
 */
const parseStreamsWithHash = (streams: any[]): EnhancedStream[] => {
    return streams.map((stream: any) => {
        let infoHash = stream.infoHash;

        // Extract from URL if not present
        if (!infoHash && stream.url) {
            const urlMatch = stream.url.match(/\/([a-fA-F0-9]{40})/);
            if (urlMatch) infoHash = urlMatch[1];
        }

        // Extract from behaviorHints
        if (!infoHash && stream.behaviorHints?.bingeGroup) {
            const bingeMatch = stream.behaviorHints.bingeGroup.match(/([a-fA-F0-9]{40})/);
            if (bingeMatch) infoHash = bingeMatch[1];
        }

        return {
            ...stream,
            infoHash,
            isCached: true,
        };
    });
};
/**
 * Get ONLY cached movie streams using Torrentio's TorBox provider
 */
export const getMovieCachedOnlyStreams = async (
    imdbId: string,
    torboxApiKey: string
): Promise<EnhancedStream[]> => {
    try {
        // Check if multi-source addons are enabled
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const addonsEnabled = await AsyncStorage.getItem('@streamed_addons_enabled');

        // ADDONS MODE: Only use installed addons from stremioService, NO fallback to indexer
        if (addonsEnabled !== 'false') {
            const { stremioService } = require('./stremioService');
            const hasAddons = await stremioService.hasStreamAddons();

            console.log('=== ADDONS MODE (Movie) ===');
            console.log('Has installed addons:', hasAddons);

            if (!hasAddons) {
                console.log('No addons installed - returning empty');
                return [];  // No fallback to indexer
            }

            const streams = await stremioService.getMovieStreams(imdbId);
            console.log('stremioService movie results:', streams.length, 'streams');

            // Convert to EnhancedStream format
            const allStreams: EnhancedStream[] = streams.map((stream: any) => ({
                ...stream,
                title: stream.title || stream.name || '',
                infoHash: stream.infoHash || '',
                url: stream.url,
                isCached: stream.isCached || stream.isDirectUrl || false,
                isDirectUrl: stream.isDirectUrl || false,
                addonId: stream.addonId,
                addonName: stream.addonName,
            }));

            console.log('Addon mode movie results:', allStreams.length, 'streams');
            return allStreams;  // Return addon results (even if empty, no fallback)
        }

        // INDEXER MODE: Addons disabled, use Torrentio with TorBox cache check
        console.log('=== INDEXER MODE (Movie) ===');
        const { dohFetch } = require('./doh');

        // Single-source: TorBox provider
        const torboxUrl = `${TORRENTIO_BASE_URL}/torbox=${torboxApiKey}/stream/movie/${imdbId}.json`;
        console.log('Fetching cached movie streams from indexer...');

        let streams: EnhancedStream[] = [];

        try {
            const response = await dohFetch(torboxUrl);

            if (response.ok) {
                const data = await response.json();
                if (data.streams && data.streams.length > 0) {
                    streams = parseStreamsWithHash(data.streams);
                }
            }
        } catch (e: any) {
            console.log('Movie TorBox provider failed:', e.message);
        }

        // Fallback: Get all streams and check cache
        if (streams.length === 0) {
            const { checkCached } = require('./torbox');
            const url = `${TORRENTIO_BASE_URL}/stream/movie/${imdbId}.json`;

            const response = await dohFetch(url);
            if (response.ok) {
                const data = await response.json();
                if (data.streams && data.streams.length > 0) {
                    const parsedStreams = parseStreamsWithHash(data.streams);
                    const hashes = parsedStreams
                        .map(s => s.infoHash)
                        .filter(h => h && h.length === 40) as string[];

                    if (hashes.length > 0) {
                        const cachedMap = await checkCached(hashes);
                        streams = parsedStreams.filter(stream => {
                            const hash = stream.infoHash?.toLowerCase();
                            return hash && cachedMap.get(hash);
                        });
                    }
                }
            }
        }

        console.log('Indexer mode cached movie streams:', streams.length);
        return streams;

    } catch (error) {
        console.error('Error fetching cached movie streams:', error);
        return [];
    }
};
