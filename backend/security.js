// security.js - Security utilities
class SecurityManager {
    constructor() {
        this.attempts = new Map(); // ip -> {count, firstAttempt}
        this.blockedIPs = new Set();
    }
    
    // Check if IP is allowed to make request
    checkRateLimit(ip, maxAttempts = 5, timeWindow = 15 * 60 * 1000) {
        if (this.blockedIPs.has(ip)) {
            return { allowed: false, reason: 'IP blocked' };
        }
        
        const now = Date.now();
        const record = this.attempts.get(ip);
        
        if (!record) {
            this.attempts.set(ip, { count: 1, firstAttempt: now });
            return { allowed: true };
        }
        
        // Reset if time window passed
        if (now - record.firstAttempt > timeWindow) {
            this.attempts.set(ip, { count: 1, firstAttempt: now });
            return { allowed: true };
        }
        
        // Check attempts
        if (record.count >= maxAttempts) {
            this.blockedIPs.add(ip);
            return { allowed: false, reason: 'Rate limit exceeded' };
        }
        
        record.count++;
        return { allowed: true };
    }
    
    // Validate email format and domain
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return false;
        
        // Block disposable/temporary emails
        const disposableDomains = [
            'tempmail.com', 'guerrillamail.com', 'mailinator.com',
            '10minutemail.com', 'trashmail.com', 'throwawaymail.com'
        ];
        
        const domain = email.split('@')[1].toLowerCase();
        return !disposableDomains.includes(domain);
    }
    
    // Generate secure verification token
    generateToken() {
        return crypto.randomBytes(32).toString('hex');
    }
}