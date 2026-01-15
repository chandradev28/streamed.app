// DNS over HTTPS (DoH) Service
// Provides proxy-based fetching to bypass ISP blocking

import { StorageService } from './storage';

export type DnsProvider = 'none' | 'cloudflare' | 'google' | 'adguard' | 'quad9';

interface DnsProviderConfig {
    name: string;
    proxyUrl: string;
    description: string;
}

// CORS proxy services - these route requests through their servers
// to bypass ISP blocking
export const DNS_PROVIDERS: Record<DnsProvider, DnsProviderConfig> = {
    none: {
        name: 'None',
        proxyUrl: '',
        description: 'Direct connection (no proxy)',
    },
    cloudflare: {
        name: 'Cloudflare Workers',
        proxyUrl: 'https://corsproxy.io/?',
        description: 'CorsProxy.io service',
    },
    google: {
        name: 'AllOrigins',
        proxyUrl: 'https://api.allorigins.win/raw?url=',
        description: 'AllOrigins proxy',
    },
    adguard: {
        name: 'Cors.sh',
        proxyUrl: 'https://proxy.cors.sh/',
        description: 'Cors.sh proxy',
    },
    quad9: {
        name: 'Direct',
        proxyUrl: '',
        description: 'Direct with retry',
    },
};

// All available proxies for fallback - ordered by reliability
const ALL_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest=',
];

/**
 * Check if response is likely JSON (not HTML error page)
 */
const isValidJsonResponse = async (response: Response): Promise<boolean> => {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
        return false;
    }
    // Clone response to peek at body without consuming it
    const cloned = response.clone();
    try {
        const text = await cloned.text();
        // If starts with '<' it's probably HTML
        if (text.trim().startsWith('<')) {
            console.log('DoH: Response is HTML, not JSON');
            return false;
        }
        return true;
    } catch {
        return true; // If we can't check, assume it's valid
    }
};

/**
 * Make a proxied fetch request to bypass ISP blocking
 * Uses the configured DNS provider's proxy, with automatic fallbacks
 */
export const dohFetch = async (
    url: string,
    options: RequestInit = {}
): Promise<Response> => {
    const provider = await StorageService.getDnsProvider();

    // Standard headers
    const enhancedHeaders = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36',
        ...options.headers,
    };

    const enhancedOptions: RequestInit = {
        ...options,
        headers: enhancedHeaders,
    };

    // If 'none' or 'quad9' (direct) selected, only use direct fetch
    if (provider === 'none' || provider === 'quad9') {
        console.log('DoH: Using direct fetch');
        return fetchWithRetry(url, enhancedOptions, 3);
    }

    // Get proxies to try (selected provider first, then fallbacks)
    const selectedProxy = DNS_PROVIDERS[provider].proxyUrl;
    const proxiesToTry = selectedProxy
        ? [selectedProxy, ...ALL_PROXIES.filter(p => p !== selectedProxy)]
        : ALL_PROXIES;

    console.log(`DoH: Using proxy mode (provider: ${provider})`);

    // Try each proxy
    const encodedUrl = encodeURIComponent(url);

    for (const proxyUrl of proxiesToTry) {
        try {
            const proxiedUrl = `${proxyUrl}${encodedUrl}`;
            const proxyName = proxyUrl.substring(8, 28);
            console.log(`DoH: Trying ${proxyName}...`);

            const response = await fetchWithTimeout(proxiedUrl, enhancedOptions, 8000);

            if (response.ok) {
                // Check if response is actually JSON, not HTML error page
                const isValid = await isValidJsonResponse(response);
                if (isValid) {
                    console.log('DoH: Proxy request successful');
                    // Re-fetch since we consumed the body checking
                    return await fetchWithTimeout(proxiedUrl, enhancedOptions, 8000);
                } else {
                    console.log('DoH: Proxy returned HTML instead of JSON');
                    continue; // Try next proxy
                }
            }

            console.log(`DoH: Proxy returned ${response.status}`);
        } catch (error: any) {
            console.log(`DoH: Proxy failed (${error.message})`);
        }
    }

    // All proxies failed, try direct as last resort with retry
    console.log('DoH: All proxies failed, trying direct with retry');
    return fetchWithRetry(url, enhancedOptions, 2);
};

/**
 * Fetch with timeout support
 */
const fetchWithTimeout = async (
    url: string,
    options: RequestInit,
    timeoutMs: number
): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Request timed out');
        }
        throw error;
    }
};

/**
 * Fetch with retry support
 */
const fetchWithRetry = async (
    url: string,
    options: RequestInit,
    maxRetries: number
): Promise<Response> => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`DoH: Direct attempt ${attempt}/${maxRetries}`);
            const response = await fetchWithTimeout(url, options, 8000);

            if (response.ok) {
                console.log('DoH: Direct request successful');
                return response;
            }

            console.log(`DoH: Direct returned ${response.status}`);

            // If it's a client error (4xx), don't retry
            if (response.status >= 400 && response.status < 500) {
                return response;
            }
        } catch (error: any) {
            lastError = error;
            console.log(`DoH: Direct attempt ${attempt} failed (${error.message})`);

            // Wait before retry (exponential backoff)
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    }

    // All retries failed, throw the last error
    throw lastError || new Error('All retry attempts failed');
};

/**
 * Clear the DNS cache (placeholder for compatibility)
 */
export const clearDnsCache = (): void => {
    console.log('DoH: Cache cleared');
};
