/**
 * GS Retail People Counting Dashboard
 * Visualizes data from SQLite via API and real-time MQTT
 */

// MQTT Configuration
let MQTT_CONFIG = null;

// DOM Elements
const elements = {
    connectionStatus: document.getElementById('connectionStatus'),
    statusText: document.querySelector('#connectionStatus .status-text'),
    statusDot: document.querySelector('#connectionStatus span:first-child'),
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

    try {
        // Fetch Configuration
        const configRes = await fetch('/api/config');
        MQTT_CONFIG = await configRes.json();

        // Add unique client ID for browser session
        MQTT_CONFIG.clientId = 'gs-retail-web-' + Math.random().toString(16).substring(2, 10);

        // Initial Data Fetch
        await refreshData();

        // Setup MQTT
        connectMQTT();

        // Auto-refresh data every 60 seconds
        setInterval(refreshData, 60000);

        console.log('GS Retail Dashboard initialized');
    } catch (err) {
        console.error('Initialization failed:', err);
    }
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
        tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors";

        const isIn = row.direction === 'in';
        const badgeColor = isIn ? 'accent-green' : 'accent-red';
        const label = isIn ? 'IN' : 'UT';

        tr.innerHTML = `
            <td class="px-6 py-5 text-sm font-mono text-slate-500 dark:text-slate-400">${row.timestamp}</td>
            <td class="px-6 py-5">
                <div class="flex items-center gap-2 text-${badgeColor} font-bold text-xs">
                    <span class="w-2 h-2 rounded-full bg-${badgeColor}"></span> ${label}
                </div>
            </td>
            <td class="px-6 py-5 text-right font-bold">${row.count}</td>
        `;
        elements.countsBody.appendChild(tr);
    });
}

/**
 * Render ApexCharts diagrams
 */
function renderCharts(data) {
    // Process Hourly Data for labels (00:00 - 23:00)
    const allHours = [];
    for (let i = 0; i < 24; i++) {
        allHours.push(String(i).padStart(2, '0') + ':00');
    }

    // Create a map of hourly data
    const hourlyMap = {};
    data.hourly.forEach(d => {
        const hourPart = d.hour.split(' ')[1]?.substring(0, 5) || d.hour.substring(0, 5);
        if (!hourlyMap[hourPart]) {
            hourlyMap[hourPart] = { in: 0, out: 0 };
        }
        if (d.direction === 'in') hourlyMap[hourPart].in += d.count;
        if (d.direction === 'out') hourlyMap[hourPart].out += d.count;
    });

    // Generate data arrays
    const inData = allHours.map(h => hourlyMap[h]?.in || 0);
    const outData = allHours.map(h => hourlyMap[h]?.out || 0);
    const totalData = allHours.map((h, i) => inData[i] + outData[i]);

    // Update Min/Max display
    const maxVal = Math.max(...totalData);
    const minVal = Math.min(...totalData.filter(v => v > 0), 0); // Find min > 0
    const maxHour = allHours[totalData.indexOf(maxVal)];
    const minHour = allHours[totalData.indexOf(minVal === Infinity ? 0 : minVal)];

    const hourlyMaxEl = document.getElementById('hourlyMax');
    const hourlyMinEl = document.getElementById('hourlyMin');
    if (hourlyMaxEl) hourlyMaxEl.textContent = `${maxVal} (kl ${maxHour?.substring(0, 2) || '?'})`;
    if (hourlyMinEl) hourlyMinEl.textContent = `${minVal === Infinity ? 0 : minVal} (kl ${minHour?.substring(0, 2) || '?'})`;

    // Theme colors
    const purple = '#8B5CF6';
    const purpleLight = '#C4B5FD';
    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.2)';

    // --- Hourly Bar Chart (Dygnsvy) ---
    if (hourlyChart) hourlyChart.destroy();
    hourlyChart = new ApexCharts(document.getElementById('hourlyChart'), {
        chart: {
            type: 'bar',
            height: '100%',
            fontFamily: 'Inter, sans-serif',
            toolbar: { show: false },
            animations: { enabled: true, speed: 500 }
        },
        series: [{
            name: 'Antal händelser',
            data: totalData
        }],
        colors: [purple],
        plotOptions: {
            bar: {
                borderRadius: 4,
                columnWidth: '70%',
                dataLabels: { position: 'top' }
            }
        },
        dataLabels: {
            enabled: true,
            offsetY: -20,
            style: { fontSize: '10px', colors: [textColor] }
        },
        xaxis: {
            categories: allHours,
            labels: { style: { colors: textColor, fontSize: '10px' } },
            axisBorder: { show: false },
            axisTicks: { show: false }
        },
        yaxis: {
            labels: { style: { colors: textColor } }
        },
        grid: {
            borderColor: gridColor,
            strokeDashArray: 4
        },
        tooltip: {
            theme: isDark ? 'dark' : 'light'
        }
    });
    hourlyChart.render();

    // --- Flow Area Chart (Besöksflöde) ---
    if (flowChart) flowChart.destroy();
    flowChart = new ApexCharts(document.getElementById('flowChart'), {
        chart: {
            type: 'area',
            height: '100%',
            fontFamily: 'Inter, sans-serif',
            toolbar: { show: false },
            animations: { enabled: true, speed: 500 }
        },
        series: [
            { name: 'IN', data: inData },
            { name: 'UT', data: outData }
        ],
        colors: [purple, purpleLight],
        stroke: { curve: 'smooth', width: 2 },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.4,
                opacityTo: 0.1,
                stops: [0, 90, 100]
            }
        },
        xaxis: {
            categories: allHours,
            labels: { style: { colors: textColor, fontSize: '10px' } },
            axisBorder: { show: false },
            axisTicks: { show: false }
        },
        yaxis: {
            labels: { style: { colors: textColor } }
        },
        grid: {
            borderColor: gridColor,
            strokeDashArray: 4
        },
        legend: { show: false },
        tooltip: {
            theme: isDark ? 'dark' : 'light'
        }
    });
    flowChart.render();
}

/**
 * Setup MQTT Connection
 */
function connectMQTT() {
    client = new Paho.Client(MQTT_CONFIG.host, MQTT_CONFIG.port, MQTT_CONFIG.path, MQTT_CONFIG.clientId);
    client.onMessageArrived = onMessageArrived;
    client.onConnectionLost = (responseObject) => {
        console.error('MQTT Lost:', responseObject.errorMessage);
        updateConnectionStatus(false);
    };

    client.connect({
        useSSL: MQTT_CONFIG.useSSL,
        userName: MQTT_CONFIG.username,
        password: MQTT_CONFIG.password,
        timeout: 10,
        reconnect: true,
        onSuccess: () => {
            console.log('MQTT Connected');
            updateConnectionStatus(true);
            client.subscribe(MQTT_CONFIG.topic);
        },
        onFailure: (err) => {
            console.error('MQTT Failed:', err);
            updateConnectionStatus(false);
        }
    });
}

function onMessageArrived(message) {
    messageCounter++;
    elements.messageCount.textContent = messageCounter;
    if (elements.emptyState) elements.emptyState.style.display = 'none';

    const card = document.createElement('div');
    // Tailwind classes for message card
    card.className = 'w-full bg-slate-50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800 rounded-lg p-3 flex items-center justify-between animate-[slideIn_0.3s_ease-out] hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-colors cursor-default';

    const timestamp = new Date().toLocaleTimeString('sv-SE');

    try {
        const data = JSON.parse(message.payloadString);
        const dir = data.Data?.Direction || 'unknown';
        const cnt = data.Data?.Count || 0;
        const isIn = dir === 'in';

        const iconColor = isIn ? 'text-accent-green' : 'text-accent-red';
        const iconName = isIn ? 'login' : 'logout';
        const countColor = isIn ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red';

        card.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full ${countColor} flex items-center justify-center">
                    <span class="material-icons-round text-sm">${iconName}</span>
                </div>
                <div>
                    <h5 class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Line Crossing
                    </h5>
                    <p class="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        ${timestamp}
                    </p>
                </div>
            </div>
            <div class="flex flex-col items-end">
                <span class="text-xs font-bold ${iconColor} uppercase tracking-wider">
                    ${dir.toUpperCase()}
                </span>
                <span class="text-[10px] font-mono text-slate-400">
                    #${cnt}
                </span>
            </div>
        `;

        // Refresh API data when new MQTT message arrives to keep charts updated
        refreshData();
    } catch (e) {
        card.innerHTML = `<pre class="text-xs text-red-500">${message.payloadString}</pre>`;
    }

    elements.messagesContainer.insertBefore(card, elements.messagesContainer.firstChild);
    // Limit to 50 messages
    const cards = elements.messagesContainer.querySelectorAll('div[class*="w-full"]');
    if (cards.length > 50) cards[cards.length - 1].remove();
}

function updateConnectionStatus(connected) {
    if (connected) {
        elements.connectionStatus.className = 'flex items-center gap-2 px-3 py-1.5 bg-accent-green/10 border border-accent-green/20 rounded-full';
        elements.statusDot.className = 'w-2 h-2 rounded-full bg-accent-green animate-pulse';
        elements.statusText.className = 'text-xs font-semibold text-accent-green uppercase tracking-wider status-text';
        elements.statusText.textContent = 'Ansluten';
    } else {
        elements.connectionStatus.className = 'flex items-center gap-2 px-3 py-1.5 bg-accent-red/10 border border-accent-red/20 rounded-full';
        elements.statusDot.className = 'w-2 h-2 rounded-full bg-accent-red';
        elements.statusText.className = 'text-xs font-semibold text-accent-red uppercase tracking-wider status-text';
        elements.statusText.textContent = 'Frånkopplad';
    }
}

function clearMessages() {
    messageCounter = 0;
    elements.messageCount.textContent = '0';
    // Remove all message cards but keep empty state
    const cards = elements.messagesContainer.querySelectorAll('div[class*="w-full"]');
    cards.forEach(card => card.remove());

    if (elements.emptyState) elements.emptyState.style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', init);
