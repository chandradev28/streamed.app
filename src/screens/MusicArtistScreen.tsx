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
import {
    ChevronLeft,
    Play,
    Disc3,
    Music2,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { MusicMiniPlayer } from '../components/MusicMiniPlayer';
import {
    getArtist,
    getArtistTopTracks,
    HiFiArtist,
    HiFiArtistDetails,
    HiFiAlbum,
    HiFiSong,
    MusicArtist,
} from '../services/hifi';
import {
    getState,
    addPlaybackListener,
    PlaybackState,
    playQueue,
    playSong,
} from '../services/musicPlayerService';
import { useMusicColors } from '../hooks/useMusicColors';

const { width } = Dimensions.get('window');

interface MusicArtistScreenProps {
    navigation: any;
    route: any;
}

export const MusicArtistScreen = ({ navigation, route }: MusicArtistScreenProps) => {
    const artist: HiFiArtist | MusicArtist = route.params?.artist;
    const source = (artist as any)?.source || 'hifi';
    const artistName = (artist as any)?.name || 'Unknown Artist';
    const musicColors = useMusicColors();
    const [artistDetails, setArtistDetails] = useState<HiFiArtistDetails | null>(null);
    const [topTracks, setTopTracks] = useState<HiFiSong[]>([]);
    const [loading, setLoading] = useState(true);
    const [playerState, setPlayerState] = useState<PlaybackState>(getState());

    useEffect(() => {
        loadArtistDetails();
        const unsubscribe = addPlaybackListener(setPlayerState);
        return unsubscribe;
    }, []);

    const loadArtistDetails = async () => {
        if (!artist?.id) return;
        setLoading(true);
        try {
            // Get artist details (for HiFi albums)
            if (source === 'hifi') {
                const details = await getArtist(artist.id);
                setArtistDetails(details);
            }

            // Get top tracks (for TIDAL)
            const tracks = await getArtistTopTracks(artist.id, artistName, source);
            if (tracks) {
                setTopTracks(tracks);
            }
        } catch (error) {
            console.error('Error loading artist:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAlbumPress = (album: HiFiAlbum) => {
        navigation.navigate('MusicAlbum', { album });
    };

    const handlePlayTrack = async (index: number) => {
        if (topTracks.length === 0) return;
        const clickedTrack = topTracks[index];
        // For TIDAL/Qobuz: play ONLY the clicked track to avoid mismatch issues
        if (clickedTrack.source === 'tidal' || clickedTrack.source === 'qobuz') {
            console.log('[Artist] Playing single track:', clickedTrack.title, 'ID:', clickedTrack.id);
            await playSong(clickedTrack);
        } else {
            await playQueue(topTracks, index);
        }
    };

    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${String(secs).padStart(2, '0')}`;
    };

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={playerState.currentSong ? musicColors.gradientColors : ['#16213e', '#0a0a0a', '#0a0a0a']}
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
                {/* Artist Header */}
                <View style={styles.artistHeader}>
                    <View style={styles.artistAvatar}>
                        {((artist as any)?.coverArt || (artist as any)?.picture) ? (
                            <Image
                                source={{ uri: (artist as any).coverArt || (artist as any).picture }}
                                style={styles.artistImage}
                                contentFit="cover"
                            />
                        ) : (
                            <Music2 color="#666" size={64} />
                        )}
                    </View>
                    <Text style={styles.artistName}>
                        {artist?.name || 'Unknown Artist'}
                    </Text>
                    <Text style={styles.artistMeta}>
                        {topTracks.length > 0 ? `${topTracks.length} top tracks` :
                            `${(artist as any)?.albumCount || artistDetails?.album?.length || 0} albums`}
                    </Text>
                </View>

                {/* Top Tracks Section - for TIDAL */}
                {topTracks.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Top Tracks</Text>
                        {topTracks.map((track: HiFiSong, index: number) => (
                            <TouchableOpacity
                                key={track.id}
                                style={styles.trackRow}
                                onPress={() => handlePlayTrack(index)}
                            >
                                {track.coverArt && (
                                    <Image
                                        source={{ uri: track.coverArt }}
                                        style={styles.trackCoverSmall}
                                        contentFit="cover"
                                    />
                                )}
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={styles.trackTitleText} numberOfLines={1}>
                                        {track.title}
                                    </Text>
                                    <Text style={styles.trackSubtext} numberOfLines={1}>
                                        {track.album}
                                    </Text>
                                </View>
                                <Text style={styles.trackDurationText}>
                                    {formatDuration(track.duration || 0)}
                                </Text>
                                <Play color="#10B981" size={20} fill="#10B981" />
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Albums Section - for HiFi */}
                {source === 'hifi' && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Albums</Text>

                        {loading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#10B981" />
                            </View>
                        ) : artistDetails?.album && artistDetails.album.length > 0 ? (
                            <View style={styles.albumGrid}>
                                {artistDetails.album.map((album) => (
                                    <TouchableOpacity
                                        key={album.id}
                                        style={styles.albumCard}
                                        onPress={() => handleAlbumPress(album)}
                                    >
                                        <Image
                                            source={{ uri: album.coverArt || undefined }}
                                            style={styles.albumCover}
                                            contentFit="cover"
                                        />
                                        <Text style={styles.albumTitle} numberOfLines={1}>
                                            {album.name}
                                        </Text>
                                        {album.year && (
                                            <Text style={styles.albumYear}>{album.year}</Text>
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ) : (
                            <View style={styles.emptyContainer}>
                                <Disc3 color="#333" size={48} />
                                <Text style={styles.emptyText}>No albums found</Text>
                            </View>
                        )}
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
    artistHeader: {
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 100 : 80,
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    artistAvatar: {
        width: 180,
        height: 180,
        borderRadius: 90,
        backgroundColor: '#1a1a1a',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 15,
    },
    artistImage: {
        width: '100%',
        height: '100%',
    },
    artistName: {
        fontSize: 28,
        fontWeight: '700',
        color: '#fff',
        marginTop: 20,
        textAlign: 'center',
    },
    artistMeta: {
        fontSize: 14,
        color: '#888',
        marginTop: 4,
    },
    section: {
        paddingHorizontal: 16,
        marginTop: 16,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 16,
    },
    loadingContainer: {
        paddingTop: 40,
        alignItems: 'center',
    },
    albumGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    albumCard: {
        width: (width - 48) / 2,
        marginBottom: 20,
    },
    albumCover: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: 10,
        backgroundColor: '#1a1a1a',
    },
    albumTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
        marginTop: 8,
    },
    albumYear: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 40,
    },
    emptyText: {
        color: '#666',
        marginTop: 12,
        fontSize: 14,
    },
    trackRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    trackCoverSmall: {
        width: 48,
        height: 48,
        borderRadius: 6,
        backgroundColor: '#1a1a1a',
    },
    trackTitleText: {
        fontSize: 15,
        fontWeight: '500',
        color: '#fff',
    },
    trackSubtext: {
        fontSize: 13,
        color: '#888',
        marginTop: 2,
    },
    trackDurationText: {
        fontSize: 12,
        color: '#666',
        marginRight: 12,
    },
});
