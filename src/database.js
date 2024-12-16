// src/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/scheduler.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
    }
});

// Initialize tables if they don't exist
db.serialize(() => {
    // Users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            is_muslim BOOLEAN,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Schedules table
    db.run(`
        CREATE TABLE IF NOT EXISTS schedules (
            schedule_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            date TEXT,
            day_of_week TEXT,
            time TEXT,
            activity TEXT,
            duration INTEGER,
            frequency TEXT,
            FOREIGN KEY(user_id) REFERENCES users(user_id)
        )
    `);
});

module.exports = db;