/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from './js-genai.js';

const statusDiv = document.getElementById('status');
const tbody = document.getElementById('tableBody');
const thead = document.getElementById('tableHeaderRow');
const copyToClipboard = document.getElementById('copyToClipboard');
const copyAsScriptToolConfig = document.getElementById('copyAsScriptToolConfig');
const copyAsJSON = document.getElementById('copyAsJSON');
const toolNames = document.getElementById('toolNames');
const inputArgsText = document.getElementById('inputArgsText');
const formFields = document.getElementById('formFields');
const modeSwitcher = document.getElementById('modeSwitcher');
const executeBtn = document.getElementById('executeBtn');
const toolResults = document.getElementById('toolResults');
const userPromptText = document.getElementById('userPromptText');
const promptBtn = document.getElementById('promptBtn');
const traceBtn = document.getElementById('traceBtn');
const resetBtn = document.getElementById('resetBtn');
const apiKeyBtn = document.getElementById('apiKeyBtn');
const promptResults = document.getElementById('promptResults');
const executeModalOverlay = document.getElementById('executeModalOverlay');
const executeModalTitle = document.getElementById('executeModalTitle');
const executeModalContent = document.getElementById('executeModalContent');
const executeModalClose = document.getElementById('executeModalClose');

let inputMode = 'form';

function openExecuteModal(formWrap, toolName) {
  executeModalContent.innerHTML = '';
  executeModalContent.appendChild(formWrap);
  executeModalTitle.textContent = toolName;
  executeModalOverlay.classList.add('visible');
  executeModalOverlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function closeExecuteModal() {
  executeModalOverlay.classList.remove('visible');
  executeModalOverlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}
executeModalClose?.addEventListener('click', closeExecuteModal);
executeModalOverlay?.addEventListener('click', (e) => {
  if (e.target === executeModalOverlay) closeExecuteModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && executeModalOverlay?.classList.contains('visible')) closeExecuteModal();
});

/** Resize a textarea vertically to fit its content (min 2.5em; max-height from CSS). */
function fitTextareaToContent(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.max(40, ta.scrollHeight) + 'px';
}

modeSwitcher.addEventListener('click', (e) => {
  const btn = e.target.closest('.mode-btn');
  if (!btn || btn.dataset.mode === inputMode) return;

  if (inputMode === 'form') {
    inputArgsText.value = JSON.stringify(collectFormData(), '', ' ');
  }

  inputMode = btn.dataset.mode;
  modeSwitcher.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');

  if (inputMode === 'form') {
    inputArgsText.hidden = true;
    formFields.hidden = false;
    populateFormFromJson();
  } else {
    inputArgsText.hidden = false;
    formFields.hidden = true;
  }
});

/** Parse inputSchema from string or object; empty/missing/invalid -> {}. */
function parseInputSchema(value) {
  if (value === undefined || value === null) return {};
  if (typeof value === 'object') return value;
  const s = String(value).trim();
  if (s === '') return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function getSelectedSchema() {
  if (!toolNames.selectedOptions[0]) return {};
  const raw = toolNames.selectedOptions[0].dataset.inputSchema;
  return normalizeInputSchema(parseInputSchema(raw));
}

/** Normalize API schema to JSON Schema shape with .properties (some APIs use .parameters). */
function normalizeInputSchema(schema) {
  if (!schema || typeof schema !== 'object') return { type: 'object', properties: {} };
  if (schema.properties && typeof schema.properties === 'object') {
    return { type: 'object', properties: schema.properties, required: schema.required };
  }
  if (schema.parameters && typeof schema.parameters === 'object' && !Array.isArray(schema.parameters)) {
    return { type: 'object', properties: schema.parameters, required: schema.required };
  }
  return { type: 'object', properties: {}, ...schema };
}

function buildFormFromSchema(schema, targetEl) {
  const container = targetEl ?? formFields;
  container.innerHTML = '';
  const normalized = normalizeInputSchema(schema);
  const propKeys = normalized.properties ? Object.keys(normalized.properties) : [];
  if (!normalized.properties || Object.keys(normalized.properties).length === 0) {
    const hint = document.createElement('div');
    hint.className = 'form-hint';
    hint.textContent = 'This tool has no input parameters.';
    container.appendChild(hint);
    return;
  }

  const required = normalized.required || [];

  for (const [name, prop] of Object.entries(normalized.properties)) {
    const group = document.createElement('div');
    group.className = 'schema-field';

    const label = document.createElement('label');
    label.textContent = name;
    if (required.includes(name)) {
      const star = document.createElement('span');
      star.className = 'required-star';
      star.textContent = ' *';
      label.appendChild(star);
    }
    group.appendChild(label);

    if (prop.description) {
      const desc = document.createElement('div');
      desc.className = 'field-description';
      desc.textContent = prop.description;
      group.appendChild(desc);
    }

    const input = createInputForProperty(name, prop);
    group.appendChild(input);
    container.appendChild(group);
  }
}

function createInputForProperty(name, prop) {
  if (prop.enum && prop.enum.length > 0) {
    const select = document.createElement('select');
    select.dataset.fieldName = name;
    select.dataset.fieldType = 'enum';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select\u2026';
    select.appendChild(placeholder);
    for (const val of prop.enum) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      select.appendChild(opt);
    }
    return select;
  }

  if (prop.type === 'boolean') {
    const wrapper = document.createElement('div');
    wrapper.className = 'checkbox-wrapper';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.fieldName = name;
    cb.dataset.fieldType = 'boolean';
    wrapper.appendChild(cb);
    const lbl = document.createElement('span');
    lbl.textContent = 'true';
    lbl.className = 'checkbox-label';
    wrapper.appendChild(lbl);
    return wrapper;
  }

  if (prop.type === 'number' || prop.type === 'integer') {
    const input = document.createElement('input');
    input.type = 'number';
    input.dataset.fieldName = name;
    input.dataset.fieldType = prop.type;
    if (prop.minimum !== undefined) input.min = prop.minimum;
    if (prop.maximum !== undefined) input.max = prop.maximum;
    if (prop.type === 'integer') input.step = '1';
    input.placeholder = prop.description || name;
    return input;
  }

  if (prop.type === 'object' || prop.type === 'array') {
    const textarea = document.createElement('textarea');
    textarea.dataset.fieldName = name;
    textarea.dataset.fieldType = prop.type;
    textarea.placeholder = prop.type === 'array' ? '[]' : '{}';
    textarea.rows = 3;
    return textarea;
  }

  const input = document.createElement('input');
  input.type = getHtmlInputType(prop);
  input.dataset.fieldName = name;
  input.dataset.fieldType = 'string';
  input.placeholder = prop.description || name;
  return input;
}

function getHtmlInputType(prop) {
  if (prop.format === 'date') return 'date';
  if (prop.format === 'email') return 'email';
  if (prop.format === 'tel') return 'tel';
  if (prop.format === '^#[0-9a-zA-Z]{6}$') return 'color';
  return 'text';
}

function collectFormData(container) {
  const root = container ?? formFields;
  const data = {};
  root.querySelectorAll('[data-field-name]').forEach((el) => {
    const name = el.dataset.fieldName;
    const type = el.dataset.fieldType;

    if (type === 'boolean') {
      data[name] = el.checked;
      return;
    }
    if (type === 'number' || type === 'integer') {
      if (el.value !== '') data[name] = type === 'integer' ? parseInt(el.value) : parseFloat(el.value);
      return;
    }
    if (type === 'object' || type === 'array') {
      if (el.value.trim()) {
        try {
          data[name] = JSON.parse(el.value);
        } catch {
          data[name] = el.value;
        }
      }
      return;
    }
    if (el.value !== '') data[name] = el.value;
  });
  return data;
}

function populateFormFromJson(jsonValueOrElement, formContainer) {
  const jsonStr =
    jsonValueOrElement === undefined
      ? inputArgsText.value
      : typeof jsonValueOrElement === 'string'
        ? jsonValueOrElement
        : (jsonValueOrElement?.value ?? '{}');
  const root = formContainer ?? formFields;
  try {
    const values = JSON.parse(jsonStr || '{}');
    root.querySelectorAll('[data-field-name]').forEach((el) => {
      const name = el.dataset.fieldName;
      if (!(name in values)) return;
      const val = values[name];

      if (el.dataset.fieldType === 'boolean') {
        el.checked = !!val;
      } else if (el.dataset.fieldType === 'object' || el.dataset.fieldType === 'array') {
        el.value = typeof val === 'object' ? JSON.stringify(val, '', ' ') : val;
      } else {
        el.value = val ?? '';
      }
    });
  } catch {}
}

function getInputArgs() {
  if (inputMode === 'form') return JSON.stringify(collectFormData());
  return inputArgsText.value;
}

// Inject content script first.
(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { action: 'LIST_TOOLS' });
  } catch (error) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = error;
    statusDiv.hidden = false;
    copyToClipboard.hidden = true;
  }
})();

let currentTools;

let userPromptPendingId = 0;
let lastSuggestedUserPrompt = '';

// Listen for the results coming back from content.js
chrome.runtime.onMessage.addListener(async ({ message, tools, url }, sender) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (sender.tab && sender.tab.id !== tab.id) return;

  tbody.innerHTML = '';
  thead.innerHTML = '';
  toolNames.innerHTML = '';

  statusDiv.textContent = message;
  statusDiv.hidden = !message;

  if (!tools) return;

  const haveNewTools = JSON.stringify(currentTools) !== JSON.stringify(tools);

  currentTools = tools.map((tool) => ({
    ...tool,
    inputSchema:
      typeof tool.inputSchema === 'object' && tool.inputSchema !== null
        ? JSON.stringify(tool.inputSchema)
        : tool.inputSchema,
  }));
  if (currentTools.length > 0) {
    const first = currentTools[0];
    const parsed = parseInputSchema(first.inputSchema);
    const hasAnySchema = (currentTools.some((t) => (parseInputSchema(t.inputSchema).properties || {}) && Object.keys(parseInputSchema(t.inputSchema).properties || {}).length > 0));
    if (!hasAnySchema && currentTools.length > 0) {
      console.log('[schema] All tools have empty inputSchema. To see parameters, expose schemas from the page (e.g. window.__MCP_TOOL_SCHEMAS__) or ensure the tool source provides inputSchema.');
    }
  }

  if (currentTools.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="100%"><i>No tools registered yet in ${url || tab.url}</i></td>`;
    tbody.appendChild(row);
    inputArgsText.value = '';
    inputArgsText.disabled = true;
    toolNames.disabled = true;
    executeBtn.disabled = true;
    copyToClipboard.hidden = true;
    return;
  }

  inputArgsText.disabled = false;
  toolNames.disabled = false;
  executeBtn.disabled = false;
  copyToClipboard.hidden = false;

  const keys = Object.keys(currentTools[0]);
  keys.forEach((key) => {
    const th = document.createElement('th');
    th.textContent = key;
    thead.appendChild(th);
  });
  const thExecute = document.createElement('th');
  thExecute.textContent = 'Execute';
  thead.appendChild(thExecute);

  const numCols = keys.length + 1;

  currentTools.forEach((item) => {
    const row = document.createElement('tr');
    row.className = 'tool-row';
    keys.forEach((key) => {
      const td = document.createElement('td');
      try {
        td.innerHTML = `<pre>${JSON.stringify(JSON.parse(item[key]), '', '  ')}</pre>`;
      } catch (error) {
        td.textContent = item[key];
      }
      row.appendChild(td);
    });
    const tdBtn = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'row-execute-btn';
    btn.textContent = '▶';
    btn.title = 'Open execute form';
    tdBtn.appendChild(btn);
    row.appendChild(tdBtn);
    tbody.appendChild(row);

    const rawSchema = parseInputSchema(item.inputSchema);
    const schema = normalizeInputSchema(rawSchema);
    const hasInputParams = schema.properties && Object.keys(schema.properties).length > 0;

    const formWrap = document.createElement('div');
    formWrap.className = 'row-execute-form';
    formWrap.dataset.toolName = item.name;

    const modeWrap = document.createElement('div');
    modeWrap.className = 'input-args-header';
    if (hasInputParams) {
      const modeSwitcherRow = document.createElement('div');
      modeSwitcherRow.className = 'mode-switcher row-mode-switcher';
      modeSwitcherRow.innerHTML = '<button type="button" class="mode-btn active" data-mode="form">Form</button><button type="button" class="mode-btn" data-mode="json">JSON</button>';
      modeWrap.appendChild(modeSwitcherRow);
    } else {
      modeWrap.hidden = true;
    }
    formWrap.appendChild(modeWrap);

    const rowFormFields = document.createElement('div');
    rowFormFields.className = 'row-form-fields';
    formWrap.appendChild(rowFormFields);

    const rowInputArgs = document.createElement('textarea');
    rowInputArgs.className = 'row-input-args';
    rowInputArgs.hidden = true;
    rowInputArgs.placeholder = '{}';
    formWrap.appendChild(rowInputArgs);

    const template = generateTemplateFromSchema(schema) ?? {};
    rowInputArgs.value = JSON.stringify(template, '', ' ');
    buildFormFromSchema(schema, rowFormFields);
    populateFormFromJson(rowInputArgs.value, rowFormFields);

    rowInputArgs.addEventListener('input', () => fitTextareaToContent(rowInputArgs));

    const submitWrap = document.createElement('div');
    submitWrap.className = 'form-group';
    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'row-execute-submit';
    submitBtn.textContent = 'Execute';
    submitWrap.appendChild(submitBtn);
    formWrap.appendChild(submitWrap);

    const resultPre = document.createElement('pre');
    resultPre.className = 'row-execute-result';
    formWrap.appendChild(resultPre);

    let rowInputMode = 'form';
    const modeSwitcherRow = modeWrap.querySelector('.row-mode-switcher');
    if (modeSwitcherRow) {
      modeSwitcherRow.querySelectorAll('.mode-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.dataset.mode === rowInputMode) return;
          if (rowInputMode === 'form') rowInputArgs.value = JSON.stringify(collectFormData(rowFormFields), '', ' ');
          rowInputMode = btn.dataset.mode;
          modeSwitcherRow.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          if (rowInputMode === 'form') {
            rowInputArgs.hidden = true;
            rowFormFields.hidden = false;
            populateFormFromJson(rowInputArgs.value, rowFormFields);
          } else {
            rowInputArgs.hidden = false;
            rowFormFields.hidden = true;
            requestAnimationFrame(() => fitTextareaToContent(rowInputArgs));
          }
        });
      });
    }

    btn.addEventListener('click', () => {
      openExecuteModal(formWrap, item.name);
    });

    submitBtn.addEventListener('click', async () => {
      resultPre.textContent = '';
      const inputArgs = rowInputMode === 'form' ? JSON.stringify(collectFormData(rowFormFields)) : rowInputArgs.value;
      const toolName = formWrap.dataset.toolName;
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const result = await chrome.tabs.sendMessage(tab.id, { action: 'EXECUTE_TOOL', name: toolName, inputArgs });
        resultPre.textContent = result != null ? String(result) : '';
      } catch (e) {
        resultPre.textContent = `Error: ${e.message}`;
      }
    });
  });

  currentTools.forEach((item) => {
    const option = document.createElement('option');
    option.textContent = `"${item.name}"`;
    option.value = item.name;
    option.dataset.inputSchema = item.inputSchema;
    toolNames.appendChild(option);
  });
  updateDefaultValueForInputArgs();

  if (haveNewTools) suggestUserPrompt();
});

tbody.ondblclick = () => {
  tbody.classList.toggle('prettify');
};

copyAsScriptToolConfig.onclick = async () => {
  const text = currentTools
    .map((tool) => {
      return `\
script_tools {
  name: "${tool.name}"
  description: "${tool.description}"
  input_schema: ${JSON.stringify(tool.inputSchema || { type: 'object', properties: {} })}
}`;
    })
    .join('\r\n');
  await navigator.clipboard.writeText(text);
};

copyAsJSON.onclick = async () => {
  const tools = currentTools.map((tool) => {
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
        ? JSON.parse(tool.inputSchema)
        : { type: 'object', properties: {} },
    };
  });
  await navigator.clipboard.writeText(JSON.stringify(tools, '', '  '));
};

// Interact with the page

let genAI, chat;

async function initGenAI() {
  let env;
  try {
    env = (await import('./.env.json', { with: { type: 'json' } })).default;
  } catch {
    // .env.json is optional (e.g. not committed); ignore
  }
  if (env?.apiKey) localStorage.apiKey ??= env.apiKey;
  localStorage.model ??= env?.model || 'gemini-2.5-flash';
  genAI = localStorage.apiKey ? new GoogleGenAI({ apiKey: localStorage.apiKey }) : undefined;
  promptBtn.disabled = !localStorage.apiKey;
  resetBtn.disabled = !localStorage.apiKey;
}
initGenAI();

async function suggestUserPrompt() {
  if (currentTools.length == 0 || !genAI || userPromptText.value !== lastSuggestedUserPrompt)
    return;
  const userPromptId = ++userPromptPendingId;
  const response = await genAI.models.generateContent({
    model: localStorage.model,
    contents: [
      '**Context:**',
      `Today's date is: ${getFormattedDate()}`,
      '**Tool Rules:**',
      '1. **Bank Transaction Filter:** Use **PAST** dates only (e.g., "last month," "December 15th," "yesterday").',
      '2. **Flight Search:** Use **FUTURE** dates only (e.g., "next week," "February 15th").',
      '3. **Accommodation Search:** Use **FUTURE** dates only (e.g., "next weekend," "March 15th").',
      '**Task:**',
      'Generate one natural user query for a range of tools below, ideally chaining them together.',
      'Ensure the date makes sense relative to today.',
      'Output the query text only.',
      '**Tools:**',
      JSON.stringify(currentTools),
    ],
  });
  if (userPromptId !== userPromptPendingId || userPromptText.value !== lastSuggestedUserPrompt)
    return;
  lastSuggestedUserPrompt = response.text;
  userPromptText.value = '';
  for (const chunk of response.text) {
    await new Promise((r) => requestAnimationFrame(r));
    userPromptText.value += chunk;
  }
}

userPromptText.onkeydown = (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    promptBtn.click();
  }
};

promptBtn.onclick = async () => {
  try {
    await promptAI();
  } catch (error) {
    trace.push({ error });
    logPrompt(`⚠️ Error: "${error}"`);
  }
};

let trace = [];

async function promptAI() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chat ??= genAI.chats.create({ model: localStorage.model });

  const message = userPromptText.value;
  userPromptText.value = '';
  lastSuggestedUserPrompt = '';
  promptResults.textContent += `User prompt: "${message}"\n`;
  const sendMessageParams = { message, config: getConfig() };
  trace.push({ userPrompt: sendMessageParams });
  let currentResult = await chat.sendMessage(sendMessageParams);
  let finalResponseGiven = false;

  while (!finalResponseGiven) {
    const response = currentResult;
    trace.push({ response });
    const functionCalls = response.functionCalls || [];

    if (functionCalls.length === 0) {
      if (!response.text) {
        logPrompt(`⚠️ AI response has no text: ${JSON.stringify(response.candidates)}\n`);
      } else {
        logPrompt(`AI result: ${response.text?.trim()}\n`);
      }
      finalResponseGiven = true;
    } else {
      const toolResponses = [];
      for (const { name, args } of functionCalls) {
        const inputArgs = JSON.stringify(args);
        logPrompt(`AI calling tool "${name}" with ${inputArgs}`);
        try {
          const result = await chrome.tabs.sendMessage(tab.id, {
            action: 'EXECUTE_TOOL',
            name,
            inputArgs,
          });
          toolResponses.push({ functionResponse: { name, response: { result } } });
          logPrompt(`Tool "${name}" result: ${result}`);
        } catch (e) {
          logPrompt(`⚠️ Error executing tool "${name}": ${e.message}`);
          toolResponses.push({
            functionResponse: { name, response: { error: e.message } },
          });
        }
      }

      // FIXME: New WebMCP tools may not be discovered if there's a navigation.
      // An articial timeout could be introduced for mitigation but it's not robust.

      const sendMessageParams = { message: toolResponses, config: getConfig() };
      trace.push({ userPrompt: sendMessageParams });
      currentResult = await chat.sendMessage(sendMessageParams);
    }
  }
}

resetBtn.onclick = () => {
  chat = undefined;
  trace = [];
  userPromptText.value = '';
  lastSuggestedUserPrompt = '';
  promptResults.textContent = '';
  suggestUserPrompt();
};

apiKeyBtn.onclick = async () => {
  const apiKey = prompt('Enter Gemini API key');
  if (apiKey == null) return;
  localStorage.apiKey = apiKey;
  await initGenAI();
  suggestUserPrompt();
};

traceBtn.onclick = async () => {
  const text = JSON.stringify(trace, '', ' ');
  await navigator.clipboard.writeText(text);
};

executeBtn.onclick = async () => {
  toolResults.textContent = '';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const name = toolNames.selectedOptions[0].value;
  const inputArgs = getInputArgs();
  const result = await chrome.tabs.sendMessage(tab.id, { action: 'EXECUTE_TOOL', name, inputArgs });
  if (result !== null) {
    toolResults.textContent = result;
    return;
  }
  // A navigation was triggered. The result will be on the next document.
  // TODO: Handle case where a new tab is opened.
  await waitForPageLoad(tab.id);
  toolResults.textContent = await chrome.tabs.sendMessage(tab.id, {
    action: 'GET_CROSS_DOCUMENT_SCRIPT_TOOL_RESULT',
  });
};

toolNames.onchange = updateDefaultValueForInputArgs;

function updateDefaultValueForInputArgs() {
  const schema = getSelectedSchema();
  const template = generateTemplateFromSchema(schema);
  inputArgsText.value = JSON.stringify(template, '', ' ');
  buildFormFromSchema(schema);
  populateFormFromJson();
}

// Utils

function logPrompt(text) {
  promptResults.textContent += `${text}\n`;
  promptResults.scrollTop = promptResults.scrollHeight;
}

function getFormattedDate() {
  const today = new Date();
  return today.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getConfig() {
  const systemInstruction = [
    'You are an assistant embedded in a browser tab.',
    'User prompts typically refer to the current tab unless stated otherwise.',
    'Use your tools to query page content when you need it.',
    `Today's date is: ${getFormattedDate()}`,
    'CRITICAL RULE: Whenever the user provides a relative date (e.g., "next Monday", "tomorrow", "in 3 days"),  you must calculate the exact calendar date based on today\'s date.',
  ];

  const functionDeclarations = currentTools.map((tool) => {
    return {
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: tool.inputSchema
        ? JSON.parse(tool.inputSchema)
        : { type: 'object', properties: {} },
    };
  });
  return { systemInstruction, tools: [{ functionDeclarations }] };
}

function generateTemplateFromSchema(schema) {
  if (!schema || typeof schema !== 'object') {
    return null;
  }

  if (schema.hasOwnProperty('const')) {
    return schema.const;
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return generateTemplateFromSchema(schema.oneOf[0]);
  }

  if (schema.hasOwnProperty('default')) {
    return schema.default;
  }

  if (Array.isArray(schema.examples) && schema.examples.length > 0) {
    return schema.examples[0];
  }

  switch (schema.type) {
    case 'object':
      const obj = {};
      if (schema.properties) {
        Object.keys(schema.properties).forEach((key) => {
          obj[key] = generateTemplateFromSchema(schema.properties[key]);
        });
      }
      return obj;

    case 'array':
      if (schema.items) {
        return [generateTemplateFromSchema(schema.items)];
      }
      return [];

    case 'string':
      if (schema.enum && schema.enum.length > 0) {
        return schema.enum[0];
      }
      if (schema.format === 'date') {
        return new Date().toISOString().substring(0, 10);
      }
      // yyyy-MM-ddThh:mm:ss.SSS
      if (
        schema.format ===
        '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\\.[0-9]{1,3})?)?$'
      ) {
        return new Date().toISOString().substring(0, 23);
      }
      // yyyy-MM-ddThh:mm:ss
      if (
        schema.format ===
        '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
      ) {
        return new Date().toISOString().substring(0, 19);
      }
      // yyyy-MM-ddThh:mm
      if (schema.format === '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]$') {
        return new Date().toISOString().substring(0, 16);
      }
      // yyyy-MM
      if (schema.format === '^[0-9]{4}-(0[1-9]|1[0-2])$') {
        return new Date().toISOString().substring(0, 7);
      }
      // yyyy-Www
      if (schema.format === '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$') {
        return `${new Date().toISOString().substring(0, 4)}-W01`;
      }
      // HH:mm:ss.SSS
      if (schema.format === '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\\.[0-9]{1,3})?)?$') {
        return new Date().toISOString().substring(11, 23);
      }
      // HH:mm:ss
      if (schema.format === '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') {
        return new Date().toISOString().substring(11, 19);
      }
      // HH:mm
      if (schema.format === '^([01][0-9]|2[0-3]):[0-5][0-9]$') {
        return new Date().toISOString().substring(11, 16);
      }
      if (schema.format === '^#[0-9a-zA-Z]{6}$') {
        return '#ff00ff';
      }
      if (schema.format === 'tel') {
        return '123-456-7890';
      }
      if (schema.format === 'email') {
        return 'user@example.com';
      }
      return 'example_string';

    case 'number':
    case 'integer':
      if (schema.minimum !== undefined) return schema.minimum;
      return 0;

    case 'boolean':
      return false;

    case 'null':
      return null;

    default:
      return {};
  }
}

function waitForPageLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

document.querySelectorAll('.collapsible-header').forEach((header) => {
  header.addEventListener('click', () => {
    header.classList.toggle('collapsed');
    const content = header.nextElementSibling;
    if (content?.classList.contains('section-content')) {
      content.classList.toggle('is-hidden');
    }
  });
});
