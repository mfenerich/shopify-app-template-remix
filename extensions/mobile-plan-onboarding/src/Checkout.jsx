import "@shopify/ui-extensions/preact";

const MOBILE_SUBSCRIPTION_TYPE = "Mobile-subscription";
const NUMBER_API_BASE_URL =
  "https://mock-phone-numbers-759347772663.europe-west6.run.app";

const pendingAttributes = {};
let saveTimer = null;

function queueAttributeChange(key, value) {
  pendingAttributes[key] = value;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushAttributes, 1500);
}

async function flushAttributes() {
  const entries = Object.entries(pendingAttributes);
  for (const [key, value] of entries) {
    delete pendingAttributes[key];
    await shopify.applyAttributeChange({
      type: "updateAttribute",
      key,
      value,
    });
  }
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "textContent") {
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

export default function () {
  const lines = shopify.lines.current;
  const hasMobilePlan = lines.some(
    (line) =>
      line.merchandise?.product?.productType === MOBILE_SUBSCRIPTION_TYPE,
  );
  if (!hasMobilePlan) return;

  const section = el("s-section", { heading: "Mobile Plan Setup" });

  const stack = el("s-stack", { gap: "base" });

  stack.appendChild(
    el("s-paragraph", {
      color: "subdued",
      textContent:
        "Set up your mobile plan below. Choose to keep your current number or pick a new one.",
    }),
  );

  const choiceList = el("s-choice-list", {
    label: "How would you like to get your phone number?",
  });
  choiceList.appendChild(
    el("s-choice", { id: "port", value: "port", textContent: "Keep my existing number" }),
  );
  choiceList.appendChild(
    el("s-choice", { id: "new", value: "new", textContent: "Get a new number" }),
  );
  stack.appendChild(choiceList);

  const dynamicArea = el("s-stack", { gap: "base" });
  stack.appendChild(dynamicArea);

  choiceList.addEventListener("change", (e) => {
    const values = e.target.values || [];
    const value = Array.isArray(values) ? values[0] : values;
    dynamicArea.innerHTML = "";

    queueAttributeChange("mobile_number_choice", value || "");

    if (value === "port") {
      renderPortFields(dynamicArea);
    } else if (value === "new") {
      renderNewNumberFields(dynamicArea);
    }
  });

  section.appendChild(stack);
  document.body.appendChild(section);
}

function renderPortFields(container) {
  const stack = el("s-stack", { gap: "base" });

  stack.appendChild(
    el("s-paragraph", {
      type: "small",
      color: "subdued",
      textContent:
        "We'll transfer your existing number to your new plan. This usually takes 1-2 business days.",
    }),
  );

  const phoneField = el("s-text-field", {
    label: "Phone number to port",
    required: "",
    placeholder: "+41 7x xxx xx xx",
  });
  phoneField.addEventListener("input", (e) => {
    const val = e.target.value || "";
    if (val) queueAttributeChange("mobile_port_number", val);
  });
  stack.appendChild(phoneField);

  const carrierField = el("s-text-field", {
    label: "Current carrier",
    required: "",
    placeholder: "e.g. Swisscom, Sunrise, Salt",
  });
  carrierField.addEventListener("input", (e) => {
    const val = e.target.value || "";
    if (val) queueAttributeChange("mobile_current_carrier", val);
  });
  stack.appendChild(carrierField);

  const consentCheckbox = el("s-checkbox", {
    id: "port-consent",
    label:
      "I authorize the transfer of my phone number to the new provider. " +
      "I understand that my current contract may be affected.",
  });
  consentCheckbox.addEventListener("change", (e) => {
    const checked = e.target.checked ? "true" : "false";
    queueAttributeChange("mobile_port_consent", checked);
    queueAttributeChange(
      "mobile_port_consent_timestamp",
      new Date().toISOString(),
    );
  });
  stack.appendChild(consentCheckbox);

  container.appendChild(stack);
}

async function renderNewNumberFields(container) {
  const stack = el("s-stack", { gap: "base" });

  stack.appendChild(
    el("s-paragraph", {
      type: "small",
      color: "subdued",
      textContent: "Choose from our available Swiss mobile numbers.",
    }),
  );

  const loadingRow = el("s-stack", {
    direction: "inline",
    gap: "small",
    alignItems: "center",
  });
  loadingRow.appendChild(el("s-spinner"));
  loadingRow.appendChild(
    el("s-text", { color: "subdued", textContent: "Loading available numbers..." }),
  );
  stack.appendChild(loadingRow);

  container.appendChild(stack);

  try {
    const response = await fetch(
      `${NUMBER_API_BASE_URL}/api/numbers/available`,
    );
    if (!response.ok) throw new Error("Failed to fetch");
    const data = await response.json();
    const numbers = data.numbers || [];

    loadingRow.remove();

    if (numbers.length === 0) {
      stack.appendChild(
        el("s-banner", {
          heading: "No numbers available",
          tone: "warning",
          textContent: "Please try again later.",
        }),
      );

      const retryBtn = el("s-button", {
        variant: "secondary",
        textContent: "Try again",
      });
      retryBtn.addEventListener("click", () => {
        container.innerHTML = "";
        renderNewNumberFields(container);
      });
      stack.appendChild(retryBtn);
      return;
    }

    const select = el("s-select", {
      label: "Choose your new phone number",
      required: "",
    });
    select.appendChild(
      el("s-option", { value: "", disabled: "", textContent: "Select a number" }),
    );
    for (const num of numbers) {
      select.appendChild(
        el("s-option", { value: num.id, textContent: num.number }),
      );
    }

    let confirmBanner = null;

    select.addEventListener("change", (e) => {
      const selectedId = e.target.value;
      const numberObj = numbers.find((n) => n.id === selectedId);
      if (numberObj) {
        queueAttributeChange("mobile_selected_number", numberObj.number);
        queueAttributeChange("mobile_selected_number_id", numberObj.id);

        if (confirmBanner) confirmBanner.remove();
        confirmBanner = el("s-banner", {
          heading: numberObj.number,
          tone: "success",
          textContent: "This number will be assigned to your plan.",
        });
        stack.appendChild(confirmBanner);
      }
    });

    stack.appendChild(select);
  } catch (err) {
    loadingRow.remove();

    stack.appendChild(
      el("s-banner", {
        heading: "Connection error",
        tone: "critical",
        textContent: "Unable to load available numbers. Please try again.",
      }),
    );

    const retryBtn = el("s-button", {
      variant: "secondary",
      textContent: "Retry",
    });
    retryBtn.addEventListener("click", () => {
      container.innerHTML = "";
      renderNewNumberFields(container);
    });
    stack.appendChild(retryBtn);
  }
}
