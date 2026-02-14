/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

console.debug('[WebMCP] Content script injected');

chrome.runtime.onMessage.addListener(({ action, name, inputArgs }, _, reply) => {
  try {
    if (!navigator.modelContextTesting) {
      throw new Error('Error: You must run Chrome with the "WebMCP for testing" flag enabled.');
    }
    if (action == 'LIST_TOOLS') {
      listTools();
      navigator.modelContextTesting.registerToolsChangedCallback(listTools);
    }
    if (action == 'EXECUTE_TOOL') {
      console.debug(`[WebMCP] Execute tool "${name}" with`, inputArgs);
      let targetFrame, loadPromise;
      // Check if this tool is associated with a form target
      const formTarget = document.querySelector(`form[toolname="${name}"]`)?.target;
      if (formTarget) {
        targetFrame = document.querySelector(`[name=${formTarget}]`);
        loadPromise = new Promise((resolve) => {
          targetFrame.addEventListener('load', resolve, { once: true });
        });
      }
      // Execute the experimental tool
      const promise = navigator.modelContextTesting.executeTool(name, inputArgs);
      promise
        .then(async (result) => {
          // If result is null and we have a target frame, wait for the frame to reload.
          if (result === null && targetFrame) {
            console.debug(`[WebMCP] Waiting for form target ${targetFrame} to load`);
            await loadPromise;
            console.debug('[WebMCP] Get cross document script tool result');
            result =
              await targetFrame.contentWindow.navigator.modelContextTesting.getCrossDocumentScriptToolResult();
          }
          reply(result);
        })
        .catch(({ message }) => reply(JSON.stringify(message)));
      return true;
    }
    if (action == 'GET_CROSS_DOCUMENT_SCRIPT_TOOL_RESULT') {
      console.debug('[WebMCP] Get cross document script tool result');
      const promise = navigator.modelContextTesting.getCrossDocumentScriptToolResult();
      promise.then(reply).catch(({ message }) => reply(JSON.stringify(message)));
      return true;
    }
  } catch ({ message }) {
    chrome.runtime.sendMessage({ message });
  }
});

function listTools() {
  const rawTools = navigator.modelContextTesting.listTools();
  console.debug(`[WebMCP] Got ${rawTools.length} tools`, rawTools);

  function sendTools(schemaMap) {
    const tools = rawTools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema || schemaMap[t.name] || '',
    }));
    chrome.runtime.sendMessage({ tools, url: location.href });
  }

  // Read schemas from page's main world (e.g. window.__MCP_TOOL_SCHEMAS__).
  // Retry a few times so we pick up schemas set after MCP clients connect.
  getPageSchemas().then((schemaMap) => {
    const hasSchemas = Object.keys(schemaMap || {}).length > 0;
    if (hasSchemas || rawTools.length === 0) {
      sendTools(schemaMap || {});
      return;
    }
    setTimeout(() => {
      getPageSchemas().then((retryMap) => {
        const hasRetry = Object.keys(retryMap || {}).length > 0;
        if (hasRetry) {
          sendTools(retryMap);
          return;
        }
        setTimeout(() => {
          getPageSchemas().then((finalMap) => sendTools(finalMap || {}));
        }, 400);
      });
    }, 400);
  });
}

function getPageSchemas() {
  return new Promise(resolve => {
    const id = '__webmcp_schema_req_' + Date.now();
    const handler = (event) => {
      if (event.data?.type === id) {
        window.removeEventListener('message', handler);
        resolve(event.data.schemas || {});
      }
    };
    window.addEventListener('message', handler);

    // Inject a script into the main world to read the schemas
    const script = document.createElement('script');
    script.textContent = `window.postMessage({type:'${id}',schemas:window.__MCP_TOOL_SCHEMAS__||{}})`;
    document.documentElement.appendChild(script);
    script.remove();

    // Timeout fallback - don't block forever
    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve({});
    }, 200);
  });
}

window.addEventListener('toolactivated', ({ toolName }) => {
  console.debug(`[WebMCP] Tool "${toolName}" started execution.`);
});

window.addEventListener('toolcancel', ({ toolName }) => {
  console.debug(`[WebMCP] Tool "${toolName}" execution is cancelled.`);
});
