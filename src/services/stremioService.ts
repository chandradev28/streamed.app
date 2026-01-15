/**
 * Stremio Service - Dynamic Addon Management
 * Based on NuvioStreaming's stremioService.ts
 * 
 * This service allows users to install ANY Stremio addon by manifest URL
 * and fetches streams from all installed addons.
 */

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
const INSTALLED_ADDONS_KEY = '@streamed_installed_addons';
const ADDON_ORDER_KEY = '@streamed_addon_order';

// Types
export interface AddonManifest {
    id: string;
    name: string;
    version: string;
    description?: string;
    url: string;  // Base URL (without manifest.json)
    originalUrl: string;  // Full manifest URL as provided by user
    types?: string[];
    catalogs?: Array<{
        type: string;
        id: string;
        name: string;
    }>;
    resources?: Array<{
        name: string;
        types: string[];
        idPrefixes?: string[];
    } | string>;
    idPrefixes?: string[];
    logo?: string;
    background?: string;
    behaviorHints?: {
        configurable?: boolean;
        configurationRequired?: boolean;
    };
}

export interface Stream {
    name?: string;
    title?: string;
    description?: string;
    infoHash?: string;
    url?: string;
    fileIdx?: number;
    sources?: string[];
    behaviorHints?: {
        bingeGroup?: string;
        notWebReady?: boolean;
        filename?: string;
        videoSize?: number;
        cached?: boolean;
    };
    // Added by our service
    addon?: string;
    addonId?: string;
    addonName?: string;
    isDirectUrl?: boolean;
    isCached?: boolean;
}

export interface StreamResponse {
    streams: Stream[];
    addonId: string;
    addonName: string;
    error?: string;
}

class StremioService {
    private static instance: StremioService;
    private installedAddons: Map<string, AddonManifest> = new Map();
    private addonOrder: string[] = [];
    private initialized: boolean = false;
    private initPromise: Promise<void> | null = null;

    private constructor() {
        this.initPromise = this.initialize();
    }

    static getInstance(): StremioService {
        if (!StremioService.instance) {
            StremioService.instance = new StremioService();
        }
        return StremioService.instance;
    }

    private async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            // Load installed addons
            const storedAddons = await AsyncStorage.getItem(INSTALLED_ADDONS_KEY);
            if (storedAddons) {
                const addons = JSON.parse(storedAddons);
                for (const addon of addons) {
                    if (addon && addon.id) {
                        this.installedAddons.set(addon.id, addon);
                    }
                }
            }

            // Load addon order
            const storedOrder = await AsyncStorage.getItem(ADDON_ORDER_KEY);
            if (storedOrder) {
                this.addonOrder = JSON.parse(storedOrder);
                // Filter out any IDs that aren't installed
                this.addonOrder = this.addonOrder.filter(id => this.installedAddons.has(id));
            }

            // Add any missing addons to the order
            const installedIds = Array.from(this.installedAddons.keys());
            const missingIds = installedIds.filter(id => !this.addonOrder.includes(id));
            this.addonOrder = [...this.addonOrder, ...missingIds];

            this.initialized = true;
            console.log('[StremioService] Initialized with', this.installedAddons.size, 'addons');
        } catch (error) {
            console.error('[StremioService] Initialization error:', error);
            this.initialized = true;
        }
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.initialized && this.initPromise) {
            await this.initPromise;
        }
    }

    private async saveInstalledAddons(): Promise<void> {
        try {
            const addonsArray = Array.from(this.installedAddons.values());
            await AsyncStorage.setItem(INSTALLED_ADDONS_KEY, JSON.stringify(addonsArray));
        } catch (error) {
            console.error('[StremioService] Error saving addons:', error);
        }
    }

    private async saveAddonOrder(): Promise<void> {
        try {
            await AsyncStorage.setItem(ADDON_ORDER_KEY, JSON.stringify(this.addonOrder));
        } catch (error) {
            console.error('[StremioService] Error saving addon order:', error);
        }
    }

    /**
     * Parse addon base URL from manifest URL
     * Extracts query params and removes /manifest.json
     */
    private getAddonBaseURL(url: string): { baseUrl: string; queryParams?: string } {
        const [baseUrl, queryString] = url.split('?');
        let cleanBaseUrl = baseUrl.replace(/manifest\.json$/i, '').replace(/\/$/, '');

        if (!cleanBaseUrl.startsWith('http')) {
            cleanBaseUrl = `https://${cleanBaseUrl}`;
        }

        return { baseUrl: cleanBaseUrl, queryParams: queryString };
    }

    /**
     * Fetch and parse addon manifest from URL
     */
    async getManifest(manifestUrl: string): Promise<AddonManifest> {
        try {
            // Validate URL protocol first
            if (!manifestUrl.startsWith('http://') && !manifestUrl.startsWith('https://')) {
                throw new Error('Invalid URL: Must be an HTTP or HTTPS URL');
            }

            // Ensure URL ends with manifest.json
            const url = manifestUrl.endsWith('manifest.json')
                ? manifestUrl
                : `${manifestUrl.replace(/\/$/, '')}/manifest.json`;

            console.log('[StremioService] Fetching manifest:', url);

            const response = await axios.get(url, {
                timeout: 15000,
                maxRedirects: 5,  // Allow redirects but axios will fail on non-http protocols
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
                }
            });

            const manifest = response.data;

            // Add URL info
            manifest.originalUrl = manifestUrl;
            manifest.url = manifestUrl.replace(/manifest\.json$/i, '').replace(/\/$/, '');

            // Ensure ID exists
            if (!manifest.id) {
                manifest.id = this.generateAddonId(manifestUrl);
            }

            return manifest;
        } catch (error: any) {
            console.error('[StremioService] Failed to fetch manifest:', error.message);

            // Handle stremio:// protocol errors gracefully
            if (error.message?.includes('stremio:') || error.message?.includes('Unsupported protocol')) {
                throw new Error('This URL format is not supported. Please use the full HTTPS manifest URL from the addon configure page.');
            }

            // Handle network errors
            if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
                throw new Error('Could not connect to addon server. Please check your internet connection.');
            }

            throw new Error(`Failed to fetch addon manifest: ${error.message}`);
        }
    }

    private generateAddonId(url: string): string {
        return url.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().substring(0, 50);
    }

    /**
     * Install addon from manifest URL
     */
    async installAddon(manifestUrl: string): Promise<AddonManifest> {
        await this.ensureInitialized();

        const manifest = await this.getManifest(manifestUrl);

        if (!manifest || !manifest.id) {
            throw new Error('Invalid addon manifest');
        }

        // Check if already installed
        if (this.installedAddons.has(manifest.id)) {
            // Update existing addon
            this.installedAddons.set(manifest.id, manifest);
        } else {
            // Add new addon
            this.installedAddons.set(manifest.id, manifest);
            this.addonOrder.push(manifest.id);
        }

        await this.saveInstalledAddons();
        await this.saveAddonOrder();

        console.log('[StremioService] Installed addon:', manifest.name);
        return manifest;
    }

    /**
     * Remove installed addon
     */
    async removeAddon(addonId: string): Promise<void> {
        await this.ensureInitialized();

        if (this.installedAddons.has(addonId)) {
            this.installedAddons.delete(addonId);
            this.addonOrder = this.addonOrder.filter(id => id !== addonId);

            await this.saveInstalledAddons();
            await this.saveAddonOrder();

            console.log('[StremioService] Removed addon:', addonId);
        }
    }

    /**
     * Get all installed addons in order
     */
    getInstalledAddons(): AddonManifest[] {
        return this.addonOrder
            .filter(id => this.installedAddons.has(id))
            .map(id => this.installedAddons.get(id)!);
    }

    /**
     * Get installed addons (async version that ensures initialization)
     */
    async getInstalledAddonsAsync(): Promise<AddonManifest[]> {
        await this.ensureInitialized();
        return this.getInstalledAddons();
    }

    /**
     * Check if addon supports a content type and ID prefix
     * Made less strict - if addon has stream resource, assume it supports content
     */
    private addonSupportsContent(addon: AddonManifest, type: string, id: string): boolean {
        if (!addon.resources) return false;

        // Check if addon has any stream resource
        const hasStreamResource = addon.resources.some(resource =>
            (typeof resource === 'string' && resource === 'stream') ||
            (typeof resource === 'object' && resource.name === 'stream')
        );

        if (!hasStreamResource) {
            console.log(`[${addon.name}] No stream resource`);
            return false;
        }

        // Check ID prefixes - if specified, the ID must match
        // Most addons use 'tt' prefix for IMDB IDs
        if (addon.idPrefixes && addon.idPrefixes.length > 0) {
            const matchesPrefix = addon.idPrefixes.some(p => id.startsWith(p));
            if (!matchesPrefix) {
                console.log(`[${addon.name}] ID prefix mismatch: ${id} vs ${addon.idPrefixes}`);
                return false;
            }
        }

        // Check resource-level idPrefixes
        for (const resource of addon.resources) {
            if (typeof resource === 'object' && resource.name === 'stream') {
                if (resource.idPrefixes && resource.idPrefixes.length > 0) {
                    const matchesPrefix = resource.idPrefixes.some(p => id.startsWith(p));
                    if (!matchesPrefix) {
                        console.log(`[${addon.name}] Resource ID prefix mismatch: ${id} vs ${resource.idPrefixes}`);
                        return false;
                    }
                }
            }
        }

        console.log(`[${addon.name}] Supports ${type} ${id}`);
        return true;
    }

    /**
     * Fetch streams from a single addon
     */
    private async fetchStreamsFromAddon(
        addon: AddonManifest,
        type: 'movie' | 'series',
        id: string
    ): Promise<StreamResponse> {
        try {
            const { baseUrl, queryParams } = this.getAddonBaseURL(addon.originalUrl);
            // IMPORTANT: Do NOT encode the ID - Stremio expects raw colons for series IDs
            // Format: tt0898266:9:17 (imdb:season:episode) - colons must NOT be encoded
            const streamPath = `/stream/${type}/${id}.json`;
            const url = queryParams ? `${baseUrl}${streamPath}?${queryParams}` : `${baseUrl}${streamPath}`;

            console.log(`[${addon.name}] Fetching: ${url}`);

            const response = await axios.get(url, {
                timeout: 60000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
                }
            });

            if (response.data && response.data.streams && Array.isArray(response.data.streams)) {
                // Debug: Log raw first stream to see structure
                if (response.data.streams.length > 0) {
                    const firstStream = response.data.streams[0];
                    console.log(`[${addon.name}] First raw stream:`, JSON.stringify({
                        name: firstStream.name,
                        title: firstStream.title,
                        url: firstStream.url ? 'YES' : 'NO',
                        infoHash: firstStream.infoHash ? 'YES' : 'NO',
                        behaviorHints: firstStream.behaviorHints,
                    }));
                }

                const streams = this.processStreams(response.data.streams, addon);
                console.log(`[${addon.name}] Found ${streams.length} streams`);

                return {
                    streams,
                    addonId: addon.id,
                    addonName: addon.name
                };
            }

            console.log(`[${addon.name}] No streams in response`);
            return {
                streams: [],
                addonId: addon.id,
                addonName: addon.name
            };
        } catch (error: any) {
            console.error(`[${addon.name}] Error:`, error.message);
            return {
                streams: [],
                addonId: addon.id,
                addonName: addon.name,
                error: error.message
            };
        }
    }

    /**
     * Process and normalize streams from addon response
     */
    private processStreams(streams: any[], addon: AddonManifest): Stream[] {
        return streams
            .filter(stream => {
                // Must have a playable source
                return stream.url || stream.infoHash || stream.ytId;
            })
            .map(stream => {
                // Detect direct URL/debrid streams in multiple ways:
                const hasUrl = !!stream.url;
                const hasHash = !!stream.infoHash;

                // Check if URL contains known debrid domains
                const debridDomains = ['torbox', 'real-debrid', 'alldebrid', 'premiumize', 'debrid'];
                const urlLower = (stream.url || '').toLowerCase();
                const isDebridUrl = debridDomains.some(d => urlLower.includes(d));

                // Direct URL stream: has URL without hash, OR URL contains debrid domain
                const isDirectStream = (hasUrl && !hasHash) || isDebridUrl || stream.behaviorHints?.cached === true;

                return {
                    ...stream,
                    addonId: addon.id,
                    addonName: addon.name,
                    isDirectUrl: isDirectStream,
                    isCached: isDirectStream || stream.behaviorHints?.cached === true
                };
            });
    }

    /**
     * Get streams from all installed addons that support the content
     */
    async getStreams(type: 'movie' | 'series', id: string): Promise<Stream[]> {
        await this.ensureInitialized();

        const addons = this.getInstalledAddons();
        console.log('[StremioService] Querying', addons.length, 'installed addons');

        if (addons.length === 0) {
            console.log('[StremioService] No addons installed');
            return [];
        }

        // Filter to addons that support this content type and ID
        const compatibleAddons = addons.filter(addon =>
            this.addonSupportsContent(addon, type, id)
        );

        console.log('[StremioService]', compatibleAddons.length, 'addons support', type, id);

        if (compatibleAddons.length === 0) {
            return [];
        }

        // Fetch from all compatible addons in parallel
        const results = await Promise.all(
            compatibleAddons.map(addon => this.fetchStreamsFromAddon(addon, type, id))
        );

        // Log results
        for (const result of results) {
            console.log(`[${result.addonName}] streams: ${result.streams.length}, error: ${result.error || 'none'}`);
        }

        // Merge and deduplicate streams
        const allStreams: Stream[] = [];
        const seenHashes = new Set<string>();

        for (const result of results) {
            for (const stream of result.streams) {
                // Deduplicate by infoHash for torrent streams
                if (stream.infoHash) {
                    if (!seenHashes.has(stream.infoHash)) {
                        seenHashes.add(stream.infoHash);
                        allStreams.push(stream);
                    }
                } else {
                    // Direct URL streams - always include
                    allStreams.push(stream);
                }
            }
        }

        console.log('[StremioService] Total merged streams:', allStreams.length);
        return allStreams;
    }

    /**
     * Get movie streams
     */
    async getMovieStreams(imdbId: string): Promise<Stream[]> {
        return this.getStreams('movie', imdbId);
    }

    /**
     * Get TV series streams
     */
    async getTVStreams(imdbId: string, season: number, episode: number): Promise<Stream[]> {
        const id = `${imdbId}:${season}:${episode}`;
        return this.getStreams('series', id);
    }

    /**
     * Check if any stream addons are installed
     */
    async hasStreamAddons(): Promise<boolean> {
        await this.ensureInitialized();
        const addons = this.getInstalledAddons();
        return addons.some(addon => {
            if (!addon.resources) return false;
            return addon.resources.some(r =>
                (typeof r === 'string' && r === 'stream') ||
                (typeof r === 'object' && r.name === 'stream')
            );
        });
    }
}

// Export singleton instance
export const stremioService = StremioService.getInstance();

// Convenience exports
export const installAddon = (url: string) => stremioService.installAddon(url);
export const removeAddon = (id: string) => stremioService.removeAddon(id);
export const getInstalledAddons = () => stremioService.getInstalledAddonsAsync();
export const getMovieStreams = (imdbId: string) => stremioService.getStreams('movie', imdbId);
export const getTVStreams = (imdbId: string, season: number, episode: number) =>
    stremioService.getStreams('series', `${imdbId}:${season}:${episode}`);
export const hasStreamAddons = () => stremioService.hasStreamAddons();

