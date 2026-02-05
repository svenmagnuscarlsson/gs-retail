/**
 * GS Retail People Counting Dashboard
 * Visualizes data from SQLite via API and real-time MQTT
 */

// MQTT Configuration
const MQTT_CONFIG = {
    host: 'mqtt.swedeniot.se',
    port: 9001,
    path: '/ws',
    useSSL: true,
    username: 'maca',
    password: 'maca2025',
    topic: 'gs-retail/sensor/onvif-ej/PeopleCounting/PeopleCountPunctual/&VideoEncoderToken-01-0/line2',
    clientId: 'gs-retail-web-' + Math.random().toString(16).substring(2, 10)
};

// DOM Elements
const elements = {
    connectionStatus: document.getElementById('connectionStatus'),
    messagesContainer: document.getElementById('messagesContainer'),
    emptyState: document.getElementById('emptyState'),
    messageCount: document.getElementById('messageCount'),
    clearBtn: document.getElementById('clearBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    // Stats
    totalIn: document.getElementById('totalIn'),
    totalOut: document.getElementById('totalOut'),
    occupancy: document.getElementById('occupancy'),
    // Table
    countsBody: document.getElementById('countsBody')
};

// State
let client = null;
let messageCounter = 0;
let flowChart = null;
let hourlyChart = null;

/**
 * Initialize the application
 */
async function init() {
    // Event Listeners
    elements.clearBtn.addEventListener('click', clearMessages);
    elements.refreshBtn.addEventListener('click', refreshData);

    // Initial Data Fetch
    await refreshData();

    // Setup MQTT
    connectMQTT();

    // Auto-refresh data every 60 seconds
    setInterval(refreshData, 60000);

    console.log('GS Retail Dashboard initialized');
}

/**
 * Fetch data and refresh charts/stats
 */
async function refreshData() {
    try {
        const [countsRes, statsRes] = await Promise.all([
            fetch('/api/counts'),
            fetch('/api/stats')
        ]);

        const counts = await countsRes.json();
        const stats = await statsRes.json();

        updateStats(stats.summary);
        updateTable(counts);
        renderCharts(stats);
    } catch (err) {
        console.error('Error refreshing data:', err);
    }
}

/**
 * Update summary cards
 */
function updateStats(summary) {
    let totalIn = 0;
    let totalOut = 0;

    summary.forEach(item => {
        if (item.direction === 'in') totalIn = item.total;
        if (item.direction === 'out') totalOut = item.total;
    });

    elements.totalIn.textContent = totalIn;
    elements.totalOut.textContent = totalOut;
    elements.occupancy.textContent = Math.max(0, totalIn - totalOut);
}

/**
 * Update recent events table
 */
function updateTable(counts) {
    elements.countsBody.innerHTML = '';
    counts.slice(0, 10).forEach(row => {
        const tr = document.createElement('tr');
        const dirLabel = row.direction === 'in' ? '🟢 IN' : '🔴 UT';
        tr.innerHTML = `
            <td>${row.timestamp}</td>
            <td class="dir-${row.direction}">${dirLabel}</td>
            <td>${row.count}</td>
        `;
        elements.countsBody.appendChild(tr);
    });
}

/**
 * Render Chart.js diagrams
 */
function renderCharts(data) {
    const ctxFlow = document.getElementById('flowChart').getContext('2d');
    const ctxHourly = document.getElementById('hourlyChart').getContext('2d');

    // Process Hourly Data
    const labels = [...new Set(data.hourly.map(d => d.hour.split(' ')[1].substring(0, 5)))];
    const inData = labels.map(label => {
        const found = data.hourly.find(d => d.hour.includes(label) && d.direction === 'in');
        return found ? found.count : 0;
    });
    const outData = labels.map(label => {
        const found = data.hourly.find(d => d.hour.includes(label) && d.direction === 'out');
        return found ? found.count : 0;
    });

    // Flow Chart (Line)
    if (flowChart) flowChart.destroy();
    flowChart = new Chart(ctxFlow, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'In',
                    data: inData,
                    borderColor: '#00ff88',
                    backgroundColor: 'rgba(0, 255, 136, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Ut',
                    data: outData,
                    borderColor: '#ff4757',
                    backgroundColor: 'rgba(255, 71, 87, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: chartOptions
    });

    // Hourly Chart (Bar)
    if (hourlyChart) hourlyChart.destroy();
    hourlyChart = new Chart(ctxHourly, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'In',
                    data: inData,
                    backgroundColor: '#00ff88'
                },
                {
                    label: 'Ut',
                    data: outData,
                    backgroundColor: '#ff4757'
                }
            ]
        },
        options: chartOptions
    });
}

const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            labels: { color: 'rgba(255, 255, 255, 0.7)' }
        }
    },
    scales: {
        y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: { color: 'rgba(255, 255, 255, 0.5)' }
        },
        x: {
            grid: { display: false },
            ticks: { color: 'rgba(255, 255, 255, 0.5)' }
        }
    }
};

/**
 * Setup MQTT Connection
 */
function connectMQTT() {
    client = new Paho.Client(MQTT_CONFIG.host, MQTT_CONFIG.port, MQTT_CONFIG.path, MQTT_CONFIG.clientId);
    client.onMessageArrived = onMessageArrived;
    client.onConnectionLost = (responseObject) => {
        console.error('MQTT Lost:', responseObject.errorMessage);
        updateConnectionStatus('disconnected');
    };

    client.connect({
        useSSL: MQTT_CONFIG.useSSL,
        userName: MQTT_CONFIG.username,
        password: MQTT_CONFIG.password,
        timeout: 10,
        reconnect: true,
        onSuccess: () => {
            console.log('MQTT Connected');
            updateConnectionStatus('connected');
            client.subscribe(MQTT_CONFIG.topic);
        },
        onFailure: (err) => {
            console.error('MQTT Failed:', err);
            updateConnectionStatus('disconnected');
        }
    });
}

function onMessageArrived(message) {
    messageCounter++;
    elements.messageCount.textContent = messageCounter;
    if (elements.emptyState) elements.emptyState.style.display = 'none';

    const card = document.createElement('div');
    card.className = 'message-card';
    const timestamp = new Date().toLocaleTimeString('sv-SE');

    try {
        const data = JSON.parse(message.payloadString);
        const dir = data.Data?.Direction || 'unknown';
        const cnt = data.Data?.Count || 0;

        card.innerHTML = `
            <div class="status-indicator ${dir === 'in' ? 'state-true' : 'state-false'}"></div>
            <div class="event-info">
                <span class="event-source">Line Crossing</span>
                <span class="event-type">${dir.toUpperCase()}</span>
            </div>
            <span class="state-badge active">${cnt}st</span>
            <span class="message-time">${timestamp}</span>
        `;

        // Refresh API data when new MQTT message arrives to keep charts updated
        refreshData();
    } catch (e) {
        card.innerHTML = `<pre>${message.payloadString}</pre>`;
    }

    elements.messagesContainer.insertBefore(card, elements.messagesContainer.firstChild);
    const cards = elements.messagesContainer.querySelectorAll('.message-card');
    if (cards.length > 20) cards[cards.length - 1].remove();
}

function updateConnectionStatus(status) {
    elements.connectionStatus.className = 'connection-status ' + (status === 'connected' ? 'connected' : '');
    elements.connectionStatus.querySelector('.status-text').textContent = status === 'connected' ? 'Ansluten' : 'Frånkopplad';
}

function clearMessages() {
    messageCounter = 0;
    elements.messageCount.textContent = '0';
    elements.messagesContainer.innerHTML = '';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);

