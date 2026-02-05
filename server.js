const mqtt = require('mqtt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const express = require('express');

// Configuration
const MQTT_CONFIG = {
    host: process.env.MQTT_HOST || 'mqtt.swedeniot.se',
    port: parseInt(process.env.MQTT_PORT || '9001'),
    protocol: process.env.MQTT_PROTOCOL || 'wss',
    path: process.env.MQTT_PATH || '/ws',
    useSSL: (process.env.MQTT_PROTOCOL || 'wss') === 'wss',
    username: process.env.MQTT_USERNAME || 'maca',

    password: process.env.MQTT_PASSWORD || 'maca2025',
    topic: process.env.MQTT_TOPIC || 'gs-retail/sensor/onvif-ej/PeopleCounting/PeopleCountPunctual/&VideoEncoderToken-01-0/line2'
};

// Use /data for Railway Volume, fallback to local path for development
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'people_counting.db');
const PORT = process.env.PORT || 3000;

// Database Setup
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS counts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            direction TEXT,
            count INTEGER,
            raw_payload TEXT
        )`, (err) => {
            if (err) console.error('Error creating table:', err.message);
        });
    }
});

// Express Setup
const app = express();
app.use(express.static(__dirname));

// API Endpoints
app.get('/api/counts', (req, res) => {
    const query = `SELECT * FROM counts ORDER BY timestamp DESC LIMIT 100`;
    db.all(query, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

app.get('/api/stats', (req, res) => {
    const statsQuery = `
        SELECT 
            direction, 
            SUM(count) as total 
        FROM counts 
        GROUP BY direction`;

    const hourlyQuery = `
        SELECT 
            strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
            direction,
            SUM(count) as count
        FROM counts 
        GROUP BY hour, direction
        ORDER BY hour ASC`;

    db.all(statsQuery, [], (err, statsRows) => {
        if (err) return res.status(500).json({ error: err.message });

        db.all(hourlyQuery, [], (err, hourlyRows) => {
            if (err) return res.status(500).json({ error: err.message });

            res.json({
                summary: statsRows,
                hourly: hourlyRows
            });
        });
    });
});

app.get('/api/config', (req, res) => {
    res.json(MQTT_CONFIG);
});

// MQTT Setup
const client = mqtt.connect(`${MQTT_CONFIG.protocol}://${MQTT_CONFIG.host}:${MQTT_CONFIG.port}${MQTT_CONFIG.path}`, {
    username: MQTT_CONFIG.username,
    password: MQTT_CONFIG.password,
    clientId: 'gs-retail-server-' + Math.random().toString(16).substring(2, 10),
    rejectUnauthorized: false // Often needed for WSS in Node if certs aren't standard
});

client.on('connect', () => {
    console.log('Connected to MQTT broker');
    client.subscribe(MQTT_CONFIG.topic, (err) => {
        if (!err) {
            console.log('Subscribed to topic:', MQTT_CONFIG.topic);
        } else {
            console.error('Subscription error:', err);
        }
    });
});

client.on('message', (topic, message) => {
    process.stdout.write('.'); // Just a pulse
    try {
        const payload = JSON.parse(message.toString());

        // Extract data
        const utcTime = payload.UtcTime;
        const direction = payload.Data?.Direction;
        const count = parseInt(payload.Data?.Count || 0);

        // Convert to Swedish Time (CET/CEST)
        const date = new Date(utcTime);
        const swedishTime = date.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }).replace('T', ' ').substring(0, 19);

        // Store in DB
        db.run(
            `INSERT INTO counts (timestamp, direction, count, raw_payload) VALUES (?, ?, ?, ?)`,
            [swedishTime, direction, count, message.toString()],
            function (err) {
                if (err) {
                    return console.error('Error inserting data:', err.message);
                }
            }
        );

    } catch (e) {
        console.error('Error parsing payload:', e.message);
    }
});

client.on('error', (err) => {
    console.error('MQTT error:', err);
});

// Start Server
app.listen(PORT, () => {
    console.log(`
🚀 GS Retail Server is running!
----------------------------------
Web Dashboard: http://localhost:${PORT}
API Counts:    http://localhost:${PORT}/api/counts
API Stats:     http://localhost:${PORT}/api/stats
----------------------------------
`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    client.end();
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Closed the database connection.');
        process.exit(0);
    });
});


