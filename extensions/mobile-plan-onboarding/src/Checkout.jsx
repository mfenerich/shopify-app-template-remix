import "@shopify/ui-extensions/preact";

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

export default function () {
  const section = document.createElement("s-section");

  const heading = document.createElement("s-heading");
  heading.textContent = "Mobile Plan Setup";
  section.appendChild(heading);

  const intro = document.createElement("s-text");
  intro.textContent = "Complete the following to set up your mobile plan.";
  section.appendChild(intro);

  const choiceList = document.createElement("s-choice-list");
  choiceList.setAttribute(
    "label",
    "How would you like to get your phone number?",
  );

  const choicePort = document.createElement("s-choice");
  choicePort.setAttribute("id", "port");
  choicePort.setAttribute("value", "port");
  choicePort.textContent = "Port my existing number";

  const choiceNew = document.createElement("s-choice");
  choiceNew.setAttribute("id", "new");
  choiceNew.setAttribute("value", "new");
  choiceNew.textContent = "Get a new number";

  choiceList.appendChild(choicePort);
  choiceList.appendChild(choiceNew);
  section.appendChild(choiceList);

  const dynamicArea = document.createElement("s-box");
  dynamicArea.setAttribute("padding", "base");
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
  const phoneField = document.createElement("s-text-field");
  phoneField.setAttribute("label", "Current phone number");
  phoneField.setAttribute("required", "");
  phoneField.addEventListener("input", (e) => {
    const val = e.target.value || "";
    if (val) {
      queueAttributeChange("mobile_port_number", val);
    }
  });

  const carrierField = document.createElement("s-text-field");
  carrierField.setAttribute("label", "Current carrier");
  carrierField.setAttribute("required", "");
  carrierField.setAttribute("placeholder", "e.g. Swisscom, Sunrise, Salt");
  carrierField.addEventListener("input", (e) => {
    const val = e.target.value || "";
    if (val) {
      queueAttributeChange("mobile_current_carrier", val);
    }
  });

  container.appendChild(phoneField);
  container.appendChild(carrierField);
}

async function renderNewNumberFields(container) {
  const spinner = document.createElement("s-spinner");
  const loadingText = document.createElement("s-text");
  loadingText.textContent = "Loading available numbers...";
  container.appendChild(spinner);
  container.appendChild(loadingText);

  try {
    const response = await fetch(
      `${NUMBER_API_BASE_URL}/api/numbers/available`,
    );
    if (!response.ok) throw new Error("Failed to fetch");
    const data = await response.json();
    const numbers = data.numbers || [];

    container.innerHTML = "";

    if (numbers.length === 0) {
      const warning = document.createElement("s-banner");
      warning.setAttribute("tone", "warning");
      warning.textContent = "No numbers are currently available.";
      container.appendChild(warning);
      return;
    }

    const select = document.createElement("s-select");
    select.setAttribute("label", "Choose your new phone number");
    select.setAttribute("required", "");

    const placeholder = document.createElement("s-option");
    placeholder.setAttribute("value", "");
    placeholder.setAttribute("disabled", "");
    placeholder.textContent = "Select a number";
    select.appendChild(placeholder);

    for (const num of numbers) {
      const option = document.createElement("s-option");
      option.setAttribute("value", num.id);
      option.textContent = num.number;
      select.appendChild(option);
    }

    select.addEventListener("change", (e) => {
      const selectedId = e.target.value;
      const numberObj = numbers.find((n) => n.id === selectedId);
      if (numberObj) {
        queueAttributeChange("mobile_selected_number", numberObj.number);
      }
    });

    container.appendChild(select);
  } catch (err) {
    container.innerHTML = "";
    const errorBanner = document.createElement("s-banner");
    errorBanner.setAttribute("tone", "critical");
    errorBanner.textContent =
      "Unable to load available numbers. Please try again.";
    container.appendChild(errorBanner);
  }
}
