import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Animated,
    Dimensions,
    ScrollView,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Play, Trash2, Download, AlertCircle, HardDrive } from 'lucide-react-native';
import { StorageService, DownloadBookmark } from '../services/storage';
import { getTorrentByHash, getInstantStreamUrl } from '../services/torbox';

const { width, height } = Dimensions.get('window');

interface DownloadsModalProps {
    visible: boolean;
    mediaType: 'movie' | 'tv';
    mediaId: number;
    mediaTitle: string;
    onClose: () => void;
    navigation: any;
}

export const DownloadsModal: React.FC<DownloadsModalProps> = ({
    visible,
    mediaType,
    mediaId,
    mediaTitle,
    onClose,
    navigation,
}) => {
    const [bookmarks, setBookmarks] = useState<DownloadBookmark[]>([]);
    const [loading, setLoading] = useState(true);
    const [playingId, setPlayingId] = useState<number | null>(null);
    const slideAnim = React.useRef(new Animated.Value(height)).current;

    const loadBookmarks = useCallback(async () => {
        setLoading(true);
        try {
            const downloads = await StorageService.getDownloadsForMedia(mediaType, mediaId);
            setBookmarks(downloads);
        } catch (error) {
            console.error('Error loading downloads:', error);
        } finally {
            setLoading(false);
        }
    }, [mediaType, mediaId]);

    useEffect(() => {
        if (visible) {
            loadBookmarks();
            Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 65,
                friction: 11,
            }).start();
        } else {
            Animated.timing(slideAnim, {
                toValue: height,
                duration: 200,
                useNativeDriver: true,
            }).start();
        }
    }, [visible, loadBookmarks]);

    const handleRemove = async (torrentId: number) => {
        Alert.alert(
            'Remove from Downloads',
            'This will remove from your downloads list only. The torrent will remain in your TorBox library.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        await StorageService.removeDownloadBookmark(mediaType, mediaId, torrentId);
                        setBookmarks(prev => prev.filter(b => b.torrentId !== torrentId));
                    },
                },
            ]
        );
    };

    const handlePlay = async (bookmark: DownloadBookmark) => {
        setPlayingId(bookmark.torrentId);
        try {
            // Navigate to video player with skipHistory flag
            navigation.navigate('VideoPlayer', {
                title: bookmark.torrentName,
                videoUrl: null, // Will be resolved lazily
                torrentHash: bookmark.torrentHash,
                torrentId: bookmark.torrentId,
                provider: 'torbox',
                skipHistory: true, // Don't add to watch history
            });
            onClose();
        } catch (error: any) {
            console.error('Error playing:', error);
            Alert.alert('Error', 'Failed to play. The torrent may no longer exist in TorBox.');
        } finally {
            setPlayingId(null);
        }
    };

    const formatSize = (bytes: number): string => {
        if (!bytes) return 'Unknown';
        const gb = bytes / (1024 * 1024 * 1024);
        if (gb >= 1) return `${gb.toFixed(2)} GB`;
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(0)} MB`;
    };

    const formatDate = (timestamp: number): string => {
        const date = new Date(timestamp);
        return date.toLocaleDateString();
    };

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <BlurView intensity={20} style={styles.backdrop}>
                    <TouchableWithoutFeedback>
                        <Animated.View
                            style={[
                                styles.modalContainer,
                                { transform: [{ translateY: slideAnim }] },
                            ]}
                        >
                            <LinearGradient
                                colors={['#1a1a2e', '#16213e', '#0f0f23']}
                                style={styles.modalGradient}
                            >
                                {/* Header */}
                                <View style={styles.header}>
                                    <View style={styles.headerLeft}>
                                        <Download color="#F59E0B" size={24} />
                                        <Text style={styles.headerTitle}>Downloads</Text>
                                    </View>
                                    <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                                        <X color="#fff" size={24} />
                                    </TouchableOpacity>
                                </View>

                                <Text style={styles.mediaTitle} numberOfLines={1}>
                                    {mediaTitle}
                                </Text>

                                {/* Content */}
                                <ScrollView
                                    style={styles.content}
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={styles.contentContainer}
                                >
                                    {loading ? (
                                        <View style={styles.loadingContainer}>
                                            <ActivityIndicator size="large" color="#F59E0B" />
                                            <Text style={styles.loadingText}>Loading downloads...</Text>
                                        </View>
                                    ) : bookmarks.length === 0 ? (
                                        <View style={styles.emptyContainer}>
                                            <HardDrive color="#666" size={48} />
                                            <Text style={styles.emptyTitle}>No Downloads</Text>
                                            <Text style={styles.emptyText}>
                                                Torrents you add while watching will appear here for quick access.
                                            </Text>
                                        </View>
                                    ) : (
                                        bookmarks.map((bookmark) => (
                                            <View key={bookmark.torrentId} style={styles.bookmarkCard}>
                                                <View style={styles.bookmarkInfo}>
                                                    <Text style={styles.bookmarkName} numberOfLines={2}>
                                                        {bookmark.torrentName}
                                                    </Text>
                                                    <View style={styles.bookmarkMeta}>
                                                        <Text style={styles.bookmarkSize}>
                                                            {formatSize(bookmark.size)}
                                                        </Text>
                                                        {bookmark.quality && (
                                                            <View style={styles.qualityBadge}>
                                                                <Text style={styles.qualityText}>
                                                                    {bookmark.quality}
                                                                </Text>
                                                            </View>
                                                        )}
                                                        <Text style={styles.bookmarkDate}>
                                                            Added {formatDate(bookmark.addedAt)}
                                                        </Text>
                                                    </View>
                                                </View>

                                                <View style={styles.bookmarkActions}>
                                                    <TouchableOpacity
                                                        style={styles.playButton}
                                                        onPress={() => handlePlay(bookmark)}
                                                        disabled={playingId === bookmark.torrentId}
                                                    >
                                                        {playingId === bookmark.torrentId ? (
                                                            <ActivityIndicator size="small" color="#fff" />
                                                        ) : (
                                                            <Play color="#fff" size={18} fill="#fff" />
                                                        )}
                                                    </TouchableOpacity>

                                                    <TouchableOpacity
                                                        style={styles.removeButton}
                                                        onPress={() => handleRemove(bookmark.torrentId)}
                                                    >
                                                        <Trash2 color="#EF4444" size={18} />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ))
                                    )}
                                </ScrollView>

                                {/* Footer hint */}
                                {bookmarks.length > 0 && (
                                    <View style={styles.footer}>
                                        <AlertCircle color="#666" size={14} />
                                        <Text style={styles.footerText}>
                                            Removing only removes from this list, not from TorBox
                                        </Text>
                                    </View>
                                )}
                            </LinearGradient>
                        </Animated.View>
                    </TouchableWithoutFeedback>
                </BlurView>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContainer: {
        maxHeight: height * 0.75,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
    },
    modalGradient: {
        paddingTop: 20,
        paddingBottom: 30,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 8,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerTitle: {
        fontSize: 20,
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
    mediaTitle: {
        fontSize: 14,
        color: '#888',
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    content: {
        maxHeight: height * 0.5,
    },
    contentContainer: {
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    loadingContainer: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    loadingText: {
        color: '#888',
        marginTop: 12,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        marginTop: 16,
    },
    emptyText: {
        fontSize: 14,
        color: '#888',
        textAlign: 'center',
        marginTop: 8,
        paddingHorizontal: 20,
    },
    bookmarkCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
    },
    bookmarkInfo: {
        flex: 1,
        marginRight: 12,
    },
    bookmarkName: {
        fontSize: 14,
        fontWeight: '500',
        color: '#fff',
        marginBottom: 6,
    },
    bookmarkMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
    },
    bookmarkSize: {
        fontSize: 12,
        color: '#888',
    },
    qualityBadge: {
        backgroundColor: 'rgba(245, 158, 11, 0.2)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    qualityText: {
        fontSize: 10,
        color: '#F59E0B',
        fontWeight: '600',
    },
    bookmarkDate: {
        fontSize: 11,
        color: '#666',
    },
    bookmarkActions: {
        flexDirection: 'row',
        gap: 8,
    },
    playButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#10B981',
        justifyContent: 'center',
        alignItems: 'center',
    },
    removeButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 20,
        marginTop: 8,
    },
    footerText: {
        fontSize: 12,
        color: '#666',
    },
});

export default DownloadsModal;
