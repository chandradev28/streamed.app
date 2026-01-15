// Comet Indexer Service
// Similar to Torrentio but uses Comet addon for cached torrent streams

const COMET_BASE_URL = 'https://comet.elfhosted.com';

export interface CometStream {
    name: string;
    title: string;
    infoHash: string;
    fileIdx?: number;
    behaviorHints?: {
        bingeGroup?: string;
        notWebReady?: boolean;
    };
}

export interface EnhancedCometStream extends CometStream {
    isCached?: boolean;
}

/**
 * Parse stream info from Comet stream title
 */
export const parseCometStreamInfo = (stream: CometStream): {
    source: string;
    quality: string;
    size: string;
    seeders: string;
} => {
    const title = stream.title || '';
    const lines = title.split('\n');

    // Extract quality (720p, 1080p, 4K, etc.)
    const qualityMatch = title.match(/(\d{3,4}p|4K|2160p)/i);
    const quality = qualityMatch ? qualityMatch[1].toUpperCase() : 'Unknown';

    // Extract size
    const sizeMatch = title.match(/(\d+\.?\d*\s*(GB|MB))/i);
    const size = sizeMatch ? sizeMatch[1] : 'Unknown';

    // Extract seeders
    const seedersMatch = title.match(/👤\s*(\d+)/);
    const seeders = seedersMatch ? seedersMatch[1] : '0';

    // Extract source (first line usually has source)
    const source = lines[0]?.replace(/\[.*?\]/g, '').trim().split(' ')[0] || 'Unknown';

    return { source, quality, size, seeders };
};

/**
 * Parse streams and extract infoHash
 */
const parseCometStreamsWithHash = (streams: any[]): EnhancedCometStream[] => {
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
 * Get cached TV streams from Comet for a specific episode
 */
export const getCometTVCachedStreams = async (
    imdbId: string,
    season: number,
    episode: number,
    torboxApiKey: string
): Promise<EnhancedCometStream[]> => {
    console.log('=== getCometTVCachedStreams CALLED ===');
    console.log('Parameters: IMDB=' + imdbId + ', S=' + season + ', E=' + episode);

    try {
        const { dohFetch } = require('./doh');

        // Comet URL with TorBox key for cached-only results
        const cometUrl = `${COMET_BASE_URL}/torbox=${torboxApiKey}/stream/series/${imdbId}:${season}:${episode}.json`;
        console.log('Comet URL:', cometUrl.substring(0, 80) + '...');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await dohFetch(cometUrl, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' },
            });

            clearTimeout(timeoutId);
            console.log('Comet response status:', response.status);

            if (response.ok) {
                const data = await response.json();
                console.log('Comet streams count:', data.streams?.length || 0);

                if (data.streams && data.streams.length > 0) {
                    return parseCometStreamsWithHash(data.streams);
                }
            } else {
                console.log('Comet response not OK:', response.status);
            }
        } catch (e: any) {
            clearTimeout(timeoutId);
            console.log('Comet request failed:', e.message);
        }

        return [];
    } catch (error: any) {
        console.error('Error in getCometTVCachedStreams:', error.message || error);
        return [];
    }
};

/**
 * Get cached movie streams from Comet
 */
export const getCometMovieCachedStreams = async (
    imdbId: string,
    torboxApiKey: string
): Promise<EnhancedCometStream[]> => {
    console.log('=== getCometMovieCachedStreams CALLED ===');
    console.log('IMDB:', imdbId);

    try {
        const { dohFetch } = require('./doh');

        // Comet URL with TorBox key for cached-only results
        const cometUrl = `${COMET_BASE_URL}/torbox=${torboxApiKey}/stream/movie/${imdbId}.json`;
        console.log('Comet Movie URL:', cometUrl.substring(0, 80) + '...');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await dohFetch(cometUrl, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' },
            });

            clearTimeout(timeoutId);
            console.log('Comet movie response status:', response.status);

            if (response.ok) {
                const data = await response.json();
                console.log('Comet movie streams count:', data.streams?.length || 0);

                if (data.streams && data.streams.length > 0) {
                    return parseCometStreamsWithHash(data.streams);
                }
            } else {
                console.log('Comet movie response not OK:', response.status);
            }
        } catch (e: any) {
            clearTimeout(timeoutId);
            console.log('Comet movie request failed:', e.message);
        }

        return [];
    } catch (error: any) {
        console.error('Error in getCometMovieCachedStreams:', error.message || error);
        return [];
    }
};

/**
 * Check Comet health status
 */
export const checkCometHealth = async (): Promise<{
    isOnline: boolean;
    responseTime: number;
    streamCount: number;
}> => {
    const startTime = Date.now();

    try {
        const { dohFetch } = require('./doh');

        // Test with The Matrix (tt0133093)
        const testUrl = `${COMET_BASE_URL}/stream/movie/tt0133093.json`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await dohFetch(testUrl, {
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const responseTime = Date.now() - startTime;

        if (response.ok) {
            const data = await response.json();
            return {
                isOnline: true,
                responseTime,
                streamCount: data.streams?.length || 0,
            };
        }

        return {
            isOnline: false,
            responseTime,
            streamCount: 0,
        };
    } catch (error) {
        return {
            isOnline: false,
            responseTime: Date.now() - startTime,
            streamCount: 0,
        };
    }
};
