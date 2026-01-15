import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ScrollView,
    ActivityIndicator,
    Dimensions,
} from 'react-native';
import { X } from 'lucide-react-native';
import { HiFiSong } from '../services/hifi';

const { height } = Dimensions.get('window');

interface MusicLyricsModalProps {
    visible: boolean;
    onClose: () => void;
    song: HiFiSong | null;
    positionMs: number;
}

export const MusicLyricsModal = ({
    visible,
    onClose,
    song,
    positionMs,
}: MusicLyricsModalProps) => {
    const [lyrics, setLyrics] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (visible && song) {
            // Lyrics API not implemented yet - show placeholder
            setError('Lyrics feature coming soon!\nStay tuned for synchronized lyrics.');
        }
    }, [visible, song?.id]);

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
                        <Text style={styles.headerTitle}>Lyrics</Text>
                        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                            <X color="#fff" size={24} />
                        </TouchableOpacity>
                    </View>

                    {/* Lyrics Content */}
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {loading && (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#10B981" />
                                <Text style={styles.loadingText}>Loading lyrics...</Text>
                            </View>
                        )}

                        {error && !loading && (
                            <View style={styles.errorContainer}>
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        )}

                        {lyrics && !loading && (
                            <Text style={styles.lyricsText}>{lyrics}</Text>
                        )}
                    </ScrollView>

                    {/* Track Info */}
                    {song && (
                        <View style={styles.trackInfo}>
                            <Text style={styles.trackTitle} numberOfLines={1}>
                                {song.title}
                            </Text>
                            <Text style={styles.trackArtist} numberOfLines={1}>
                                {song.artist}
                            </Text>
                        </View>
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
        padding: 24,
        paddingBottom: 100,
    },
    loadingContainer: {
        alignItems: 'center',
        paddingTop: 60,
    },
    loadingText: {
        color: '#888',
        marginTop: 12,
    },
    errorContainer: {
        alignItems: 'center',
        paddingTop: 60,
    },
    errorText: {
        color: '#666',
        fontSize: 16,
        textAlign: 'center',
    },
    lyricsText: {
        fontSize: 18,
        lineHeight: 32,
        color: '#fff',
        textAlign: 'center',
    },
    trackInfo: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 16,
        backgroundColor: 'rgba(10,10,10,0.95)',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    trackTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
        textAlign: 'center',
    },
    trackArtist: {
        fontSize: 13,
        color: '#888',
        textAlign: 'center',
        marginTop: 2,
    },
});
