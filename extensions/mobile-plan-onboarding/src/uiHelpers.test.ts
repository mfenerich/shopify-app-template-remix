import { describe, it, expect } from "vitest";
import { formatSwissPhoneNumber } from "./uiHelpers.js";

describe("formatSwissPhoneNumber", () => {
  it("formats a full 9-digit local number", () => {
    expect(formatSwissPhoneNumber("787654321")).toBe("+41 78 765 43 21");
  });

  it("strips leading 0", () => {
    expect(formatSwissPhoneNumber("0787654321")).toBe("+41 78 765 43 21");
  });

  it("strips international prefix 41", () => {
    expect(formatSwissPhoneNumber("41787654321")).toBe("+41 78 765 43 21");
  });

  it("strips international prefix 0041", () => {
    expect(formatSwissPhoneNumber("0041787654321")).toBe("+41 78 765 43 21");
  });

  it("handles partial input", () => {
    expect(formatSwissPhoneNumber("78")).toBe("+41 78");
  });

  it("handles empty input", () => {
    expect(formatSwissPhoneNumber("")).toBe("+41");
  });

  it("strips non-digit characters", () => {
    expect(formatSwissPhoneNumber("+41 78 765 43 21")).toBe("+41 78 765 43 21");
  });

  it("truncates at 9 digits (Swiss mobile)", () => {
    expect(formatSwissPhoneNumber("7876543219999")).toBe("+41 78 765 43 21");
  });

  it("formats 5-digit partial", () => {
    expect(formatSwissPhoneNumber("78765")).toBe("+41 78 765");
  });

  it("formats 7-digit partial", () => {
    expect(formatSwissPhoneNumber("7876543")).toBe("+41 78 765 43");
  });
});
