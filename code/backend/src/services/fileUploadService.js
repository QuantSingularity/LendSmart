const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const crypto = require("crypto");
const sharp = require("sharp");
const { getEncryptionService } = require("../config/security/encryption");
const { getAuditLogger } = require("../compliance/auditLogger");
const inputValidator = require("../validators/inputValidator");
const { logger } = require("../utils/logger");

/**
 * Secure File Upload Service
 * Implements enterprise-grade file upload with security, validation, and compliance features
 */
class FileUploadService {
  constructor() {
    this.encryptionService = getEncryptionService();
    this.auditLogger = getAuditLogger();

    // Upload configuration
    this.config = {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedImageTypes: ["image/jpeg", "image/png", "image/gif"],
      allowedDocumentTypes: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      allowedExtensions: [
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".pdf",
        ".doc",
        ".docx",
      ],
      uploadDir: process.env.UPLOAD_DIR || "./uploads",
      tempDir: process.env.TEMP_DIR || "./temp",
      encryptFiles: process.env.ENCRYPT_FILES === "true",
    };

    // Ensure upload directories exist
    this.initializeDirectories();
  }

  /**
   * Initialize upload directories
   */
  async initializeDirectories() {
    try {
      await fs.mkdir(this.config.uploadDir, { recursive: true });
      await fs.mkdir(this.config.tempDir, { recursive: true });
      await fs.mkdir(path.join(this.config.uploadDir, "kyc"), {
        recursive: true,
      });
      await fs.mkdir(path.join(this.config.uploadDir, "profile"), {
        recursive: true,
      });
      await fs.mkdir(path.join(this.config.uploadDir, "documents"), {
        recursive: true,
      });
    } catch (error) {
      logger.error("Failed to initialize upload directories", {
        error: error.message,
      });
    }
  }

  /**
   * Create multer configuration for KYC documents
   * @returns {Object} Multer configuration
   */
  createKYCUploadConfig() {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadPath = path.join(
          this.config.uploadDir,
          "kyc",
          String(req.user?._id || req.user?.id || "unknown"),
        );
        fs.mkdir(uploadPath, { recursive: true })
          .then(() => cb(null, uploadPath))
          .catch((err) => cb(err));
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const extension = path.extname(file.originalname);
        const filename = `kyc-${uniqueSuffix}${extension}`;
        cb(null, filename);
      },
    });

    return multer({
      storage,
      limits: {
        fileSize: this.config.maxFileSize,
        files: 5, // Maximum 5 files per upload
      },
      fileFilter: (req, file, cb) => {
        this.validateKYCFile(file, cb);
      },
    });
  }

  /**
   * Create multer configuration for profile images
   * @returns {Object} Multer configuration
   */
  createProfileImageUploadConfig() {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadPath = path.join(
          this.config.uploadDir,
          "profile",
          req.user.id,
        );
        fs.mkdir(uploadPath, { recursive: true })
          .then(() => cb(null, uploadPath))
          .catch((err) => cb(err));
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const extension = path.extname(file.originalname);
        const filename = `profile-${uniqueSuffix}${extension}`;
        cb(null, filename);
      },
    });

    return multer({
      storage,
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB for profile images
        files: 1,
      },
      fileFilter: (req, file, cb) => {
        this.validateImageFile(file, cb);
      },
    });
  }

  /**
   * Create multer configuration for general documents
   * @returns {Object} Multer configuration
   */
  createDocumentUploadConfig() {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadPath = path.join(
          this.config.uploadDir,
          "documents",
          req.user.id,
        );
        fs.mkdir(uploadPath, { recursive: true })
          .then(() => cb(null, uploadPath))
          .catch((err) => cb(err));
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const extension = path.extname(file.originalname);
        const filename = `doc-${uniqueSuffix}${extension}`;
        cb(null, filename);
      },
    });

    return multer({
      storage,
      limits: {
        fileSize: this.config.maxFileSize,
        files: 10,
      },
      fileFilter: (req, file, cb) => {
        this.validateDocumentFile(file, cb);
      },
    });
  }

  /**
   * Validate KYC document file
   * @param {Object} file - Multer file object
   * @param {Function} cb - Callback function
   */
  validateKYCFile(file, cb) {
    const validation = inputValidator.validateFileUpload(file, {
      maxSize: this.config.maxFileSize,
      allowedTypes: [
        ...this.config.allowedImageTypes,
        ...this.config.allowedDocumentTypes,
      ],
      allowedExtensions: this.config.allowedExtensions,
    });

    if (!validation.isValid) {
      return cb(new Error(validation.errors[0].message), false);
    }

    // Additional KYC-specific validation
    if (this.isSuspiciousFile(file)) {
      return cb(new Error("Suspicious file detected"), false);
    }

    cb(null, true);
  }

  /**
   * Validate image file
   * @param {Object} file - Multer file object
   * @param {Function} cb - Callback function
   */
  validateImageFile(file, cb) {
    const validation = inputValidator.validateFileUpload(file, {
      maxSize: 5 * 1024 * 1024, // 5MB for images
      allowedTypes: this.config.allowedImageTypes,
      allowedExtensions: [".jpg", ".jpeg", ".png", ".gif"],
    });

    if (!validation.isValid) {
      return cb(new Error(validation.errors[0].message), false);
    }

    cb(null, true);
  }

  /**
   * Validate document file
   * @param {Object} file - Multer file object
   * @param {Function} cb - Callback function
   */
  validateDocumentFile(file, cb) {
    const validation = inputValidator.validateFileUpload(file, {
      maxSize: this.config.maxFileSize,
      allowedTypes: this.config.allowedDocumentTypes,
      allowedExtensions: [".pdf", ".doc", ".docx"],
    });

    if (!validation.isValid) {
      return cb(new Error(validation.errors[0].message), false);
    }

    cb(null, true);
  }

  /**
   * Check if file is suspicious
   * @param {Object} file - Multer file object
   * @returns {boolean} True if suspicious
   */
  isSuspiciousFile(file) {
    const suspiciousPatterns = [
      /\.(exe|bat|cmd|scr|pif|com)$/i,
      /\.(php|asp|jsp|js)$/i,
      /<script/i,
      /javascript:/i,
      /\x00/, // Null bytes
      /\.\.\//, // Directory traversal
      /[<>:"|?*]/, // Invalid filename characters
    ];

    return suspiciousPatterns.some(
      (pattern) =>
        pattern.test(file.originalname) ||
        (file.buffer && pattern.test(file.buffer.toString())),
    );
  }

  /**
   * Process uploaded KYC document
   * @param {Object} file - Uploaded file
   * @param {Object} metadata - File metadata
   * @param {string} userId - User ID
   * @returns {Object} Processing result
   */
  async processKYCDocument(file, metadata, userId) {
    try {
      // Scan file for malware (placeholder - would integrate with antivirus service)
      const scanResult = await this.scanFileForMalware(file.path);
      if (!scanResult.clean) {
        await this.deleteFile(file.path);
        throw new Error("File failed security scan");
      }

      // Extract text content for indexing (if PDF)
      let extractedText = null;
      if (file.mimetype === "application/pdf") {
        extractedText = await this.extractTextFromPDF(file.path);
      }

      // Generate file hash for integrity verification
      const fileHash = await this.generateFileHash(file.path);

      // Encrypt file if configured
      let encryptedPath = file.path;
      if (this.config.encryptFiles) {
        encryptedPath = await this.encryptFile(file.path);
        await this.deleteFile(file.path); // Remove unencrypted file
      }

      // Create file record
      const fileRecord = {
        originalName: file.originalname,
        filename: file.filename,
        path: encryptedPath,
        size: file.size,
        mimetype: file.mimetype,
        hash: fileHash,
        encrypted: this.config.encryptFiles,
        extractedText,
        metadata,
        uploadedAt: new Date(),
        userId,
      };

      // Audit log
      await this.auditLogger.logDataEvent({
        action: "kyc_document_uploaded",
        userId,
        fileId: fileRecord.filename,
        fileType: metadata.documentType,
        fileSize: file.size,
        timestamp: new Date().toISOString(),
      });

      logger.info("KYC document processed", {
        userId,
        filename: file.filename,
        size: file.size,
        type: metadata.documentType,
      });

      return {
        success: true,
        file: fileRecord,
      };
    } catch (error) {
      logger.error("KYC document processing failed", {
        error: error.message,
        userId,
        filename: file.filename,
      });

      // Clean up on error
      await this.deleteFile(file.path);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Process uploaded profile image
   * @param {Object} file - Uploaded file
   * @param {string} userId - User ID
   * @returns {Object} Processing result
   */
  async processProfileImage(file, userId) {
    try {
      // Validate image content
      const imageValidation = await this.validateImageContent(file.path);
      if (!imageValidation.valid) {
        await this.deleteFile(file.path);
        throw new Error("Invalid image content");
      }

      // Generate thumbnails
      const thumbnails = await this.generateThumbnails(file.path, userId);

      // Generate file hash
      const fileHash = await this.generateFileHash(file.path);

      // Encrypt file if configured
      let encryptedPath = file.path;
      if (this.config.encryptFiles) {
        encryptedPath = await this.encryptFile(file.path);
        await this.deleteFile(file.path);
      }

      const fileRecord = {
        originalName: file.originalname,
        filename: file.filename,
        path: encryptedPath,
        size: file.size,
        mimetype: file.mimetype,
        hash: fileHash,
        encrypted: this.config.encryptFiles,
        thumbnails,
        uploadedAt: new Date(),
        userId,
      };

      // Audit log
      await this.auditLogger.logDataEvent({
        action: "profile_image_uploaded",
        userId,
        fileId: fileRecord.filename,
        fileSize: file.size,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        file: fileRecord,
      };
    } catch (error) {
      logger.error("Profile image processing failed", {
        error: error.message,
        userId,
        filename: file.filename,
      });

      await this.deleteFile(file.path);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Scan file for malware (placeholder implementation)
   * @param {string} filePath - Path to file
   * @returns {Object} Scan result
   */
  async scanFileForMalware(filePath) {
    // Placeholder - would integrate with ClamAV or similar
    // For now, just check file size and basic patterns
    try {
      const stats = await fs.stat(filePath);

      // Reject extremely large files
      if (stats.size > 50 * 1024 * 1024) {
        // 50MB
        return { clean: false, reason: "File too large" };
      }

      // Basic content scanning (would be more sophisticated in production)
      const content = await fs.readFile(filePath);
      const suspiciousPatterns = [
        /X5O!P%@AP\[4\\PZX54\(P\^\)7CC\)7\}\$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!\$H\+H\*/, // EICAR test string
        /<script/gi,
        /javascript:/gi,
      ];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(content.toString())) {
          return { clean: false, reason: "Suspicious content detected" };
        }
      }

      return { clean: true };
    } catch (error) {
      logger.error("Malware scan failed", {
        error: error.message,
        filePath,
      });
      return { clean: false, reason: "Scan failed" };
    }
  }

  /**
   * Extract text from PDF file
   * @param {string} filePath - Path to PDF file
   * @returns {string} Extracted text
   */
  async extractTextFromPDF(filePath) {
    try {
      // Placeholder - would use pdf-parse or similar library
      // const pdfParse = require('pdf-parse');
      // const dataBuffer = await fs.readFile(filePath);
      // const data = await pdfParse(dataBuffer);
      // return data.text;

      return "Text extraction not implemented";
    } catch (error) {
      logger.error("PDF text extraction failed", {
        error: error.message,
        filePath,
      });
      return null;
    }
  }

  /**
   * Generate file hash for integrity verification
   * @param {string} filePath - Path to file
   * @returns {string} File hash
   */
  async generateFileHash(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      return crypto.createHash("sha256").update(fileBuffer).digest("hex");
    } catch (error) {
      logger.error("File hash generation failed", {
        error: error.message,
        filePath,
      });
      throw error;
    }
  }

  /**
   * Encrypt file
   * @param {string} filePath - Path to file
   * @returns {string} Path to encrypted file
   */
  async encryptFile(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const encryptedData = this.encryptionService.encrypt(fileBuffer);
      const encryptedPath = filePath + ".enc";
      await fs.writeFile(encryptedPath, encryptedData);
      return encryptedPath;
    } catch (error) {
      logger.error("File encryption failed", {
        error: error.message,
        filePath,
      });
      throw error;
    }
  }

  /**
   * Decrypt file
   * @param {string} encryptedPath - Path to encrypted file
   * @returns {Buffer} Decrypted file data
   */
  async decryptFile(encryptedPath) {
    try {
      const encryptedData = await fs.readFile(encryptedPath);
      return this.encryptionService.decrypt(encryptedData);
    } catch (error) {
      logger.error("File decryption failed", {
        error: error.message,
        encryptedPath,
      });
      throw error;
    }
  }

  /**
   * Validate image content
   * @param {string} imagePath - Path to image
   * @returns {Object} Validation result
   */
  async validateImageContent(imagePath) {
    try {
      // Use Sharp to validate and get image metadata
      const metadata = await sharp(imagePath).metadata();

      // Check if it's a valid image
      if (!metadata.format) {
        return { valid: false, reason: "Invalid image format" };
      }

      // Check image dimensions (prevent extremely large images)
      if (metadata.width > 10000 || metadata.height > 10000) {
        return { valid: false, reason: "Image dimensions too large" };
      }

      // Check for suspicious metadata
      if (metadata.exif && this.hasSuspiciousExif(metadata.exif)) {
        return { valid: false, reason: "Suspicious metadata detected" };
      }

      return { valid: true, metadata };
    } catch (error) {
      logger.error("Image validation failed", {
        error: error.message,
        imagePath,
      });
      return { valid: false, reason: "Image validation failed" };
    }
  }

  /**
   * Check for suspicious EXIF data
   * @param {Object} exif - EXIF data
   * @returns {boolean} True if suspicious
   */
  hasSuspiciousExif(exif) {
    // Check for suspicious patterns in EXIF data
    const suspiciousPatterns = [
      /<script/gi,
      /javascript:/gi,
      /\x00/, // Null bytes
    ];

    const exifString = JSON.stringify(exif);
    return suspiciousPatterns.some((pattern) => pattern.test(exifString));
  }

  /**
   * Generate thumbnails for image
   * @param {string} imagePath - Path to original image
   * @param {string} userId - User ID
   * @returns {Object} Thumbnail paths
   */
  async generateThumbnails(imagePath, userId) {
    try {
      const thumbnailDir = path.join(
        this.config.uploadDir,
        "profile",
        userId,
        "thumbnails",
      );
      await fs.mkdir(thumbnailDir, { recursive: true });

      const filename = path.basename(imagePath, path.extname(imagePath));

      const thumbnails = {
        small: path.join(thumbnailDir, `${filename}_small.jpg`),
        medium: path.join(thumbnailDir, `${filename}_medium.jpg`),
        large: path.join(thumbnailDir, `${filename}_large.jpg`),
      };

      // Generate different sizes
      await Promise.all([
        sharp(imagePath)
          .resize(150, 150, { fit: "cover" })
          .jpeg({ quality: 80 })
          .toFile(thumbnails.small),

        sharp(imagePath)
          .resize(300, 300, { fit: "cover" })
          .jpeg({ quality: 85 })
          .toFile(thumbnails.medium),

        sharp(imagePath)
          .resize(600, 600, { fit: "cover" })
          .jpeg({ quality: 90 })
          .toFile(thumbnails.large),
      ]);

      return thumbnails;
    } catch (error) {
      logger.error("Thumbnail generation failed", {
        error: error.message,
        imagePath,
      });
      return null;
    }
  }

  /**
   * Delete file
   * @param {string} filePath - Path to file
   */
  async deleteFile(filePath) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      logger.error("File deletion failed", {
        error: error.message,
        filePath,
      });
    }
  }

  /**
   * Get file download stream
   * @param {string} filePath - Path to file
   * @param {boolean} encrypted - Whether file is encrypted
   * @returns {Stream} File stream
   */
  async getFileStream(filePath, encrypted = false) {
    try {
      if (encrypted) {
        const decryptedData = await this.decryptFile(filePath);
        const { Readable } = require("stream");
        const stream = new Readable();
        stream.push(decryptedData);
        stream.push(null);
        return stream;
      } else {
        const fs = require("fs");
        return fs.createReadStream(filePath);
      }
    } catch (error) {
      logger.error("File stream creation failed", {
        error: error.message,
        filePath,
      });
      throw error;
    }
  }

  /**
   * Clean up old files
   * @param {number} maxAge - Maximum age in days
   */
  async cleanupOldFiles(maxAge = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAge);

      // This would typically query the database for old file records
      // and remove both the database records and physical files

      logger.info("File cleanup completed", {
        cutoffDate: cutoffDate.toISOString(),
        maxAge,
      });
    } catch (error) {
      logger.error("File cleanup failed", {
        error: error.message,
        maxAge,
      });
    }
  }
}

module.exports = new FileUploadService();
