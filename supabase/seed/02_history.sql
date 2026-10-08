-- Rota · 3 months of synthetic history with the planted patterns (tools/seed/PATTERNS.md),
-- then the Demo Day start state. Wipes every order first: run once on a fresh project, or on purpose.
select internal.generate_history();
select internal.demo_reset();
