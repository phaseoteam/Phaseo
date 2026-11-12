# Frozen replay baseline

This directory is not deployed to production. `schema.sql` is a generated
empty-database baseline from the 2026-10-04 production schema export.
`history.sha256` freezes the 756 historical migrations it represents.
Keep both immutable. New changes belong in `../schemas/` and forward migrations.

Generation provenance:

- Supabase CLI 2.119.0 with strict coverage and no apply.
- Source commit: `16811606fbaec168c083ce3be83b6469cfdb206b`.
- CI run: https://github.com/phaseoteam/Phaseo/actions/runs/37237888760.
- Artifact: `baseline-candidate`, ID `11316083332`.
- Artifact ZIP SHA-256: `d69488aa927d950ed1326523a9f7c52cf862ed9b358a60c3cc1f1309b3fa399c`.
