import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, StatusBar } from 'react-native';
import { Heart, X } from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getImageUrl } from '../services/tmdb';
import { getFavorites, FavoriteItem, removeFromFavorites } from '../services/favorites';
import { CARD_SIZES, PADDING } from '../constants/Layout';

// Fixed card dimensions from centralized constants
const ITEM_WIDTH = CARD_SIZES.libraryGrid.width;
const ITEM_HEIGHT = CARD_SIZES.libraryGrid.height;
const GAP = CARD_SIZES.libraryGrid.gap;

export const LibraryScreen = () => {
    const navigation = useNavigation<any>();
    const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchFavorites = useCallback(async () => {
        setLoading(true);
        try {
            const items = await getFavorites();
            setFavorites(items);
        } catch (error) {
            // Silent error handling
        } finally {
            setLoading(false);
        }
    }, []);

    // Refresh favorites when screen comes into focus
    useFocusEffect(
        useCallback(() => {
            fetchFavorites();
        }, [fetchFavorites])
    );

    const handleItemPress = (item: FavoriteItem) => {
        navigation.navigate('MovieDetail', {
            id: item.id,
            mediaType: item.mediaType,
        });
    };

    const handleRemoveFavorite = async (item: FavoriteItem) => {
        // Remove from storage
        await removeFromFavorites(item.id, item.mediaType);
        // Update local state immediately
        setFavorites(prev => prev.filter(f => !(f.id === item.id && f.mediaType === item.mediaType)));
    };

    const renderGrid = () => {
        if (favorites.length === 0) {
            return (
                <View style={styles.emptyContainer}>
                    <Heart color="#333" size={64} />
                    <Text style={styles.emptyTitle}>No favorites yet</Text>
                    <Text style={styles.emptySubtitle}>
                        Tap the heart icon on any movie or TV show to add it to your favorites
                    </Text>
                </View>
            );
        }

        const rows = [];
        for (let i = 0; i < favorites.length; i += 2) {
            rows.push(
                <View key={i} style={styles.row}>
                    {favorites.slice(i, i + 2).map((item) => (
                        <View key={`${item.mediaType}-${item.id}`} style={styles.gridItem}>
                            <TouchableOpacity
                                style={styles.card}
                                onPress={() => handleItemPress(item)}
                                activeOpacity={0.8}
                            >
                                <Image
                                    source={{ uri: getImageUrl(item.posterPath, 'w342') }}
                                    style={styles.poster}
                                    resizeMode="cover"
                                />
                                {/* Favorite indicator */}
                                <View style={styles.favoriteIndicator}>
                                    <Heart color="#EF4444" size={14} fill="#EF4444" />
                                </View>
                            </TouchableOpacity>
                            {/* Remove button */}
                            <TouchableOpacity
                                style={styles.removeButton}
                                onPress={() => handleRemoveFavorite(item)}
                                hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                            >
                                <X color="#fff" size={14} />
                            </TouchableOpacity>
                            <Text style={styles.itemTitle} numberOfLines={1}>
                                {item.title}
                            </Text>
                            <Text style={styles.itemSubtitle}>
                                {item.mediaType === 'movie' ? 'Movie' : 'TV Show'} • {item.year || ''}
                            </Text>
                        </View>
                    ))}
                    {/* Add empty placeholder if odd number */}
                    {favorites.slice(i, i + 2).length === 1 && (
                        <View style={styles.gridItem} />
                    )}
                </View>
            );
        }
        return rows;
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />
            <SafeAreaView style={styles.safeArea} edges={['top']}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Favorites</Text>
                        <View style={styles.countBadge}>
                            <Text style={styles.countText}>{favorites.length}</Text>
                        </View>
                    </View>

                    {/* Subtitle */}
                    <Text style={styles.subtitle}>
                        Your favorite movies and TV shows
                    </Text>

                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#fff" />
                        </View>
                    ) : (
                        <View style={styles.grid}>
                            {renderGrid()}
                        </View>
                    )}

                    <View style={{ height: 100 }} />
                </ScrollView>
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
    scrollContent: {
        paddingTop: 10,
        paddingHorizontal: PADDING.horizontal,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    headerTitle: {
        fontSize: 34,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: -0.5,
    },
    countBadge: {
        marginLeft: 12,
        backgroundColor: '#EF4444',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    countText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
    subtitle: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        marginBottom: 24,
    },
    loadingContainer: {
        height: 300,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
        paddingHorizontal: 40,
    },
    emptyTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
        marginTop: 20,
        marginBottom: 10,
    },
    emptySubtitle: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },
    grid: {
        width: '100%',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 24,
        gap: GAP,
    },
    gridItem: {
        width: ITEM_WIDTH,
    },
    card: {
        width: '100%',
        height: ITEM_HEIGHT,
        borderRadius: CARD_SIZES.libraryGrid.borderRadius,
        backgroundColor: '#1a1a1a',
        overflow: 'hidden',
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    poster: {
        width: '100%',
        height: '100%',
    },
    favoriteIndicator: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 12,
        padding: 6,
    },
    removeButton: {
        position: 'absolute',
        top: 8,
        left: 8,
        backgroundColor: 'rgba(0,0,0,0.7)',
        borderRadius: 12,
        padding: 6,
        zIndex: 10,
    },
    itemTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 2,
    },
    itemSubtitle: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        fontWeight: '400',
    },
});
