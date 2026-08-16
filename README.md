# KPI Flow Insights

═══════════════════════════════════════════════════════════════════

PRODUCT: Anwar KPIFlow — Variable KPI & Performance Management System

Full-Stack Build Specification for Lovable.dev

═══════════════════════════════════════════════════════════════════

ROLE: Act as a full-stack engineer, system architect, and UX/UI designer. 

Build a complete, genuinely working application — React frontend + Supabase 

backend (Postgres + Auth + Storage + Realtime + Edge Functions). Every 

feature below must be functionally wired end-to-end: real data persistence, 

real-time recalculation, enforced role-based access, and an audit trail that 

is a true append-only log. No placeholder data, no decorative-only UI.

═══════════════════════════════════════════════════════════════════

0. PRODUCT CONTEXT & CORE DESIGN PRINCIPLE

═══════════════════════════════════════════════════════════════════

Anwar Group of Industries currently scores variable KPIs through a manual 

"Score → Signature → Approval" sheet. There's no visibility into how a score 

was calculated, scoring is inconsistent across departments, and manual score 

adjustments have no audit trail.

Rebuild the process as: TARGET → ACTUAL → EVIDENCE → SCORE → REVIEW → APPROVAL.

Core design thesis (apply to every decision below): any final score must be 

fully reconstructable later — target, actual, evidence, calculation, and 

approver — without asking a human. This is the single most important 

requirement in the system and should override convenience shortcuts anywhere 

they conflict.

═══════════════════════════════════════════════════════════════════

1. SYSTEM ARCHITECTURE

═══════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────┐

│ CLIENT LAYER                                                  │

│ React (Vite) SPA · TypeScript · Role-based routing/views      │

│ Recharts (dashboards) · React Hook Form + Zod (validation)    │

│ jsPDF or react-pdf (report generation)                        │

└──────────────────────────┬──────────────────────────────────┘

                            │ Supabase JS client (HTTPS, REST + Realtime WS)

┌──────────────────────────▼──────────────────────────────────┐

│ APPLICATION / API LAYER (Supabase)                            │

│  • PostgREST auto-generated REST API over Postgres tables     │

│    (governed entirely by RLS policies — see Section 3)        │

│  • Edge Functions (Deno) for logic that must be authoritative │

│    server-side and never trusted from the client:              │

│      - calculate-score                                        │

│      - apply-adjustment                                       │

│      - approve-kpi                                            │

│      - generate-report (PDF)                                  │

│      - validate-weight-allocation                             │

│  • Postgres Triggers for audit logging (fire on every INSERT/ │

│    UPDATE to kpi_definitions, actual_entries, score_records)  │

│  • Supabase Realtime channels broadcasting table changes to   │

│    subscribed clients (dashboard, review console, summary)    │

└──────────────────────────┬──────────────────────────────────┘

                            │

┌──────────────────────────▼──────────────────────────────────┐

│ DATA LAYER                                                     │

│  • Postgres (relational core — see schema in Section 4)        │

│  • Supabase Storage (evidence files, private bucket, signed    │

│    URLs only)                                                  │

│  • audit_log table — INSERT/SELECT-only RLS, no UPDATE/DELETE  │

│    grants to any role, functions as the immutable event store  │

└──────────────────────────┬──────────────────────────────────┘

                            │

┌──────────────────────────▼──────────────────────────────────┐

│ INTEGRATION LAYER (build as pluggable, stub with mock data for │

│ v1, but architect the interface for real connection later)     │

│  • ERP/Sales feed adapter → populates actual_entries with      │

│    data_source_type = 'system_verified'                        │

│  • HRIS feed adapter → syncs employees/departments/managers    │

│  • Export connector → CSV/JSON feed to a BI tool or data        │

│    warehouse for long-term analytics                           │

└─────────────────────────────────────────────────────────────┘

Why this split matters: the Scoring Engine and the Workflow/State Machine 

logic must live in Edge Functions, not just client-side JS — this is what 

makes "real-time workable" scoring also trustworthy scoring. A client can 

display a live preview calculation, but the score written to score_records 

must always come from the server-side calculate-score function.

═══════════════════════════════════════════════════════════════════

2. USER ROLES & PERMISSIONS

═══════════════════════════════════════════════════════════════════

- EMPLOYEE — views own KPIs; submits actual + evidence; views own summary, 

  history, and downloadable reports. Cannot edit target/weight/score. Cannot 

  see other employees' records.

- MANAGER / REVIEWER — views assigned team's KPIs; reviews submissions; 

  approves / adjusts (reason required) / returns for clarification. Cannot 

  directly edit an employee's submitted actual value.

- HR ADMIN — creates/edits KPI definitions for any employee; manages 

  reviewer/approver routing and rubrics; views org-wide audit trail; 

  configures scoring-curve and adjustment-threshold policy. Cannot approve 

  scores unless also assigned as reviewer on that KPI.

- EXECUTIVE / SENIOR APPROVER — read access to all KPIs and the management 

  dashboard; performs final lock/authorizes corrections on already-approved 

  records; can view calibration view across managers.

Implement via Supabase Auth (email/password to start) + a `role` and 

`department_id` column on the `employees` table, enforced through Postgres 

Row Level Security — never rely on frontend checks alone. Every denied 

action attempt is itself written to audit_log (actor, attempted action, 

denial reason).

═══════════════════════════════════════════════════════════════════

3. DATABASE SCHEMA (Postgres via Supabase) — with RLS policies

═══════════════════════════════════════════════════════════════════

-- departments

id UUID PK, name TEXT, parent_department_id UUID FK NULLABLE

-- employees (extends Supabase auth.users via a matching id)

id UUID PK (= auth.users.id), name TEXT, email TEXT, 

role TEXT CHECK IN ('employee','manager','hr_admin','executive'),

department_id UUID FK, manager_id UUID FK NULLABLE

-- rubrics (qualitative KPI rating criteria)

id UUID PK, name TEXT, 

levels JSONB  -- [{level:1, label:'Needs Improvement', description:'...'}, ...]

-- kpi_definitions

id UUID PK, employee_id UUID FK, department_id UUID FK,

name TEXT, description TEXT,

kpi_type TEXT CHECK IN ('higher_is_better','lower_is_better','milestone','qualitative'),

target_value NUMERIC NULLABLE, unit TEXT,

weight_percent NUMERIC CHECK (weight_percent > 0 AND weight_percent <= 100),

period_start DATE, period_end DATE,

perspective TEXT CHECK IN ('financial','customer','operational','people'),

reviewer_id UUID FK, approver_id UUID FK, rubric_id UUID FK NULLABLE,

status TEXT CHECK IN ('draft','pending_target_approval','active','submitted',

                       'returned','approved','correction_requested'),

milestones JSONB NULLABLE, -- for kpi_type='milestone': [{label, weight, completed, evidence_id, due_date}]

created_by UUID FK, created_at TIMESTAMPTZ DEFAULT now()

-- actual_entries

id UUID PK, kpi_definition_id UUID FK, actual_value NUMERIC,

data_source_type TEXT CHECK IN ('system_verified','verified_manual','unverified'),

reporting_date DATE, comments TEXT,

entered_by UUID FK, entered_at TIMESTAMPTZ DEFAULT now()

-- evidence

id UUID PK, actual_entry_id UUID FK, file_url TEXT, file_hash TEXT, -- sha256

file_size INT, uploaded_by UUID FK, uploaded_at TIMESTAMPTZ DEFAULT now(),

description TEXT

-- score_records (append-only-in-spirit: corrections insert a new row,

-- version_number increments, prior rows are never edited or deleted)

id UUID PK, kpi_definition_id UUID FK, version_number INT DEFAULT 1,

calculated_score NUMERIC, achievement_percent NUMERIC,

adjustment_delta NUMERIC DEFAULT 0, adjustment_reason_code TEXT NULLABLE,

adjustment_justification TEXT NULLABLE, final_score NUMERIC,

reviewed_by UUID FK NULLABLE, reviewed_at TIMESTAMPTZ NULLABLE,

approved_by UUID FK NULLABLE, approved_at TIMESTAMPTZ NULLABLE

-- audit_log (append-only: RLS grants INSERT + SELECT only, no UPDATE/DELETE

-- to any role including hr_admin)

id UUID PK, entity_type TEXT, entity_id UUID, action TEXT,

actor_id UUID FK, actor_role TEXT, timestamp TIMESTAMPTZ DEFAULT now(),

before_value JSONB, after_value JSONB, reason TEXT NULLABLE

-- scoring_policy (HR-admin-configurable, singleton or per-department row)

id UUID PK, department_id UUID FK NULLABLE, -- null = org-wide default

achievement_floor NUMERIC DEFAULT 70,     -- below this = score 0

achievement_cap NUMERIC DEFAULT 120,      -- score capped here

adjustment_escalation_threshold NUMERIC DEFAULT 10 -- |delta| beyond this auto-escalates

TRIGGERS:

- AFTER INSERT/UPDATE on kpi_definitions → INSERT into audit_log

- AFTER INSERT on actual_entries → INSERT into audit_log

- AFTER INSERT/UPDATE on score_records → INSERT into audit_log

  (each trigger captures OLD/NEW as before_value/after_value JSONB)

RLS POLICY PATTERN (apply per table):

- employees: SELECT own row; SELECT rows where department_id matches if 

  manager/hr_admin/executive

- kpi_definitions: employee SELECT where employee_id = auth.uid(); manager 

  SELECT/UPDATE(status transitions only) where reviewer_id = auth.uid() OR 

  employee.manager_id = auth.uid(); hr_admin full CRUD; executive SELECT all

- actual_entries / evidence: INSERT only by the owning employee while KPI 

  status IN ('active','returned'); SELECT by employee (own), reviewer, hr_admin, executive

- score_records: INSERT/UPDATE only via Edge Functions (service role), never 

  directly from client roles — all client-facing writes to scores MUST go 

  through calculate-score / apply-adjustment / approve-kpi Edge Functions

- audit_log: INSERT via triggers/service role only; SELECT by hr_admin and 

  executive org-wide, by manager for own team, by employee for own records only

═══════════════════════════════════════════════════════════════════

4. API LAYER (Edge Functions — explicit contracts)

═══════════════════════════════════════════════════════════════════

POST /functions/v1/submit-actual

  body: { kpi_definition_id, actual_value, reporting_date, comments, evidence_file }

  - Validates KPI status is 'active' or 'returned'

  - Uploads file to Storage, computes SHA-256 hash server-side

  - Inserts actual_entries + evidence rows

  - Calls calculate-score internally

  - Sets kpi_definitions.status = 'submitted'

  - Returns: { achievement_percent, calculated_score }

POST /functions/v1/calculate-score

  body: { kpi_definition_id }

  - Fetches kpi_type, target_value, latest actual_value, scoring_policy

  - Applies the correct formula (see Section 5)

  - Inserts a score_records row (calculated_score, achievement_percent, 

    final_score = null until approved)

  - This is the ONLY code path allowed to compute a score — never trust a 

    client-submitted score value anywhere else in the system

POST /functions/v1/review-decision

  body: { kpi_definition_id, decision: 'approve'|'adjust'|'return', 

          adjustment_delta?, adjustment_reason_code?, adjustment_justification?,

          return_reason? }

  - Validates caller is the assigned reviewer

  - 'approve': final_score = calculated_score; status → 'approved'; sets 

     approved_by/approved_at

  - 'adjust': REQUIRES adjustment_reason_code + adjustment_justification 

     (400 error if missing); if |adjustment_delta| > scoring_policy.

     adjustment_escalation_threshold, route to approver_id instead of 

     finalizing (status → 'correction_requested' pending senior sign-off); 

     else final_score = calculated_score + delta; status → 'approved'

  - 'return': status → 'returned'; requires return_reason

POST /functions/v1/setup-kpi

  body: { employee_id, name, description, kpi_type, target_value, unit, 

          weight_percent, period_start, period_end, perspective, 

          reviewer_id, approver_id, rubric_id? }

  - Validates SUM(weight_percent) across employee's active KPIs ≤ 100; 

    rejects with the current allocated total if it would exceed

  - Inserts kpi_definitions with status = 'pending_target_approval'

POST /functions/v1/approve-target

  body: { kpi_definition_id, approve: boolean, rejection_reason? }

  - Reviewer-only; status → 'active' or back to 'draft' with reason logged

POST /functions/v1/generate-report

  body: { kpi_definition_id } or { employee_id, period }

  - Assembles target, actual, evidence metadata, score calculation, 

    adjustment (if any), approver, and full audit history

  - Returns a generated PDF (or PDF-ready payload for client-side jsPDF)

GET /kpi_definitions?employee_id=eq.{id}           (PostgREST auto-API)

GET /score_records?kpi_definition_id=eq.{id}

GET /audit_log?entity_id=eq.{id}&order=timestamp.desc

  (all auto-generated PostgREST reads, governed by RLS — no custom endpoint 

  needed for simple reads)

═══════════════════════════════════════════════════════════════════

5. BUSINESS LOGIC — SCORING ENGINE (implemented in calculate-score Edge Fn)

═══════════════════════════════════════════════════════════════════

function calculateScore(kpiType, target, actual, milestones, rubricLevel, policy):

  HIGHER_IS_BETTER:

    achievement_pct = (actual / target) * 100

    system_score = MIN(achievement_pct, policy.achievement_cap)

  LOWER_IS_BETTER:

    achievement_pct = MAX((2 - (actual / target)) * 100, 0)

    system_score = MIN(achievement_pct, policy.achievement_cap)

  MILESTONE:

    achievement_pct = SUM(m.weight for m in milestones if m.completed)

    system_score = MIN(achievement_pct, policy.achievement_cap)

    -- each milestone requires its own evidence_id before completed=true is accepted

  QUALITATIVE:

    achievement_pct = null  -- not applicable

    system_score = rubric_level_to_score_map[rubricLevel]  -- e.g. {1:20,2:45,3:70,4:95,5:120}

    -- reviewer selects rubric level; free-text scoring is never permitted

  ACHIEVEMENT → SCORE CURVE (applies to non-qualitative types, configurable 

  in scoring_policy, default):

    if achievement_pct < policy.achievement_floor (70): score = 0

    elif achievement_pct <= 100: linear-scale 70→100 maps to score 0→100

    elif achievement_pct <= policy.achievement_cap (120): linear-scale 

      100→120 maps to score 100→120

    else: score = policy.achievement_cap

  return { achievement_pct, system_score }

WEIGHTED ROLL-UP (computed on-demand for Performance Summary / Dashboard, 

not stored redundantly — always derived from score_records + kpi_definitions):

  overall_score = SUM(final_score * weight_percent) / SUM(weight_percent)

    for all kpi_definitions WHERE employee_id = X AND status = 'approved' 

    AND period = current

ADJUSTMENT RULE (in review-decision Edge Fn): adjustment_delta is always 

additive to calculated_score, never a direct overwrite. Reason code + 

justification mandatory. |delta| beyond threshold auto-escalates to a 

second approver rather than finalizing immediately.

═══════════════════════════════════════════════════════════════════

6. WORKFLOW / STATE MACHINE

═══════════════════════════════════════════════════════════════════

draft 

  → pending_target_approval  [HR submits for reviewer sign-off]

  → active                   [reviewer approves target]

  → submitted                [employee submits actual + evidence]

  → approved (LOCKED)        [reviewer approves as-calculated or with adjustment]

       OR

  → returned                 [reviewer sends back] → active/submitted again 

                                after employee resubmits

approved → correction_requested [senior approver authorizes an exception] 

  → new score_records version created (version_number + 1), prior version 

    permanently retained, never deleted or overwritten → approved again

Enforce transitions server-side in the relevant Edge Functions — reject any 

transition not explicitly listed above, regardless of what the client sends.

UI: a horizontal stepper (Target → Actual → Evidence → Score → Review → 

Approval) on every KPI detail view, current stage highlighted, reflecting 

the live `status` field — this is the signature UI element across the app.

═══════════════════════════════════════════════════════════════════

7. FRONTEND — SCREENS & FUNCTIONALITY

═══════════════════════════════════════════════════════════════════

Stack: React + Vite + TypeScript, React Router (role-gated routes), React 

Hook Form + Zod for validation, Supabase JS client for data + Realtime 

subscriptions, Recharts for charts, jsPDF/react-pdf for reports.

EMPLOYEE

 - My KPIs: card grid, live status badges (color-coded per Section 8), 

   target vs. actual-to-date, days remaining

 - Enter Actual & Evidence: calls submit-actual; shows live calculated 

   achievement %/score returned from the function immediately; evidence 

   upload shows filename + generated hash as a permanent chip; submit 

   disabled until evidence attached (for manual sources) or actual filled 

   (system-verified)

 - Performance Summary: overall weighted score (derived, real-time via 

   Realtime subscription to score_records), per-KPI table, trend line chart 

   vs. previous periods, full audit history

 - DOWNLOAD REPORT button on Performance Summary AND each KPI detail page 

   → calls generate-report → produces a PDF with target, actual, evidence 

   reference + hash, achievement %, calculated score, adjustment + reason 

   (if any), final score, approver, approval date, full audit trail for 

   that record

MANAGER/REVIEWER

 - Review Console: real-time table (Realtime subscription) of team's 

   submitted KPIs

 - Detail drawer: side-by-side target/actual/evidence/achievement/system 

   score, evidence preview + signed-URL download, three actions wired to 

   review-decision (Approve / Adjust with mandatory reason+justification / 

   Return with mandatory reason), audit history

HR ADMIN

 - KPI Setup Wizard: employee → type selector (drives dynamic form fields) 

   → name/description → target/unit/weight/period → reviewer/approver → 

   submit (calls setup-kpi; shows live weight-allocation total with 

   validation)

 - Target Approval Queue

 - Rubric Manager: CRUD for qualitative rubrics

 - Audit Trail Viewer: filterable, paginated, read-only view of audit_log

 - Scoring Policy Settings: edit achievement_floor/cap/escalation_threshold 

   (writes to scoring_policy table)

EXECUTIVE — MANAGEMENT DASHBOARD (charts required, all live-data via Recharts)

 - Stat cards: employees evaluated/pending, avg score, avg achievement, 

   approvals pending, manually-adjusted count

 - Score Distribution — histogram/bar chart of employee counts per score 

   band, with org-average reference line

 - Department/Business-Unit Trends — grouped bar chart, sorted high→low, 

   exact % labeled per bar

 - Performance Trend Over Time — line chart across periods, toggle between 

   per-department and org-aggregate

 - Balanced-Scorecard Perspective Breakdown — radar/spider chart across 

   Financial/Customer/Operational/People

 - Manual Adjustments Overview — bar chart of adjustment count/avg size per 

   reviewer (calibration signal)

 - Recurring KPI Gaps — sortable table, KPIs below 90% achievement across 

   2+ consecutive periods

 - All charts: labeled axes/legends, hover tooltips for exact values, 

   responsive, no horizontal scroll, pulling from live Supabase queries 

   (not mock arrays)

═══════════════════════════════════════════════════════════════════

8. DESIGN SYSTEM

═══════════════════════════════════════════════════════════════════

Colors: Background #F6F7F5 · Surface #FFFFFF · Surface-alt #EEF2EF

Ink #14262B · Ink-soft #52666A

Primary/approve (teal) #1F6F5C · Primary-dark #123B31

Attention/pending (amber) #B8722A

Danger/returned/below-target (brick) #A83E32

Borders #DDE3DF

Typography: Headings — Space Grotesk (600/700). Body — IBM Plex Sans. 

All scores, percentages, and evidence hashes — IBM Plex Mono (reinforces 

precision/auditability visually).

Conventions: consistent status-badge colors everywhere (teal=approved, 

amber=pending, brick=returned, gray=not started); the workflow stepper on 

every KPI view; a score is never shown without its calculation path visible 

on-screen or one click away; buttons use plain active-voice labels 

("Approve as calculated," not "Submit").

═══════════════════════════════════════════════════════════════════

9. INTEGRATIONS (architect the interface now; stub with mock adapters for v1)

═══════════════════════════════════════════════════════════════════

- ERP/Sales data adapter: scheduled Edge Function (cron) that would populate 

  actual_entries with data_source_type='system_verified' for KPIs flagged 

  as system-fed — implement the adapter interface and a mock data source for 

  the demo, structured so a real ERP/CRM connection can be swapped in later.

- HRIS sync adapter: interface for syncing employees/departments/managers — 

  stub with seed data, structured the same way.

- BI/data warehouse export: a simple CSV/JSON export endpoint from the 

  reporting views for future external analytics tools.

═══════════════════════════════════════════════════════════════════

10. NON-FUNCTIONAL REQUIREMENTS

═══════════════════════════════════════════════════════════════════

- Real-time: Supabase Realtime subscriptions so approvals propagate 

  instantly to Employee Summary and Executive Dashboard without refresh

- Security: RLS on every table; audit_log is INSERT/SELECT-only for every 

  role, no UPDATE/DELETE grants to anyone

- Data integrity: evidence hashed at upload; score_records never overwritten, 

  corrections create new versions

- Validation: enforced both client-side (form UX) and server-side (Edge 

  Function checks + Postgres constraints) — client validation is a UX 

  convenience only, never the source of truth

═══════════════════════════════════════════════════════════════════

11. ACCEPTANCE / DEMO FLOW (must work end-to-end, live)

═══════════════════════════════════════════════════════════════════

1. HR Admin creates a KPI (higher_is_better, weight 30%) → routes for target 

   approval.

2. Reviewer approves target → status: active.

3. Employee enters actual + uploads evidence (hash generated) → submit-actual 

   runs → calculate-score runs → status: submitted; achievement %/score 

   appear immediately.

4. Manager opens Review Console, sees target/actual/evidence/score together, 

   approves as calculated (or adjusts with reason) → review-decision runs → 

   status: approved, locked.

5. Employee's Performance Summary and Executive Dashboard (stat cards + all 

   5 charts) update live via Realtime, no refresh.

6. Employee downloads a PDF report from Performance Summary showing the full 

   calculation and approval trail.

7. HR Admin opens Audit Trail Viewer, confirms every step above logged as an 

   immutable, timestamped entry with before/after values.

Build this as a genuinely working full-stack application — every number 

shown anywhere in the UI must originate from a real Supabase query against 

the schema in Section 3, and every score must be computed server-side by the 

calculate-score Edge Function, never client-calculated-and-trusted.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://score-reconstruct.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d8def442-8974-4f86-b826-0a738fc04e8e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
