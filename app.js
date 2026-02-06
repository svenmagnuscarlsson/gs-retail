/**
 * Personräkning v1.0
 * Visualizes data from SQLite via API and real-time MQTT
 */

// MQTT Configuration
let MQTT_CONFIG = null;

// DOM Elements
const elements = {
    connectionStatus: document.getElementById('connectionStatus'),
    statusText: document.querySelector('#connectionStatus .status-text'),
    statusDot: document.querySelector('#connectionStatus .status-dot'),
    liveLogContainer: document.getElementById('liveLogContainer'),
    emptyState: document.getElementById('emptyState'),
    // Stats
    totalIn: document.getElementById('totalIn'),
    totalOut: document.getElementById('totalOut'),
    occupancy: document.getElementById('occupancy'),
    // Tabs
    tabOperations: document.getElementById('tabOperations'),
    tabAnalytics: document.getElementById('tabAnalytics'),
    operationsView: document.getElementById('operationsView'),
    analyticsView: document.getElementById('analyticsView'),
    // Tables
    fullEventsList: document.getElementById('fullEventsList'),
    // Links
    showAllHistory: document.getElementById('showAllHistory'),
    // Filters
    timeFilter: document.getElementById('timeFilter')
};

// State
let client = null;
let messageCounter = 0;
let hourlyChart = null;
let heatmapChart = null;
let allCounts = []; // Store all counts for full event list

/**
 * Initialize the application
 */
async function init() {
    // Event Listeners
    setupTabNavigation();

    if (elements.showAllHistory) {
        elements.showAllHistory.addEventListener('click', (e) => {
            e.preventDefault();
            switchToAnalytics();
        });
    }

    // Time filter event listener
    if (elements.timeFilter) {
        elements.timeFilter.addEventListener('change', () => {
            refreshData();
        });
    }

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

        console.log('Personräkning Dashboard initialized');
    } catch (err) {
        console.error('Initialization failed:', err);
    }
}

/**
 * Setup tab navigation
 */
function setupTabNavigation() {
    elements.tabOperations.addEventListener('click', () => {
        elements.tabOperations.classList.add('active');
        elements.tabAnalytics.classList.remove('active');
        elements.operationsView.style.display = 'block';
        elements.analyticsView.style.display = 'none';
    });

    elements.tabAnalytics.addEventListener('click', () => {
        elements.tabAnalytics.classList.add('active');
        elements.tabOperations.classList.remove('active');
        elements.analyticsView.style.display = 'block';
        elements.operationsView.style.display = 'none';
        // Render heatmap when switching to analytics
        renderHeatmap();
    });
}

function switchToAnalytics() {
    elements.tabAnalytics.click();
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

        allCounts = counts; // Store for full event list

        updateStats(stats.summary);
        updateLiveLog(counts);
        updateFullEventsList(counts);
        renderHourlyChart(stats);
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
 * Update Live Log panel
 */
function updateLiveLog(counts) {
    // Keep empty state handling
    if (counts.length === 0) {
        if (elements.emptyState) elements.emptyState.style.display = 'flex';
        return;
    }

    if (elements.emptyState) elements.emptyState.style.display = 'none';

    // Clear existing items (except empty state)
    const existingItems = elements.liveLogContainer.querySelectorAll('.livelog-item');
    existingItems.forEach(item => item.remove());

    // Add recent events (limit to 6)
    counts.slice(0, 6).forEach((row, index) => {
        const isIn = row.direction === 'in';
        const item = document.createElement('div');
        item.className = 'livelog-item';

        const iconClass = isIn ? 'livelog-icon-in' : 'livelog-icon-out';
        const direction = isIn ? 'Inpassage' : 'Utpassage';
        const arrowSvg = isIn
            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`
            : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="7" x2="17" y2="17"></line><polyline points="17 7 17 17 7 17"></polyline></svg>`;

        // Extract time from timestamp
        const timePart = row.timestamp.split(' ')[1] || row.timestamp;

        item.innerHTML = `
            <div class="livelog-icon ${iconClass}">
                ${arrowSvg}
            </div>
            <div class="livelog-info">
                <p class="livelog-time">${timePart}</p>
                <p class="livelog-direction">${direction}</p>
            </div>
            <span class="livelog-id">#${counts.length - index}</span>
        `;

        elements.liveLogContainer.appendChild(item);
    });
}

/**
 * Update Full Events List (Analytics view)
 */
function updateFullEventsList(counts) {
    elements.fullEventsList.innerHTML = '';

    counts.forEach((row, index) => {
        const tr = document.createElement('tr');
        const isIn = row.direction === 'in';
        const badgeClass = isIn ? 'direction-badge-in' : 'direction-badge-out';
        const label = isIn ? 'IN' : 'OUT';
        const arrowSvg = isIn
            ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`
            : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="7" x2="17" y2="17"></line><polyline points="17 7 17 17 7 17"></polyline></svg>`;

        tr.innerHTML = `
            <td><a href="#" class="id-link">#${counts.length - index}</a></td>
            <td>${row.timestamp}</td>
            <td><span class="direction-badge ${badgeClass}">${arrowSvg} ${label}</span></td>
            <td class="text-right"><span class="count-value">${row.count}</span></td>
        `;
        elements.fullEventsList.appendChild(tr);
    });
}

/**
 * Render Hourly Bar Chart (ApexCharts)
 */
function renderHourlyChart(data) {
    // Process Hourly Data for labels (05:00 - 18:00 for display, but show all available hours)
    const displayHours = [];
    for (let i = 5; i <= 21; i++) {
        displayHours.push(String(i).padStart(2, '0') + ':00');
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

    // Generate data arrays for display hours
    const totalData = displayHours.map(h => {
        const hourData = hourlyMap[h];
        return hourData ? hourData.in + hourData.out : 0;
    });

    // Chart colors
    const chartBlue = '#93c5fd';
    const textColor = '#64748b';
    const gridColor = 'rgba(226, 232, 240, 0.5)';

    // Destroy existing chart
    if (hourlyChart) hourlyChart.destroy();

    hourlyChart = new ApexCharts(document.getElementById('hourlyChart'), {
        chart: {
            type: 'bar',
            height: 400,
            fontFamily: 'Inter, sans-serif',
            toolbar: { show: false },
            animations: { enabled: true, speed: 500 }
        },
        series: [{
            name: 'Antal',
            data: totalData
        }],
        colors: [chartBlue],
        plotOptions: {
            bar: {
                borderRadius: 4,
                columnWidth: '60%',
            }
        },
        dataLabels: {
            enabled: false
        },
        xaxis: {
            categories: displayHours,
            labels: {
                style: { colors: textColor, fontSize: '11px' },
                rotate: -45,
                rotateAlways: false,
                hideOverlappingLabels: true,
                trim: false
            },
            axisBorder: { show: true, color: gridColor },
            axisTicks: { show: true, color: gridColor }
        },
        yaxis: {
            labels: {
                style: { colors: textColor, fontSize: '11px' },
                formatter: (val) => Math.round(val)
            }
        },
        grid: {
            borderColor: gridColor,
            strokeDashArray: 0,
            xaxis: { lines: { show: false } },
            padding: {
                bottom: 20
            }
        },
        tooltip: {
            theme: 'light',
            y: {
                formatter: (val) => val + ' händelser'
            }
        }
    });
    hourlyChart.render();
}

/**
 * Render Heatmap Chart (ApexCharts)
 */
async function renderHeatmap() {
    // Days of week (SQLite: 0=Sunday, 1=Monday, ..., 6=Saturday)
    // We want to display: Mån, Tis, Ons, Tor, Fre, Lör, Sön
    const dayNames = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
    const displayDays = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

    // Hours from 05:00 to 18:00
    const hours = [];
    for (let i = 5; i <= 18; i++) {
        hours.push(i);
    }

    try {
        // Fetch real data from API
        const response = await fetch('/api/heatmap');
        const data = await response.json();

        // Create a map for quick lookup: key = "day_hour", value = total
        const dataMap = {};
        data.forEach(row => {
            const key = `${row.day_of_week}_${row.hour}`;
            dataMap[key] = row.total;
        });

        // Build series data for ApexCharts heatmap
        const series = hours.map(hour => {
            return {
                name: String(hour).padStart(2, '0') + ':00',
                data: displayDays.map((dayName, idx) => {
                    // Convert display day index to SQLite day_of_week
                    // displayDays: 0=Mån, 1=Tis, ..., 6=Sön
                    // SQLite: 0=Sön, 1=Mån, ..., 6=Lör
                    const sqliteDayIndex = idx === 6 ? 0 : idx + 1;
                    const key = `${sqliteDayIndex}_${hour}`;
                    return {
                        x: dayName,
                        y: dataMap[key] || 0
                    };
                })
            };
        });

        // Chart colors
        const textColor = '#64748b';

        // Destroy existing chart
        if (heatmapChart) heatmapChart.destroy();

        heatmapChart = new ApexCharts(document.getElementById('heatmapChart'), {
            chart: {
                type: 'heatmap',
                height: 320,
                fontFamily: 'Inter, sans-serif',
                toolbar: { show: false }
            },
            series: series,
            colors: ['#1d4ed8'],
            plotOptions: {
                heatmap: {
                    shadeIntensity: 0.5,
                    radius: 4,
                    enableShades: true,
                    colorScale: {
                        ranges: [
                            { from: 0, to: 3, color: '#dbeafe', name: 'Låg' },
                            { from: 4, to: 6, color: '#93c5fd', name: 'Medel' },
                            { from: 7, to: 10, color: '#3b82f6', name: 'Hög' },
                            { from: 11, to: 15, color: '#1d4ed8', name: 'Mycket hög' }
                        ]
                    }
                }
            },
            dataLabels: {
                enabled: false
            },
            xaxis: {
                labels: {
                    style: { colors: textColor, fontSize: '12px', fontWeight: 500 }
                }
            },
            yaxis: {
                labels: {
                    style: { colors: textColor, fontSize: '11px' }
                }
            },
            legend: {
                show: false
            },
            tooltip: {
                theme: 'light'
            }
        });
        heatmapChart.render();
    } catch (err) {
        console.error('Error loading heatmap data:', err);
    }
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
    if (elements.emptyState) elements.emptyState.style.display = 'none';

    try {
        const data = JSON.parse(message.payloadString);
        const dir = data.Data?.Direction || 'unknown';
        const cnt = data.Data?.Count || 0;
        const isIn = dir === 'in';

        // Create new live log item
        const item = document.createElement('div');
        item.className = 'livelog-item';

        const iconClass = isIn ? 'livelog-icon-in' : 'livelog-icon-out';
        const direction = isIn ? 'Inpassage' : 'Utpassage';
        const arrowSvg = isIn
            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`
            : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="7" x2="17" y2="17"></line><polyline points="17 7 17 17 7 17"></polyline></svg>`;

        const timestamp = new Date().toLocaleTimeString('sv-SE');

        item.innerHTML = `
            <div class="livelog-icon ${iconClass}">
                ${arrowSvg}
            </div>
            <div class="livelog-info">
                <p class="livelog-time">${timestamp}</p>
                <p class="livelog-direction">${direction}</p>
            </div>
            <span class="livelog-id">#${messageCounter}</span>
        `;

        // Insert at beginning of container, after empty state
        const firstItem = elements.liveLogContainer.querySelector('.livelog-item');
        if (firstItem) {
            elements.liveLogContainer.insertBefore(item, firstItem);
        } else {
            elements.liveLogContainer.appendChild(item);
        }

        // Limit to 10 items
        const items = elements.liveLogContainer.querySelectorAll('.livelog-item');
        if (items.length > 10) items[items.length - 1].remove();

        // Refresh API data when new MQTT message arrives to keep charts updated
        refreshData();
    } catch (e) {
        console.error('Error parsing MQTT message:', e);
    }
}

function updateConnectionStatus(connected) {
    if (connected) {
        elements.connectionStatus.className = 'connection-status connected';
        if (elements.statusText) elements.statusText.textContent = 'Ansluten';
    } else {
        elements.connectionStatus.className = 'connection-status disconnected';
        if (elements.statusText) elements.statusText.textContent = 'Frånkopplad';
    }
}

document.addEventListener('DOMContentLoaded', init);
