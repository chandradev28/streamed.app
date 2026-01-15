import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ImageBackground,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    Platform,
    StatusBar,
    ActivityIndicator,
    Alert,
    Image,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Plus, Heart, Download, Star } from 'lucide-react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { MovieTorrentModal } from '../components/MovieTorrentModal';
import { DownloadsModal } from '../components/DownloadsModal';
import {
    getMovieDetails,
    getTVShowDetails,
    getImageUrl,
    getYear,
    getMovieCredits,
    getTVCredits,
    getSimilarMovies,
    getSimilarTVShows,
    getTVExternalIds,
} from '../services/tmdb';
import { MovieDetails, TVShowDetails, CastMember, Movie, TVShow } from '../types/types';
import { Colors } from '../constants/Colors';
import { isFavorite, toggleFavorite } from '../services/favorites';
import { getRatingsByTMDBId, MDBListRatings } from '../services/mdblist';
import { getOMDBRatings, OMDBRatings } from '../services/omdb';
import { RatingsDropdown } from '../components/RatingsDropdown';


const { width, height } = Dimensions.get('window');
const CAST_IMAGE_SIZE = 80; // Bigger cast photos

interface RouteParams {
    id: number;
    mediaType: 'movie' | 'tv';
}

export const MovieDetailScreen = ({ route, navigation }: any) => {
    const { id, mediaType } = route.params as RouteParams;
    const [details, setDetails] = useState<MovieDetails | TVShowDetails | null>(null);
    const [cast, setCast] = useState<CastMember[]>([]);
    const [similarItems, setSimilarItems] = useState<(Movie | TVShow)[]>([]);
    const [loading, setLoading] = useState(true);
    const [showFullDescription, setShowFullDescription] = useState(false);
    const [showTorrentModal, setShowTorrentModal] = useState(false);
    const [showDownloadsModal, setShowDownloadsModal] = useState(false);
    const [isFavorited, setIsFavorited] = useState(false);
    const [mdbRatings, setMdbRatings] = useState<MDBListRatings | null>(null);
    const [omdbRatings, setOmdbRatings] = useState<OMDBRatings | null>(null);

    useEffect(() => {
        const fetchAllDetails = async () => {
            try {
                if (mediaType === 'movie') {
                    // Movies: fetch all data in parallel including ratings from both APIs
                    const [detailsData, creditsData, similarData, mdbRatingsData] = await Promise.all([
                        getMovieDetails(id),
                        getMovieCredits(id),
                        getSimilarMovies(id),
                        getRatingsByTMDBId(id, mediaType).catch(() => null),
                    ]);
                    setDetails(detailsData);
                    setCast(creditsData.cast.slice(0, 10));
                    setSimilarItems(similarData.results.slice(0, 8));
                    setMdbRatings(mdbRatingsData);

                    // Fetch OMDB ratings in parallel (uses direct fetch, no proxy)
                    if (detailsData.imdb_id) {
                        getOMDBRatings(detailsData.imdb_id)
                            .then(omdb => setOmdbRatings(omdb))
                            .catch(() => null);
                    }
                } else {
                    // TV Shows: use TMDB for all data
                    const [tmdbDetails, creditsData, similarData, externalIds] = await Promise.all([
                        getTVShowDetails(id),
                        getTVCredits(id),
                        getSimilarTVShows(id),
                        getTVExternalIds(id).catch(() => null),
                    ]);

                    setDetails(tmdbDetails);
                    setCast(creditsData.cast.slice(0, 10));
                    setSimilarItems(similarData.results.slice(0, 8));

                    // Load ratings async
                    getRatingsByTMDBId(id, mediaType)
                        .then(ratings => setMdbRatings(ratings))
                        .catch(() => null);

                    if (externalIds?.imdb_id) {
                        getOMDBRatings(externalIds.imdb_id)
                            .then(omdb => setOmdbRatings(omdb))
                            .catch(() => null);
                    }
                }

            } catch (error) {
                console.error('Error fetching details:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchAllDetails();
    }, [id, mediaType]);

    // Check if item is favorited
    useEffect(() => {
        const checkFavorite = async () => {
            const favorited = await isFavorite(id, mediaType);
            setIsFavorited(favorited);
        };
        checkFavorite();
    }, [id, mediaType]);

    const handleToggleFavorite = async () => {
        if (!details) return;

        const isMovie = mediaType === 'movie';
        const title = isMovie ? (details as MovieDetails).title : (details as TVShowDetails).name;
        const releaseDate = isMovie ? (details as MovieDetails).release_date : (details as TVShowDetails).first_air_date;

        const newState = await toggleFavorite({
            id: id,
            mediaType: mediaType,
            title: title,
            posterPath: details.poster_path,
            backdropPath: details.backdrop_path,
            rating: details.vote_average,
            year: releaseDate?.split('-')[0],
        });

        setIsFavorited(newState);
    };

    const handleSimilarItemPress = (item: Movie | TVShow) => {
        navigation.push('MovieDetail', {
            id: item.id,
            mediaType: mediaType,
        });
    };

    if (loading || !details) {
        return (
            <View style={[styles.container, styles.loadingContainer]}>
                <StatusBar barStyle="light-content" />
                <ActivityIndicator size="large" color="#fff" />
            </View>
        );
    }

    // Extract data based on media type
    const isMovie = mediaType === 'movie';
    const title = isMovie ? (details as MovieDetails).title : (details as TVShowDetails).name;
    const releaseDate = isMovie ? (details as MovieDetails).release_date : (details as TVShowDetails).first_air_date;
    const runtime = isMovie
        ? (details as MovieDetails).runtime
        : (details as TVShowDetails).episode_run_time?.[0] || 45;
    const genres = details.genres.map(g => g.name).slice(0, 2).join(', ');
    const seasons = !isMovie ? (details as TVShowDetails).seasons : [];

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Full Screen Background */}
            <ImageBackground
                source={{ uri: getImageUrl(details.backdrop_path || details.poster_path, 'original') }}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(10,10,10,0.95)']}
                    style={styles.backgroundGradient}
                />
            </ImageBackground>

            {/* Header - Fixed */}
            <ScreenWrapper style={styles.headerWrapper}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                        <ChevronLeft color="#fff" size={28} />
                    </TouchableOpacity>

                    <View style={styles.actionStack}>
                        <TouchableOpacity style={styles.actionButton}>
                            <Plus color="#fff" size={22} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionButton, isFavorited && styles.actionButtonActive]}
                            onPress={handleToggleFavorite}
                        >
                            <Heart
                                color={isFavorited ? '#EF4444' : '#fff'}
                                size={22}
                                fill={isFavorited ? '#EF4444' : 'transparent'}
                            />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => setShowDownloadsModal(true)}
                        >
                            <Download color="#fff" size={22} />
                        </TouchableOpacity>
                    </View>
                </View>
            </ScreenWrapper>

            {/* Scrollable Content */}
            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Spacer for hero area */}
                <View style={styles.heroSpacer} />

                {/* Glass Card */}
                <View style={styles.glassCardContainer}>
                    <BlurView intensity={40} tint="dark" style={styles.blurView}>
                        <LinearGradient
                            colors={['rgba(40,40,40,0.5)', 'rgba(20,20,20,0.9)']}
                            style={styles.cardGradient}
                        >
                            <View style={styles.cardContent}>
                                {/* Title */}
                                <Text style={styles.movieTitle} numberOfLines={2}>{title}</Text>

                                {/* Genre */}
                                <Text style={styles.genreText}>{genres || 'Drama'}</Text>

                                {/* Ratings Dropdown */}
                                <RatingsDropdown
                                    mdbRatings={mdbRatings}
                                    omdbRatings={omdbRatings}
                                    tmdbRating={details.vote_average}
                                    tmdbVotes={details.vote_count}
                                />

                                {/* Meta Row */}
                                <View style={styles.metaRow}>
                                    <Text style={styles.metaText}>{getYear(releaseDate)}</Text>
                                    <Text style={styles.dot}>•</Text>
                                    <Text style={styles.metaText}>{runtime} min</Text>
                                    {!isMovie && (details as TVShowDetails).number_of_seasons && (
                                        <>
                                            <Text style={styles.dot}>•</Text>
                                            <Text style={styles.metaText}>
                                                {(details as TVShowDetails).number_of_seasons} Seasons
                                            </Text>
                                        </>
                                    )}
                                </View>

                                {/* Description */}
                                <Text
                                    style={styles.description}
                                    numberOfLines={showFullDescription ? undefined : 3}
                                >
                                    {details.overview || 'No description available.'}
                                </Text>
                                {details.overview && details.overview.length > 100 && (
                                    <TouchableOpacity onPress={() => setShowFullDescription(!showFullDescription)}>
                                        <Text style={styles.moreLink}>
                                            {showFullDescription ? 'less' : 'more'}
                                        </Text>
                                    </TouchableOpacity>
                                )}

                                {/* Watch Button */}
                                <TouchableOpacity
                                    style={styles.watchButton}
                                    onPress={() => {
                                        if (!isMovie) {
                                            navigation.navigate('Episodes', {
                                                tvId: id,
                                                seasonNumber: 1,
                                                showName: title,
                                                posterPath: details.poster_path,
                                            });
                                        } else {
                                            // Show torrent modal for movies
                                            setShowTorrentModal(true);
                                        }
                                    }}
                                >
                                    <Text style={styles.watchButtonText}>Watch now</Text>
                                </TouchableOpacity>
                            </View>
                        </LinearGradient>
                    </BlurView>
                </View>

                {/* Seasons Section (TV Shows) */}
                {!isMovie && seasons.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Seasons</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.horizontalScroll}
                        >
                            {seasons.filter(s => s.season_number > 0).map((season) => (
                                <TouchableOpacity
                                    key={season.id}
                                    style={styles.seasonCard}
                                    onPress={() => navigation.navigate('Episodes', {
                                        tvId: id,
                                        seasonNumber: season.season_number,
                                        showName: title,
                                        posterPath: season.poster_path || details.poster_path,
                                    })}
                                >
                                    <Image
                                        source={{ uri: getImageUrl(season.poster_path || details.poster_path, 'w185') }}
                                        style={styles.seasonImage}
                                        resizeMode="cover"
                                    />
                                    <View style={styles.seasonOverlay}>
                                        <Text style={styles.seasonBadge}>{season.name}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Related Movies Section */}
                {similarItems.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Related {isMovie ? 'movies' : 'shows'}</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.horizontalScroll}
                        >
                            {similarItems.map((item) => (
                                <TouchableOpacity
                                    key={item.id}
                                    style={styles.relatedCard}
                                    onPress={() => handleSimilarItemPress(item)}
                                    activeOpacity={0.8}
                                >
                                    <Image
                                        source={{ uri: getImageUrl(item.poster_path, 'w342') }}
                                        style={styles.relatedImage}
                                        resizeMode="cover"
                                    />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Top Cast Section */}
                {cast.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Top cast</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.horizontalScroll}
                        >
                            {cast.map((member) => (
                                <View key={member.id} style={styles.castCard}>
                                    <View style={styles.castImageContainer}>
                                        {member.profile_path ? (
                                            <Image
                                                source={{ uri: getImageUrl(member.profile_path, 'w185') }}
                                                style={styles.castImage}
                                                resizeMode="cover"
                                            />
                                        ) : (
                                            <View style={[styles.castImage, styles.castPlaceholder]}>
                                                <Text style={styles.castPlaceholderText}>
                                                    {member.name.charAt(0)}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.castName} numberOfLines={1}>
                                        {member.name.split(' ')[0]}
                                    </Text>
                                    <Text style={styles.castLastName} numberOfLines={1}>
                                        {member.name.split(' ').slice(1).join(' ')}
                                    </Text>
                                    <Text style={styles.castCharacter} numberOfLines={1}>
                                        {member.character.split('/')[0].split('(')[0].trim()}
                                    </Text>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Bottom spacer */}
                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Movie Torrent Modal */}
            {isMovie && (
                <MovieTorrentModal
                    visible={showTorrentModal}
                    onClose={() => setShowTorrentModal(false)}
                    movieTitle={title}
                    movieId={id}
                    imdbId={(details as MovieDetails).imdb_id}
                    posterPath={details.poster_path}
                    navigation={navigation}
                />
            )}

            {/* Downloads Modal */}
            <DownloadsModal
                visible={showDownloadsModal}
                mediaType={mediaType}
                mediaId={id}
                mediaTitle={title}
                onClose={() => setShowDownloadsModal(false)}
                navigation={navigation}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    loadingContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    backgroundImage: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: height * 0.55,
    },
    backgroundGradient: {
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
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionStack: {
        flexDirection: 'column',
        gap: 10,
    },
    actionButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    actionButtonActive: {
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        borderColor: 'rgba(239, 68, 68, 0.4)',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 20,
    },
    heroSpacer: {
        height: height * 0.32,
    },
    glassCardContainer: {
        marginHorizontal: 16,
        borderRadius: 28,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 15 },
        shadowOpacity: 0.5,
        shadowRadius: 30,
        elevation: 20,
    },
    blurView: {
        overflow: 'hidden',
        borderRadius: 28,
    },
    cardGradient: {
        padding: 24,
    },
    cardContent: {},
    movieTitle: {
        color: '#fff',
        fontSize: 26,
        fontWeight: '700',
        marginBottom: 6,
        fontFamily: Platform.OS === 'ios' ? 'San Francisco' : 'sans-serif',
    },
    genreText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        marginBottom: 10,
        fontWeight: '400',
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
    },
    ratingText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
        marginLeft: 5,
    },
    dot: {
        color: 'rgba(255,255,255,0.4)',
        marginHorizontal: 8,
        fontSize: 12,
    },
    metaText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 13,
    },
    description: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: 14,
        lineHeight: 21,
        marginBottom: 4,
    },
    moreLink: {
        color: '#F5C518',
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 18,
    },
    watchButton: {
        backgroundColor: '#FFFFFF',
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        marginTop: 10,
    },
    watchButtonText: {
        color: '#000',
        fontSize: 15,
        fontWeight: '600',
    },
    section: {
        marginTop: 28,
        marginBottom: 4,
    },
    sectionTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 14,
        paddingHorizontal: 20,
    },
    horizontalScroll: {
        paddingHorizontal: 20,
    },
    seasonCard: {
        width: 160,
        height: 100,
        borderRadius: 14,
        overflow: 'hidden',
        marginRight: 14,
        backgroundColor: '#1a1a1a',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    seasonImage: {
        width: '100%',
        height: '100%',
    },
    seasonOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
        padding: 10,
    },
    seasonBadge: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    relatedCard: {
        width: 140,
        height: 200,
        borderRadius: 14,
        overflow: 'hidden',
        marginRight: 12,
        backgroundColor: '#1a1a1a',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    relatedImage: {
        width: '100%',
        height: '100%',
    },
    castCard: {
        width: 85,
        marginRight: 16,
        alignItems: 'center',
    },
    castImageContainer: {
        width: CAST_IMAGE_SIZE,
        height: CAST_IMAGE_SIZE,
        borderRadius: CAST_IMAGE_SIZE / 2,
        overflow: 'hidden',
        marginBottom: 8,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    castImage: {
        width: '100%',
        height: '100%',
    },
    castPlaceholder: {
        backgroundColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
    },
    castPlaceholderText: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold',
    },
    castName: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '600',
        textAlign: 'center',
    },
    castLastName: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '600',
        textAlign: 'center',
    },
    castCharacter: {
        color: '#888',
        fontSize: 10,
        textAlign: 'center',
        marginTop: 2,
        fontStyle: 'italic',
    },
    // Ratings Section Styles
    ratingsContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 14,
        marginTop: 4,
    },
    ratingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
        gap: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    ratingSource: {
        backgroundColor: '#F5C518', // IMDb yellow
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 4,
    },
    tmdbSource: {
        backgroundColor: '#01D277', // TMDB green
    },
    imdbLogo: {
        fontSize: 10,
        fontWeight: '900',
        color: '#000',
        letterSpacing: -0.5,
    },
    tmdbLogo: {
        fontSize: 9,
        fontWeight: '800',
        color: '#000',
        letterSpacing: 0.3,
    },
    ratingScore: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    ratingVotes: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.5)',
        fontWeight: '500',
    },
});
