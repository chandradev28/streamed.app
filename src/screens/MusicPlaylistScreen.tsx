import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    ChevronLeft,
    Play,
    Shuffle,
    ListMusic,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { MusicMiniPlayer } from '../components/MusicMiniPlayer';
import {
    getPlaylistTracks,
    MusicPlaylist,
    MusicTrack,
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

interface MusicPlaylistScreenProps {
    navigation: any;
    route: any;
}

export const MusicPlaylistScreen = ({ navigation, route }: MusicPlaylistScreenProps) => {
    const playlist: MusicPlaylist = route.params?.playlist;
    const musicColors = useMusicColors();
    const [tracks, setTracks] = useState<MusicTrack[]>([]);
    const [loading, setLoading] = useState(true);
    const [playerState, setPlayerState] = useState<PlaybackState>(getState());

    useEffect(() => {
        loadPlaylistTracks();
        const unsubscribe = addPlaybackListener(setPlayerState);
        return unsubscribe;
    }, []);

    const loadPlaylistTracks = async () => {
        if (!playlist?.id) return;
        setLoading(true);
        try {
            // Pass source and playlist name to getPlaylistTracks
            const source = playlist.source === 'qobuz' ? 'qobuz' : 'tidal';
            const playlistTracks = await getPlaylistTracks(playlist.id, source, playlist.name);
            setTracks(playlistTracks);
        } catch (error) {
            console.error('Error loading playlist:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePlayAll = async () => {
        if (tracks.length === 0) return;
        // Convert MusicTrack to HiFiSong format for playQueue
        const songs = tracks.map(t => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            artistId: t.artistId,
            album: t.album,
            albumId: t.albumId,
            duration: t.duration,
            coverArt: t.coverArt || undefined,
            source: t.source,
            size: 0,
            suffix: 'flac',
            contentType: 'audio/flac',
        }));
        await playQueue(songs, 0);
    };

    const handleShufflePlay = async () => {
        if (tracks.length === 0) return;
        const shuffled = [...tracks].sort(() => Math.random() - 0.5);
        const songs = shuffled.map(t => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            artistId: t.artistId,
            album: t.album,
            albumId: t.albumId,
            duration: t.duration,
            coverArt: t.coverArt || undefined,
            source: t.source,
            size: 0,
            suffix: 'flac',
            contentType: 'audio/flac',
        }));
        await playQueue(songs, 0);
    };

    const handlePlaySong = async (index: number) => {
        if (tracks.length === 0) return;
        const clickedTrack = tracks[index];
        const trackSource = clickedTrack.source;
        // For TIDAL/Qobuz: play ONLY the clicked track to avoid mismatch issues
        if (trackSource === 'tidal' || trackSource === 'qobuz') {
            console.log('[Playlist] Playing single track:', clickedTrack.title, 'ID:', clickedTrack.id);
            await playSong({
                id: clickedTrack.id,
                title: clickedTrack.title,
                artist: clickedTrack.artist,
                artistId: clickedTrack.artistId,
                album: clickedTrack.album,
                albumId: clickedTrack.albumId,
                duration: clickedTrack.duration,
                coverArt: clickedTrack.coverArt || undefined,
                source: clickedTrack.source,
                size: 0,
                suffix: 'flac',
                contentType: 'audio/flac',
            });
        } else {
            const songs = tracks.map(t => ({
                id: t.id,
                title: t.title,
                artist: t.artist,
                artistId: t.artistId,
                album: t.album,
                albumId: t.albumId,
                duration: t.duration,
                coverArt: t.coverArt || undefined,
                source: t.source,
                size: 0,
                suffix: 'flac',
                contentType: 'audio/flac',
            }));
            await playQueue(songs, index);
        }
    };

    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${String(secs).padStart(2, '0')}`;
    };

    const totalDuration = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);

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
                {/* Playlist Header - Horizontal layout */}
                <View style={styles.playlistHeader}>
                    <View style={styles.playlistHeaderContent}>
                        {playlist?.coverArt ? (
                            <Image
                                source={{ uri: playlist.coverArt }}
                                style={styles.playlistCover}
                                contentFit="cover"
                            />
                        ) : (
                            <View style={[styles.playlistCover, styles.playlistCoverPlaceholder]}>
                                <ListMusic color="#555" size={40} />
                            </View>
                        )}
                        <View style={styles.playlistInfo}>
                            <Text style={styles.playlistTitle} numberOfLines={2}>
                                {playlist?.name || 'Unknown Playlist'}
                            </Text>
                            <View style={styles.playlistMeta}>
                                <Text style={styles.playlistMetaText}>
                                    {tracks.length > 0 ? `${tracks.length} songs` : `${playlist?.trackCount || 0} tracks`}
                                    {tracks.length > 0 && ` • ${Math.floor(totalDuration / 60)} min`}
                                </Text>
                            </View>
                        </View>
                    </View>
                    {playlist?.description && (
                        <Text style={styles.playlistDescription} numberOfLines={2}>
                            {playlist.description}
                        </Text>
                    )}
                </View>

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                    <TouchableOpacity
                        style={styles.playAllButton}
                        onPress={handlePlayAll}
                    >
                        <Play color="#000" size={20} fill="#000" />
                        <Text style={styles.playAllText}>Play All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.shuffleButton}
                        onPress={handleShufflePlay}
                    >
                        <Shuffle color="#fff" size={20} />
                    </TouchableOpacity>
                </View>

                {/* Track List */}
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#A78BFA" />
                        <Text style={styles.loadingText}>Loading playlist...</Text>
                    </View>
                ) : (
                    <View style={styles.trackList}>
                        {tracks.map((track, index) => (
                            <TouchableOpacity
                                key={`${track.id}-${index}`}
                                style={styles.trackItem}
                                onPress={() => handlePlaySong(index)}
                            >
                                <Image
                                    source={{ uri: track.coverArt || undefined }}
                                    style={styles.trackCover}
                                    contentFit="cover"
                                />
                                <View style={styles.trackInfo}>
                                    <Text style={styles.trackTitle} numberOfLines={1}>
                                        {track.title}
                                    </Text>
                                    <Text style={styles.trackArtist} numberOfLines={1}>
                                        {track.artist}
                                    </Text>
                                </View>
                                <Text style={styles.trackDuration}>
                                    {formatDuration(track.duration || 0)}
                                </Text>
                            </TouchableOpacity>
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
    playlistHeader: {
        paddingHorizontal: 16,
        paddingTop: 0,
        paddingBottom: 16,
    },
    playlistHeaderContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    playlistCover: {
        width: 120,
        height: 120,
        borderRadius: 8,
    },
    playlistCoverPlaceholder: {
        backgroundColor: '#1f1f1f',
        justifyContent: 'center',
        alignItems: 'center',
    },
    playlistInfo: {
        flex: 1,
        marginLeft: 16,
    },
    playlistTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
    },
    playlistDescription: {
        fontSize: 12,
        color: '#888',
        marginTop: 12,
        lineHeight: 16,
    },
    playlistMeta: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    playlistMetaText: {
        fontSize: 13,
        color: '#A78BFA',
    },
    actionButtons: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        paddingHorizontal: 24,
        marginBottom: 24,
    },
    playAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#A78BFA',
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 30,
    },
    playAllText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#000',
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
        padding: 40,
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        color: '#888',
    },
    trackList: {
        paddingHorizontal: 16,
    },
    trackItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderRadius: 8,
    },
    trackCover: {
        width: 48,
        height: 48,
        borderRadius: 6,
        backgroundColor: '#1f1f1f',
    },
    trackInfo: {
        flex: 1,
        marginLeft: 12,
    },
    trackTitle: {
        fontSize: 15,
        fontWeight: '500',
        color: '#fff',
        marginBottom: 4,
    },
    trackArtist: {
        fontSize: 13,
        color: '#888',
    },
    trackDuration: {
        fontSize: 13,
        color: '#666',
        marginLeft: 12,
    },
});

export default MusicPlaylistScreen;
