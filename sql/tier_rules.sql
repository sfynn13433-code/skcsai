insert into tier_rules (tier, min_confidence, allowed_markets, max_acca_size, allowed_volatility)
values
    (
        'normal',
        60,
        '["1X2","double_chance","over_2_5","btts_yes"]'::jsonb,
        3,
        '["low","medium"]'::jsonb
    ),
    (
        'deep',
        75,
        '["ALL"]'::jsonb,
        5,
        '["low"]'::jsonb
    )
on conflict (tier) do update set
    min_confidence = excluded.min_confidence,
    allowed_markets = excluded.allowed_markets,
    max_acca_size = excluded.max_acca_size,
    allowed_volatility = excluded.allowed_volatility;
