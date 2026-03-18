insert into acca_rules (rule_name, rule_value)
values
    ('no_same_match', 'true'::jsonb),
    ('no_conflicting_markets', 'true'::jsonb),
    ('max_per_match', '1'::jsonb),
    ('allow_high_volatility', 'false'::jsonb)
on conflict (rule_name) do update set
    rule_value = excluded.rule_value;
