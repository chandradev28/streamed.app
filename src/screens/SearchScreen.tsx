import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    ScrollView,
    Image,
    Platform,
    TouchableOpacity,
    ActivityIndicator,
    Animated,
    Keyboard,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { CARD_SIZES, PADDING } from '../constants/Layout';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { Search, X, Film, Tv, SlidersHorizontal } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { searchMulti, getImageUrl } from '../services/tmdb';

// Fixed card dimensions from centralized constants
const ITEM_WIDTH = CARD_SIZES.searchGrid.width;
const ITEM_HEIGHT = CARD_SIZES.searchGrid.height;
const GAP = CARD_SIZES.searchGrid.gap;

type FilterType = 'all' | 'movie' | 'tv';

// Search result from TMDB API
interface SearchResult {
    id: number;
    poster_path: string | null;
    backdrop_path: string | null;
    overview: string;
    vote_average: number;
    vote_count: number;
    popularity: number;
    genre_ids: number[];
    original_language: string;
    adult: boolean;
    media_type: 'movie' | 'tv' | 'person';
    // Movie-specific
    title?: string;
    original_title?: string;
    release_date?: string;
    video?: boolean;
    // TV-specific
    name?: string;
    original_name?: string;
    first_air_date?: string;
    origin_country?: string[];
}

export const SearchScreen = () => {
    const navigation = useNavigation<any>();
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');

    // Animation refs
    const fadeAnims = useRef<Animated.Value[]>([]).current;
    const searchInputRef = useRef<TextInput>(null);

    // Debounced search
    useEffect(() => {
        if (!searchQuery.trim()) {
            setResults([]);
            setHasSearched(false);
            return;
        }

        const timeoutId = setTimeout(() => {
            performSearch(searchQuery);
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    const performSearch = async (query: string) => {
        if (!query.trim()) return;

        setLoading(true);
        setHasSearched(true);

        try {
            const response = await searchMulti(query);
            // Filter out person results, keep only movies and TV shows
            const mediaResults = response.results.filter(
                (item: any) => item.media_type === 'movie' || item.media_type === 'tv'
            ) as SearchResult[];

            setResults(mediaResults);

            // Initialize fade animations for each result
            fadeAnims.length = 0;
            mediaResults.forEach(() => {
                fadeAnims.push(new Animated.Value(0));
            });

            // Animate results appearing with stagger
            Animated.stagger(
                50,
                fadeAnims.map((anim) =>
                    Animated.spring(anim, {
                        toValue: 1,
                        friction: 8,
                        tension: 40,
                        useNativeDriver: true,
                    })
                )
            ).start();
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleClear = () => {
        setSearchQuery('');
        setResults([]);
        setHasSearched(false);
        searchInputRef.current?.focus();
    };

    const handleItemPress = (item: SearchResult) => {
        Keyboard.dismiss();
        navigation.navigate('MovieDetail', {
            id: item.id,
            mediaType: item.media_type,
        });
    };

    // Filter results based on active filter
    const filteredResults = results.filter((item) => {
        if (activeFilter === 'all') return true;
        return item.media_type === activeFilter;
    });

    const getMediaTypeLabel = (item: SearchResult): string => {
        return item.media_type === 'movie' ? 'Movie' : 'TV Series';
    };

    // Get title from search result
    const getTitle = (item: SearchResult): string => {
        return item.title || item.name || 'Unknown';
    };

    const renderEmptyState = () => (
        <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
                <Search color="#444" size={48} />
            </View>
            <Text style={styles.emptyTitle}>Search Movies & TV Shows</Text>
            <Text style={styles.emptySubtitle}>
                Find your favorite movies and series.{'\n'}
                Both will appear if they share the same name.
            </Text>
        </View>
    );

    const renderNoResults = () => (
        <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No results found</Text>
            <Text style={styles.emptySubtitle}>
                Try a different search term or adjust your filters.
            </Text>
        </View>
    );

    const renderResults = () => {
        const rows = [];
        for (let i = 0; i < filteredResults.length; i += 2) {
            const rowItems = filteredResults.slice(i, i + 2);
            rows.push(
                <View key={i} style={styles.row}>
                    {rowItems.map((item, idx) => {
                        const fadeAnim = fadeAnims[i + idx] || new Animated.Value(1);
                        return (
                            <Animated.View
                                key={`${item.id}-${item.media_type}`}
                                style={[
                                    styles.resultCard,
                                    {
                                        opacity: fadeAnim,
                                        transform: [
                                            {
                                                scale: fadeAnim.interpolate({
                                                    inputRange: [0, 1],
                                                    outputRange: [0.9, 1],
                                                }),
                                            },
                                        ],
                                    },
                                ]}
                            >
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={() => handleItemPress(item)}
                                    style={styles.cardTouchable}
                                >
                                    <Image
                                        source={{ uri: getImageUrl(item.poster_path, 'w342') }}
                                        style={styles.cardImage}
                                        resizeMode="cover"
                                    />
                                    <LinearGradient
                                        colors={['transparent', 'rgba(0,0,0,0.9)']}
                                        style={styles.cardGradient}
                                    >
                                        <View style={[
                                            styles.mediaTypeBadge,
                                            item.media_type === 'movie' ? styles.movieBadge : styles.tvBadge
                                        ]}>
                                            {item.media_type === 'movie' ? (
                                                <Film color="#fff" size={10} />
                                            ) : (
                                                <Tv color="#fff" size={10} />
                                            )}
                                            <Text style={styles.badgeText}>
                                                {getMediaTypeLabel(item)}
                                            </Text>
                                        </View>
                                        <Text style={styles.cardTitle} numberOfLines={2}>
                                            {getTitle(item)}
                                        </Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </Animated.View>
                        );
                    })}
                    {rowItems.length === 1 && <View style={styles.emptyCard} />}
                </View>
            );
        }
        return <View style={styles.resultsGrid}>{rows}</View>;
    };

    return (
        <View style={styles.container}>
            {/* Background Gradient */}
            <LinearGradient
                colors={['rgba(99, 102, 241, 0.1)', 'transparent']}
                style={styles.flare}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
            />

            <ScreenWrapper style={styles.screenWrapper}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Header */}
                    <Text style={styles.headerTitle}>Search</Text>

                    {/* Search Bar */}
                    <View style={styles.searchBarContainer}>
                        <View style={styles.searchBar}>
                            <Search color="#888" size={20} />
                            <TextInput
                                ref={searchInputRef}
                                style={styles.searchInput}
                                placeholder="Search movies, TV series..."
                                placeholderTextColor="#666"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoCapitalize="none"
                                autoCorrect={false}
                                returnKeyType="search"
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
                                    <X color="#888" size={18} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {/* Filter Pills */}
                    {hasSearched && (
                        <View style={styles.filterContainer}>
                            <TouchableOpacity
                                style={[
                                    styles.filterPill,
                                    activeFilter === 'all' && styles.filterPillActive
                                ]}
                                onPress={() => setActiveFilter('all')}
                            >
                                <SlidersHorizontal
                                    color={activeFilter === 'all' ? '#000' : '#888'}
                                    size={14}
                                />
                                <Text style={[
                                    styles.filterText,
                                    activeFilter === 'all' && styles.filterTextActive
                                ]}>
                                    All
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.filterPill,
                                    activeFilter === 'movie' && styles.filterPillActive
                                ]}
                                onPress={() => setActiveFilter('movie')}
                            >
                                <Film
                                    color={activeFilter === 'movie' ? '#000' : '#888'}
                                    size={14}
                                />
                                <Text style={[
                                    styles.filterText,
                                    activeFilter === 'movie' && styles.filterTextActive
                                ]}>
                                    Movies
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.filterPill,
                                    activeFilter === 'tv' && styles.filterPillActive
                                ]}
                                onPress={() => setActiveFilter('tv')}
                            >
                                <Tv
                                    color={activeFilter === 'tv' ? '#000' : '#888'}
                                    size={14}
                                />
                                <Text style={[
                                    styles.filterText,
                                    activeFilter === 'tv' && styles.filterTextActive
                                ]}>
                                    TV Series
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Results Count */}
                    {hasSearched && !loading && filteredResults.length > 0 && (
                        <Text style={styles.resultsCount}>
                            {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''} found
                        </Text>
                    )}

                    {/* Content */}
                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#fff" />
                            <Text style={styles.loadingText}>Searching...</Text>
                        </View>
                    ) : !hasSearched ? (
                        renderEmptyState()
                    ) : filteredResults.length === 0 ? (
                        renderNoResults()
                    ) : (
                        renderResults()
                    )}

                    {/* Bottom Spacer */}
                    <View style={{ height: 100 }} />
                </ScrollView>
            </ScreenWrapper>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    flare: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '30%',
    },
    screenWrapper: {
        backgroundColor: 'transparent',
    },
    scrollContent: {
        paddingTop: 20,
        paddingHorizontal: PADDING.horizontal,
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 20,
        fontFamily: Platform.OS === 'ios' ? 'San Francisco' : 'sans-serif',
    },
    searchBarContainer: {
        marginBottom: 16,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 52,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#fff',
        marginLeft: 12,
        paddingVertical: 0,
    },
    clearButton: {
        padding: 6,
    },
    filterContainer: {
        flexDirection: 'row',
        marginBottom: 20,
        gap: 10,
    },
    filterPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.08)',
        gap: 6,
    },
    filterPillActive: {
        backgroundColor: '#fff',
    },
    filterText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#888',
    },
    filterTextActive: {
        color: '#000',
    },
    resultsCount: {
        fontSize: 14,
        color: '#888',
        marginBottom: 16,
    },
    loadingContainer: {
        height: 300,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#888',
        marginTop: 12,
        fontSize: 14,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
        paddingHorizontal: 40,
    },
    emptyIconContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 12,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        lineHeight: 22,
    },
    resultsGrid: {
        width: '100%',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    resultCard: {
        width: ITEM_WIDTH,
        height: ITEM_HEIGHT,
        borderRadius: CARD_SIZES.searchGrid.borderRadius,
        overflow: 'hidden',
        backgroundColor: '#1a1a1a',
    },
    emptyCard: {
        width: ITEM_WIDTH,
    },
    cardTouchable: {
        flex: 1,
    },
    cardImage: {
        width: '100%',
        height: '100%',
    },
    cardGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '50%',
        justifyContent: 'flex-end',
        padding: 10,
    },
    mediaTypeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        marginBottom: 8,
        gap: 4,
    },
    movieBadge: {
        backgroundColor: 'rgba(239, 68, 68, 0.9)',
    },
    tvBadge: {
        backgroundColor: 'rgba(59, 130, 246, 0.9)',
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#fff',
        textTransform: 'uppercase',
    },
    cardTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
        lineHeight: 18,
    },
});
