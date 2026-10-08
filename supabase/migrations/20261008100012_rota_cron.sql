-- Rota · schedules (Supabase Cron). The watchdog runs every 5 seconds (CLAUDE.md §9).
-- pg_cron logs every run, so old run details are purged daily.
select cron.schedule('rota-watchdog', '5 seconds', $$select internal.watchdog_tick()$$);
select cron.schedule('rota-cron-cleanup', '17 21 * * *',
                     $$delete from cron.job_run_details where end_time < now() - interval '1 day'$$);
