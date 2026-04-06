'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { APISportsClient } = require('../backend/apiClients');

require('dotenv').config({
    path: path.join(__dirname, '..', 'backend', '.env'),
    quiet: true
});

const DEFAULT_DATE = new Date().toISOString().slice(0, 10);
const footballClient = new APISportsClient();
const geocodeCache = new Map();

const SIGNAL_DEFINITIONS = [
    {
        type: 'suspension',
        label: 'Suspension',
        keywords: ['suspension', 'suspended', 'ban', 'banned', 'disciplinary', 'sent off']
    },
    {
        type: 'injury_news',
        label: 'Injury concern',
        keywords: ['injury', 'injured', 'knock', 'hamstring', 'ankle', 'knee', 'doubtful', 'ruled out', 'fitness test']
    },
    {
        type: 'lineup_news',
        label: 'Lineup issue',
        keywords: ['lineup', 'line-up', 'team news', 'starting xi', 'starting 11', 'bench', 'rested', 'rotation', 'dropped']
    },
    {
        type: 'team_unrest',
        label: 'Team unrest',
        keywords: ['crisis', 'turmoil', 'unrest', 'feud', 'fallout', 'protest', 'controversy', 'dispute', 'dressing room']
    },
    {
        type: 'manager_instability',
        label: 'Manager instability',
        keywords: ['sacked', 'under pressure', 'manager', 'head coach', 'caretaker', 'interim', 'job on the line']
    }
];

const NEGATIVE_KEYWORDS = [
    'blow', 'concern', 'setback', 'out', 'absence', 'miss', 'problem', 'worry', 'crisis', 'turmoil',
    'pressure', 'struggle', 'injury', 'suspension', 'ban', 'doubt', 'doubtful', 'row', 'controversy'
];
const POSITIVE_KEYWORDS = [
    'boost', 'returns', 'fit', 'available', 'back', 'ready', 'positive', 'improves', 'strong', 'confidence'
];

function parseArgs(argv) {
    const args = {
        date: DEFAULT_DATE,
        sport: 'football'
    };

    for (const arg of argv) {
        if (arg.startsWith('--date=')) {
            args.date = arg.slice('--date='.length);
        } else if (arg.startsWith('--sport=')) {
            args.sport = arg.slice('--sport='.length).toLowerCase();
        }
    }

    return args;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function canonicalCountryName(value) {
    const normalized = normalizeText(value);
    const aliases = new Map([
        ['usa', 'united states'],
        ['us', 'united states'],
        ['u s a', 'united states'],
        ['costa rica', 'costa rica'],
        ['england', 'united kingdom']
    ]);
    return aliases.get(normalized) || normalized;
}

function weatherCodeToSummary(code) {
    const map = new Map([
        [0, 'Clear sky'],
        [1, 'Mainly clear'],
        [2, 'Partly cloudy'],
        [3, 'Overcast'],
        [45, 'Fog'],
        [48, 'Depositing rime fog'],
        [51, 'Light drizzle'],
        [53, 'Moderate drizzle'],
        [55, 'Dense drizzle'],
        [61, 'Slight rain'],
        [63, 'Moderate rain'],
        [65, 'Heavy rain'],
        [71, 'Slight snow'],
        [73, 'Moderate snow'],
        [75, 'Heavy snow'],
        [80, 'Rain showers'],
        [81, 'Heavy rain showers'],
        [82, 'Violent rain showers'],
        [95, 'Thunderstorm'],
        [96, 'Thunderstorm with hail'],
        [99, 'Severe thunderstorm with hail']
    ]);
    return map.get(code) || 'Unknown';
}

function toIsoDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

function addDays(dateString, dayOffset) {
    const date = new Date(`${dateString}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() + dayOffset);
    return date.toISOString().slice(0, 10);
}

function nearestHourlyIndex(times, kickoffIso) {
    if (!Array.isArray(times) || !times.length || !kickoffIso) return -1;
    const kickoffMs = new Date(kickoffIso).getTime();
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < times.length; i += 1) {
        const timeMs = new Date(`${times[i]}:00Z`).getTime();
        const distance = Math.abs(timeMs - kickoffMs);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = i;
        }
    }

    return bestIndex;
}

function stripCdata(value) {
    return String(value || '')
        .replace(/^<!\[CDATA\[/, '')
        .replace(/\]\]>$/, '')
        .trim();
}

function decodeHtmlEntities(value) {
    const entityMap = new Map([
        ['&amp;', '&'],
        ['&lt;', '<'],
        ['&gt;', '>'],
        ['&quot;', '"'],
        ['&#39;', '\''],
        ['&apos;', '\''],
        ['&#8217;', '\''],
        ['&#8216;', '\''],
        ['&#8220;', '"'],
        ['&#8221;', '"'],
        ['&#8230;', '...'],
        ['&#8211;', '-'],
        ['&#8212;', '-'],
        ['&#160;', ' ']
    ]);

    let decoded = String(value || '');
    for (const [entity, replacement] of entityMap.entries()) {
        decoded = decoded.split(entity).join(replacement);
    }

    return decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripHtml(value) {
    return decodeHtmlEntities(String(value || ''))
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractTagValue(block, tagName) {
    const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i'));
    return match ? stripCdata(match[1]) : null;
}

function extractSource(block) {
    const match = block.match(/<source(?:\s+url="([^"]*)")?>([\s\S]*?)<\/source>/i);
    if (!match) {
        return { name: null, url: null };
    }
    return {
        name: stripHtml(stripCdata(match[2])),
        url: match[1] || null
    };
}

function parseGoogleNewsRss(xmlText) {
    const itemMatches = Array.from(String(xmlText || '').matchAll(/<item>([\s\S]*?)<\/item>/gi));
    return itemMatches.map((match) => {
        const block = match[1];
        const source = extractSource(block);
        const title = stripHtml(extractTagValue(block, 'title'));
        const description = stripHtml(extractTagValue(block, 'description'));
        const link = decodeHtmlEntities(extractTagValue(block, 'link') || '');
        const pubDate = extractTagValue(block, 'pubDate');

        return {
            title,
            summary: description,
            link: link || null,
            publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
            sourceName: source.name,
            sourceUrl: source.url
        };
    }).filter((item) => item.title);
}

function buildTeamAliases(teamName) {
    const normalized = normalizeText(teamName);
    if (!normalized) return [];

    const tokens = normalized.split(' ').filter(Boolean);
    const aliases = new Set([normalized]);

    if (tokens.length > 1) {
        aliases.add(tokens.join(' '));
        aliases.add(tokens.filter((token) => !['fc', 'cf', 'sc', 'club'].includes(token)).join(' '));
        aliases.add(tokens.map((token) => token[0]).join(''));
    }

    return Array.from(aliases).filter((alias) => alias.length >= 2);
}

function textMentionsTeam(text, teamName) {
    const normalizedText = normalizeText(text);
    const aliases = buildTeamAliases(teamName);
    return aliases.some((alias) => alias && normalizedText.includes(alias));
}

function countKeywordHits(text, keywords) {
    const normalizedText = normalizeText(text);
    let count = 0;
    const matched = [];

    for (const keyword of keywords) {
        const normalizedKeyword = normalizeText(keyword);
        if (normalizedKeyword && normalizedText.includes(normalizedKeyword)) {
            count += 1;
            matched.push(keyword);
        }
    }

    return { count, matched };
}

function computeSentimentScore(text) {
    const negative = countKeywordHits(text, NEGATIVE_KEYWORDS).count;
    const positive = countKeywordHits(text, POSITIVE_KEYWORDS).count;
    return positive - negative;
}

function buildNewsQuery(event, startDate, endDateExclusive) {
    const home = event.home_team_name || 'home team';
    const away = event.away_team_name || 'away team';
    return `("${home}" OR "${away}") football (injury OR injuries OR suspended OR suspension OR lineup OR "team news" OR rotation OR crisis OR unrest OR manager) after:${startDate} before:${endDateExclusive}`;
}

async function fetchGoogleNewsForEvent(event) {
    const kickoffDate = toIsoDate(event.start_time_utc);
    if (!kickoffDate) {
        return { query: null, items: [], error: 'Invalid kickoff date' };
    }

    const startDate = addDays(kickoffDate, -3);
    const endDateExclusive = addDays(kickoffDate, 1);
    const query = buildNewsQuery(event, startDate, endDateExclusive);
    const url = new URL('https://news.google.com/rss/search');
    url.searchParams.set('q', query);
    url.searchParams.set('hl', 'en-GB');
    url.searchParams.set('gl', 'GB');
    url.searchParams.set('ceid', 'GB:en');

    const response = await fetch(url, {
        headers: {
            'user-agent': 'SKCS AI Sports Edge/1.0'
        },
        signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
        return { query, items: [], error: `Google News RSS returned ${response.status}` };
    }

    const xml = await response.text();
    return {
        query,
        items: parseGoogleNewsRss(xml).slice(0, 12),
        error: null
    };
}

function buildNewsSignal(article, event, teamName, opponentName) {
    const text = `${article.title || ''} ${article.summary || ''}`.trim();
    if (!textMentionsTeam(text, teamName)) {
        return null;
    }

    const sentimentScore = computeSentimentScore(text);
    const signalCandidates = [];
    for (const definition of SIGNAL_DEFINITIONS) {
        const hits = countKeywordHits(text, definition.keywords);
        if (hits.count > 0) {
            signalCandidates.push({
                type: definition.type,
                label: definition.label,
                matchedKeywords: hits.matched,
                signalStrength: hits.count
            });
        }
    }

    if (!signalCandidates.length && sentimentScore >= 0) {
        return null;
    }

    signalCandidates.sort((a, b) => b.signalStrength - a.signalStrength);
    const primarySignal = signalCandidates[0] || {
        type: 'media_signal',
        label: 'Negative media signal',
        matchedKeywords: countKeywordHits(text, NEGATIVE_KEYWORDS).matched,
        signalStrength: Math.abs(sentimentScore)
    };

    const publishedAt = article.publishedAt ? new Date(article.publishedAt) : null;
    const kickoff = event.start_time_utc ? new Date(event.start_time_utc) : null;
    const hoursBeforeKickoff = publishedAt && kickoff
        ? Math.max(0, Math.round((kickoff.getTime() - publishedAt.getTime()) / (60 * 60 * 1000)))
        : null;
    const relevanceScore = Math.max(
        1,
        primarySignal.signalStrength * 2
            + (textMentionsTeam(text, opponentName) ? 1 : 0)
            + (hoursBeforeKickoff !== null && hoursBeforeKickoff <= 24 ? 2 : 1)
    );

    return {
        event_id: event.event_id,
        sport: 'football',
        fixture_date: toIsoDate(event.start_time_utc),
        kickoff_time: event.start_time_utc,
        team_name: teamName,
        opponent_name: opponentName,
        signal_type: primarySignal.type,
        signal_label: primarySignal.label,
        signal_strength: Number(primarySignal.signalStrength),
        relevance_score: Number(relevanceScore),
        sentiment_score: Number(sentimentScore),
        evidence_keywords: primarySignal.matchedKeywords,
        article_title: article.title,
        article_summary: article.summary || null,
        article_url: article.link || null,
        source_name: article.sourceName || null,
        source_url: article.sourceUrl || null,
        published_at: article.publishedAt || null
    };
}

async function ensureTables(client) {
    const sql = fs.readFileSync(path.join(__dirname, 'sql', 'create_event_context_tables.sql'), 'utf8');
    await client.query(sql);
}

async function fetchEventsForDate(client, date) {
    const res = await client.query(
        `WITH prediction_events AS (
            SELECT DISTINCT COALESCE(m->>'match_id', m->'metadata'->>'event_id') AS event_id
            FROM predictions_final pf
            CROSS JOIN LATERAL jsonb_array_elements(pf.matches) AS m
            WHERE LEFT(COALESCE(m->>'match_date', m->>'commence_time', ''), 10) = $1::text
              AND COALESCE(m->>'sport', '') = 'football'
        )
        SELECT
            ce.id::text AS event_id,
            ce.sport,
            ce.start_time_utc,
            ce.provider_name,
            ce.raw_provider_data,
            ce.raw_provider_data->'fixture'->>'id' AS fixture_provider_id,
            ce.raw_provider_data->'fixture'->'venue'->>'name' AS venue_name,
            ce.raw_provider_data->'fixture'->'venue'->>'city' AS venue_city,
            ce.raw_provider_data->'league'->>'country' AS venue_country,
            ce.raw_provider_data->'teams'->'home'->>'name' AS home_team_name,
            ce.raw_provider_data->'teams'->'away'->>'name' AS away_team_name
         FROM canonical_events ce
         JOIN prediction_events pe ON pe.event_id = ce.id::text
         WHERE ce.sport = 'football'
           AND ce.start_time_utc::date = $1::date
         ORDER BY ce.start_time_utc ASC`,
        [date]
    );
    return res.rows || [];
}

async function fetchInjuriesByDate(date) {
    const response = await footballClient.requestWithRotation('football', 'injuries', { date });
    return response?.response || [];
}

async function upsertInjurySnapshot(client, row) {
    await client.query(
        `INSERT INTO event_injury_snapshots (
            event_id,
            sport,
            fixture_provider_id,
            fixture_date,
            kickoff_time,
            team_provider_id,
            team_name,
            player_provider_id,
            player_name,
            status_type,
            status_reason,
            source,
            raw_payload
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (event_id, team_provider_id, player_provider_id, status_type, status_reason)
        DO UPDATE SET
            team_name = EXCLUDED.team_name,
            player_name = EXCLUDED.player_name,
            raw_payload = EXCLUDED.raw_payload`,
        [
            row.event_id,
            'football',
            row.fixture_provider_id,
            row.fixture_date,
            row.kickoff_time,
            row.team_provider_id,
            row.team_name,
            row.player_provider_id,
            row.player_name,
            row.status_type,
            row.status_reason,
            'API-SPORTS',
            JSON.stringify(row.raw_payload || {})
        ]
    );
}

async function geocodeCity(city, country) {
    const key = `${normalizeText(city)}|${canonicalCountryName(country)}`;
    if (geocodeCache.has(key)) return geocodeCache.get(key);

    const promise = (async () => {
        if (!city) return null;

        const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
        url.searchParams.set('name', city);
        url.searchParams.set('count', '10');
        url.searchParams.set('language', 'en');
        url.searchParams.set('format', 'json');

        const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) {
            throw new Error(`Geocoding failed for ${city}: ${response.status}`);
        }

        const body = await response.json();
        const candidates = Array.isArray(body.results) ? body.results : [];
        if (!candidates.length) return null;

        const targetCountry = canonicalCountryName(country);
        const exactCountry = candidates.find((candidate) => canonicalCountryName(candidate.country) === targetCountry);
        return exactCountry || candidates[0];
    })();

    geocodeCache.set(key, promise);
    return promise;
}

async function fetchWeatherSnapshotForEvent(event) {
    if (!event.venue_city) {
        return {
            event_id: event.event_id,
            weather: null,
            geocode: null,
            error: 'Missing venue city'
        };
    }

    const geocode = await geocodeCity(event.venue_city, event.venue_country);
    if (!geocode) {
        return {
            event_id: event.event_id,
            weather: null,
            geocode: null,
            error: 'No geocode result'
        };
    }

    const date = toIsoDate(event.start_time_utc);
    if (!date) {
        return {
            event_id: event.event_id,
            weather: null,
            geocode,
            error: 'Invalid kickoff time'
        };
    }

    const url = new URL('https://archive-api.open-meteo.com/v1/archive');
    url.searchParams.set('latitude', String(geocode.latitude));
    url.searchParams.set('longitude', String(geocode.longitude));
    url.searchParams.set('start_date', date);
    url.searchParams.set('end_date', date);
    url.searchParams.set('hourly', 'temperature_2m,precipitation,weather_code,wind_speed_10m');
    url.searchParams.set('timezone', 'UTC');

    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) {
        throw new Error(`Weather fetch failed for ${event.event_id}: ${response.status}`);
    }

    const body = await response.json();
    const idx = nearestHourlyIndex(body?.hourly?.time || [], event.start_time_utc);
    if (idx === -1) {
        return {
            event_id: event.event_id,
            weather: null,
            geocode,
            error: 'No hourly weather row for kickoff'
        };
    }

    const weather = {
        temperature_c: body.hourly.temperature_2m[idx] ?? null,
        precipitation_mm: body.hourly.precipitation[idx] ?? null,
        weather_code: body.hourly.weather_code[idx] ?? null,
        wind_speed_kmh: body.hourly.wind_speed_10m[idx] ?? null,
        weather_summary: weatherCodeToSummary(body.hourly.weather_code[idx] ?? null),
        geocode,
        raw_payload: body
    };

    return {
        event_id: event.event_id,
        weather,
        geocode,
        error: null
    };
}

async function upsertWeatherSnapshot(client, event, weatherSnapshot) {
    await client.query(
        `INSERT INTO event_weather_snapshots (
            event_id,
            sport,
            fixture_date,
            kickoff_time,
            venue_name,
            venue_city,
            venue_country,
            latitude,
            longitude,
            resolved_timezone,
            temperature_c,
            precipitation_mm,
            wind_speed_kmh,
            weather_code,
            weather_summary,
            source,
            geocode_payload,
            raw_payload,
            updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
        ON CONFLICT (event_id)
        DO UPDATE SET
            venue_name = EXCLUDED.venue_name,
            venue_city = EXCLUDED.venue_city,
            venue_country = EXCLUDED.venue_country,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            resolved_timezone = EXCLUDED.resolved_timezone,
            temperature_c = EXCLUDED.temperature_c,
            precipitation_mm = EXCLUDED.precipitation_mm,
            wind_speed_kmh = EXCLUDED.wind_speed_kmh,
            weather_code = EXCLUDED.weather_code,
            weather_summary = EXCLUDED.weather_summary,
            geocode_payload = EXCLUDED.geocode_payload,
            raw_payload = EXCLUDED.raw_payload,
            updated_at = NOW()`,
        [
            event.event_id,
            'football',
            toIsoDate(event.start_time_utc),
            event.start_time_utc,
            event.venue_name,
            event.venue_city,
            event.venue_country,
            weatherSnapshot.geocode?.latitude ?? null,
            weatherSnapshot.geocode?.longitude ?? null,
            weatherSnapshot.geocode?.timezone ?? null,
            weatherSnapshot.weather.temperature_c,
            weatherSnapshot.weather.precipitation_mm,
            weatherSnapshot.weather.wind_speed_kmh,
            weatherSnapshot.weather.weather_code,
            weatherSnapshot.weather.weather_summary,
            'open-meteo',
            JSON.stringify(weatherSnapshot.geocode || {}),
            JSON.stringify(weatherSnapshot.weather.raw_payload || {})
        ]
    );
}

async function upsertNewsSnapshot(client, row, queryText, rawPayload) {
    await client.query(
        `INSERT INTO event_news_snapshots (
            event_id,
            sport,
            fixture_date,
            kickoff_time,
            team_name,
            opponent_name,
            signal_type,
            signal_label,
            signal_strength,
            relevance_score,
            sentiment_score,
            evidence_keywords,
            article_title,
            article_summary,
            article_url,
            source_name,
            source_url,
            published_at,
            query_text,
            source,
            raw_payload,
            updated_at
        )
        VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
            $13,$14,$15,$16,$17,$18,$19,$20,$21,NOW()
        )
        ON CONFLICT (event_id, team_name, signal_type, article_title, article_url)
        DO UPDATE SET
            signal_label = EXCLUDED.signal_label,
            signal_strength = EXCLUDED.signal_strength,
            relevance_score = EXCLUDED.relevance_score,
            sentiment_score = EXCLUDED.sentiment_score,
            evidence_keywords = EXCLUDED.evidence_keywords,
            article_summary = EXCLUDED.article_summary,
            source_name = EXCLUDED.source_name,
            source_url = EXCLUDED.source_url,
            published_at = EXCLUDED.published_at,
            query_text = EXCLUDED.query_text,
            raw_payload = EXCLUDED.raw_payload,
            updated_at = NOW()`,
        [
            row.event_id,
            row.sport,
            row.fixture_date,
            row.kickoff_time,
            row.team_name,
            row.opponent_name,
            row.signal_type,
            row.signal_label,
            row.signal_strength,
            row.relevance_score,
            row.sentiment_score,
            row.evidence_keywords,
            row.article_title,
            row.article_summary,
            row.article_url,
            row.source_name,
            row.source_url,
            row.published_at,
            queryText,
            'google-news-rss',
            JSON.stringify(rawPayload || {})
        ]
    );
}

async function main() {
    const { date, sport } = parseArgs(process.argv.slice(2));
    if (sport !== 'football') {
        throw new Error('This backfill currently supports only --sport=football.');
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    try {
        await ensureTables(client);
        const events = await fetchEventsForDate(client, date);
        if (!events.length) {
            console.log(`No football canonical_events found for ${date}.`);
            return;
        }

        const injuries = await fetchInjuriesByDate(date);
        const eventByFixtureId = new Map(
            events
                .filter((event) => event.fixture_provider_id)
                .map((event) => [String(event.fixture_provider_id), event])
        );

        let insertedInjuries = 0;
        for (const injury of injuries) {
            const fixtureId = injury?.fixture?.id ? String(injury.fixture.id) : null;
            const event = fixtureId ? eventByFixtureId.get(fixtureId) : null;
            if (!event) continue;

            await upsertInjurySnapshot(client, {
                event_id: event.event_id,
                fixture_provider_id: fixtureId,
                fixture_date: date,
                kickoff_time: event.start_time_utc,
                team_provider_id: injury?.team?.id ? String(injury.team.id) : null,
                team_name: injury?.team?.name || null,
                player_provider_id: injury?.player?.id ? String(injury.player.id) : null,
                player_name: injury?.player?.name || null,
                status_type: injury?.player?.type || null,
                status_reason: injury?.player?.reason || null,
                raw_payload: injury
            });
            insertedInjuries += 1;
        }

        let weatherSnapshots = 0;
        let weatherErrors = 0;
        const weatherConcurrency = 8;
        for (let i = 0; i < events.length; i += weatherConcurrency) {
            const batch = events.slice(i, i + weatherConcurrency);
            const settled = await Promise.allSettled(batch.map((event) => fetchWeatherSnapshotForEvent(event)));

            for (const result of settled) {
                if (result.status === 'fulfilled' && result.value.weather) {
                    const snapshot = result.value;
                    const event = batch.find((candidate) => candidate.event_id === snapshot.event_id);
                    if (event) {
                        await upsertWeatherSnapshot(client, event, snapshot);
                        weatherSnapshots += 1;
                    } else {
                        weatherErrors += 1;
                    }
                } else {
                    weatherErrors += 1;
                }
            }
        }

        let newsQueries = 0;
        let newsRowsUpserted = 0;
        let newsArticlesMatched = 0;
        let newsErrors = 0;

        for (const event of events) {
            const kickoff = event.start_time_utc ? new Date(event.start_time_utc) : null;
            const lowerBound = kickoff ? kickoff.getTime() - (72 * 60 * 60 * 1000) : null;
            const feed = await fetchGoogleNewsForEvent(event);
            newsQueries += 1;

            if (feed.error) {
                newsErrors += 1;
                await sleep(1200);
                continue;
            }

            const matchedKeys = new Set();
            for (const article of feed.items) {
                const publishedAtMs = article.publishedAt ? new Date(article.publishedAt).getTime() : null;
                if (kickoff && Number.isFinite(publishedAtMs)) {
                    if (publishedAtMs > kickoff.getTime()) continue;
                    if (lowerBound !== null && publishedAtMs < lowerBound) continue;
                }

                const candidates = [
                    buildNewsSignal(article, event, event.home_team_name, event.away_team_name),
                    buildNewsSignal(article, event, event.away_team_name, event.home_team_name)
                ].filter(Boolean);

                for (const candidate of candidates) {
                    const dedupeKey = [
                        candidate.event_id,
                        candidate.team_name,
                        candidate.signal_type,
                        candidate.article_title,
                        candidate.article_url || ''
                    ].join('|');

                    if (matchedKeys.has(dedupeKey)) continue;
                    matchedKeys.add(dedupeKey);

                    await upsertNewsSnapshot(client, candidate, feed.query, {
                        article,
                        homeTeam: event.home_team_name,
                        awayTeam: event.away_team_name
                    });
                    newsRowsUpserted += 1;
                }

                if (candidates.length) {
                    newsArticlesMatched += 1;
                }
            }

            await sleep(1200);
        }

        console.log(JSON.stringify({
            date,
            sport,
            events: events.length,
            injuryRowsUpserted: insertedInjuries,
            weatherRowsUpserted: weatherSnapshots,
            weatherMisses: weatherErrors,
            newsQueries,
            newsRowsUpserted,
            newsArticlesMatched,
            newsErrors
        }, null, 2));
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
