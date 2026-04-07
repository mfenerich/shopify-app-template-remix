import { describe, it, expect, beforeEach, vi } from "vitest";
import { getValidationErrors } from "./validation.js";
import { formState } from "./formState.js";

// Mock the global shopify object
vi.stubGlobal("shopify", {
  buyerJourney: { completed: { current: false } },
});

beforeEach(() => {
  formState.choice = "";
  formState.portNumber = "";
  formState.termination = "";
  formState.portConsent = false;
  formState.selectedNumberId = "";
  formState.numberPoolLockId = "";
  formState.numberPoolLocking = false;
  (globalThis as Record<string, unknown>).shopify = {
    buyerJourney: { completed: { current: false } },
  };
});

describe("getValidationErrors", () => {
  it("returns error when no choice is made", () => {
    const errors = getValidationErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Choose whether");
  });

  it("returns no errors when journey is completed", () => {
    (globalThis as Record<string, unknown>).shopify = {
      buyerJourney: { completed: { current: true } },
    };
    const errors = getValidationErrors();
    expect(errors).toHaveLength(0);
  });

  describe("port flow (choice=yes)", () => {
    beforeEach(() => {
      formState.choice = "yes";
    });

    it("requires phone number", () => {
      formState.portNumber = "+41 7";
      formState.termination = "asap";
      formState.portConsent = true;
      const errors = getValidationErrors();
      expect(errors.some((e) => e.includes("phone number"))).toBe(true);
    });

    it("requires termination selection", () => {
      formState.portNumber = "+41 78 765 43 21";
      formState.portConsent = true;
      const errors = getValidationErrors();
      expect(errors.some((e) => e.includes("termination"))).toBe(true);
    });

    it("requires port consent", () => {
      formState.portNumber = "+41 78 765 43 21";
      formState.termination = "asap";
      const errors = getValidationErrors();
      expect(errors.some((e) => e.includes("port your number"))).toBe(true);
    });

    it("returns no errors when all fields are valid", () => {
      formState.portNumber = "+41 78 765 43 21";
      formState.termination = "asap";
      formState.portConsent = true;
      const errors = getValidationErrors();
      expect(errors).toHaveLength(0);
    });
  });

  describe("new number flow (choice=no)", () => {
    beforeEach(() => {
      formState.choice = "no";
    });

    it("requires a locked number", () => {
      const errors = getValidationErrors();
      expect(errors.some((e) => e.includes("Select a new phone number"))).toBe(true);
    });

    it("shows waiting message when locking is in progress", () => {
      formState.numberPoolLocking = true;
      const errors = getValidationErrors();
      expect(errors.some((e) => e.includes("wait"))).toBe(true);
    });

    it("returns no errors when number is locked", () => {
      formState.numberPoolLockId = "lock-123";
      const errors = getValidationErrors();
      expect(errors).toHaveLength(0);
    });
  });
});
