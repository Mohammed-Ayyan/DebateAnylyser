# Deployment and operations

## Runtime topology

Deploy four explicit process roles from the same immutable release artifact:

- **web**: `npm start`; serves Next.js and requires PostgreSQL, Redis, OIDC, and a session secret. Run at least two instances behind TLS termination when availability requires it.
- **analysis-worker**: `npm run worker`; claims analysis jobs from PostgreSQL. It requires Deepgram and requires other provider credentials only for feature flags that are enabled.
- **m10-worker**: `npm run worker:m10`; performs retention/deletion work and enabled HTML/JSON exports. Run as a separately scalable singleton or small pool; database claims provide coordination.
- **migration**: `npm run db:migrate`; a one-shot release task. It must complete before new web and worker processes receive traffic.

Never run web and workers in the same process. Give each role a dedicated service account and only its required secrets. Run `npm run runtime:check -- <role>` in a deployment pre-start check; the shipped entry points also validate their own roles.

## Database preflight and certification

Migrations `0005_broken_captain_cross` through `0008_dapper_puck` were audited as an additive, ordered chain. No schema defect requiring a follow-up migration was found, so the applied files must remain immutable.

Before release:

1. Use a dedicated, disposable PostgreSQL test instance matching the production major version.
2. Set `MIGRATION_TEST_ADMIN_URL` to an administrator database on that test instance (normally the `postgres` database). It must not equal `DATABASE_URL`; there is deliberately no fallback.
3. Run `npm run db:migrate:verify`. The script creates uniquely named `debate_migration_cert_*` databases, certifies a clean install and upgrades after 0004, 0005, 0006, and 0007, verifies the final schema and `citext`, and drops only databases it created.
4. Run `npm run db:check`. Do not run certification against a production cluster even though it uses isolated databases.

Migration 0000 executes `CREATE EXTENSION IF NOT EXISTS citext`. The migration identity therefore needs permission to install `citext`, or an administrator must install this trusted extension in the application database before the first migration. Confirm it with `select extname from pg_extension where extname = 'citext';`.

## Controlled 0005-0008 procedure

1. Confirm the migration journal and SQL files in the release artifact are byte-for-byte reviewed and that the current database has applied through the expected baseline (0004, 0005, 0006, or 0007).
2. Take and validate a restorable physical snapshot or logical backup. Record the recovery point and retain it until post-release verification completes.
3. Stop analysis and M10 workers. Drain writes or place the web tier in maintenance/read-only mode. Keep one migration process only.
4. Review active transactions and long-running queries. The migrations create tables, enum types, indexes, foreign keys, and bounded data updates; PostgreSQL may take locks on referenced tables. Choose a maintenance window, set conservative `lock_timeout`/`statement_timeout` at the deployment platform, and never kill unrelated sessions automatically.
5. Ensure `citext` is installed and the migration role owns or can alter the application schema. Run `npm run runtime:check -- migration`, then `npm run db:migrate` once.
6. The pending files must apply in this exact order:
   - **0005**: evidence/source and Toulmin structure tables, indexes, constraints, then eligible S2-S4 jobs are advanced to S6.
   - **0006**: credibility and possible-fallacy tables, then eligible S4/S6 jobs are advanced without replaying completed S6 work.
   - **0007**: annotations and contests with active-record uniqueness and resolution-shape constraints.
   - **0008**: data events, HTML/JSON exports, operation jobs, retention schedules, and shares; bounded-retention analyses are backfilled with schedules.
7. Start the new web tier, check readiness, then start M10 and analysis workers. Do not run old workers against the new queue transitions during the migration window.

## Post-migration verification

- `npm run db:check` reports no drift in the release artifact.
- Confirm the migration journal records each pending migration exactly once.
- Confirm the 0005-0008 tables and indexes exist, and `retention_schedules` contains one row for each non-deleted analysis whose retention setting is `30d` or `90d`.
- Inspect counts of jobs moved by 0005 and 0006 before workers resume. Investigate unexpected increases; do not edit rows merely to make counts match an estimate.
- Exercise `GET /api/health/live` and `GET /api/health/ready`. Readiness must be HTTP 200 before routing traffic.
- Import-smoke both workers with `npm run workers:smoke`; this does not claim jobs or contact providers.

There are no destructive down migrations. If application verification fails before writes resume, restore the pre-release backup to a separately provisioned database and redirect the previous release through the normal incident procedure. After writes resume, prefer a reviewed forward-fix migration: never rewrite 0005-0008, delete migration journal rows, or manually drop their objects. A restore discards post-backup writes and therefore requires incident-owner approval and an explicit recovery-point decision.

## Storage and providers

Object storage must be private, encrypted, versioned according to the retention policy, and blocked from public access. Use a dedicated bucket/prefix, lifecycle rules that do not delete objects before database retention jobs, and workload identity where available. Static access keys must be supplied as a pair and rotated. Validate CORS only for the web origin when direct uploads are enabled.

Provider and feature controls are fail-closed:

- `CLAIM_EXTRACTION_ENABLED`, `SUPPORT_ASSESSMENT_ENABLED`, `ARGUMENT_STRUCTURE_ENABLED`, `FALLACY_DETECTION_ENABLED`, `EVIDENCE_RETRIEVAL_ENABLED`, and `SOURCE_CREDIBILITY_ENABLED` default to `false`. Disabled providers need no credentials and appear as `disabled` in readiness metadata.
- Deepgram ASR is the configured transcription provider for the analysis-worker role and needs `DEEPGRAM_API_KEY`.
- S2–S5 use Groq through the existing OpenAI-compatible Responses adapter and share `GROQ_API_KEY`; each stage requires it only when its corresponding flag is enabled.
- S6 evidence retrieval and S7 source credibility remain deferred and must stay disabled. Do not configure placeholder endpoints or generic LLM-generated credibility ratings.
- Provider URLs should be HTTPS and egress-allowlisted. Readiness performs no paid or content-bearing external-provider call; it reports configuration state only.

Do not change a flag and credential in separate uncoordinated releases. Add the secret first, validate the target role, then enable the reviewed flag. Disabling a flag is safe and does not erase prior findings.

## Legal and publication flags

`LEGAL_ALLOW_UPLOADS` and `LEGAL_ALLOW_PASTE` stay false until counsel approves the exact `LEGAL_POLICY_VERSION` and `LEGAL_COUNSEL_APPROVED=true`. URL host allow/block lists and official-API-required hosts are policy controls, not provider enablement. Never enable a legal gate merely to satisfy a health check.

Public sharing, report HTML export, and account JSON export are independent and default off. Public sharing and report export require `PUBLICATION_COUNSEL_APPROVED=true`, policy/disclaimer versions, and an HTTPS limitations URL. Account-data export is separately gated and does not require publication counsel. Both export workers require object storage. `PDF_EXPORT_ENABLED` is intentionally fixed to `false`: PDF rendering, font embedding, pagination, accessibility, and sanitization have not been operationally approved. HTML and JSON remain the only supported artifacts.

## Health checks

- **Liveness**: `GET /api/health/live` returns 200 when the process can serve requests. It does not contact dependencies and must not be used to admit traffic.
- **Readiness**: `GET /api/health/ready` performs bounded `select 1` and Redis `PING` checks plus web-role configuration validation. It returns 503 if a required dependency is unavailable.
- Responses contain only `ok`/`error` dependency states and provider `disabled`/`configured`/`not_configured` states. They contain no URLs, account names, tokens, exception messages, or secret values.

Use a short initial delay, a probe timeout slightly above `HEALTHCHECK_TIMEOUT_MS`, and multiple consecutive failures before restart. A readiness failure should remove an instance from traffic; it should not trigger database migration or secret rotation automatically.

## Secret handling

Keep `.env.example` as documentation only. Store real values in the deployment platform's secret manager, inject them at process start, restrict read access by runtime role, and prevent them from entering build logs, images, crash reports, analytics, or health responses. Use separate credentials for PostgreSQL application access, migrations, object storage, OIDC, and each external provider. Rotate session and provider secrets through a documented overlap/revocation procedure and audit access. Never place `MIGRATION_TEST_ADMIN_URL` in a production service definition.

## OIDC authentication

Set `APP_ENV=prod` for production and `APP_ENV=staging` for staging. `APP_ENV=dev` exposes a fixed local development-session endpoint that accepts no identity or credential input, provisions one clearly marked local identity through the normal identity repository, and issues the normal signed application cookie. Never use `APP_ENV=dev` in a deployed environment; staging and production values make this endpoint return unavailable.

The web role uses a confidential OpenID Connect client and Authorization Code flow with PKCE. Configure `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URL`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, and an independently generated `SESSION_SECRET`. Shipped example values are rejected by runtime validation.

Register `${APP_ORIGIN}/api/v1/auth/callback` as an exact allowed callback and `${APP_ORIGIN}/` as an exact post-logout redirect. The provider must publish OpenID discovery and an RS256 JWKS, issue ID tokens containing `sub`, `email`, and `nonce`, and issue an access token for `AUTH_AUDIENCE`. Passwords, recovery, email verification, and MFA remain provider-managed.

The callback validates signed transaction state, PKCE, issuer, client audience, API audience, nonce, expiry, matching token subjects, and email shape before provisioning a user and issuing the HTTP-only application session. Keep the client secret and session secret in the deployment secret manager. Never expose either as a `NEXT_PUBLIC_` variable.