import { Controller, Get } from "@nestjs/common";
import { Public } from "../modules/identity/auth.decorators.js";
@Public()
@Controller("health")
export class HealthController {
  @Get("live") live() {
    return { status: "ok" };
  }
  @Get("ready") ready() {
    return { status: "ok" };
  }
}
