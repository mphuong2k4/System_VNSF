export function parseClamResponse(response: string): "CLEAN" | "INFECTED" {
  if (response.includes("FOUND")) return "INFECTED";
  if (response.includes("OK")) return "CLEAN";
  throw new Error(`CLAMAV_UNEXPECTED_RESPONSE:${response.slice(0, 200)}`);
}
