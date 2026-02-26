# 🦅 KESTREL – Backend API

**Biodiversity Monitoring & Ecological Reporting Platform**

REST API powering the KESTREL platform — built with Node.js, Express 5, and MongoDB. Handles authentication, species reporting with geospatial queries, analytics aggregation, community forum, and admin management.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Framework | Express 5 |
| Database | MongoDB + Mongoose 8 |
| Auth | JWT (jsonwebtoken) |
| File Uploads | Multer (5 MB limit) |
| Rate Limiting | express-rate-limit |
| Email | Nodemailer |
| CSV Ingestion | csv-parse |
| Dev Server | Nodemon |

---

## Project Structure

```
kestrel-backend/
├── app.js                    # Entry point – middleware, routes, error handling
├── config/
│   ├── db.js                 # Mongoose connection
│   └── env.js                # Centralised env config with fallbacks
├── models/
│   ├── User.js               # Auth, roles, profile, reset tokens
│   ├── Species.js            # Master species registry
│   ├── SpeciesReport.js      # Field reports (GeoJSON 2dsphere index)
│   ├── Alert.js              # Ecological alerts with user feedback
│   ├── Anomaly.js            # Detected ecological anomalies
│   ├── ForumPost.js          # Community forum posts
│   └── Comment.js            # Post comments
├── controllers/              # Route logic (8 controllers)
├── routes/                   # Express routers (8 route files)
├── middlewares/
│   ├── authMiddleware.js     # JWT protect
│   ├── roleGuard.js          # requireRole() factory
│   ├── upload.js             # Multer – images & CSV
│   ├── rateLimiter.js        # Global & auth-specific limits
│   └── errorHandler.js       # 404 + global error handler
├── services/
│   └── emailService.js       # Nodemailer password reset emails
└── utils/
    ├── asyncHandler.js       # Async route wrapper
    └── apiResponse.js        # Consistent response helpers
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- MongoDB 6+ (local or Atlas URI)

### Installation

```bash
git clone https://github.com/Kestrel-Biodiversity-Monitor/Kestrel-Backend.git
cd kestrel-backend
npm install
```

### Environment Setup

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
PORT=3001
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/kestrel
JWT_SECRET=your_strong_secret_here
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:3000
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_pass
SMTP_FROM=noreply@kestrel.io
```

### Running

```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

Server starts at `http://localhost:3001`

---

## API Reference

### Base URL
```
http://localhost:3001/api
```

### Authentication

All protected routes require a Bearer token in the `Authorization` header:
```
Authorization: Bearer <JWT_TOKEN>
```

---

### Auth Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| `POST` | `/auth/register` | ❌ | Create new account |
| `POST` | `/auth/login` | ❌ | Login and receive JWT |
| `GET` | `/auth/me` | ✅ | Get authenticated user |
| `POST` | `/auth/forgot-password` | ❌ | Request password reset email |
| `POST` | `/auth/reset-password` | ❌ | Reset password via token |
| `PUT` | `/auth/profile` | ✅ | Update profile + avatar |
| `POST` | `/auth/request-role-upgrade` | ✅ | Request Researcher role |

**Register Example**
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Smith","email":"jane@eco.org","password":"secure123","organization":"Wildlife Trust"}'
```

---

### Species Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| `GET` | `/species` | ❌ | List all species (filter: `category`, `status`, `search`) |
| `GET` | `/species/:id` | ❌ | Get species by ID |
| `POST` | `/species` | ✅ Researcher+ | Create species |
| `PUT` | `/species/:id` | ✅ Admin | Update species |
| `DELETE` | `/species/:id` | ✅ Admin | Delete species |

---

### Reports Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| `GET` | `/reports` | ✅ | List reports (filter: `status`, `riskLevel`) |
| `GET` | `/reports/:id` | ✅ | Get single report |
| `GET` | `/reports/map` | ✅ | All approved reports with coordinates (for map) |
| `POST` | `/reports` | ✅ | Submit species report (multipart, image optional) |
| `POST` | `/reports/bulk-csv` | ✅ | Bulk upload via CSV |
| `PATCH` | `/reports/:id/status` | ✅ Admin | Approve / Reject report |

**CSV Upload Format**
```
speciesName,lat,lng,region,habitatType,observationType,numberOfIndividuals,riskLevel,description,surveyName
Bengal Tiger,21.5,80.3,Central India,Forest,Visual,2,High,Pair spotted near water source,Survey-2025
```

---

### Analytics Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| `GET` | `/analytics/species-count` | ❌ | Top 15 reported species |
| `GET` | `/analytics/monthly-trends` | ❌ | Monthly submissions by status (`?year=2025`) |
| `GET` | `/analytics/region-summary` | ❌ | Top 10 regions by report count |
| `GET` | `/analytics/comparison` | ❌ | Platform-wide totals + conservation & habitat breakdown |

---

### Alerts & Anomalies

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| `GET` | `/alerts` | ✅ | List alerts |
| `POST` | `/alerts` | ✅ Admin | Create alert |
| `PUT` | `/alerts/:id` | ✅ Admin | Update alert |
| `DELETE` | `/alerts/:id` | ✅ Admin | Delete alert |
| `POST` | `/alerts/:id/feedback` | ✅ | Submit user feedback on alert |
| `GET` | `/anomalies` | ✅ | List anomalies |
| `POST` | `/anomalies` | ✅ | Report anomaly |
| `PATCH` | `/anomalies/:id/review` | ✅ Admin | Review anomaly |

---

### Forum Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| `GET` | `/forum` | ✅ | List posts (filter: `category`) |
| `GET` | `/forum/:id` | ✅ | Get post with comments |
| `POST` | `/forum` | ✅ | Create post |
| `POST` | `/forum/:id/comments` | ✅ | Add comment |
| `PATCH` | `/forum/:id/upvote` | ✅ | Toggle upvote |
| `DELETE` | `/forum/:id` | ✅ | Delete post (owner or admin) |

---

### Admin Endpoints

> All admin routes require `role: "admin"`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/users` | List all users |
| `PATCH` | `/admin/users/:id/role` | Change user role |
| `GET` | `/admin/role-requests` | Pending researcher upgrade requests |
| `PATCH` | `/admin/users/:id/toggle-active` | Activate / deactivate user |
| `GET` | `/admin/activity` | Recent platform activity |

---

### Health Check

```bash
curl http://localhost:3001/api/health
# {"status":"ok","timestamp":"...","env":"development"}
```

---

## User Roles

| Role | Permissions |
|------|-------------|
| `user` | Submit reports, view approved data, post in forum |
| `researcher` | All user permissions + create species entries |
| `admin` | Full platform access – approve reports, manage users, alerts, species |

---

## Security

- JWT tokens with configurable expiry
- Bcrypt password hashing (12 salt rounds)
- Per-route role guards via `requireRole()` middleware
- Global rate limit: 200 req / 15 min
- Auth rate limit: 20 req / 15 min
- File upload size limit: 5 MB
- Images only (JPEG, PNG, GIF, WebP)
- Helmet-compatible CORS configuration

---

## Environment Variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `PORT` | ❌ | Server port (default: `3001`) |
| `NODE_ENV` | ❌ | `development` or `production` |
| `MONGO_URI` | ✅ | MongoDB connection string |
| `JWT_SECRET` | ✅ | JWT signing secret (min 32 chars in prod) |
| `JWT_EXPIRES_IN` | ❌ | Token TTL (default: `7d`) |
| `CLIENT_URL` | ❌ | Frontend origin for CORS (default: `http://localhost:3000`) |
| `SMTP_HOST` | ❌ | SMTP server hostname |
| `SMTP_PORT` | ❌ | SMTP port (default: `587`) |
| `SMTP_USER` | ❌ | SMTP username |
| `SMTP_PASS` | ❌ | SMTP password |
| `SMTP_FROM` | ❌ | Sender email address |

> **Note:** Password reset emails require valid SMTP credentials. For development, use [Ethereal](https://ethereal.email/) for free test credentials.

---

## License

MIT
