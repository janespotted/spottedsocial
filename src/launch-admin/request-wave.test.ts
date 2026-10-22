import { describe, it, expect } from "vitest";
import { defaultRequestWave } from "./request-wave";
const first = {
  id: "first",
  name: "The first 100",
  status: "draft",
  capacity: 100,
  selected: 20,
};
const next = { ...first, id: "second", name: "Second", capacity: 200 };
describe("request wave defaults", () => {
  it("prefers First 100 over catalog order", () =>
    expect(defaultRequestWave([next, first])).toBe("first"));
  it("keeps an existing draft selection, even at capacity", () =>
    expect(
      defaultRequestWave([{ ...first, selected: 100 }, next], "first"),
    ).toBe("first"));
  it("never defaults a new request to a full, open or paused wave", () => {
    for (const w of [
      { ...first, selected: 100 },
      { ...first, status: "open" },
      { ...first, status: "paused" },
    ])
      expect(defaultRequestWave([w, next])).toBe("second");
  });
  it("handles no available waves", () =>
    expect(defaultRequestWave([{ ...first, status: "open" }])).toBe(""));
});
