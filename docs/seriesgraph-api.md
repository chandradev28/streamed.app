# SeriesGraph API Documentation

> API for fetching TV series episode ratings and metadata.
> Website: https://seriesgraph.com/

## Base URL
```
https://seriesgraph.com/api
```

## Authentication
**None required** - The API is publicly accessible.

---

## Endpoints

### 1. Get Show Metadata
```
GET /api/shows/{showId}
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `showId` | number | TMDB ID of the show |

**Example Request:**
```
GET https://seriesgraph.com/api/shows/1396
```

**Response:**
```json
{
  "name": "Breaking Bad",
  "id": 1396,
  "first_air_date": "2008-01-20",
  "last_air_date": "2013-09-29",
  "vote_average": 8.7,
  "poster_path": "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
  "external_ids": {
    "imdb_id": "tt0903747"
  }
}
```

---

### 2. Get Episode Ratings
```
GET /api/shows/{showId}/season-ratings
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `showId` | number | TMDB ID of the show |

**Example Request:**
```
GET https://seriesgraph.com/api/shows/1396/season-ratings
```

**Response:**
```json
[
  {
    "season_number": 1,
    "episodes": [
      {
        "episode_number": 1,
        "name": "Pilot",
        "season_number": 1,
        "tconst": "tt0959621",
        "vote_average": 9.1
      },
      {
        "episode_number": 2,
        "name": "Cat's in the Bag...",
        "season_number": 1,
        "tconst": "tt1054724",
        "vote_average": 8.5
      }
    ]
  }
]
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `season_number` | number | Season number |
| `episodes` | array | Array of episode objects |
| `episodes[].episode_number` | number | Episode number within season |
| `episodes[].name` | string | Episode title |
| `episodes[].tconst` | string | IMDb episode ID |
| `episodes[].vote_average` | number | IMDb rating (0-10 scale) |

---

## Example Show IDs (TMDB)

| Show | TMDB ID |
|------|---------|
| Breaking Bad | 1396 |
| Better Call Saul | 60059 |
| Game of Thrones | 1399 |
| The Simpsons | 456 |
| Dexter | 1405 |
| Black Mirror | 42009 |
| Chernobyl | 87108 |
| The Walking Dead | 1402 |

---

## Notes
- Show IDs are **TMDB IDs**, not IMDb IDs
- The `tconst` field in episode data is the IMDb episode ID
- `poster_path` can be used with TMDB image URLs: `https://image.tmdb.org/t/p/w500{poster_path}`
- No rate limiting observed, but use responsibly
- Search functionality is not available via public API (uses Next.js server components)

---

*Last updated: January 10, 2026*
