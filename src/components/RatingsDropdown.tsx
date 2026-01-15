import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Dimensions,
    Platform,
} from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { MDBListRatings, formatVotes } from '../services/mdblist';
import { OMDBRatings } from '../services/omdb';

const { width } = Dimensions.get('window');

interface RatingsDropdownProps {
    mdbRatings: MDBListRatings | null;
    omdbRatings: OMDBRatings | null;
    tmdbRating?: number;  // Fallback TMDB rating from details
    tmdbVotes?: number;   // Fallback TMDB votes from details
}

interface RatingItem {
    source: string;
    label: string;
    score: string;
    votes?: string;
    color: string;
    bgColor: string;
}

export const RatingsDropdown: React.FC<RatingsDropdownProps> = ({
    mdbRatings,
    omdbRatings,
    tmdbRating,
    tmdbVotes,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const animatedHeight = useRef(new Animated.Value(0)).current;
    const rotateAnim = useRef(new Animated.Value(0)).current;

    // Build ratings list from available sources
    const buildRatingsList = (): RatingItem[] => {
        const items: RatingItem[] = [];

        // IMDb - prefer OMDB (direct), fallback to MDBList
        const imdb = omdbRatings?.imdb || mdbRatings?.imdb;
        if (imdb?.score) {
            items.push({
                source: 'imdb',
                label: 'IMDb',
                score: imdb.score.toFixed(1),
                votes: imdb.votes ? formatVotes(imdb.votes) : undefined,
                color: '#000',
                bgColor: '#F5C518',
            });
        }

        // TMDB - prefer MDBList, fallback to props
        const tmdb = mdbRatings?.tmdb;
        if (tmdb?.score) {
            items.push({
                source: 'tmdb',
                label: 'TMDB',
                score: tmdb.score.toFixed(1),
                votes: tmdb.votes ? formatVotes(tmdb.votes) : undefined,
                color: '#000',
                bgColor: '#01D277',
            });
        } else if (tmdbRating && tmdbRating > 0) {
            items.push({
                source: 'tmdb',
                label: 'TMDB',
                score: tmdbRating.toFixed(1),
                votes: tmdbVotes ? formatVotes(tmdbVotes) : undefined,
                color: '#000',
                bgColor: '#01D277',
            });
        }

        // Rotten Tomatoes - prefer OMDB, fallback to MDBList
        const rt = omdbRatings?.rottenTomatoes || mdbRatings?.rottentomatoes;
        if (rt?.score) {
            const isFresh = rt.score >= 60;
            items.push({
                source: 'rt',
                label: '🍅 RT',
                score: `${rt.score}%`,
                votes: undefined,
                color: '#fff',
                bgColor: isFresh ? '#FA320A' : '#0AC855',
            });
        }

        // Metacritic - prefer OMDB, fallback to MDBList
        const mc = omdbRatings?.metacritic || mdbRatings?.metacritic;
        if (mc?.score) {
            let bgColor = '#6c3';  // Green for 61+
            if (mc.score < 40) bgColor = '#f00';  // Red for 0-39
            else if (mc.score < 61) bgColor = '#fc3';  // Yellow for 40-60

            items.push({
                source: 'metacritic',
                label: 'MC',
                score: mc.score.toString(),
                votes: undefined,
                color: '#fff',
                bgColor,
            });
        }

        // Trakt (from MDBList only)
        if (mdbRatings?.trakt?.score) {
            items.push({
                source: 'trakt',
                label: 'Trakt',
                score: mdbRatings.trakt.score.toFixed(1),
                votes: mdbRatings.trakt.votes ? formatVotes(mdbRatings.trakt.votes) : undefined,
                color: '#000',
                bgColor: '#ED1C24',
            });
        }

        // Letterboxd (from MDBList only)
        if (mdbRatings?.letterboxd?.score) {
            items.push({
                source: 'letterboxd',
                label: 'LB',
                score: mdbRatings.letterboxd.score.toFixed(1),
                votes: mdbRatings.letterboxd.votes ? formatVotes(mdbRatings.letterboxd.votes) : undefined,
                color: '#fff',
                bgColor: '#00E054',
            });
        }

        return items;
    };

    const ratings = buildRatingsList();
    const primaryRating = ratings[0]; // First rating is the primary one to show

    // Calculate dropdown height based on number of ratings
    const dropdownHeight = Math.min(ratings.length, 6) * 44 + 16;

    useEffect(() => {
        Animated.parallel([
            Animated.spring(animatedHeight, {
                toValue: isExpanded ? dropdownHeight : 0,
                useNativeDriver: false,
                tension: 100,
                friction: 12,
            }),
            Animated.spring(rotateAnim, {
                toValue: isExpanded ? 1 : 0,
                useNativeDriver: true,
                tension: 100,
                friction: 12,
            }),
        ]).start();
    }, [isExpanded]);

    const rotation = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
    });

    if (!primaryRating) {
        return null; // No ratings available
    }

    return (
        <View style={styles.container}>
            {/* Primary Rating Button */}
            <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => setIsExpanded(!isExpanded)}
                activeOpacity={0.8}
            >
                <View style={[styles.sourceTag, { backgroundColor: primaryRating.bgColor }]}>
                    <Text style={[styles.sourceLabel, { color: primaryRating.color }]}>
                        {primaryRating.label}
                    </Text>
                </View>
                <Text style={styles.primaryScore}>{primaryRating.score}</Text>
                {primaryRating.votes && (
                    <Text style={styles.primaryVotes}>{primaryRating.votes}</Text>
                )}
                {ratings.length > 1 && (
                    <Animated.View style={{ transform: [{ rotate: rotation }] }}>
                        <ChevronDown size={16} color="rgba(255,255,255,0.7)" />
                    </Animated.View>
                )}
            </TouchableOpacity>

            {/* Dropdown List */}
            <Animated.View style={[styles.dropdown, { height: animatedHeight }]}>
                {ratings.slice(1).map((rating, index) => (
                    <View key={rating.source} style={styles.dropdownItem}>
                        <View style={[styles.sourceTag, { backgroundColor: rating.bgColor }]}>
                            <Text style={[styles.sourceLabel, { color: rating.color }]}>
                                {rating.label}
                            </Text>
                        </View>
                        <Text style={styles.dropdownScore}>{rating.score}</Text>
                        {rating.votes && (
                            <Text style={styles.dropdownVotes}>{rating.votes}</Text>
                        )}
                    </View>
                ))}
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 14,
        marginTop: 4,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignSelf: 'flex-start',
    },
    sourceTag: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    sourceLabel: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    primaryScore: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    primaryVotes: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
        marginLeft: -2,
    },
    dropdown: {
        overflow: 'hidden',
        marginTop: 8,
        backgroundColor: 'rgba(30,30,30,0.95)',
        borderRadius: 12,
        paddingHorizontal: 8,
    },
    dropdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 4,
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    dropdownScore: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    dropdownVotes: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
    },
});
