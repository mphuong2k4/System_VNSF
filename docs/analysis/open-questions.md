# Open questions and safe assumptions

Legal/Privacy must sign retention, lawful basis, consent wording and minor-data handling before real-data migration or go-live. Defaults remain versioned configuration from Appendix H and purge is never automatic without dry-run/approval.

DevOps/SRE must approve provider selection, image digests and production-like topology before staging. Local adapters remain cloud-neutral.

Product, Tech Lead and Security sign-off stated in the source documents is an organizational gate; this repository records but cannot manufacture that approval.

Blocking before real data/go-live: Legal must decide retention days/action per category, lawful basis and guardian/consent wording for minors. Safe implementation default is no automated purge, mandatory dry-run/approval and legal-hold precedence.

Configurable defaults pending owner confirmation: 7-day transfer confirmation; school-holiday deadline movement; whether School Manager receives `identity.read.full`. Safe default denies full identity reveal to School Manager and retains these as versioned program/policy configuration.
