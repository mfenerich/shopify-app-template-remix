/**
 * Safe helper for Polaris web components (custom elements).
 *
 * Important: Polaris props are often NOT on HTMLElement's prototype until the
 * custom element upgrades. Using `k in node` + setAttribute breaks camelCase
 * props (e.g. justifyContent → invalid attribute). For `s-*` tags we always
 * assign properties directly (Shopify's documented pattern).
 */
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function setProp(node, k, v) {
  if (k === "textContent") {
    node.textContent = v;
    return;
  }
  try {
    node[k] = v;
  } catch {
    try {
      node.setAttribute(k, String(v));
    } catch {
      /* ignore */
    }
  }
}

export function el(tag, attrs, children) {
  const node = document.createElement(tag);
  const isPolaris = typeof tag === "string" && tag.startsWith("s-");

  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (UNSAFE_KEYS.has(k) || k.startsWith("on")) continue;
      if (isPolaris) {
        setProp(node, k, v);
      } else if (k === "textContent") {
        node.textContent = v;
      } else if (k in node) {
        node[k] = v;
      } else {
        node.setAttribute(k, v);
      }
    }
  }
  if (children) {
    for (const child of Array.isArray(children) ? children : [children]) {
      if (typeof child === "string") {
        node.appendChild(document.createTextNode(child));
      } else if (child) {
        node.appendChild(child);
      }
    }
  }
  return node;
}
