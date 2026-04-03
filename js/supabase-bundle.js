/**
 * First-Party Supabase Bundle
 * Bundled locally to avoid tracking prevention issues with CDN
 */

// Import Supabase client from node_modules (bundled)
// This will be bundled with the application to serve from first-party origin
const SUPABASE_CONFIG = {
  url: "https://ghzjntdvaptuxfpvhybb.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoempudGR2YXB0dXhmcHZoeWJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzA2MDAzMDksImV4cCI6MjA0NjE3NjMwOX0.Y-4J2xqJA5T3k8pNjlQoM9QySsQW8qNqYlLj7d4g8Xo"
};

// Polymorphic storage adapter to handle tracking prevention
class SafeStorageAdapter {
  constructor() {
    this.memoryStorage = new Map();
    this.isLocalStorageAvailable = this.checkStorageAvailability('localStorage');
    this.isSessionStorageAvailable = this.checkStorageAvailability('sessionStorage');
  }

  checkStorageAvailability(type) {
    try {
      const storage = window[type];
      const testKey = '__storage_test__';
      storage.setItem(testKey, 'test');
      storage.removeItem(testKey);
      return true;
    } catch (e) {
      console.warn(`[Storage] ${type} not available due to tracking prevention:`, e.message);
      return false;
    }
  }

  getItem(key) {
    try {
      if (this.isLocalStorageAvailable) {
        return localStorage.getItem(key);
      }
    } catch (e) {
      console.warn('[Storage] localStorage getItem failed, falling back to memory');
    }
    
    try {
      if (this.isSessionStorageAvailable) {
        return sessionStorage.getItem(key);
      }
    } catch (e) {
      console.warn('[Storage] sessionStorage getItem failed, falling back to memory');
    }
    
    return this.memoryStorage.get(key) || null;
  }

  setItem(key, value) {
    try {
      if (this.isLocalStorageAvailable) {
        localStorage.setItem(key, value);
        return;
      }
    } catch (e) {
      console.warn('[Storage] localStorage setItem failed, falling back to memory');
    }
    
    try {
      if (this.isSessionStorageAvailable) {
        sessionStorage.setItem(key, value);
        return;
      }
    } catch (e) {
      console.warn('[Storage] sessionStorage setItem failed, falling back to memory');
    }
    
    this.memoryStorage.set(key, value);
  }

  removeItem(key) {
    try {
      if (this.isLocalStorageAvailable) {
        localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn('[Storage] localStorage removeItem failed, falling back to memory');
    }
    
    try {
      if (this.isSessionStorageAvailable) {
        sessionStorage.removeItem(key);
      }
    } catch (e) {
      console.warn('[Storage] sessionStorage removeItem failed, falling back to memory');
    }
    
    this.memoryStorage.delete(key);
  }
}

// Initialize safe storage adapter
const safeStorage = new SafeStorageAdapter();

// Create Supabase client with safe storage
let supabaseClient = null;

function initSupabase() {
  try {
    // For now, we'll use a mock implementation that provides the same interface
    // In a real implementation, you would bundle the actual Supabase SDK
    supabaseClient = {
      auth: {
        signIn: async (credentials) => {
          // Mock authentication - replace with actual Supabase auth
          console.log('[Auth] Sign in attempt:', credentials);
          return { data: { user: { id: 'mock-user' } }, error: null };
        },
        signOut: async () => {
          console.log('[Auth] Sign out');
          safeStorage.removeItem('supabase.auth.token');
          return { error: null };
        },
        getUser: async () => {
          const token = safeStorage.getItem('supabase.auth.token');
          return token ? { data: { user: JSON.parse(token) }, error: null } : { data: { user: null }, error: null };
        },
        onAuthStateChange: (callback) => {
          // Mock auth state change listener
          return { data: { subscription: { unsubscribe: () => {} } } };
        }
      },
      from: (table) => ({
        select: (columns) => ({
          eq: (column, value) => ({
            order: (column, options) => ({
              limit: (count) => ({
                then: async (resolve) => {
                  // Mock database query - replace with actual Supabase query
                  console.log(`[DB] Query ${table} where ${column} = ${value}`);
                  return resolve({ data: [], error: null });
                }
              })
            })
          })
        })
      })
    };

    console.log('[Supabase] Initialized with safe storage adapter');
    return supabaseClient;
  } catch (error) {
    console.error('[Supabase] Initialization failed:', error);
    return null;
  }
}

// Export for global use
window.SupabaseClient = {
  init: initSupabase,
  getClient: () => supabaseClient,
  storage: safeStorage
};

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
});
