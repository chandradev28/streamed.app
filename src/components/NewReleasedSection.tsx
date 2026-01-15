import React, { useEffect, useState, useCallback, memo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '../constants/Colors';
import { CARD_SIZES, PADDING } from '../constants/Layout';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { getNowPlayingMovies, getImageUrl, getMediaTitle, getYear } from '../services/tmdb';
import { Movie } from '../types/types';

// Fixed card dimensions from centralized constants
const CARD_WIDTH = CARD_SIZES.newReleased.width;
const CARD_HEIGHT = CARD_SIZES.newReleased.height;
const CARD_GAP = CARD_SIZES.newReleased.gap;

// Memoized card component
const MovieCard = memo(({ movie, onPress }: { movie: Movie; onPress: () => void }) => (
    <TouchableOpacity
        style={styles.card}
        onPress={onPress}
        activeOpacity={0.8}
    >
        <Image
            source={{ uri: getImageUrl(movie.poster_path, 'w342') }}
            style={styles.poster}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
        />
        <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={styles.gradient}
        >
            <Text style={styles.title} numberOfLines={1}>
                {getMediaTitle(movie)}
            </Text>
            <Text style={styles.year}>{getYear(movie.release_date)}</Text>
        </LinearGradient>
    </TouchableOpacity>
));

export const NewReleasedSection = memo(() => {
    const navigation = useNavigation<any>();
    const [movies, setMovies] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMovies = async () => {
            try {
                const response = await getNowPlayingMovies();
                setMovies(response.results.slice(0, 10) as Movie[]);
            } catch (error) {
                // Silent error handling in production
            } finally {
                setLoading(false);
            }
        };

        fetchMovies();
    }, []);

    const handleMoviePress = useCallback((movie: Movie) => {
        navigation.navigate('MovieDetail', {
            id: movie.id,
            mediaType: 'movie',
        });
    }, [navigation]);

    const renderItem = useCallback(({ item }: { item: Movie }) => (
        <MovieCard movie={item} onPress={() => handleMoviePress(item)} />
    ), [handleMoviePress]);

    const keyExtractor = useCallback((item: Movie) => item.id.toString(), []);

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#fff" />
            </View>
        );
    }

    return (
        <FlatList
            horizontal
            data={movies}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            removeClippedSubviews={true}
            maxToRenderPerBatch={5}
            windowSize={5}
            initialNumToRender={3}
            getItemLayout={(_, index) => ({
                length: CARD_WIDTH + 14,
                offset: (CARD_WIDTH + 14) * index,
                index,
            })}
        />
    );
});

const styles = StyleSheet.create({
    loadingContainer: {
        height: CARD_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingBottom: 8,
    },
    card: {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: 16,
        overflow: 'hidden',
        marginRight: 14,
        backgroundColor: '#1a1a1a',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 8,
    },
    poster: {
        width: '100%',
        height: '100%',
    },
    gradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '45%',
        justifyContent: 'flex-end',
        padding: 10,
    },
    title: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 2,
    },
    year: {
        color: '#888',
        fontSize: 11,
    },
});
