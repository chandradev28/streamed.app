// Episode Parser Utility
// Parses season and episode information from filenames for season pack torrents

export interface ParsedEpisode {
    season: number;
    episode: number;
    title?: string;
    originalIndex: number; // Original index in file list
}

export interface SeasonGroup {
    season: number;
    episodes: ParsedEpisode[];
}

// Common video file extensions
const VIDEO_EXTENSIONS = [
    '.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts', '.m2ts'
];

// Files/folders to skip (samples, subtitles, extras, etc.)
const SKIP_PATTERNS = [
    /sample/i,
    /\.srt$/i,
    /\.sub$/i,
    /\.ass$/i,
    /\.vtt$/i,
    /\.ssa$/i,
    /\.nfo$/i,
    /\.txt$/i,
    /\.jpg$/i,
    /\.jpeg$/i,
    /\.png$/i,
    /featurette/i,
    /behind.the.scenes/i,
    /deleted.scenes/i,
    /extras?[\\/\-\.]/i,
    /bonus/i,
    /trailer/i,
];

/**
 * Check if a filename is a valid video file (not sample/subtitle/etc.)
 */
export const isValidVideoFile = (filename: string): boolean => {
    // Check if it's a video file
    const hasVideoExtension = VIDEO_EXTENSIONS.some(ext =>
        filename.toLowerCase().endsWith(ext)
    );
    if (!hasVideoExtension) return false;

    // Check if it matches any skip patterns
    const shouldSkip = SKIP_PATTERNS.some(pattern => pattern.test(filename));
    return !shouldSkip;
};

/**
 * Parse season and episode numbers from a filename
 * Supports multiple formats: S01E01, S1E1, 1x01, Season 1 Episode 1, etc.
 */
export const parseEpisodeInfo = (filename: string): { season: number; episode: number } | null => {
    // Remove path and get just filename
    const name = filename.split(/[/\\]/).pop() || filename;

    // Pattern 1: S01E01, S1E01, S01E1, S1E1 (most common)
    const pattern1 = /[Ss](\d{1,2})[Ee](\d{1,3})/;
    const match1 = name.match(pattern1);
    if (match1) {
        return {
            season: parseInt(match1[1], 10),
            episode: parseInt(match1[2], 10),
        };
    }

    // Pattern 2: 1x01, 01x01 (older format)
    const pattern2 = /(\d{1,2})x(\d{1,3})/i;
    const match2 = name.match(pattern2);
    if (match2) {
        return {
            season: parseInt(match2[1], 10),
            episode: parseInt(match2[2], 10),
        };
    }

    // Pattern 3: Season 1 Episode 1, Season.1.Episode.1
    const pattern3 = /Season[\s._-]*(\d{1,2})[\s._-]*Episode[\s._-]*(\d{1,3})/i;
    const match3 = name.match(pattern3);
    if (match3) {
        return {
            season: parseInt(match3[1], 10),
            episode: parseInt(match3[2], 10),
        };
    }

    // Pattern 4: E01 only (when season is implied/single season)
    const pattern4 = /[Ee](\d{1,3})(?![xX\d])/;
    const match4 = name.match(pattern4);
    if (match4) {
        return {
            season: 1, // Default to season 1 if only episode is found
            episode: parseInt(match4[1], 10),
        };
    }

    // Pattern 5: - 01 -, .01., _01_ (episode number with separators)
    const pattern5 = /[\s._-](\d{2,3})[\s._-]/;
    const match5 = name.match(pattern5);
    if (match5) {
        const num = parseInt(match5[1], 10);
        // Only use if it's a reasonable episode number (1-99) and not a year
        if (num > 0 && num < 100 && num !== 19 && num !== 20) {
            return {
                season: 1,
                episode: num,
            };
        }
    }

    return null;
};

/**
 * Extract a clean episode title from filename
 */
export const extractEpisodeTitle = (filename: string, season: number, episode: number): string => {
    const name = filename.split(/[/\\]/).pop() || filename;

    // Remove extension
    const nameWithoutExt = name.replace(/\.[^.]+$/, '');

    // Remove show name (usually before S##E##)
    let title = nameWithoutExt.replace(/^.*?[Ss]\d{1,2}[Ee]\d{1,3}/i, '');

    // Remove common tags in brackets
    title = title.replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/\{.*?\}/g, '');

    // Remove quality tags
    title = title.replace(/\b(720p|1080p|2160p|4K|HDR|HEVC|x264|x265|WEB-DL|WEBRip|BluRay|BDRip|HDTV)\b/gi, '');

    // Remove release group
    title = title.replace(/-[A-Za-z0-9]+$/, '');

    // Clean up separators
    title = title.replace(/[._-]+/g, ' ').trim();

    // If we got a reasonable title, use it
    if (title.length > 2 && title.length < 100) {
        return title;
    }

    // Default format
    return `Episode ${episode}`;
};

/**
 * Parse all files in a torrent and extract episode information
 * Returns files grouped by season
 * Files without episode patterns go to "Extras" (season -1)
 */
export const parseSeasonPack = (
    files: { id: number; name: string; size: number; streamUrl?: string }[]
): SeasonGroup[] => {
    const episodes: ParsedEpisode[] = [];
    const extras: ParsedEpisode[] = []; // For files without episode patterns

    // Parse each file
    files.forEach((file, index) => {
        // Skip non-video files
        if (!isValidVideoFile(file.name)) {
            return;
        }

        const episodeInfo = parseEpisodeInfo(file.name);
        if (episodeInfo) {
            episodes.push({
                season: episodeInfo.season,
                episode: episodeInfo.episode,
                title: extractEpisodeTitle(file.name, episodeInfo.season, episodeInfo.episode),
                originalIndex: index,
            });
        } else {
            // Video file without episode pattern - add to extras
            // Extract clean name for title
            const cleanName = file.name
                .split(/[/\\]/).pop() || file.name;
            extras.push({
                season: -1, // Special marker for extras
                episode: extras.length + 1, // Sequential numbering
                title: cleanName.replace(/\.[^.]+$/, ''), // Remove extension
                originalIndex: index,
            });
        }
    });

    // Group by season
    const seasonMap = new Map<number, ParsedEpisode[]>();
    episodes.forEach(ep => {
        const existing = seasonMap.get(ep.season) || [];
        existing.push(ep);
        seasonMap.set(ep.season, existing);
    });

    // Convert to array and sort
    const seasons: SeasonGroup[] = [];
    seasonMap.forEach((eps, season) => {
        // Sort episodes within each season
        eps.sort((a, b) => a.episode - b.episode);
        seasons.push({ season, episodes: eps });
    });

    // Sort seasons (regular seasons first)
    seasons.sort((a, b) => a.season - b.season);

    // Add extras at the end if there are any
    if (extras.length > 0) {
        seasons.push({ season: -1, episodes: extras });
    }

    return seasons;
};

/**
 * Check if a file list represents a season pack (multiple episodes)
 */
export const isSeasonPack = (
    files: { id: number; name: string; size: number }[]
): boolean => {
    const videoFiles = files.filter(f => isValidVideoFile(f.name));
    return videoFiles.length > 1;
};

/**
 * Check if files represent a MOVIE torrent (not TV show)
 * Movies: 1-3 video files with NO episode patterns (S01E01, etc.)
 * Used to show "Files" / "Main" instead of "Episodes" / "Extras" in UI
 */
export const isMovieTorrent = (
    files: { id: number; name: string; size: number }[]
): boolean => {
    const videoFiles = files.filter(f => isValidVideoFile(f.name));

    // No files = not determinable
    if (videoFiles.length === 0) return false;

    // More than 5 video files = likely a TV season
    if (videoFiles.length > 5) return false;

    // Check if ANY file has episode patterns (S01E01, etc.)
    const hasEpisodePatterns = videoFiles.some(f => parseEpisodeInfo(f.name) !== null);

    // Movie if: few files AND no episode patterns
    return !hasEpisodePatterns;
};

/**
 * Get all valid video files from a file list (for non-TV torrents)
 * Unlike parseSeasonPack, this returns ALL video files, not just ones with episode patterns
 * Returns the original indices of valid video files
 */
export const getAllVideoFiles = (
    files: { id: number; name: string; size: number; streamUrl?: string }[]
): number[] => {
    return files
        .map((file, index) => ({ file, index }))
        .filter(({ file }) => isValidVideoFile(file.name))
        .map(({ index }) => index);
};

/**
 * Get the number of seasons in a file list
 */
export const getSeasonCount = (
    files: { id: number; name: string; size: number }[]
): number => {
    const seasons = parseSeasonPack(files);
    return seasons.length;
};

/**
 * Format episode number for display (S01E01 format)
 */
export const formatEpisodeLabel = (season: number, episode: number): string => {
    return `S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`;
};

/**
 * Check if a torrent title indicates a season pack (multi-episode torrent)
 * Used to filter Torrentio results into single episodes vs season packs
 */
export const isSeasonPackTitle = (title: string): boolean => {
    if (!title) return false;

    // Single episode patterns - if these match, it's NOT a season pack
    const singleEpisodePatterns = [
        /S\d{1,2}E\d{1,3}/i,           // S01E01 format
        /\d{1,2}x\d{1,3}/i,            // 1x01 format
        /Episode\s*\d+/i,              // Episode 1
    ];

    // If it has specific episode number, it's a single episode
    if (singleEpisodePatterns.some(p => p.test(title))) {
        return false;
    }

    // Season pack patterns
    const seasonPackPatterns = [
        /\bS\d{1,2}\b(?!E)/i,                    // S01 without E## (just season)
        /\bSeason\s*\d+\b/i,                     // Season 1
        /\bComplete\b/i,                         // Complete Season/Series
        /\bFull\s*Season\b/i,                    // Full Season
        /\bSeasons?\s*\d+\s*[-–]\s*\d+/i,        // Seasons 1-3
        /\bS\d{1,2}\s*[-–]\s*S?\d{1,2}\b/i,      // S01-S03 or S01-03
        /\bEntire\s*Series\b/i,                  // Entire Series
        /\bAll\s*Episodes?\b/i,                  // All Episodes
    ];

    return seasonPackPatterns.some(p => p.test(title));
};
