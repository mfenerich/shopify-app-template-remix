import { describe, it, expect } from "vitest";
import { el } from "./polarisDom.js";

describe("el", () => {
  it("creates an element with the given tag", () => {
    const node = el("div");
    expect(node.tagName).toBe("DIV");
  });

  it("sets textContent via attrs", () => {
    const node = el("span", { textContent: "hello" });
    expect(node.textContent).toBe("hello");
  });

  it("sets standard HTML attributes on non-Polaris elements", () => {
    const node = el("div", { id: "test-id" });
    expect(node.id).toBe("test-id");
  });

  it("appends string children", () => {
    const node = el("div", undefined, ["hello", " world"]);
    expect(node.textContent).toBe("hello world");
  });

  it("appends element children", () => {
    const child = el("span", { textContent: "child" });
    const parent = el("div", undefined, [child]);
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].textContent).toBe("child");
  });

  it("skips null children", () => {
    const parent = el("div", undefined, [null, el("span")]);
    expect(parent.children).toHaveLength(1);
  });

  it("ignores __proto__ key", () => {
    const node = el("div", { __proto__: "bad" });
    expect(node.tagName).toBe("DIV");
  });

  it("ignores on* event handler keys", () => {
    const node = el("div", { onclick: "alert(1)" });
    expect(node.getAttribute("onclick")).toBeNull();
  });
});
