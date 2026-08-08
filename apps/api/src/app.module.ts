import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { HealthController } from "./platform/health.controller.js";
import { StudentsController } from "./modules/students/students.controller.js";
import { StudentsService } from "./modules/students/students.service.js";
import { AcademicsController } from "./modules/academics/academics.controller.js";
import { AcademicsService } from "./modules/academics/academics.service.js";
import { TransfersController } from "./modules/transfers/transfers.controller.js";
import { TransfersService } from "./modules/transfers/transfers.service.js";
import { DatabaseService } from "./database/database.service.js";
import { IdentityController } from "./modules/identity/identity.controller.js";
import { IdentityService } from "./modules/identity/identity.service.js";
import { CryptoService } from "./modules/identity/crypto.service.js";
import { AuditService } from "./modules/audit/audit.service.js";
import { SessionGuard } from "./modules/identity/session.guard.js";
import { ConfigurationController } from "./modules/configuration/configuration.controller.js";
import { ConfigurationService } from "./modules/configuration/configuration.service.js";
import { DocumentsController } from "./modules/documents/documents.controller.js";
import { DocumentsService } from "./modules/documents/documents.service.js";
import { ObjectStorageService } from "./modules/documents/object-storage.service.js";
import { BankingController } from "./modules/banking/banking.controller.js";
import { BankingService } from "./modules/banking/banking.service.js";
import { AssistanceController } from "./modules/assistance/assistance.controller.js";
import { AssistanceService } from "./modules/assistance/assistance.service.js";
import { ObligationsController } from "./modules/obligations/obligations.controller.js";
import { ObligationsService } from "./modules/obligations/obligations.service.js";
import { NotificationsController } from "./modules/notifications/notifications.controller.js";
import { NotificationsService } from "./modules/notifications/notifications.service.js";
import { ReportingController } from "./modules/reporting/reporting.controller.js";
import { ReportingService } from "./modules/reporting/reporting.service.js";
import { GovernanceController } from "./modules/governance/governance.controller.js";
import { GovernanceService } from "./modules/governance/governance.service.js";
import { MetricsController } from "./platform/metrics.controller.js";
import { MetricsService } from "./platform/metrics.service.js";
import { ObservabilityInterceptor } from "./platform/observability.interceptor.js";

@Module({
  controllers: [
    HealthController,
    IdentityController,
    StudentsController,
    AcademicsController,
    TransfersController,
    ConfigurationController,
    DocumentsController,
    BankingController,
    AssistanceController,
    ObligationsController,
    NotificationsController,
    ReportingController,
    GovernanceController,
    MetricsController,
  ],
  providers: [
    DatabaseService,
    CryptoService,
    AuditService,
    IdentityService,
    StudentsService,
    AcademicsService,
    TransfersService,
    ConfigurationService,
    DocumentsService,
    ObjectStorageService,
    BankingService,
    AssistanceService,
    ObligationsService,
    NotificationsService,
    ReportingService,
    GovernanceService,
    MetricsService,
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_INTERCEPTOR, useClass: ObservabilityInterceptor },
  ],
})
export class AppModule {}
