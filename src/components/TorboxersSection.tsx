import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ScrollView,
    Animated,
    Switch,
    ActivityIndicator,
    Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
    Search,
    SlidersHorizontal,
    Download,
    Monitor,
    Zap,
    Settings,
    ChevronDown,
    ChevronUp,
    ChevronRight,
    Lightbulb,
    Sparkles,
    Cloud,
    Import,
    ArrowLeft,
    List,
    Trash2,
    RefreshCw,
    CheckCircle,
    Clock,
    User,
    Mail,
    Calendar,
    HardDrive,
} from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { getUserInfo, addTorrent, getUserTorrents, TorBoxTorrent, getDownloadLink, getTorrentFilesWithUrls } from '../services/torbox';
import { StorageService } from '../services/storage';
import {
    searchAllEngines,
    sortResults,
    TorrentResult,
    SearchResults,
    getCachedOnlyMode,
    setCachedOnlyMode,
    addToTorBox
} from '../services/torrentSearchEngine';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { TorboxPlaylistService } from '../services/torboxPlaylist';
import { Clipboard, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage key for download history
const DOWNLOADS_STORAGE_KEY = '@torboxer_downloads_history';

type TabId = 'search' | 'playlist' | 'downloads' | 'engines' | 'settings';

interface Tab {
    id: TabId;
    icon: React.ReactNode;
    label: string;
}

const TABS: Tab[] = [
    { id: 'search', icon: <Search color="#fff" size={20} />, label: 'Search' },
    { id: 'playlist', icon: <List color="#fff" size={20} />, label: 'Playlist' },
    { id: 'downloads', icon: <Download color="#fff" size={20} />, label: 'Downloads' },
    { id: 'engines', icon: <Zap color="#fff" size={20} />, label: 'Engines' },
    { id: 'settings', icon: <Settings color="#fff" size={20} />, label: 'Settings' },
];

interface TorboxersSectionProps {
    onNavigate?: (screen: string) => void;
}

export const TorboxersSection = ({ onNavigate }: TorboxersSectionProps) => {
    const navigation = useNavigation<any>();
    const [activeTab, setActiveTab] = useState<TabId>('search');
    const [searchQuery, setSearchQuery] = useState('');
    const [providersExpanded, setProvidersExpanded] = useState(false);
    const [enabledProviders] = useState(5); // Active engines count

    // Search state
    const [searching, setSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<TorrentResult[]>([]);
    const [resultsByEngine, setResultsByEngine] = useState<Map<string, number>>(new Map());
    const [totalResults, setTotalResults] = useState(0);
    const [sortBy, setSortBy] = useState<'relevance' | 'name' | 'size' | 'seeders' | 'date'>('relevance');
    const [cachedOnly, setCachedOnly] = useState(false);
    const [addingToTorbox, setAddingToTorbox] = useState<string | null>(null);
    const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
    const [selectedEngine, setSelectedEngine] = useState<string | null>(null); // For engine filter

    // TorBox account state
    const [torboxConnected, setTorboxConnected] = useState(false);
    const [torboxExpiry, setTorboxExpiry] = useState('');
    const [torboxUserInfo, setTorboxUserInfo] = useState<any>(null);
    const [loadingTorbox, setLoadingTorbox] = useState(false);

    // Sub-page navigation
    const [subPage, setSubPage] = useState<'main' | 'searchSettings' | 'importEngines' | 'torboxSettings'>('main');

    // TorBox Library state
    const [libraryTorrents, setLibraryTorrents] = useState<TorBoxTorrent[]>([]);
    const [loadingLibrary, setLoadingLibrary] = useState(false);
    const [libraryFilter, setLibraryFilter] = useState<'all' | 'completed' | 'downloading'>('all');
    const [playingTorrent, setPlayingTorrent] = useState<number | null>(null);

    // Playlist state
    const [playlistItems, setPlaylistItems] = useState<TorrentResult[]>([]);
    const [loadingPlaylist, setLoadingPlaylist] = useState(false);

    // Action Modal state
    const [actionModalVisible, setActionModalVisible] = useState(false);
    const [selectedResultForAction, setSelectedResultForAction] = useState<TorrentResult | null>(null);
    const [processingAction, setProcessingAction] = useState(false);

    // Download feature states
    const [downloadModalVisible, setDownloadModalVisible] = useState(false);
    const [fileSelectorVisible, setFileSelectorVisible] = useState(false);
    const [selectedTorrentForDownload, setSelectedTorrentForDownload] = useState<TorBoxTorrent | null>(null);
    const [selectedFileIds, setSelectedFileIds] = useState<Set<number>>(new Set());
    const [downloadsFilter, setDownloadsFilter] = useState<'inProgress' | 'finished'>('inProgress');
    const [viewingFileName, setViewingFileName] = useState<string | null>(null); // For View name popup
    const [singleFileConfirmVisible, setSingleFileConfirmVisible] = useState(false); // Single file confirmation
    const [downloadOptionsVisible, setDownloadOptionsVisible] = useState(false); // Sequential/Parallel options
    const [downloadMode, setDownloadMode] = useState<'sequential' | 'parallel'>('sequential');

    // Downloads queue (files being downloaded)
    interface DownloadItem {
        id: string;
        fileName: string;
        fileSize: number;
        progress: number;
        status: 'downloading' | 'completed' | 'failed' | 'cancelled';
        torrentName: string;
        fileId?: number; // TorBox file ID for download
        torrentId?: number; // TorBox torrent ID for retry
        localUri?: string; // Local file URI after download
        mimeType?: string; // MIME type for sharing/opening
        errorMessage?: string; // Error message if failed
        downloadUrl?: string; // Store URL for retry
    }
    const [downloads, setDownloads] = useState<DownloadItem[]>([]);

    // Load persisted downloads on mount
    useEffect(() => {
        const loadPersistedDownloads = async () => {
            try {
                const saved = await AsyncStorage.getItem(DOWNLOADS_STORAGE_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved) as DownloadItem[];
                    // Only restore completed/failed downloads (not in-progress ones)
                    const restoredDownloads = parsed.filter(d =>
                        d.status === 'completed' || d.status === 'failed'
                    );
                    if (restoredDownloads.length > 0) {
                        console.log('[TorBoxer] Restored', restoredDownloads.length, 'downloads from storage');
                        setDownloads(restoredDownloads);
                    }
                }
            } catch (error) {
                console.error('[TorBoxer] Failed to load persisted downloads:', error);
            }
        };
        loadPersistedDownloads();
    }, []);

    // Persist downloads when they change
    useEffect(() => {
        const persistDownloads = async () => {
            try {
                // Only persist completed/failed downloads
                const toSave = downloads.filter(d =>
                    d.status === 'completed' || d.status === 'failed'
                );
                await AsyncStorage.setItem(DOWNLOADS_STORAGE_KEY, JSON.stringify(toSave));
            } catch (error) {
                console.error('[TorBoxer] Failed to persist downloads:', error);
            }
        };
        persistDownloads();
    }, [downloads]);

    // Track active downloads for cancellation
    const activeDownloadsRef = React.useRef<Map<string, FileSystem.DownloadResumable>>(new Map());

    // Engines configuration - Only 4 working engines
    const [engines, setEngines] = useState([
        { id: 'torrents_csv', name: 'Torrents CSV', icon: '📄', enabled: true, maxResults: 100 },
        { id: 'pirate_bay', name: 'The Pirate Bay', icon: '🏴', enabled: true, maxResults: 100 },
        { id: 'yts', name: 'YTS', icon: '🎬', enabled: true, maxResults: 100 },
        { id: 'knaben', name: 'Knaben', icon: '🔍', enabled: true, maxResults: 100 },
    ]);

    // Max results dropdown state
    const [maxResultsDropdownOpen, setMaxResultsDropdownOpen] = useState<string | null>(null);
    const maxResultsOptions = [25, 50, 75, 100];

    // Imported engines list - Only 4 working engines
    const [importedEngines, setImportedEngines] = useState([
        { id: 'torrents_csv', name: 'Torrents CSV', icon: '📄', importDate: '21/12/2025', selected: false },
        { id: 'pirate_bay', name: 'The Pirate Bay', icon: '🏴', importDate: '21/12/2025', selected: true },
        { id: 'yts', name: 'YTS', icon: '🎬', importDate: '21/12/2025', selected: false },
        { id: 'knaben', name: 'Knaben', icon: '🔍', importDate: '21/12/2025', selected: false },
    ]);

    const removeImportedEngine = (id: string) => {
        setImportedEngines(prev => prev.filter(e => e.id !== id));
    };

    // Update max results for an engine
    const updateMaxResults = (engineId: string, value: number) => {
        setEngines(prev => prev.map(e =>
            e.id === engineId ? { ...e, maxResults: value } : e
        ));
        setMaxResultsDropdownOpen(null);
    };

    // Helper function to format bytes
    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Download feature handlers
    const openFileSelector = (torrent: TorBoxTorrent) => {
        setSelectedTorrentForDownload(torrent);
        setSelectedFileIds(new Set()); // Reset selection

        // Check if single file or multi-file
        if (torrent.files && torrent.files.length === 1) {
            // Single file - show confirmation popup
            setSingleFileConfirmVisible(true);
        } else {
            // Multi-file - show file selector
            setFileSelectorVisible(true);
        }
    };

    const toggleFileSelection = (fileId: number) => {
        setSelectedFileIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(fileId)) {
                newSet.delete(fileId);
            } else {
                newSet.add(fileId);
            }
            return newSet;
        });
    };

    const selectAllFiles = () => {
        if (selectedTorrentForDownload?.files) {
            setSelectedFileIds(new Set(selectedTorrentForDownload.files.map(f => f.id)));
        }
    };

    const getSelectedTotalSize = () => {
        if (!selectedTorrentForDownload?.files) return 0;
        return selectedTorrentForDownload.files
            .filter(f => selectedFileIds.has(f.id))
            .reduce((sum, f) => sum + f.size, 0);
    };

    const isVideoFile = (fileName: string) => {
        const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'];
        return videoExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
    };

    // Get MIME type from filename
    const getMimeType = (fileName: string): string => {
        const ext = fileName.toLowerCase().split('.').pop() || '';
        const mimeTypes: Record<string, string> = {
            'mp4': 'video/mp4',
            'mkv': 'video/x-matroska',
            'avi': 'video/x-msvideo',
            'mov': 'video/quicktime',
            'wmv': 'video/x-ms-wmv',
            'flv': 'video/x-flv',
            'webm': 'video/webm',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'pdf': 'application/pdf',
            'zip': 'application/zip',
            'rar': 'application/x-rar-compressed',
            '7z': 'application/x-7z-compressed',
            'txt': 'text/plain',
        };
        return mimeTypes[ext] || 'application/octet-stream';
    };

    // Handle opening a downloaded file
    const handleOpenFile = async (download: DownloadItem) => {
        if (!download.localUri) {
            console.error('No local URI for file');
            return;
        }
        try {
            if (Platform.OS === 'android') {
                // Use content URI for Android
                const contentUri = await FileSystem.getContentUriAsync(download.localUri);
                await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                    data: contentUri,
                    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
                    type: download.mimeType || getMimeType(download.fileName),
                });
            } else {
                // For iOS, use sharing which shows "Open with" options
                await Sharing.shareAsync(download.localUri, {
                    mimeType: download.mimeType || getMimeType(download.fileName),
                });
            }
        } catch (error) {
            console.error('Error opening file:', error);
        }
    };

    // Handle sharing/saving a downloaded file
    const handleShareFile = async (download: DownloadItem) => {
        if (!download.localUri) {
            console.error('No local URI for file');
            return;
        }
        try {
            const isAvailable = await Sharing.isAvailableAsync();
            if (isAvailable) {
                await Sharing.shareAsync(download.localUri, {
                    mimeType: download.mimeType || getMimeType(download.fileName),
                    dialogTitle: `Save ${download.fileName}`,
                });
            } else {
                console.error('Sharing not available on this device');
            }
        } catch (error) {
            console.error('Error sharing file:', error);
        }
    };

    // Handle cancelling an active download
    const handleCancelDownload = async (downloadId: string) => {
        const downloadResumable = activeDownloadsRef.current.get(downloadId);
        if (downloadResumable) {
            try {
                await downloadResumable.cancelAsync();
                console.log('Cancelled download:', downloadId);
            } catch (error) {
                console.error('Error cancelling download:', error);
            }
            activeDownloadsRef.current.delete(downloadId);
        }
        // Update status to cancelled
        setDownloads(prev => prev.map(d =>
            d.id === downloadId ? { ...d, status: 'cancelled' as const, errorMessage: 'Download cancelled' } : d
        ));
    };

    // Handle removing a download (from list and optionally delete file)
    const handleRemoveDownload = async (downloadId: string, deleteFile: boolean = true) => {
        // First cancel if still downloading
        const download = downloads.find(d => d.id === downloadId);
        if (download?.status === 'downloading') {
            await handleCancelDownload(downloadId);
        }
        if (download && download.localUri && deleteFile) {
            try {
                await FileSystem.deleteAsync(download.localUri, { idempotent: true });
                console.log('Deleted file:', download.localUri);
            } catch (error) {
                console.error('Error deleting file:', error);
            }
        }
        setDownloads(prev => prev.filter(d => d.id !== downloadId));
    };

    // Legacy remove function (keep for compatibility)
    const removeDownload = (downloadId: string) => {
        handleRemoveDownload(downloadId, true);
    };

    const handleDownloadFiles = async (mode: 'sequential' | 'parallel' = 'sequential', overrideFileIds?: Set<number>) => {
        const fileIds = overrideFileIds || selectedFileIds;
        if (!selectedTorrentForDownload || fileIds.size === 0) return;

        // Request permissions
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
            console.error('Media library permission denied');
            return;
        }

        // Add selected files to download queue
        const filesToDownload = selectedTorrentForDownload.files.filter(f => fileIds.has(f.id));
        const torrentId = selectedTorrentForDownload.id;

        const newDownloads = filesToDownload.map(file => ({
            id: `${torrentId}_${file.id}_${Date.now()}`,
            fileName: file.name,
            fileSize: file.size,
            progress: 0,
            status: 'downloading' as const,
            torrentName: selectedTorrentForDownload.name,
            fileId: file.id,
        }));

        setDownloads(prev => [...newDownloads, ...prev]);
        setFileSelectorVisible(false);
        setSelectedTorrentForDownload(null);
        setSelectedFileIds(new Set());

        // Switch to Downloads tab
        setActiveTab('downloads');

        // Helper function to download a single file
        const downloadSingleFile = async (download: typeof newDownloads[0]) => {
            try {
                console.log('Getting download URL for:', download.fileName);

                // Get download link from TorBox
                const downloadUrl = await getDownloadLink(torrentId, download.fileId as number);

                if (!downloadUrl) {
                    console.error('No download URL received for:', download.fileName);
                    setDownloads(prev => prev.map(d =>
                        d.id === download.id ? { ...d, status: 'failed' as const, errorMessage: 'No download URL received' } : d
                    ));
                    return;
                }

                console.log('Starting download from:', downloadUrl.substring(0, 50) + '...');

                // Create download path in cache directory (temporary but fast)
                // Sanitize filename by removing problematic characters
                const safeFileName = download.fileName.replace(/[<>:"/\\|?*]/g, '_');
                const fileUri = FileSystem.cacheDirectory + safeFileName;
                const mimeType = getMimeType(download.fileName);

                // Store download URL for retry
                setDownloads(prev => prev.map(d =>
                    d.id === download.id ? { ...d, downloadUrl, torrentId } : d
                ));

                // Create resumable download with progress callback
                const downloadResumable = FileSystem.createDownloadResumable(
                    downloadUrl,
                    fileUri,
                    {},
                    (downloadProgress) => {
                        const progress = Math.round(
                            (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100
                        );
                        setDownloads(prev => prev.map(d =>
                            d.id === download.id ? { ...d, progress } : d
                        ));
                    }
                );

                // Store reference for cancellation
                activeDownloadsRef.current.set(download.id, downloadResumable);

                // Start download with 5 minute timeout
                const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
                const downloadPromise = downloadResumable.downloadAsync();
                const timeoutPromise = new Promise<null>((_, reject) =>
                    setTimeout(() => reject(new Error('Download timeout - slow connection')), DOWNLOAD_TIMEOUT_MS)
                );

                const result = await Promise.race([downloadPromise, timeoutPromise]);

                if (result?.uri) {
                    console.log('Download completed:', result.uri);

                    // Clean up reference
                    activeDownloadsRef.current.delete(download.id);

                    // Update status to completed with localUri and mimeType
                    setDownloads(prev => prev.map(d =>
                        d.id === download.id ? {
                            ...d,
                            progress: 100,
                            status: 'completed' as const,
                            localUri: result.uri,
                            mimeType: mimeType,
                        } : d
                    ));

                    // Try to save to media library for media files (optional)
                    try {
                        if (mimeType.startsWith('video/') || mimeType.startsWith('image/')) {
                            const asset = await MediaLibrary.createAssetAsync(result.uri);
                            console.log('Also saved to media library:', asset.filename);
                        }
                    } catch (mediaError) {
                        console.log('Media library save skipped (user can use Share button):', mediaError);
                    }
                } else {
                    throw new Error('Download result has no URI');
                }
            } catch (error: any) {
                console.error('Download error for', download.fileName, ':', error);
                // Clean up reference on error
                activeDownloadsRef.current.delete(download.id);
                setDownloads(prev => prev.map(d =>
                    d.id === download.id ? {
                        ...d,
                        status: 'failed' as const,
                        errorMessage: error.message || 'Download failed',
                    } : d
                ));
            }
        };

        // Download based on mode
        if (mode === 'parallel') {
            // Parallel download - ALL files start at once
            await Promise.all(newDownloads.map(download => downloadSingleFile(download)));
        } else {
            // Sequential download - one by one (finishes one, starts next)
            for (const download of newDownloads) {
                await downloadSingleFile(download);
            }
        }
    };

    // Load TorBox user info on mount and when settings tab is selected
    const loadTorboxInfo = async () => {
        setLoadingTorbox(true);
        try {
            const apiKey = await StorageService.getTorBoxApiKey();
            if (apiKey) {
                const userInfo = await getUserInfo();
                if (userInfo) {
                    setTorboxConnected(true);
                    setTorboxUserInfo(userInfo);
                    // Format expiry date
                    if (userInfo.premium_expires_at) {
                        const date = new Date(userInfo.premium_expires_at);
                        setTorboxExpiry(date.toISOString().split('T')[0]);
                    }
                } else {
                    setTorboxConnected(false);
                }
            } else {
                setTorboxConnected(false);
            }
        } catch (error) {
            console.error('Error loading TorBox info:', error);
            setTorboxConnected(false);
        }
        setLoadingTorbox(false);
    };

    useEffect(() => {
        loadTorboxInfo();
        // Load cached only setting from storage
        const loadCachedOnlySetting = async () => {
            const savedCachedOnly = await getCachedOnlyMode();
            setCachedOnly(savedCachedOnly);
            console.log('Loaded cachedOnly setting:', savedCachedOnly);
        };
        loadCachedOnlySetting();
    }, []);

    // Handle Cached Only toggle - save to storage
    const handleCachedOnlyChange = async (value: boolean) => {
        setCachedOnly(value);
        await setCachedOnlyMode(value);
        console.log('Saved cachedOnly setting:', value);
    };

    const toggleEngine = (id: string) => {
        setEngines(prev => prev.map(e =>
            e.id === id ? { ...e, enabled: !e.enabled } : e
        ));
    };

    // Load TorBox Library torrents
    const loadLibrary = async () => {
        setLoadingLibrary(true);
        try {
            const torrents = await getUserTorrents();
            setLibraryTorrents(torrents);
            console.log('Loaded library:', torrents.length, 'torrents');
        } catch (error) {
            console.error('Error loading library:', error);
        } finally {
            setLoadingLibrary(false);
        }
    };

    // Refresh library when Engines tab is selected
    useEffect(() => {
        if (activeTab === 'engines') {
            loadLibrary();
        }
    }, [activeTab]);

    // Playlist handlers
    useEffect(() => {
        loadPlaylist();
    }, []);

    const loadPlaylist = async () => {
        setLoadingPlaylist(true);
        const items = await TorboxPlaylistService.getPlaylist();
        setPlaylistItems(items);
        setLoadingPlaylist(false);
    };

    const handleAddToPlaylist = async (item: TorrentResult) => {
        const success = await TorboxPlaylistService.addToPlaylist(item);
        if (success) {
            console.log('Added to playlist:', item.title);
            await loadPlaylist(); // Refresh
        }
        setActionModalVisible(false);
    };

    const handleRemoveFromPlaylist = async (infoHash: string) => {
        const success = await TorboxPlaylistService.removeFromPlaylist(infoHash);
        if (success) {
            console.log('Removed from playlist:', infoHash);
            await loadPlaylist(); // Refresh
        }
    };

    const handleCopyMagnet = (link: string | undefined) => {
        if (link) {
            Clipboard.setString(link);
            console.log('Magnet link copied');
            // You might want to show a toast here
        }
    };

    const handlePlayNow = async (item: TorrentResult) => {
        setProcessingAction(true);
        try {
            // First ensure it's added to TorBox
            const torrent = await addTorrent(item.infoHash);
            if (torrent) {
                console.log('Playing from TorBox:', item.title);
                setActionModalVisible(false);

                // Navigate IMMEDIATELY with torrentId - URL will be resolved lazily in VideoPlayer
                // This is much faster than waiting for all file URLs
                navigation.navigate('VideoPlayer', {
                    title: item.title,
                    videoUrl: null, // Will be resolved in player
                    torrentHash: item.infoHash,
                    torrentId: torrent.id,
                    // Files will be loaded in background by VideoPlayerScreen
                    provider: 'torbox',
                    useTorBoxMode: true,
                });
            } else {
                console.error('Failed to add to TorBox for playing');
            }
        } catch (error) {
            console.error('Error in Play Now:', error);
        } finally {
            setProcessingAction(false);
        }
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;

        setSearching(true);
        setSortDropdownOpen(false);

        try {
            console.log('Searching for:', searchQuery);
            // Pass engine settings to search (enabled, maxResults)
            const engineSettings = engines.map(e => ({
                id: e.id,
                enabled: e.enabled,
                maxResults: e.maxResults,
            }));
            const results = await searchAllEngines(searchQuery, cachedOnly, engineSettings);

            setTotalResults(results.totalResults);
            setResultsByEngine(results.resultsByEngine);

            // Apply sorting
            const sorted = sortResults(results.results, sortBy);
            setSearchResults(sorted);

            console.log('Search complete:', results.totalResults, 'results');
        } catch (error) {
            console.error('Search error:', error);
            setSearchResults([]);
            setTotalResults(0);
        } finally {
            setSearching(false);
        }
    };

    const handleSuggestionPress = (suggestion: string) => {
        setSearchQuery(suggestion);
    };

    // Get color for source badge based on engine
    const getSourceColor = (source: string): string => {
        const colors: Record<string, string> = {
            'tpb': '#F59E0B',      // Yellow/Orange for TPB
            'pirate_bay': '#F59E0B',
            'yts': '#10B981',      // Green for YTS
            'tcsv': '#8B5CF6',     // Purple for Torrents CSV
            'torrents_csv': '#8B5CF6',
            'knaben': '#3B82F6',   // Blue for Knaben
            'solid': '#EC4899',    // Pink for SolidTorrents
            'solid_torrents': '#EC4899',
        };
        return colors[source?.toLowerCase()] || '#6B7280';  // Gray default
    };

    const handleSortChange = (newSort: 'relevance' | 'name' | 'size' | 'seeders' | 'date') => {
        setSortBy(newSort);
        setSortDropdownOpen(false);
        // Re-sort existing results
        setSearchResults(prev => sortResults(prev, newSort));
    };

    const handleAddToTorbox = async (result: TorrentResult) => {
        setAddingToTorbox(result.id);

        try {
            // Check cache status/add to account first
            const success = await addToTorBox(result.infoHash);
            if (success) {
                console.log('Added/Checked TorBox:', result.title);
                // Instead of navigating, open the Action Modal
                setSelectedResultForAction(result);
                setActionModalVisible(true);
            } else {
                console.error('Failed to add to TorBox');
            }
        } catch (error) {
            console.error('Error adding to TorBox:', error);
        } finally {
            setAddingToTorbox(null);
        }
    };

    const renderTabContent = () => {
        // Handle sub-pages first
        if (subPage === 'searchSettings') {
            return renderSearchSettingsContent();
        }
        if (subPage === 'importEngines') {
            return renderImportEnginesContent();
        }
        if (subPage === 'torboxSettings') {
            return renderTorboxSettingsContent();
        }

        switch (activeTab) {
            case 'search':
                return renderSearchContent();
            case 'playlist':
                return renderPlaylistContent();
            case 'downloads':
                return renderDownloadsContent();
            case 'engines':
                return renderEnginesContent();
            case 'settings':
                return renderSettingsContent();
            default:
                return renderSearchContent();
        }
    };

    const renderPlaylistContent = () => (
        <>
            <View style={styles.settingsBanner}>
                <View style={[styles.settingsBannerIcon, { backgroundColor: 'rgba(99, 102, 241, 0.2)' }]}>
                    <List color="#6366F1" size={28} />
                </View>
                <View style={styles.settingsBannerText}>
                    <Text style={styles.settingsBannerTitle}>Your Playlist</Text>
                    <Text style={styles.settingsBannerSubtitle}>
                        {playlistItems.length} saved {playlistItems.length === 1 ? 'item' : 'items'} ready to play
                    </Text>
                </View>
            </View>

            {/* Search Playlist Input */}
            <View style={styles.searchBarContainer}>
                <Search color="#666" size={20} style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search playlist..."
                    placeholderTextColor="#666"
                // Implement search filtering if needed
                />
            </View>

            {loadingPlaylist ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#6366F1" />
                </View>
            ) : playlistItems.length === 0 ? (
                <View style={styles.emptyDownloadsContainer}>
                    <List color="#6366F1" size={48} style={{ opacity: 0.5, marginBottom: 16 }} />
                    <Text style={styles.emptyDownloadsText}>Playlist is empty</Text>
                    <Text style={styles.emptyDownloadsSubtext}>
                        Add torrents from search results to watch later
                    </Text>
                </View>
            ) : (
                playlistItems.map((item) => (
                    <View key={item.id} style={styles.playlistCard}>
                        {/* Header */}
                        <View style={styles.playlistCardHeader}>
                            <Text style={styles.playlistCardTitle} numberOfLines={2}>
                                {item.title}
                            </Text>
                            <TouchableOpacity
                                style={styles.playlistDeleteButton}
                                onPress={() => handleRemoveFromPlaylist(item.infoHash)}
                            >
                                <Trash2 color="#EF4444" size={18} />
                            </TouchableOpacity>
                        </View>

                        {/* Badges */}
                        <View style={styles.playlistBadges}>
                            <View style={styles.playlistBadge}>
                                <Text style={styles.playlistBadgeText}>{item.sourceDisplayName || 'TorBox'}</Text>
                            </View>
                            <View style={styles.playlistBadge}>
                                <Text style={styles.playlistBadgeText}>
                                    {item.size || formatBytes(item.sizeBytes)}
                                </Text>
                            </View>
                        </View>

                        {/* Actions */}
                        <View style={styles.playlistActions}>
                            <TouchableOpacity
                                style={styles.playNowButton}
                                onPress={() => handlePlayNow(item)}
                                disabled={processingAction}
                            >
                                {processingAction ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <Text style={styles.playNowButtonIcon}>▶</Text>
                                        <Text style={styles.playNowButtonText}>Play now</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                            <Text style={styles.addedDate}>
                                Added {item.date || 'recently'}
                            </Text>
                        </View>
                    </View>
                ))
            )}
        </>
    );

    const renderEnginesContent = () => {
        const formatBytes = (bytes: number): string => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        const formatDate = (dateString: string): string => {
            if (!dateString) return '';
            const date = new Date(dateString);
            return date.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        };

        const handlePlay = async (torrent: TorBoxTorrent) => {
            setPlayingTorrent(torrent.id);
            try {
                console.log('Playing torrent:', torrent.name);

                // Navigate IMMEDIATELY with torrentId - URL will be resolved lazily in VideoPlayer
                // This is much faster than waiting for all file URLs to load
                navigation.navigate('VideoPlayer', {
                    title: torrent.name,
                    videoUrl: null, // Will be resolved in player
                    torrentHash: torrent.hash,
                    torrentId: torrent.id,
                    // Files will be loaded in background by VideoPlayerScreen
                    useTorBoxMode: true,
                });
            } catch (error) {
                console.error('Error playing torrent:', error);
            } finally {
                setPlayingTorrent(null);
            }
        };

        const filteredTorrents = libraryTorrents.filter(t => {
            if (libraryFilter === 'completed') return t.progress >= 100;
            if (libraryFilter === 'downloading') return t.progress < 100;
            return true;
        });

        return (
            <>
                {/* Library Header */}
                <View style={styles.libraryHeader}>
                    <TouchableOpacity style={styles.libraryFilterDropdown} activeOpacity={0.8}>
                        <Text style={styles.libraryFilterText}>Torrents</Text>
                        <ChevronDown color="#fff" size={16} />
                    </TouchableOpacity>
                    <View style={styles.libraryActions}>
                        <TouchableOpacity style={styles.libraryActionButton} activeOpacity={0.7}>
                            <Text style={styles.libraryActionIcon}>+</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.libraryActionButton} activeOpacity={0.7}>
                            <Trash2 color="#EF4444" size={18} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Loading */}
                {loadingLibrary && (
                    <View style={styles.placeholderContainer}>
                        <ActivityIndicator size="large" color="#6366F1" />
                        <Text style={styles.placeholderTitle}>Loading Library...</Text>
                    </View>
                )}

                {/* Empty State */}
                {!loadingLibrary && libraryTorrents.length === 0 && (
                    <View style={styles.placeholderContainer}>
                        <View style={styles.placeholderIcon}>
                            <Zap color="#F59E0B" size={32} />
                        </View>
                        <Text style={styles.placeholderTitle}>No Torrents</Text>
                        <Text style={styles.placeholderSubtitle}>
                            Search and add torrents to see them here
                        </Text>
                    </View>
                )}

                {/* Torrent Cards */}
                {!loadingLibrary && filteredTorrents.map((torrent) => (
                    <View key={torrent.id} style={styles.libraryCard}>
                        {/* Header with title and menu */}
                        <View style={styles.libraryCardHeader}>
                            <Text style={styles.libraryCardTitle} numberOfLines={2}>
                                {torrent.name}
                            </Text>
                            <TouchableOpacity style={styles.libraryCardMenu}>
                                <Text style={{ color: '#888', fontSize: 20 }}>⋮</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Badges Row */}
                        <View style={styles.libraryCardBadges}>
                            <View style={styles.libraryBadge}>
                                <Text style={styles.libraryBadgeText}>{formatBytes(torrent.size)}</Text>
                            </View>
                            <View style={[styles.libraryBadge, styles.libraryBadgeYellow]}>
                                <Text style={styles.libraryBadgeText}>
                                    ⚡ {torrent.files?.length || 1} file{(torrent.files?.length || 1) > 1 ? 's' : ''}
                                </Text>
                            </View>
                            <View style={[styles.libraryBadge, styles.libraryBadgeGreen]}>
                                <Text style={styles.libraryBadgeText}>↓ {Math.round(torrent.progress)}%</Text>
                            </View>
                        </View>

                        {/* Server Info */}
                        <Text style={styles.libraryCardMeta}>
                            ⚡ Server 0 • {torrent.hash.substring(0, 4)}... • {
                                (torrent.created_at || torrent.updated_at)
                                    ? `Added ${new Date(torrent.created_at || torrent.updated_at || '').toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                                    : 'In Library ✓'
                            }
                        </Text>

                        {/* Action Buttons */}
                        <View style={styles.libraryCardActions}>
                            <TouchableOpacity
                                style={styles.libraryPlayButton}
                                onPress={() => handlePlay(torrent)}
                                disabled={playingTorrent === torrent.id}
                                activeOpacity={0.8}
                            >
                                {playingTorrent === torrent.id ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <Text style={styles.libraryPlayIcon}>▶</Text>
                                        <Text style={styles.libraryPlayText}>Play</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.libraryDownloadButton}
                                activeOpacity={0.8}
                                onPress={() => openFileSelector(torrent)}
                            >
                                <Download color="#fff" size={18} />
                                <Text style={styles.libraryDownloadText}>Download</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}
            </>
        );
    };

    const renderDownloadsContent = () => {
        const filteredDownloads = downloads.filter(d => {
            if (downloadsFilter === 'inProgress') return d.status === 'downloading';
            return d.status === 'completed' || d.status === 'failed' || d.status === 'cancelled';
        });

        return (
            <>
                {/* Downloads Header Banner */}
                <View style={styles.settingsBanner}>
                    <View style={[styles.settingsBannerIcon, { backgroundColor: 'rgba(99, 102, 241, 0.2)' }]}>
                        <Download color="#6366F1" size={28} />
                    </View>
                    <View style={styles.settingsBannerText}>
                        <Text style={styles.settingsBannerTitle}>Downloads</Text>
                        <Text style={styles.settingsBannerSubtitle}>
                            Manage your local downloads
                        </Text>
                    </View>
                </View>

                {/* Downloads Filter Tabs */}
                <View style={styles.downloadsFilterContainer}>
                    <TouchableOpacity
                        style={[
                            styles.downloadsFilterTab,
                            downloadsFilter === 'inProgress' && styles.downloadsFilterTabActive
                        ]}
                        onPress={() => setDownloadsFilter('inProgress')}
                        activeOpacity={0.8}
                    >
                        <Text style={[
                            styles.downloadsFilterTabText,
                            downloadsFilter === 'inProgress' && styles.downloadsFilterTabTextActive
                        ]}>In Progress</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.downloadsFilterTab,
                            downloadsFilter === 'finished' && styles.downloadsFilterTabActive
                        ]}
                        onPress={() => setDownloadsFilter('finished')}
                        activeOpacity={0.8}
                    >
                        <Text style={[
                            styles.downloadsFilterTabText,
                            downloadsFilter === 'finished' && styles.downloadsFilterTabTextActive
                        ]}>Finished</Text>
                    </TouchableOpacity>
                </View>

                {/* Downloads List */}
                {filteredDownloads.length === 0 ? (
                    <View style={styles.emptyDownloadsContainer}>
                        <Download color="#6366F1" size={48} style={{ opacity: 0.5, marginBottom: 16 }} />
                        <Text style={styles.emptyDownloadsText}>No downloads</Text>
                        <Text style={styles.emptyDownloadsSubtext}>
                            {downloadsFilter === 'inProgress' ? 'Start downloading files from your library' : 'Completed downloads will appear here'}
                        </Text>
                    </View>
                ) : (
                    filteredDownloads.map((download) => (
                        <View key={download.id} style={[
                            styles.downloadBentoCard,
                            download.status === 'completed' && styles.downloadBentoCardCompleted,
                            download.status === 'failed' && styles.downloadBentoCardFailed,
                        ]}>
                            {/* Top Row: Icon + File Info */}
                            <View style={styles.downloadBentoTop}>
                                {/* File Type Icon */}
                                <View style={[
                                    styles.downloadBentoIcon,
                                    download.status === 'completed' && { backgroundColor: 'rgba(16, 185, 129, 0.2)' },
                                    download.status === 'failed' && { backgroundColor: 'rgba(239, 68, 68, 0.2)' },
                                ]}>
                                    {download.status === 'completed' ? (
                                        <CheckCircle color="#10B981" size={24} />
                                    ) : download.status === 'failed' ? (
                                        <Text style={{ fontSize: 20 }}>❌</Text>
                                    ) : (
                                        <Download color="#6366F1" size={22} />
                                    )}
                                </View>

                                {/* File Info */}
                                <View style={styles.downloadBentoInfo}>
                                    <Text style={styles.downloadBentoFileName} numberOfLines={2}>
                                        {download.fileName}
                                    </Text>
                                    <View style={styles.downloadBentoMeta}>
                                        <View style={styles.downloadBentoSizeBadge}>
                                            <Text style={styles.downloadBentoSizeText}>
                                                {formatBytes(download.fileSize)}
                                            </Text>
                                        </View>
                                        <Text style={styles.downloadBentoTorrentName} numberOfLines={1}>
                                            {download.torrentName}
                                        </Text>
                                    </View>
                                </View>

                                {/* Delete Button */}
                                <TouchableOpacity
                                    style={styles.downloadBentoDeleteBtn}
                                    onPress={() => removeDownload(download.id)}
                                    activeOpacity={0.7}
                                >
                                    <Trash2 color="#EF4444" size={18} />
                                </TouchableOpacity>
                            </View>

                            {/* Progress Section (for downloading items) */}
                            {download.status === 'downloading' && (
                                <View style={styles.downloadBentoProgress}>
                                    {/* Progress Bar */}
                                    <View style={styles.downloadBentoProgressBar}>
                                        <View
                                            style={[
                                                styles.downloadBentoProgressFill,
                                                { width: `${download.progress}%` }
                                            ]}
                                        />
                                        {/* Animated shimmer effect */}
                                        <View style={[
                                            styles.downloadBentoProgressShimmer,
                                            { left: `${Math.max(0, download.progress - 5)}%` }
                                        ]} />
                                    </View>

                                    {/* Progress Stats */}
                                    <View style={styles.downloadBentoStats}>
                                        <Text style={styles.downloadBentoProgressPercent}>
                                            {download.progress}%
                                        </Text>
                                        <Text style={styles.downloadBentoDownloadingText}>
                                            Downloading...
                                        </Text>
                                    </View>

                                    {/* Cancel Button */}
                                    <TouchableOpacity
                                        style={{
                                            marginTop: 8,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                            paddingVertical: 8,
                                            borderRadius: 8,
                                            gap: 6,
                                        }}
                                        onPress={() => handleCancelDownload(download.id)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={{ color: '#EF4444', fontWeight: '600', fontSize: 13 }}>✕ Cancel Download</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* Cancelled status */}
                            {download.status === 'cancelled' && (
                                <View>
                                    <View style={styles.downloadBentoStatusFailed}>
                                        <Text style={styles.downloadBentoStatusFailedText}>
                                            Download Cancelled
                                        </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                                        <TouchableOpacity
                                            style={{
                                                flex: 1,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                                paddingVertical: 10,
                                                borderRadius: 8,
                                                gap: 6,
                                            }}
                                            onPress={() => handleRemoveDownload(download.id)}
                                            activeOpacity={0.7}
                                        >
                                            <Trash2 color="#EF4444" size={14} />
                                            <Text style={{ color: '#EF4444', fontWeight: '600', fontSize: 13 }}>Remove</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}

                            {/* Status Badge for Completed/Failed */}
                            {download.status === 'completed' && (
                                <View>
                                    <View style={styles.downloadBentoStatusCompleted}>
                                        <CheckCircle color="#10B981" size={14} />
                                        <Text style={styles.downloadBentoStatusCompletedText}>
                                            Download Complete
                                        </Text>
                                    </View>
                                    {/* Action Buttons for Completed */}
                                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                                        <TouchableOpacity
                                            style={{
                                                flex: 1,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                backgroundColor: '#6366F1',
                                                paddingVertical: 10,
                                                borderRadius: 8,
                                                gap: 6,
                                            }}
                                            onPress={() => handleOpenFile(download)}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>▶ Open</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={{
                                                flex: 1,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                backgroundColor: '#10B981',
                                                paddingVertical: 10,
                                                borderRadius: 8,
                                                gap: 6,
                                            }}
                                            onPress={() => handleShareFile(download)}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>📤 Save</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                            {download.status === 'failed' && (
                                <View>
                                    <View style={styles.downloadBentoStatusFailed}>
                                        <Text style={styles.downloadBentoStatusFailedText}>
                                            {download.errorMessage || 'Download Failed'}
                                        </Text>
                                    </View>
                                    {/* Action Buttons for Failed */}
                                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                                        <TouchableOpacity
                                            style={{
                                                flex: 1,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                backgroundColor: '#6366F1',
                                                paddingVertical: 10,
                                                borderRadius: 8,
                                                gap: 6,
                                            }}
                                            onPress={() => {
                                                // Retry download - remove and re-add
                                                handleRemoveDownload(download.id, false);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <RefreshCw color="#fff" size={14} />
                                            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Retry</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={{
                                                flex: 1,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                                paddingVertical: 10,
                                                borderRadius: 8,
                                                gap: 6,
                                            }}
                                            onPress={() => handleRemoveDownload(download.id)}
                                            activeOpacity={0.7}
                                        >
                                            <Trash2 color="#EF4444" size={14} />
                                            <Text style={{ color: '#EF4444', fontWeight: '600', fontSize: 13 }}>Remove</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </View>
                    ))
                )}
            </>
        );
    };

    const renderSettingsContent = () => (
        <>
            {/* Settings Header Banner */}
            <View style={styles.settingsBanner}>
                <View style={styles.settingsBannerIcon}>
                    <Settings color="#fff" size={28} />
                </View>
                <View style={styles.settingsBannerText}>
                    <Text style={styles.settingsBannerTitle}>Settings</Text>
                    <Text style={styles.settingsBannerSubtitle}>
                        Manage connections and clean up your library.
                    </Text>
                </View>
            </View>

            {/* Connections Section */}
            <Text style={styles.settingsSectionLabel}>Connections</Text>

            <TouchableOpacity
                style={styles.connectionCard}
                activeOpacity={0.8}
                onPress={() => setSubPage('torboxSettings')}
            >
                <View style={styles.connectionIconContainer}>
                    <Zap color="#F59E0B" size={24} />
                </View>
                <View style={styles.connectionInfo}>
                    <Text style={styles.connectionName}>Torbox</Text>
                    <Text style={[
                        styles.connectionStatus,
                        torboxConnected && styles.connectionStatusActive
                    ]}>
                        {torboxConnected ? 'Active' : 'Not connected'}
                    </Text>
                    {torboxConnected && (
                        <Text style={styles.connectionExpiry}>Expires {torboxExpiry}</Text>
                    )}
                </View>
                <View style={styles.connectionRight}>
                    {torboxConnected && <View style={styles.connectionDot} />}
                    <ChevronRight color="#666" size={20} />
                </View>
            </TouchableOpacity>

            {/* Search Section */}
            <Text style={styles.settingsSectionLabel}>Search</Text>

            <TouchableOpacity
                style={styles.settingsItem}
                activeOpacity={0.8}
                onPress={() => setSubPage('searchSettings')}
            >
                <View style={styles.settingsItemIcon}>
                    <Search color="#3B82F6" size={22} />
                </View>
                <View style={styles.settingsItemInfo}>
                    <Text style={styles.settingsItemTitle}>Search Settings</Text>
                    <Text style={styles.settingsItemSubtitle}>Engines, filters, and sorting</Text>
                </View>
                <ChevronRight color="#666" size={20} />
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.settingsItem}
                activeOpacity={0.8}
                onPress={() => setSubPage('importEngines')}
            >
                <View style={styles.settingsItemIcon}>
                    <Import color="#8B5CF6" size={22} />
                </View>
                <View style={styles.settingsItemInfo}>
                    <Text style={styles.settingsItemTitle}>Import Engines</Text>
                    <Text style={styles.settingsItemSubtitle}>Import and manage torrent search engines</Text>
                </View>
                <ChevronRight color="#666" size={20} />
            </TouchableOpacity>
        </>
    );

    const renderTorboxSettingsContent = () => {
        const formatBytes = (bytes: number): string => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        const formatDate = (dateString: string): string => {
            if (!dateString) return 'N/A';
            const date = new Date(dateString);
            return date.toISOString().split('T')[0];
        };

        return (
            <>
                {/* Header with back */}
                <View style={styles.importHeader}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => setSubPage('main')}
                        activeOpacity={0.7}
                    >
                        <ArrowLeft color="#fff" size={24} />
                    </TouchableOpacity>
                    <Text style={styles.importHeaderTitle}>Torbox Settings</Text>
                    <TouchableOpacity
                        style={styles.refreshButton}
                        activeOpacity={0.7}
                        onPress={loadTorboxInfo}
                    >
                        <RefreshCw color="#888" size={20} />
                    </TouchableOpacity>
                </View>

                {loadingTorbox ? (
                    <View style={styles.placeholderContainer}>
                        <ActivityIndicator size="large" color="#6366F1" />
                        <Text style={styles.placeholderTitle}>Loading...</Text>
                    </View>
                ) : !torboxConnected ? (
                    <View style={styles.placeholderContainer}>
                        <View style={styles.placeholderIcon}>
                            <Zap color="#F59E0B" size={32} />
                        </View>
                        <Text style={styles.placeholderTitle}>Not Connected</Text>
                        <Text style={styles.placeholderSubtitle}>
                            Add your TorBox API key in Streamed Profile settings
                        </Text>
                    </View>
                ) : (
                    <>
                        {/* Account Information Card */}
                        <View style={styles.torboxAccountCard}>
                            <View style={styles.torboxAccountHeader}>
                                <View style={styles.torboxAccountIcon}>
                                    <Zap color="#F59E0B" size={24} />
                                </View>
                                <View style={styles.torboxAccountInfo}>
                                    <Text style={styles.torboxAccountEmail}>
                                        {torboxUserInfo?.email || 'Unknown'}
                                    </Text>
                                    <Text style={styles.torboxAccountId}>
                                        User ID: {torboxUserInfo?.id || 'N/A'}
                                    </Text>
                                </View>
                            </View>

                            {/* Status Badges */}
                            <View style={styles.torboxBadgeRow}>
                                <View style={[styles.torboxBadge, styles.torboxBadgeGreen]}>
                                    <CheckCircle color="#10B981" size={14} />
                                    <Text style={[styles.torboxBadgeText, { color: '#10B981' }]}>
                                        Subscription: Active
                                    </Text>
                                </View>
                                <View style={[styles.torboxBadge, styles.torboxBadgeBlue]}>
                                    <List color="#3B82F6" size={14} />
                                    <Text style={[styles.torboxBadgeText, { color: '#3B82F6' }]}>
                                        Plan: {torboxUserInfo?.plan ? `Tier ${torboxUserInfo.plan}` : 'Free'}
                                    </Text>
                                </View>
                            </View>

                            {/* Download Badge */}
                            <View style={styles.torboxBadgeRow}>
                                <View style={[styles.torboxBadge, styles.torboxBadgePurple]}>
                                    <HardDrive color="#8B5CF6" size={14} />
                                    <Text style={[styles.torboxBadgeText, { color: '#8B5CF6' }]}>
                                        Downloaded: {formatBytes(torboxUserInfo?.total_downloaded || 0)}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Stats List */}
                        <View style={styles.torboxStatsList}>
                            <View style={styles.torboxStatItem}>
                                <Clock color="#888" size={18} />
                                <Text style={styles.torboxStatLabel}>Premium Expires:</Text>
                                <Text style={styles.torboxStatValue}>
                                    {formatDate(torboxUserInfo?.premium_expires_at)}
                                </Text>
                            </View>

                            <View style={styles.torboxStatItem}>
                                <Clock color="#888" size={18} />
                                <Text style={styles.torboxStatLabel}>Cooldown Until:</Text>
                                <Text style={styles.torboxStatValue}>
                                    {formatDate(torboxUserInfo?.cooldown_until)}
                                </Text>
                            </View>

                            <View style={styles.torboxStatItem}>
                                <Download color="#888" size={18} />
                                <Text style={styles.torboxStatLabel}>Torrents Added:</Text>
                                <Text style={styles.torboxStatValue}>
                                    {torboxUserInfo?.total_torrents || 0}
                                </Text>
                            </View>

                            <View style={styles.torboxStatItem}>
                                <Download color="#888" size={18} />
                                <Text style={styles.torboxStatLabel}>Web Downloads:</Text>
                                <Text style={styles.torboxStatValue}>
                                    {torboxUserInfo?.total_web_downloads || 0}
                                </Text>
                            </View>

                            <View style={styles.torboxStatItem}>
                                <Cloud color="#888" size={18} />
                                <Text style={styles.torboxStatLabel}>Usenet Jobs:</Text>
                                <Text style={styles.torboxStatValue}>
                                    {torboxUserInfo?.total_usenet_downloads || 0}
                                </Text>
                            </View>
                        </View>

                        {/* Cached Only Toggle */}
                        <View style={styles.cachedOnlySection}>
                            <Text style={styles.cachedOnlySectionTitle}>Search Options</Text>
                            <View style={styles.cachedOnlyToggleRow}>
                                <View style={styles.cachedOnlyInfo}>
                                    <View style={styles.cachedOnlyIconContainer}>
                                        <Cloud color="#6366F1" size={20} />
                                    </View>
                                    <View style={styles.cachedOnlyTextContainer}>
                                        <Text style={styles.cachedOnlyLabel}>Cached Only Mode</Text>
                                        <Text style={styles.cachedOnlyDescription}>
                                            Search TorBox cloud for instantly available content
                                        </Text>
                                    </View>
                                </View>
                                <Switch
                                    value={cachedOnly}
                                    onValueChange={handleCachedOnlyChange}
                                    trackColor={{ false: '#333', true: 'rgba(99, 102, 241, 0.5)' }}
                                    thumbColor={cachedOnly ? '#6366F1' : '#888'}
                                />
                            </View>
                        </View>
                    </>
                )}
            </>
        );
    };

    const renderSearchSettingsContent = () => (
        <>
            {/* Back Header */}
            <TouchableOpacity
                style={styles.subPageHeader}
                onPress={() => setSubPage('main')}
                activeOpacity={0.7}
            >
                <ArrowLeft color="#fff" size={24} />
                <Text style={styles.subPageTitle}>Torrent Settings</Text>
            </TouchableOpacity>

            {/* Banner */}
            <View style={styles.settingsBanner}>
                <View style={styles.settingsBannerIcon}>
                    <Search color="#fff" size={28} />
                </View>
                <View style={styles.settingsBannerText}>
                    <Text style={styles.settingsBannerTitle}>Search Engine Defaults</Text>
                    <Text style={styles.settingsBannerSubtitle}>
                        Configure which search engines are enabled by default
                    </Text>
                </View>
            </View>

            {/* Engine Cards */}
            {engines.map(engine => (
                <View key={engine.id} style={styles.engineSection}>
                    {/* Engine Header */}
                    <View style={styles.engineHeader}>
                        <View style={styles.engineIconSmall}>
                            <Text style={{ fontSize: 18 }}>{engine.icon}</Text>
                        </View>
                        <Text style={styles.engineName}>{engine.name}</Text>
                    </View>

                    {/* Enable Toggle */}
                    <View style={styles.engineOption}>
                        <View style={styles.engineOptionIcon}>
                            <Zap color="#6366F1" size={18} />
                        </View>
                        <View style={styles.engineOptionInfo}>
                            <Text style={styles.engineOptionTitle}>Enable {engine.name}</Text>
                            <Text style={styles.engineOptionStatus}>
                                {engine.enabled ? 'Enabled' : 'Disabled'}
                            </Text>
                        </View>
                        <Switch
                            value={engine.enabled}
                            onValueChange={() => toggleEngine(engine.id)}
                            trackColor={{ false: '#333', true: 'rgba(99, 102, 241, 0.5)' }}
                            thumbColor={engine.enabled ? '#6366F1' : '#666'}
                        />
                    </View>

                    {/* Max Results */}
                    <TouchableOpacity
                        style={styles.engineOption}
                        activeOpacity={0.8}
                        onPress={() => setMaxResultsDropdownOpen(maxResultsDropdownOpen === engine.id ? null : engine.id)}
                    >
                        <View style={styles.engineOptionIcon}>
                            <List color="#6366F1" size={18} />
                        </View>
                        <View style={styles.engineOptionInfo}>
                            <Text style={styles.engineOptionTitle}>Maximum Results</Text>
                            <Text style={styles.engineOptionStatus}>
                                Select how many results to fetch
                            </Text>
                        </View>
                    </TouchableOpacity>

                    {/* Results Dropdown */}
                    <TouchableOpacity
                        style={styles.resultsDropdown}
                        activeOpacity={0.8}
                        onPress={() => setMaxResultsDropdownOpen(maxResultsDropdownOpen === engine.id ? null : engine.id)}
                    >
                        <Text style={styles.resultsDropdownText}>{engine.maxResults} results</Text>
                        <ChevronDown color="#888" size={18} style={{ transform: [{ rotate: maxResultsDropdownOpen === engine.id ? '180deg' : '0deg' }] }} />
                    </TouchableOpacity>

                    {/* Max Results Options (shown when dropdown is open) */}
                    {maxResultsDropdownOpen === engine.id && (
                        <View style={styles.maxResultsOptionsContainer}>
                            {maxResultsOptions.map(option => (
                                <TouchableOpacity
                                    key={option}
                                    style={[
                                        styles.maxResultsOption,
                                        engine.maxResults === option && styles.maxResultsOptionActive
                                    ]}
                                    onPress={() => updateMaxResults(engine.id, option)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[
                                        styles.maxResultsOptionText,
                                        engine.maxResults === option && styles.maxResultsOptionTextActive
                                    ]}>
                                        {option} results
                                    </Text>
                                    {engine.maxResults === option && (
                                        <CheckCircle color="#6366F1" size={16} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>
            ))}
        </>
    );

    const renderImportEnginesContent = () => (
        <>
            {/* Header with back and refresh */}
            <View style={styles.importHeader}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setSubPage('main')}
                    activeOpacity={0.7}
                >
                    <ArrowLeft color="#fff" size={24} />
                </TouchableOpacity>
                <Text style={styles.importHeaderTitle}>Import Engines</Text>
                <TouchableOpacity style={styles.refreshButton} activeOpacity={0.7}>
                    <RefreshCw color="#888" size={20} />
                </TouchableOpacity>
            </View>

            {/* Imported Engines Section Header */}
            <View style={styles.importedSection}>
                <CheckCircle color="#10B981" size={18} />
                <Text style={styles.importedLabel}>Imported Engines</Text>
                <View style={styles.importedCount}>
                    <Text style={styles.importedCountText}>{importedEngines.length}</Text>
                </View>
            </View>

            {/* Engine List */}
            {importedEngines.map(engine => (
                <TouchableOpacity
                    key={engine.id}
                    style={[
                        styles.importedEngineCard,
                        engine.selected && styles.importedEngineCardSelected
                    ]}
                    activeOpacity={0.8}
                >
                    <View style={styles.importedEngineIcon}>
                        <Text style={{ fontSize: 22 }}>{engine.icon}</Text>
                    </View>
                    <View style={styles.importedEngineInfo}>
                        <Text style={styles.importedEngineName}>{engine.name}</Text>
                        <Text style={styles.importedEngineDate}>Imported {engine.importDate}</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => removeImportedEngine(engine.id)}
                        activeOpacity={0.7}
                    >
                        <Trash2 color="#EF4444" size={18} />
                    </TouchableOpacity>
                </TouchableOpacity>
            ))}
        </>
    );

    const renderPlaceholderContent = (title: string, subtitle: string) => (
        <View style={styles.placeholderContainer}>
            <View style={styles.placeholderIcon}>
                <Settings color="#666" size={32} />
            </View>
            <Text style={styles.placeholderTitle}>{title}</Text>
            <Text style={styles.placeholderSubtitle}>{subtitle}</Text>
        </View>
    );

    const renderSearchContent = () => (
        <>
            {/* Search Box */}
            <View style={styles.searchCard}>
                <View style={styles.searchInputContainer}>
                    <Search color="#888" size={20} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search all engines..."
                        placeholderTextColor="#666"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        onSubmitEditing={handleSearch}
                        returnKeyType="search"
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => {
                            setSearchQuery('');
                            setSearchResults([]);
                            setResultsByEngine(new Map());
                            setTotalResults(0);
                            setSelectedEngine(null);
                        }}>
                            <Text style={{ color: '#EF4444', fontSize: 18 }}>✕</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Search Providers Dropdown */}
            <TouchableOpacity
                style={styles.providersDropdown}
                onPress={() => setProvidersExpanded(!providersExpanded)}
                activeOpacity={0.8}
            >
                <View style={styles.providersLeft}>
                    {providersExpanded ? (
                        <ChevronUp color="#888" size={20} />
                    ) : (
                        <ChevronDown color="#888" size={20} />
                    )}
                    <Text style={styles.providersLabel}>Search Providers</Text>
                </View>
                <Text style={styles.providersCount}>{enabledProviders} enabled</Text>
            </TouchableOpacity>

            {/* Expanded Providers List */}
            {providersExpanded && (
                <View style={styles.providersList}>
                    {['Torrents CSV', 'YTS', 'Pirate Bay', 'Knaben', 'SolidTorrents'].map((name, i) => (
                        <View key={name} style={styles.providerItem}>
                            <Text style={styles.providerName}>{name}</Text>
                            <View style={[styles.providerStatus, styles.providerStatusActive]} />
                        </View>
                    ))}
                </View>
            )}

            {/* Loading State */}
            {searching && (
                <View style={styles.placeholderContainer}>
                    <ActivityIndicator size="large" color="#6366F1" />
                    <Text style={styles.placeholderTitle}>Searching...</Text>
                    <Text style={styles.placeholderSubtitle}>
                        Querying {enabledProviders} search engines
                    </Text>
                </View>
            )}

            {/* Results Header */}
            {!searching && searchResults.length > 0 && (
                <>
                    <View style={styles.resultsHeader}>
                        <View style={styles.resultsHeaderLeft}>
                            <Search color="#6366F1" size={18} />
                            <Text style={styles.resultsCount}>
                                {totalResults} Results {cachedOnly ? '(Torbox cached)' : ''}
                            </Text>
                        </View>
                    </View>

                    {/* Engine Filter Badges - Only show engines with results */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.engineFilterScroll}>
                        <View style={styles.engineBadgesRow}>
                            {/* All button */}
                            <TouchableOpacity
                                style={[styles.engineFilterBadge, !selectedEngine && styles.engineFilterBadgeActive]}
                                onPress={() => setSelectedEngine(null)}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.engineFilterText, !selectedEngine && styles.engineFilterTextActive]}>All</Text>
                                <Text style={[styles.engineFilterCount, !selectedEngine && styles.engineFilterCountActive]}>{totalResults}</Text>
                            </TouchableOpacity>
                            {/* Individual engine badges - only show if count > 0 */}
                            {Array.from(resultsByEngine.entries())
                                .filter(([_, count]) => count > 0)
                                .map(([engine, count]) => (
                                    <TouchableOpacity
                                        key={engine}
                                        style={[styles.engineFilterBadge, selectedEngine === engine && styles.engineFilterBadgeActive]}
                                        onPress={() => setSelectedEngine(selectedEngine === engine ? null : engine)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.engineFilterText, selectedEngine === engine && styles.engineFilterTextActive]}>{engine}</Text>
                                        <Text style={[styles.engineFilterCount, selectedEngine === engine && styles.engineFilterCountActive]}>{count}</Text>
                                    </TouchableOpacity>
                                ))}
                        </View>
                    </ScrollView>

                    {/* Sort Bar */}
                    <View style={styles.sortBar}>
                        <TouchableOpacity
                            style={styles.sortDropdownTrigger}
                            onPress={() => setSortDropdownOpen(!sortDropdownOpen)}
                        >
                            <SlidersHorizontal color="#888" size={16} />
                            <Text style={styles.sortLabel}>Sort by</Text>
                            <Text style={styles.sortValue}>{sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}</Text>
                            <ChevronDown color="#888" size={16} />
                        </TouchableOpacity>
                    </View>

                    {/* Sort Dropdown */}
                    {sortDropdownOpen && (
                        <View style={styles.sortDropdownMenu}>
                            {['relevance', 'name', 'size', 'seeders', 'date'].map((option) => (
                                <TouchableOpacity
                                    key={option}
                                    style={[styles.sortDropdownItem, sortBy === option && styles.sortDropdownItemActive]}
                                    onPress={() => handleSortChange(option as any)}
                                >
                                    <Text style={[styles.sortDropdownItemText, sortBy === option && styles.sortDropdownItemTextActive]}>
                                        {option.charAt(0).toUpperCase() + option.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* Cached Only Info Banner */}
                    {cachedOnly && (
                        <View style={styles.cachedInfoBanner}>
                            <Text style={styles.cachedInfoIcon}>ⓘ</Text>
                            <Text style={styles.cachedInfoText}>
                                Showing Torbox cached results only. Disable "Check Torbox cache during searches" in Torbox settings to see every result.
                            </Text>
                        </View>
                    )}

                    {/* Results List - filtered by selected engine */}
                    {searchResults
                        .filter(result => !selectedEngine || result.sourceDisplayName === selectedEngine)
                        .map((result) => (
                            <View key={result.id} style={styles.resultCard}>
                                {/* Header: Title + Source Badge + Copy */}
                                <View style={styles.resultHeader}>
                                    <Text style={styles.resultTitle} numberOfLines={2}>
                                        {result.title}
                                    </Text>
                                    <View style={styles.resultHeaderRight}>
                                        <View style={[styles.resultSourceBadge, { backgroundColor: getSourceColor(result.source) }]}>
                                            <Text style={styles.resultSourceStar}>★</Text>
                                            <Text style={styles.resultSourceText}>{result.sourceDisplayName}</Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.resultCopyButton}
                                            activeOpacity={0.7}
                                            onPress={() => handleCopyMagnet(result.magnetLink || `magnet:?xt=urn:btih:${result.infoHash}`)}
                                        >
                                            <Text style={styles.resultCopyIcon}>📋</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {/* Badges Row: Size | Seeders | Leechers | Cached */}
                                <View style={styles.resultBadges}>
                                    <View style={[styles.resultBadge, styles.resultBadgeSize]}>
                                        <Text style={styles.resultBadgeSizeIcon}>≡</Text>
                                        <Text style={styles.resultBadgeText}>{result.size}</Text>
                                    </View>
                                    <View style={[styles.resultBadge, styles.resultBadgeSeeders]}>
                                        <Text style={styles.resultBadgeSeedersIcon}>⬆</Text>
                                        <Text style={styles.resultBadgeText}>{result.seeders}</Text>
                                    </View>
                                    <View style={[styles.resultBadge, styles.resultBadgeLeechers]}>
                                        <Text style={styles.resultBadgeLeechersIcon}>⬇</Text>
                                        <Text style={styles.resultBadgeText}>{result.leechers}</Text>
                                    </View>
                                    <View style={[styles.resultBadge, styles.resultBadgeCached]}>
                                        <Text style={styles.resultBadgeCachedIcon}>✓</Text>
                                        <Text style={styles.resultBadgeText}>{result.isCached ? 1 : 0}</Text>
                                    </View>
                                </View>

                                {/* Date */}
                                {result.date && (
                                    <View style={styles.resultDateRow}>
                                        <Text style={styles.resultDateIcon}>🗓</Text>
                                        <Text style={styles.resultDate}>{result.date}</Text>
                                    </View>
                                )}

                                {/* Add to TorBox Button - Gradient style */}
                                <TouchableOpacity
                                    style={styles.torboxButton}
                                    onPress={() => handleAddToTorbox(result)}
                                    disabled={addingToTorbox === result.id}
                                    activeOpacity={0.8}
                                >
                                    {addingToTorbox === result.id ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <>
                                            <Text style={styles.torboxButtonIcon}>⚡</Text>
                                            <Text style={styles.torboxButtonText}>Torbox</Text>
                                            <Text style={styles.torboxButtonArrow}>▼</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        ))}
                </>
            )}

            {/* Empty State */}
            {!searching && searchResults.length === 0 && !searchQuery && (
                <View style={styles.emptyState}>
                    <View style={styles.emptyStateIcon}>
                        <Search color="#8B5CF6" size={36} />
                    </View>
                    <Text style={styles.emptyStateTitle}>Ready to Search?</Text>
                    <Text style={styles.emptyStateSubtitle}>
                        Enter a torrent name above to get started
                    </Text>

                    {/* Suggestions */}
                    <View style={styles.suggestionsContainer}>
                        <View style={styles.suggestionBubble}>
                            <Lightbulb color="#F59E0B" size={16} />
                            <Text style={styles.suggestionText}>
                                Try:{' '}
                                {['avatar', 'batman', 'spider-man'].map((s, i) => (
                                    <Text key={s}>
                                        <Text
                                            style={styles.suggestionLink}
                                            onPress={() => handleSuggestionPress(s)}
                                        >
                                            {s}
                                        </Text>
                                        {i < 2 ? ', ' : ''}
                                    </Text>
                                ))}
                            </Text>
                        </View>
                    </View>
                </View>
            )}

            {/* No Results State */}
            {!searching && searchResults.length === 0 && searchQuery && (
                <View style={styles.emptyState}>
                    <View style={styles.emptyStateIcon}>
                        <Search color="#EF4444" size={36} />
                    </View>
                    <Text style={styles.emptyStateTitle}>No Results</Text>
                    <Text style={styles.emptyStateSubtitle}>
                        No torrents found for "{searchQuery}"
                    </Text>
                </View>
            )}
        </>
    );

    return (
        <View style={styles.container}>
            {/* Horizontal Tab Menu */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tabsScrollView}
                contentContainerStyle={styles.tabsContainer}
            >
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const iconColor = isActive ? '#fff' : '#888';

                    return (
                        <TouchableOpacity
                            key={tab.id}
                            style={[
                                styles.tabButton,
                                isActive && styles.tabButtonActive,
                            ]}
                            onPress={() => setActiveTab(tab.id)}
                            activeOpacity={0.7}
                        >
                            {tab.id === 'search' && <Search color={iconColor} size={20} />}
                            {tab.id === 'playlist' && <List color={iconColor} size={20} />}
                            {tab.id === 'downloads' && <Download color={iconColor} size={20} />}
                            {tab.id === 'engines' && <Zap color={iconColor} size={20} />}
                            {tab.id === 'settings' && <Settings color={iconColor} size={20} />}
                            {isActive && (
                                <Text style={styles.tabLabel}>{tab.label}</Text>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {/* Content Area */}
            <ScrollView
                key={`${activeTab}-${subPage}`}
                style={styles.contentScrollView}
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={false}
            >
                {renderTabContent()}

                {/* Bottom spacer for navigation */}
                <View style={{ height: 120 }} />
            </ScrollView>

            {/* File Selector Modal */}
            <Modal
                visible={fileSelectorVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setFileSelectorVisible(false)}
            >
                <View style={styles.fileSelectorOverlay}>
                    <View style={styles.fileSelectorContainer}>
                        {/* Handle */}
                        <View style={styles.fileSelectorHandle} />

                        {/* Header */}
                        <View style={styles.fileSelectorHeader}>
                            <View style={styles.fileSelectorHeaderLeft}>
                                <Text style={styles.fileSelectorTitle}>
                                    {selectedFileIds.size} of {selectedTorrentForDownload?.files?.length || 0} files selected
                                </Text>
                                <Text style={styles.fileSelectorSubtitle}>
                                    Selected size: {formatBytes(getSelectedTotalSize())}
                                </Text>
                            </View>
                        </View>

                        <ScrollView style={{ maxHeight: 400 }}>
                            {/* Main Files Section */}
                            {selectedTorrentForDownload?.files && selectedTorrentForDownload.files.filter(f => isVideoFile(f.name)).length > 0 && (
                                <View style={styles.fileSelectorSection}>
                                    <Text style={styles.fileSelectorSectionTitle}>Main</Text>
                                    {selectedTorrentForDownload.files.filter(f => isVideoFile(f.name)).map(file => (
                                        <TouchableOpacity
                                            key={file.id}
                                            style={[
                                                styles.fileItem,
                                                selectedFileIds.has(file.id) && styles.fileItemSelected
                                            ]}
                                            onPress={() => toggleFileSelection(file.id)}
                                            activeOpacity={0.8}
                                        >
                                            <View style={styles.fileItemContent}>
                                                <View style={styles.fileItemIcon}>
                                                    <Text style={styles.fileItemIconText}>▶</Text>
                                                </View>
                                                <View style={styles.fileItemInfo}>
                                                    <Text style={styles.fileItemName} numberOfLines={2}>
                                                        {file.short_name || file.name}
                                                    </Text>
                                                    <View style={styles.fileItemMeta}>
                                                        <Text style={styles.fileItemSize}>{formatBytes(file.size)}</Text>
                                                        <View style={styles.fileItemBadge}>
                                                            <Text style={styles.fileItemBadgeText}>Main</Text>
                                                        </View>
                                                    </View>
                                                    <Text style={styles.fileItemPath} numberOfLines={1}>
                                                        {file.name}
                                                    </Text>
                                                </View>
                                                {/* View full name button */}
                                                <TouchableOpacity
                                                    style={{
                                                        padding: 8,
                                                        marginRight: 4,
                                                    }}
                                                    onPress={(e) => {
                                                        e.stopPropagation();
                                                        setViewingFileName(file.name);
                                                    }}
                                                    activeOpacity={0.7}
                                                >
                                                    <Text style={{ fontSize: 16 }}>ℹ️</Text>
                                                </TouchableOpacity>
                                                <View style={styles.fileItemCheckbox}>
                                                    {selectedFileIds.has(file.id) ? (
                                                        <CheckCircle color="#6366F1" size={24} />
                                                    ) : (
                                                        <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#666' }} />
                                                    )}
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            {/* Extras Section */}
                            {selectedTorrentForDownload?.files && selectedTorrentForDownload.files.filter(f => !isVideoFile(f.name)).length > 0 && (
                                <View style={styles.fileSelectorSection}>
                                    <Text style={styles.fileSelectorSectionTitle}>Extras</Text>
                                    {selectedTorrentForDownload.files.filter(f => !isVideoFile(f.name)).map(file => (
                                        <TouchableOpacity
                                            key={file.id}
                                            style={[
                                                styles.fileItem,
                                                selectedFileIds.has(file.id) && styles.fileItemSelected
                                            ]}
                                            onPress={() => toggleFileSelection(file.id)}
                                            activeOpacity={0.8}
                                        >
                                            <View style={styles.fileItemContent}>
                                                <View style={[styles.fileItemIcon, { backgroundColor: '#F59E0B' }]}>
                                                    <Text style={styles.fileItemIconText}>📄</Text>
                                                </View>
                                                <View style={styles.fileItemInfo}>
                                                    <Text style={styles.fileItemName} numberOfLines={2}>
                                                        {file.short_name || file.name}
                                                    </Text>
                                                    <View style={styles.fileItemMeta}>
                                                        <Text style={styles.fileItemSize}>{formatBytes(file.size)}</Text>
                                                        <View style={[styles.fileItemBadge, { backgroundColor: 'rgba(245, 158, 11, 0.2)' }]}>
                                                            <Text style={[styles.fileItemBadgeText, { color: '#F59E0B' }]}>Extra</Text>
                                                        </View>
                                                    </View>
                                                    <Text style={styles.fileItemPath} numberOfLines={1}>
                                                        {file.name}
                                                    </Text>
                                                </View>
                                                {/* View full name button */}
                                                <TouchableOpacity
                                                    style={{
                                                        padding: 8,
                                                        marginRight: 4,
                                                    }}
                                                    onPress={(e) => {
                                                        e.stopPropagation();
                                                        setViewingFileName(file.name);
                                                    }}
                                                    activeOpacity={0.7}
                                                >
                                                    <Text style={{ fontSize: 16 }}>ℹ️</Text>
                                                </TouchableOpacity>
                                                <View style={styles.fileItemCheckbox}>
                                                    {selectedFileIds.has(file.id) ? (
                                                        <CheckCircle color="#6366F1" size={24} />
                                                    ) : (
                                                        <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#666' }} />
                                                    )}
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </ScrollView>

                        {/* Actions */}
                        <View style={styles.fileSelectorActions}>
                            <TouchableOpacity
                                style={styles.downloadAllButton}
                                onPress={() => {
                                    selectAllFiles();
                                    setDownloadOptionsVisible(true);
                                }}
                                activeOpacity={0.8}
                            >
                                <Download color="#10B981" size={18} />
                                <Text style={styles.downloadAllButtonText}>Download All</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.downloadSelectedButton,
                                    selectedFileIds.size === 0 && styles.downloadSelectedButtonDisabled
                                ]}
                                onPress={() => {
                                    if (selectedFileIds.size === 1) {
                                        // 1 file - download immediately
                                        handleDownloadFiles('sequential');
                                    } else {
                                        // 2+ files - show options modal
                                        setDownloadOptionsVisible(true);
                                    }
                                }}
                                disabled={selectedFileIds.size === 0}
                                activeOpacity={0.8}
                            >
                                <SlidersHorizontal color="#fff" size={18} />
                                <Text style={styles.downloadSelectedButtonText}>Download Selected</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Close Button */}
                        <TouchableOpacity
                            style={styles.fileSelectorCloseButton}
                            onPress={() => setFileSelectorVisible(false)}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.fileSelectorCloseText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* View Filename Popup Modal */}
            <Modal
                visible={viewingFileName !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setViewingFileName(null)}
            >
                <View style={{
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 20,
                }}>
                    <View style={{
                        backgroundColor: '#1F2937',
                        borderRadius: 16,
                        padding: 20,
                        width: '100%',
                        maxWidth: 400,
                    }}>
                        <Text style={{
                            color: '#fff',
                            fontSize: 16,
                            fontWeight: '600',
                            marginBottom: 12,
                        }}>Full File Name</Text>
                        <View style={{
                            backgroundColor: 'rgba(99, 102, 241, 0.1)',
                            borderRadius: 8,
                            padding: 12,
                            marginBottom: 16,
                        }}>
                            <Text style={{
                                color: '#E5E7EB',
                                fontSize: 14,
                                lineHeight: 20,
                            }} selectable>{viewingFileName}</Text>
                        </View>
                        <TouchableOpacity
                            style={{
                                backgroundColor: '#6366F1',
                                borderRadius: 10,
                                paddingVertical: 12,
                                alignItems: 'center',
                            }}
                            onPress={() => setViewingFileName(null)}
                            activeOpacity={0.8}
                        >
                            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Download Options Modal - Sequential vs Parallel */}
            <Modal
                visible={downloadOptionsVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setDownloadOptionsVisible(false)}
            >
                <View style={{
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 20,
                }}>
                    <View style={{
                        backgroundColor: '#0D1117',
                        borderRadius: 20,
                        padding: 24,
                        width: '100%',
                        maxWidth: 400,
                        borderWidth: 1,
                        borderColor: '#00FFFF',
                        shadowColor: '#00FFFF',
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.5,
                        shadowRadius: 20,
                        elevation: 10,
                    }}>
                        <Text style={{
                            color: '#00FFFF',
                            fontSize: 18,
                            fontWeight: '700',
                            marginBottom: 20,
                            textAlign: 'center',
                            textShadowColor: '#00FFFF',
                            textShadowOffset: { width: 0, height: 0 },
                            textShadowRadius: 10,
                        }}>How do you want to download?</Text>

                        {/* One-by-One Option */}
                        <TouchableOpacity
                            style={{
                                backgroundColor: 'rgba(0, 255, 255, 0.1)',
                                borderRadius: 14,
                                padding: 18,
                                marginBottom: 14,
                                borderWidth: 1,
                                borderColor: 'rgba(0, 255, 255, 0.5)',
                            }}
                            onPress={() => {
                                setDownloadOptionsVisible(false);
                                handleDownloadFiles('sequential');
                            }}
                            activeOpacity={0.8}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                                <Text style={{ fontSize: 28 }}>📥</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#00FFFF', fontWeight: '700', fontSize: 17 }}>One-by-One</Text>
                                    <Text style={{ color: '#7DD3FC', fontSize: 13, marginTop: 3 }}>Finishes one, then starts next</Text>
                                </View>
                            </View>
                        </TouchableOpacity>

                        {/* All at Once Option */}
                        <TouchableOpacity
                            style={{
                                backgroundColor: 'rgba(255, 0, 255, 0.1)',
                                borderRadius: 14,
                                padding: 18,
                                marginBottom: 20,
                                borderWidth: 1,
                                borderColor: 'rgba(255, 0, 255, 0.5)',
                            }}
                            onPress={() => {
                                setDownloadOptionsVisible(false);
                                handleDownloadFiles('parallel');
                            }}
                            activeOpacity={0.8}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                                <Text style={{ fontSize: 28 }}>⚡</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#FF00FF', fontWeight: '700', fontSize: 17 }}>All at Once</Text>
                                    <Text style={{ color: '#F0ABFC', fontSize: 13, marginTop: 3 }}>All files start downloading together</Text>
                                </View>
                            </View>
                        </TouchableOpacity>

                        {/* Cancel Button */}
                        <TouchableOpacity
                            style={{
                                backgroundColor: 'rgba(107, 114, 128, 0.3)',
                                borderRadius: 10,
                                paddingVertical: 12,
                                alignItems: 'center',
                            }}
                            onPress={() => setDownloadOptionsVisible(false)}
                            activeOpacity={0.8}
                        >
                            <Text style={{ color: '#9CA3AF', fontWeight: '600', fontSize: 15 }}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Single File Confirmation Modal */}
            <Modal
                visible={singleFileConfirmVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setSingleFileConfirmVisible(false)}
            >
                <View style={{
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 20,
                }}>
                    <View style={{
                        backgroundColor: '#1F2937',
                        borderRadius: 16,
                        padding: 20,
                        width: '100%',
                        maxWidth: 400,
                    }}>
                        <Text style={{
                            color: '#fff',
                            fontSize: 18,
                            fontWeight: '700',
                            marginBottom: 8,
                            textAlign: 'center',
                        }}>Single File Detected</Text>

                        {selectedTorrentForDownload?.files?.[0] && (
                            <View style={{
                                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                borderRadius: 8,
                                padding: 12,
                                marginBottom: 16,
                            }}>
                                <Text style={{ color: '#E5E7EB', fontSize: 14, marginBottom: 4 }} numberOfLines={2}>
                                    {selectedTorrentForDownload.files[0].short_name || selectedTorrentForDownload.files[0].name}
                                </Text>
                                <Text style={{ color: '#9CA3AF', fontSize: 13 }}>
                                    {formatBytes(selectedTorrentForDownload.files[0].size)}
                                </Text>
                            </View>
                        )}

                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <TouchableOpacity
                                style={{
                                    flex: 1,
                                    backgroundColor: 'rgba(107, 114, 128, 0.3)',
                                    borderRadius: 10,
                                    paddingVertical: 12,
                                    alignItems: 'center',
                                }}
                                onPress={() => setSingleFileConfirmVisible(false)}
                                activeOpacity={0.8}
                            >
                                <Text style={{ color: '#9CA3AF', fontWeight: '600', fontSize: 15 }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{
                                    flex: 1,
                                    backgroundColor: '#10B981',
                                    borderRadius: 10,
                                    paddingVertical: 12,
                                    alignItems: 'center',
                                    flexDirection: 'row',
                                    justifyContent: 'center',
                                    gap: 6,
                                }}
                                onPress={() => {
                                    setSingleFileConfirmVisible(false);
                                    // Download single file - pass file ID directly to avoid async state issue
                                    if (selectedTorrentForDownload?.files?.[0]) {
                                        const singleFileIds = new Set([selectedTorrentForDownload.files[0].id]);
                                        handleDownloadFiles('sequential', singleFileIds);
                                    }
                                }}
                                activeOpacity={0.8}
                            >
                                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Continue</Text>
                                <Text style={{ color: '#fff', fontSize: 14 }}>▶</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Torbox Action Modal */}
            <Modal
                visible={actionModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setActionModalVisible(false)}
            >
                <View style={styles.actionModalOverlay}>
                    <View style={styles.actionModalContent}>
                        {/* Handle */}
                        <View style={styles.actionModalHandle} />

                        {/* Header */}
                        <View style={styles.actionModalHeader}>
                            <View style={styles.actionModalIconContainer}>
                                <Zap color="#fff" size={24} />
                            </View>
                            <View style={styles.actionModalHeaderText}>
                                <Text style={styles.actionModalTitle} numberOfLines={2}>
                                    {selectedResultForAction?.title}
                                </Text>
                                <Text style={styles.actionModalSubtitle}>
                                    Cached on Torbox. Choose your next step.
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={styles.closeModalButton}
                                onPress={() => setActionModalVisible(false)}
                            >
                                <Text style={styles.closeModalButtonText}>×</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Options */}
                        <View style={styles.actionModalOptions}>
                            {/* Play Now */}
                            <TouchableOpacity
                                style={[styles.actionOption, styles.actionOptionPlay]}
                                onPress={() => selectedResultForAction && handlePlayNow(selectedResultForAction)}
                                disabled={processingAction}
                            >
                                <View style={styles.actionOptionIconPlay}>
                                    {processingAction ? (
                                        <ActivityIndicator color="#3B82F6" />
                                    ) : (
                                        <Text style={{ fontSize: 20 }}>▶</Text>
                                    )}
                                </View>
                                <View style={styles.actionOptionText}>
                                    <Text style={styles.actionOptionTitle}>Play now</Text>
                                    <Text style={styles.actionOptionDesc}>
                                        Open instantly in the Torbox player experience.
                                    </Text>
                                </View>
                                <ChevronRight color="#888" size={20} />
                            </TouchableOpacity>

                            {/* Add to Playlist */}
                            <TouchableOpacity
                                style={[styles.actionOption, styles.actionOptionPlaylist]}
                                onPress={() => selectedResultForAction && handleAddToPlaylist(selectedResultForAction)}
                            >
                                <View style={styles.actionOptionIconPlaylist}>
                                    <List color="#fff" size={20} />
                                </View>
                                <View style={styles.actionOptionText}>
                                    <Text style={styles.actionOptionTitle}>Add to playlist</Text>
                                    <Text style={styles.actionOptionDesc}>
                                        Keep this torrent handy in your Debrify playlist.
                                    </Text>
                                </View>
                                <ChevronRight color="#888" size={20} />
                            </TouchableOpacity>
                        </View>

                        {/* Close Text Button */}
                        <TouchableOpacity
                            style={styles.actionModalCloseTextBtn}
                            onPress={() => setActionModalVisible(false)}
                        >
                            <Text style={styles.actionModalCloseText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
            {/* Torbox Action Modal */}
            <Modal
                visible={actionModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setActionModalVisible(false)}
            >
                <View style={styles.actionModalOverlay}>
                    <View style={styles.actionModalContent}>
                        {/* Handle */}
                        <View style={styles.actionModalHandle} />

                        {/* Header */}
                        <View style={styles.actionModalHeader}>
                            <View style={styles.actionModalIconContainer}>
                                <Zap color="#fff" size={24} />
                            </View>
                            <View style={styles.actionModalHeaderText}>
                                <Text style={styles.actionModalTitle} numberOfLines={2}>
                                    {selectedResultForAction?.title}
                                </Text>
                                <Text style={styles.actionModalSubtitle}>
                                    Cached on Torbox. Choose your next step.
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={styles.closeModalButton}
                                onPress={() => setActionModalVisible(false)}
                            >
                                <Text style={styles.closeModalButtonText}>×</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Options */}
                        <View style={styles.actionModalOptions}>
                            {/* Play Now */}
                            <TouchableOpacity
                                style={[styles.actionOption, styles.actionOptionPlay]}
                                onPress={() => selectedResultForAction && handlePlayNow(selectedResultForAction)}
                                disabled={processingAction}
                            >
                                <View style={styles.actionOptionIconPlay}>
                                    {processingAction ? (
                                        <ActivityIndicator color="#3B82F6" />
                                    ) : (
                                        <Text style={{ fontSize: 20 }}>▶</Text>
                                    )}
                                </View>
                                <View style={styles.actionOptionText}>
                                    <Text style={styles.actionOptionTitle}>Play now</Text>
                                    <Text style={styles.actionOptionDesc}>
                                        Open instantly in the Torbox player experience.
                                    </Text>
                                </View>
                                <ChevronRight color="#888" size={20} />
                            </TouchableOpacity>

                            {/* Add to Playlist */}
                            <TouchableOpacity
                                style={[styles.actionOption, styles.actionOptionPlaylist]}
                                onPress={() => selectedResultForAction && handleAddToPlaylist(selectedResultForAction)}
                            >
                                <View style={styles.actionOptionIconPlaylist}>
                                    <List color="#fff" size={20} />
                                </View>
                                <View style={styles.actionOptionText}>
                                    <Text style={styles.actionOptionTitle}>Add to playlist</Text>
                                    <Text style={styles.actionOptionDesc}>
                                        Keep this torrent handy in your Debrify playlist.
                                    </Text>
                                </View>
                                <ChevronRight color="#888" size={20} />
                            </TouchableOpacity>
                        </View>

                        {/* Close Text Button */}
                        <TouchableOpacity
                            style={styles.actionModalCloseTextBtn}
                            onPress={() => setActionModalVisible(false)}
                        >
                            <Text style={styles.actionModalCloseText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Torbox Action Modal */}
            <Modal
                visible={actionModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setActionModalVisible(false)}
            >
                <View style={styles.actionModalOverlay}>
                    <View style={styles.actionModalContent}>
                        {/* Handle */}
                        <View style={styles.actionModalHandle} />

                        {/* Header */}
                        <View style={styles.actionModalHeader}>
                            <View style={styles.actionModalIconContainer}>
                                <Zap color="#fff" size={24} />
                            </View>
                            <View style={styles.actionModalHeaderText}>
                                <Text style={styles.actionModalTitle} numberOfLines={2}>
                                    {selectedResultForAction?.title}
                                </Text>
                                <Text style={styles.actionModalSubtitle}>
                                    Cached on Torbox. Choose your next step.
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={styles.closeModalButton}
                                onPress={() => setActionModalVisible(false)}
                            >
                                <Text style={styles.closeModalButtonText}>×</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Options */}
                        <View style={styles.actionModalOptions}>
                            {/* Play Now */}
                            <TouchableOpacity
                                style={[styles.actionOption, styles.actionOptionPlay]}
                                onPress={() => selectedResultForAction && handlePlayNow(selectedResultForAction)}
                                disabled={processingAction}
                            >
                                <View style={styles.actionOptionIconPlay}>
                                    {processingAction ? (
                                        <ActivityIndicator color="#3B82F6" />
                                    ) : (
                                        <Text style={{ fontSize: 20 }}>▶</Text>
                                    )}
                                </View>
                                <View style={styles.actionOptionText}>
                                    <Text style={styles.actionOptionTitle}>Play now</Text>
                                    <Text style={styles.actionOptionDesc}>
                                        Open instantly in the Torbox player experience.
                                    </Text>
                                </View>
                                <ChevronRight color="#888" size={20} />
                            </TouchableOpacity>

                            {/* Add to Playlist */}
                            <TouchableOpacity
                                style={[styles.actionOption, styles.actionOptionPlaylist]}
                                onPress={() => selectedResultForAction && handleAddToPlaylist(selectedResultForAction)}
                            >
                                <View style={styles.actionOptionIconPlaylist}>
                                    <List color="#fff" size={20} />
                                </View>
                                <View style={styles.actionOptionText}>
                                    <Text style={styles.actionOptionTitle}>Add to playlist</Text>
                                    <Text style={styles.actionOptionDesc}>
                                        Keep this torrent handy in your Debrify playlist.
                                    </Text>
                                </View>
                                <ChevronRight color="#888" size={20} />
                            </TouchableOpacity>
                        </View>

                        {/* Close Text Button */}
                        <TouchableOpacity
                            style={styles.actionModalCloseTextBtn}
                            onPress={() => setActionModalVisible(false)}
                        >
                            <Text style={styles.actionModalCloseText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    // new styles for Playlist & Modal
    playlistCard: {
        backgroundColor: '#1E1E1E', // Using a dark card background
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        // Gradient effect simulated
        overflow: 'hidden',
    },
    playlistCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    playlistCardTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        flex: 1,
        marginRight: 12,
    },
    playlistDeleteButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    playlistBadges: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    playlistBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)'
    },
    playlistBadgeText: {
        color: '#ccc',
        fontSize: 12,
        fontWeight: '500',
    },
    playlistActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    playNowButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#DC2626', // Red play button
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 12,
        gap: 8,
    },
    playNowButtonIcon: {
        color: '#fff',
        fontSize: 14,
    },
    playNowButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
    },
    addedDate: {
        color: '#666',
        fontSize: 12,
    },

    container: {
        flex: 1,
        backgroundColor: Colors.dark.background,
    },
    tabsScrollView: {
        maxHeight: 56,
        marginTop: 80, // Space for header
    },
    tabsContainer: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 8,
    },
    tabButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        gap: 8,
        marginRight: 8,
    },
    tabButtonActive: {
        backgroundColor: '#3B82F6',
    },
    tabLabel: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    contentScrollView: {
        flex: 1,
    },
    contentContainer: {
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    searchCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(30, 58, 95, 0.6)',
        borderRadius: 16,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.3)',
    },
    searchInputContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#fff',
        paddingVertical: 8,
    },
    advButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        gap: 6,
    },
    advButtonText: {
        color: '#10B981',
        fontSize: 14,
        fontWeight: '600',
    },
    providersDropdown: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(30, 58, 95, 0.4)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.2)',
    },
    providersLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    providersLabel: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    providersCount: {
        color: '#888',
        fontSize: 13,
    },
    providersList: {
        backgroundColor: 'rgba(30, 58, 95, 0.3)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
        gap: 10,
    },
    providerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 6,
    },
    providerName: {
        color: '#ddd',
        fontSize: 14,
    },
    providerStatus: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#555',
    },
    providerStatusActive: {
        backgroundColor: '#10B981',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 48,
        backgroundColor: 'rgba(30, 40, 60, 0.5)',
        borderRadius: 20,
        marginTop: 20,
    },
    emptyStateIcon: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    emptyStateTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 8,
    },
    emptyStateSubtitle: {
        fontSize: 15,
        color: '#888',
        textAlign: 'center',
        marginBottom: 24,
    },
    suggestionsContainer: {
        paddingHorizontal: 24,
    },
    suggestionBubble: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        gap: 10,
    },
    suggestionText: {
        color: '#aaa',
        fontSize: 14,
    },
    suggestionLink: {
        color: '#3B82F6',
        textDecorationLine: 'underline',
    },
    placeholderContainer: {
        alignItems: 'center',
        paddingVertical: 80,
    },
    placeholderIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    placeholderTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#888',
        marginBottom: 4,
    },
    placeholderSubtitle: {
        fontSize: 14,
        color: '#666',
    },
    // Settings Tab Styles
    settingsBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(99, 102, 241, 0.3)',
    },
    settingsBannerIcon: {
        width: 52,
        height: 52,
        borderRadius: 14,
        backgroundColor: 'rgba(99, 102, 241, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    settingsBannerText: {
        flex: 1,
    },
    settingsBannerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 4,
    },
    settingsBannerSubtitle: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.7)',
        lineHeight: 18,
    },
    settingsSectionLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#888',
        marginBottom: 10,
        marginTop: 8,
        letterSpacing: 0.5,
    },
    connectionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(30, 58, 95, 0.5)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.2)',
    },
    connectionIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    connectionInfo: {
        flex: 1,
    },
    connectionName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    connectionStatus: {
        fontSize: 13,
        color: '#888',
        marginTop: 2,
    },
    connectionStatusActive: {
        color: '#10B981',
    },
    connectionExpiry: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    connectionRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    connectionDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10B981',
    },
    settingsItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(30, 58, 95, 0.4)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.15)',
    },
    settingsItemIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    settingsItemInfo: {
        flex: 1,
    },
    settingsItemTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
    settingsItemSubtitle: {
        fontSize: 12,
        color: '#888',
        marginTop: 2,
    },
    // Sub-page styles
    subPageHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
    },
    subPageTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    // Engine card styles
    engineSection: {
        marginBottom: 16,
    },
    engineHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 10,
    },
    engineIconSmall: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: 'rgba(99, 102, 241, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    engineName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    engineOption: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(30, 58, 95, 0.5)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.2)',
    },
    engineOptionIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: 'rgba(99, 102, 241, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    engineOptionInfo: {
        flex: 1,
    },
    engineOptionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    engineOptionStatus: {
        fontSize: 12,
        color: '#888',
        marginTop: 2,
    },
    resultsDropdown: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(20, 30, 50, 0.8)',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.15)',
    },
    resultsDropdownText: {
        fontSize: 14,
        color: '#888',
    },
    // Import Engines page styles
    importHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    backButton: {
        padding: 8,
    },
    importHeaderTitle: {
        flex: 1,
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
        textAlign: 'center',
    },
    refreshButton: {
        padding: 8,
    },
    importedSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    importedLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    importedCount: {
        backgroundColor: '#3B82F6',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    importedCountText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#fff',
    },
    importedEngineCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(30, 58, 95, 0.5)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.2)',
    },
    importedEngineCardSelected: {
        borderColor: '#3B82F6',
        borderWidth: 2,
    },
    importedEngineIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    importedEngineInfo: {
        flex: 1,
    },
    importedEngineName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
    importedEngineDate: {
        fontSize: 12,
        color: '#888',
        marginTop: 2,
    },
    deleteButton: {
        padding: 8,
    },
    // TorBox Settings page styles
    torboxAccountCard: {
        backgroundColor: 'rgba(30, 58, 95, 0.5)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.2)',
    },
    torboxAccountHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    torboxAccountIcon: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    torboxAccountInfo: {
        flex: 1,
    },
    torboxAccountEmail: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    torboxAccountId: {
        fontSize: 13,
        color: '#888',
        marginTop: 2,
    },
    torboxBadgeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 8,
    },
    torboxBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
    },
    torboxBadgeGreen: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    torboxBadgeBlue: {
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderColor: 'rgba(59, 130, 246, 0.3)',
    },
    torboxBadgePurple: {
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        borderColor: 'rgba(139, 92, 246, 0.3)',
    },
    torboxBadgeText: {
        fontSize: 13,
        fontWeight: '500',
    },
    torboxStatsList: {
        backgroundColor: 'rgba(30, 58, 95, 0.3)',
        borderRadius: 14,
        padding: 4,
    },
    torboxStatItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 10,
    },
    torboxStatLabel: {
        flex: 1,
        fontSize: 14,
        color: '#888',
    },
    torboxStatValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    // Search Results styles
    resultsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(99, 102, 241, 0.2)',
    },
    resultsHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    resultsCount: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    engineBadgesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    engineBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    engineBadgeText: {
        fontSize: 12,
        fontWeight: '500',
        color: '#10B981',
    },
    engineBadgeCount: {
        fontSize: 12,
        fontWeight: '700',
        color: '#10B981',
    },
    sortBar: {
        marginBottom: 12,
    },
    sortDropdownTrigger: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    sortLabel: {
        fontSize: 13,
        color: '#888',
    },
    sortValue: {
        fontSize: 13,
        fontWeight: '600',
        color: '#fff',
        marginLeft: 4,
    },
    // Engine filter badge styles
    engineFilterScroll: {
        marginBottom: 12,
    },
    engineFilterBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 8,
        marginRight: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        gap: 6,
    },
    engineFilterBadgeActive: {
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        borderColor: '#6366F1',
    },
    engineFilterText: {
        fontSize: 13,
        color: '#888',
        fontWeight: '500',
    },
    engineFilterTextActive: {
        color: '#fff',
    },
    engineFilterCount: {
        fontSize: 12,
        color: '#666',
        fontWeight: '600',
    },
    engineFilterCountActive: {
        color: '#6366F1',
    },
    // Max results dropdown options
    maxResultsOptionsContainer: {
        backgroundColor: 'rgba(30, 41, 59, 0.95)',
        borderRadius: 12,
        marginTop: -4,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        overflow: 'hidden',
    },
    maxResultsOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    maxResultsOptionActive: {
        backgroundColor: 'rgba(99, 102, 241, 0.15)',
    },
    maxResultsOptionText: {
        fontSize: 15,
        color: '#888',
    },
    maxResultsOptionTextActive: {
        color: '#6366F1',
        fontWeight: '600',
    },
    // Downloads tab styles
    downloadsFilterContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        borderRadius: 12,
        padding: 4,
        marginBottom: 16,
    },
    downloadsFilterTab: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    downloadsFilterTabActive: {
        backgroundColor: '#6366F1',
    },
    downloadsFilterTabText: {
        fontSize: 14,
        color: '#888',
        fontWeight: '500',
    },
    downloadsFilterTabTextActive: {
        color: '#fff',
        fontWeight: '600',
    },
    emptyDownloadsContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 100,
    },
    emptyDownloadsText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 8,
    },
    emptyDownloadsSubtext: {
        fontSize: 14,
        color: '#888',
        textAlign: 'center',
    },
    // Bento-style download cards
    downloadBentoCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 2,
        borderColor: 'rgba(99, 102, 241, 0.3)',
    },
    downloadBentoCardCompleted: {
        borderColor: 'rgba(16, 185, 129, 0.4)',
        backgroundColor: 'rgba(16, 185, 129, 0.05)',
    },
    downloadBentoCardFailed: {
        borderColor: 'rgba(239, 68, 68, 0.4)',
        backgroundColor: 'rgba(239, 68, 68, 0.05)',
    },
    downloadBentoTop: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    downloadBentoIcon: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    downloadBentoInfo: {
        flex: 1,
    },
    downloadBentoFileName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 8,
        lineHeight: 20,
    },
    downloadBentoMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    downloadBentoSizeBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    downloadBentoSizeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6366F1',
    },
    downloadBentoTorrentName: {
        flex: 1,
        fontSize: 12,
        color: '#888',
    },
    downloadBentoProgress: {
        marginTop: 16,
    },
    downloadBentoProgressBar: {
        height: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 4,
        overflow: 'hidden',
        position: 'relative',
    },
    downloadBentoProgressFill: {
        height: '100%',
        backgroundColor: '#6366F1',
        borderRadius: 4,
    },
    downloadBentoProgressShimmer: {
        position: 'absolute',
        width: '10%',
        height: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        borderRadius: 4,
    },
    downloadBentoStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
    },
    downloadBentoProgressPercent: {
        fontSize: 16,
        fontWeight: '700',
        color: '#6366F1',
    },
    downloadBentoDownloadingText: {
        fontSize: 12,
        color: '#888',
    },
    downloadBentoStatusCompleted: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(16, 185, 129, 0.2)',
    },
    downloadBentoStatusCompletedText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#10B981',
    },
    downloadBentoStatusFailed: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(239, 68, 68, 0.2)',
    },
    downloadBentoStatusFailedText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#EF4444',
    },
    downloadBentoDeleteBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    downloadItemCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.6)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    downloadItemInfo: {
        marginBottom: 12,
    },
    downloadItemName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 4,
    },
    downloadItemMeta: {
        fontSize: 12,
        color: '#888',
    },
    downloadProgressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    downloadProgressBar: {
        flex: 1,
        height: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    downloadProgressFill: {
        height: '100%',
        backgroundColor: '#6366F1',
        borderRadius: 3,
    },
    downloadProgressText: {
        fontSize: 12,
        color: '#6366F1',
        fontWeight: '600',
        width: 40,
        textAlign: 'right',
    },
    downloadCompleteIcon: {
        alignSelf: 'flex-end',
    },
    // File selector modal styles
    fileSelectorOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'flex-end',
    },
    fileSelectorContainer: {
        backgroundColor: '#1E293B',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '80%',
        paddingBottom: 30,
    },
    fileSelectorHandle: {
        width: 40,
        height: 4,
        backgroundColor: '#666',
        borderRadius: 2,
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 16,
    },
    fileSelectorHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    fileSelectorHeaderLeft: {
        flex: 1,
    },
    fileSelectorTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    fileSelectorSubtitle: {
        fontSize: 13,
        color: '#888',
        marginTop: 2,
    },
    fileSelectorSection: {
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    fileSelectorSectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#888',
        marginBottom: 12,
    },
    fileItem: {
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    fileItemSelected: {
        borderColor: '#6366F1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
    },
    fileItemContent: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    fileItemIcon: {
        width: 48,
        height: 48,
        borderRadius: 8,
        backgroundColor: '#EF4444',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    fileItemIconText: {
        fontSize: 24,
    },
    fileItemInfo: {
        flex: 1,
    },
    fileItemName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 4,
    },
    fileItemMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    fileItemSize: {
        fontSize: 12,
        color: '#888',
    },
    fileItemBadge: {
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    fileItemBadgeText: {
        fontSize: 11,
        color: '#6366F1',
        fontWeight: '600',
    },
    fileItemPath: {
        fontSize: 11,
        color: '#666',
    },
    fileItemCheckbox: {
        marginLeft: 12,
    },
    fileSelectorActions: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        gap: 12,
        marginTop: 8,
    },
    downloadAllButton: {
        flex: 1,
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderRadius: 12,
        paddingVertical: 14,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: '#10B981',
    },
    downloadAllButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#10B981',
    },
    downloadSelectedButton: {
        flex: 1,
        backgroundColor: '#6366F1',
        borderRadius: 12,
        paddingVertical: 14,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    downloadSelectedButtonDisabled: {
        opacity: 0.5,
    },
    downloadSelectedButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    fileSelectorCloseButton: {
        paddingVertical: 16,
        alignItems: 'center',
    },
    fileSelectorCloseText: {
        fontSize: 14,
        color: '#6366F1',
        fontWeight: '500',
    },
    sortDropdownMenu: {
        backgroundColor: 'rgba(30, 41, 59, 0.95)',
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        overflow: 'hidden',
    },
    sortDropdownItem: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    sortDropdownItemActive: {
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
    },
    sortDropdownItemText: {
        fontSize: 14,
        color: '#888',
    },
    sortDropdownItemTextActive: {
        color: '#6366F1',
        fontWeight: '600',
    },
    cachedInfoBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.2)',
        gap: 10,
    },
    cachedInfoIcon: {
        fontSize: 16,
        color: '#3B82F6',
        marginTop: 1,
    },
    cachedInfoText: {
        flex: 1,
        fontSize: 13,
        color: '#94A3B8',
        lineHeight: 18,
    },
    resultCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.6)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    resultHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    resultTitle: {
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
        marginRight: 10,
        lineHeight: 20,
    },
    resultSourceBadge: {
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    resultSourceText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#fff',
    },
    resultHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    resultSourceStar: {
        fontSize: 12,
        color: '#fff',
        marginRight: 2,
    },
    resultCopyButton: {
        padding: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 8,
    },
    resultCopyIcon: {
        fontSize: 16,
    },
    resultBadges: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 10,
    },
    resultBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderWidth: 1,
        gap: 4,
    },
    resultBadgeSize: {
        backgroundColor: 'rgba(139, 92, 246, 0.15)',  // Purple like Debrify
        borderColor: 'rgba(139, 92, 246, 0.3)',
    },
    resultBadgeSeeders: {
        backgroundColor: 'rgba(245, 158, 11, 0.15)',  // Yellow like Debrify
        borderColor: 'rgba(245, 158, 11, 0.3)',
    },
    resultBadgeLeechers: {
        backgroundColor: 'rgba(6, 182, 212, 0.15)',  // Teal like Debrify
        borderColor: 'rgba(6, 182, 212, 0.3)',
    },
    resultBadgeCached: {
        backgroundColor: 'rgba(107, 114, 128, 0.15)',  // Gray like Debrify
        borderColor: 'rgba(107, 114, 128, 0.3)',
    },
    resultBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#fff',
    },
    resultBadgeSizeIcon: {
        fontSize: 12,
        color: '#8B5CF6',
    },
    resultBadgeSeedersIcon: {
        fontSize: 10,
        color: '#F59E0B',
    },
    resultBadgeLeechersIcon: {
        fontSize: 10,
        color: '#06B6D4',
    },
    resultBadgeCachedIcon: {
        fontSize: 10,
        color: '#10B981',
    },
    resultDateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 12,
    },
    resultDateIcon: {
        fontSize: 14,
    },
    resultDate: {
        fontSize: 12,
        color: '#888',
    },
    torboxButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#8B5CF6',  // Purple gradient base
        borderRadius: 12,
        paddingVertical: 14,
        marginTop: 4,
        // Gradient effect via background overlay
        shadowColor: '#EC4899',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    torboxButtonIcon: {
        fontSize: 16,
    },
    torboxButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
    },
    torboxButtonArrow: {
        fontSize: 12,
        color: '#fff',
        opacity: 0.8,
    },
    // Cached Only toggle styles
    cachedOnlySection: {
        marginTop: 20,
    },
    cachedOnlySectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#888',
        marginBottom: 12,
    },
    cachedOnlyToggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(30, 41, 59, 0.6)',
        borderRadius: 14,
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(99, 102, 241, 0.2)',
    },
    cachedOnlyInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    cachedOnlyIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: 'rgba(99, 102, 241, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    cachedOnlyTextContainer: {
        flex: 1,
    },
    cachedOnlyLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
    cachedOnlyDescription: {
        fontSize: 12,
        color: '#888',
        marginTop: 2,
    },
    // TorBox Library styles
    libraryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    libraryFilterDropdown: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(99, 102, 241, 0.3)',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    libraryFilterText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    libraryActions: {
        flexDirection: 'row',
        gap: 10,
    },
    libraryActionButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    libraryActionIcon: {
        fontSize: 22,
        color: '#10B981',
    },
    libraryCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.6)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    libraryCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    libraryCardTitle: {
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
        lineHeight: 20,
        marginRight: 10,
    },
    libraryCardMenu: {
        padding: 4,
    },
    libraryCardBadges: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 10,
    },
    libraryBadge: {
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    libraryBadgeYellow: {
        backgroundColor: 'rgba(245, 158, 11, 0.2)',
    },
    libraryBadgeGreen: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
    },
    libraryBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#fff',
    },
    libraryCardMeta: {
        fontSize: 12,
        color: '#888',
        marginBottom: 12,
    },
    libraryCardActions: {
        flexDirection: 'row',
        gap: 12,
    },
    libraryPlayButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#DC2626',
        borderRadius: 12,
        paddingVertical: 14,
    },
    libraryPlayIcon: {
        fontSize: 14,
        color: '#fff',
    },
    libraryPlayText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
    },
    libraryDownloadButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#047857',
        borderRadius: 12,
        paddingVertical: 14,
    },
    libraryDownloadText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
    },
    // Search Bar Styles (for Playlist)
    searchBarContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(30, 41, 59, 0.6)',
        borderRadius: 12,
        paddingHorizontal: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(99, 102, 241, 0.2)',
    },
    searchIcon: {
        marginRight: 8,
    },
    loadingContainer: {
        paddingVertical: 40,
        alignItems: 'center',
    },
    // Action Modal Styles
    actionModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        padding: 20,
    },
    actionModalContent: {
        backgroundColor: '#111827',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
    },
    actionModalHandle: {
        width: 40,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 2,
        marginBottom: 20,
    },
    actionModalHeader: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    actionModalIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
        backgroundColor: '#8B5CF6',
    },
    actionModalHeaderText: {
        flex: 1,
    },
    actionModalTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    actionModalSubtitle: {
        color: '#9CA3AF',
        fontSize: 13,
    },
    closeModalButton: {
        padding: 4,
    },
    closeModalButtonText: {
        color: '#6B7280',
        fontSize: 24,
    },
    actionModalOptions: {
        width: '100%',
        gap: 12,
        marginBottom: 24,
    },
    actionOption: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#1F2937',
        borderRadius: 16,
        borderWidth: 1,
    },
    actionOptionPlay: {
        borderColor: '#3B82F6',
    },
    actionOptionPlaylist: {
        borderColor: '#8B5CF6',
    },
    actionOptionIconPlay: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    actionOptionIconPlaylist: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#8B5CF6',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    actionOptionText: {
        flex: 1,
    },
    actionOptionTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 2,
    },
    actionOptionDesc: {
        color: '#9CA3AF',
        fontSize: 12,
    },
    actionModalCloseTextBtn: {
        padding: 8,
    },
    actionModalCloseText: {
        color: '#9CA3AF',
        fontSize: 14,
    },
});
