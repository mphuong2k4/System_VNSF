# ADR-009: Localization

Accepted. i18next/react-i18next supports vi-VN (default) and en-US without locale route prefixes. Codes, not display strings, drive logic. Locale switches preserve route and dirty form state; email, notifications and exports capture `locale_used`.
