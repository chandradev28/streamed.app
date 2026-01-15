import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    ScrollView,
    Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ChevronLeft,
    Server,
    Music2,
    Check,
    Radio,
    Disc3,
} from 'lucide-react-native';
import { StorageService, MusicSourceType } from '../services/storage';
import { stop } from '../services/musicPlayerService';

interface MusicSettingsScreenProps {
    navigation: any;
}

export const MusicSettingsScreen = ({ navigation }: MusicSettingsScreenProps) => {
    const insets = useSafeAreaInsets();
    const [selectedSource, setSelectedSource] = useState<MusicSourceType>('hifi');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadSavedSource();
    }, []);

    const loadSavedSource = async () => {
        const source = await StorageService.getMusicSource();
        setSelectedSource(source);
        setIsLoading(false);
    };

    const handleSourceChange = async (source: MusicSourceType) => {
        if (source === selectedSource) return; // No change

        // Stop current playback and reset player when switching sources
        console.log('[MusicSettings] Switching source from', selectedSource, 'to', source);
        await stop();

        setSelectedSource(source);
        await StorageService.setMusicSource(source);

        Alert.alert(
            'Source Changed',
            `Now using ${source === 'hifi' ? 'HiFi Server' : source === 'tidal' ? 'TIDAL' : 'Qobuz'}. Search results will come from the new source.`,
            [{ text: 'OK' }]
        );
    };

    const sources = [
        {
            id: 'hifi' as MusicSourceType,
            name: 'HiFi Server',
            subtitle: 'Primary • Your Server',
            description: 'FLAC Lossless (16-bit CD Quality)',
            note: '⚠️ No playlists available',
            icon: Server,
            color: '#10B981',
            tag: 'PRIMARY',
        },
        {
            id: 'tidal' as MusicSourceType,
            name: 'TIDAL',
            subtitle: 'Secondary • APIs',
            description: 'LOSSLESS (16-bit CD Quality)',
            note: '✓ Playlists, Albums, Artists',
            icon: Music2,
            color: '#3B82F6',
            tag: 'SECONDARY',
        },
        {
            id: 'qobuz' as MusicSourceType,
            name: 'Qobuz',
            subtitle: 'Hi-Res • APIs',
            description: '24-bit/96kHz Hi-Res FLAC',
            note: '✓ Best Quality • Albums, Artists',
            icon: Disc3,
            color: '#A855F7',
            tag: 'HI-RES',
        },
    ];

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#1a1a2e', '#0f0f23', '#0a0a0a']}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <ChevronLeft color="#fff" size={28} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Music Settings</Text>
                <View style={styles.headerSpacer} />
            </View>

            {/* Content */}
            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.sectionTitle}>Music Source</Text>
                <Text style={styles.sectionSubtitle}>
                    Choose where to stream music from
                </Text>

                {/* Source Options */}
                <View style={styles.optionsContainer}>
                    {sources.map((source) => {
                        const isSelected = selectedSource === source.id;
                        const IconComponent = source.icon;

                        return (
                            <TouchableOpacity
                                key={source.id}
                                style={[
                                    styles.optionCard,
                                    isSelected && styles.optionCardSelected,
                                    isSelected && { borderColor: source.color },
                                ]}
                                onPress={() => handleSourceChange(source.id)}
                                activeOpacity={0.7}
                            >
                                <View style={styles.optionHeader}>
                                    <View style={[styles.iconContainer, { backgroundColor: `${source.color}20` }]}>
                                        <IconComponent color={source.color} size={24} />
                                    </View>
                                    <View style={styles.optionTitleContainer}>
                                        <View style={styles.optionTitleRow}>
                                            <Text style={styles.optionTitle}>{source.name}</Text>
                                            <View style={[styles.tagBadge, { backgroundColor: `${source.color}20` }]}>
                                                <Text style={[styles.tagText, { color: source.color }]}>
                                                    {source.tag}
                                                </Text>
                                            </View>
                                        </View>
                                        <Text style={styles.optionSubtitle}>{source.subtitle}</Text>
                                    </View>
                                    {isSelected && (
                                        <View style={[styles.checkCircle, { backgroundColor: source.color }]}>
                                            <Check color="#fff" size={16} />
                                        </View>
                                    )}
                                </View>

                                <View style={styles.optionDetails}>
                                    <View style={styles.qualityRow}>
                                        <Radio color="#888" size={14} />
                                        <Text style={styles.qualityText}>{source.description}</Text>
                                    </View>
                                    <Text style={[
                                        styles.noteText,
                                        source.id === 'hifi' ? styles.noteWarning : styles.noteSuccess
                                    ]}>
                                        {source.note}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>



                {/* Bottom spacing */}
                <View style={{ height: insets.bottom + 40 }} />
            </ScrollView>
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
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
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
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    headerSpacer: {
        width: 44,
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    sectionTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 8,
    },
    sectionSubtitle: {
        fontSize: 14,
        color: '#888',
        marginBottom: 24,
    },
    optionsContainer: {
        gap: 16,
    },
    optionCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    optionCardSelected: {
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    optionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    optionTitleContainer: {
        flex: 1,
        marginLeft: 12,
    },
    optionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    optionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    tagBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    tagText: {
        fontSize: 10,
        fontWeight: '700',
    },
    optionSubtitle: {
        fontSize: 13,
        color: '#888',
        marginTop: 2,
    },
    checkCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    optionDetails: {
        marginLeft: 60,
    },
    qualityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    qualityText: {
        fontSize: 13,
        color: '#aaa',
    },
    noteText: {
        fontSize: 12,
    },
    noteWarning: {
        color: '#F59E0B',
    },
    noteSuccess: {
        color: '#10B981',
    },
    infoBox: {
        marginTop: 32,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderRadius: 12,
        padding: 16,
        borderLeftWidth: 3,
        borderLeftColor: '#3B82F6',
    },
    infoTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 8,
    },
    infoText: {
        fontSize: 13,
        color: '#aaa',
        lineHeight: 20,
    },
    infoBold: {
        color: '#fff',
        fontWeight: '600',
    },
});
