import "reflect-metadata";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { loadConfig } from "@vnsf/config";
import { AppModule } from "./app.module.js";
import { ErrorFilter } from "./platform/error.filter.js";
import { CorrelationInterceptor } from "./platform/correlation.interceptor.js";

const config = loadConfig();
const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  bufferLogs: true,
});
app.set("trust proxy", 1);
app.setGlobalPrefix("api/v1");
app.use(cookieParser());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'self'"], objectSrc: ["'none'"] },
    },
  }),
);
app.enableCors({ origin: config.APP_BASE_URL, credentials: true });
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
app.useGlobalFilters(new ErrorFilter());
app.useGlobalInterceptors(new CorrelationInterceptor());
await app.listen(config.PORT, "0.0.0.0");
