import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC = "vnsf:is-public";
export const ALLOW_PENDING_MFA = "vnsf:allow-pending-mfa";
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const AllowPendingMfa = () => SetMetadata(ALLOW_PENDING_MFA, true);
