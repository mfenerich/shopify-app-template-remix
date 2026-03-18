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

  const section = el("s-section");

  section.appendChild(
    el("s-heading", { textContent: "Mobile Plan Setup" }),
  );
  section.appendChild(
    el("s-text", {
      appearance: "subdued",
      textContent:
        "Set up your mobile plan below. Choose to keep your current number or pick a new one.",
    }),
  );

  const spacer = el("s-box", { padding: "tight" });
  section.appendChild(spacer);

  const choiceList = el("s-choice-list", {
    label: "How would you like to get your phone number?",
  });

  choiceList.appendChild(
    el("s-choice", {
      id: "port",
      value: "port",
      textContent: "Keep my existing number",
    }),
  );
  choiceList.appendChild(
    el("s-choice", {
      id: "new",
      value: "new",
      textContent: "Get a new number",
    }),
  );

  section.appendChild(choiceList);

  const dynamicArea = el("s-box", { padding: "tight none" });
  section.appendChild(dynamicArea);

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

  document.body.appendChild(section);
}

function renderPortFields(container) {
  const wrapper = el("s-box", { padding: "base none" });

  const description = el("s-text", {
    appearance: "subdued",
    size: "small",
    textContent:
      "We'll transfer your existing number to your new plan. This usually takes 1-2 business days.",
  });
  wrapper.appendChild(description);

  const fieldsSpacer = el("s-box", { padding: "tight" });
  wrapper.appendChild(fieldsSpacer);

  const phoneField = el("s-text-field", {
    label: "Phone number to port",
    required: "",
    placeholder: "+41 7x xxx xx xx",
  });
  phoneField.addEventListener("input", (e) => {
    const val = e.target.value || "";
    if (val) queueAttributeChange("mobile_port_number", val);
  });
  wrapper.appendChild(phoneField);

  const carrierField = el("s-text-field", {
    label: "Current carrier",
    required: "",
    placeholder: "e.g. Swisscom, Sunrise, Salt",
  });
  carrierField.addEventListener("input", (e) => {
    const val = e.target.value || "";
    if (val) queueAttributeChange("mobile_current_carrier", val);
  });
  wrapper.appendChild(carrierField);

  const consentSpacer = el("s-box", { padding: "tight" });
  wrapper.appendChild(consentSpacer);

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
  wrapper.appendChild(consentCheckbox);

  container.appendChild(wrapper);
}

async function renderNewNumberFields(container) {
  const wrapper = el("s-box", { padding: "base none" });

  const description = el("s-text", {
    appearance: "subdued",
    size: "small",
    textContent: "Choose from our available Swiss mobile numbers.",
  });
  wrapper.appendChild(description);

  const loadingSpacer = el("s-box", { padding: "tight" });
  wrapper.appendChild(loadingSpacer);

  const loadingBox = el("s-box", {
    display: "flex",
    padding: "base",
  });
  loadingBox.appendChild(el("s-spinner"));
  const loadingLabel = el("s-text", {
    appearance: "subdued",
    textContent: " Loading available numbers...",
  });
  loadingBox.appendChild(loadingLabel);
  wrapper.appendChild(loadingBox);

  container.appendChild(wrapper);

  try {
    const response = await fetch(
      `${NUMBER_API_BASE_URL}/api/numbers/available`,
    );
    if (!response.ok) throw new Error("Failed to fetch");
    const data = await response.json();
    const numbers = data.numbers || [];

    loadingBox.remove();

    if (numbers.length === 0) {
      const warning = el("s-banner", {
        tone: "warning",
        textContent:
          "No numbers are currently available. Please try again later.",
      });
      wrapper.appendChild(warning);

      const retryBox = el("s-box", { padding: "tight none" });
      const retryBtn = el("s-button", {
        variant: "secondary",
        textContent: "Try again",
      });
      retryBtn.addEventListener("click", () => {
        container.innerHTML = "";
        renderNewNumberFields(container);
      });
      retryBox.appendChild(retryBtn);
      wrapper.appendChild(retryBox);
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

    select.addEventListener("change", (e) => {
      const selectedId = e.target.value;
      const numberObj = numbers.find((n) => n.id === selectedId);
      if (numberObj) {
        queueAttributeChange("mobile_selected_number", numberObj.number);
        queueAttributeChange("mobile_selected_number_id", numberObj.id);

        if (confirmBanner) confirmBanner.remove();
        confirmBanner = el("s-banner", {
          tone: "success",
          textContent: `${numberObj.number} will be assigned to your plan.`,
        });
        wrapper.appendChild(confirmBanner);
      }
    });

    let confirmBanner = null;
    wrapper.appendChild(select);
  } catch (err) {
    loadingBox.remove();

    const errorBanner = el("s-banner", {
      tone: "critical",
      textContent: "Unable to load available numbers. Please try again.",
    });
    wrapper.appendChild(errorBanner);

    const retryBox = el("s-box", { padding: "tight none" });
    const retryBtn = el("s-button", {
      variant: "secondary",
      textContent: "Retry",
    });
    retryBtn.addEventListener("click", () => {
      container.innerHTML = "";
      renderNewNumberFields(container);
    });
    retryBox.appendChild(retryBtn);
    wrapper.appendChild(retryBox);
  }
}
