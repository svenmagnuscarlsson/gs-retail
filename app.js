/**
 * GS Retail MQTT Sensor Monitor
 * Connects to MQTT broker via WebSockets and displays sensor messages
 */

// MQTT Configuration
const MQTT_CONFIG = {
    host: 'mqtt.swedeniot.se',
    port: 9001,
    path: '/ws',
    useSSL: true,
    username: 'maca',
    password: 'maca2025',
    topic: 'gs-retail/sensor/onvif-ej/#',
    clientId: 'gs-retail-web-' + Math.random().toString(16).substring(2, 10)
};

// DOM Elements
const elements = {
    connectBtn: document.getElementById('connectBtn'),
    disconnectBtn: document.getElementById('disconnectBtn'),
    clearBtn: document.getElementById('clearBtn'),
    connectionStatus: document.getElementById('connectionStatus'),
    messagesContainer: document.getElementById('messagesContainer'),
    emptyState: document.getElementById('emptyState'),
    messageCount: document.getElementById('messageCount'),
    // Sensor Dashboard
    sensorGrid: document.getElementById('sensorGrid'),
    emptySensors: document.getElementById('emptySensors'),
    sensorCount: document.getElementById('sensorCount'),
    motionCount: document.getElementById('motionCount'),
    personCount: document.getElementById('personCount')
};

// State
let client = null;
let messageCounter = 0;

// Sensor State Tracking
const sensorState = {};
let totalMotionEvents = 0;
let totalPersonDetections = 0;

/**
 * Initialize the application
 */
function init() {
    elements.connectBtn.addEventListener('click', connect);
    elements.disconnectBtn.addEventListener('click', disconnect);
    elements.clearBtn.addEventListener('click', clearMessages);

    // Debug helper
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('debug')) {
        createDebugControls();
    }

    console.log('GS Retail MQTT Monitor initialized');
    console.log('Client ID:', MQTT_CONFIG.clientId);
}

/**
 * Create debug controls
 */
function createDebugControls() {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.style.marginLeft = '1rem';
    btn.innerHTML = '🔧 Simulera Data';
    btn.onclick = simulateMessage;

    document.querySelector('.button-group').appendChild(btn);
    addSystemMessage('Debug-läge aktiverat. Klicka på "Simulera Data" för att testa UI.', 'info');
}

/**
 * Simulate an incoming MQTT message
 */
function simulateMessage() {
    const isError = Math.random() > 0.8;
    const isActive = Math.random() > 0.5;

    const mockData = {
        UtcTime: new Date().toISOString(),
        Source: {
            Source: "VideoSourceToken-" + Math.floor(Math.random() * 5),
            Name: "Entrance Camera " + Math.floor(Math.random() * 5)
        },
        Data: {
            State: isActive,
            Motion: Math.random() * 100
        }
    };

    const message = {
        destinationName: 'gs-retail/sensor/onvif-ej/VideoSource/MotionAlarm',
        payloadString: JSON.stringify(mockData)
    };

    onMessageArrived(message);
}

/**
 * Connect to MQTT broker
 */
function connect() {
    console.log('Attempting to connect to MQTT broker...');
    updateConnectionStatus('connecting');

    // Create Paho MQTT client
    client = new Paho.Client(
        MQTT_CONFIG.host,
        MQTT_CONFIG.port,
        MQTT_CONFIG.path,
        MQTT_CONFIG.clientId
    );

    // Set callback handlers
    client.onConnectionLost = onConnectionLost;
    client.onMessageArrived = onMessageArrived;

    // Connection options
    const options = {
        useSSL: MQTT_CONFIG.useSSL,
        userName: MQTT_CONFIG.username,
        password: MQTT_CONFIG.password,
        onSuccess: onConnect,
        onFailure: onFailure,
        timeout: 10,
        reconnect: true,
        keepAliveInterval: 30
    };

    // Connect
    client.connect(options);
}

/**
 * Disconnect from MQTT broker
 */
function disconnect() {
    if (client && client.isConnected()) {
        console.log('Disconnecting from MQTT broker...');
        client.disconnect();
        updateConnectionStatus('disconnected');
        updateButtonStates(false);
    }
}

/**
 * Called when connection is successful
 */
function onConnect() {
    console.log('Connected to MQTT broker successfully!');
    updateConnectionStatus('connected');
    updateButtonStates(true);

    // Subscribe to topic
    console.log('Subscribing to topic:', MQTT_CONFIG.topic);
    client.subscribe(MQTT_CONFIG.topic, {
        qos: 0,
        onSuccess: () => {
            console.log('Successfully subscribed to:', MQTT_CONFIG.topic);
            addSystemMessage('Ansluten och prenumererar på: ' + MQTT_CONFIG.topic);
        },
        onFailure: (err) => {
            console.error('Failed to subscribe:', err);
            addSystemMessage('Kunde inte prenumerera: ' + err.errorMessage, 'error');
        }
    });
}

/**
 * Called when connection fails
 * @param {Object} error - Error object
 */
function onFailure(error) {
    console.error('Connection failed:', error);
    updateConnectionStatus('disconnected');
    updateButtonStates(false);
    addSystemMessage('Anslutning misslyckades: ' + error.errorMessage, 'error');
}

/**
 * Called when connection is lost
 * @param {Object} responseObject - Response object containing error info
 */
function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
        console.error('Connection lost:', responseObject.errorMessage);
        addSystemMessage('Anslutningen förlorad: ' + responseObject.errorMessage, 'error');
    }
    updateConnectionStatus('disconnected');
    updateButtonStates(false);
}

/**
 * Called when a message arrives
 * @param {Object} message - MQTT message object
 */
function onMessageArrived(message) {
    console.log('Message received:', message.destinationName, message.payloadString);

    messageCounter++;
    elements.messageCount.textContent = messageCounter;

    // Hide empty state
    if (elements.emptyState) {
        elements.emptyState.style.display = 'none';
    }

    // Process sensor event for dashboard
    processSensorEvent(message);

    // Create message card
    const messageCard = createMessageCard(message);

    // Add to top of container
    elements.messagesContainer.insertBefore(messageCard, elements.messagesContainer.firstChild);

    // Limit number of messages displayed (keep last 100)
    const cards = elements.messagesContainer.querySelectorAll('.message-card');
    if (cards.length > 100) {
        cards[cards.length - 1].remove();
    }
}

/**
 * Create a message card element
 * @param {Object} message - MQTT message object
 * @returns {HTMLElement} Message card element
 */
function createMessageCard(message) {
    const card = document.createElement('div');
    card.className = 'message-card';

    const timestamp = new Date().toLocaleTimeString('sv-SE');

    // Parse the payload
    let payload = message.payloadString;
    let parsedData = null;
    let state = null;
    let source = null;
    let eventType = null;

    try {
        parsedData = JSON.parse(payload);

        // Extract relevant data from ONVIF sensor format
        if (parsedData.Data && parsedData.Data.State !== undefined) {
            state = parsedData.Data.State;
        }
        if (parsedData.Source && parsedData.Source.Source) {
            source = parsedData.Source.Source;
        }

        payload = JSON.stringify(parsedData, null, 2);
    } catch (e) {
        // Not JSON, use as-is
    }

    // Extract event type from topic
    const topicParts = message.destinationName.split('/');
    eventType = topicParts[topicParts.length - 1] || 'Event';

    // Determine state class
    let stateClass = 'state-unknown';
    let stateText = '—';
    let badgeClass = 'inactive';

    if (state === true || state === 'true') {
        stateClass = 'state-true';
        stateText = 'AKTIV';
        badgeClass = 'active';
    } else if (state === false || state === 'false') {
        stateClass = 'state-false';
        stateText = 'INAKTIV';
        badgeClass = 'inactive';
    }

    // Build the compact card HTML
    card.innerHTML = `
        <div class="status-indicator ${stateClass}"></div>
        <div class="event-info">
            <span class="event-source">${escapeHtml(source || eventType)}</span>
            <span class="event-type">${escapeHtml(eventType)}</span>
        </div>
        <span class="state-badge ${badgeClass}">${stateText}</span>
        <span class="message-time">${timestamp}</span>
        <div class="message-payload-wrapper">
            <div class="message-header">
                <span class="message-topic">${escapeHtml(message.destinationName)}</span>
            </div>
            <pre class="message-payload">${escapeHtml(payload)}</pre>
        </div>
    `;

    // Toggle expand on click
    card.addEventListener('click', () => {
        card.classList.toggle('expanded');
    });

    return card;
}

/**
 * Add a system message to the container
 * @param {string} text - Message text
 * @param {string} type - Message type ('info', 'error', 'success')
 */
function addSystemMessage(text, type = 'info') {
    // Hide empty state
    if (elements.emptyState) {
        elements.emptyState.style.display = 'none';
    }

    const card = document.createElement('div');
    card.className = 'message-card';
    card.style.borderLeft = `3px solid ${type === 'error' ? 'var(--color-error)' : 'var(--color-success)'}`;

    const timestamp = new Date().toLocaleTimeString('sv-SE');

    const icon = type === 'error' ? '⚠️' : '✓';

    card.innerHTML = `
        <div class="status-indicator ${type === 'error' ? 'state-unknown' : 'state-true'}"></div>
        <div class="event-info">
            <span class="event-source">${icon} System</span>
            <span class="event-type">${type === 'error' ? 'Fel' : 'Info'}</span>
        </div>
        <span class="state-badge ${type === 'error' ? 'inactive' : 'active'}">${type === 'error' ? 'FEL' : 'OK'}</span>
        <span class="message-time">${timestamp}</span>
        <div class="message-payload-wrapper">
            <pre class="message-payload">${escapeHtml(text)}</pre>
        </div>
    `;

    card.addEventListener('click', () => {
        card.classList.toggle('expanded');
    });

    elements.messagesContainer.insertBefore(card, elements.messagesContainer.firstChild);
}

/**
 * Clear all messages
 */
function clearMessages() {
    messageCounter = 0;
    elements.messageCount.textContent = '0';

    // Remove all message cards
    const cards = elements.messagesContainer.querySelectorAll('.message-card');
    cards.forEach(card => card.remove());

    // Show empty state
    if (elements.emptyState) {
        elements.emptyState.style.display = 'flex';
    }
}

/**
 * Update connection status display
 * @param {string} status - Connection status ('connected', 'disconnected', 'connecting')
 */
function updateConnectionStatus(status) {
    const statusText = elements.connectionStatus.querySelector('.status-text');

    elements.connectionStatus.classList.remove('connected');

    switch (status) {
        case 'connected':
            elements.connectionStatus.classList.add('connected');
            statusText.textContent = 'Ansluten';
            break;
        case 'connecting':
            statusText.textContent = 'Ansluter...';
            break;
        default:
            statusText.textContent = 'Frånkopplad';
    }
}

/**
 * Update button states based on connection status
 * @param {boolean} isConnected - Whether connected or not
 */
function updateButtonStates(isConnected) {
    elements.connectBtn.disabled = isConnected;
    elements.disconnectBtn.disabled = !isConnected;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// Sensor Dashboard Functions
// ========================================

/**
 * Process sensor event and update dashboard
 * @param {Object} message - MQTT message object
 */
function processSensorEvent(message) {
    const topic = message.destinationName;
    let payload;

    try {
        payload = JSON.parse(message.payloadString);
    } catch (e) {
        return; // Not JSON, skip
    }

    // Extract sensor ID from topic or payload
    const sensorId = extractSensorId(topic, payload);
    if (!sensorId) return;

    // Parse event type from topic
    const eventInfo = parseEventType(topic);

    // Initialize sensor if new
    if (!sensorState[sensorId]) {
        sensorState[sensorId] = {
            id: sensorId,
            motionAlarm: false,
            motionEvents: 0,
            motionDetection: false,
            personCount: 0,
            lastPersonTime: null,
            lastActivity: new Date(),
            isActive: false
        };
        // Hide empty state
        if (elements.emptySensors) {
            elements.emptySensors.style.display = 'none';
        }
    }

    const sensor = sensorState[sensorId];
    sensor.lastActivity = new Date();

    // Update sensor based on event type
    if (eventInfo.type === 'MotionAlarm') {
        const state = payload.Data?.State;
        sensor.motionAlarm = state === true || state === 'true';
        sensor.isActive = sensor.motionAlarm;
        if (sensor.motionAlarm) {
            sensor.motionEvents++;
            totalMotionEvents++;
        }
    } else if (eventInfo.type === 'MotionDetection') {
        const motion = payload.Data?.Motion;
        sensor.motionDetection = motion === '1' || motion === 1 || motion === true;
        sensor.isActive = sensor.motionDetection || sensor.motionAlarm;
    } else if (eventInfo.type === 'ObjectDetection') {
        const classType = payload.Data?.ClassTypes;
        if (classType === 'Person') {
            sensor.personCount++;
            sensor.lastPersonTime = new Date();
            totalPersonDetections++;
        }
    }

    // Update UI
    updateSensorCard(sensor);
    updateGlobalStats();
}

/**
 * Extract sensor ID from topic and payload
 */
function extractSensorId(topic, payload) {
    // Try to get from Source field
    if (payload.Source) {
        if (payload.Source.Source) return payload.Source.Source;
        if (payload.Source.VideoSource) return payload.Source.VideoSource;
    }

    // Try to extract from topic (format: .../&VideoSourceToken-X...)
    const match = topic.match(/VideoSourceToken-\d+/);
    return match ? match[0] : null;
}

/**
 * Parse event type from MQTT topic
 */
function parseEventType(topic) {
    const parts = topic.split('/');

    if (topic.includes('MotionAlarm')) {
        return { type: 'MotionAlarm', category: 'motion' };
    } else if (topic.includes('MotionDetection')) {
        return { type: 'MotionDetection', category: 'motion' };
    } else if (topic.includes('ObjectDetection')) {
        return { type: 'ObjectDetection', category: 'ai' };
    }

    return { type: parts[parts.length - 1] || 'Unknown', category: 'other' };
}

/**
 * Update or create sensor card in dashboard
 */
function updateSensorCard(sensor) {
    let card = document.getElementById(`sensor-${sensor.id}`);

    if (!card) {
        card = createSensorCard(sensor);
        elements.sensorGrid.appendChild(card);
    }

    // Update card content
    const statusEl = card.querySelector('.sensor-status');
    const motionEventsEl = card.querySelector('.motion-events-value');
    const motionBarEl = card.querySelector('.motion-bar-fill');
    const personRowEl = card.querySelector('.person-row');
    const personValueEl = card.querySelector('.person-value');
    const lastActivityEl = card.querySelector('.last-activity-time');

    // Update active state
    if (sensor.isActive) {
        card.classList.add('active');
        statusEl.classList.add('active');
        statusEl.classList.remove('inactive');
        statusEl.innerHTML = '<span class="status-pulse"></span> AKTIV';
    } else {
        card.classList.remove('active');
        statusEl.classList.remove('active');
        statusEl.classList.add('inactive');
        statusEl.innerHTML = '<span class="status-pulse"></span> INAKTIV';
    }

    // Update motion events
    motionEventsEl.textContent = sensor.motionEvents;

    // Update motion bar (max 50 events for full bar)
    const barWidth = Math.min((sensor.motionEvents / 50) * 100, 100);
    motionBarEl.style.width = `${barWidth}%`;

    // Update person detection
    if (sensor.personCount > 0) {
        personRowEl.classList.add('person-detected');
        personValueEl.textContent = `${sensor.personCount} detekterade`;
    }

    // Update last activity
    lastActivityEl.textContent = sensor.lastActivity.toLocaleTimeString('sv-SE');

    // Trigger pulse animation
    card.classList.remove('pulse');
    void card.offsetWidth; // Force reflow
    card.classList.add('pulse');
}

/**
 * Create sensor card element
 */
function createSensorCard(sensor) {
    const card = document.createElement('div');
    card.className = 'sensor-card';
    card.id = `sensor-${sensor.id}`;

    card.innerHTML = `
        <div class="sensor-header">
            <div class="sensor-name">
                <span class="icon">📹</span>
                <span>${escapeHtml(sensor.id)}</span>
            </div>
            <div class="sensor-status inactive">
                <span class="status-pulse"></span>
                INAKTIV
            </div>
        </div>
        <div class="sensor-metrics">
            <div class="metric-row">
                <span class="metric-icon">🎯</span>
                <span class="metric-label">Motion Events</span>
                <div class="motion-bar">
                    <div class="motion-bar-fill" style="width: 0%"></div>
                </div>
                <span class="metric-value motion-events-value">0</span>
            </div>
            <div class="metric-row">
                <span class="metric-icon">📡</span>
                <span class="metric-label">Motion Detection</span>
                <span class="metric-value">${sensor.motionDetection ? 'Aktiv' : 'Inaktiv'}</span>
            </div>
            <div class="metric-row person-row">
                <span class="metric-icon">👤</span>
                <span class="metric-label">Person Detection</span>
                <span class="metric-value person-value">0 detekterade</span>
            </div>
        </div>
        <div class="sensor-footer">
            <div class="last-activity">
                <span>Senast aktiv:</span>
                <span class="last-activity-time">${sensor.lastActivity.toLocaleTimeString('sv-SE')}</span>
            </div>
        </div>
    `;

    return card;
}

/**
 * Update global statistics
 */
function updateGlobalStats() {
    const sensorCount = Object.keys(sensorState).length;
    elements.sensorCount.textContent = sensorCount;
    elements.motionCount.textContent = totalMotionEvents;
    elements.personCount.textContent = totalPersonDetections;
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);
