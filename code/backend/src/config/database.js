const mongoose = require("mongoose");
const Redis = require("redis");
const { getAuditLogger } = require("../compliance/auditLogger");
const { logger } = require("../utils/logger");

const auditLogger = getAuditLogger();

/**
 * Database Configuration
 * Implements production-ready MongoDB and Redis connections with monitoring and optimization
 */
class DatabaseManager {
  constructor() {
    this.mongoConnection = null;
    this.redisClient = null;
    this.isConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000; // 5 seconds
  }

  /**
   * Initialize MongoDB connection with production settings
   */
  async connectMongoDB() {
    // Skip if database connection is disabled
    if (process.env.SKIP_DB_CONNECTION === "true") {
      console.log("⚠️  MongoDB connection skipped (SKIP_DB_CONNECTION=true)");
      this.isConnected = false;
      return null;
    }

    try {
      const mongoURI =
        process.env.MONGODB_URI ||
        "mongodb://localhost:27017/lendsmart_production";

      const options = {
        // Connection Pool Settings
        maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE) || 10,
        minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE) || 2,
        maxIdleTimeMS: parseInt(process.env.MONGO_MAX_IDLE_TIME) || 30000,
        serverSelectionTimeoutMS:
          parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT) || 5000,
        socketTimeoutMS: parseInt(process.env.MONGO_SOCKET_TIMEOUT) || 45000,

        // Replica Set Settings
        readPreference: process.env.MONGO_READ_PREFERENCE || "primary",
        readConcern: { level: process.env.MONGO_READ_CONCERN || "majority" },
        writeConcern: {
          w: process.env.MONGO_WRITE_CONCERN || "majority",
          j: true, // Journal acknowledgment for durability
          wtimeout: parseInt(process.env.MONGO_WRITE_TIMEOUT) || 10000,
        },

        // Performance Settings
        // Note: bufferMaxEntries and bufferCommands are removed in newer MongoDB drivers
        maxStalenessSeconds: parseInt(process.env.MONGO_MAX_STALENESS) || 90,

        // Security Settings
        authSource: process.env.MONGO_AUTH_SOURCE || "admin",
        ssl: process.env.MONGO_SSL === "true",
        sslValidate: process.env.MONGO_SSL_VALIDATE !== "false",

        // Monitoring
        heartbeatFrequencyMS:
          parseInt(process.env.MONGO_HEARTBEAT_FREQUENCY) || 10000,

        // Application Settings
        appName: "LendSmart-Production-Backend",
        compressors: ["zlib"],
        zlibCompressionLevel: 6,
      };

      // Set up connection event handlers
      mongoose.connection.on("connected", () => {
        console.log("✅ MongoDB connected successfully");
        this.isConnected = true;
        this.connectionRetries = 0;

        auditLogger.logSystemEvent("database_connected", {
          database: "mongodb",
          uri: mongoURI.replace(/\/\/.*@/, "//***:***@"), // Hide credentials
          poolSize: options.maxPoolSize,
        });
      });

      mongoose.connection.on("error", (error) => {
        console.error("❌ MongoDB connection error:", error);
        this.isConnected = false;

        auditLogger.logSystemEvent("database_error", {
          database: "mongodb",
          error: error.message,
          retryAttempt: this.connectionRetries,
        });
      });

      mongoose.connection.on("disconnected", () => {
        console.log("⚠️ MongoDB disconnected");
        this.isConnected = false;

        auditLogger.logSystemEvent("database_disconnected", {
          database: "mongodb",
        });

        // Attempt to reconnect
        this.handleReconnection();
      });

      mongoose.connection.on("reconnected", () => {
        console.log("🔄 MongoDB reconnected");
        this.isConnected = true;

        auditLogger.logSystemEvent("database_reconnected", {
          database: "mongodb",
        });
      });

      // Connect to MongoDB
      this.mongoConnection = await mongoose.connect(mongoURI, options);

      // Set up mongoose global settings
      mongoose.set("strictQuery", true);
      mongoose.set("sanitizeFilter", true);

      return this.mongoConnection;
    } catch (error) {
      console.error("❌ Failed to connect to MongoDB:", error);
      throw error;
    }
  }

  /**
   * Initialize Redis connection for caching and session management
   */
  async connectRedis() {
    // Skip if database connection is disabled
    if (process.env.SKIP_DB_CONNECTION === "true") {
      console.log("⚠️  Redis connection skipped (SKIP_DB_CONNECTION=true)");
      return null;
    }

    try {
      const redisConfig = {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB) || 0,

        // Connection Pool Settings
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        maxLoadingTimeout: 5000,

        // Performance Settings
        lazyConnect: true,
        keepAlive: 30000,
        connectTimeout: 10000,
        commandTimeout: 5000,

        // Cluster Settings (if using Redis Cluster)
        enableOfflineQueue: false,

        // Security
        tls:
          process.env.REDIS_TLS === "true"
            ? {
                rejectUnauthorized:
                  process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== "false",
              }
            : undefined,
      };

      this.redisClient = Redis.createClient(redisConfig);

      // Set up Redis event handlers
      this.redisClient.on("connect", () => {
        console.log("✅ Redis connected successfully");

        auditLogger.logSystemEvent("cache_connected", {
          cache: "redis",
          host: redisConfig.host,
          port: redisConfig.port,
          db: redisConfig.db,
        });
      });

      this.redisClient.on("error", (error) => {
        console.error("❌ Redis connection error:", error);

        auditLogger.logSystemEvent("cache_error", {
          cache: "redis",
          error: error.message,
        });
      });

      this.redisClient.on("end", () => {
        console.log("⚠️ Redis connection ended");

        auditLogger.logSystemEvent("cache_disconnected", {
          cache: "redis",
        });
      });

      this.redisClient.on("reconnecting", () => {
        console.log("🔄 Redis reconnecting...");

        auditLogger.logSystemEvent("cache_reconnecting", {
          cache: "redis",
        });
      });

      // Connect to Redis
      await this.redisClient.connect();

      return this.redisClient;
    } catch (error) {
      console.error("❌ Failed to connect to Redis:", error);
      // Redis is optional, so we don't throw here
      return null;
    }
  }

  /**
   * Handle MongoDB reconnection logic
   */
  async handleReconnection() {
    if (this.connectionRetries >= this.maxRetries) {
      console.error(
        `❌ Max reconnection attempts (${this.maxRetries}) reached`,
      );

      auditLogger.logSystemEvent("database_reconnection_failed", {
        database: "mongodb",
        maxRetries: this.maxRetries,
      });

      return;
    }

    this.connectionRetries++;
    console.log(
      `🔄 Attempting to reconnect to MongoDB (${this.connectionRetries}/${this.maxRetries})...`,
    );

    setTimeout(async () => {
      try {
        await this.connectMongoDB();
      } catch (error) {
        console.error("❌ Reconnection attempt failed:", error);
      }
    }, this.retryDelay * this.connectionRetries); // Exponential backoff
  }

  /**
   * Connect to all databases (alias for initialize)
   */
  async connect() {
    return this.initialize();
  }

  /**
   * Disconnect from all databases
   */
  async disconnect() {
    return this.shutdown();
  }

  /**
   * Initialize all database connections
   */
  async initialize() {
    console.log("🚀 Initializing database connections...");

    try {
      // Connect to MongoDB
      await this.connectMongoDB();

      // Connect to Redis (optional)
      await this.connectRedis();

      // Set up database monitoring
      this.setupMonitoring();

      console.log("✅ All database connections initialized successfully");

      auditLogger.logSystemEvent("database_initialization_complete", {
        mongodb: this.isConnected,
        redis: !!this.redisClient,
      });
    } catch (error) {
      console.error("❌ Database initialization failed:", error);

      auditLogger.logSystemEvent("database_initialization_failed", {
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Set up database monitoring and health checks
   */
  setupMonitoring() {
    // MongoDB monitoring
    setInterval(async () => {
      try {
        if (this.isConnected) {
          const stats = await mongoose.connection.db.stats();

          // Log database statistics periodically
          if (process.env.NODE_ENV === "development") {
            console.log("📊 MongoDB Stats:", {
              collections: stats.collections,
              dataSize: `${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`,
              indexSize: `${(stats.indexSize / 1024 / 1024).toFixed(2)} MB`,
              connections: mongoose.connection.readyState,
            });
          }

          // Alert if database size is getting large
          if (stats.dataSize > 1024 * 1024 * 1024 * 5) {
            // 5GB
            auditLogger.logSystemEvent("database_size_warning", {
              database: "mongodb",
              dataSize: stats.dataSize,
              threshold: "5GB",
            });
          }
        }
      } catch (error) {
        console.error("❌ MongoDB monitoring error:", error);
      }
    }, 300000); // Every 5 minutes

    // Redis monitoring
    if (this.redisClient) {
      setInterval(async () => {
        try {
          const info = await this.redisClient.info("memory");
          const memoryUsage = info.match(/used_memory:(\d+)/);

          if (memoryUsage && parseInt(memoryUsage[1]) > 1024 * 1024 * 100) {
            // 100MB
            auditLogger.logSystemEvent("cache_memory_warning", {
              cache: "redis",
              memoryUsage: parseInt(memoryUsage[1]),
              threshold: "100MB",
            });
          }
        } catch (error) {
          console.error("❌ Redis monitoring error:", error);
        }
      }, 300000); // Every 5 minutes
    }
  }

  /**
   * Graceful shutdown of all database connections
   */
  async shutdown() {
    console.log("🔄 Shutting down database connections...");

    try {
      // Close MongoDB connection
      if (this.mongoConnection) {
        await mongoose.connection.close();
        console.log("✅ MongoDB connection closed");
      }

      // Close Redis connection
      if (this.redisClient) {
        await this.redisClient.quit();
        console.log("✅ Redis connection closed");
      }

      auditLogger.logSystemEvent("database_shutdown_complete", {
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Error during database shutdown:", error);

      auditLogger.logSystemEvent("database_shutdown_error", {
        error: error.message,
      });
    }
  }

  /**
   * Get MongoDB connection status
   */
  getMongoStatus() {
    return {
      connected: this.isConnected,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
    };
  }

  /**
   * Get Redis connection status
   */
  getRedisStatus() {
    if (!this.redisClient) {
      return { connected: false, status: "not_configured" };
    }

    return {
      connected: this.redisClient.isReady,
      status: this.redisClient.status,
    };
  }

  /**
   * Health check for all database connections
   */
  async healthCheck() {
    const health = {
      mongodb: { status: "unknown", latency: null, error: null },
      redis: { status: "unknown", latency: null, error: null },
      overall: "unknown",
    };

    // MongoDB health check
    try {
      const start = Date.now();
      await mongoose.connection.db.admin().ping();
      health.mongodb = {
        status: "healthy",
        latency: Date.now() - start,
        error: null,
      };
    } catch (error) {
      health.mongodb = {
        status: "unhealthy",
        latency: null,
        error: error.message,
      };
    }

    // Redis health check
    if (this.redisClient) {
      try {
        const start = Date.now();
        await this.redisClient.ping();
        health.redis = {
          status: "healthy",
          latency: Date.now() - start,
          error: null,
        };
      } catch (error) {
        health.redis = {
          status: "unhealthy",
          latency: null,
          error: error.message,
        };
      }
    } else {
      health.redis = {
        status: "not_configured",
        latency: null,
        error: null,
      };
    }

    // Overall health
    if (health.mongodb.status === "healthy") {
      health.overall =
        health.redis.status === "unhealthy" ? "degraded" : "healthy";
    } else {
      health.overall = "unhealthy";
    }

    return health;
  }
}

// Create singleton instance
const databaseManager = new DatabaseManager();

// Cache utility functions
const cache = {
  /**
   * Set cache value with TTL
   */
  async set(key, value, ttl = 3600) {
    if (!databaseManager.redisClient) return false;

    try {
      const serializedValue = JSON.stringify(value);
      await databaseManager.redisClient.setEx(key, ttl, serializedValue);
      return true;
    } catch (error) {
      console.error("❌ Cache set error:", error);
      return false;
    }
  },

  /**
   * Get cache value
   */
  async get(key) {
    if (!databaseManager.redisClient) return null;

    try {
      const value = await databaseManager.redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error("❌ Cache get error:", error);
      return null;
    }
  },

  /**
   * Delete cache value
   */
  async del(key) {
    if (!databaseManager.redisClient) return false;

    try {
      await databaseManager.redisClient.del(key);
      return true;
    } catch (error) {
      console.error("❌ Cache delete error:", error);
      return false;
    }
  },

  /**
   * Check if key exists in cache
   */
  async exists(key) {
    if (!databaseManager.redisClient) return false;

    try {
      const result = await databaseManager.redisClient.exists(key);
      return result === 1;
    } catch (error) {
      console.error("❌ Cache exists error:", error);
      return false;
    }
  },

  /**
   * Clear all cache
   */
  async clear() {
    if (!databaseManager.redisClient) return false;

    try {
      await databaseManager.redisClient.flushDb();
      return true;
    } catch (error) {
      console.error("❌ Cache clear error:", error);
      return false;
    }
  },
};

module.exports = {
  databaseManager,
  cache,
  mongoose,
};
