import React, { useEffect, useState, useCallback, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '../constants/Colors';
import { CARD_SIZES, PADDING } from '../constants/Layout';
import { ChevronRight } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { getTrending, getImageUrl, getMediaTitle } from '../services/tmdb';
import { MediaItem, isMovie } from '../types/types';

// Fixed card dimensions from centralized constants
const CARD_WIDTH = CARD_SIZES.trendingCarousel.width;
const CARD_HEIGHT = CARD_SIZES.trendingCarousel.height;
const CARD_GAP = CARD_SIZES.trendingCarousel.gap;

// Memoized card component to prevent re-renders
const MovieCard = memo(({ item, onPress }: { item: MediaItem; onPress: () => void }) => (
    <TouchableOpacity
        style={styles.cardContainer}
        onPress={onPress}
        activeOpacity={0.8}
    >
        <View style={styles.card}>
            <Image
                source={{ uri: getImageUrl(item.poster_path, 'w342') }}
                style={styles.image}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
            />
        </View>
        <Text style={styles.movieTitle} numberOfLines={1}>
            {getMediaTitle(item)}
        </Text>
    </TouchableOpacity>
));

export const MovieCarousel = memo(() => {
    const navigation = useNavigation<any>();
    const [movies, setMovies] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMovies = async () => {
            try {
                const response = await getTrending('movie', 'week');
                setMovies(response.results.slice(0, 10)); // Get top 10
            } catch (error) {
                // Silent error handling in production
            } finally {
                setLoading(false);
            }
        };

        fetchMovies();
    }, []);

    const handleMoviePress = useCallback((item: MediaItem) => {
        navigation.navigate('MovieDetail', {
            id: item.id,
            mediaType: isMovie(item) ? 'movie' : 'tv',
        });
    }, [navigation]);

    const renderItem = useCallback(({ item }: { item: MediaItem }) => (
        <MovieCard item={item} onPress={() => handleMoviePress(item)} />
    ), [handleMoviePress]);

    const keyExtractor = useCallback((item: MediaItem) => item.id.toString(), []);

    if (loading) {
        return (
            <View style={[styles.container, styles.loadingContainer]}>
                <ActivityIndicator size="large" color={Colors.dark.tint} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Title Header */}
            <View style={styles.header}>
                <Text style={styles.title}>Top trending movies</Text>
                <ChevronRight color={Colors.dark.text} size={20} />
            </View>

            {/* Horizontal FlatList for better performance */}
            <FlatList
                horizontal
                data={movies}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                decelerationRate="fast"
                snapToInterval={CARD_WIDTH + 16}
                removeClippedSubviews={true}
                maxToRenderPerBatch={5}
                windowSize={5}
                initialNumToRender={3}
                getItemLayout={(_, index) => ({
                    length: CARD_WIDTH + 16,
                    offset: (CARD_WIDTH + 16) * index,
                    index,
                })}
            />
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        marginBottom: 32,
    },
    loadingContainer: {
        height: CARD_HEIGHT + 50,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        marginBottom: 16,
    },
    title: {
        color: Colors.dark.text,
        fontSize: 16,
        fontWeight: '600',
        marginRight: 4,
    },
    scrollContent: {
        paddingLeft: 24,
        paddingRight: 8,
    },
    cardContainer: {
        marginRight: 16,
        width: CARD_WIDTH,
    },
    card: {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: '#1a1a1a',
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 8,
    },
    image: {
        width: '100%',
        height: '100%',
    },
    movieTitle: {
        color: Colors.dark.text,
        fontSize: 12,
        fontWeight: '500',
        marginTop: 8,
        textAlign: 'center',
    },
});
