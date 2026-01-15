import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Switch,
    Animated,
    Easing,
    SafeAreaView,
    StatusBar,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Zap, Database, Check, X, Sparkles } from 'lucide-react-native';
import { StorageService } from '../services/storage';
import { testZileanConnection } from '../services/zilean';

// Spark particle component for DMM mode animation
const SparkParticle = ({ delay, startX, startY }: { delay: number; startX: number; startY: number }) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateX = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const angle = Math.random() * Math.PI * 2;
        const distance = 30 + Math.random() * 40;

        Animated.sequence([
            Animated.delay(delay),
            Animated.parallel([
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 100,
                    useNativeDriver: true,
                }),
                Animated.timing(scale, {
                    toValue: 1,
                    duration: 100,
                    useNativeDriver: true,
                }),
            ]),
            Animated.parallel([
                Animated.timing(translateX, {
                    toValue: Math.cos(angle) * distance,
                    duration: 400,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(translateY, {
                    toValue: Math.sin(angle) * distance,
                    duration: 400,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 0,
                    duration: 400,
                    useNativeDriver: true,
                }),
                Animated.timing(scale, {
                    toValue: 0.3,
                    duration: 400,
                    useNativeDriver: true,
                }),
            ]),
        ]).start();
    }, []);

    return (
        <Animated.View
            style={[
                styles.sparkParticle,
                {
                    left: startX,
                    top: startY,
                    opacity,
                    transform: [{ translateX }, { translateY }, { scale }],
                },
            ]}
        />
    );
};

interface ZileanScreenProps {
    navigation: any;
}

export const ZileanScreen = ({ navigation }: ZileanScreenProps) => {
    const [zileanEnabled, setZileanEnabled] = useState(false);
    const [dmmMode, setDmmMode] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; latency: number; error?: string } | null>(null);
    const [showSparks, setShowSparks] = useState(false);

    // Animation values
    const dmmGlowAnim = useRef(new Animated.Value(0)).current;
    const dmmScaleAnim = useRef(new Animated.Value(1)).current;
    const dmmBorderAnim = useRef(new Animated.Value(0)).current;

    // Load settings on mount
    useEffect(() => {
        loadSettings();
    }, []);

    // DMM mode glow animation
    useEffect(() => {
        if (dmmMode) {
            // Start pulsing glow animation
            Animated.loop(
                Animated.sequence([
                    Animated.timing(dmmGlowAnim, {
                        toValue: 1,
                        duration: 1500,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: false,
                    }),
                    Animated.timing(dmmGlowAnim, {
                        toValue: 0.4,
                        duration: 1500,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: false,
                    }),
                ])
            ).start();

            // Border glow animation
            Animated.timing(dmmBorderAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: false,
            }).start();
        } else {
            dmmGlowAnim.stopAnimation();
            dmmGlowAnim.setValue(0);

            Animated.timing(dmmBorderAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: false,
            }).start();
        }
    }, [dmmMode]);

    const loadSettings = async () => {
        const enabled = await StorageService.getZileanEnabled();
        const dmm = await StorageService.getZileanDmmMode();
        setZileanEnabled(enabled);
        setDmmMode(dmm);
    };

    const handleZileanToggle = async (enabled: boolean) => {
        setZileanEnabled(enabled);
        await StorageService.setZileanEnabled(enabled);

        // If disabling Zilean, also disable DMM mode
        if (!enabled && dmmMode) {
            setDmmMode(false);
            await StorageService.setZileanDmmMode(false);
        }
    };

    const handleDmmToggle = async (enabled: boolean) => {
        // Show spark animation when enabling
        if (enabled) {
            setShowSparks(true);
            setTimeout(() => setShowSparks(false), 600);

            // Scale bounce animation
            Animated.sequence([
                Animated.spring(dmmScaleAnim, {
                    toValue: 1.03,
                    friction: 3,
                    tension: 200,
                    useNativeDriver: true,
                }),
                Animated.spring(dmmScaleAnim, {
                    toValue: 1,
                    friction: 4,
                    useNativeDriver: true,
                }),
            ]).start();
        }

        setDmmMode(enabled);
        await StorageService.setZileanDmmMode(enabled);

        // If enabling DMM mode, also enable Zilean
        if (enabled && !zileanEnabled) {
            setZileanEnabled(true);
            await StorageService.setZileanEnabled(true);
        }
    };

    const handleTestConnection = async () => {
        setTesting(true);
        setTestResult(null);
        const result = await testZileanConnection();
        setTestResult(result);
        setTesting(false);
    };

    const glowColor = dmmGlowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(139, 92, 246, 0)', 'rgba(139, 92, 246, 0.4)'],
    });

    const borderColor = dmmBorderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(255, 255, 255, 0.08)', 'rgba(139, 92, 246, 0.8)'],
    });

    // Generate spark particles
    const sparks = showSparks ? Array.from({ length: 12 }).map((_, i) => (
        <SparkParticle
            key={i}
            delay={i * 30}
            startX={150}
            startY={30}
        />
    )) : null;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />
            <LinearGradient
                colors={['#0a0a0a', '#121212', '#0a0a0a']}
                style={styles.background}
            />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <ArrowLeft color="#fff" size={24} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Zilean</Text>
                <View style={styles.placeholder} />
            </View>

            {/* Content */}
            <View style={styles.content}>
                {/* Info Section */}
                <View style={styles.infoCard}>
                    <View style={styles.infoHeader}>
                        <Database color="#8B5CF6" size={24} />
                        <Text style={styles.infoTitle}>What is Zilean?</Text>
                    </View>
                    <Text style={styles.infoText}>
                        Zilean indexes pre-cached torrents from DebridMediaManager users.
                        These torrents are already cached on debrid services, ensuring instant streaming with no wait time.
                    </Text>
                </View>

                {/* Zilean Toggle */}
                <View style={styles.optionCard}>
                    <View style={styles.optionContent}>
                        <View style={styles.optionIcon}>
                            <Zap color="#10B981" size={22} />
                        </View>
                        <View style={styles.optionText}>
                            <Text style={styles.optionTitle}>Enable Zilean</Text>
                            <Text style={styles.optionDescription}>
                                Show Zilean results alongside your addons or indexer
                            </Text>
                        </View>
                    </View>
                    <Switch
                        value={zileanEnabled}
                        onValueChange={handleZileanToggle}
                        trackColor={{ false: '#333', true: '#10B981' }}
                        thumbColor={zileanEnabled ? '#fff' : '#888'}
                    />
                </View>

                {/* DMM Mode Toggle with Glow Animation */}
                <Animated.View
                    style={[
                        styles.dmmCard,
                        {
                            transform: [{ scale: dmmScaleAnim }],
                            borderColor: borderColor,
                            shadowColor: '#8B5CF6',
                            shadowOpacity: dmmMode ? 0.5 : 0,
                            shadowRadius: 20,
                            elevation: dmmMode ? 10 : 0,
                        },
                    ]}
                >
                    {/* Glow overlay */}
                    {dmmMode && (
                        <Animated.View
                            style={[
                                styles.glowOverlay,
                                { backgroundColor: glowColor },
                            ]}
                        />
                    )}

                    {/* Spark particles */}
                    {sparks}

                    <View style={styles.optionContent}>
                        <View style={[styles.optionIcon, styles.dmmIcon]}>
                            <Sparkles color="#8B5CF6" size={22} />
                        </View>
                        <View style={styles.optionText}>
                            <View style={styles.dmmTitleRow}>
                                <Text style={styles.optionTitle}>DMM Mode</Text>
                                {dmmMode && (
                                    <View style={styles.activeBadge}>
                                        <Text style={styles.activeBadgeText}>ACTIVE</Text>
                                    </View>
                                )}
                            </View>
                            <Text style={styles.optionDescription}>
                                Only show Zilean results (skip addons & indexers)
                            </Text>
                        </View>
                    </View>
                    <Switch
                        value={dmmMode}
                        onValueChange={handleDmmToggle}
                        trackColor={{ false: '#333', true: '#8B5CF6' }}
                        thumbColor={dmmMode ? '#fff' : '#888'}
                    />
                </Animated.View>

                {/* Test Connection Button */}
                <TouchableOpacity
                    style={styles.testButton}
                    onPress={handleTestConnection}
                    disabled={testing}
                >
                    {testing ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <>
                            <Text style={styles.testButtonText}>Test Connection</Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* Test Result */}
                {testResult && (
                    <View style={[
                        styles.testResult,
                        testResult.success ? styles.testSuccess : styles.testFailed
                    ]}>
                        {testResult.success ? (
                            <>
                                <Check color="#10B981" size={20} />
                                <Text style={styles.testResultTextSuccess}>
                                    Connected • {testResult.latency}ms
                                </Text>
                            </>
                        ) : (
                            <>
                                <X color="#EF4444" size={20} />
                                <Text style={styles.testResultTextFailed}>
                                    Failed: {testResult.error}
                                </Text>
                            </>
                        )}
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    background: {
        ...StyleSheet.absoluteFillObject,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 0 : 16,
        paddingBottom: 16,
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    placeholder: {
        width: 44,
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 8,
    },
    infoCard: {
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(139, 92, 246, 0.2)',
    },
    infoHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    infoTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        marginLeft: 10,
    },
    infoText: {
        fontSize: 14,
        color: '#999',
        lineHeight: 20,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    dmmCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        borderWidth: 2,
        overflow: 'hidden',
        position: 'relative',
    },
    glowOverlay: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 14,
    },
    optionContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    optionIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    dmmIcon: {
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
    },
    optionText: {
        flex: 1,
    },
    optionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 4,
    },
    optionDescription: {
        fontSize: 13,
        color: '#888',
    },
    dmmTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    activeBadge: {
        backgroundColor: '#8B5CF6',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        marginLeft: 8,
    },
    activeBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#fff',
    },
    testButton: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    testButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
    testResult: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
        padding: 12,
        borderRadius: 12,
    },
    testSuccess: {
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
    },
    testFailed: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
    },
    testResultTextSuccess: {
        color: '#10B981',
        fontSize: 14,
        fontWeight: '500',
        marginLeft: 8,
    },
    testResultTextFailed: {
        color: '#EF4444',
        fontSize: 14,
        fontWeight: '500',
        marginLeft: 8,
    },
    sparkParticle: {
        position: 'absolute',
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#8B5CF6',
    },
});

export default ZileanScreen;
