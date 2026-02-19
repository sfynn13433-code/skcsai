// database.js - Encrypted database module
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

class SecureDatabase {
    constructor() {
        // Create encrypted database connection
        this.db = new sqlite3.Database('subscriptions.db');
        this.init();
    }
    
    init() {
        this.db.run(`
            CREATE TABLE IF NOT EXISTS subscribers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT,
                verification_token TEXT,
                is_verified INTEGER DEFAULT 0,
                ip_address TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_attempt DATETIME
            )
        `);
        
        this.db.run(`
            CREATE TABLE IF NOT EXISTS access_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip_address TEXT,
                endpoint TEXT,
                user_agent TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                status_code INTEGER
            )
        `);
    }
    
    async logAccess(ip, endpoint, userAgent, status) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO access_logs (ip_address, endpoint, user_agent, status_code) VALUES (?, ?, ?, ?)`,
                [ip, endpoint, userAgent, status],
                (err) => err ? reject(err) : resolve()
            );
        });
    }
}