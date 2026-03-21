# LendSmart Production Backend

Enterprise-grade financial services backend built with Node.js, Express, and MongoDB. This production-ready system provides comprehensive security, monitoring, compliance, and scalability features for peer-to-peer lending platforms.

## Architecture Overview

The LendSmart backend is designed with enterprise-grade architecture principles:

- **Microservices-ready**: Modular design with clear separation of concerns
- **Security-first**: Comprehensive security measures including encryption, authentication, and authorization
- **Compliance-focused**: Built-in GDPR compliance and financial industry standards
- **Monitoring & Observability**: Extensive logging, metrics, and health checks
- **Scalable**: Designed for horizontal scaling with load balancing support

## Features

### Security & Authentication

- **JWT-based Authentication** with refresh tokens
- **Multi-Factor Authentication (MFA)** with TOTP and backup codes
- **Role-Based Access Control (RBAC)** with granular permissions
- **Field-level Encryption** for sensitive data (PII, financial information)
- **Rate Limiting** with Redis backend for DDoS protection
- **Input Validation & Sanitization** against XSS, SQL injection, and NoSQL injection
- **Account Security** with lockout protection and session management

### Business Logic

- **Loan Management** with full lifecycle support
- **Credit Scoring** with multi-factor assessment algorithms
- **Payment Processing** with multiple payment methods
- **User Management** with KYC verification
- **Notification System** supporting email, SMS, and in-app notifications
- **Blockchain Integration** for smart contracts and transparency

### Compliance & Auditing

- **GDPR Compliance** with consent management and data portability
- **Audit Logging** with tamper-proof integrity chains
- **Data Retention** policies with automated anonymization
- **Financial Compliance** (SOX, PCI DSS considerations)
- **Regulatory Reporting** capabilities

### Monitoring & Operations

- **Structured Logging** with Winston and multiple transports
- **Health Check Endpoints** for Kubernetes/Docker deployments
- **Metrics Collection** with Prometheus format support
- **Performance Monitoring** with real-time metrics
- **Error Tracking** with comprehensive error handling
- **Graceful Shutdown** with proper cleanup

## Prerequisites

- Node.js 16+
- MongoDB 5.0+
- Redis 6.0+
- npm or yarn

## Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd lendsmart_production_backend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment Configuration**

   ```bash
   cp .env.example .env
   ```

   Configure the following environment variables:

   ```env
   # Server Configuration
   NODE_ENV=development
   PORT=3000
   HOST=0.0.0.0
   APP_VERSION=1.0.0

   # Database Configuration
   MONGODB_URI=mongodb://localhost:27017/lendsmart
   REDIS_URL=redis://localhost:6379

   # Security Configuration
   JWT_SECRET=your-super-secret-jwt-key
   JWT_EXPIRE=1h
   REFRESH_TOKEN_SECRET=your-refresh-token-secret
   REFRESH_TOKEN_EXPIRE=7d
   ENCRYPTION_KEY=your-32-character-encryption-key

   # External Services
   PAYMENT_PROCESSOR_API_KEY=your-payment-api-key
   CREDIT_BUREAU_API_KEY=your-credit-bureau-key
   NOTIFICATION_SERVICE_API_KEY=your-notification-key

   # CORS Configuration
   ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
   ```

4. **Start the server**

   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

## 🏃‍♂️ Quick Start

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

### Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run security tests
npm run test:security

# Run integration tests
npm run test:integration
```

## API Documentation

### Base URL

- Development: `http://localhost:3000`
- Production: `https://api.lendsmart.com`

### Health Checks

- `GET /health` - Basic health check
- `GET /health/detailed` - Comprehensive system health
- `GET /health/ready` - Readiness probe for Kubernetes
- `GET /health/live` - Liveness probe for Kubernetes

### Metrics

- `GET /metrics` - Prometheus-compatible metrics

### Authentication Endpoints

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/verify-mfa` - MFA verification
- `POST /api/auth/refresh-token` - Token refresh
- `POST /api/auth/logout` - User logout
- `POST /api/auth/forgot-password` - Password reset request
- `POST /api/auth/reset-password` - Password reset

### User Management

- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `POST /api/users/verify-email` - Email verification
- `POST /api/users/verify-phone` - Phone verification
- `PUT /api/users/change-password` - Change password

### Loan Management

- `POST /api/loans/apply` - Submit loan application
- `GET /api/loans` - Get user's loans
- `GET /api/loans/:id` - Get specific loan
- `PUT /api/loans/:id` - Update loan
- `POST /api/loans/:id/fund` - Fund a loan
- `POST /api/loans/:id/payment` - Make payment

### Admin Endpoints

- `GET /api/admin/users` - List all users
- `GET /api/admin/loans` - List all loans
- `PUT /api/admin/users/:id/status` - Update user status
- `GET /api/admin/analytics` - System analytics

## Security Features

### Authentication & Authorization

- JWT tokens with configurable expiration
- Refresh token rotation for enhanced security
- Multi-factor authentication with TOTP
- Role-based access control (RBAC)
- Session management with concurrent session limits

### Data Protection

- Field-level encryption for sensitive data
- Password hashing with bcrypt
- Input validation and sanitization
- SQL/NoSQL injection prevention
- XSS protection

### Rate Limiting

- Global API rate limiting
- Authentication endpoint protection
- User-specific rate limiting
- IP-based rate limiting

### Security Headers

- Helmet.js for security headers
- CORS configuration
- Content Security Policy (CSP)
- HSTS enforcement

## Monitoring & Logging

### Logging

- Structured logging with Winston
- Multiple log levels and transports
- Security event logging
- Performance monitoring
- Business event tracking

### Metrics

- Prometheus-compatible metrics
- HTTP request metrics
- Database performance metrics
- Business metrics (loans, payments)
- System resource monitoring

### Health Checks

- Basic health endpoint
- Detailed system health
- Database connectivity checks
- External service health
- Resource utilization monitoring

## Testing

The project includes comprehensive testing:

### Unit Tests

- Model validation and methods
- Service layer functionality
- Utility functions
- Security functions

### Integration Tests

- API endpoint testing
- Authentication workflows
- Database operations
- External service integration

### Security Tests

- Vulnerability assessment
- Penetration testing
- Input validation testing
- Authentication security

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Security tests only
npm run test:security

# Test coverage
npm run test:coverage
```

## Deployment

### Docker Deployment

```bash
# Build image
docker build -t lendsmart-backend .

# Run container
docker run -p 3000:3000 --env-file .env lendsmart-backend
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: lendsmart-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: lendsmart-backend
  template:
    metadata:
      labels:
        app: lendsmart-backend
    spec:
      containers:
        - name: lendsmart-backend
          image: lendsmart-backend:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
```

### Environment-Specific Configuration

#### Development

- Detailed logging
- Hot reloading
- Debug mode enabled
- Relaxed CORS policy

#### Staging

- Production-like configuration
- Comprehensive logging
- Performance monitoring
- Restricted CORS

#### Production

- Optimized performance
- Security hardening
- Minimal logging
- Strict CORS policy

## Performance Optimization

### Database Optimization

- Proper indexing strategy
- Connection pooling
- Query optimization
- Caching with Redis

### Application Optimization

- Compression middleware
- Response caching
- Lazy loading
- Memory management

### Monitoring

- Performance metrics collection
- Slow query detection
- Memory leak detection
- Resource utilization tracking

## Configuration

### Environment Variables

See `.env.example` for all available configuration options.

### Database Configuration

- MongoDB connection with replica set support
- Redis configuration for caching and sessions
- Connection pooling and retry logic

### Security Configuration

- JWT token configuration
- Encryption key management
- Rate limiting settings
- CORS policy configuration

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Code Style

- ESLint configuration included
- Prettier for code formatting
- JSDoc for documentation
- Conventional commits

## License

This project is licensed under the MIT License - see the LICENSE file for details.
