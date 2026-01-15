import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Platform, ActivityIndicator, StatusBar, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMoviesByProvider, getImageUrl, getMediaTitle } from '../services/tmdb';
import { Movie } from '../types/types';
import { CARD_SIZES, PADDING } from '../constants/Layout';

// Fixed card dimensions from centralized constants
const CARD_WIDTH = CARD_SIZES.playlist.width;
const CARD_HEIGHT = CARD_SIZES.playlist.height;
const SPACING = CARD_SIZES.playlist.gap;

const providers = [
    { id: '8', name: 'Netflix', providerId: 8, color: '#E50914', logo: require('../../assets/ott/netflix.png') },
    { id: '9', name: 'Prime', providerId: 9, color: '#00A8E1', logo: require('../../assets/ott/prime.png') },
    { id: '1899', name: 'HBO', providerId: 1899, color: '#991EEB', logo: require('../../assets/ott/hbo.png') },
    { id: '337', name: 'Disney+', providerId: 337, color: '#113CCF', logo: require('../../assets/ott/disney.png') },
    { id: '350', name: 'Apple TV+', providerId: 350, color: '#555555', logo: require('../../assets/ott/apple.png') },
    { id: '15', name: 'Hulu', providerId: 15, color: '#1CE783', logo: require('../../assets/ott/hulu.png') },
];

export const PlaylistScreen = () => {
    const scrollX = useRef(new Animated.Value(0)).current;
    const scrollViewRef = useRef<ScrollView>(null);
    const navigation = useNavigation<any>();
    const [movies, setMovies] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('Netflix');
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const fetchMovies = async () => {
            setLoading(true);
            setCurrentIndex(0); // Reset to first card when filter changes
            try {
                const provider = providers.find(p => p.name === activeFilter);
                if (provider) {
                    const response = await getMoviesByProvider(provider.providerId);
                    setMovies(response.results.slice(0, 10) as Movie[]);
                }
            } catch (error) {
                // Silent error handling
            } finally {
                setLoading(false);
            }
        };

        fetchMovies();
    }, [activeFilter]);

    const handleMoviePress = (movie: Movie) => {
        navigation.navigate('MovieDetail', {
            id: movie.id,
            mediaType: 'movie',
        });
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
    };

    const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetX = event.nativeEvent.contentOffset.x;
        const index = Math.round(offsetX / (CARD_WIDTH + SPACING));
        setCurrentIndex(Math.max(0, Math.min(index, movies.length - 1)));
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />

            {/* Static Background for the current card */}
            <View style={styles.backgroundContainer}>
                {movies.length > 0 && movies[currentIndex] && (
                    <Image
                        source={{ uri: getImageUrl(movies[currentIndex].poster_path, 'w780') }}
                        style={styles.backgroundImage}
                        blurRadius={Platform.OS === 'ios' ? 50 : 25}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={300}
                    />
                )}
                <LinearGradient
                    colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.95)']}
                    style={styles.backgroundOverlay}
                />
            </View>

            <SafeAreaView style={styles.safeArea} edges={['top']}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Playlist</Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.filterContainer}
                    >
                        {providers.map((provider) => {
                            const isActive = activeFilter === provider.name;
                            return (
                                <TouchableOpacity
                                    key={provider.id}
                                    style={[
                                        styles.providerButton,
                                        isActive && [styles.providerButtonActive, { borderColor: provider.color }]
                                    ]}
                                    onPress={() => setActiveFilter(provider.name)}
                                >
                                    <View style={[styles.providerIconContainer, { backgroundColor: provider.color }]}>
                                        <Image
                                            source={provider.logo}
                                            style={styles.providerLogoImage}
                                            contentFit="contain"
                                        />
                                    </View>
                                    <Text style={[
                                        styles.providerText,
                                        isActive ? styles.providerTextActive : { color: '#888' }
                                    ]}>
                                        {provider.name}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Carousel */}
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#fff" />
                    </View>
                ) : (
                    <View style={styles.carouselContainer}>
                        <Animated.ScrollView
                            ref={scrollViewRef}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            pagingEnabled={false}
                            snapToInterval={CARD_WIDTH + SPACING}
                            snapToAlignment="start"
                            decelerationRate="fast"
                            contentContainerStyle={styles.scrollContent}
                            onScroll={Animated.event(
                                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                                { useNativeDriver: true }
                            )}
                            onMomentumScrollEnd={handleScrollEnd}
                            scrollEventThrottle={16}
                        >
                            {movies.map((movie, index) => {
                                const inputRange = [
                                    (index - 1) * (CARD_WIDTH + SPACING),
                                    index * (CARD_WIDTH + SPACING),
                                    (index + 1) * (CARD_WIDTH + SPACING),
                                ];

                                const scale = scrollX.interpolate({
                                    inputRange,
                                    outputRange: [0.9, 1, 0.9],
                                    extrapolate: 'clamp',
                                });

                                const opacity = scrollX.interpolate({
                                    inputRange,
                                    outputRange: [0.5, 1, 0.5],
                                    extrapolate: 'clamp',
                                });

                                return (
                                    <View
                                        key={movie.id}
                                        style={styles.cardWrapper}
                                    >
                                        <Animated.View style={[
                                            styles.cardContainer,
                                            { transform: [{ scale }], opacity }
                                        ]}>
                                            <TouchableOpacity
                                                activeOpacity={0.95}
                                                onPress={() => handleMoviePress(movie)}
                                                style={styles.cardTouchable}
                                            >
                                                <Image
                                                    source={{ uri: getImageUrl(movie.poster_path, 'w500') }}
                                                    style={styles.posterImage}
                                                    contentFit="cover"
                                                    cachePolicy="memory-disk"
                                                    transition={200}
                                                />
                                                <LinearGradient
                                                    colors={['transparent', 'rgba(0,0,0,0.9)']}
                                                    style={styles.cardGradient}
                                                >
                                                    <Text style={styles.cardTitle} numberOfLines={2}>
                                                        {getMediaTitle(movie).toUpperCase()}
                                                    </Text>
                                                    <Text style={styles.cardDate}>
                                                        {formatDate(movie.release_date)}
                                                    </Text>
                                                </LinearGradient>
                                            </TouchableOpacity>
                                        </Animated.View>
                                    </View>
                                );
                            })}
                        </Animated.ScrollView>
                    </View>
                )}
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    safeArea: {
        flex: 1,
    },
    backgroundContainer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000',
    },
    backgroundImage: {
        width: '100%',
        height: '100%',
        transform: [{ scale: 1.2 }],
    },
    backgroundOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
    header: {
        paddingTop: 10,
        paddingBottom: 16,
    },
    headerTitle: {
        fontSize: 34,
        fontWeight: '800',
        color: '#fff',
        marginLeft: PADDING.horizontal,
        marginBottom: 16,
        letterSpacing: -0.5,
    },
    filterContainer: {
        paddingLeft: PADDING.horizontal,
        paddingRight: PADDING.horizontal,
    },
    providerButton: {
        flexDirection: 'row',
        height: 46,
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 23,
        backgroundColor: 'rgba(40,40,40,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    providerButtonActive: {
        backgroundColor: 'rgba(60,60,60,0.95)',
    },
    providerIconContainer: {
        width: 30,
        height: 30,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
        overflow: 'hidden',
    },
    providerLogoImage: {
        width: 20,
        height: 20,
    },
    providerText: {
        fontSize: 14,
        fontWeight: '600',
    },
    providerTextActive: {
        color: '#fff',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    carouselContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    scrollContent: {
        paddingHorizontal: 50,
        paddingBottom: 100,
        alignItems: 'center',
    },
    cardWrapper: {
        width: CARD_WIDTH + SPACING,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardContainer: {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: CARD_SIZES.playlist.borderRadius,
        overflow: 'hidden',
        backgroundColor: '#1a1a1a',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 15 },
        shadowOpacity: 0.6,
        shadowRadius: 20,
        elevation: 25,
    },
    cardTouchable: {
        flex: 1,
    },
    posterImage: {
        width: '100%',
        height: '100%',
        backgroundColor: '#222',
    },
    cardGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '45%',
        justifyContent: 'flex-end',
        paddingHorizontal: 20,
        paddingBottom: 24,
    },
    cardTitle: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 6,
        letterSpacing: 1.5,
    },
    cardDate: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 1,
    },
});
