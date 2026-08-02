# Requirements traceability

| Requirement group            | Source                     | Planned owner       | Contract/data                              | Verification                    |
| ---------------------------- | -------------------------- | ------------------- | ------------------------------------------ | ------------------------------- |
| AUTH, MFA, sessions          | v5.5 2.3, 5; v1.4 19.8     | Identity            | `/auth/*`, users/sessions/mfa_factors      | unit/API/E2E/security           |
| RBAC/scope/field/break-glass | v5.5 App A/H.2             | Authorization       | assignments/break_glass_sessions           | policy matrix, IDOR/cross-scope |
| Student/duplicate/transfer   | FR-STD-01/02/03, App G     | Students            | students/identity/history/profile_versions | API/integration/E2E/race        |
| Academic workflow            | FR-ACD-01/02, BR-005..010  | Academics           | submissions/versions/review_tasks          | state, reviewer separation, E2E |
| Documents                    | DOC, API-CTR-03            | Documents           | upload-init/complete/download              | spoof/scan/expiry/authz         |
| Banking                      | FR-BNK-01/02               | Banking             | encrypted versioned account                | masking/reveal/rotation         |
| Manual transfer              | FR-TRF-01/02, API-CTR-05   | Transfers           | transfer/confirmation/correction           | idempotency/state/correction    |
| Expense/support              | App G, FR-EXP-01/FR-SUP-01 | Students            | education_expenses/support_programs        | boundary grade/workflow         |
| Extensions/thank-you         | FR-EXT-01/FR-THK-01        | respective modules  | versioned workflow records                 | state/E2E                       |
| Notifications/reminders      | BR-012/021/023/024         | Notifications       | notification/delivery/outbox               | calendar/retry/reconciliation   |
| Reports/import/export        | RPT/IMP, API-CTR-06        | Reporting/Imports   | async jobs/private results                 | scope/CSV injection/idempotency |
| Audit/retention/consent      | App H.4/H.5                | Audit/Authorization | partitioned audit/policies/holds           | append-only/purge dry-run       |
| Localization                 | App F, FR-I18N-01..08      | Localization/Web    | locale catalogs/preferences                | missing-key/API/E2E             |
| NFR/operations               | NFR and Guide 12/13/19.7   | Platform            | health/telemetry/Compose/CI                | build, k6, restore drill        |
