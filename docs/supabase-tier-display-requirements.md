# Supabase Tier Display Requirements

This build now treats the two 30-day plans as master pools:

- `core_30day_limitless` is the master pool for all Core plans
- `elite_30day_deep_vip` is the master pool for all Elite plans

Lower plans are cut down from those master pools in the API layer. That means you do **not** need separate database tiers for every plan. You do need enough source predictions in Supabase for the master pools to satisfy the promised daily counts.

## What Must Exist In Supabase

The API reads from `predictions_final` and expects rows to contain:

- `tier`
  - `normal` for Core family
  - `deep` for Elite family
- `type`
  - supported display values are `direct`, `secondary`, `multi`, `same_match`, `acca_6match`
  - legacy `single` and `acca` still work as fallback, but they are not enough to fill every section
- `matches` JSON
  - each match should include `sport`, `market`, `match_id`
  - each match should include `metadata.match_time`
  - each match should include `metadata.league`

## Minimum Master Pool Targets

To fully satisfy the website promises, the **master pools** need at least these daily counts:

### Core Master Pool

Plan source: `core_30day_limitless`

- Monday and Tuesday: `10 direct`, `8 secondary`, `5 multi`, `5 same_match`, `3 acca_6match`
- Wednesday and Thursday: `15 direct`, `10 secondary`, `7 multi`, `6 same_match`, `4 acca_6match`
- Friday: `20 direct`, `12 secondary`, `8 multi`, `8 same_match`, `5 acca_6match`
- Saturday: `30 direct`, `15 secondary`, `10 multi`, `10 same_match`, `8 acca_6match`
- Sunday: `25 direct`, `14 secondary`, `9 multi`, `9 same_match`, `6 acca_6match`

### Elite Master Pool

Plan source: `elite_30day_deep_vip`

- Monday and Tuesday: `15 direct`, `12 secondary`, `8 multi`, `8 same_match`, `5 acca_6match`
- Wednesday and Thursday: `22 direct`, `15 secondary`, `10 multi`, `10 same_match`, `7 acca_6match`
- Friday: `30 direct`, `18 secondary`, `12 multi`, `12 same_match`, `10 acca_6match`
- Saturday: `45 direct`, `25 secondary`, `18 multi`, `18 same_match`, `15 acca_6match`
- Sunday: `35 direct`, `22 secondary`, `15 multi`, `15 same_match`, `12 acca_6match`

## SQL Checks

Use these in the Supabase SQL editor to validate whether the database can fill a given family.

### Check today's Core supply

```sql
select
  coalesce(type, 'single') as type,
  count(*) as row_count
from predictions_final
where tier = 'normal'
  and created_at >= now() - interval '1 day'
group by coalesce(type, 'single')
order by type;
```

### Check today's Elite supply

```sql
select
  coalesce(type, 'single') as type,
  count(*) as row_count
from predictions_final
where tier = 'deep'
  and created_at >= now() - interval '1 day'
group by coalesce(type, 'single')
order by type;
```

### Check missing section metadata

```sql
select id, tier, type, created_at, matches
from predictions_final
where matches::text not like '%"match_time"%'
   or matches::text not like '%"league"%'
order by created_at desc
limit 50;
```

## Important Limitation

If Supabase only contains `single` and `acca` rows, the frontend cannot honestly fill the `secondary` and `same_match` sections to the promised counts. The pipeline must write enough category-specific rows into `predictions_final` for:

- `direct`
- `secondary`
- `multi`
- `same_match`
- `acca_6match`

Without those rows, the API will still cap and filter correctly, but some sections will remain partially filled.
