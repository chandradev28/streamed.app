/**
 * GitLab YAML Engine Parser
 * Fetches and parses engine configurations from GitLab repository
 * Compatible with Debrify's search-engines format
 */

import yaml from 'js-yaml';

// GitLab URLs
const GITLAB_API = 'https://gitlab.com/api/v4/projects/mediacontent%2Fsearch-engines/repository';
const GITLAB_RAW = 'https://gitlab.com/mediacontent/search-engines/-/raw/main/torrents';

// Parsed Engine Configuration
export interface ParsedEngineConfig {
    id: string;
    displayName: string;
    description?: string;
    icon: string;
    categories?: string[];
    enabled: boolean;

    capabilities: {
        keywordSearch: boolean;
        imdbSearch: boolean;
        seriesSupport: boolean;
    };

    api: {
        baseUrl?: string;
        method: 'GET' | 'POST';
        urls?: {
            keyword?: string;
            imdb?: string;
        };
        timeout?: number;
        params?: Array<{
            name: string;
            source?: string;
            value?: any;
            location: 'query' | 'body';
            required?: boolean;
            valueType?: string;
        }>;
    };

    queryParams: {
        type: string;
        paramName: string | { keyword?: string; imdb?: string };
        encode?: boolean;
    };

    extraParams?: Record<string, Record<string, any>>;

    pagination?: {
        type: string;
        resultsPerPage?: number;
        maxPages?: number;
        offset?: {
            paramName: string;
            startOffset: number;
            location?: string;
        };
    };

    responseFormat: {
        type: string;
        extractJson?: boolean;
        resultsPath?: string | { keyword?: string; imdb?: string };
    };

    preChecks?: Array<{
        field: string;
        equals?: any;
    }>;

    nestedResults?: {
        enabled: boolean;
        itemsField: string;
        parentFields?: Array<{
            name: string;
            source: string;
            fallback?: string;
            type?: string;
        }>;
    };

    fieldMappings: {
        name?: any;
        infohash?: any;
        sizeBytes?: any;
        seeders?: any;
        leechers?: any;
        createdUnix?: any;
        category?: any;
    };

    settings?: Array<{
        id: string;
        type: string;
        label: string;
        default: any;
        options?: any[];
    }>;
}

// Torrent Result
export interface TorrentResultFromYaml {
    id: string;
    title: string;
    infoHash: string;
    magnetLink?: string;
    size: string;
    sizeBytes: number;
    seeders: number;
    leechers: number;
    source: string;
    sourceDisplayName: string;
    date?: string;
    dateUnix?: number;
    isCached?: boolean;
}

// Cache for parsed configs
let cachedConfigs: ParsedEngineConfig[] | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

/**
 * Format bytes to human readable
 */
const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Format unix timestamp to date string
 */
const formatDate = (unix: number): string => {
    if (!unix) return '';
    const date = new Date(unix * 1000);
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
};

/**
 * Fetch list of available engine YAML files from GitLab
 */
export const fetchEngineFiles = async (): Promise<string[]> => {
    try {
        const response = await fetch(`${GITLAB_API}/tree?path=torrents&ref=main`);
        if (!response.ok) {
            console.log('GitLab API failed:', response.status);
            return [];
        }

        const files = await response.json();
        return files
            .filter((f: any) => f.name.endsWith('.yaml') && !f.name.startsWith('_'))
            .map((f: any) => f.name.replace('.yaml', ''));
    } catch (error) {
        console.error('Error fetching engine list:', error);
        return [];
    }
};

/**
 * Fetch and parse a single YAML file
 */
export const fetchEngineYaml = async (engineId: string): Promise<ParsedEngineConfig | null> => {
    try {
        const url = `${GITLAB_RAW}/${engineId}.yaml`;
        const response = await fetch(url);

        if (!response.ok) {
            console.log(`Failed to fetch ${engineId}.yaml:`, response.status);
            return null;
        }

        const yamlText = await response.text();
        const config = yaml.load(yamlText) as any;

        // Parse to our format
        return parseYamlConfig(config);
    } catch (error) {
        console.error(`Error parsing ${engineId}.yaml:`, error);
        return null;
    }
};

/**
 * Parse raw YAML config to our typed format
 */
const parseYamlConfig = (raw: any): ParsedEngineConfig => {
    return {
        id: raw.id || '',
        displayName: raw.display_name || raw.id || '',
        description: raw.description,
        icon: raw.icon || 'search',
        categories: raw.categories,
        enabled: true,

        capabilities: {
            keywordSearch: raw.capabilities?.keyword_search ?? true,
            imdbSearch: raw.capabilities?.imdb_search ?? false,
            seriesSupport: raw.capabilities?.series_support ?? false,
        },

        api: {
            baseUrl: raw.api?.base_url,
            method: (raw.api?.method || 'GET').toUpperCase() as 'GET' | 'POST',
            urls: raw.api?.urls,
            timeout: raw.api?.timeout_seconds,
            params: raw.api?.params?.map((p: any) => ({
                name: p.name,
                source: p.source,
                value: p.value,
                location: p.location || 'query',
                required: p.required,
                valueType: p.value_type,
            })),
        },

        queryParams: {
            type: raw.query_params?.type || 'query_params',
            paramName: raw.query_params?.param_name || 'q',
            encode: raw.query_params?.encode ?? true,
        },

        extraParams: raw.extra_params,

        pagination: raw.pagination ? {
            type: raw.pagination.type,
            resultsPerPage: raw.pagination.results_per_page,
            maxPages: raw.pagination.max_pages,
            offset: raw.pagination.offset ? {
                paramName: raw.pagination.offset.param_name,
                startOffset: raw.pagination.offset.start_offset || 0,
                location: raw.pagination.offset.location,
            } : undefined,
        } : undefined,

        responseFormat: {
            type: raw.response_format?.type || 'json',
            extractJson: raw.response_format?.extract_json,
            resultsPath: raw.response_format?.results_path,
        },

        preChecks: raw.pre_checks?.map((c: any) => ({
            field: c.field,
            equals: c.equals,
        })),

        nestedResults: raw.nested_results ? {
            enabled: raw.nested_results.enabled ?? false,
            itemsField: raw.nested_results.items_field,
            parentFields: raw.nested_results.parent_fields?.map((f: any) => ({
                name: f.name,
                source: f.source,
                fallback: f.fallback,
                type: f.type,
            })),
        } : undefined,

        fieldMappings: {
            name: raw.field_mappings?.name,
            infohash: raw.field_mappings?.infohash,
            sizeBytes: raw.field_mappings?.size_bytes,
            seeders: raw.field_mappings?.seeders,
            leechers: raw.field_mappings?.leechers,
            createdUnix: raw.field_mappings?.created_unix,
            category: raw.field_mappings?.category,
        },

        settings: raw.settings?.map((s: any) => ({
            id: s.id,
            type: s.type,
            label: s.label,
            default: s.default,
            options: s.options,
        })),
    };
};

/**
 * Get all engine configs (with caching)
 */
export const getAllEngineConfigs = async (): Promise<ParsedEngineConfig[]> => {
    const now = Date.now();

    // Return cached if fresh
    if (cachedConfigs && (now - lastFetchTime) < CACHE_DURATION) {
        return cachedConfigs;
    }

    console.log('Fetching engine configs from GitLab...');

    const engineIds = await fetchEngineFiles();
    if (engineIds.length === 0) {
        console.log('No engines found, using fallback');
        return getFallbackConfigs();
    }

    const configs: ParsedEngineConfig[] = [];

    // Fetch all YAMLs in parallel
    const promises = engineIds.map(id => fetchEngineYaml(id));
    const results = await Promise.all(promises);

    for (const config of results) {
        if (config) {
            configs.push(config);
        }
    }

    if (configs.length > 0) {
        cachedConfigs = configs;
        lastFetchTime = now;
    }

    console.log('Loaded', configs.length, 'engine configs');
    return configs.length > 0 ? configs : getFallbackConfigs();
};

/**
 * Fallback configs if GitLab fetch fails
 */
const getFallbackConfigs = (): ParsedEngineConfig[] => {
    return [
        {
            id: 'torrents_csv',
            displayName: 'Torrents CSV',
            icon: 'table_chart',
            enabled: true,
            capabilities: { keywordSearch: true, imdbSearch: false, seriesSupport: false },
            api: { method: 'GET', urls: { keyword: 'https://torrents-csv.com/service/search' } },
            queryParams: { type: 'query_params', paramName: 'q' },
            responseFormat: { type: 'json', resultsPath: 'torrents' },
            fieldMappings: {
                name: 'name',
                infohash: 'infohash',
                sizeBytes: 'size_bytes',
                seeders: 'seeders',
                leechers: 'leechers',
                createdUnix: 'created_unix',
            },
        },
    ] as ParsedEngineConfig[];
};

/**
 * Extract value from object using path or mapping
 */
const extractValue = (obj: any, mapping: any, parentContext?: any): any => {
    if (!mapping) return undefined;

    // Direct string field name
    if (typeof mapping === 'string') {
        return obj[mapping];
    }

    // Object with type
    if (typeof mapping === 'object') {
        if (mapping.type === 'direct' || mapping.source) {
            let value = obj[mapping.source || mapping];
            if (mapping.conversion === 'lowercase' && typeof value === 'string') {
                value = value.toLowerCase();
            }
            return value;
        }

        if (mapping.type === 'template' && mapping.template) {
            // Replace template variables
            let result = mapping.template;
            const matches = result.match(/\{([^}]+)\}/g) || [];
            for (const match of matches) {
                const key = match.slice(1, -1);
                const value = parentContext?.[key] ?? obj[key] ?? '';
                result = result.replace(match, value);
            }
            return result;
        }
    }

    return undefined;
};

/**
 * Get value at nested path (e.g., "data.movies")
 */
const getNestedValue = (obj: any, path: string): any => {
    if (!path) return obj;
    return path.split('.').reduce((o, k) => o?.[k], obj);
};

/**
 * Execute search using a parsed engine config
 */
export const executeEngineSearch = async (
    config: ParsedEngineConfig,
    query: string,
    maxResults: number = 100
): Promise<TorrentResultFromYaml[]> => {
    try {
        const results: TorrentResultFromYaml[] = [];

        // Build URL
        let url = '';
        if (config.api.urls?.keyword) {
            url = config.api.urls.keyword;
        } else if (config.api.baseUrl) {
            url = config.api.baseUrl;
        } else {
            console.log(`No URL for engine ${config.id}`);
            return [];
        }

        // Remove jina.ai proxy if present (we'll call API directly)
        if (url.includes('r.jina.ai/')) {
            url = url.replace('https://r.jina.ai/', '').replace('http://', 'https://');
        }

        // Build request options
        const requestInit: RequestInit = {
            method: config.api.method,
            headers: {
                'Accept': 'application/json',
            },
        };

        // Handle GET with query params
        if (config.api.method === 'GET') {
            const urlObj = new URL(url);
            const paramName = typeof config.queryParams.paramName === 'string'
                ? config.queryParams.paramName
                : config.queryParams.paramName?.keyword || 'q';

            urlObj.searchParams.set(paramName, query);

            // Add extra params
            if (config.extraParams?.keyword) {
                for (const [key, value] of Object.entries(config.extraParams.keyword)) {
                    urlObj.searchParams.set(key, String(value));
                }
            }

            url = urlObj.toString();
        }

        // Handle POST with body
        if (config.api.method === 'POST') {
            const body: any = {};

            if (config.api.params) {
                for (const param of config.api.params) {
                    if (param.location === 'body') {
                        if (param.source === 'query') {
                            body[param.name] = query;
                        } else if (param.value !== undefined) {
                            // Convert value type
                            let value = param.value;
                            if (param.valueType === 'int') value = parseInt(value);
                            else if (param.valueType === 'bool') value = value === 'true';
                            body[param.name] = value;
                        }
                    }
                }
            }

            requestInit.headers = {
                ...requestInit.headers as Record<string, string>,
                'Content-Type': 'application/json',
            };
            requestInit.body = JSON.stringify(body);
        }

        console.log(`Searching ${config.displayName}:`, url);

        // Execute request
        const response = await fetch(url, requestInit);

        if (!response.ok) {
            console.log(`${config.displayName} returned ${response.status}`);
            return [];
        }

        let data = await response.json();

        // Handle jina wrapped response
        if (config.responseFormat.type === 'jina_wrapped' && config.responseFormat.extractJson) {
            // Jina wraps response, need to extract
            if (typeof data === 'string') {
                try {
                    data = JSON.parse(data);
                } catch {
                    console.log('Failed to parse jina response');
                    return [];
                }
            }
        }

        // Pre-checks
        if (config.preChecks) {
            for (const check of config.preChecks) {
                if (data[check.field] !== check.equals) {
                    console.log(`${config.displayName} pre-check failed:`, check.field);
                    return [];
                }
            }
        }

        // Get results array
        const resultsPath = typeof config.responseFormat.resultsPath === 'string'
            ? config.responseFormat.resultsPath
            : config.responseFormat.resultsPath?.keyword;

        let items = resultsPath ? getNestedValue(data, resultsPath) : data;

        if (!items || !Array.isArray(items)) {
            // Maybe it's a single result
            if (typeof items === 'object' && items !== null) {
                items = [items];
            } else {
                return [];
            }
        }

        // Process items
        for (const item of items.slice(0, maxResults)) {
            // Handle nested results (e.g., YTS has movies with nested torrents)
            if (config.nestedResults?.enabled && config.nestedResults.itemsField) {
                const nestedItems = item[config.nestedResults.itemsField];
                if (Array.isArray(nestedItems)) {
                    // Build parent context
                    const parentContext: any = {};
                    for (const pf of config.nestedResults.parentFields || []) {
                        parentContext[pf.name] = item[pf.source] ?? item[pf.fallback || ''] ?? '';
                    }

                    for (const nested of nestedItems) {
                        const result = mapToResult(nested, config, parentContext);
                        if (result) results.push(result);
                    }
                }
            } else {
                const result = mapToResult(item, config);
                if (result) results.push(result);
            }
        }

        console.log(`${config.displayName}: ${results.length} results`);
        return results;

    } catch (error) {
        console.error(`Error searching ${config.displayName}:`, error);
        return [];
    }
};

/**
 * Map raw item to TorrentResult
 */
const mapToResult = (
    item: any,
    config: ParsedEngineConfig,
    parentContext?: any
): TorrentResultFromYaml | null => {
    try {
        const fm = config.fieldMappings;

        const infoHash = String(extractValue(item, fm.infohash, parentContext) || '').toLowerCase();
        if (!infoHash) return null;

        const title = extractValue(item, fm.name, parentContext) || 'Unknown';
        const sizeBytes = parseInt(extractValue(item, fm.sizeBytes, parentContext)) || 0;
        const seeders = parseInt(extractValue(item, fm.seeders, parentContext)) || 0;
        const leechers = parseInt(extractValue(item, fm.leechers, parentContext)) || 0;
        const createdUnix = parseInt(extractValue(item, fm.createdUnix, parentContext)) || 0;

        return {
            id: `${config.id}_${infoHash}`,
            title,
            infoHash,
            magnetLink: `magnet:?xt=urn:btih:${infoHash}`,
            size: formatBytes(sizeBytes),
            sizeBytes,
            seeders,
            leechers,
            source: config.id,
            sourceDisplayName: config.displayName,
            date: formatDate(createdUnix),
            dateUnix: createdUnix,
            isCached: false,
        };
    } catch (error) {
        return null;
    }
};

/**
 * Search all engines
 */
export const searchAllEnginesYaml = async (
    query: string,
    maxResultsPerEngine: number = 100
): Promise<{
    results: TorrentResultFromYaml[];
    resultsByEngine: Map<string, number>;
    totalResults: number;
}> => {
    const configs = await getAllEngineConfigs();
    const resultsByEngine = new Map<string, number>();
    let allResults: TorrentResultFromYaml[] = [];

    // Search in parallel
    const promises = configs
        .filter(c => c.enabled)
        .map(async (config) => {
            const results = await executeEngineSearch(config, query, maxResultsPerEngine);
            return { config, results };
        });

    const engineResults = await Promise.all(promises);

    for (const { config, results } of engineResults) {
        resultsByEngine.set(config.displayName, results.length);
        allResults.push(...results);
    }

    return {
        results: allResults,
        resultsByEngine,
        totalResults: allResults.length,
    };
};
