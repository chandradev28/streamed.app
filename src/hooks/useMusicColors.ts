/**
 * useMusicColors hook
 * Extracts dominant colors from album art and provides them for background styling
 */

import { useState, useEffect } from 'react';
import { getColors, ImageColorsResult } from 'react-native-image-colors';
import { getState, addPlaybackListener, PlaybackState } from '../services/musicPlayerService';

interface MusicColors {
    primary: string;
    secondary: string;
    background: string;
    gradientColors: [string, string, string];
    isLoading: boolean;
}

const DEFAULT_COLORS: MusicColors = {
    primary: '#10B981',
    secondary: '#1a1a2e',
    background: '#0a0a0a',
    gradientColors: ['#1a1a2e', '#0f0f23', '#0a0a0a'],
    isLoading: false,
};

// Cache to avoid re-extracting colors for same image
const colorCache = new Map<string, MusicColors>();

/**
 * Hook to get dynamic colors based on currently playing song's album art
 */
export function useMusicColors(): MusicColors {
    const [colors, setColors] = useState<MusicColors>(DEFAULT_COLORS);
    const [playerState, setPlayerState] = useState<PlaybackState>(getState());

    useEffect(() => {
        const unsubscribe = addPlaybackListener(setPlayerState);
        return unsubscribe;
    }, []);

    useEffect(() => {
        const extractColors = async () => {
            const coverArt = playerState.currentSong?.coverArt;

            console.log('[MusicColors] Current song:', playerState.currentSong?.title);
            console.log('[MusicColors] Cover art URL:', coverArt || 'null');

            // Validate cover art URL - accept http, https, and data URLs
            if (!coverArt || coverArt.trim() === '') {
                console.log('[MusicColors] No cover art, using defaults');
                setColors(DEFAULT_COLORS);
                return;
            }

            // Only proceed if URL is http/https (react-native-image-colors requirement)
            if (!coverArt.startsWith('http://') && !coverArt.startsWith('https://')) {
                console.log('[MusicColors] Invalid URL format (not http/https), using defaults');
                setColors(DEFAULT_COLORS);
                return;
            }

            // Check cache first
            if (colorCache.has(coverArt)) {
                console.log('[MusicColors] Using cached colors');
                setColors(colorCache.get(coverArt)!);
                return;
            }

            setColors(prev => ({ ...prev, isLoading: true }));

            try {
                console.log('[MusicColors] Extracting colors from:', coverArt.substring(0, 80));

                const result = await Promise.race([
                    getColors(coverArt, {
                        fallback: '#1a1a2e',
                        cache: true,
                        key: coverArt,
                    }),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('Color extraction timeout')), 10000) // Increased to 10s
                    )
                ]);

                let primaryColor = '#1a1a2e';
                let secondaryColor = '#16213e';

                if (result.platform === 'android') {
                    const androidResult = result as any;
                    primaryColor = androidResult.dominant || androidResult.vibrant || '#1a1a2e';
                    secondaryColor = androidResult.darkVibrant || androidResult.muted || '#16213e';
                    console.log('[MusicColors] Android colors - Primary:', primaryColor, 'Secondary:', secondaryColor);
                } else if (result.platform === 'ios') {
                    const iosResult = result as any;
                    primaryColor = iosResult.primary || '#1a1a2e';
                    secondaryColor = iosResult.secondary || '#16213e';
                    console.log('[MusicColors] iOS colors - Primary:', primaryColor, 'Secondary:', secondaryColor);
                }

                // Darken the primary color for better contrast
                const darkenedPrimary = darkenColor(primaryColor, 0.3);
                const darkenedSecondary = darkenColor(secondaryColor, 0.5);

                const newColors: MusicColors = {
                    primary: primaryColor,
                    secondary: secondaryColor,
                    background: darkenedSecondary,
                    gradientColors: [darkenedPrimary, darkenedSecondary, '#0a0a0a'],
                    isLoading: false,
                };

                colorCache.set(coverArt, newColors);
                setColors(newColors);
                console.log('[MusicColors] ✓ Colors extracted successfully');
            } catch (error) {
                console.error('[MusicColors] ✗ Error extracting colors:', error);
                setColors(DEFAULT_COLORS);
            }
        };

        extractColors();
    }, [playerState.currentSong?.coverArt]);

    return colors;
}

/**
 * Darken a hex color by a percentage
 */
function darkenColor(hex: string, percent: number): string {
    // Handle non-hex colors
    if (!hex.startsWith('#')) {
        return hex;
    }

    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, Math.floor((num >> 16) * (1 - percent)));
    const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - percent)));
    const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - percent)));

    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export default useMusicColors;
