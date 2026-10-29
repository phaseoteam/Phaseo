-- phaseo:allow-destructive-migration reason: The Monitor history page was removed in #2683 and its feed stopped updating on 2026-09-28 when the catalogue JSON was retired (#3334). Nothing reads these tables or RPCs; the user approved dropping them on 2026-10-29.
drop function if exists public.get_monitor_history_page(text, text, text, integer, integer);
drop function if exists public.get_monitor_history_stats(text, text, text);
drop function if exists public.get_monitor_history_filter_options();
drop table if exists public.monitor_history_events;
drop table if exists public.monitor_history_commits;
drop table if exists public.monitor_history_sync_state;
