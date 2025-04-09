const redis = require('redis');

// Simple in-memory cache fallback
const memoryCache = {
    store: new Map(),
    expirations: new Map(),

    get: async (key) => {
        // Check if key exists and not expired
        if (memoryCache.expirations.has(key) && memoryCache.expirations.get(key) < Date.now()) {
            memoryCache.store.delete(key);
            memoryCache.expirations.delete(key);
            return null;
        }
        return memoryCache.store.get(key) || null;
    },

    set: async (key, value, options = {}) => {
        memoryCache.store.set(key, value);
        if (options.EX) {
            memoryCache.expirations.set(key, Date.now() + (options.EX * 1000));
        }
        return 'OK';
    },

    del: async (key) => {
        const deleted = memoryCache.store.delete(key);
        memoryCache.expirations.delete(key);
        return deleted ? 1 : 0;
    },

    ttl: async (key) => {
        if (!memoryCache.expirations.has(key)) return -1;
        const remaining = Math.floor((memoryCache.expirations.get(key) - Date.now()) / 1000);
        return remaining > 0 ? remaining : -2;
    },

    incr: async (key) => {
        const val = (parseInt(memoryCache.store.get(key) || '0', 10) + 1).toString();
        memoryCache.store.set(key, val);
        return parseInt(val, 10);
    },

    incrBy: async (key, increment) => {
        const val = (parseInt(memoryCache.store.get(key) || '0', 10) + increment).toString();
        memoryCache.store.set(key, val);
        return parseInt(val, 10);
    },

    expire: async (key, seconds) => {
        if (!memoryCache.store.has(key)) return 0;
        memoryCache.expirations.set(key, Date.now() + (seconds * 1000));
        return 1;
    },

    keys: async (pattern) => {
        // Simple implementation that only supports * at end
        if (pattern === '*') {
            return Array.from(memoryCache.store.keys());
        }

        if (pattern.endsWith('*')) {
            const prefix = pattern.slice(0, -1);
            return Array.from(memoryCache.store.keys())
                .filter(key => key.startsWith(prefix));
        }

        return [];
    },

    scan: async () => {
        return { cursor: '0', keys: Array.from(memoryCache.store.keys()) };
    },

    mGet: async (keys) => {
        return keys.map(key => memoryCache.store.get(key) || null);
    },

    mSet: async (keyVals) => {
        for (let i = 0; i < keyVals.length; i += 2) {
            memoryCache.store.set(keyVals[i], keyVals[i + 1]);
        }
        return 'OK';
    },

    hSet: async (hash, field, value) => {
        let hashObj = memoryCache.store.get(hash) || {};
        if (typeof hashObj !== 'object') {
            hashObj = {};
        }

        if (typeof field === 'object') {
            Object.assign(hashObj, field);
        } else {
            hashObj[field] = value;
        }

        memoryCache.store.set(hash, hashObj);
        return Object.keys(hashObj).length;
    },

    hGet: async (hash, field) => {
        const hashObj = memoryCache.store.get(hash);
        return hashObj ? hashObj[field] || null : null;
    },

    hGetAll: async (hash) => {
        return memoryCache.store.get(hash) || {};
    }
};

// Tạo Redis client
const createClient = async () => {
    try {
        const client = redis.createClient({
            url: `redis://127.0.0.1:${process.env.REDIS_PORT || 6379}`,
            password: process.env.REDIS_PASSWORD || '',
            socket: {
                reconnectStrategy: (retries) => {
                    if (retries > 10) {
                        return new Error('Too many retries, Redis connection failed');
                    }
                    // Thời gian retry tăng theo cấp số nhân
                    return Math.min(retries * 100, 3000);
                }
            }
        });

        client.on('connect', () => console.log('Redis client connected'));
        client.on('error', (err) => console.log('Redis Client Error', err));

        // Connect to Redis
        await client.connect();
        return client;
    } catch (error) {
        console.log('Failed to create Redis client, using memory fallback:', error.message);
        return memoryCache;
    }
};

// Khởi tạo Redis client
let clientPromise = createClient().catch(err => {
    console.error('Failed to initialize Redis client, using memory fallback:', err);
    return memoryCache;
});

// Get Redis client instance
const getRedisClient = async () => {
    return await clientPromise;
};

module.exports = {
    // Get data from cache
    getCache: async (key) => {
        try {
            const client = await getRedisClient();
            return await client.get(key);
        } catch (error) {
            console.error('Cache get error:', error);
            return null; // Return null on error to fail gracefully
        }
    },

    // Set data to cache with expiration time in seconds
    setCache: async (key, value, expireTime = 3600) => {
        try {
            const client = await getRedisClient();
            return await client.set(key, value, { EX: expireTime });
        } catch (error) {
            console.error('Cache set error:', error);
            return false; // Return false on error
        }
    },

    // Invalidate cache
    invalidateCache: async (key) => {
        try {
            const client = await getRedisClient();
            // Nếu key chứa wildcard (*), thực hiện scan để xóa tất cả keys phù hợp
            if (key.includes('*')) {
                const pattern = key;
                let cursor = '0';
                let keys = [];

                // Scan qua toàn bộ keys để tìm các pattern phù hợp
                do {
                    const reply = await client.scan(cursor, {
                        MATCH: pattern,
                        COUNT: 100
                    });
                    cursor = reply.cursor;
                    keys = keys.concat(reply.keys);
                } while (cursor !== '0');

                // Xóa tất cả keys tìm thấy
                if (keys.length > 0) {
                    await client.del(keys);
                }

                return keys.length;
            } else {
                // Xóa key đơn
                return await client.del(key);
            }
        } catch (error) {
            console.error('Cache invalidation error:', error);
            return false; // Return false on error
        }
    },

    // Get Time-To-Live (TTL) for a key
    getTTL: async (key) => {
        try {
            const client = await getRedisClient();
            return await client.ttl(key);
        } catch (error) {
            console.error('Cache TTL error:', error);
            return -1; // Return -1 on error (key không tồn tại)
        }
    },

    // Increment a counter
    incrementCache: async (key, increment = 1) => {
        try {
            const client = await getRedisClient();
            if (increment === 1) {
                return await client.incr(key);
            } else {
                return await client.incrBy(key, increment);
            }
        } catch (error) {
            console.error('Cache increment error:', error);
            return false;
        }
    },

    // Set expiration for a key
    expireCache: async (key, seconds) => {
        try {
            const client = await getRedisClient();
            return await client.expire(key, seconds);
        } catch (error) {
            console.error('Cache expire error:', error);
            return false;
        }
    },

    // Get multiple keys at once
    getMultiCache: async (keys) => {
        try {
            const client = await getRedisClient();
            return await client.mGet(keys);
        } catch (error) {
            console.error('Cache multi-get error:', error);
            return [];
        }
    },

    // Set multiple key-value pairs at once
    setMultiCache: async (keyValueObj) => {
        try {
            const client = await getRedisClient();
            // Convert object to array format for mset
            const args = [];
            for (const [key, value] of Object.entries(keyValueObj)) {
                args.push(key, value);
            }

            return await client.mSet(args);
        } catch (error) {
            console.error('Cache multi-set error:', error);
            return false;
        }
    },

    // Hash operations
    hashSet: async (hash, field, value) => {
        try {
            const client = await getRedisClient();
            return await client.hSet(hash, field, value);
        } catch (error) {
            console.error('Cache hash set error:', error);
            return false;
        }
    },

    hashGet: async (hash, field) => {
        try {
            const client = await getRedisClient();
            return await client.hGet(hash, field);
        } catch (error) {
            console.error('Cache hash get error:', error);
            return null;
        }
    },

    hashGetAll: async (hash) => {
        try {
            const client = await getRedisClient();
            return await client.hGetAll(hash);
        } catch (error) {
            console.error('Cache hash getall error:', error);
            return null;
        }
    },

    hashMultiSet: async (hash, fieldsObj) => {
        try {
            const client = await getRedisClient();
            return await client.hSet(hash, fieldsObj);
        } catch (error) {
            console.error('Cache hash multi set error:', error);
            return false;
        }
    },

    // Get raw Redis client (cho các thao tác phức tạp hơn)
    getClient: async () => await getRedisClient()
};