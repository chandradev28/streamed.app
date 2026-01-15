import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Platform,
    StatusBar,
    ActivityIndicator,
    Pressable,
    Modal,
    ScrollView,
    FlatList,
    Linking,
    Alert,
} from 'react-native';
import { X, Volume2, VolumeX, Play, Pause, RotateCcw, RotateCw, Maximize2, List, Check, AlertTriangle, ExternalLink, Subtitles, Settings2, Plus, Minus, FileText, ChevronDown, Smartphone } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { updateWatchProgress, createHistoryId } from '../services/watchHistory';
import { LibVlcPlayerView, LibVlcPlayerViewRef } from 'expo-libvlc-player';
import { parseSeasonPack, isSeasonPack, isMovieTorrent, formatEpisodeLabel, SeasonGroup, ParsedEpisode, isValidVideoFile, getAllVideoFiles } from '../services/episodeParser';
import { getTorrentByHash, getTorrentFilesWithUrls, getQuickStreamUrl, getTorrentFiles, getTorrentFilesById } from '../services/torbox';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import { WebView } from 'react-native-webview';
import { useKeepAwake } from 'expo-keep-awake';



const { width, height } = Dimensions.get('window');

// Episode/File type for torrent files
interface TorrentFile {
    id: number;
    name: string;
    size: number;
    streamUrl?: string;
}

// Track type for subtitle/audio tracks
interface Track {
    id: number;
    name: string;
}

interface MediaTracks {
    audio: Track[];
    video: Track[];
    subtitle: Track[];
}

interface VideoPlayerScreenProps {
    route: any;
    navigation: any;
}

export const VideoPlayerScreen = ({ route, navigation }: VideoPlayerScreenProps) => {
    const {
        title,
        videoUrl,
        posterUrl,
        // Optional metadata for watch history
        tmdbId,
        mediaType,
        seasonNumber,
        episodeNumber,
        episodeName,
        torrentHash,
        // Episodes/files list for multi-file torrents
        files,
        currentFileIndex,
        // Optional start position in milliseconds (for resume playback)
        startPosition,
        // Stream type: 'embed' for webview, otherwise VLC
        streamType,
        // Provider info for watch history (scrapers vs TorBox)
        provider,
        streamHeaders,
        // TorrentId for lazy URL resolution (fast player opening)
        torrentId,
        // Skip adding to watch history (for Downloads playback)
        skipHistory,
        // Use simplified TorBox mode (Videos/Extras tabs instead of season parsing)
        useTorBoxMode,
    } = route.params || {};

    // DEBUG: Log all route params to trace video loading issues
    useEffect(() => {
        console.log('[VideoPlayer] ====== MOUNT DEBUG ======');
        console.log('[VideoPlayer] videoUrl:', videoUrl?.substring(0, 80) || 'NOT PROVIDED');
        console.log('[VideoPlayer] torrentId:', torrentId || 'NOT PROVIDED');
        console.log('[VideoPlayer] torrentHash:', torrentHash || 'NOT PROVIDED');
        console.log('[VideoPlayer] streamType:', streamType || 'direct');
        console.log('[VideoPlayer] provider:', provider || 'torbox');
        console.log('[VideoPlayer] title:', title);
        console.log('[VideoPlayer] ========================');
    }, []);

    // Keep screen awake during video playback
    useKeepAwake();

    const playerRef = useRef<LibVlcPlayerViewRef>(null);
    const [isPlaying, setIsPlaying] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [duration, setDuration] = useState(0);
    const [position, setPosition] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isBuffering, setIsBuffering] = useState(false);
    const [playerError, setPlayerError] = useState<string | null>(null);
    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const progressSaveRef = useRef<NodeJS.Timeout | null>(null);
    const lastSavedPositionRef = useRef(0);

    // Episodes modal state
    const [showEpisodesModal, setShowEpisodesModal] = useState(false);
    const [activeFileIndex, setActiveFileIndex] = useState(currentFileIndex || 0);
    const [activeVideoUrl, setActiveVideoUrl] = useState(videoUrl);

    // Display title - updates when switching episodes
    const [displayTitle, setDisplayTitle] = useState<string>(title || '');
    const [displaySeasonNumber, setDisplaySeasonNumber] = useState<number | undefined>(seasonNumber);
    const [displayEpisodeNumber, setDisplayEpisodeNumber] = useState<number | undefined>(episodeNumber);
    const [displayEpisodeName, setDisplayEpisodeName] = useState<string | undefined>(episodeName);

    // File type tab state (Videos vs Extras)
    const [fileTypeTab, setFileTypeTab] = useState<'videos' | 'extras'>('videos');

    // Legacy season pack state (kept for compatibility but simplified)
    const [parsedSeasons, setParsedSeasons] = useState<SeasonGroup[]>([]);
    const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
    const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);

    // Retry state

    const [retryCount, setRetryCount] = useState(0);
    // Track if start position has been applied (to avoid re-seeking)
    const startPositionAppliedRef = useRef<boolean>(false);

    // Subtitle and audio track state
    const [subtitleTracks, setSubtitleTracks] = useState<Track[]>([]);
    const [audioTracks, setAudioTracks] = useState<Track[]>([]);
    const [selectedSubtitleId, setSelectedSubtitleId] = useState<number | undefined>(undefined);
    const [selectedAudioId, setSelectedAudioId] = useState<number | undefined>(undefined);
    const [showSubtitleModal, setShowSubtitleModal] = useState(false);
    const [trackModalTab, setTrackModalTab] = useState<'subtitles' | 'audio'>('subtitles');

    // Subtitle settings state
    const [subtitleSize, setSubtitleSize] = useState<number>(16); // VLC relative font size (8-32, 16 is default)
    const [subtitleMargin, setSubtitleMargin] = useState<number>(50); // Bottom margin in pixels
    const [externalSubtitleUri, setExternalSubtitleUri] = useState<string | null>(null);
    const [showSubtitleSettingsModal, setShowSubtitleSettingsModal] = useState(false);

    // Screen orientation state
    const [isLandscape, setIsLandscape] = useState(false);

    // Progress bar width for accurate seeking in any orientation
    const [progressBarWidth, setProgressBarWidth] = useState(width - 80);

    // Toggle screen orientation
    const toggleOrientation = async () => {
        try {
            if (isLandscape) {
                await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
                setIsLandscape(false);
            } else {
                await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
                setIsLandscape(true);
            }
        } catch (error) {
            console.error('Error changing orientation:', error);
        }
    };

    // Enable immersive fullscreen mode on mount, reset on unmount
    useEffect(() => {
        // Enable immersive mode (hide navigation bar) on Android
        if (Platform.OS === 'android') {
            NavigationBar.setVisibilityAsync('hidden').catch(() => { });
            NavigationBar.setBehaviorAsync('overlay-swipe').catch(() => { });
        }

        return () => {
            // Reset navigation bar and orientation on unmount
            ScreenOrientation.unlockAsync().catch(() => { });
            if (Platform.OS === 'android') {
                NavigationBar.setVisibilityAsync('visible').catch(() => { });
            }
        };
    }, []);
    // VLC options for subtitle styling and HTTP headers - memoized to prevent video restart
    // SIMPLIFIED: Removed aggressive options that may cause VLC to fail
    const vlcOptions = useMemo(() => {
        const options = [
            // Network caching for buffering (basic values that work)
            '--network-caching=3000',
            '--file-caching=3000',
            // Subtitle styling
            `--freetype-rel-fontsize=${subtitleSize}`,
            `--sub-margin=${subtitleMargin}`,
        ];

        // Add HTTP headers from streamHeaders (for scraper streams)
        if (streamHeaders && Object.keys(streamHeaders).length > 0) {
            if (streamHeaders.Referer || streamHeaders.referer) {
                options.push(`--http-referrer=${streamHeaders.Referer || streamHeaders.referer}`);
            }
            if (streamHeaders['User-Agent'] || streamHeaders['user-agent']) {
                options.push(`--http-user-agent=${streamHeaders['User-Agent'] || streamHeaders['user-agent']}`);
            }
        }

        console.log('[VLC] Options:', options.join(' '));
        return options;
    }, [streamHeaders, subtitleSize, subtitleMargin]);

    // Parse season pack files when they change
    useEffect(() => {
        if (files && files.length > 0) {
            const seasons = parseSeasonPack(files);
            setParsedSeasons(seasons);
            // Set default selected season
            if (seasons.length > 0 && selectedSeason === null) {
                setSelectedSeason(seasons[0].season);
            }
            console.log('Parsed seasons:', seasons.length, 'from', files.length, 'files');
        }
    }, [files]);

    // State for dynamically loaded files (from background fetch)
    const [loadedFiles, setLoadedFiles] = useState<TorrentFile[] | null>(null);
    const filesLoadedRef = useRef(false);

    // Background file loading: If we have torrentHash but no files, fetch them in background
    // This enables instant video player opening from Continue Watching section
    useEffect(() => {
        const fetchFilesInBackground = async () => {
            // Only fetch if we have a hash, no files passed, and haven't loaded yet
            if (torrentHash && (!files || files.length === 0) && !filesLoadedRef.current) {
                filesLoadedRef.current = true;
                console.log('Background: Fetching files for torrent hash:', torrentHash);

                try {
                    const torrent = await getTorrentByHash(torrentHash);
                    if (torrent && torrent.files && torrent.files.length > 1) {
                        // Multi-file torrent - fetch all files with stream URLs
                        const filesWithUrls = await getTorrentFilesWithUrls(torrent.id);
                        if (filesWithUrls.length > 1) {
                            // Normalize file names using short_name
                            const normalizedFiles = filesWithUrls.map((f: any, idx: number) => ({
                                id: f.id,
                                name: f.short_name || f.name?.split('/').pop() || f.name || `File ${idx + 1}`,
                                size: f.size || 0,
                                streamUrl: f.streamUrl || '',
                            }));
                            console.log('Background: Loaded', normalizedFiles.length, 'files');
                            setLoadedFiles(normalizedFiles);
                        }
                    }
                } catch (error) {
                    console.log('Background: Could not fetch torrent files:', error);
                }
            }
        };

        fetchFilesInBackground();
    }, [torrentHash, files]);

    // Use loaded files if available, otherwise use passed files
    const effectiveFiles = loadedFiles || files;
    const hasMultipleFiles = effectiveFiles && effectiveFiles.length > 1;
    const isSeasonPackTorrent = effectiveFiles && isSeasonPack(effectiveFiles);

    // Detect if this is a MOVIE torrent (not TV show)
    // Use mediaType from params, OR detect from file patterns
    const isMovieFiles = mediaType === 'movie' || (effectiveFiles && isMovieTorrent(effectiveFiles));

    // PERFORMANCE: Memoize video/extra file filtering to prevent re-computation
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.ts', '.m2ts', '.flv'];
    const extraExtensions = ['.srt', '.sub', '.vtt', '.ass', '.ssa', '.txt', '.nfo', '.jpg', '.jpeg', '.png', '.gif'];

    const { memoizedVideoFiles, memoizedExtraFiles } = useMemo(() => {
        const videos = effectiveFiles?.map((f: TorrentFile, idx: number) => ({ file: f, index: idx }))
            .filter((item: { file: TorrentFile; index: number }) =>
                videoExtensions.some(ext => item.file.name.toLowerCase().endsWith(ext))
            ) || [];
        const extras = effectiveFiles?.map((f: TorrentFile, idx: number) => ({ file: f, index: idx }))
            .filter((item: { file: TorrentFile; index: number }) =>
                extraExtensions.some(ext => item.file.name.toLowerCase().endsWith(ext))
            ) || [];
        return { memoizedVideoFiles: videos, memoizedExtraFiles: extras };
    }, [effectiveFiles]);

    // PERFORMANCE: Pre-fetch torrentId when modal opens for faster file switching
    const [cachedTorrentId, setCachedTorrentId] = useState<number | null>(null);

    useEffect(() => {
        if (showEpisodesModal && torrentHash && !torrentId && !cachedTorrentId) {
            console.log('Pre-fetching torrentId from hash:', torrentHash);
            getTorrentByHash(torrentHash).then(t => {
                if (t) {
                    setCachedTorrentId(t.id);
                    console.log('Pre-fetched torrentId:', t.id);
                }
            });
        }
    }, [showEpisodesModal, torrentHash, torrentId, cachedTorrentId]);

    // Re-parse seasons when files are loaded in background
    useEffect(() => {
        if (loadedFiles && loadedFiles.length > 0) {
            const seasons = parseSeasonPack(loadedFiles);
            setParsedSeasons(seasons);
            if (seasons.length > 0 && selectedSeason === null) {
                setSelectedSeason(seasons[0].season);
            }
            console.log('Background: Parsed', seasons.length, 'seasons from loaded files');
        }
    }, [loadedFiles]);

    // Lazy URL resolution: When navigated with torrentId but no videoUrl,
    // resolve the stream URL on mount for fast player opening
    const urlResolvedRef = useRef(false);
    useEffect(() => {
        const resolveStreamUrl = async () => {
            // Only resolve if we have torrentId, no videoUrl, and haven't resolved yet
            if (torrentId && !videoUrl && !activeVideoUrl && !urlResolvedRef.current) {
                urlResolvedRef.current = true;
                console.log('Lazy: Resolving stream URL for torrentId:', torrentId);
                setIsBuffering(true);

                try {
                    // Use direct API call for specific torrent (more reliable than fetching entire library)
                    let fileList = await getTorrentFilesById(torrentId);

                    // Retry once with delay if empty (API propagation delay for newly added torrents)
                    if (fileList.length === 0) {
                        console.log('Lazy: No files found, retrying in 1.5s...');
                        await new Promise(resolve => setTimeout(resolve, 1500));
                        fileList = await getTorrentFilesById(torrentId);
                    }

                    // Fallback to original method if still empty
                    if (fileList.length === 0) {
                        console.log('Lazy: Fallback to getTorrentFiles');
                        fileList = await getTorrentFiles(torrentId);
                    }

                    if (fileList.length === 0) {
                        setPlayerError('No playable files found. The torrent may still be loading.');
                        setIsBuffering(false);
                        setIsLoading(false); // FIX: Clear loading state so error shows
                        return;
                    }

                    // Find best video file (first video file, or largest)
                    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'];
                    const videoFiles = fileList.filter(f =>
                        videoExtensions.some(ext => f.name.toLowerCase().endsWith(ext))
                    );
                    const targetFile = videoFiles.length > 0 ? videoFiles[0] : fileList[0];

                    console.log('Lazy: Selected file:', targetFile.name, 'ID:', targetFile.id);

                    // Get stream URL for this specific file
                    const streamUrl = await getQuickStreamUrl(torrentId, targetFile.id);

                    if (streamUrl) {
                        console.log('Lazy: Stream URL resolved successfully');
                        setActiveVideoUrl(streamUrl);

                        // ALWAYS set files for multi-file torrents to enable extras tab
                        if (fileList.length > 1 && !filesLoadedRef.current) {
                            filesLoadedRef.current = true; // Prevent background fetch from overwriting
                            const filesWithPartialUrls = fileList.map((f: any, idx: number) => ({
                                id: f.id,
                                // Use short_name if available, otherwise extract filename from path
                                name: f.short_name || f.name?.split('/').pop() || f.name || `File ${idx + 1}`,
                                size: f.size || 0,
                                streamUrl: f.id === targetFile.id ? streamUrl : '', // Only target file has URL
                            }));
                            setLoadedFiles(filesWithPartialUrls);
                            console.log('Lazy: Set', filesWithPartialUrls.length, 'files for multi-file support');
                        }
                    } else {
                        setPlayerError('Could not get stream URL from TorBox.');
                        setIsLoading(false); // FIX: Clear loading state so error shows
                    }
                } catch (error) {
                    console.error('Lazy: Error resolving stream URL:', error);
                    setPlayerError('Failed to resolve stream URL.');
                    setIsLoading(false); // FIX: Clear loading state so error shows
                } finally {
                    setIsBuffering(false);
                }
            }
        };

        resolveStreamUrl();
    }, [torrentId, videoUrl, activeVideoUrl]);

    // Video loading with retry support
    useEffect(() => {
        // Auto-start loading timeout - if still loading after 90s, show error
        const loadingTimeout = setTimeout(() => {
            if (isLoading) {
                setPlayerError('Video loading timed out. The stream may be unavailable or slow to start.');
            }
        }, 90000);

        return () => clearTimeout(loadingTimeout);
    }, [activeVideoUrl, videoUrl, retryCount, isLoading]);

    // Save progress periodically and on unmount
    const saveProgress = useCallback(() => {
        // Skip saving if skipHistory flag is set (from Downloads playback)
        if (skipHistory) return;
        if (!tmdbId || duration <= 0) return;

        const progressPercent = Math.round((position / duration) * 100);

        // Don't save if position hasn't changed much (2 seconds threshold for responsive updates)
        if (Math.abs(position - lastSavedPositionRef.current) < 2000) return;
        lastSavedPositionRef.current = position;

        // Use display values which update when switching episodes
        const historyId = createHistoryId(tmdbId, mediaType || 'movie', displaySeasonNumber, displayEpisodeNumber);

        updateWatchProgress({
            id: historyId,
            tmdbId,
            mediaType: mediaType || 'movie',
            title: displayTitle || title || 'Unknown',
            posterPath: posterUrl,
            seasonNumber: displaySeasonNumber,
            episodeNumber: displayEpisodeNumber,
            episodeName: displayEpisodeName,
            progress: progressPercent,
            currentTime: Math.floor(position / 1000),
            duration: Math.floor(duration / 1000),
            streamUrl: activeVideoUrl || videoUrl,
            torrentHash,
            currentFileIndex: activeFileIndex,  // Save which file in multi-file torrent
            // Save stream type and provider for proper resume (scrapers vs TorBox)
            streamType,
            provider,
            streamHeaders,
        });
    }, [skipHistory, tmdbId, mediaType, title, displayTitle, posterUrl, displaySeasonNumber, displayEpisodeNumber, displayEpisodeName, position, duration, videoUrl, activeVideoUrl, torrentHash, activeFileIndex, streamType, provider, streamHeaders]);

    // Initial save after 10 seconds of watching
    const initialSaveRef = useRef<boolean>(false);
    useEffect(() => {
        if (isPlaying && position >= 10000 && duration > 0 && tmdbId && !initialSaveRef.current) {
            // Save immediately after 10 seconds of playback
            initialSaveRef.current = true;
            saveProgress();
            console.log('Initial watch progress saved after 10 seconds');
        }
    }, [isPlaying, position, duration, tmdbId, saveProgress]);

    // Save progress every 10 seconds
    useEffect(() => {
        if (isPlaying && duration > 0 && tmdbId) {
            progressSaveRef.current = setInterval(saveProgress, 10000);
        }
        return () => {
            if (progressSaveRef.current) {
                clearInterval(progressSaveRef.current);
            }
        };
    }, [isPlaying, duration, tmdbId, saveProgress]);

    // Auto-hide controls after 4 seconds
    const resetControlsTimeout = useCallback(() => {
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
        }
        if (isPlaying) {
            controlsTimeoutRef.current = setTimeout(() => {
                setShowControls(false);
            }, 4000);
        }
    }, [isPlaying]);

    useEffect(() => {
        if (showControls && isPlaying) {
            resetControlsTimeout();
        }
        return () => {
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
            }
        };
    }, [showControls, isPlaying, resetControlsTimeout]);

    const formatTime = (millis: number): string => {
        const totalSeconds = Math.floor(millis / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    // LibVLC Player callbacks
    const onPlaying = () => {
        console.log('LibVLC: Playing');
        setIsLoading(false);
        setIsBuffering(false);
        setIsPlaying(true);
    };

    const onPaused = () => {
        console.log('LibVLC: Paused');
        setIsPlaying(false);
    };

    const onStopped = () => {
        console.log('LibVLC: Stopped');
        setIsPlaying(false);
    };

    const onBuffering = () => {
        console.log('LibVLC: Buffering');
        setIsBuffering(true);

        // Auto-clear buffering after a delay like the example does
        setTimeout(() => setIsBuffering(false), 1000);
    };

    // Track if we've seen a valid position update (to detect VLC bug)
    const hasValidPositionRef = useRef(false);

    // onTimeChanged returns { time: number } - time in milliseconds (direct, not nativeEvent)
    const onTimeChanged = ({ time }: { time: number }) => {
        // VLC bug fix: Some HLS streams (like VidLink) report position = duration at start
        // Detect this and reset to 0 if we're at "end" before video really played
        if (duration > 0 && time >= duration - 1000 && !hasValidPositionRef.current) {
            // Position is at or near duration, but we haven't had a valid position yet
            // This means VLC is misreporting - reset to 0
            console.log('LibVLC: Detected position=duration bug, resetting to 0');
            setPosition(0);
            hasValidPositionRef.current = true;
            return;
        }

        // Mark that we've had at least one valid position update
        if (time > 0 && time < duration - 5000) {
            hasValidPositionRef.current = true;
        }

        console.log('LibVLC: TimeChanged', time);
        setPosition(time);
    };

    // onESAdded is called when tracks (audio, video, subtitle) are detected
    const onESAdded = (tracks: MediaTracks) => {
        console.log('LibVLC: ESAdded - Tracks detected', tracks);
        if (tracks.subtitle && tracks.subtitle.length > 0) {
            setSubtitleTracks(tracks.subtitle);
        }
        if (tracks.audio && tracks.audio.length > 0) {
            setAudioTracks(tracks.audio);
        }
    };

    // onFirstPlay returns MediaInfo with { length, seekable, tracks } (direct, not nativeEvent)
    const onFirstPlay = ({ length, seekable, tracks }: { length: number; seekable: boolean; tracks?: MediaTracks }) => {
        console.log('LibVLC: FirstPlay', { length, seekable, tracks });
        setDuration(length);
        setIsLoading(false);
        setIsBuffering(false);

        // Also capture tracks from FirstPlay if available
        if (tracks) {
            if (tracks.subtitle && tracks.subtitle.length > 0) {
                setSubtitleTracks(tracks.subtitle);
            }
            if (tracks.audio && tracks.audio.length > 0) {
                setAudioTracks(tracks.audio);
            }
        }

        // Apply start position for resume playback (only once)
        if (startPosition && startPosition > 0 && !startPositionAppliedRef.current && seekable) {
            console.log('Seeking to start position:', startPosition, 'ms');
            startPositionAppliedRef.current = true;
            // Small delay to ensure player is ready for seeking
            setTimeout(() => {
                playerRef.current?.seek(startPosition, 'time');
                setPosition(startPosition);
            }, 300);
        }
    };

    const onError = ({ error }: { error: string }) => {
        console.error('LibVLC Error:', error);
        console.error('LibVLC Error - Stream URL:', finalVideoUrl?.substring(0, 100));
        console.error('LibVLC Error - Provider:', provider);
        console.error('LibVLC Error - Stream Type:', streamType);
        console.error('LibVLC Error - Headers:', JSON.stringify(streamHeaders || {}));

        // Provide more helpful error message
        let errorMessage = error || 'Video playback error';
        if (provider === 'dahmermovies' || provider === 'DahmerMovies') {
            errorMessage = 'DahmerMovies stream failed. Try a different quality or scraper.';
        }

        setPlayerError(errorMessage);
        setIsLoading(false);
    };

    const onEnd = () => {
        console.log('LibVLC: Ended');
        setIsPlaying(false);
        saveProgress();
    };

    const handleTogglePlayPause = () => {
        resetControlsTimeout();
        if (isPlaying) {
            playerRef.current?.pause();
        } else {
            playerRef.current?.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleToggleMute = () => {
        resetControlsTimeout();
        // LibVLC muting - toggle muted state
        // Note: Volume control via ref may not be available, using muted prop instead
        setIsMuted(!isMuted);
    };

    const handleSeekBackward = () => {
        resetControlsTimeout();
        const newPosition = Math.max(0, position - 10000);
        playerRef.current?.seek(newPosition, 'time');
        setPosition(newPosition);
    };

    const handleSeekForward = () => {
        resetControlsTimeout();
        const newPosition = Math.min(duration, position + 10000);
        playerRef.current?.seek(newPosition, 'time');
        setPosition(newPosition);
    };

    const handleSeek = (event: any) => {
        resetControlsTimeout();

        // Don't seek if duration not available yet
        if (!duration || duration <= 0) {
            console.log('Seek ignored: duration not ready yet', duration);
            return;
        }

        const { locationX } = event.nativeEvent;
        // Use dynamic progress bar width for accurate seeking in landscape
        const seekPercentage = Math.max(0, Math.min(1, locationX / progressBarWidth));
        const seekPosition = Math.floor(seekPercentage * duration);

        console.log(`Seeking to: ${seekPosition}ms (${Math.round(seekPercentage * 100)}%)`);

        // Only seek if position is valid
        if (seekPosition >= 0 && seekPosition <= duration) {
            playerRef.current?.seek(seekPosition, 'time');
            setPosition(seekPosition);
        }
    };

    const handleToggleControls = () => {
        setShowControls(!showControls);
        if (!showControls) {
            resetControlsTimeout();
        }
    };

    const handleClose = () => {
        saveProgress();
        navigation.goBack();
    };

    // Handle subtitle track selection
    const handleSelectSubtitle = (trackId: number | undefined) => {
        setSelectedSubtitleId(trackId);
        setShowSubtitleModal(false);
    };

    // Handle audio track selection
    const handleSelectAudio = (trackId: number | undefined) => {
        setSelectedAudioId(trackId);
        setShowSubtitleModal(false);
    };
    const handleSelectFile = async (file: TorrentFile, index: number) => {
        // If file already has a stream URL, use it directly
        let streamUrl: string | undefined = file.streamUrl;

        // If no stream URL, we need to fetch it dynamically
        if (!streamUrl && file.id) {
            console.log('Fetching stream URL for file:', file.name, 'ID:', file.id);
            setShowEpisodesModal(false);
            setIsLoading(true);
            setIsBuffering(true);

            try {
                // PERFORMANCE: Use cachedTorrentId or torrentId if available, otherwise get from hash
                let activeTorrentId = cachedTorrentId || torrentId;

                if (!activeTorrentId && torrentHash) {
                    console.log('No torrentId, fetching from hash:', torrentHash);
                    const torrent = await getTorrentByHash(torrentHash);
                    if (torrent) {
                        activeTorrentId = torrent.id;
                        setCachedTorrentId(torrent.id); // Cache for next time
                        console.log('Got torrentId from hash:', activeTorrentId);
                    }
                }

                if (!activeTorrentId) {
                    console.error('No torrentId available for file:', file.name);
                    setPlayerError('No stream URL available for this file.');
                    setIsLoading(false);
                    setIsBuffering(false);
                    return;
                }

                const fetchedUrl = await getQuickStreamUrl(activeTorrentId, file.id);
                streamUrl = fetchedUrl ?? undefined;
                if (!streamUrl) {
                    console.error('Failed to get stream URL for file:', file.name);
                    setPlayerError('Could not get stream URL for this file.');
                    setIsLoading(false);
                    setIsBuffering(false);
                    return;
                }
                console.log('Got stream URL for file:', file.name);
            } catch (error) {
                console.error('Error fetching stream URL:', error);
                setPlayerError('Failed to switch to this file.');
                setIsLoading(false);
                setIsBuffering(false);
                return;
            }
        }

        if (streamUrl) {
            setActiveFileIndex(index);
            setActiveVideoUrl(streamUrl);
            setShowEpisodesModal(false);
            setIsLoading(true);
            setPlayerError(null);
            setIsPlaying(true);

            // Update displayed title based on the new file
            // Try to find parsed episode info for this file
            let newTitle = '';
            let newSeasonNum: number | undefined;
            let newEpisodeNum: number | undefined;
            let newEpisodeName: string | undefined;

            // Extract just the show name from the original title (strip episode info)
            // Patterns to remove: S01E04, S1E4, Episode 1, E01, .mp4, .mkv, etc.
            const extractShowName = (fullTitle: string): string => {
                let showName = fullTitle;
                // Remove file extension
                showName = showName.replace(/\.(mp4|mkv|avi|mov|webm)$/i, '');
                // Remove corrupted patterns like "-pisode 7" left from previous concatenation
                showName = showName.replace(/\s*[-–]?\s*-?pisode\s*\d*/gi, '');
                // Remove episode patterns like S01E04, S1E4, S01E04-E08, S1E8 - S1E14
                showName = showName.replace(/\s*[-–]\s*S\d{1,2}E\d{1,2}\s*[-–]\s*S\d{1,2}E\d{1,2}/gi, '');
                showName = showName.replace(/\s*[-–]?\s*S\d{1,2}E\d{1,2}\s*[-–]?\s*E?\d*/gi, '');
                showName = showName.replace(/\s*\[?S?\d{1,2}[xX]\d{1,2}\]?/gi, '');
                // Remove "Episode X" patterns
                showName = showName.replace(/\s*[-–]?\s*Episode\s*\d+/gi, '');
                // Remove standalone E## patterns
                showName = showName.replace(/\s*[-–]?\s*E\d{1,2}/gi, '');
                // Remove quality tags
                showName = showName.replace(/\s*(1080p|720p|480p|2160p|4k|WEB|HDTV|BluRay|BDRip|DVDRip|HEVC|x264|x265|H264|H265|AAC|AC3|DTS|MULTi)/gi, '');
                // Clean up multiple dashes and whitespace
                showName = showName.replace(/\s*[-–]+\s*[-–]+/g, ' - ');
                showName = showName.replace(/\s*[-–]+\s*$/g, '').trim();
                showName = showName.replace(/^\s*[-–]+\s*/g, '').trim();
                // Remove double spaces
                showName = showName.replace(/\s+/g, ' ').trim();
                return showName || fullTitle;
            };

            const showName = title ? extractShowName(title) : '';

            // Check if this file has parsed episode info
            for (const seasonGroup of parsedSeasons) {
                const episode = seasonGroup.episodes.find(ep => ep.originalIndex === index);
                if (episode) {
                    // For movies or "extras" (season -1), don't use S#E# format
                    // Just use the clean title or original movie title
                    if (isMovieFiles || mediaType === 'movie' || episode.season === -1) {
                        // For movies: just use the original title or episode title
                        if (showName) {
                            newTitle = showName;
                            if (episode.title && episode.title !== showName) {
                                newTitle += ` - ${episode.title}`;
                            }
                        } else if (episode.title) {
                            newTitle = episode.title;
                        }
                        // Don't set season/episode numbers for movies
                    } else {
                        // For TV shows: use the episode format
                        newSeasonNum = episode.season;
                        newEpisodeNum = episode.episode;
                        newEpisodeName = episode.title;
                        // Build a clean title like "Show Name - S1E2 - Episode Title"
                        const epLabel = `S${episode.season}E${episode.episode}`;
                        if (showName) {
                            newTitle = `${showName} - ${epLabel}`;
                            if (episode.title) {
                                newTitle += ` - ${episode.title}`;
                            }
                        } else {
                            newTitle = epLabel;
                            if (episode.title) {
                                newTitle += ` - ${episode.title}`;
                            }
                        }
                    }
                    break;
                }
            }

            // If no parsed episode found, use the cleaned filename
            if (!newSeasonNum && !newEpisodeNum && file.name) {
                // Clean up the filename for display
                let cleanName = file.name;
                // Remove file extension
                cleanName = cleanName.replace(/\.(mp4|mkv|avi|mov|webm|m4v|ts|m2ts|flv|wmv)$/i, '');
                // Remove common quality tags
                cleanName = cleanName.replace(/\s*(1080p|720p|480p|2160p|4k|WEB|HDTV|BluRay|BDRip|DVDRip|HEVC|x264|x265|H264|H265|AAC|AC3|DTS|WEB-DL|WEBRip)/gi, '');
                // Clean up multiple dots/underscores/dashes to spaces
                cleanName = cleanName.replace(/[._]+/g, ' ');
                // Clean up multiple spaces
                cleanName = cleanName.replace(/\s+/g, ' ').trim();
                newTitle = cleanName;
            }

            setDisplayTitle(newTitle);
            setDisplaySeasonNumber(newSeasonNum);
            setDisplayEpisodeNumber(newEpisodeNum);
            setDisplayEpisodeName(newEpisodeName);

            console.log('Switched to file:', index, 'Title:', newTitle);
        } else {
            console.error('No stream URL available for file:', file.name);
            setPlayerError('No stream URL available for this file.');
        }
    };

    // Format file size
    const formatFileSize = (bytes: number): string => {
        if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
        if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
        return `${(bytes / 1024).toFixed(0)} KB`;
    };

    // Retry function
    const handleRetry = useCallback(() => {
        setPlayerError(null);
        setIsLoading(true);
        setRetryCount(prev => prev + 1);
    }, []);

    // Open in external VLC player
    const handleOpenInVLC = useCallback(async () => {
        const urlToOpen = activeVideoUrl || videoUrl;
        if (!urlToOpen) {
            Alert.alert('Error', 'No stream URL available');
            return;
        }

        try {
            const vlcUrl = `vlc://${urlToOpen}`;
            const supported = await Linking.canOpenURL(vlcUrl);

            if (supported) {
                await Linking.openURL(vlcUrl);
            } else {
                const altVlcUrl = `intent:${urlToOpen}#Intent;package=org.videolan.vlc;end`;
                const altSupported = await Linking.canOpenURL(altVlcUrl);

                if (altSupported) {
                    await Linking.openURL(altVlcUrl);
                } else {
                    Alert.alert(
                        'VLC Not Found',
                        'VLC Media Player is not installed. Would you like to install it from the Play Store?',
                        [
                            { text: 'Cancel', style: 'cancel' },
                            {
                                text: 'Install VLC',
                                onPress: () => Linking.openURL('market://details?id=org.videolan.vlc'),
                            },
                        ]
                    );
                }
            }
        } catch (error) {
            console.error('Error opening VLC:', error);
            Alert.alert('Error', 'Failed to open VLC player');
        }
    }, [activeVideoUrl, videoUrl]);

    const progress = duration > 0 ? (position / duration) * 100 : 0;
    const finalVideoUrl = activeVideoUrl || videoUrl || '';

    // DEBUG: Log final video URL before VLC player
    console.log('[VideoPlayer] ====== RENDER DEBUG ======');
    console.log('[VideoPlayer] finalVideoUrl:', finalVideoUrl?.substring(0, 100) || 'EMPTY');
    console.log('[VideoPlayer] isLoading:', isLoading, 'isBuffering:', isBuffering);
    console.log('[VideoPlayer] playerError:', playerError);

    // Debug logging for Pomelli/scraper streams
    if (provider && streamHeaders) {
        console.log('[VideoPlayer] Pomelli stream detected:');
        console.log('[VideoPlayer] Provider:', provider);
        console.log('[VideoPlayer] Stream URL:', finalVideoUrl.substring(0, 100));
        console.log('[VideoPlayer] Stream Headers:', JSON.stringify(streamHeaders));
        console.log('[VideoPlayer] VLC Options:', vlcOptions);
    }

    // Show error if player error occurred
    if (playerError) {
        return (
            <View style={styles.container}>
                <StatusBar hidden />
                <View style={styles.errorContainer}>
                    <AlertTriangle color="#EF4444" size={48} />
                    <Text style={styles.errorText}>Playback Error</Text>
                    <Text style={[styles.errorText, { fontSize: 14, opacity: 0.7, textAlign: 'center', paddingHorizontal: 20 }]}>
                        {playerError}
                    </Text>
                    <View style={styles.errorButtonsRow}>
                        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                            <RotateCcw color="#fff" size={18} />
                            <Text style={styles.retryButtonText}>Retry</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.closeErrorButton} onPress={handleClose}>
                            <Text style={styles.closeErrorText}>Go Back</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={styles.vlcButton} onPress={handleOpenInVLC}>
                        <ExternalLink color="#FF6B00" size={18} />
                        <Text style={styles.vlcButtonText}>Open in External VLC</Text>
                    </TouchableOpacity>
                    <Text style={styles.vlcHint}>External VLC app can play most video formats</Text>
                </View>
            </View>
        );
    }

    // If torrentId is provided, we're using lazy URL resolution - show loading state
    // This allows the video player to open immediately while URL is being resolved
    if (!finalVideoUrl && torrentId) {
        return (
            <View style={styles.container}>
                <StatusBar hidden />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#E50914" />
                    <Text style={styles.loadingText}>Preparing stream...</Text>
                    <Text style={[styles.loadingText, { fontSize: 12, opacity: 0.6, marginTop: 8 }]}>
                        Fetching video URL from TorBox
                    </Text>
                    <TouchableOpacity
                        style={[styles.closeErrorButton, { marginTop: 24 }]}
                        onPress={handleClose}
                    >
                        <Text style={styles.closeErrorText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (!finalVideoUrl) {
        return (
            <View style={styles.container}>
                <StatusBar hidden />
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>No video URL provided</Text>
                    <TouchableOpacity style={styles.closeErrorButton} onPress={handleClose}>
                        <Text style={styles.closeErrorText}>Go Back</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // Render WebView for embed streams (VidNest, VixSrc, VIDEASY, XPrime)
    if (streamType === 'embed') {
        return (
            <View style={styles.container}>
                <StatusBar hidden />
                {/* Close Button for WebView */}
                <TouchableOpacity
                    style={styles.webViewCloseButton}
                    onPress={handleClose}
                >
                    <X color="#fff" size={24} />
                </TouchableOpacity>
                <WebView
                    source={{ uri: finalVideoUrl }}
                    style={styles.webView}
                    allowsFullscreenVideo={true}
                    mediaPlaybackRequiresUserAction={false}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    startInLoadingState={true}
                    // Allow multiple windows for some embed players
                    setSupportMultipleWindows={true}
                    allowsInlineMediaPlayback={true}
                    renderLoading={() => (
                        <View style={styles.webViewLoading}>
                            <ActivityIndicator size="large" color="#3B82F6" />
                            <Text style={styles.loadingText}>Loading player...</Text>
                        </View>
                    )}
                    onError={(syntheticEvent: any) => {
                        const { nativeEvent } = syntheticEvent;
                        console.warn('WebView error: ', nativeEvent);
                    }}
                />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar hidden />

            {/* LibVLC Video Player */}
            <LibVlcPlayerView
                ref={playerRef}
                source={finalVideoUrl}
                style={styles.video}
                autoplay={true}
                mute={isMuted}
                volume={100}
                options={vlcOptions}
                tracks={{ ...(selectedSubtitleId !== undefined && { subtitle: selectedSubtitleId }), ...(selectedAudioId !== undefined && { audio: selectedAudioId }) }}
                slaves={externalSubtitleUri ? [{ source: externalSubtitleUri, type: 'subtitle', selected: true }] : []}
                onPlaying={onPlaying}
                onPaused={onPaused}
                onStopped={onStopped}
                onBuffering={onBuffering}
                onTimeChanged={onTimeChanged}
                onESAdded={onESAdded}
                onFirstPlay={onFirstPlay}
                onEndReached={onEnd}
                onEncounteredError={onError}
            />

            {/* Loading/Buffering Indicator */}
            {(isLoading || isBuffering) && (
                <View style={styles.loadingOverlay} pointerEvents="box-none">
                    <TouchableOpacity
                        style={styles.loadingCloseButton}
                        onPress={handleClose}
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    >
                        <X color="#fff" size={28} />
                    </TouchableOpacity>

                    <View style={styles.loadingContent}>
                        <ActivityIndicator size="large" color="#fff" />
                        <Text style={styles.loadingText}>
                            {isBuffering ? 'Buffering...' : 'Loading...'}
                        </Text>
                    </View>
                </View>
            )}

            {/* Tap to toggle controls - ONLY when controls are hidden */}
            {!showControls && (
                <Pressable
                    style={styles.touchOverlay}
                    onPress={handleToggleControls}
                />
            )}

            {/* Controls Overlay */}
            {showControls && (
                <>
                    {/* Background tap area to hide controls - LOW z-index so buttons work */}
                    <Pressable
                        style={styles.controlsBackgroundTap}
                        onPress={handleToggleControls}
                    />

                    {/* Top Controls */}
                    <LinearGradient
                        colors={['rgba(0,0,0,0.8)', 'transparent']}
                        style={styles.topGradient}
                        pointerEvents="box-none"
                    >
                        <View style={styles.topControls}>
                            <TouchableOpacity
                                style={styles.iconButton}
                                onPress={handleClose}
                                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                            >
                                <X color="#fff" size={28} />
                            </TouchableOpacity>

                            <View style={styles.topRightControls}>
                                {/* Subtitle Button - show when subtitles available */}
                                {subtitleTracks.length > 0 && (
                                    <TouchableOpacity
                                        style={[styles.iconButton, selectedSubtitleId !== undefined && { backgroundColor: 'rgba(59, 130, 246, 0.4)' }]}
                                        onPress={() => setShowSubtitleModal(true)}
                                        hitSlop={{ top: 15, bottom: 15, left: 10, right: 10 }}
                                    >
                                        <Subtitles color="#fff" size={22} />
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                    style={styles.iconButton}
                                    onPress={handleToggleMute}
                                    hitSlop={{ top: 15, bottom: 15, left: 10, right: 10 }}
                                >
                                    {isMuted ? (
                                        <VolumeX color="#fff" size={24} />
                                    ) : (
                                        <Volume2 color="#fff" size={24} />
                                    )}
                                </TouchableOpacity>
                                {/* Orientation Toggle Button */}
                                <TouchableOpacity
                                    style={[styles.iconButton, isLandscape && { backgroundColor: 'rgba(139, 92, 246, 0.4)' }]}
                                    onPress={toggleOrientation}
                                    hitSlop={{ top: 15, bottom: 15, left: 10, right: 10 }}
                                >
                                    <Smartphone
                                        color="#fff"
                                        size={22}
                                        style={{ transform: [{ rotate: isLandscape ? '90deg' : '0deg' }] }}
                                    />
                                </TouchableOpacity>
                                {hasMultipleFiles && (
                                    <TouchableOpacity
                                        style={[styles.iconButton, { backgroundColor: 'rgba(16, 185, 129, 0.4)' }]}
                                        onPress={() => setShowEpisodesModal(true)}
                                        hitSlop={{ top: 15, bottom: 15, left: 10, right: 10 }}
                                    >
                                        <List color="#fff" size={22} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </LinearGradient>

                    {/* Center Play Controls - high z-index with direct touch handling */}
                    <View style={styles.centerControls}>
                        <TouchableOpacity
                            style={styles.seekButton}
                            onPress={handleSeekBackward}
                            activeOpacity={0.7}
                            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                        >
                            <RotateCcw color="#fff" size={32} />
                            <Text style={styles.seekLabel}>10</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.playPauseButton}
                            onPress={handleTogglePlayPause}
                            activeOpacity={0.7}
                            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                        >
                            {isPlaying ? (
                                <Pause color="#fff" size={44} fill="#fff" />
                            ) : (
                                <Play color="#fff" size={44} fill="#fff" />
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.seekButton}
                            onPress={handleSeekForward}
                            activeOpacity={0.7}
                            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                        >
                            <RotateCw color="#fff" size={32} />
                            <Text style={styles.seekLabel}>10</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Bottom Controls */}
                    <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.9)']}
                        style={styles.bottomGradient}
                        pointerEvents="box-none"
                    >
                        {/* Title */}
                        <Text style={styles.videoTitle} numberOfLines={2} ellipsizeMode="tail">
                            {displayTitle || title || 'Now Playing'}
                        </Text>

                        {/* VLC Badge */}
                        <View style={styles.vlcBadge}>
                            <Text style={styles.vlcBadgeText}>🎬 VLC Player</Text>
                        </View>

                        {/* Progress Bar */}
                        <TouchableOpacity
                            style={styles.progressContainer}
                            onPress={handleSeek}
                            activeOpacity={1}
                            onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
                        >
                            <View style={styles.progressBackground}>
                                <View style={[styles.progressFill, { width: `${progress}%` }]} />
                            </View>
                            <View style={[styles.progressThumb, { left: `${Math.min(97, progress)}%` }]} />
                        </TouchableOpacity>

                        {/* Time Row */}
                        <View style={styles.timeRow}>
                            <Text style={styles.timeText}>{formatTime(position)}</Text>
                            <Text style={styles.timeText}>{formatTime(duration > 0 ? duration : position)}</Text>
                        </View>
                    </LinearGradient>
                </>
            )}

            {/* Episodes/Files Modal - Fullscreen sliding panel */}
            <Modal
                visible={showEpisodesModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowEpisodesModal(false)}
                statusBarTranslucent={true}
            >
                <View style={styles.episodesModalContainer}>
                    {/* Background overlay - tap to close */}
                    <Pressable
                        style={styles.episodesModalBackdrop}
                        onPress={() => setShowEpisodesModal(false)}
                    />

                    {/* Modal Panel */}
                    <View style={styles.episodesModalPanel}>
                        {/* Handle bar */}
                        <View style={styles.episodesModalHandle} />

                        {/* Header */}
                        <View style={styles.episodesModalHeader}>
                            <Text style={styles.episodesModalTitle}>
                                {useTorBoxMode || isMovieFiles ? '📁 Files' : (parsedSeasons.length > 0 ? '📺 Episodes' : '📁 Files')}
                            </Text>
                            <Text style={styles.episodesModalSubtitle}>
                                {effectiveFiles?.length || 0} items available
                            </Text>
                            <TouchableOpacity
                                style={styles.episodesModalCloseBtn}
                                onPress={() => setShowEpisodesModal(false)}
                                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                            >
                                <X color="#fff" size={22} />
                            </TouchableOpacity>
                        </View>

                        {/* Conditional file selector based on source */}
                        {useTorBoxMode ? (
                            /* TorBox Mode: Simple Videos/Extras Tabs - PERFORMANCE: Using memoized file lists */
                            (() => {
                                // Use memoized file lists instead of computing inline
                                const currentFiles = fileTypeTab === 'videos' ? memoizedVideoFiles : memoizedExtraFiles;

                                return (
                                    <>
                                        <View style={styles.seasonTabsContainer}>
                                            <TouchableOpacity
                                                style={[styles.seasonTab, fileTypeTab === 'videos' && styles.seasonTabActive]}
                                                onPress={() => setFileTypeTab('videos')}
                                            >
                                                <Text style={[styles.seasonTabText, fileTypeTab === 'videos' && styles.seasonTabTextActive]}>{isMovieFiles ? '🎬 Main' : '🎬 Videos'}</Text>
                                                <Text style={[styles.seasonTabEpisodes, fileTypeTab === 'videos' && styles.seasonTabEpisodesActive]}>{memoizedVideoFiles.length} files</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.seasonTab, fileTypeTab === 'extras' && styles.seasonTabActive]}
                                                onPress={() => setFileTypeTab('extras')}
                                            >
                                                <Text style={[styles.seasonTabText, fileTypeTab === 'extras' && styles.seasonTabTextActive]}>{isMovieFiles ? '📁 Other' : '📁 Extras'}</Text>
                                                <Text style={[styles.seasonTabEpisodes, fileTypeTab === 'extras' && styles.seasonTabEpisodesActive]}>{memoizedExtraFiles.length} files</Text>
                                            </TouchableOpacity>
                                        </View>

                                        {currentFiles.length === 0 ? (
                                            <View style={[styles.episodesEmptyState, { flex: 1 }]}>
                                                <FileText color="#666" size={48} />
                                                <Text style={styles.episodesEmptyTitle}>{fileTypeTab === 'videos' ? 'No Videos' : 'No Extras'}</Text>
                                                <Text style={styles.episodesEmptySubtitle}>{fileTypeTab === 'videos' ? 'No video files found' : 'No extra files found'}</Text>
                                            </View>
                                        ) : (
                                            <FlatList
                                                data={currentFiles}
                                                getItemLayout={(data, index) => ({
                                                    length: 72,
                                                    offset: 72 * index,
                                                    index,
                                                })}
                                                renderItem={({ item }) => {
                                                    const { file, index } = item;
                                                    const isActive = activeFileIndex === index;
                                                    const isVideo = fileTypeTab === 'videos';
                                                    return (
                                                        <TouchableOpacity
                                                            style={[styles.episodesFileCard, isActive && styles.episodesFileCardActive]}
                                                            onPress={() => isVideo ? handleSelectFile(file, index) : null}
                                                            activeOpacity={isVideo ? 0.7 : 1}
                                                        >
                                                            <View style={styles.episodesFileCardLeft}>
                                                                <View style={[styles.episodesEpBadge, isActive && styles.episodesEpBadgeActive]}>
                                                                    {isVideo ? <Play color="#fff" size={16} /> : <FileText color="#fff" size={16} />}
                                                                </View>
                                                            </View>
                                                            <View style={styles.episodesFileCardCenter}>
                                                                <Text style={styles.episodesFileName} numberOfLines={2}>{file.name}</Text>
                                                                <Text style={styles.episodesFileSize}>{formatFileSize(file.size)}</Text>
                                                            </View>
                                                            {isActive && isVideo && (
                                                                <View style={styles.episodesFileCardRight}>
                                                                    <View style={styles.episodesNowPlaying}>
                                                                        <Text style={styles.episodesNowPlayingText}>▶ NOW</Text>
                                                                    </View>
                                                                </View>
                                                            )}
                                                        </TouchableOpacity>
                                                    );
                                                }}
                                                keyExtractor={(item) => `file-${item.index}`}
                                                style={styles.episodesListScroll}
                                                contentContainerStyle={styles.episodesListContent}
                                                showsVerticalScrollIndicator={true}
                                                initialNumToRender={20}
                                                maxToRenderPerBatch={15}
                                                windowSize={7}
                                                removeClippedSubviews={Platform.OS === 'android'}
                                            />
                                        )}
                                    </>
                                );
                            })()
                        ) : (
                            /* Streamed Mode: Season/Episode Parsing */
                            (() => {
                                const allVideoIndices = effectiveFiles ? getAllVideoFiles(effectiveFiles) : [];
                                const parsedIndices = new Set(parsedSeasons.flatMap(s => s.episodes.map(e => e.originalIndex)));
                                const allCovered = allVideoIndices.length > 0 && allVideoIndices.every(idx => parsedIndices.has(idx));
                                const showParsedView = parsedSeasons.length > 0 && allCovered;

                                type ListItem = { type: 'header' | 'episode' | 'file'; key: string; seasonNum?: number; episode?: ParsedEpisode; fileIndex?: number; };
                                let listData: ListItem[] = [];

                                if (showParsedView) {
                                    const filteredSeasons = parsedSeasons.filter(sg => selectedSeason === null || sg.season === selectedSeason);
                                    filteredSeasons.forEach(seasonGroup => {
                                        if (parsedSeasons.length <= 1 || selectedSeason === null) {
                                            listData.push({ type: 'header', key: `header-${seasonGroup.season}`, seasonNum: seasonGroup.season });
                                        }
                                        seasonGroup.episodes.forEach(ep => {
                                            listData.push({ type: 'episode', key: `ep-${ep.season}-${ep.episode}`, episode: ep });
                                        });
                                    });
                                } else {
                                    allVideoIndices.forEach(originalIndex => {
                                        listData.push({ type: 'file', key: `file-${originalIndex}`, fileIndex: originalIndex });
                                    });
                                }

                                const renderItem = ({ item }: { item: ListItem }) => {
                                    if (item.type === 'header') {
                                        return <Text style={styles.episodesSeasonHeader}>{item.seasonNum === -1 ? (isMovieFiles ? 'Main Files' : 'Extras') : `Season ${item.seasonNum}`}</Text>;
                                    }
                                    if (item.type === 'episode' && item.episode) {
                                        const ep = item.episode;
                                        const file = effectiveFiles?.[ep.originalIndex];
                                        if (!file) return null;
                                        const isActive = activeFileIndex === ep.originalIndex;
                                        return (
                                            <TouchableOpacity style={[styles.episodesFileCard, isActive && styles.episodesFileCardActive]} onPress={() => handleSelectFile(file, ep.originalIndex)} activeOpacity={0.7}>
                                                <View style={styles.episodesFileCardLeft}>
                                                    <View style={[styles.episodesEpBadge, isActive && styles.episodesEpBadgeActive]}>
                                                        <Text style={styles.episodesEpBadgeText}>{ep.season === -1 ? `#${ep.episode}` : formatEpisodeLabel(ep.season, ep.episode)}</Text>
                                                    </View>
                                                </View>
                                                <View style={styles.episodesFileCardCenter}>
                                                    <Text style={styles.episodesFileName} numberOfLines={2}>{ep.title || file.name}</Text>
                                                    <Text style={styles.episodesFileSize}>{formatFileSize(file.size)}</Text>
                                                </View>
                                                {isActive && <View style={styles.episodesFileCardRight}><View style={styles.episodesNowPlaying}><Text style={styles.episodesNowPlayingText}>▶ NOW</Text></View></View>}
                                            </TouchableOpacity>
                                        );
                                    }
                                    if (item.type === 'file' && item.fileIndex !== undefined) {
                                        const file = effectiveFiles?.[item.fileIndex];
                                        if (!file) return null;
                                        const isActive = activeFileIndex === item.fileIndex;
                                        return (
                                            <TouchableOpacity style={[styles.episodesFileCard, isActive && styles.episodesFileCardActive]} onPress={() => handleSelectFile(file, item.fileIndex!)} activeOpacity={0.7}>
                                                <View style={styles.episodesFileCardLeft}>
                                                    <View style={[styles.episodesEpBadge, isActive && styles.episodesEpBadgeActive]}><FileText color="#fff" size={16} /></View>
                                                </View>
                                                <View style={styles.episodesFileCardCenter}>
                                                    <Text style={styles.episodesFileName} numberOfLines={2}>{file.name}</Text>
                                                    <Text style={styles.episodesFileSize}>{formatFileSize(file.size)}</Text>
                                                </View>
                                                {isActive && <View style={styles.episodesFileCardRight}><View style={styles.episodesNowPlaying}><Text style={styles.episodesNowPlayingText}>▶ NOW</Text></View></View>}
                                            </TouchableOpacity>
                                        );
                                    }
                                    return null;
                                };

                                if (!effectiveFiles || effectiveFiles.length === 0) {
                                    return (
                                        <View style={[styles.episodesEmptyState, { flex: 1 }]}>
                                            <FileText color="#666" size={48} />
                                            <Text style={styles.episodesEmptyTitle}>No Files Available</Text>
                                            <Text style={styles.episodesEmptySubtitle}>This torrent doesn't have multiple files</Text>
                                        </View>
                                    );
                                }

                                return (
                                    <>
                                        {parsedSeasons.length > 1 && (
                                            <View style={styles.seasonTabsContainer}>
                                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasonTabsContent}>
                                                    {parsedSeasons.map((seasonGroup) => (
                                                        <TouchableOpacity
                                                            key={seasonGroup.season}
                                                            style={[styles.seasonTab, selectedSeason === seasonGroup.season && styles.seasonTabActive]}
                                                            onPress={() => setSelectedSeason(seasonGroup.season)}
                                                        >
                                                            <Text style={[styles.seasonTabText, selectedSeason === seasonGroup.season && styles.seasonTabTextActive]}>
                                                                {seasonGroup.season === -1 ? 'Extras' : `S${seasonGroup.season}`}
                                                            </Text>
                                                            <Text style={[styles.seasonTabEpisodes, selectedSeason === seasonGroup.season && styles.seasonTabEpisodesActive]}>
                                                                {seasonGroup.episodes.length} {seasonGroup.season === -1 ? 'files' : 'ep'}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </ScrollView>
                                            </View>
                                        )}
                                        <FlatList
                                            data={listData}
                                            renderItem={renderItem}
                                            keyExtractor={(item) => item.key}
                                            style={styles.episodesListScroll}
                                            contentContainerStyle={styles.episodesListContent}
                                            showsVerticalScrollIndicator={true}
                                            initialNumToRender={15}
                                            maxToRenderPerBatch={10}
                                            windowSize={5}
                                            removeClippedSubviews={Platform.OS === 'android'}
                                            getItemLayout={(data, index) => ({ length: 80, offset: 80 * index, index })}
                                        />
                                    </>
                                );
                            })()
                        )}
                    </View>
                </View>
            </Modal>

            {/* Subtitle/Audio Selection Modal - Fullscreen sliding panel */}
            <Modal
                visible={showSubtitleModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowSubtitleModal(false)}
                statusBarTranslucent={true}
            >
                <View style={styles.subtitleModalContainer}>
                    {/* Background overlay - tap to close */}
                    <Pressable
                        style={styles.subtitleModalBackdrop}
                        onPress={() => setShowSubtitleModal(false)}
                    />

                    {/* Modal Panel */}
                    <View style={styles.subtitleModalPanel}>
                        {/* Handle bar */}
                        <View style={styles.subtitleModalHandle} />

                        {/* Header */}
                        <View style={styles.subtitleModalHeader}>
                            <Text style={styles.subtitleModalTitle}>
                                {trackModalTab === 'subtitles' ? '🔤 Subtitles' : '🔊 Audio'}
                            </Text>
                            <Text style={styles.subtitleModalSubtitle}>
                                {trackModalTab === 'subtitles'
                                    ? `${subtitleTracks.length} tracks available`
                                    : `${audioTracks.length} tracks available`}
                            </Text>
                            <TouchableOpacity
                                style={styles.subtitleModalCloseBtn}
                                onPress={() => setShowSubtitleModal(false)}
                                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                            >
                                <X color="#fff" size={22} />
                            </TouchableOpacity>
                        </View>

                        {/* Tabs for Subtitles/Audio */}
                        <View style={styles.subtitleTabs}>
                            <TouchableOpacity
                                style={[styles.subtitleTab, trackModalTab === 'subtitles' && styles.subtitleTabActive]}
                                onPress={() => setTrackModalTab('subtitles')}
                            >
                                <Subtitles color={trackModalTab === 'subtitles' ? '#fff' : '#888'} size={18} />
                                <Text style={[styles.subtitleTabText, trackModalTab === 'subtitles' && styles.subtitleTabTextActive]}>
                                    Subtitles ({subtitleTracks.length})
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.subtitleTab, trackModalTab === 'audio' && styles.subtitleTabActive]}
                                onPress={() => setTrackModalTab('audio')}
                            >
                                <Volume2 color={trackModalTab === 'audio' ? '#fff' : '#888'} size={18} />
                                <Text style={[styles.subtitleTabText, trackModalTab === 'audio' && styles.subtitleTabTextActive]}>
                                    Audio ({audioTracks.length})
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Scrollable Content */}
                        <ScrollView
                            style={styles.subtitleListScroll}
                            contentContainerStyle={styles.subtitleListContent}
                            showsVerticalScrollIndicator={true}
                            nestedScrollEnabled={true}
                            bounces={true}
                        >
                            {/* Subtitles Tab Content */}
                            {trackModalTab === 'subtitles' && (
                                <>
                                    {/* Subtitle Settings Button */}
                                    <TouchableOpacity
                                        style={[styles.subtitleTrackCard, styles.subtitleSettingsCard]}
                                        onPress={() => {
                                            setShowSubtitleModal(false);
                                            setShowSubtitleSettingsModal(true);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <View style={styles.subtitleTrackCardLeft}>
                                            <View style={[styles.subtitleTrackBadge, { backgroundColor: 'rgba(59, 130, 246, 0.3)' }]}>
                                                <Settings2 color="#3B82F6" size={18} />
                                            </View>
                                        </View>
                                        <View style={styles.subtitleTrackCardCenter}>
                                            <Text style={[styles.subtitleTrackName, { color: '#3B82F6' }]}>Subtitle Settings</Text>
                                            <Text style={styles.subtitleTrackInfo}>Size: {subtitleSize} • Margin: {subtitleMargin}px</Text>
                                        </View>
                                        <ChevronDown color="#3B82F6" size={18} style={{ transform: [{ rotate: '-90deg' }] }} />
                                    </TouchableOpacity>

                                    {/* Disable subtitles option */}
                                    <TouchableOpacity
                                        style={[
                                            styles.subtitleTrackCard,
                                            selectedSubtitleId === undefined && !externalSubtitleUri && styles.subtitleTrackCardActive,
                                        ]}
                                        onPress={() => {
                                            handleSelectSubtitle(undefined);
                                            setExternalSubtitleUri(null);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <View style={styles.subtitleTrackCardLeft}>
                                            <View style={[
                                                styles.subtitleTrackBadge,
                                                selectedSubtitleId === undefined && !externalSubtitleUri && styles.subtitleTrackBadgeActive
                                            ]}>
                                                <X color="#fff" size={16} />
                                            </View>
                                        </View>
                                        <View style={styles.subtitleTrackCardCenter}>
                                            <Text style={styles.subtitleTrackName}>Off</Text>
                                            <Text style={styles.subtitleTrackInfo}>Disable subtitles</Text>
                                        </View>
                                        {selectedSubtitleId === undefined && !externalSubtitleUri && (
                                            <View style={styles.subtitleActiveIndicator}>
                                                <Text style={styles.subtitleActiveText}>✓ ACTIVE</Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>

                                    {/* Available subtitle tracks */}
                                    {subtitleTracks.map((track) => (
                                        <TouchableOpacity
                                            key={track.id}
                                            style={[
                                                styles.subtitleTrackCard,
                                                selectedSubtitleId === track.id && styles.subtitleTrackCardActive,
                                            ]}
                                            onPress={() => handleSelectSubtitle(track.id)}
                                            activeOpacity={0.7}
                                        >
                                            <View style={styles.subtitleTrackCardLeft}>
                                                <View style={[
                                                    styles.subtitleTrackBadge,
                                                    selectedSubtitleId === track.id && styles.subtitleTrackBadgeActive
                                                ]}>
                                                    <Subtitles color="#fff" size={16} />
                                                </View>
                                            </View>
                                            <View style={styles.subtitleTrackCardCenter}>
                                                <Text style={styles.subtitleTrackName} numberOfLines={2}>
                                                    {track.name || `Subtitle Track ${track.id}`}
                                                </Text>
                                                <Text style={styles.subtitleTrackInfo}>Track ID: {track.id}</Text>
                                            </View>
                                            {selectedSubtitleId === track.id && (
                                                <View style={styles.subtitleActiveIndicator}>
                                                    <Text style={styles.subtitleActiveText}>✓ ACTIVE</Text>
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    ))}

                                    {/* Empty state for subtitles */}
                                    {subtitleTracks.length === 0 && (
                                        <View style={styles.subtitleEmptyState}>
                                            <Subtitles color="#666" size={40} />
                                            <Text style={styles.subtitleEmptyTitle}>No Subtitles Found</Text>
                                            <Text style={styles.subtitleEmptySubtitle}>
                                                This video doesn't have embedded subtitles
                                            </Text>
                                        </View>
                                    )}
                                </>
                            )}

                            {/* Audio Tab Content */}
                            {trackModalTab === 'audio' && (
                                <>
                                    {/* Available audio tracks */}
                                    {audioTracks.map((track) => (
                                        <TouchableOpacity
                                            key={track.id}
                                            style={[
                                                styles.subtitleTrackCard,
                                                selectedAudioId === track.id && styles.subtitleTrackCardActive,
                                            ]}
                                            onPress={() => handleSelectAudio(track.id)}
                                            activeOpacity={0.7}
                                        >
                                            <View style={styles.subtitleTrackCardLeft}>
                                                <View style={[
                                                    styles.subtitleTrackBadge,
                                                    { backgroundColor: 'rgba(16, 185, 129, 0.25)' },
                                                    selectedAudioId === track.id && { backgroundColor: 'rgba(16, 185, 129, 0.4)' }
                                                ]}>
                                                    <Volume2 color="#10B981" size={16} />
                                                </View>
                                            </View>
                                            <View style={styles.subtitleTrackCardCenter}>
                                                <Text style={styles.subtitleTrackName} numberOfLines={2}>
                                                    {track.name || `Audio Track ${track.id}`}
                                                </Text>
                                                <Text style={styles.subtitleTrackInfo}>Track ID: {track.id}</Text>
                                            </View>
                                            {selectedAudioId === track.id && (
                                                <View style={[styles.subtitleActiveIndicator, { backgroundColor: 'rgba(16, 185, 129, 0.9)' }]}>
                                                    <Text style={styles.subtitleActiveText}>✓ ACTIVE</Text>
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    ))}

                                    {/* Empty state for audio */}
                                    {audioTracks.length === 0 && (
                                        <View style={styles.subtitleEmptyState}>
                                            <Volume2 color="#666" size={40} />
                                            <Text style={styles.subtitleEmptyTitle}>No Audio Tracks</Text>
                                            <Text style={styles.subtitleEmptySubtitle}>
                                                Audio tracks will appear here when available
                                            </Text>
                                        </View>
                                    )}
                                </>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Subtitle Settings Modal */}
            <Modal
                visible={showSubtitleSettingsModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowSubtitleSettingsModal(false)}
            >
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setShowSubtitleSettingsModal(false)}
                >
                    <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                        {/* Swipe Handle */}
                        <View style={styles.modalSwipeHandle} />
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Subtitle Settings</Text>
                            <TouchableOpacity
                                style={styles.modalCloseButton}
                                onPress={() => setShowSubtitleSettingsModal(false)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <X color="#fff" size={20} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                            {/* Subtitle Size Control */}
                            <View style={styles.settingSection}>
                                <Text style={styles.settingLabel}>Subtitle Size</Text>
                                <Text style={styles.settingValue}>{subtitleSize}</Text>
                                <View style={styles.settingControls}>
                                    <TouchableOpacity
                                        style={styles.settingButton}
                                        onPress={() => setSubtitleSize(prev => Math.max(8, prev - 2))}
                                    >
                                        <Minus color="#fff" size={20} />
                                    </TouchableOpacity>
                                    <View style={styles.settingSlider}>
                                        {[8, 12, 16, 20, 24, 28, 32].map((size) => (
                                            <TouchableOpacity
                                                key={size}
                                                style={[
                                                    styles.sizeOption,
                                                    subtitleSize === size && styles.sizeOptionActive,
                                                ]}
                                                onPress={() => setSubtitleSize(size)}
                                            >
                                                <Text style={[
                                                    styles.sizeOptionText,
                                                    subtitleSize === size && styles.sizeOptionTextActive,
                                                ]}>
                                                    {size}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    <TouchableOpacity
                                        style={styles.settingButton}
                                        onPress={() => setSubtitleSize(prev => Math.min(32, prev + 2))}
                                    >
                                        <Plus color="#fff" size={20} />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Subtitle Position (Bottom Margin) Control */}
                            <View style={styles.settingSection}>
                                <Text style={styles.settingLabel}>Position (Bottom Margin)</Text>
                                <Text style={styles.settingValue}>{subtitleMargin}px</Text>
                                <View style={styles.settingControls}>
                                    <TouchableOpacity
                                        style={styles.settingButton}
                                        onPress={() => setSubtitleMargin(prev => Math.max(0, prev - 10))}
                                    >
                                        <Minus color="#fff" size={20} />
                                    </TouchableOpacity>
                                    <View style={styles.settingSlider}>
                                        {[0, 25, 50, 75, 100, 150].map((margin) => (
                                            <TouchableOpacity
                                                key={margin}
                                                style={[
                                                    styles.sizeOption,
                                                    subtitleMargin === margin && styles.sizeOptionActive,
                                                ]}
                                                onPress={() => setSubtitleMargin(margin)}
                                            >
                                                <Text style={[
                                                    styles.sizeOptionText,
                                                    subtitleMargin === margin && styles.sizeOptionTextActive,
                                                ]}>
                                                    {margin}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    <TouchableOpacity
                                        style={styles.settingButton}
                                        onPress={() => setSubtitleMargin(prev => Math.min(200, prev + 10))}
                                    >
                                        <Plus color="#fff" size={20} />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Reset to Defaults */}
                            <TouchableOpacity
                                style={styles.resetButton}
                                onPress={() => {
                                    setSubtitleSize(16);
                                    setSubtitleMargin(50);
                                }}
                            >
                                <Text style={styles.resetButtonText}>Reset to Defaults</Text>
                            </TouchableOpacity>

                            {/* Info Note */}
                            <Text style={styles.settingNote}>
                                Note: Changes will apply when video restarts or when you seek.
                            </Text>
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    video: {
        ...StyleSheet.absoluteFillObject,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
    },
    errorText: {
        color: '#fff',
        fontSize: 16,
        marginBottom: 20,
    },
    closeErrorButton: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    closeErrorText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    errorButtonsRow: {
        flexDirection: 'row',
        gap: 16,
        marginTop: 10,
    },
    retryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#10B981',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
        gap: 8,
    },
    retryButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    vlcButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 107, 0, 0.15)',
        borderWidth: 1,
        borderColor: '#FF6B00',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
        gap: 8,
        marginTop: 20,
    },
    vlcButtonText: {
        color: '#FF6B00',
        fontSize: 14,
        fontWeight: '600',
    },
    vlcHint: {
        color: '#666',
        fontSize: 12,
        marginTop: 12,
        textAlign: 'center',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.8)',
        zIndex: 25,
    },
    loadingCloseButton: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 60 : 40,
        left: 20,
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingContent: {
        alignItems: 'center',
    },
    loadingText: {
        color: '#fff',
        marginTop: 12,
        fontSize: 16,
        fontWeight: '500',
    },
    loadingSubtext: {
        color: '#10B981',
        marginTop: 8,
        fontSize: 12,
        fontWeight: '500',
    },
    touchOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 5,
    },
    controlsBackgroundTap: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 8, // Below top (20), center (30), bottom (20) controls but above video
    },
    topGradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 140,
        paddingTop: Platform.OS === 'ios' ? 60 : 20,
        paddingHorizontal: 40,
        zIndex: 20,
    },
    topControls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    iconButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    topRightControls: {
        flexDirection: 'row',
        gap: 12,
    },
    centerControls: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 60,
        zIndex: 30,
        pointerEvents: 'box-none',
    },
    seekButton: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    seekLabel: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
        marginTop: -4,
    },
    playPauseButton: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: 'rgba(255,255,255,0.25)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    bottomGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: Platform.OS === 'ios' ? 50 : 20,
        paddingHorizontal: 40,
        paddingTop: 80,
        zIndex: 20,
    },
    videoTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 8,
    },
    vlcBadge: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        alignSelf: 'flex-start',
        marginBottom: 16,
    },
    vlcBadgeText: {
        color: '#10B981',
        fontSize: 11,
        fontWeight: '600',
    },
    progressContainer: {
        height: 40,
        justifyContent: 'center',
        marginBottom: 4,
        marginTop: 8,
    },
    progressBackground: {
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 2,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#fff',
        borderRadius: 2,
    },
    progressThumb: {
        position: 'absolute',
        top: 4,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: '#fff',
        marginLeft: -8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 3,
    },
    timeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    timeText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 13,
        fontWeight: '500',
    },
    // Fullscreen Modal Styles - responsive for landscape
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 24,
    },
    modalContent: {
        backgroundColor: '#1a1a1a',
        borderRadius: 20,
        width: '100%',
        maxWidth: 600,
        maxHeight: '85%',    // Increased for better content visibility
        minHeight: 350,      // Minimum height to ensure content is visible
        overflow: 'hidden',
    },
    modalSwipeHandle: {
        width: 40,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 2,
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 4,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    modalCloseButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
        flex: 1,
    },
    modalScroll: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 16,
    },
    fileItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        marginTop: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    fileItemActive: {
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    fileInfo: {
        flex: 1,
    },
    fileName: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 4,
    },
    fileSize: {
        color: '#888',
        fontSize: 12,
    },
    checkIcon: {
        marginLeft: 12,
    },
    // Subtitle Settings Styles
    settingSection: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 16,
        marginTop: 12,
    },
    settingLabel: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    settingValue: {
        color: '#3B82F6',
        fontSize: 24,
        fontWeight: '700',
        textAlign: 'center',
        marginVertical: 8,
    },
    settingControls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 8,
    },
    settingButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    settingSlider: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        marginHorizontal: 8,
    },
    sizeOption: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    sizeOptionActive: {
        backgroundColor: '#3B82F6',
    },
    sizeOptionText: {
        color: '#888',
        fontSize: 12,
        fontWeight: '600',
    },
    sizeOptionTextActive: {
        color: '#fff',
    },
    resetButton: {
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        padding: 14,
        borderRadius: 12,
        marginTop: 16,
        alignItems: 'center',
    },
    resetButtonText: {
        color: '#EF4444',
        fontSize: 14,
        fontWeight: '600',
    },
    settingNote: {
        color: '#666',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 16,
        marginBottom: 8,
    },
    // Season selector styles
    seasonSelectorContainer: {
        marginBottom: 12,
        position: 'relative',
        zIndex: 10,
    },
    seasonDropdown: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    seasonDropdownText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    seasonDropdownList: {
        position: 'absolute',
        top: 50,
        left: 0,
        right: 0,
        backgroundColor: '#2a2a2a',
        borderRadius: 10,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    seasonDropdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    seasonDropdownItemActive: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
    },
    seasonDropdownItemText: {
        color: '#888',
        fontSize: 14,
        fontWeight: '500',
    },
    seasonDropdownItemTextActive: {
        color: '#fff',
    },
    seasonHeader: {
        color: '#888',
        fontSize: 13,
        fontWeight: '600',
        marginTop: 12,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    episodeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 4,
    },
    episodeBadge: {
        backgroundColor: 'rgba(59, 130, 246, 0.3)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        color: '#3B82F6',
        fontSize: 12,
        fontWeight: '700',
        overflow: 'hidden',
    },
    // Track tabs (Subtitles/Audio switcher)
    trackTabs: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 12,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        padding: 4,
    },
    trackTab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 6,
    },
    trackTabActive: {
        backgroundColor: 'rgba(59, 130, 246, 0.3)',
    },
    trackTabText: {
        color: '#888',
        fontSize: 13,
        fontWeight: '500',
    },
    trackTabTextActive: {
        color: '#fff',
    },
    emptyTrackMessage: {
        paddingVertical: 30,
        alignItems: 'center',
    },
    emptyTrackText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 6,
    },
    emptyTrackSubtext: {
        color: '#666',
        fontSize: 13,
    },
    // WebView styles for embed streams
    webView: {
        flex: 1,
        backgroundColor: '#000',
    },
    webViewCloseButton: {
        position: 'absolute',
        top: 44,
        left: 16,
        zIndex: 100,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 20,
        padding: 8,
    },
    webViewLoading: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
    },
    // ==========================================
    // EPISODES/FILES MODAL - Dedicated Styles
    // ==========================================
    episodesModalContainer: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    episodesModalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
    },
    episodesModalPanel: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '75%',
        minHeight: 300,
        backgroundColor: '#0d0d0d',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    },
    episodesModalHandle: {
        width: 48,
        height: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        borderRadius: 3,
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 8,
    },
    episodesModalHeader: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    },
    episodesModalTitle: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '700',
    },
    episodesModalSubtitle: {
        color: '#888',
        fontSize: 13,
        marginTop: 4,
    },
    episodesModalCloseBtn: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Season selector styles
    episodesSeasonSelector: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        zIndex: 100,
    },
    episodesSeasonBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
    },
    episodesSeasonBtnText: {
        color: '#10B981',
        fontSize: 15,
        fontWeight: '600',
    },
    // Horizontal Season Tabs styles
    seasonTabsContainer: {
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    },
    seasonTabsContent: {
        paddingHorizontal: 16,
        gap: 10,
    },
    seasonTab: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        alignItems: 'center',
        minWidth: 70,
    },
    seasonTabActive: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderColor: '#10B981',
    },
    seasonTabText: {
        color: '#888',
        fontSize: 14,
        fontWeight: '700',
    },
    seasonTabTextActive: {
        color: '#10B981',
    },
    seasonTabEpisodes: {
        color: '#666',
        fontSize: 11,
        fontWeight: '500',
        marginTop: 2,
    },
    seasonTabEpisodesActive: {
        color: 'rgba(16, 185, 129, 0.8)',
    },
    // Episodes list
    episodesListScroll: {
        flex: 1,
    },
    episodesListContent: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 40,
    },
    episodesSeasonHeader: {
        color: '#10B981',
        fontSize: 14,
        fontWeight: '700',
        marginTop: 16,
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 1.2,
    },
    // File card styles
    episodesFileCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
    },
    episodesFileCardActive: {
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        borderColor: 'rgba(16, 185, 129, 0.35)',
    },
    episodesFileCardLeft: {
        marginRight: 14,
    },
    episodesEpBadge: {
        width: 52,
        height: 36,
        borderRadius: 8,
        backgroundColor: 'rgba(59, 130, 246, 0.25)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    episodesEpBadgeActive: {
        backgroundColor: 'rgba(16, 185, 129, 0.35)',
    },
    episodesEpBadgeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
    },
    episodesFileCardCenter: {
        flex: 1,
    },
    episodesFileName: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 4,
        lineHeight: 20,
    },
    episodesFileSize: {
        color: '#777',
        fontSize: 12,
    },
    episodesFileCardRight: {
        marginLeft: 10,
    },
    episodesNowPlaying: {
        backgroundColor: 'rgba(16, 185, 129, 0.9)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 6,
    },
    episodesNowPlayingText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    // Empty state
    episodesEmptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    episodesEmptyTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
        marginTop: 16,
    },
    episodesEmptySubtitle: {
        color: '#666',
        fontSize: 14,
        marginTop: 8,
        textAlign: 'center',
    },
    // ==========================================
    // Subtitle/Audio Modal Styles (Bottom Sheet)
    // ==========================================
    subtitleModalContainer: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    subtitleModalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
    },
    subtitleModalPanel: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '75%',
        minHeight: 300,
        backgroundColor: '#0d0d0d',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    },
    subtitleModalHandle: {
        width: 50,
        height: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 12,
    },
    subtitleModalHeader: {
        paddingHorizontal: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    },
    subtitleModalTitle: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '700',
    },
    subtitleModalSubtitle: {
        color: '#888',
        fontSize: 13,
        marginTop: 4,
    },
    subtitleModalCloseBtn: {
        position: 'absolute',
        top: 4,
        right: 16,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Tabs for Subtitles/Audio
    subtitleTabs: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 12,
        gap: 8,
    },
    subtitleTab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderRadius: 12,
        gap: 8,
    },
    subtitleTabActive: {
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.4)',
    },
    subtitleTabText: {
        color: '#888',
        fontSize: 14,
        fontWeight: '600',
    },
    subtitleTabTextActive: {
        color: '#fff',
    },
    // Scrollable list
    subtitleListScroll: {
        flex: 1,
    },
    subtitleListContent: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 40,
    },
    // Track cards
    subtitleTrackCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
    },
    subtitleTrackCardActive: {
        backgroundColor: 'rgba(59, 130, 246, 0.12)',
        borderColor: 'rgba(59, 130, 246, 0.35)',
    },
    subtitleSettingsCard: {
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderColor: 'rgba(59, 130, 246, 0.25)',
    },
    subtitleTrackCardLeft: {
        marginRight: 14,
    },
    subtitleTrackBadge: {
        width: 44,
        height: 36,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    subtitleTrackBadgeActive: {
        backgroundColor: 'rgba(59, 130, 246, 0.35)',
    },
    subtitleTrackCardCenter: {
        flex: 1,
    },
    subtitleTrackName: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 4,
        lineHeight: 20,
    },
    subtitleTrackInfo: {
        color: '#777',
        fontSize: 12,
    },
    subtitleActiveIndicator: {
        backgroundColor: 'rgba(59, 130, 246, 0.9)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 6,
    },
    subtitleActiveText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    // Empty state
    subtitleEmptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    subtitleEmptyTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
        marginTop: 16,
    },
    subtitleEmptySubtitle: {
        color: '#666',
        fontSize: 14,
        marginTop: 8,
        textAlign: 'center',
    },
});

export default VideoPlayerScreen;
