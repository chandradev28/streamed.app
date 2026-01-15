import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Animated,
    Dimensions,
    Alert,
    RefreshControl,
    StatusBar,
    SafeAreaView,
    Platform,
} from 'react-native';
import { ArrowLeft, Plus, Download, Clock, CheckCircle, AlertCircle, Zap, Trash2, Link, HardDrive, FileText, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { addTorrent, getUserTorrents, deleteTorrent, TorBoxTorrent } from '../services/torbox';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';

const { width } = Dimensions.get('window');
const STORAGE_KEY = '@streamed_magnet_history';

interface MagnetScreenProps {
    navigation: any;
}

interface MagnetHistoryItem {
    hash: string;
    name: string;
    addedAt: number;
    wasAlreadyCached: boolean;
}

// Format bytes to human readable
const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Format speed
const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond <= 0) return '0 KB/s';
    if (bytesPerSecond >= 1024 * 1024) {
        return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`;
};

// Calculate ETA
const formatETA = (remainingBytes: number, speed: number): string => {
    if (speed <= 0 || remainingBytes <= 0) return '--';
    const seconds = remainingBytes / speed;
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.ceil((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
};

export const MagnetScreen = ({ navigation }: MagnetScreenProps) => {
    const [magnetInput, setMagnetInput] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [myTorrents, setMyTorrents] = useState<TorBoxTorrent[]>([]); // Torrents I added (from history)
    const [historyHashes, setHistoryHashes] = useState<Set<string>>(new Set()); // Persisted hashes
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Track previously completed torrents to detect new completions
    const previouslyCompletedRef = useRef<Set<string>>(new Set());

    // Animation for newly added torrent
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Load persisted history from AsyncStorage
    const loadHistory = useCallback(async () => {
        try {
            const data = await AsyncStorage.getItem(STORAGE_KEY);
            if (data) {
                const items: MagnetHistoryItem[] = JSON.parse(data);
                const hashes = new Set(items.map(item => item.hash.toLowerCase()));
                setHistoryHashes(hashes);
                return hashes;
            }
        } catch (error) {
            console.error('Error loading magnet history:', error);
        }
        return new Set<string>();
    }, []);

    // Save history to AsyncStorage
    const saveHistory = useCallback(async (hashes: Set<string>, torrents: TorBoxTorrent[]) => {
        try {
            const items: MagnetHistoryItem[] = [];
            hashes.forEach(hash => {
                const torrent = torrents.find(t => t.hash.toLowerCase() === hash);
                items.push({
                    hash,
                    name: torrent?.name || 'Unknown',
                    addedAt: Date.now(),
                    wasAlreadyCached: (torrent?.progress ?? 0) >= 100,
                });
            });
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch (error) {
            console.error('Error saving magnet history:', error);
        }
    }, []);

    // Fetch torrents that match our history
    const fetchMyTorrents = useCallback(async (hashes?: Set<string>) => {
        const hashesToUse = hashes || historyHashes;
        if (hashesToUse.size === 0) {
            setMyTorrents([]);
            setLoading(false);
            return;
        }

        try {
            const allTorrents = await getUserTorrents();
            // Filter to only show torrents from our history
            const myOnly = allTorrents.filter(t => hashesToUse.has(t.hash.toLowerCase()));

            // Check for newly completed torrents
            myOnly.forEach(torrent => {
                const hash = torrent.hash.toLowerCase();
                if (torrent.progress >= 100 && !previouslyCompletedRef.current.has(hash)) {
                    // This torrent just finished!
                    previouslyCompletedRef.current.add(hash);
                    // Only show notification if it wasn't already cached when added
                    if (myTorrents.some(t => t.hash.toLowerCase() === hash && t.progress < 100)) {
                        Alert.alert('Caching Complete! ✅', `"${torrent.name}" is now cached and ready to stream.`);
                    }
                }
            });

            // Sort: caching first, then cached
            const sorted = myOnly.sort((a, b) => {
                const aComplete = a.progress >= 100;
                const bComplete = b.progress >= 100;
                if (!aComplete && bComplete) return -1;
                if (aComplete && !bComplete) return 1;
                return b.progress - a.progress;
            });

            setMyTorrents(sorted);
        } catch (error) {
            console.error('Error fetching my torrents:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [historyHashes, myTorrents]);

    // Initial load
    useEffect(() => {
        const init = async () => {
            setLoading(true);
            const hashes = await loadHistory();
            if (hashes.size > 0) {
                await fetchMyTorrents(hashes);
            } else {
                setLoading(false);
            }
        };
        init();
    }, []);

    // Auto-refresh every 3 seconds if there are active downloads
    useEffect(() => {
        const hasActiveDownloads = myTorrents.some(t => t.progress < 100);

        if (hasActiveDownloads && historyHashes.size > 0) {
            refreshIntervalRef.current = setInterval(() => fetchMyTorrents(), 3000);
        } else if (refreshIntervalRef.current) {
            clearInterval(refreshIntervalRef.current);
        }

        return () => {
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
            }
        };
    }, [myTorrents, historyHashes, fetchMyTorrents]);

    // Handle pull to refresh
    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchMyTorrents();
    }, [fetchMyTorrents]);

    // Handle adding magnet - supports multiple magnets (one per line)
    const handleAddMagnet = async () => {
        const input = magnetInput.trim();
        if (!input) {
            Alert.alert('Error', 'Please enter a magnet link or hash');
            return;
        }

        // Split by newlines and filter empty lines
        const magnetLinks = input
            .split(/[\n\r]+/)
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (magnetLinks.length === 0) {
            Alert.alert('Error', 'Please enter valid magnet links or hashes');
            return;
        }

        setIsAdding(true);

        let successCount = 0;
        let alreadyCachedCount = 0;
        let failCount = 0;
        const newHashes = new Set(historyHashes);

        try {
            for (const magnet of magnetLinks) {
                try {
                    const result = await addTorrent(magnet);
                    if (result) {
                        successCount++;
                        newHashes.add(result.hash.toLowerCase());
                        if (result.progress >= 100) {
                            alreadyCachedCount++;
                            previouslyCompletedRef.current.add(result.hash.toLowerCase());
                        }
                    } else {
                        failCount++;
                    }
                } catch (error) {
                    console.error('Failed to add magnet:', magnet, error);
                    failCount++;
                }
            }

            // Update history
            setHistoryHashes(newHashes);
            setMagnetInput('');

            // Animate
            fadeAnim.setValue(0);
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
            }).start();

            // Fetch updated data
            const allTorrents = await getUserTorrents();
            const myOnly = allTorrents.filter(t => newHashes.has(t.hash.toLowerCase()));
            setMyTorrents(myOnly);

            // Save to storage
            await saveHistory(newHashes, allTorrents);

            // Show message
            if (magnetLinks.length === 1) {
                if (successCount === 1) {
                    if (alreadyCachedCount === 1) {
                        Alert.alert('Already Cached! ⚡', 'This torrent is already cached and added to your library.');
                    } else {
                        Alert.alert('Torrent Added ✓', 'Your torrent is now caching. Watch the progress below.');
                    }
                } else {
                    Alert.alert('Error', 'Failed to add torrent. Please check the magnet link.');
                }
            } else {
                let message = '';
                if (successCount > 0) message += `✓ ${successCount} added\n`;
                if (alreadyCachedCount > 0) message += `⚡ ${alreadyCachedCount} already cached\n`;
                if (failCount > 0) message += `✗ ${failCount} failed`;
                Alert.alert('Batch Complete', message.trim());
            }
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to add torrents');
        } finally {
            setIsAdding(false);
        }
    };

    // Handle torrent file upload
    const handleUploadTorrentFile = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: true,
            });

            if (result.canceled || !result.assets || result.assets.length === 0) {
                return;
            }

            const file = result.assets[0];

            if (!file.name.toLowerCase().endsWith('.torrent')) {
                Alert.alert('Invalid File', 'Please select a .torrent file');
                return;
            }

            Alert.alert(
                'Coming Soon',
                'Torrent file upload will be available in a future update. Please use magnet links for now.'
            );
        } catch (error: any) {
            console.error('Error selecting torrent file:', error);
            Alert.alert('Error', 'Failed to select torrent file');
        }
    };

    // Remove from history only (doesn't delete from TorBox)
    const handleRemoveFromHistory = (torrent: TorBoxTorrent) => {
        Alert.alert(
            'Remove from History',
            `Remove "${torrent.name}" from this list?\n\n(This won't delete it from your TorBox library)`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        const hash = torrent.hash.toLowerCase();
                        const newHashes = new Set(historyHashes);
                        newHashes.delete(hash);
                        setHistoryHashes(newHashes);
                        setMyTorrents(prev => prev.filter(t => t.hash.toLowerCase() !== hash));

                        // Update storage
                        const allTorrents = await getUserTorrents();
                        await saveHistory(newHashes, allTorrents);
                    },
                },
            ]
        );
    };

    // Delete from TorBox AND history
    const handleDeleteTorrent = (torrent: TorBoxTorrent) => {
        Alert.alert(
            'Delete Torrent',
            `Delete "${torrent.name}" from TorBox?\n\nThis will also remove it from your library.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        const success = await deleteTorrent(torrent.id);
                        if (success) {
                            const hash = torrent.hash.toLowerCase();
                            const newHashes = new Set(historyHashes);
                            newHashes.delete(hash);
                            setHistoryHashes(newHashes);
                            setMyTorrents(prev => prev.filter(t => t.id !== torrent.id));

                            const allTorrents = await getUserTorrents();
                            await saveHistory(newHashes, allTorrents);
                        } else {
                            Alert.alert('Error', 'Failed to delete torrent');
                        }
                    },
                },
            ]
        );
    };

    // Get status info with proper labels
    const getStatusInfo = (torrent: TorBoxTorrent): { label: string; color: string; icon: string } => {
        if (torrent.progress >= 100) {
            return { label: 'Cached', color: '#10B981', icon: 'check' };
        }
        if (torrent.download_speed > 0) {
            return { label: 'Caching', color: '#F59E0B', icon: 'download' };
        }
        const state = torrent.download_state?.toLowerCase() || '';
        if (state === 'stalled' || state === 'paused') {
            return { label: 'Stalled', color: '#EF4444', icon: 'pause' };
        }
        if (state === 'error' || state === 'failed') {
            return { label: 'Error', color: '#EF4444', icon: 'error' };
        }
        return { label: 'Queued', color: '#6366F1', icon: 'queue' };
    };

    // Render torrent card
    const renderTorrentCard = (torrent: TorBoxTorrent) => {
        const status = getStatusInfo(torrent);
        const isDownloading = torrent.progress < 100;
        const remainingBytes = torrent.size * (1 - torrent.progress / 100);

        return (
            <View key={torrent.id} style={styles.torrentCard}>
                <LinearGradient
                    colors={['rgba(30, 35, 45, 0.95)', 'rgba(20, 25, 35, 0.98)']}
                    style={styles.cardGradient}
                >
                    {/* Header */}
                    <View style={styles.cardHeader}>
                        <View style={styles.cardTitleRow}>
                            <HardDrive color="#10B981" size={18} />
                            <Text style={styles.torrentName} numberOfLines={2}>
                                {torrent.name}
                            </Text>
                        </View>
                        <View style={styles.actionButtons}>
                            <TouchableOpacity
                                style={styles.removeButton}
                                onPress={() => handleRemoveFromHistory(torrent)}
                            >
                                <X color="#888" size={16} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.deleteButton}
                                onPress={() => handleDeleteTorrent(torrent)}
                            >
                                <Trash2 color="#EF4444" size={16} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Progress Bar */}
                    <View style={styles.progressContainer}>
                        <View style={styles.progressBar}>
                            <LinearGradient
                                colors={isDownloading ? ['#F59E0B', '#F97316'] : ['#10B981', '#059669']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={[
                                    styles.progressFill,
                                    { width: `${Math.min(torrent.progress, 100)}%` },
                                ]}
                            />
                        </View>
                        <Text style={styles.progressText}>{Math.round(torrent.progress)}%</Text>
                    </View>

                    {/* Stats Row */}
                    <View style={styles.statsRow}>
                        {/* Size */}
                        <View style={styles.statItem}>
                            <HardDrive color="#888" size={14} />
                            <Text style={styles.statText}>{formatBytes(torrent.size)}</Text>
                        </View>

                        {/* Download Speed */}
                        {isDownloading && torrent.download_speed > 0 && (
                            <View style={styles.statItem}>
                                <Download color="#10B981" size={14} />
                                <Text style={[styles.statText, { color: '#10B981' }]}>
                                    {formatSpeed(torrent.download_speed)}
                                </Text>
                            </View>
                        )}

                        {/* ETA */}
                        {isDownloading && torrent.download_speed > 0 && (
                            <View style={styles.statItem}>
                                <Clock color="#F59E0B" size={14} />
                                <Text style={[styles.statText, { color: '#F59E0B' }]}>
                                    {formatETA(remainingBytes, torrent.download_speed)}
                                </Text>
                            </View>
                        )}

                        {/* Status Badge */}
                        <View style={[styles.statusBadge, { backgroundColor: `${status.color}20` }]}>
                            {status.icon === 'check' ? (
                                <CheckCircle color={status.color} size={12} />
                            ) : status.icon === 'download' ? (
                                <Download color={status.color} size={12} />
                            ) : (
                                <AlertCircle color={status.color} size={12} />
                            )}
                            <Text style={[styles.statusText, { color: status.color }]}>
                                {status.label}
                            </Text>
                        </View>
                    </View>
                </LinearGradient>
            </View>
        );
    };

    // Calculate stats
    const activeDownloads = myTorrents.filter(t => t.progress < 100);
    const totalDownloadSpeed = activeDownloads.reduce((sum, t) => sum + (t.download_speed || 0), 0);
    const cachedCount = myTorrents.filter(t => t.progress >= 100).length;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <ArrowLeft color="#fff" size={24} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Add Torrent</Text>
                <View style={styles.backButton} />
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        tintColor="#10B981"
                    />
                }
            >
                {/* Dashboard Stats Card - Always Visible */}
                <View style={styles.dashboardCard}>
                    <LinearGradient
                        colors={['rgba(16, 185, 129, 0.15)', 'rgba(16, 185, 129, 0.05)']}
                        style={styles.dashboardGradient}
                    >
                        <View style={styles.dashboardStats}>
                            <View style={styles.dashboardStat}>
                                <Download color="#10B981" size={24} />
                                <Text style={styles.dashboardValue}>
                                    {formatSpeed(totalDownloadSpeed)}
                                </Text>
                                <Text style={styles.dashboardLabel}>Speed</Text>
                            </View>
                            <View style={styles.dashboardDivider} />
                            <View style={styles.dashboardStat}>
                                <Zap color="#F59E0B" size={24} />
                                <Text style={styles.dashboardValue}>{activeDownloads.length}</Text>
                                <Text style={styles.dashboardLabel}>Caching</Text>
                            </View>
                            <View style={styles.dashboardDivider} />
                            <View style={styles.dashboardStat}>
                                <CheckCircle color="#10B981" size={24} />
                                <Text style={styles.dashboardValue}>{cachedCount}</Text>
                                <Text style={styles.dashboardLabel}>Cached</Text>
                            </View>
                        </View>
                    </LinearGradient>
                </View>

                {/* Add Magnet Section */}
                <View style={styles.addSection}>
                    <View style={styles.sectionHeader}>
                        <Link color="#10B981" size={18} />
                        <Text style={styles.sectionTitle}>Add Magnet Links</Text>
                    </View>
                    <Text style={styles.sectionSubtitle}>Paste one or multiple magnet links (one per line)</Text>

                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            placeholder="Paste magnet link or hash..."
                            placeholderTextColor="#666"
                            value={magnetInput}
                            onChangeText={setMagnetInput}
                            autoCapitalize="none"
                            autoCorrect={false}
                            multiline
                            textAlignVertical="top"
                        />
                    </View>

                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={[styles.addButton, isAdding && styles.addButtonDisabled]}
                            onPress={handleAddMagnet}
                            disabled={isAdding}
                        >
                            {isAdding ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <>
                                    <Plus color="#fff" size={20} />
                                    <Text style={styles.addButtonText}>Add Magnet(s)</Text>
                                </>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.uploadButton}
                            onPress={handleUploadTorrentFile}
                            disabled={isAdding}
                        >
                            <FileText color="#10B981" size={20} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* My Torrents Section */}
                {myTorrents.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <HardDrive color="#10B981" size={18} />
                            <Text style={styles.sectionTitle}>My Torrents ({myTorrents.length})</Text>
                        </View>
                        {myTorrents.map(torrent => renderTorrentCard(torrent))}
                    </View>
                )}

                {/* Loading State */}
                {loading && (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#10B981" />
                        <Text style={styles.loadingText}>Loading your torrents...</Text>
                    </View>
                )}

                {/* Empty State */}
                {!loading && myTorrents.length === 0 && (
                    <View style={styles.emptyContainer}>
                        <HardDrive color="#333" size={64} />
                        <Text style={styles.emptyText}>No torrents added yet</Text>
                        <Text style={styles.emptySubtext}>
                            Paste a magnet link above to start caching
                        </Text>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
        paddingTop: Platform.OS === 'android' ? 40 : 16,
        backgroundColor: '#0a0a0a',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 100,
    },
    // Dashboard Card - Always visible
    dashboardCard: {
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    dashboardGradient: {
        padding: 20,
    },
    dashboardStats: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    dashboardStat: {
        alignItems: 'center',
        flex: 1,
    },
    dashboardDivider: {
        width: 1,
        height: 50,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    dashboardValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
        marginTop: 8,
    },
    dashboardLabel: {
        fontSize: 12,
        color: '#888',
        marginTop: 4,
    },
    // Add Section
    addSection: {
        marginBottom: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    sectionSubtitle: {
        fontSize: 12,
        color: '#888',
        marginBottom: 12,
    },
    inputContainer: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        marginBottom: 12,
    },
    input: {
        padding: 16,
        color: '#fff',
        fontSize: 14,
        minHeight: 100,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
    },
    addButton: {
        flex: 1,
        backgroundColor: '#10B981',
        borderRadius: 12,
        paddingVertical: 14,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    addButtonDisabled: {
        opacity: 0.6,
    },
    addButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    uploadButton: {
        width: 52,
        height: 52,
        borderRadius: 12,
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Section
    section: {
        marginBottom: 24,
    },
    // Torrent Card
    torrentCard: {
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    cardGradient: {
        padding: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    cardTitleRow: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginRight: 12,
    },
    torrentName: {
        flex: 1,
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
        lineHeight: 20,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    removeButton: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    deleteButton: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },
    // Progress
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 12,
    },
    progressBar: {
        flex: 1,
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
    progressText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff',
        width: 45,
        textAlign: 'right',
    },
    // Stats
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    statText: {
        fontSize: 12,
        color: '#888',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        marginLeft: 'auto',
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
    },
    // Loading & Empty States
    loadingContainer: {
        paddingVertical: 40,
        alignItems: 'center',
    },
    loadingText: {
        color: '#888',
        marginTop: 12,
        fontSize: 14,
    },
    emptyContainer: {
        paddingVertical: 60,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#444',
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#333',
        marginTop: 8,
        textAlign: 'center',
    },
});

export default MagnetScreen;
