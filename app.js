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
    messageCount: document.getElementById('messageCount')
};

// State
let client = null;
let messageCounter = 0;

/**
 * Initialize the application
 */
function init() {
    elements.connectBtn.addEventListener('click', connect);
    elements.disconnectBtn.addEventListener('click', disconnect);
    elements.clearBtn.addEventListener('click', clearMessages);

    console.log('GS Retail MQTT Monitor initialized');
    console.log('Client ID:', MQTT_CONFIG.clientId);
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

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);
