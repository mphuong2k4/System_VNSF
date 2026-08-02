# Module boundaries

Identity, Authorization, Organization, Programs, Students, Academics, Documents, Banking, Transfers, Notifications, Reporting, Imports, Audit, Extensions, ThankYou and Localization each own their tables. Application services may consume another module only through a published application port/query interface. Controllers contain no business rules; repositories contain no authorization decisions; providers are never called inside a database transaction.
