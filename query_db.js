const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'people_counting.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        return console.error(err.message);
    }
});

console.log('--- Last 10 entries from "counts" table ---');
db.all(`SELECT * FROM counts ORDER BY id DESC LIMIT 10`, [], (err, rows) => {
    if (err) {
        throw err;
    }
    if (rows.length === 0) {
        console.log('Table is empty.');
    } else {
        console.table(rows);
    }
    db.close();
});
