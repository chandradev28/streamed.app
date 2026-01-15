import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Dimensions,
    Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    ChevronLeft,
    Play,
    Shuffle,
    Heart,
    Trash2,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { MusicMiniPlayer } from '../components/MusicMiniPlayer';
import { StorageService, LikedSong } from '../services/storage';
import {
    playQueue,
    playSong,
    getState,
    addPlaybackListener,
    PlaybackState,
} from '../services/musicPlayerService';
import { useMusicColors } from '../hooks/useMusicColors';
import { useFocusEffect } from '@react-navigation/native';

const { width } = Dimensions.get('window');

interface MusicLibraryScreenProps {
    navigation: any;
}

export const MusicLibraryScreen = ({ navigation }: MusicLibraryScreenProps) => {
    const musicColors = useMusicColors();
    const [songs, setSongs] = useState<LikedSong[]>([]);
    const [loading, setLoading] = useState(true);
    const [playerState, setPlayerState] = useState<PlaybackState>(getState());

    // Reload songs when screen is focused
    useFocusEffect(
        useCallback(() => {
            loadLikedSongs();
        }, [])
    );

    useEffect(() => {
        const unsubscribe = addPlaybackListener(setPlayerState);
        return unsubscribe;
    }, []);

    const loadLikedSongs = async () => {
        setLoading(true);
        try {
            const likedSongs = await StorageService.getLikedSongs();
            setSongs(likedSongs);
        } catch (error) {
            console.error('Error loading liked songs:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePlayAll = async () => {
        if (songs.length === 0) return;
        const queue = songs.map(s => ({
            id: s.id,
            title: s.title,
            artist: s.artist,
            artistId: s.artistId,
            album: s.album,
            albumId: s.albumId,
            duration: s.duration,
            coverArt: s.coverArt || undefined,
            source: s.source,
            size: 0,
            suffix: 'flac',
            contentType: 'audio/flac',
        }));
        await playQueue(queue, 0);
    };

    const handleShufflePlay = async () => {
        if (songs.length === 0) return;
        const shuffled = [...songs].sort(() => Math.random() - 0.5);
        const queue = shuffled.map(s => ({
            id: s.id,
            title: s.title,
            artist: s.artist,
            artistId: s.artistId,
            album: s.album,
            albumId: s.albumId,
            duration: s.duration,
            coverArt: s.coverArt || undefined,
            source: s.source,
            size: 0,
            suffix: 'flac',
            contentType: 'audio/flac',
        }));
        await playQueue(queue, 0);
    };

    const handlePlaySong = async (index: number) => {
        if (songs.length === 0) return;
        const clickedSong = songs[index];
        // For TIDAL/Qobuz: play ONLY the clicked track to avoid mismatch issues
        if (clickedSong.source === 'tidal' || clickedSong.source === 'qobuz') {
            console.log('[Library] Playing single track:', clickedSong.title, 'ID:', clickedSong.id);
            await playSong({
                id: clickedSong.id,
                title: clickedSong.title,
                artist: clickedSong.artist,
                artistId: clickedSong.artistId,
                album: clickedSong.album,
                albumId: clickedSong.albumId,
                duration: clickedSong.duration,
                coverArt: clickedSong.coverArt || undefined,
                source: clickedSong.source,
                size: 0,
                suffix: 'flac',
                contentType: 'audio/flac',
            });
        } else {
            const queue = songs.map(s => ({
                id: s.id,
                title: s.title,
                artist: s.artist,
                artistId: s.artistId,
                album: s.album,
                albumId: s.albumId,
                duration: s.duration,
                coverArt: s.coverArt || undefined,
                source: s.source,
                size: 0,
                suffix: 'flac',
                contentType: 'audio/flac',
            }));
            await playQueue(queue, index);
        }
    };

    const handleRemoveSong = async (song: LikedSong) => {
        Alert.alert(
            'Remove from Library',
            `Remove "${song.title}" from your library?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        await StorageService.removeLikedSong(song.id, song.source);
                        setSongs(prev => prev.filter(s => !(s.id === song.id && s.source === song.source)));
                    },
                },
            ]
        );
    };

    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${String(secs).padStart(2, '0')}`;
    };

    const totalDuration = songs.reduce((acc, s) => acc + (s.duration || 0), 0);

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={playerState.currentSong ? musicColors.gradientColors : ['#1a1a2e', '#0a0a0a', '#0a0a0a']}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Header */}
            <View style={styles.headerWrapper}>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                    >
                        <ChevronLeft color="#fff" size={28} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Library Header */}
                <View style={styles.libraryHeader}>
                    <View style={styles.libraryHeaderContent}>
                        <View style={styles.libraryCover}>
                            <Heart color="#A78BFA" size={50} fill="#A78BFA" />
                        </View>
                        <View style={styles.libraryInfo}>
                            <Text style={styles.libraryTitle}>Liked Songs</Text>
                            <View style={styles.libraryMeta}>
                                <Text style={styles.libraryMetaText}>
                                    {songs.length} {songs.length === 1 ? 'song' : 'songs'}
                                    {songs.length > 0 && ` • ${Math.floor(totalDuration / 60)} min`}
                                </Text>
                            </View>
                        </View>
                    </View>
                    <Text style={styles.libraryDescription}>
                        Songs you've liked from This Is Music
                    </Text>
                </View>

                {/* Action Buttons - Disabled if library has TIDAL/Qobuz songs (queue has mismatch issues) */}
                {songs.length > 0 && (() => {
                    const hasTidalOrQobuz = songs.some(s => s.source === 'tidal' || s.source === 'qobuz');
                    return (
                        <View style={styles.actionButtons}>
                            <TouchableOpacity
                                style={[
                                    styles.playAllButton,
                                    hasTidalOrQobuz && { opacity: 0.4 }
                                ]}
                                onPress={hasTidalOrQobuz ? undefined : handlePlayAll}
                                disabled={hasTidalOrQobuz}
                            >
                                <Play color="#000" size={20} fill="#000" />
                                <Text style={styles.playAllText}>Play All</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.shuffleButton,
                                    hasTidalOrQobuz && { opacity: 0.4 }
                                ]}
                                onPress={hasTidalOrQobuz ? undefined : handleShufflePlay}
                                disabled={hasTidalOrQobuz}
                            >
                                <Shuffle color="#fff" size={20} />
                            </TouchableOpacity>
                        </View>
                    );
                })()}

                {/* Song List */}
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#A78BFA" />
                        <Text style={styles.loadingText}>Loading library...</Text>
                    </View>
                ) : songs.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Heart color="#555" size={60} />
                        <Text style={styles.emptyTitle}>No liked songs yet</Text>
                        <Text style={styles.emptySubtitle}>
                            Tap the heart icon on songs to add them here
                        </Text>
                    </View>
                ) : (
                    <View style={styles.songList}>
                        {songs.map((song, index) => (
                            <View
                                key={`${song.id}-${song.source}`}
                                style={styles.songItem}
                            >
                                <TouchableOpacity
                                    style={styles.songContent}
                                    onPress={() => handlePlaySong(index)}
                                >
                                    <Image
                                        source={{ uri: song.coverArt || undefined }}
                                        style={styles.songCover}
                                        contentFit="cover"
                                    />
                                    <View style={styles.songInfo}>
                                        <Text style={styles.songTitle} numberOfLines={1}>
                                            {song.title}
                                        </Text>
                                        <Text style={styles.songArtist} numberOfLines={1}>
                                            {song.artist} • {song.album}
                                        </Text>
                                    </View>
                                    <Text style={styles.songDuration}>
                                        {formatDuration(song.duration || 0)}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.removeButton}
                                    onPress={() => handleRemoveSong(song)}
                                >
                                    <Trash2 color="#ef4444" size={18} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}

                {/* Spacer for mini player */}
                <View style={{ height: 120 }} />
            </ScrollView>

            {/* Mini Player */}
            <MusicMiniPlayer navigation={navigation} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    headerWrapper: {
        backgroundColor: 'transparent',
        paddingTop: 44,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 8,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flex: 1,
    },
    libraryHeader: {
        paddingHorizontal: 16,
        paddingTop: 0,
        paddingBottom: 16,
    },
    libraryHeaderContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    libraryCover: {
        width: 120,
        height: 120,
        borderRadius: 8,
        backgroundColor: 'rgba(167, 139, 250, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    libraryInfo: {
        flex: 1,
        marginLeft: 16,
    },
    libraryTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
    },
    libraryDescription: {
        fontSize: 12,
        color: '#888',
        marginTop: 12,
        lineHeight: 16,
    },
    libraryMeta: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    libraryMetaText: {
        fontSize: 13,
        color: '#A78BFA',
    },
    actionButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: 16,
        gap: 12,
    },
    playAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#10B981',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 24,
        gap: 8,
    },
    playAllText: {
        color: '#000',
        fontSize: 14,
        fontWeight: '600',
    },
    shuffleButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingContainer: {
        paddingTop: 60,
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: '#888',
        fontSize: 14,
    },
    emptyContainer: {
        paddingTop: 80,
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        marginTop: 20,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#888',
        textAlign: 'center',
        marginTop: 8,
    },
    songList: {
        paddingHorizontal: 16,
    },
    songItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    songContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    songCover: {
        width: 48,
        height: 48,
        borderRadius: 6,
        backgroundColor: '#1f1f1f',
    },
    songInfo: {
        flex: 1,
        marginLeft: 12,
    },
    songTitle: {
        fontSize: 15,
        fontWeight: '500',
        color: '#fff',
    },
    songArtist: {
        fontSize: 12,
        color: '#888',
        marginTop: 2,
    },
    songDuration: {
        fontSize: 12,
        color: '#666',
        marginRight: 8,
    },
    removeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
});
