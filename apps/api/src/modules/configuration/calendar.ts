export type CalendarOverride = {
  date: string;
  type: "HOLIDAY" | "WORKING_DAY";
};
export function nextWorkingDay(date: string, overrides: CalendarOverride[]) {
  const cursor = new Date(`${date}T00:00:00.000Z`);
  const byDate = new Map(overrides.map((item) => [item.date, item.type]));
  for (let days = 0; days < 370; days += 1) {
    const key = cursor.toISOString().slice(0, 10);
    const override = byDate.get(key);
    const weekend = cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6;
    if (override === "WORKING_DAY" || (override !== "HOLIDAY" && !weekend))
      return key;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  throw new Error("CALENDAR_RANGE_EXCEEDED");
}
