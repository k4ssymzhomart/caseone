-- Rota · extensions
-- pgcrypto: bcrypt for the seeded test accounts, digests.
-- pg_net and pg_cron: the watchdog and calls from the database to Edge Functions (Phase 4).
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
