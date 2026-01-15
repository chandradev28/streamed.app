import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Platform,
    StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Download, Clock } from 'lucide-react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';

const { width, height } = Dimensions.get('window');

interface ComingSoonScreenProps {
    navigation: any;
    route: any;
}

export const ComingSoonScreen = ({ navigation, route }: ComingSoonScreenProps) => {
    const feature = route.params?.feature || 'Download';

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Background Gradient */}
            <LinearGradient
                colors={['#1a1a2e', '#16213e', '#0f0f23']}
                style={styles.gradient}
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

            {/* Content */}
            <View style={styles.content}>
                {/* Icon */}
                <View style={styles.iconContainer}>
                    <LinearGradient
                        colors={['#EAB308', '#F59E0B']}
                        style={styles.iconGradient}
                    >
                        <Download color="#000" size={48} />
                    </LinearGradient>
                </View>

                {/* Title */}
                <Text style={styles.title}>Coming Soon</Text>

                {/* Subtitle */}
                <Text style={styles.subtitle}>
                    The {feature} feature is under development
                </Text>

                {/* Description */}
                <View style={styles.descriptionBox}>
                    <Clock color="#888" size={20} />
                    <Text style={styles.descriptionText}>
                        We're working hard to bring you this feature. Stay tuned for updates!
                    </Text>
                </View>

                {/* Back Button */}
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.actionButtonText}>Go Back</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    gradient: {
        ...StyleSheet.absoluteFillObject,
    },
    headerWrapper: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        backgroundColor: 'transparent',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 10 : 10,
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    iconContainer: {
        marginBottom: 32,
    },
    iconGradient: {
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#EAB308',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 10,
    },
    title: {
        fontSize: 32,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 12,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        marginBottom: 32,
    },
    descriptionBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        borderRadius: 16,
        paddingHorizontal: 20,
        paddingVertical: 16,
        gap: 12,
        marginBottom: 40,
    },
    descriptionText: {
        flex: 1,
        fontSize: 14,
        color: '#888',
        lineHeight: 20,
    },
    actionButton: {
        backgroundColor: '#fff',
        paddingHorizontal: 40,
        paddingVertical: 14,
        borderRadius: 25,
    },
    actionButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#000',
    },
});
