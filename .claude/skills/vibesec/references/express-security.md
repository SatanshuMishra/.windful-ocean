# Node.js / Express Security Reference

Security considerations specific to Node.js and Express.js applications.

---

## Helmet.js - Security Headers

Always use Helmet to set security headers automatically.

```javascript
const express = require('express');
const helmet = require('helmet');

const app = express();

// SECURE - Apply Helmet with all defaults
app.use(helmet());

// Or configure specific headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],  // Avoid if possible
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.yourservice.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "same-site" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Remove X-Powered-By header (Helmet does this, but be explicit)
app.disable('x-powered-by');
```

---

## HTTP Parameter Pollution (HPP)

Express parses repeated query parameters as Arrays by default. A validator that only inspects one occurrence of a parameter can be bypassed by supplying a second, unchecked value in the same array — this filter-bypass is the actual security class HPP belongs to. Left unhandled, the same array-vs-string mismatch can also crash code that expects a String.

```javascript
// VULNERABLE - Validator inspects only the first occurrence
// Attacker sends: /api/orders?status=pending&status=completed
const requestedStatus = req.query.status[0];  // 'pending' - looks safe
if (!['pending', 'processing'].includes(requestedStatus)) {
  return res.status(400).json({ error: 'Invalid status' });
}

// ...but code further down still receives the full array
Order.find({ status: req.query.status });
// MongoDB/Mongoose treats an Array value as an implicit $in clause, so this
// matches status: 'pending' OR status: 'completed' - the validator never
// saw 'completed' because it only inspected index [0]

// VULNERABLE - Also a crash bug for code that expects a String
// req.query.q becomes ['hello', 'world'] for /api/search?q=hello&q=world
// req.query.q.trim() -> CRASH (TypeError)

const hpp = require('hpp');

// SECURE - Place after body parsers, collapses every param to its last value
app.use(express.urlencoded({ extended: true }));
app.use(hpp());

// Now req.query.status and req.query.q are each a single String, so both
// the validator and the downstream query see the same one value
```

---

## Request Body & DoS Limits

Prevent Denial of Service (DoS) by limiting payload sizes.

```javascript
// SECURE - Limit body size (default is usually 100kb, but be explicit)
app.use(express.json({ limit: '10kb' })); // JSON payload limit
app.use(express.urlencoded({ extended: true, limit: '10kb' })); // Form data limit

// For file uploads, configure Multer limits separately (see File Upload section)
```

---

## Rate Limiting

Prevent brute force and DoS attacks with rate limiting.

```javascript
const rateLimit = require('express-rate-limit');
// rate-limit-redis 4.2.0+ changed to a named export - versions before 4.2.0
// (3.x, 4.0.x, 4.1.x) export the constructor directly, so on those older
// versions this line would instead read
// `const RedisStore = require('rate-limit-redis')`
const { RedisStore } = require('rate-limit-redis');
const Redis = require('ioredis');

const redisClient = new Redis(process.env.REDIS_URL);

// General API rate limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,  // 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  // Use Redis for distributed environments. This is the ioredis wiring: it
  // passes the command name as its own first argument, sendCommand: (command,
  // ...args) => redisClient.call(command, ...args). The node-redis client
  // takes one array instead - sendCommand: (...args) =>
  // redisClient.sendCommand(args) - and mixing the two shapes up is the
  // most common integration bug with this store
  store: new RedisStore({
    sendCommand: (command, ...args) => redisClient.call(command, ...args),
  }),
});

// Strict limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,  // Only 5 attempts per 15 minutes
  skipSuccessfulRequests: true,  // Don't count successful logins
  message: { error: 'Too many login attempts. Please try again later.' },
});

// Apply globally
app.use('/api/', apiLimiter);

// Apply to specific routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
```

`rate-limit-redis@6.0.1` declares a peer dependency of `express-rate-limit >= 8.6.0`. Current `express-rate-limit` is 8.7.0, so this pairing is supported; pinning `rate-limit-redis` to v6 against an older `express-rate-limit` is an unsupported combination and should be upgraded rather than left in place.

---

## Input Validation

Always validate input server-side. Never trust client data.

### Using express-validator

```javascript
const { body, param, query, validationResult } = require('express-validator');

// Validation middleware
const validateUser = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email required'),
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8-128 characters'),
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .escape()  // Prevent XSS
    .withMessage('Name required'),
  // Explicitly reject unexpected fields
  body('role').not().exists().withMessage('Cannot set role'),
  body('isAdmin').not().exists().withMessage('Cannot set admin status'),
];

// Check for validation errors
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

app.post('/api/users', validateUser, handleValidation, async (req, res) => {
  // Safe to use req.body here
  const { email, password, name } = req.body;
  // ... create user
});
```

### Using Zod

```javascript
const { z } = require('zod');

const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
}).strict();  // Reject unknown fields

const validateBody = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: error.errors 
    });
  }
};

app.post('/api/users', validateBody(userSchema), async (req, res) => {
  // req.body is validated and typed
});
```

---

## SQL Injection Prevention

### Using Parameterized Queries

```javascript
// VULNERABLE - String concatenation
const query = `SELECT * FROM users WHERE id = ${req.params.id}`;
db.query(query);  // SQL Injection!

// SECURE - Parameterized query (pg library)
const { rows } = await pool.query(
  'SELECT * FROM users WHERE id = $1',
  [req.params.id]
);

// SECURE - Parameterized query (mysql2)
const [rows] = await connection.execute(
  'SELECT * FROM users WHERE id = ?',
  [req.params.id]
);
```

### Using ORMs Safely

```javascript
// Sequelize
// VULNERABLE - raw query with interpolation
await sequelize.query(`SELECT * FROM users WHERE name = '${name}'`);

// SECURE - parameterized raw query
await sequelize.query(
  'SELECT * FROM users WHERE name = :name',
  { replacements: { name }, type: QueryTypes.SELECT }
);

// SECURE - ORM methods
await User.findOne({ where: { name } });

// VULNERABLE - ORDER BY from user input
User.findAll({ order: [[req.query.sort, 'ASC']] });  // Can inject!

// SECURE - Whitelist sort columns
const ALLOWED_SORT = ['name', 'createdAt', 'email'];
const sortBy = ALLOWED_SORT.includes(req.query.sort) ? req.query.sort : 'createdAt';
User.findAll({ order: [[sortBy, 'ASC']] });
```

---

## NoSQL Injection Prevention (MongoDB)

```javascript
// VULNERABLE - Direct use of request body
const user = await User.findOne({
  username: req.body.username,
  password: req.body.password
});
// Attacker sends: { "password": { "$ne": "" } }

// SECURE - Type casting
const user = await User.findOne({
  username: String(req.body.username),
  password: String(req.body.password)
});

// SECURE - Using mongo-sanitize
const sanitize = require('mongo-sanitize');

app.use((req, res, next) => {
  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);
  next();
});

// SECURE - Schema validation with Mongoose
const userSchema = new Schema({
  username: { type: String, required: true },
  password: { type: String, required: true }
});
// Mongoose automatically casts to String, rejecting objects
```

---

## Authentication & Sessions

### Session Configuration

```javascript
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const Redis = require('ioredis');

const redisClient = new Redis(process.env.REDIS_URL);

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,  // Strong random secret
  name: 'sessionId',  // Don't use default 'connect.sid'
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',  // HTTPS only
    httpOnly: true,  // No JavaScript access
    sameSite: 'strict',  // CSRF protection
    maxAge: 1000 * 60 * 60 * 24,  // 24 hours
    domain: process.env.COOKIE_DOMAIN,  // Explicit domain
  }
}));
```

### JWT Security

```javascript
const jwt = require('jsonwebtoken');

// VULNERABLE - Secret from token header
const decoded = jwt.decode(token);  // Just decodes, doesn't verify!

// SECURE - Verify with explicit algorithm
const verified = jwt.verify(token, process.env.JWT_SECRET, {
  algorithms: ['HS256'],  // Whitelist algorithm
  maxAge: '15m',  // Expire after 15 minutes
  issuer: 'your-app',
  audience: 'your-app-users',
});

// SECURE - Signing
const token = jwt.sign(
  { 
    sub: user.id, 
    role: user.role,
    jti: crypto.randomUUID()  // Unique ID for revocation
  },
  process.env.JWT_SECRET,
  { 
    algorithm: 'HS256',
    expiresIn: '15m',
    issuer: 'your-app',
  }
);
```

---

## CSRF Protection

Cross-Site Request Forgery (CSRF) tricks a victim's browser into sending a state-changing request that carries the victim's own session cookie, since browsers attach cookies to cross-site requests automatically. It only threatens routes authenticated by a cookie the browser sends on its own (session cookies, cookie-stored JWTs); a route authenticated purely by an `Authorization` header that client code must set explicitly is not exposed the same way.

OWASP's [CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) splits the recommendation by architecture: "Stateful software should use the synchronizer token pattern. Stateless software should use double submit cookies." Everything below is OWASP guidance, not an Express recommendation - Express's own security-best-practices page [deleted its CSRF section in 2022](https://expressjs.com/en/advanced/best-practice-security.html) and never replaced it.

### Stateful Apps: Synchronizer Token Pattern

Use this where the app already has a server-side session store.

```javascript
// VULNERABLE - Cookie alone authorizes the state change, no token required
app.post('/api/account/email', requireAuth, async (req, res) => {
  await updateEmail(req.user.id, req.body.email);
  res.json({ ok: true });
});

// SECURE - Issue a per-session token, require it back on state-changing requests
app.get('/api/csrf-token', requireAuth, (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  req.session.csrfToken = token;
  res.json({ csrfToken: token });
});

const requireCsrfToken = (req, res, next) => {
  const submitted = req.get('X-CSRF-Token');
  if (!submitted || submitted !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  next();
};

app.post('/api/account/email', requireAuth, requireCsrfToken, async (req, res) => {
  await updateEmail(req.user.id, req.body.email);
  res.json({ ok: true });
});
```

The token lives in server-side session state. A cross-site page can still make the browser send the session cookie, but it cannot read the token to also set the `X-CSRF-Token` header - same-origin policy blocks that read, and a plain HTML form submission has no way to attach a custom header at all. `csrf-sync` is the actively maintained package implementing this pattern if you would rather not hand-roll it.

### Stateless Apps: Session-Bound Double-Submit Cookie

There is a naive version of this pattern that OWASP now lists under "Naive Double-Submit Cookie Pattern (DISCOURAGED)": a plain random value stored in a readable cookie and echoed back in a header, with no cryptographic tie to the session. It is bypassable by any attacker who can write a cookie on the target domain - a sibling subdomain, an XSS bug elsewhere on the same registrable domain, or a MITM against a sibling `http://` host all qualify. This is exactly what the deprecated `csurf` package implements, and its actively-published fork `@dr.pogodin/csurf` reproduces the same discouraged design - a recent publish date does not make it safe to adopt.

The acceptable variant is session-bound, not merely signed: OWASP is explicit that "simply signing tokens without session binding provides minimal protection and remains vulnerable to cookie injection attacks." The token has to be an HMAC computed over a session-identifying value, not just an opaque signed blob.

```javascript
const crypto = require('crypto');

// SECURE - The cookie value is an HMAC over the session id, not a bare
// random value, so an attacker who can merely write a cookie cannot forge
// a value that will also verify against the server's secret
const issueCsrfCookie = (req, res, next) => {
  const token = crypto
    .createHmac('sha256', process.env.CSRF_SECRET)
    .update(req.session.id)
    .digest('hex');

  res.cookie('csrf-token', token, {
    httpOnly: false,  // Client-side JS must read it to echo it back
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  next();
};

const requireCsrfToken = (req, res, next) => {
  const expected = crypto
    .createHmac('sha256', process.env.CSRF_SECRET)
    .update(req.session.id)
    .digest('hex');
  const headerToken = req.get('X-CSRF-Token');

  if (!headerToken || headerToken !== expected) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  next();
};
```

`csrf-csrf` is the maintained package implementing this session-bound HMAC variant - though its own maintenance has slowed (last publish over a year old, one commit in the last twelve months, and Express 5 typings support is still an open, unanswered issue on its tracker), so check its issue tracker before pulling it into a new Express 5 project.

### A note on `csurf` and `npm audit`

The `csurf` npm package is deprecated by its own maintainers, implements the discouraged naive pattern above, and should not be adopted in new code - `@dr.pogodin/csurf` included, since it is the same design under a different name. Do not rely on `npm audit` to catch this: neither OSV nor the GitHub advisory API list any advisory against `csurf`, because the maintainer deprecated the package instead of publishing a patch for the underlying bypass. A `csurf` dependency will pass `npm audit` clean while still shipping the discouraged design.

### SameSite Cookies (Defense-in-Depth, Not a Replacement)

```javascript
app.use(session({
  // ...
  cookie: {
    sameSite: 'strict',  // Browser withholds this cookie on cross-site requests
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  }
}));
```

OWASP is explicit that "SameSite is useful as a defense-in-depth control but it does not replace a proper CSRF defense in most deployments," for two reasons: `Lax` (the more compatible, and more commonly deployed, setting) still permits state-changing top-level `GET` navigations, and SameSite is scoped to the registrable domain, so a sibling subdomain still counts as "same-site" and is unaffected by it. Use one of the two token patterns above as the real defense and keep SameSite as a second layer underneath it, not the whole defense.

### Sec-Fetch-Site (Modern Additional Signal)

All major browsers have sent the `Sec-Fetch-Site` request header since March 2023, and OWASP now calls it "the most useful Fetch Metadata header for blocking CSRF-like cross-origin requests":

```javascript
const requireSameSiteFetch = (req, res, next) => {
  const fetchSite = req.get('Sec-Fetch-Site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return res.status(403).json({ error: 'Cross-site request rejected' });
  }
  next();
};
```

OWASP treats this as a signal that needs a fallback, not one to rely on alone: "a fallback to standard origin verification headers is a mandatory requirement," since a request with no `Sec-Fetch-Site` header at all - an older browser, a non-browser client - must not be treated as automatically safe. Layer it on top of one of the token patterns above, never in place of one.

---

## File Upload Security

```javascript
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// SECURE - Buffer the upload in memory so magic bytes can be checked BEFORE
// anything is written to disk (validate-before-persist). Bounded by the
// fileSize limit below, so memory use per request stays capped
const storage = multer.memoryStorage();

// File filter checks only the declared mimetype/extension (cheap, early
// rejection) - the magic-byte check below is the real content validation
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif'];
  const allowedExts = ['.jpg', '.jpeg', '.png', '.gif'];
  
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,  // 5MB max
    files: 1,  // Single file
  }
});

app.post('/upload', upload.single('file'), async (req, res) => {
  // file-type has been ESM-only since v17.0.0 (2021-11-24); the current
  // major is 22 (22.0.2, engines: node >=22), and it has no CommonJS
  // `require` surface, so a CommonJS Express app must load it with a
  // dynamic import even though the rest of this file uses `require`.
  // Node >=22.12 can `require()` an ES module unflagged (stable since
  // v20.19.0 / v22.12.0 / v23.0.0), but v22.0-22.11 cannot even though
  // file-type v22's own `engines` field still admits that range - `await
  // import` is the form that works on every Node version file-type supports
  const { fileTypeFromBuffer } = await import('file-type');
  const fileType = await fileTypeFromBuffer(req.file.buffer);

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];

  if (!fileType || !allowedTypes.includes(fileType.mime)) {
    // Nothing was ever written to disk, so there is nothing to clean up
    return res.status(400).json({ error: 'Invalid file type' });
  }

  // Only now, after the content is validated, persist it with a random name
  const ext = path.extname(req.file.originalname).toLowerCase();
  const randomName = crypto.randomBytes(16).toString('hex');
  const filename = `${randomName}${ext}`;
  const destination = path.join('uploads', filename);  // Outside webroot!

  await fs.promises.writeFile(destination, req.file.buffer);

  res.json({ filename });
});
```

---

## CORS Configuration

```javascript
const cors = require('cors');

// VULNERABLE - Allow all origins with credentials
app.use(cors({ origin: true, credentials: true }));

// SECURE - Whitelist specific origins
const allowedOrigins = [
  'https://yourapp.com',
  'https://admin.yourapp.com',
  process.env.NODE_ENV === 'development' && 'http://localhost:3000'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // SECURE - Block requests with no Origin header by default. Browsers
    // always send Origin on cross-origin fetch/XHR, so a missing header
    // usually means a non-browser client, not a legitimate front-end call
    if (!origin) {
      return callback(new Error('Not allowed by CORS'));
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  maxAge: 86400,  // 24 hours
}));

// OPT-IN VARIANT - Only if you must serve non-browser clients (native mobile
// apps, curl, server-to-server calls) that legitimately send no Origin header.
// Tradeoff: any attacker script making a direct HTTP request can also omit
// Origin, so this exception removes the origin check for that whole class of
// caller - do not enable it just to silence a `curl` test or a mobile SDK bug.
//
// origin: (origin, callback) => {
//   if (!origin) {
//     return callback(null, true);
//   }
//   if (allowedOrigins.includes(origin)) {
//     callback(null, true);
//   } else {
//     callback(new Error('Not allowed by CORS'));
//   }
// },
```

---

## Error Handling

```javascript
// VULNERABLE - Exposes stack traces
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message, stack: err.stack });
});

// SECURE - Generic errors in production
app.use((err, req, res, next) => {
  // Log detailed error server-side
  const errorId = crypto.randomUUID().slice(0, 8);
  console.error(`Error ${errorId}:`, err);
  
  // Determine status code
  const statusCode = err.statusCode || err.status || 500;
  
  // Send appropriate response
  if (process.env.NODE_ENV === 'production') {
    // Production: generic message
    res.status(statusCode).json({
      error: statusCode >= 500 ? 'Internal server error' : err.message,
      reference: errorId,  // For support tickets
    });
  } else {
    // Development: detailed error
    res.status(statusCode).json({
      error: err.message,
      stack: err.stack,
    });
  }
});

// Always handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  // Don't crash in production, but log for monitoring
});
```

---

## Command Injection Prevention

```javascript
const { execFile, spawn } = require('child_process');

// VULNERABLE - exec with user input
const { exec } = require('child_process');
exec(`ping -c 1 ${userInput}`);  // Command injection!

// SECURE - Use execFile with array arguments
execFile('ping', ['-c', '1', userInput], (error, stdout) => {
  // userInput is treated as a single argument
});

// SECURE - Use spawn with array arguments
const child = spawn('ffmpeg', ['-i', inputFile, '-o', outputFile]);

// SECURE - Validate input strictly
const validateIP = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

if (!validateIP.test(userInput)) {
  return res.status(400).json({ error: 'Invalid IP address' });
}

execFile('ping', ['-c', '1', userInput]);
```

---

## Dependency Security

```bash
# Check for known vulnerabilities
npm audit

# Fix automatically where possible  
npm audit fix

# Check specific package
npm audit --package-lock-only

# Use Snyk for more comprehensive scanning
npx snyk test
```

### Lock File Security

```javascript
// package.json - Use exact versions for critical packages
{
  "dependencies": {
    "express": "4.18.2",  // Exact version
    "helmet": "^7.0.0"    // Minor updates OK
  }
}

// Always commit package-lock.json
// Verify integrity on CI
npm ci  // Uses lock file exactly
```

---

## Prototype Pollution Prevention

```javascript
// VULNERABLE - Deep merge with user input
function merge(target, source) {
  for (let key in source) {
    if (typeof source[key] === 'object') {
      target[key] = merge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
merge({}, JSON.parse(userInput));  // Prototype pollution!

// SECURE - Block dangerous keys
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

function safeMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (DANGEROUS_KEYS.includes(key)) continue;
    
    if (typeof source[key] === 'object' && source[key] !== null) {
      target[key] = safeMerge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// SECURE - Use Object.create(null) for dictionaries
const lookup = Object.create(null);  // No prototype

// SECURE - Use Map for user-controlled keys
const userSettings = new Map();
userSettings.set(userKey, userValue);
```

---

## Express Security Checklist

### Middleware
- [ ] Helmet.js enabled with proper configuration
- [ ] Rate limiting on all routes (stricter on auth)
- [ ] CORS configured with specific origins
- [ ] Body parser size limits set
- [ ] Request timeout configured

### Authentication
- [ ] Sessions use secure cookies (httpOnly, secure, sameSite)
- [ ] JWT algorithm whitelisted on verification
- [ ] Password hashing with Argon2 or bcrypt
- [ ] Session regeneration on login
- [ ] CSRF defense present on state-changing routes that rely on cookie auth: synchronizer token (stateful) or a session-bound HMAC double-submit cookie via `csrf-csrf` (stateless) - never the naive `csurf`/`@dr.pogodin/csurf` pattern, and never SameSite alone

### Input/Output
- [ ] All input validated server-side
- [ ] SQL/NoSQL queries parameterized
- [ ] File uploads validated (type, size, magic bytes)
- [ ] Error messages don't leak details in production

### Security Hygiene
- [ ] Dependencies audited regularly
- [ ] X-Powered-By header removed
- [ ] Secrets in environment variables
- [ ] HTTPS enforced in production
