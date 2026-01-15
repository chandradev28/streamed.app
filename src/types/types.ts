// TMDB API Types

export interface Movie {
    id: number;
    title: string;
    original_title: string;
    overview: string;
    poster_path: string | null;
    backdrop_path: string | null;
    release_date: string;
    vote_average: number;
    vote_count: number;
    popularity: number;
    adult: boolean;
    genre_ids: number[];
    original_language: string;
    video: boolean;
    media_type?: 'movie';
}

export interface TVShow {
    id: number;
    name: string;
    original_name: string;
    overview: string;
    poster_path: string | null;
    backdrop_path: string | null;
    first_air_date: string;
    vote_average: number;
    vote_count: number;
    popularity: number;
    genre_ids: number[];
    origin_country: string[];
    original_language: string;
    media_type?: 'tv';
}

export interface MovieDetails extends Movie {
    genres: { id: number; name: string }[];
    runtime: number;
    status: string;
    tagline: string;
    production_companies: { id: number; name: string; logo_path: string | null }[];
    budget: number;
    revenue: number;
    imdb_id: string | null;
}

export interface TVShowDetails extends TVShow {
    genres: { id: number; name: string }[];
    episode_run_time: number[];
    status: string;
    tagline: string;
    number_of_seasons: number;
    number_of_episodes: number;
    seasons: Season[];
    created_by: { id: number; name: string; profile_path: string | null }[];
    networks: { id: number; name: string; logo_path: string | null }[];
}

export interface Season {
    id: number;
    name: string;
    overview: string;
    poster_path: string | null;
    season_number: number;
    episode_count: number;
    air_date: string;
}

export interface SeasonDetails extends Season {
    episodes: Episode[];
}

export interface Episode {
    id: number;
    name: string;
    overview: string;
    still_path: string | null;
    episode_number: number;
    season_number: number;
    air_date: string;
    vote_average: number;
    runtime: number;
}

export interface TrendingResponse {
    page: number;
    results: (Movie | TVShow)[];
    total_pages: number;
    total_results: number;
}

export interface CastMember {
    id: number;
    name: string;
    character: string;
    profile_path: string | null;
    order: number;
}

export interface CreditsResponse {
    id: number;
    cast: CastMember[];
}

export interface Genre {
    id: number;
    name: string;
}

// Union type for media items
export type MediaItem = Movie | TVShow;

// Helper type guard
export function isMovie(item: MediaItem): item is Movie {
    return 'title' in item;
}

export function isTVShow(item: MediaItem): item is TVShow {
    return 'name' in item && !('title' in item);
}
