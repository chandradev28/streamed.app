/**
 * Layout Constants for Mobile App
 * 
 * This file defines fixed dimensions for all UI components.
 * These values are optimized for mobile screens and should NOT change
 * to ensure consistent layout every time the app is opened.
 */

// Screen padding
export const PADDING = {
    horizontal: 20,
    vertical: 16,
};

// Fixed card dimensions for different sections
export const CARD_SIZES = {
    // Home Screen - Top Trending Carousel
    trendingCarousel: {
        width: 160,
        height: 240,
        gap: 16,
        borderRadius: 16,
    },

    // Home Screen - Continue Watching (full width card)
    continueWatching: {
        height: 180,
        horizontalPadding: 40,
        borderRadius: 16,
    },

    // Home Screen - New Released Section
    newReleased: {
        width: 150,
        height: 225,
        gap: 14,
        borderRadius: 16,
    },

    // Playlist Screen - Large swipeable cards
    playlist: {
        width: 280,
        height: 380,
        gap: 16,
        borderRadius: 20,
    },

    // Search Screen - Grid cards (2 columns)
    searchGrid: {
        width: 165,
        height: 231, // width * 1.4
        gap: 12,
        borderRadius: 12,
    },

    // Library Screen - Grid cards (2 columns)
    libraryGrid: {
        width: 165,
        height: 248, // width * 1.5
        gap: 16,
        borderRadius: 16,
    },
};

// Typography
export const TYPOGRAPHY = {
    title: {
        fontSize: 24,
        fontWeight: '700' as const,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600' as const,
    },
    cardTitle: {
        fontSize: 14,
        fontWeight: '600' as const,
    },
    cardSubtitle: {
        fontSize: 12,
        fontWeight: '400' as const,
    },
};

// Common spacing values
export const SPACING = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
};
