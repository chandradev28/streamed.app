import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Play, Pause, SkipForward, X } from 'lucide-react-native';
import { Image } from 'expo-image';
import {
    getState,
    togglePlayPause,
    skipNext,
    stop,
    addPlaybackListener,
    PlaybackState,
} from '../services/musicPlayerService';

const { width } = Dimensions.get('window');

interface MusicMiniPlayerProps {
    navigation: any;
}

export const MusicMiniPlayer = ({ navigation }: MusicMiniPlayerProps) => {
    const [state, setState] = React.useState<PlaybackState>(getState());

    React.useEffect(() => {
        const unsubscribe = addPlaybackListener(setState);
        return unsubscribe;
    }, []);

    if (!state.currentSong) {
        return null;
    }

    const song = state.currentSong;
    const progress = state.durationMs > 0 ? state.positionMs / state.durationMs : 0;

    const handlePress = () => {
        navigation.navigate('MusicPlayer');
    };

    const handlePlayPause = async () => {
        await togglePlayPause();
    };

    const handleSkipNext = async () => {
        await skipNext();
    };

    const handleClose = async () => {
        await stop();
    };

    return (
        <View style={styles.container}>
            <BlurView intensity={80} tint="dark" style={styles.blur}>
                <LinearGradient
                    colors={['rgba(30,30,30,0.95)', 'rgba(20,20,20,0.98)']}
                    style={styles.gradient}
                >
                    {/* Progress bar at top */}
                    <View style={styles.progressContainer}>
                        <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
                    </View>

                    <TouchableOpacity
                        style={styles.content}
                        onPress={handlePress}
                        activeOpacity={0.9}
                    >
                        {/* Album cover */}
                        <Image
                            source={{
                                uri: song.coverArt || undefined
                            }}
                            style={styles.cover}
                            contentFit="cover"
                        />

                        {/* Track info */}
                        <View style={styles.info}>
                            <Text style={styles.title} numberOfLines={1}>
                                {song.title}
                            </Text>
                            <Text style={styles.artist} numberOfLines={1}>
                                {song.artist}
                            </Text>
                        </View>

                        {/* Controls */}
                        <View style={styles.controls}>
                            <TouchableOpacity
                                style={styles.controlButton}
                                onPress={handlePlayPause}
                            >
                                {state.isPlaying ? (
                                    <Pause color="#fff" size={22} fill="#fff" />
                                ) : (
                                    <Play color="#fff" size={22} fill="#fff" />
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.controlButton}
                                onPress={handleSkipNext}
                            >
                                <SkipForward color="#fff" size={20} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.closeButton}
                                onPress={handleClose}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <X color="#666" size={16} />
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </LinearGradient>
            </BlurView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 12,
        paddingBottom: 24,
    },
    blur: {
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    gradient: {
        paddingTop: 0,
    },
    progressContainer: {
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#10B981',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
    },
    cover: {
        width: 48,
        height: 48,
        borderRadius: 8,
        backgroundColor: '#1a1a1a',
    },
    info: {
        flex: 1,
        marginLeft: 12,
    },
    title: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
    artist: {
        fontSize: 13,
        color: '#888',
        marginTop: 2,
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    controlButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeButton: {
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 4,
    },
});
