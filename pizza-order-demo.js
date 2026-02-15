// ─── Logging ───────────────────────────────────────────────────────
function log(msg, cls = 'inf') {
    const el = document.getElementById('log');
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
}

// ─── API check ─────────────────────────────────────────────────────
function checkAPIs() {
    const mc  = 'modelContext' in navigator;
    const mct = 'modelContextTesting' in navigator;

    document.getElementById('mc-dot').className  = `api-dot ${mc  ? 'ok' : 'fail'}`;
    document.getElementById('mct-dot').className = `api-dot ${mct ? 'ok' : 'fail'}`;
    document.getElementById('mc-label').textContent  = mc  ? 'available' : 'unavailable';
    document.getElementById('mct-label').textContent = mct ? 'available' : 'unavailable';

    log(`modelContext: ${mc ? 'YES' : 'NO'} | modelContextTesting: ${mct ? 'YES' : 'NO'}`, mc ? 'ok' : 'wrn');
    return { mc, mct };
}

// ─── Tool definitions (full JSON Schemas) ──────────────────────────
const toolDefs = [
    {
        name: 'order_pizza',
        description: 'Place a pizza order with customer details, pizza configuration, and delivery info',
        inputSchema: {
            type: 'object',
            properties: {
                customerName:        { type: 'string', description: 'Full name of the customer' },
                email:               { type: 'string', format: 'email', description: 'Customer email address' },
                phone:               { type: 'string', format: 'tel', description: 'Customer phone number' },
                size:                { type: 'string', enum: ['personal', 'small', 'medium', 'large', 'extra-large'], description: 'Pizza size' },
                crustType:           { type: 'string', enum: ['thin', 'regular', 'thick', 'stuffed', 'gluten-free'], description: 'Crust type' },
                sauce:               { type: 'string', enum: ['tomato', 'marinara', 'pesto', 'white', 'bbq', 'none'], default: 'tomato', description: 'Sauce selection' },
                quantity:            { type: 'integer', minimum: 1, maximum: 20, default: 1, description: 'Number of pizzas' },
                tipAmount:           { type: 'number', minimum: 0, default: 0, description: 'Tip amount in dollars' },
                extraCheese:         { type: 'boolean', default: false, description: 'Add extra mozzarella (+$1.50)' },
                contactlessDelivery: { type: 'boolean', default: true, description: 'Leave order at the door' },
                deliveryDate:        { type: 'string', format: 'date', description: 'Preferred delivery date' },
                deliveryTime:        { type: 'string', format: '^([01][0-9]|2[0-3]):[0-5][0-9]$', description: 'Preferred delivery time (HH:mm)' },
                deliveryAddress:     { type: 'object', description: 'Delivery address', properties: {
                    street: { type: 'string', description: 'Street address' },
                    city:   { type: 'string', description: 'City name' },
                    zip:    { type: 'string', description: 'ZIP / postal code' }
                }, required: ['street', 'city'] },
                specialInstructions: { type: 'string', description: 'Any special requests or instructions', examples: ['Ring the bell twice', 'Extra napkins please'] }
            },
            required: ['customerName', 'email', 'size', 'crustType', 'quantity', 'deliveryDate', 'deliveryTime']
        }
    },
    {
        name: 'customize_pizza',
        description: 'Customize pizza with toppings, sauce color, spice levels, and baking preferences',
        inputSchema: {
            type: 'object',
            properties: {
                storeId:            { const: 'PIZZA-PALACE-001', description: 'Locked store identifier' },
                couponCode:         { type: 'null', description: 'Coupon code (not yet available)' },
                sauceColor:         { type: 'string', format: '^#[0-9a-zA-Z]{6}$', description: 'Sauce tint as hex color', default: '#d32f2f' },
                bakingTemperature:  { type: 'integer', minimum: 300, maximum: 550, default: 425, description: 'Oven temperature in Fahrenheit' },
                spiceLevel:         { type: 'number', minimum: 0, maximum: 10, default: 3, description: 'Spice heat level (0 = mild, 10 = inferno)' },
                cheeseBlend:        { type: 'string', enum: ['mozzarella', 'four-cheese', 'vegan', 'none'], default: 'mozzarella', description: 'Type of cheese blend' },
                customToppings:     {
                    type: 'array',
                    description: 'Free-text topping names',
                    items: { type: 'string' }
                },
                premiumToppings:    {
                    type: 'array',
                    description: 'Select from premium topping menu',
                    items: {
                        type: 'string',
                        enum: ['truffle oil', 'prosciutto', 'burrata', 'sun-dried tomatoes', 'artichoke hearts', 'smoked salmon', 'nduja', 'wagyu beef']
                    }
                },
                spicePerSlice:      {
                    type: 'array',
                    description: 'Custom spice level per slice (0-10)',
                    items: { type: 'number', minimum: 0, maximum: 10 }
                },
                toppingDistribution: {
                    description: 'How toppings are distributed on the pizza',
                    oneOf: [
                        { title: 'Even', type: 'string', const: 'even' },
                        { title: 'Half-and-Half', type: 'object', description: 'JSON object with left/right topping arrays',
                          default: { left: ["pepperoni", "mushroom"], right: ["olive", "onion"] } },
                        { title: 'Custom Zones', type: 'array', items: { type: 'object' }, description: 'Array of zone objects',
                          default: [{ zone: "north", toppings: ["pepperoni"] }, { zone: "south", toppings: ["mushroom"] }] }
                    ]
                }
            },
            required: ['storeId', 'bakingTemperature']
        }
    },
    {
        name: 'schedule_delivery',
        description: 'Schedule a pizza delivery with precise timing, recurring orders, and routing options',
        inputSchema: {
            type: 'object',
            properties: {
                pickupDateTime:    {
                    type: 'string',
                    format: '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]$',
                    description: 'Exact pickup date and time'
                },
                subscriptionMonth: {
                    type: 'string',
                    format: '^[0-9]{4}-(0[1-9]|1[0-2])$',
                    description: 'Month for recurring subscription'
                },
                deliveryWeek:      {
                    type: 'string',
                    format: '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$',
                    description: 'Delivery week (ISO week number)'
                },
                maxDeliveryMinutes: {
                    type: 'integer',
                    minimum: 10,
                    maximum: 120,
                    default: 45,
                    description: 'Maximum acceptable delivery time in minutes'
                },
                driverNotes:       {
                    type: 'string',
                    description: 'Notes for the delivery driver',
                    examples: ['Use the side entrance', 'Call on arrival']
                },
                priorityDelivery:  { type: 'boolean', default: false, description: 'Express delivery (+$3.99)' },
                routePreferences:  {
                    type: 'object',
                    description: 'Routing preferences as JSON (e.g. avoidHighways, preferredRoute)'
                },
                waypoints:         {
                    type: 'array',
                    description: 'Ordered list of delivery waypoints (lat, lng, label)',
                    items: {
                        type: 'object',
                        properties: {
                            lat:   { type: 'number' },
                            lng:   { type: 'number' },
                            label: { type: 'string' }
                        }
                    }
                }
            },
            required: ['pickupDateTime']
        }
    }
];

// ─── Register tools via navigator.modelContext ─────────────────────
// The extension reads inputSchema directly from listTools(), so we pass
// it on each tool object. No need for window.__MCP_TOOL_SCHEMAS__.
function registerTools() {
    if (!('modelContext' in navigator)) {
        log('navigator.modelContext not available — cannot register tools', 'err');
        return;
    }
    try {
        const tools = toolDefs.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            execute: async (params) => {
                log(`Tool executed: ${t.name}(${JSON.stringify(params)})`, 'ok');
                return { success: true, tool: t.name, params };
            }
        }));
        navigator.modelContext.provideContext({ tools });
        log(`Registered ${tools.length} tools via navigator.modelContext.provideContext()`, 'ok');
    } catch (e) {
        log(`Error registering tools: ${e.message}`, 'err');
    }
}

// ─── Register tools immediately ────────────────────────────────────
registerTools();

// ─── Agent-active visual helpers ───────────────────────────────────
function setAgentActive(form, active) {
    const toolName = form.getAttribute('toolname');
    const submitBtn = form.querySelector('button[type="submit"]');

    if (active) {
        form.classList.add('tool-form-active');
        if (submitBtn) submitBtn.classList.add('tool-submit-active');

        // Inject a small banner so it's obvious an agent is filling the form
        if (!form.querySelector('.agent-banner')) {
            const banner = document.createElement('div');
            banner.className = 'agent-banner';
            banner.textContent = '🤖 AI Agent is filling this form…';
            form.insertBefore(banner, form.firstChild);
        }
        log(`✦ Agent ACTIVE on "${toolName}" — form highlighted`, 'inf');
    } else {
        form.classList.remove('tool-form-active');
        if (submitBtn) submitBtn.classList.remove('tool-submit-active');

        const banner = form.querySelector('.agent-banner');
        if (banner) banner.remove();
        log(`✦ Agent DEACTIVATED on "${toolName}" — form reset`, 'wrn');
    }
}

// ─── Form submit + WebMCP event handlers ──────────────────────────
document.querySelectorAll('form[toolname]').forEach(form => {

    // ── submit: detect human vs agent ──
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        // Convert checkboxes
        form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            data[cb.name] = cb.checked;
        });
        const toolName = form.getAttribute('toolname');
        const fromAgent = !!e.agentInvoked;   // true when WebMCP agent submitted

        log(`SUBMIT "${toolName}" (agent=${fromAgent}): ${JSON.stringify(data)}`, 'ok');

        // If agent submitted, return structured result via respondWith()
        if (fromAgent && typeof e.respondWith === 'function') {
            const result = new Promise((resolve) => {
                resolve({ success: true, tool: toolName, params: data });
            });
            e.respondWith(result);
            log(`respondWith() sent result back to agent for "${toolName}"`, 'ok');
        }

        // Clear agent-active state after submission
        setAgentActive(form, false);

        // If the testing API is available, also execute via it
        if ('modelContextTesting' in navigator) {
            navigator.modelContextTesting.executeTool(toolName, data)
                .then(result => log(`executeTool result: ${JSON.stringify(result)}`, 'ok'))
                .catch(err  => log(`executeTool error: ${err.message}`, 'err'));
        }
    });

    // ── toolactivated: agent has pre-filled the form fields ──
    form.addEventListener('toolactivated', (e) => {
        setAgentActive(form, true);
    });

    // ── toolcancel: agent cancelled / user reset ──
    form.addEventListener('toolcancel', (e) => {
        setAgentActive(form, false);
    });

    // ── reset also clears agent state ──
    form.addEventListener('reset', () => {
        setAgentActive(form, false);
    });
});

// ─── Clear log button ──────────────────────────────────────────────
document.getElementById('clear-log-btn').addEventListener('click', () => {
    document.getElementById('log').innerHTML = '';
});

// ─── Init ──────────────────────────────────────────────────────────
window.addEventListener('load', () => {
    log('='.repeat(55), 'dim');
    log('Pizza Palace — WebMCP Tool Input Types Demo', 'ok');
    log('='.repeat(55), 'dim');

    const { mc, mct } = checkAPIs();

    document.getElementById('tool-count').textContent = `${toolDefs.length} tools`;

    // Set today as default delivery date
    const today = new Date().toISOString().substring(0, 10);
    const dateInput = document.querySelector('input[name="deliveryDate"]');
    if (dateInput) dateInput.value = today;

    log('', 'dim');
    log('Open the Tool Inspector extension sidebar to see all input types rendered as form fields.', 'inf');
    log('Each tool demonstrates a different set of JSON Schema types:', 'inf');
    log('  order_pizza      — string, enum, email, tel, date, time, integer, number, boolean, object', 'inf');
    log('  customize_pizza   — const, null, color, oneOf, array<string>, array<enum>, array<number>', 'inf');
    log('  schedule_delivery — datetime-local, month, week, array<object>, examples, defaults', 'inf');
    log('='.repeat(55), 'dim');
});
