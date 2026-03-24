// secure-storage.js - No external dependencies, built-in encryption
require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class SecureStorage {
    constructor() {
        this.encryptionKey = this.getOrCreateKey();
        this.subscriptionsFile = 'subscriptions.encrypted.dat';
        this.rateLimitFile = 'rate-limit.json';
        this.accessLogFile = 'access-log.json';
        this.init();
    }

    async init() {
        // Ensure files exist
        const files = [this.rateLimitFile, this.accessLogFile];
        for (const file of files) {
            try {
                await fs.access(file);
            } catch {
                await fs.writeFile(file, '[]');
            }
        }
    }

    getOrCreateKey() {
        if (!process.env.ENCRYPTION_KEY) {
            console.error('ERROR: ENCRYPTION_KEY is missing in .env file!');
            console.error('Please add ENCRYPTION_KEY=your-64-hex-key to .env in the project root');
            throw new Error('Missing ENCRYPTION_KEY');
        }

        const key = process.env.ENCRYPTION_KEY.trim();

        if (key.length !== 64) {
            throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
        }

        console.log('🔐 Using encryption key from .env (secure & persistent)');
        return key;
    }

    // Encrypt data before saving
    async encrypt(data) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(this.encryptionKey, 'hex'), iv);

        const encrypted = Buffer.concat([
            cipher.update(JSON.stringify(data), 'utf8'),
            cipher.final()
        ]);

        const authTag = cipher.getAuthTag();

        return {
            iv: iv.toString('hex'),
            data: encrypted.toString('hex'),
            authTag: authTag.toString('hex')
        };
    }

    // Decrypt data
    async decrypt(encryptedData) {
        try {
            const iv = Buffer.from(encryptedData.iv, 'hex');
            const encrypted = Buffer.from(encryptedData.data, 'hex');
            const authTag = Buffer.from(encryptedData.authTag, 'hex');

            const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(this.encryptionKey, 'hex'), iv);
            decipher.setAuthTag(authTag);

            const decrypted = Buffer.concat([
                decipher.update(encrypted),
                decipher.final()
            ]);

            return JSON.parse(decrypted.toString('utf8'));
        } catch (error) {
            console.error('Decryption error:', error);
            return null;
        }
    }

    // Save subscription securely
    async saveSubscription(email, name, ip) {
        const timestamp = new Date().toISOString();
        const token = crypto.randomBytes(32).toString('hex');

        const subscription = {
            email: email,
            name: name || '',
            ip: ip,
            token: token,
            verified: false,
            createdAt: timestamp,
            lastUpdated: timestamp
        };

        // Load existing subscriptions
        let subscriptions = [];
        try {
            const encrypted = await fs.readFile(this.subscriptionsFile, 'utf8');
            const data = JSON.parse(encrypted);
            const decrypted = await this.decrypt(data);
            if (decrypted) subscriptions = decrypted;
        } catch (error) {
            // File doesn't exist or corrupted, start fresh
        }

        // Check if email already exists
        const existingIndex = subscriptions.findIndex(s => s.email === email);
        if (existingIndex >= 0) {
            subscriptions[existingIndex] = subscription;
        } else {
            subscriptions.push(subscription);
        }

        // Encrypt and save
        const encrypted = await this.encrypt(subscriptions);
        await fs.writeFile(this.subscriptionsFile, JSON.stringify(encrypted, null, 2));

        return { token, subscription };
    }

    // Log access attempt
    async logAccess(ip, endpoint, userAgent, status) {
        try {
            const log = {
                ip,
                endpoint,
                userAgent: userAgent.substring(0, 200), // Limit length
                timestamp: new Date().toISOString(),
                status
            };

            const logs = JSON.parse(await fs.readFile(this.accessLogFile, 'utf8'));
            logs.push(log);

            // Keep only last 1000 logs
            if (logs.length > 1000) {
                logs.splice(0, logs.length - 1000);
            }

            await fs.writeFile(this.accessLogFile, JSON.stringify(logs, null, 2));
        } catch (error) {
            console.error('Error logging access:', error);
        }
    }

    // Check rate limit
    async checkRateLimit(ip, limit = 10, windowMinutes = 15) {
        try {
            const logs = JSON.parse(await fs.readFile(this.accessLogFile, 'utf8'));
            const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

            const recentAttempts = logs.filter(log =>
                log.ip === ip &&
                new Date(log.timestamp) > windowStart &&
                log.endpoint === '/subscribe'
            );

            return {
                allowed: recentAttempts.length < limit,
                attempts: recentAttempts.length,
                remaining: Math.max(0, limit - recentAttempts.length),
                resetTime: new Date(Date.now() + windowMinutes * 60 * 1000).toISOString()
            };
        } catch (error) {
            console.error('Error checking rate limit:', error);
            return { allowed: true, attempts: 0, remaining: limit, resetTime: null };
        }
    }

    // Get all subscriptions (for admin view)
    async getSubscriptions() {
        try {
            const encrypted = await fs.readFile(this.subscriptionsFile, 'utf8');
            const data = JSON.parse(encrypted);
            return await this.decrypt(data) || [];
        } catch (error) {
            return [];
        }
    }

    // Verify subscription token
    async verifySubscription(token) {
        try {
            const subscriptions = await this.getSubscriptions();
            const subscription = subscriptions.find(s => s.token === token);

            if (subscription) {
                subscription.verified = true;
                subscription.lastUpdated = new Date().toISOString();

                const encrypted = await this.encrypt(subscriptions);
                await fs.writeFile(this.subscriptionsFile, JSON.stringify(encrypted, null, 2));

                return { success: true, email: subscription.email };
            }

            return { success: false, error: 'Invalid token' };
        } catch (error) {
            return { success: false, error: 'Verification failed' };
        }
    }
}

module.exports = SecureStorage;