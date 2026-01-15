import React, { useEffect, useState, useCallback, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, Alert, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Film, X } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { CARD_SIZES } from '../constants/Layout';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getContinueWatching, WatchHistoryItem, removeFromHistory } from '../services/watchHistory';
import { getImageUrl } from '../services/tmdb';
import { getInstantStreamUrl, getTorrentByHash } from '../services/torbox';


// Fixed card dimensions from centralized constants
const CARD_HEIGHT = CARD_SIZES.continueWatching.height;

// Memoized small card component
const SmallCard = memo(({ item, onPress, onRemove, isResuming }: { item: WatchHistoryItem; onPress: () => void; onRemove: () => void; isResuming?: boolean }) => {
    const hasPoster = !!item.posterPath;

    return (
        <View style={styles.smallCardContainer}>
            <TouchableOpacity
                style={styles.smallCard}
                onPress={onPress}
                activeOpacity={0.8}
                disabled={isResuming}
            >
                {hasPoster ? (
                    <Image
                        source={{ uri: getImageUrl(item.posterPath, 'w342') }}
                        style={styles.smallCardImage}
                        contentFit="cover"
                        transition={200}
                        cachePolicy="memory-disk"
                    />
                ) : (
                    <View style={styles.placeholderContainer}>
                        <Film color="rgba(255,255,255,0.3)" size={32} />
                    </View>
                )}
                <View style={styles.smallCardProgress}>
                    <View style={[styles.smallProgressFill, { width: `${item.progress}%` }]} />
                </View>
                {/* Loading overlay when resuming */}
                {isResuming && (
                    <View style={styles.resumingOverlay}>
                        <ActivityIndicator size="small" color="#fff" />
                    </View>
                )}
            </TouchableOpacity>
            {/* Remove Button */}
            <TouchableOpacity
                style={styles.removeButton}
                onPress={onRemove}
                hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
            >
                <X color="#fff" size={14} />
            </TouchableOpacity>
        </View>
    );
});

export const ContinueWatchingCard = memo(() => {
    const navigation = useNavigation<any>();
    const [items, setItems] = useState<WatchHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [resumingId, setResumingId] = useState<string | null>(null); // Track which item is resuming

    const fetchHistory = useCallback(async () => {
        try {
            // Fetch up to 20 items for the continue watching section
            const history = await getContinueWatching(20);
            setItems(history);
        } catch (error) {
            // Silent error handling
        } finally {
            setLoading(false);
        }
    }, []);

    // Refresh when screen comes into focus
    useFocusEffect(
        useCallback(() => {
            fetchHistory();
        }, [fetchHistory])
    );

    const handleRemove = useCallback(async (itemId: string) => {
        await removeFromHistory(itemId);
        // Refresh the list
        setItems(prev => prev.filter(item => item.id !== itemId));
    }, []);

    const handlePress = useCallback(async (item: WatchHistoryItem) => {
        // Calculate start position in milliseconds (currentTime is in seconds)
        const startPosition = item.currentTime > 0 ? item.currentTime * 1000 : 0;

        // TorBox stream URLs expire, so we always need to refresh them
        if (item.torrentHash) {
            setResumingId(item.id);

            try {
                console.log('Checking TorBox library for:', item.title);

                // FIRST: Check if torrent still exists in TorBox library
                const existingTorrent = await getTorrentByHash(item.torrentHash);

                if (!existingTorrent) {
                    // Torrent was deleted from library - show error with option to remove from history
                    console.log('Torrent not found in library (was deleted)');
                    Alert.alert(
                        'Torrent Removed',
                        'This torrent was removed from your TorBox library. You need to add it again to play.',
                        [
                            {
                                text: 'Remove from History',
                                style: 'destructive',
                                onPress: () => handleRemove(item.id)
                            },
                            {
                                text: 'Go to Details',
                                onPress: () => {
                                    navigation.navigate('MovieDetail', {
                                        id: item.tmdbId,
                                        mediaType: item.mediaType,
                                    });
                                }
                            },
                            { text: 'Cancel', style: 'cancel' },
                        ]
                    );
                    setResumingId(null);
                    return;
                }

                console.log('Torrent found in library, refreshing stream URL...');

                // Get fresh stream URL from TorBox using the saved hash and file index
                const freshStreamUrl = await getInstantStreamUrl(
                    item.torrentHash,
                    item.currentFileIndex
                );

                if (freshStreamUrl) {
                    console.log('Got fresh stream URL, navigating to player');
                    navigation.navigate('VideoPlayer', {
                        title: item.title,
                        videoUrl: freshStreamUrl,
                        posterUrl: item.posterPath ? getImageUrl(item.posterPath, 'w500') : null,
                        tmdbId: item.tmdbId,
                        mediaType: item.mediaType,
                        seasonNumber: item.seasonNumber,
                        episodeNumber: item.episodeNumber,
                        episodeName: item.episodeName,
                        torrentHash: item.torrentHash,
                        currentFileIndex: item.currentFileIndex,
                        startPosition,
                    });
                } else {
                    // If we can't get a fresh URL, navigate to detail page
                    console.log('Could not refresh stream URL, navigating to detail page');
                    Alert.alert(
                        'Stream Unavailable',
                        'Could not get stream URL. Taking you to the detail page to select a new torrent.',
                        [{
                            text: 'OK', onPress: () => {
                                navigation.navigate('MovieDetail', {
                                    id: item.tmdbId,
                                    mediaType: item.mediaType,
                                });
                            }
                        }]
                    );
                }
            } catch (error) {
                console.error('Error refreshing stream URL:', error);
                // Fallback to detail page
                Alert.alert(
                    'Error',
                    'Failed to resume playback. Please try again.',
                    [{
                        text: 'OK', onPress: () => {
                            navigation.navigate('MovieDetail', {
                                id: item.tmdbId,
                                mediaType: item.mediaType,
                            });
                        }
                    }]
                );
            } finally {
                setResumingId(null);
            }
        } else if (item.streamUrl) {
            // Direct stream URL (addon debrid streams) - verify URL is still valid
            console.log('Direct stream URL found, checking validity:', item.streamUrl.substring(0, 50));
            setResumingId(item.id);

            try {
                // Quick HEAD request to check if URL is still accessible
                const response = await fetch(item.streamUrl, {
                    method: 'HEAD',
                    headers: { 'Range': 'bytes=0-0' },  // Minimal request
                });

                if (!response.ok && response.status !== 206) {
                    // URL is no longer valid (expired, deleted, etc.)
                    console.log('Stream URL expired/invalid:', response.status);
                    Alert.alert(
                        'Stream Expired',
                        'This stream link has expired or is no longer available. You need to select a new stream to play.',
                        [
                            {
                                text: 'Remove from History',
                                style: 'destructive',
                                onPress: () => handleRemove(item.id)
                            },
                            {
                                text: 'Go to Details',
                                onPress: () => {
                                    navigation.navigate('MovieDetail', {
                                        id: item.tmdbId,
                                        mediaType: item.mediaType,
                                    });
                                }
                            },
                            { text: 'Cancel', style: 'cancel' },
                        ]
                    );
                    setResumingId(null);
                    return;
                }

                // URL is valid, proceed to play
                console.log('Stream URL valid, navigating to player');
                const startPosition = item.currentTime > 0 ? item.currentTime * 1000 : 0;

                navigation.navigate('VideoPlayer', {
                    title: item.title,
                    videoUrl: item.streamUrl,
                    posterUrl: item.posterPath ? getImageUrl(item.posterPath, 'w500') : null,
                    tmdbId: item.tmdbId,
                    mediaType: item.mediaType,
                    seasonNumber: item.seasonNumber,
                    episodeNumber: item.episodeNumber,
                    episodeName: item.episodeName,
                    startPosition,
                });
            } catch (error) {
                console.error('Error checking stream URL:', error);
                // Network error or URL unreachable
                Alert.alert(
                    'Stream Unavailable',
                    'Could not access the stream. The link may have expired. Please select a new stream.',
                    [
                        {
                            text: 'Go to Details',
                            onPress: () => {
                                navigation.navigate('MovieDetail', {
                                    id: item.tmdbId,
                                    mediaType: item.mediaType,
                                });
                            }
                        },
                        { text: 'Cancel', style: 'cancel' },
                    ]
                );
            } finally {
                setResumingId(null);
            }
        } else {
            // No torrent hash or stream URL - go to detail page to select a stream
            navigation.navigate('MovieDetail', {
                id: item.tmdbId,
                mediaType: item.mediaType,
            });
        }
    }, [navigation, handleRemove]);

    const formatTimeLeft = useCallback((item: WatchHistoryItem): string => {
        const remainingSeconds = item.duration - item.currentTime;
        const remainingMinutes = Math.ceil(remainingSeconds / 60);
        if (remainingMinutes < 60) {
            return `${remainingMinutes} min left`;
        }
        const hours = Math.floor(remainingMinutes / 60);
        const mins = remainingMinutes % 60;
        return `${hours}h ${mins}m left`;
    }, []);

    const getSubtitle = useCallback((item: WatchHistoryItem): string => {
        if (item.mediaType === 'tv' && item.seasonNumber && item.episodeNumber) {
            return `S${item.seasonNumber}E${item.episodeNumber}`;
        }
        return item.mediaType === 'movie' ? 'Movie' : 'TV Show';
    }, []);

    const renderSmallItem = useCallback(({ item }: { item: WatchHistoryItem }) => (
        <SmallCard
            item={item}
            onPress={() => handlePress(item)}
            onRemove={() => handleRemove(item.id)}
            isResuming={resumingId === item.id}
        />
    ), [handlePress, handleRemove, resumingId]);

    const keyExtractor = useCallback((item: WatchHistoryItem) => item.id, []);

    if (loading) {
        return (
            <View style={[styles.container, styles.loadingContainer]}>
                <ActivityIndicator size="large" color={Colors.dark.tint} />
            </View>
        );
    }

    if (items.length === 0) {
        // Don't show section if no watch history
        return null;
    }

    // Render a single item card (for FlatList)
    const renderItem = ({ item, index }: { item: WatchHistoryItem; index: number }): React.ReactElement => {
        const isFirst = index === 0;
        const isItemResuming = resumingId === item.id;

        if (isFirst) {
            // First item is larger/featured
            const hasFeaturedImage = !!(item.backdropPath || item.posterPath);
            return (
                <View style={styles.featuredCardContainer}>
                    <TouchableOpacity
                        style={styles.featuredCard}
                        onPress={() => handlePress(item)}
                        activeOpacity={0.9}
                        disabled={isItemResuming}
                    >
                        {hasFeaturedImage ? (
                            <Image
                                source={{
                                    uri: item.backdropPath
                                        ? getImageUrl(item.backdropPath, 'w780')
                                        : getImageUrl(item.posterPath, 'w500')
                                }}
                                style={styles.featuredImage}
                                contentFit="cover"
                                transition={200}
                                cachePolicy="memory-disk"
                            />
                        ) : (
                            <View style={styles.featuredPlaceholder}>
                                <Film color="rgba(255,255,255,0.3)" size={48} />
                            </View>
                        )}
                        <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.9)']}
                            style={styles.featuredGradient}
                        >
                            <View style={styles.featuredContent}>
                                <Text style={styles.timeLeft}>{formatTimeLeft(item)}</Text>
                                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                                <Text style={styles.subtitle}>{getSubtitle(item)}</Text>
                                <View style={styles.progressBackground}>
                                    <View style={[styles.progressFill, { width: `${item.progress}%` }]} />
                                </View>
                            </View>
                        </LinearGradient>
                        {/* Loading overlay when resuming */}
                        {isItemResuming && (
                            <View style={styles.featuredResumingOverlay}>
                                <ActivityIndicator size="large" color="#fff" />
                                <Text style={styles.resumingText}>Resuming...</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                    {/* Remove Button for Featured Card */}
                    <TouchableOpacity
                        style={styles.featuredRemoveButton}
                        onPress={() => handleRemove(item.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <X color="#fff" size={16} />
                    </TouchableOpacity>
                </View>
            );
        }

        // Regular poster cards for other items - use SmallCard with remove button
        return (
            <SmallCard
                item={item}
                onPress={() => handlePress(item)}
                onRemove={() => handleRemove(item.id)}
                isResuming={isItemResuming}
            />
        );
    };

    return (
        <View style={styles.container}>
            {/* Horizontal Scrollable List of All Items */}
            <FlatList
                horizontal
                data={items}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalList}
                removeClippedSubviews={true}
                maxToRenderPerBatch={5}
                windowSize={5}
                snapToAlignment="start"
                decelerationRate="fast"
            />
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        marginBottom: 24,
    },
    loadingContainer: {
        height: CARD_HEIGHT + 60,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    sectionTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
    },
    itemCount: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        fontWeight: '500',
    },
    horizontalList: {
        paddingHorizontal: 16,
        gap: 12,
    },
    // Featured Card (first item - larger)
    featuredCardContainer: {
        position: 'relative' as const,
        marginLeft: 4,
    },
    featuredCard: {
        width: 280,
        height: 160,
        borderRadius: CARD_SIZES.continueWatching.borderRadius,
        overflow: 'hidden',
        backgroundColor: '#1a1a1a',
    },
    featuredRemoveButton: {
        position: 'absolute' as const,
        top: 8,
        right: 8,
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    featuredImage: {
        width: '100%',
        height: '100%',
        position: 'absolute',
    },
    featuredGradient: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    featuredContent: {
        padding: 12,
    },
    timeLeft: {
        color: Colors.dark.tint,
        fontSize: 11,
        fontWeight: '600',
        marginBottom: 2,
    },
    title: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 2,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 11,
        marginBottom: 8,
    },
    progressBackground: {
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: Colors.dark.tint,
        borderRadius: 2,
    },
    // Small Cards (subsequent items)
    smallCard: {
        width: 110,
        height: 165,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: '#1a1a1a',
    },
    smallCardImage: {
        width: '100%',
        height: '100%',
        position: 'absolute',
    },
    smallCardGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 60,
        justifyContent: 'flex-end',
        padding: 8,
        paddingBottom: 12,
    },
    smallCardTitle: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '600',
        lineHeight: 14,
    },
    smallCardSub: {
        color: Colors.dark.tint,
        fontSize: 10,
        fontWeight: '500',
        marginTop: 2,
    },
    smallCardProgress: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    smallProgressFill: {
        height: '100%',
        backgroundColor: Colors.dark.tint,
    },
    // Placeholder for missing posters
    placeholderContainer: {
        width: '100%',
        height: '100%',
        backgroundColor: '#2a2a2a',
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
    },
    featuredPlaceholder: {
        position: 'absolute' as const,
        width: '100%',
        height: '100%',
        backgroundColor: '#2a2a2a',
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
    },
    // Container for small card with remove button
    smallCardContainer: {
        position: 'relative' as const,
    },
    removeButton: {
        position: 'absolute' as const,
        top: 4,
        right: 4,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    // Loading overlay when resuming/refreshing stream URL
    resumingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        borderRadius: 10,
    },
    // Featured card loading overlay
    featuredResumingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        borderRadius: CARD_SIZES.continueWatching.borderRadius,
    },
    resumingText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600' as const,
        marginTop: 8,
    },
});
