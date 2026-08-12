# Requirements Document

## Introduction

This specification defines a final-certification workflow for the currently supported Debate Analyser functionality. Certification prioritizes real Groq stages S2–S5, preserves the certified Deepgram S1 behavior, verifies required data services, gates browser coverage on service reachability, runs the complete Node 24 regression suite, permits only evidence-backed regression fixes, and produces a secret-safe factual report. The workflow creates certification evidence; automated success alone does not establish production readiness.

## Glossary

- **Certification_Workflow**: The ordered, executable verification process defined by this specification.
- **Certification_Run**: One execution of the Certification_Workflow on Windows with Node.js major version 24.
- **Certification_Report**: The final secret-safe record of statuses, exact test results, and deployment blockers from a Certification_Run.
- **Certification_Artifact**: A repository file that records commands, outcomes, classifications, or the Certification_Report without storing secrets or full sensitive provider responses.
- **Task_DAG**: The directed acyclic graph of executable certification tasks and dependency gates.
- **Leaf_Task**: An independently executable Task_DAG task that can be delegated to the spec-task-execution tool.
- **Stage**: A numbered analysis pipeline operation from S1 through S7.
- **S1**: Real Deepgram transcription and diarization using the existing Deepgram provider.
- **S2**: Real Groq claim extraction using the existing claim provider and deterministic validation.
- **S3**: Real Groq support assessment using validated S2 output and the existing support provider.
- **S4**: Real Groq argument-structure mapping using validated upstream output and the existing structure provider.
- **S5**: Real Groq fallacy detection using validated upstream output and the existing fallacy provider.
- **S6**: Deferred evidence retrieval, excluded from this Certification_Workflow.
- **S7**: Deferred source credibility, excluded from this Certification_Workflow.
- **Sequential_Data_Flow**: The dependency order S2 → S3 → S4 → S5 in which each downstream Stage consumes validated upstream results.
- **Deterministic_Validator**: An existing AJV schema validator or Zod validator that produces repeatable validation outcomes for identical input.
- **Stage_Result**: One independently recorded Stage status with a safe summary, attempt count when available, and failure or blocked reason.
- **PASS**: The check executed and satisfied its defined acceptance condition.
- **FAIL**: The check executed and did not satisfy its defined acceptance condition.
- **BLOCKED**: The check did not execute because a required upstream dependency failed or was unavailable.
- **DEFERRED**: The capability is explicitly outside this Certification_Workflow and was not inspected, modified, debugged, configured, or tested.
- **Environment_Failure**: A failed or blocked check caused by unavailable tools, services, credentials, operating-system facilities, or external infrastructure rather than repository behavior.
- **Application_Defect**: A reproducible failure caused by repository code or configuration while required execution dependencies are available.
- **Exact_Result**: A result containing command identity, exit status, and exact passed, failed, skipped, and total counts whenever the tool exposes those counts.
- **Sensitive_Response**: A complete or materially revealing external-provider response, database response, authentication response, or payload containing private data.
- **Secret_Safe**: A handling rule that permits presence and format checks but prohibits output of secret values, credential-bearing URLs, authorization headers, or Sensitive_Responses.
- **DATABASE_URL**: The configured PostgreSQL connection URL, treated as a secret.
- **REDIS_URL**: The configured Redis connection URL, treated as a secret.
- **MIGRATION_TEST_ADMIN_URL**: The optional administrative PostgreSQL URL that enables migration verification, treated as a secret.
- **Database_Gate**: A successful PostgreSQL connectivity check using DATABASE_URL.
- **Redis_Gate**: A successful Redis PING using REDIS_URL.
- **Drizzle_Check**: The existing `drizzle-kit check` schema consistency command.
- **Migration_Verification**: Execution of the existing `scripts/verify-migrations.ts` without modifying migration files.
- **E2E_Suite**: The complete existing Playwright suite for desktop-chromium and mobile-chromium.
- **Regression_Suite**: Prettier check, ESLint with zero warnings, TypeScript no-emit check, full Vitest, worker import smoke, Drizzle_Check, and production build.
- **UI_UX_Regression**: A reproducible user-interface or user-experience failure demonstrated by certification evidence.
- **Design_System**: The repository's existing visual tokens, components, interaction patterns, and responsive conventions.
- **Tour**: The existing Driver.js onboarding behavior.
- **Deployment_Blocker**: A verified unresolved condition preventing deployment of currently supported functionality.
- **Currently_Supported_Functionality**: S1–S5 and the existing application behavior excluding S6, S7, Auth0 work, Live Debate, and PDF.
- **AUTH0**: All Auth0-related inspection, modification, debugging, configuration, and testing.
- **Live_Debate**: The deferred live-debate capability.
- **PDF**: The deferred PDF capability.
- **No_Scoring_Invariant**: The existing rule that analysis outputs do not introduce an overall debate, speaker, or person score.
- **Preserved_Interfaces**: Existing prompts, schemas, validators, retry behavior, lifecycle behavior, traceability, safety controls, database interfaces, UI interfaces, and provider interfaces.

## Requirements

### Requirement 1: Safe executable certification plan

**User Story:** As a release owner, I want an ordered and delegatable certification plan, so that checks run safely and produce traceable evidence.

#### Acceptance Criteria

1. THE Certification_Workflow SHALL execute on Windows with Node.js major version 24.
2. THE Task_DAG SHALL place real provider certification before database, Redis, E2E, regression, UI/UX, and Tour checks.
3. THE Task_DAG SHALL define every executable check as a Leaf_Task delegatable to the spec-task-execution tool.
4. THE Task_DAG SHALL define dependency edges that prevent a task from running before each required gate completes.
5. WHEN a Leaf_Task completes, THE Certification_Workflow SHALL record the command identity, outcome, and safe evidence in a Certification_Artifact.
6. IF a Leaf_Task cannot execute because a dependency is unavailable, THEN THE Certification_Workflow SHALL record BLOCKED with the dependency reason.
7. THE Certification_Workflow SHALL exclude application implementation and certification execution during specification creation.

### Requirement 2: Real Groq S2–S5 certification

**User Story:** As a release owner, I want honest real-provider verification of S2–S5, so that each currently supported Groq stage has independently validated evidence.

#### Acceptance Criteria

1. WHEN Groq certification begins, THE Certification_Workflow SHALL verify S2 with the existing real Groq claim provider and existing Deterministic_Validator.
2. WHEN S2 returns validated output, THE Certification_Workflow SHALL provide the validated S2 result to S3 through Sequential_Data_Flow.
3. WHEN S3 receives validated S2 output, THE Certification_Workflow SHALL verify S3 with the existing real Groq support provider and existing Deterministic_Validator.
4. WHEN S3 returns validated output, THE Certification_Workflow SHALL provide the validated S3 result to S4 through Sequential_Data_Flow.
5. WHEN S4 receives validated upstream output, THE Certification_Workflow SHALL verify S4 with the existing real Groq structure provider and existing Deterministic_Validator.
6. WHEN S4 returns validated output, THE Certification_Workflow SHALL provide the validated S4 result to S5 through Sequential_Data_Flow.
7. WHEN S5 receives validated upstream output, THE Certification_Workflow SHALL verify S5 with the existing real Groq fallacy provider and existing Deterministic_Validator.
8. WHEN a Groq Stage finishes, THE Certification_Workflow SHALL record an independent Stage_Result for that Stage.
9. IF a Groq Stage fails, THEN THE Certification_Workflow SHALL record each dependent downstream Groq Stage as BLOCKED without invoking the downstream provider.
10. IF a Groq Stage fails, THEN THE Certification_Workflow SHALL continue recording independent outcomes for checks that do not depend on the failed Stage.
11. THE Certification_Workflow SHALL preserve the Sequential_Data_Flow across S2, S3, S4, and S5.
12. WHERE an honest independent Stage_Result requires a script correction, THE Certification_Workflow SHALL limit provider-certification script changes to `scripts/verify-real-providers.ts`.
13. THE Certification_Workflow SHALL preserve existing provider prompts, schemas, validators, retry behavior, lifecycle behavior, traceability, safety controls, provider interfaces, and the No_Scoring_Invariant.

### Requirement 3: Preserve certified Deepgram S1

**User Story:** As a release owner, I want the certified S1 integration protected, so that final certification does not destabilize transcription.

#### Acceptance Criteria

1. THE Certification_Workflow SHALL retain the existing S1 Deepgram provider behavior as the certification baseline.
2. WHEN provider certification runs, THE Certification_Workflow SHALL execute the existing real S1 Deepgram transcription and diarization check.
3. WHEN the S1 check completes, THE Certification_Workflow SHALL record an independent S1 Stage_Result.
4. IF S1 produces a reproducible Application_Defect, THEN THE Certification_Workflow SHALL permit the minimum S1 correction required to restore baseline behavior.
5. IF S1 does not produce a reproducible Application_Defect, THEN THE Certification_Workflow SHALL leave S1 implementation unchanged.

### Requirement 4: Secret-safe service and schema verification

**User Story:** As a release owner, I want data-service and schema checks without credential disclosure or migration changes, so that infrastructure readiness is assessed safely.

#### Acceptance Criteria

1. WHEN database verification begins, THE Certification_Workflow SHALL check PostgreSQL connectivity using DATABASE_URL without displaying the URL value.
2. WHEN Redis verification begins, THE Certification_Workflow SHALL issue a Redis PING using REDIS_URL without displaying the URL value.
3. WHEN the Database_Gate completes, THE Certification_Workflow SHALL record DATABASE as PASS, FAIL, or BLOCKED with a Secret_Safe reason.
4. WHEN the Redis_Gate completes, THE Certification_Workflow SHALL record REDIS as PASS, FAIL, or BLOCKED with a Secret_Safe reason.
5. WHEN schema verification begins, THE Certification_Workflow SHALL execute the Drizzle_Check.
6. WHERE MIGRATION_TEST_ADMIN_URL is configured, THE Certification_Workflow SHALL execute Migration_Verification with the existing `scripts/verify-migrations.ts`.
7. WHERE MIGRATION_TEST_ADMIN_URL is absent, THE Certification_Workflow SHALL record Migration_Verification as not executed because the optional configuration is absent.
8. THE Certification_Workflow SHALL preserve every file under `drizzle/` without modification.
9. THE Certification_Workflow SHALL classify service connection failures as Environment_Failure unless repository evidence demonstrates an Application_Defect.

### Requirement 5: Gated complete Playwright certification

**User Story:** As a release owner, I want complete desktop and mobile browser evidence after service readiness, so that browser failures are meaningful and accurately classified.

#### Acceptance Criteria

1. WHILE the Database_Gate lacks PASS status, THE Certification_Workflow SHALL keep the E2E_Suite BLOCKED.
2. WHILE the Redis_Gate lacks PASS status, THE Certification_Workflow SHALL keep the E2E_Suite BLOCKED.
3. WHEN the Database_Gate and Redis_Gate both have PASS status, THE Certification_Workflow SHALL execute the complete existing E2E_Suite.
4. WHEN desktop-chromium completes, THE Certification_Workflow SHALL record exact passed, failed, skipped, and total desktop-chromium counts.
5. WHEN mobile-chromium completes, THE Certification_Workflow SHALL record exact passed, failed, skipped, and total mobile-chromium counts.
6. WHEN the E2E_Suite completes, THE Certification_Workflow SHALL record exact aggregate passed, failed, skipped, and total counts.
7. WHEN an E2E check fails, THE Certification_Workflow SHALL classify the result as Environment_Failure or Application_Defect with supporting evidence.
8. THE Certification_Workflow SHALL preserve existing authentication behavior without redesign or bypass.
9. THE Certification_Workflow SHALL prohibit fake providers, fake authentication, and fake application data as substitutes for required certification dependencies.

### Requirement 6: Full Node 24 regression

**User Story:** As a release owner, I want the full regression suite on the target runtime, so that supported functionality is checked consistently.

#### Acceptance Criteria

1. WHEN regression certification begins, THE Certification_Workflow SHALL confirm Node.js major version 24.
2. WHEN Node.js major version 24 is confirmed, THE Certification_Workflow SHALL execute the repository Prettier check.
3. WHEN Node.js major version 24 is confirmed, THE Certification_Workflow SHALL execute ESLint with a maximum warning count of zero.
4. WHEN Node.js major version 24 is confirmed, THE Certification_Workflow SHALL execute TypeScript checking with no emitted files.
5. WHEN Node.js major version 24 is confirmed, THE Certification_Workflow SHALL execute the full Vitest suite in single-run mode.
6. WHEN Node.js major version 24 is confirmed, THE Certification_Workflow SHALL execute the worker import smoke check.
7. WHEN Node.js major version 24 is confirmed, THE Certification_Workflow SHALL execute the Drizzle_Check.
8. WHEN Node.js major version 24 is confirmed, THE Certification_Workflow SHALL execute the production build.
9. WHEN a Regression_Suite check completes, THE Certification_Workflow SHALL record an independent result for that check.
10. WHEN the full Vitest suite completes, THE Certification_Workflow SHALL record its Exact_Result.
11. IF Node.js major version 24 is unavailable, THEN THE Certification_Workflow SHALL record every Regression_Suite check as BLOCKED by an Environment_Failure.

### Requirement 7: Evidence-constrained remediation

**User Story:** As a maintainer, I want certification fixes constrained to verified regressions, so that the final pass avoids unrelated product changes.

#### Acceptance Criteria

1. IF certification evidence demonstrates a UI_UX_Regression, THEN THE Certification_Workflow SHALL permit the minimum code correction needed to resolve the UI_UX_Regression.
2. WHEN a UI_UX_Regression is corrected, THE Certification_Workflow SHALL preserve the Design_System.
3. IF certification evidence does not demonstrate a UI_UX_Regression, THEN THE Certification_Workflow SHALL leave UI and UX implementation unchanged.
4. IF the E2E_Suite demonstrates a reproducible Tour Application_Defect, THEN THE Certification_Workflow SHALL permit the minimum Driver.js correction needed to resolve the defect.
5. IF the E2E_Suite does not demonstrate a reproducible Tour Application_Defect, THEN THE Certification_Workflow SHALL preserve Driver.js unchanged.
6. WHEN a certification correction is made, THE Certification_Workflow SHALL rerun the smallest affected check and each required downstream validation.
7. THE Certification_Workflow SHALL preserve the Preserved_Interfaces and No_Scoring_Invariant during every correction.
8. THE Certification_Workflow SHALL exclude unrelated refactoring from certification corrections.

### Requirement 8: Prohibited and deferred scope

**User Story:** As a release owner, I want prohibited and deferred capabilities explicitly isolated, so that certification remains within authorized scope.

#### Acceptance Criteria

1. THE Certification_Workflow SHALL classify AUTH0 as DEFERRED.
2. WHILE executing the Certification_Workflow, THE Certification_Workflow SHALL exclude AUTH0 inspection, modification, debugging, configuration, and testing.
3. THE Certification_Workflow SHALL classify S6 as DEFERRED.
4. THE Certification_Workflow SHALL classify S7 as DEFERRED.
5. THE Certification_Workflow SHALL classify Live_Debate as DEFERRED.
6. THE Certification_Workflow SHALL classify PDF as DEFERRED.
7. WHILE executing the Certification_Workflow, THE Certification_Workflow SHALL exclude implementation of S6, S7, Live_Debate, and PDF.
8. WHILE executing the Certification_Workflow, THE Certification_Workflow SHALL exclude production security bypasses.
9. WHILE executing the Certification_Workflow, THE Certification_Workflow SHALL exclude commits, pushes, and destructive Git operations.

### Requirement 9: Secret and sensitive-output protection

**User Story:** As a security owner, I want certification evidence to avoid credential and sensitive payload disclosure, so that verification does not create a data-exposure incident.

#### Acceptance Criteria

1. WHEN the Certification_Workflow checks `.env.local`, THE Certification_Workflow SHALL inspect only required variable presence and configuration validity.
2. WHEN the Certification_Workflow reports environment checks, THE Certification_Workflow SHALL omit `.env.local` values.
3. WHEN the Certification_Workflow reports provider checks, THE Certification_Workflow SHALL omit API keys, authorization headers, and full Sensitive_Responses.
4. WHEN the Certification_Workflow reports database or Redis checks, THE Certification_Workflow SHALL omit credentials and credential-bearing URLs.
5. IF an error message contains a secret or Sensitive_Response, THEN THE Certification_Workflow SHALL replace the sensitive content with a stable Secret_Safe error category.
6. THE Certification_Workflow SHALL store only Secret_Safe evidence in Certification_Artifacts.

### Requirement 10: Exact final certification report

**User Story:** As a release decision-maker, I want a fixed-format factual certification report, so that supported functionality and blockers are unambiguous.

#### Acceptance Criteria

1. WHEN a Certification_Run concludes, THE Certification_Report SHALL present fields in this exact order: S1, S2, S3, S4, S5, S6, S7, E2E, DATABASE, REDIS, TESTS, BUILD, UI/UX, TOUR, AUTH0, LIVE DEBATE, PDF.
2. THE Certification_Report SHALL render the S6 field as `S6=DEFERRED`.
3. THE Certification_Report SHALL render the S7 field as `S7=DEFERRED`.
4. THE Certification_Report SHALL render the AUTH0 field as `AUTH0=DEFERRED`.
5. THE Certification_Report SHALL render the LIVE DEBATE field as `LIVE DEBATE=DEFERRED`.
6. THE Certification_Report SHALL render the PDF field as `PDF=DEFERRED`.
7. WHEN the E2E_Suite executes, THE Certification_Report SHALL include the E2E Exact_Result with per-project and aggregate counts.
8. IF the E2E_Suite is blocked, THEN THE Certification_Report SHALL render E2E as BLOCKED with the failed gate reason.
9. WHEN the full Vitest suite executes, THE Certification_Report SHALL include the TESTS Exact_Result.
10. IF the full Vitest suite is blocked, THEN THE Certification_Report SHALL render TESTS as BLOCKED with the blocking reason.
11. WHEN the production build executes, THE Certification_Report SHALL render BUILD as PASS or FAIL with the exit status.
12. IF the production build is blocked, THEN THE Certification_Report SHALL render BUILD as BLOCKED with the blocking reason.
13. WHEN UI/UX certification completes, THE Certification_Report SHALL render UI/UX as unchanged, fixed with evidence, FAIL, or BLOCKED.
14. WHEN Tour certification completes, THE Certification_Report SHALL render TOUR as preserved, fixed with E2E evidence, FAIL, or BLOCKED.
15. AFTER the required report fields, THE Certification_Report SHALL list only unresolved Deployment_Blockers affecting Currently_Supported_Functionality.
16. IF no verified Deployment_Blocker remains, THEN THE Certification_Report SHALL state that no blocker was identified by the executed checks without claiming production readiness.
17. THE Certification_Report SHALL avoid a production-ready claim based solely on automated checks.
18. THE Certification_Report SHALL preserve independent Stage_Result statuses without replacing multiple results with one aggregate provider status.

### Requirement 11: Honest outcomes and traceability

**User Story:** As an auditor, I want every certification conclusion tied to evidence and scope, so that release decisions do not rely on overstated results.

#### Acceptance Criteria

1. WHEN a check executes successfully, THE Certification_Workflow SHALL record PASS only when the defined acceptance condition is observed.
2. WHEN a check executes unsuccessfully, THE Certification_Workflow SHALL record FAIL rather than infer PASS from an unrelated check.
3. WHEN a check does not execute because a dependency fails, THE Certification_Workflow SHALL record BLOCKED rather than FAIL or PASS.
4. WHEN a capability is excluded by this specification, THE Certification_Workflow SHALL record DEFERRED rather than PASS.
5. WHEN a result is classified as Environment_Failure or Application_Defect, THE Certification_Workflow SHALL reference Secret_Safe evidence supporting the classification.
6. WHEN an automated tool omits detailed counts, THE Certification_Workflow SHALL report the available exact output without inventing counts.
7. THE Certification_Workflow SHALL maintain traceability from every Certification_Report field to one or more Leaf_Task results.
8. THE Certification_Workflow SHALL maintain traceability from every correction to the failing check that authorized the correction.
9. THE Certification_Workflow SHALL preserve database interfaces and UI interfaces throughout certification.
