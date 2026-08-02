import { describe, expect, it } from "vitest";
import { parseClamResponse } from "./clam-response.js";
describe("ClamAV response parser", () => {
  it("accepts clean streams", () =>
    expect(parseClamResponse("stream: OK\0")).toBe("CLEAN"));
  it("rejects infected streams", () =>
    expect(parseClamResponse("stream: Eicar-Test-Signature FOUND\0")).toBe(
      "INFECTED",
    ));
  it("fails closed on malformed responses", () =>
    expect(() => parseClamResponse("UNKNOWN")).toThrow());
});
