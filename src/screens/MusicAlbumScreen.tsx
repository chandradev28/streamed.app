import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Dimensions,
    Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import {
    ChevronLeft,
    Play,
    Shuffle,
    Clock,
    Music2,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { MusicMiniPlayer } from '../components/MusicMiniPlayer';
import {
    getAlbum,
    getAlbumTracks,
    HiFiAlbum,
    HiFiAlbumDetails,
    HiFiSong,
    MusicAlbum,
} from '../services/hifi';
import {
    playQueue,
    playSong,
    getState,
    addPlaybackListener,
    PlaybackState,
} from '../services/musicPlayerService';
import { useMusicColors } from '../hooks/useMusicColors';

const { width } = Dimensions.get('window');

interface MusicAlbumScreenProps {
    navigation: any;
    route: any;
}

export const MusicAlbumScreen = ({ navigation, route }: MusicAlbumScreenProps) => {
    const album: HiFiAlbum | MusicAlbum = route.params?.album;
    const source = (album as any)?.source || 'hifi';
    const musicColors = useMusicColors();
    const [albumTracks, setAlbumTracks] = useState<HiFiSong[]>([]);
    const [loading, setLoading] = useState(true);
    const [playerState, setPlayerState] = useState<PlaybackState>(getState());

    useEffect(() => {
        loadAlbumDetails();
        const unsubscribe = addPlaybackListener(setPlayerState);
        return unsubscribe;
    }, []);

    const loadAlbumDetails = async () => {
        if (!album?.id) return;
        setLoading(true);
        try {
            const tracks = await getAlbumTracks(album.id, source);
            if (tracks) {
                // Add album info to tracks
                const tracksWithAlbum = tracks.map(t => ({
                    ...t,
                    album: (album as any).name || (album as any).title || t.album,
                    coverArt: t.coverArt || (album as any).coverArt,
                }));
                setAlbumTracks(tracksWithAlbum);
            }
        } catch (error) {
            console.error('Error loading album:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePlayAll = async () => {
        if (albumTracks.length === 0) return;
        await playQueue(albumTracks, 0);
    };

    const handleShufflePlay = async () => {
        if (albumTracks.length === 0) return;
        const shuffled = [...albumTracks].sort(() => Math.random() - 0.5);
        await playQueue(shuffled, 0);
    };

    const handlePlaySong = async (index: number) => {
        if (albumTracks.length === 0) return;
        // For TIDAL/Qobuz: play ONLY the clicked track to avoid mismatch issues
        // For HiFi: play full queue as before (works correctly)
        if (source === 'tidal' || source === 'qobuz') {
            const clickedTrack = albumTracks[index];
            console.log('[Album] Playing single track:', clickedTrack.title, 'ID:', clickedTrack.id);
            await playSong(clickedTrack);
        } else {
            await playQueue(albumTracks, index);
        }
    };

    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${String(secs).padStart(2, '0')}`;
    };

    const totalDuration = albumTracks.reduce((acc: number, s: HiFiSong) => acc + (s.duration || 0), 0);

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={playerState.currentSong ? musicColors.gradientColors : ['#1a1a2e', '#0a0a0a', '#0a0a0a']}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Header */}
            <ScreenWrapper style={styles.headerWrapper}>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                    >
                        <ChevronLeft color="#fff" size={28} />
                    </TouchableOpacity>
                </View>
            </ScreenWrapper>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Album Header */}
                <View style={styles.albumHeader}>
                    <Image
                        source={{ uri: album?.coverArt || undefined }}
                        style={styles.albumCover}
                        contentFit="cover"
                    />
                    <Text style={styles.albumTitle} numberOfLines={2}>
                        {album?.name || 'Unknown Album'}
                    </Text>
                    <Text style={styles.albumArtist}>
                        {album?.artist || 'Unknown Artist'}
                    </Text>
                    <View style={styles.albumMeta}>
                        {album?.year && (
                            <Text style={styles.albumMetaText}>{album.year}</Text>
                        )}
                        {albumTracks.length > 0 && (
                            <Text style={styles.albumMetaText}>
                                {albumTracks.length} songs • {Math.floor(totalDuration / 60)} min
                            </Text>
                        )}
                    </View>
                </View>

                {/* Action Buttons - Disabled for TIDAL/Qobuz (queue has mismatch issues) */}
                <View style={styles.actionButtons}>
                    <TouchableOpacity
                        style={[
                            styles.playAllButton,
                            (source === 'tidal' || source === 'qobuz') && { opacity: 0.4 }
                        ]}
                        onPress={source === 'hifi' ? handlePlayAll : undefined}
                        disabled={source !== 'hifi'}
                    >
                        <Play color="#000" size={20} fill="#000" />
                        <Text style={styles.playAllText}>Play All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.shuffleButton,
                            (source === 'tidal' || source === 'qobuz') && { opacity: 0.4 }
                        ]}
                        onPress={source === 'hifi' ? handleShufflePlay : undefined}
                        disabled={source !== 'hifi'}
                    >
                        <Shuffle color="#fff" size={20} />
                    </TouchableOpacity>
                </View>

                {/* Track List */}
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#10B981" />
                    </View>
                ) : (
                    <View style={styles.trackList}>
                        {albumTracks.map((song: HiFiSong, index: number) => (
                            <TouchableOpacity
                                key={song.id}
                                style={styles.trackItem}
                                onPress={() => handlePlaySong(index)}
                            >
                                <Text style={styles.trackNumber}>{index + 1}</Text>
                                <View style={styles.trackInfo}>
                                    <Text style={styles.trackTitle} numberOfLines={1}>
                                        {song.title}
                                    </Text>
                                    <Text style={styles.trackDuration}>
                                        {formatDuration(song.duration || 0)}
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.playButton}
                                    onPress={() => handlePlaySong(index)}
                                >
                                    <Play color="#10B981" size={16} fill="#10B981" />
                                </TouchableOpacity>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Spacer for mini player */}
                <View style={{ height: 120 }} />
            </ScrollView>

            {/* Mini Player */}
            {playerState.currentSong && (
                <MusicMiniPlayer navigation={navigation} />
            )}
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
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 10 : 10,
        paddingBottom: 12,
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flex: 1,
    },
    albumHeader: {
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 100 : 80,
        paddingHorizontal: 24,
    },
    albumCover: {
        width: width - 100,
        height: width - 100,
        borderRadius: 12,
        backgroundColor: '#1a1a1a',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 15,
    },
    albumTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: '#fff',
        marginTop: 20,
        textAlign: 'center',
    },
    albumArtist: {
        fontSize: 16,
        color: '#888',
        marginTop: 4,
    },
    albumMeta: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    albumMetaText: {
        fontSize: 13,
        color: '#666',
    },
    actionButtons: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        marginTop: 24,
        marginBottom: 24,
        paddingHorizontal: 24,
    },
    playAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#10B981',
        paddingHorizontal: 32,
        paddingVertical: 14,
        borderRadius: 28,
    },
    playAllText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#000',
    },
    shuffleButton: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingContainer: {
        paddingTop: 40,
        alignItems: 'center',
    },
    trackList: {
        paddingHorizontal: 16,
    },
    trackItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    trackNumber: {
        width: 28,
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
    },
    trackInfo: {
        flex: 1,
        marginLeft: 12,
    },
    trackTitle: {
        fontSize: 15,
        fontWeight: '500',
        color: '#fff',
    },
    trackDuration: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    playButton: {
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
