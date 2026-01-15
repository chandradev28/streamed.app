import React, { useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Animated,
    Dimensions,
    Platform,
    Linking,
    Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Play, ExternalLink, Smartphone, Tv } from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

interface PlayerSelectionModalProps {
    visible: boolean;
    onClose: () => void;
    onSelectInternal: () => void;
    streamUrl: string;
    title: string;
}

export const PlayerSelectionModal: React.FC<PlayerSelectionModalProps> = ({
    visible,
    onClose,
    onSelectInternal,
    streamUrl,
    title,
}) => {
    const scaleAnim = useRef(new Animated.Value(0.8)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            animateIn();
        } else {
            resetState();
        }
    }, [visible]);

    const animateIn = () => {
        Animated.parallel([
            Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 8,
                tension: 65,
                useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start();
    };

    const resetState = () => {
        scaleAnim.setValue(0.8);
        opacityAnim.setValue(0);
    };

    const handleClose = () => {
        Animated.parallel([
            Animated.timing(scaleAnim, {
                toValue: 0.8,
                duration: 150,
                useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }),
        ]).start(() => onClose());
    };

    const handleInternalPlayer = () => {
        handleClose();
        // Small delay to let animation complete
        setTimeout(() => {
            onSelectInternal();
        }, 200);
    };

    const handleExternalVLC = async () => {
        if (!streamUrl) {
            Alert.alert('Error', 'No stream URL available');
            return;
        }

        try {
            // VLC intent URL format
            const vlcUrl = `vlc://${streamUrl}`;

            const supported = await Linking.canOpenURL(vlcUrl);

            if (supported) {
                handleClose();
                await Linking.openURL(vlcUrl);
            } else {
                // Try alternative VLC intent
                const altVlcUrl = `intent:${streamUrl}#Intent;package=org.videolan.vlc;end`;
                const altSupported = await Linking.canOpenURL(altVlcUrl);

                if (altSupported) {
                    handleClose();
                    await Linking.openURL(altVlcUrl);
                } else {
                    Alert.alert(
                        'VLC Not Found',
                        'VLC Media Player is not installed. Would you like to install it from the Play Store?',
                        [
                            { text: 'Cancel', style: 'cancel' },
                            {
                                text: 'Install VLC',
                                onPress: () => {
                                    Linking.openURL('market://details?id=org.videolan.vlc');
                                },
                            },
                        ]
                    );
                }
            }
        } catch (error) {
            console.error('Error opening VLC:', error);
            Alert.alert('Error', 'Failed to open VLC player');
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={handleClose}
        >
            <TouchableWithoutFeedback onPress={handleClose}>
                <View style={styles.overlay}>
                    <TouchableWithoutFeedback>
                        <Animated.View
                            style={[
                                styles.modalContainer,
                                {
                                    opacity: opacityAnim,
                                    transform: [{ scale: scaleAnim }],
                                },
                            ]}
                        >
                            <BlurView intensity={80} tint="dark" style={styles.blurContainer}>
                                <LinearGradient
                                    colors={['rgba(40,40,40,0.95)', 'rgba(20,20,20,0.98)']}
                                    style={styles.gradientOverlay}
                                >
                                    {/* Header */}
                                    <View style={styles.header}>
                                        <View style={styles.headerLeft}>
                                            <Text style={styles.headerLabel}>Select Player</Text>
                                            <Text style={styles.headerTitle} numberOfLines={1}>
                                                {title}
                                            </Text>
                                        </View>
                                        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                                            <X color="#fff" size={20} />
                                        </TouchableOpacity>
                                    </View>

                                    {/* Player Options */}
                                    <View style={styles.optionsContainer}>
                                        {/* Internal Player Option */}
                                        <TouchableOpacity
                                            style={styles.playerOption}
                                            onPress={handleInternalPlayer}
                                            activeOpacity={0.7}
                                        >
                                            <LinearGradient
                                                colors={['#10B981', '#059669']}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                                style={styles.playerOptionGradient}
                                            >
                                                <View style={styles.playerIconContainer}>
                                                    <Smartphone color="#fff" size={32} />
                                                </View>
                                                <View style={styles.playerInfo}>
                                                    <Text style={styles.playerName}>Internal Player</Text>
                                                    <Text style={styles.playerDesc}>
                                                        ExoPlayer • In-app playback
                                                    </Text>
                                                </View>
                                                <Play color="#fff" size={24} fill="#fff" />
                                            </LinearGradient>
                                        </TouchableOpacity>

                                        {/* External VLC Option */}
                                        <TouchableOpacity
                                            style={styles.playerOption}
                                            onPress={handleExternalVLC}
                                            activeOpacity={0.7}
                                        >
                                            <View style={styles.playerOptionOutline}>
                                                <View style={[styles.playerIconContainer, styles.vlcIcon]}>
                                                    <Tv color="#FF6B00" size={32} />
                                                </View>
                                                <View style={styles.playerInfo}>
                                                    <Text style={styles.playerName}>External VLC</Text>
                                                    <Text style={styles.playerDesc}>
                                                        Open in VLC app
                                                    </Text>
                                                </View>
                                                <ExternalLink color="#888" size={22} />
                                            </View>
                                        </TouchableOpacity>
                                    </View>

                                    {/* Hint */}
                                    <Text style={styles.hint}>
                                        Internal player supports most formats. Use VLC for unsupported codecs.
                                    </Text>
                                </LinearGradient>
                            </BlurView>
                        </Animated.View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContainer: {
        width: width - 48,
        maxWidth: 380,
        borderRadius: 24,
        overflow: 'hidden',
    },
    blurContainer: {
        overflow: 'hidden',
        borderRadius: 24,
    },
    gradientOverlay: {
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        borderRadius: 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
    },
    headerLeft: {
        flex: 1,
        marginRight: 16,
    },
    headerLabel: {
        fontSize: 13,
        color: '#888',
        fontWeight: '600',
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    headerTitle: {
        fontSize: 18,
        color: '#fff',
        fontWeight: '700',
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    optionsContainer: {
        gap: 12,
    },
    playerOption: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    playerOptionGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 14,
    },
    playerOptionOutline: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 14,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        borderRadius: 16,
    },
    playerIconContainer: {
        width: 56,
        height: 56,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    vlcIcon: {
        backgroundColor: 'rgba(255, 107, 0, 0.15)',
    },
    playerInfo: {
        flex: 1,
    },
    playerName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 2,
    },
    playerDesc: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
    },
    hint: {
        fontSize: 12,
        color: '#666',
        textAlign: 'center',
        marginTop: 20,
        paddingHorizontal: 10,
    },
});

export default PlayerSelectionModal;
