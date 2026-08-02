# Test matrix

| Flow                    | Success                 | Invalid/conflict          | Security/failure                     |
| ----------------------- | ----------------------- | ------------------------- | ------------------------------------ |
| Login/MFA/session       | rotate/revoke           | lockout/recovery          | fixation, CSRF, stale role           |
| Student/transfer school | create/history          | duplicate/version/overlap | cross-school 404, mass assignment    |
| Submission/review       | one/two-level           | return/resubmit/race      | bypass, same reviewer, infected file |
| Extension               | effective due/reminders | open duplicate/date       | unauthorized approval                |
| Bank/transfer           | verify/confirm/correct  | idempotency/state         | reveal audit, original immutable     |
| Import/export           | preview/reconcile       | row errors/expiry         | column scope, CSV injection          |
| i18n/a11y               | vi/en and dirty form    | missing key               | keyboard/zoom/labels                 |
