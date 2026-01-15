import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ScrollView,
    Dimensions,
} from 'react-native';
import { X, Play, Trash2 } from 'lucide-react-native';
import { Image } from 'expo-image';
import {
    getState,
    playQueue,
    stop,
    addPlaybackListener,
    PlaybackState,
} from '../services/musicPlayerService';
const { height } = Dimensions.get('window');

interface MusicQueueModalProps {
    visible: boolean;
    onClose: () => void;
}

export const MusicQueueModal = ({
    visible,
    onClose,
}: MusicQueueModalProps) => {
    const [state, setState] = React.useState<PlaybackState>(getState());

    React.useEffect(() => {
        const unsubscribe = addPlaybackListener(setState);
        return unsubscribe;
    }, []);

    const handlePlayTrack = async (index: number) => {
        // Play from a specific index in the queue
        const queue = state.queue || [];
        if (index >= 0 && index < queue.length) {
            await playQueue(queue, index);
        }
    };

    const handleClearQueue = async () => {
        await stop();
        onClose();
    };

    const queue = state.queue || [];
    const currentIndex = state.currentIndex || 0;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                <View style={styles.content}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>
                            Queue ({queue.length} tracks)
                        </Text>
                        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                            <X color="#fff" size={24} />
                        </TouchableOpacity>
                    </View>

                    {/* Queue List */}
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {queue.length === 0 ? (
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyText}>Queue is empty</Text>
                            </View>
                        ) : (
                            <>
                                {/* Now Playing */}
                                {state.currentSong && (
                                    <View style={styles.sectionContainer}>
                                        <Text style={styles.sectionTitle}>NOW PLAYING</Text>
                                        <View style={[styles.trackItem, styles.nowPlaying]}>
                                            <View style={styles.playingIndicator}>
                                                <Play color="#10B981" size={12} fill="#10B981" />
                                            </View>
                                            <Image
                                                source={{ uri: state.currentSong.coverArt || undefined }}
                                                style={styles.trackCover}
                                                contentFit="cover"
                                            />
                                            <View style={styles.trackInfo}>
                                                <Text style={styles.trackTitle} numberOfLines={1}>
                                                    {state.currentSong.title}
                                                </Text>
                                                <Text style={styles.trackArtist} numberOfLines={1}>
                                                    {state.currentSong.artist}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                )}

                                {/* Up Next */}
                                {queue.length > currentIndex + 1 && (
                                    <View style={styles.sectionContainer}>
                                        <Text style={styles.sectionTitle}>UP NEXT</Text>
                                        {queue.slice(currentIndex + 1).map((song, i) => {
                                            const actualIndex = currentIndex + 1 + i;
                                            return (
                                                <TouchableOpacity
                                                    key={`${song.id}-${actualIndex}`}
                                                    style={styles.trackItem}
                                                    onPress={() => handlePlayTrack(actualIndex)}
                                                >
                                                    <Text style={styles.trackNumber}>{i + 1}</Text>
                                                    <Image
                                                        source={{ uri: song.coverArt || undefined }}
                                                        style={styles.trackCover}
                                                        contentFit="cover"
                                                    />
                                                    <View style={styles.trackInfo}>
                                                        <Text style={styles.trackTitle} numberOfLines={1}>
                                                            {song.title}
                                                        </Text>
                                                        <Text style={styles.trackArtist} numberOfLines={1}>
                                                            {song.artist}
                                                        </Text>
                                                    </View>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}
                            </>
                        )}
                    </ScrollView>

                    {/* Clear Queue Button */}
                    {queue.length > 0 && (
                        <TouchableOpacity
                            style={styles.clearButton}
                            onPress={handleClearQueue}
                        >
                            <Trash2 color="#EF4444" size={18} />
                            <Text style={styles.clearButtonText}>Clear Queue</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.9)',
    },
    content: {
        flex: 1,
        marginTop: 60,
        backgroundColor: '#0a0a0a',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    closeButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 100,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 60,
    },
    emptyText: {
        color: '#666',
        fontSize: 16,
    },
    sectionContainer: {
        paddingTop: 16,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: '#666',
        paddingHorizontal: 20,
        marginBottom: 8,
        letterSpacing: 0.5,
    },
    trackItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    nowPlaying: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderColor: 'rgba(16, 185, 129, 0.2)',
    },
    playingIndicator: {
        width: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    trackNumber: {
        width: 24,
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
    },
    trackCover: {
        width: 44,
        height: 44,
        borderRadius: 6,
        backgroundColor: '#1a1a1a',
        marginLeft: 8,
    },
    trackInfo: {
        flex: 1,
        marginLeft: 12,
    },
    trackTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
    trackArtist: {
        fontSize: 13,
        color: '#888',
        marginTop: 2,
    },
    removeButton: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    clearButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 16,
        marginHorizontal: 20,
        marginBottom: 40,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.2)',
    },
    clearButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#EF4444',
    },
});
