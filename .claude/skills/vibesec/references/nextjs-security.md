# Next.js Security Reference

Security considerations specific to Next.js applications.

---

## Source Maps in Production

Source maps expose your original source code, making it trivial for attackers to understand your application logic.

### The Risk

```javascript
// In production, attackers can access:
https://yoursite.com/_next/static/chunks/main-abc123.js.map

// This reveals:
// - Original TypeScript/JSX source code
// - Comments with TODOs and internal notes
// - API endpoint structures
// - Business logic and validation rules
// - Potentially hardcoded secrets that slipped through
```

### Secure Configuration

```javascript
// next.config.js
module.exports = {
  // SECURE - Disable source maps in production
  productionBrowserSourceMaps: false,  // Default is false, but be explicit
  
  // If you NEED source maps for error tracking (Sentry, etc.)
  // Upload them privately, don't serve publicly
  
  webpack: (config, { isServer, dev }) => {
    if (!dev && !isServer) {
      // Remove source maps from client bundles
      config.devtool = false;
    }
    return config;
  }
}

// For error tracking services, upload source maps privately:
// sentry-cli releases files upload-sourcemaps ./next/static --url-prefix '~/_next/static'
```

### Verification Checklist

- [ ] `productionBrowserSourceMaps: false` in next.config.js
- [ ] Check `/_next/static/chunks/*.map` returns 404 in production
- [ ] If using error tracking, upload source maps via CI/CD (not publicly served)
- [ ] Review build output for `.map` files

---

## Environment Variables Exposure

Next.js has a specific pattern for environment variables that can accidentally expose secrets.

### Dangerous Pattern

```javascript
// .env.local
NEXT_PUBLIC_API_KEY=sk_live_secret123  // EXPOSED TO BROWSER!
DATABASE_URL=postgresql://...           // Server-only (safe)
JWT_SECRET=supersecret                   // Server-only (safe)

// NEXT_PUBLIC_* variables are bundled into client JavaScript
// Anyone can see them in the browser's Network tab or source
```

### What to NEVER Prefix with NEXT_PUBLIC_

- API keys with write access (Stripe secret, AWS keys)
- Database credentials
- JWT signing secrets
- OAuth client secrets
- Internal service URLs
- Admin credentials

### Secure Pattern

```javascript
// .env.local
// Client-safe (read-only, public data)
NEXT_PUBLIC_ANALYTICS_ID=UA-12345
NEXT_PUBLIC_API_URL=https://api.example.com

// Server-only (no NEXT_PUBLIC_ prefix)
STRIPE_SECRET_KEY=sk_live_xxx
DATABASE_URL=postgresql://...
JWT_SECRET=xxx

// Access server-only vars in API routes or getServerSideProps
export async function getServerSideProps() {
  // This never reaches the browser
  const dbUrl = process.env.DATABASE_URL;
}
```

---

## API Routes Security

### Authentication on Every Route

```typescript
// pages/api/user/[id].ts - VULNERABLE
export default async function handler(req, res) {
  const user = await db.user.findUnique({ where: { id: req.query.id } });
  return res.json(user);  // No auth check! Anyone can access any user
}

// pages/api/user/[id].ts - SECURE
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  // IDOR check - user can only access their own data
  if (req.query.id !== session.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  
  const user = await db.user.findUnique({ where: { id: req.query.id } });
  return res.json(user);
}
```

### Middleware for Global Auth

```typescript
// middleware.ts - Protect routes globally
import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized: ({ token, req }) => {
      // Protect all /api/* and /dashboard/* routes
      if (req.nextUrl.pathname.startsWith("/api/") || 
          req.nextUrl.pathname.startsWith("/dashboard/")) {
        return !!token;
      }
      return true;
    },
  },
});

export const config = {
  matcher: ["/api/:path*", "/dashboard/:path*"],
};
```

Next.js 16 renamed this file and its export: `middleware.ts` became `proxy.ts`, and `export function middleware` became `export function proxy`. The `middleware.ts` convention is now deprecated ([Next.js docs: middleware-to-proxy](https://nextjs.org/docs/messages/middleware-to-proxy)). A codemod automates the rename: `npx @next/codemod@canary middleware-to-proxy .`. The example above targets Next.js 15 and earlier, where `middleware.ts` / `export function middleware` is still correct — on Next.js 16, rename the file and its export (or run the codemod) instead of rewriting the logic.

Auth.js v5 (`next-auth@5`, still in beta as of this writing) replaces `next-auth/middleware`'s `withAuth` — and `getServerSession` — with a single `auth` export from a root `auth.ts` config, used directly as `export { auth as middleware } from "@/auth"`. `next-auth` v4 is the actively maintained non-beta release on npm and the `withAuth` pattern above remains fully supported; upgrade only once v5 reaches a stable release. The project's own README now points past both: "Auth.js is now part of Better Auth. We recommend new projects to start with Better Auth unless there are some very specific feature gaps (most notably stateless session management without a database)" ([next-auth README](https://github.com/nextauthjs/next-auth)). The honest picture for an existing codebase: v4 is the maintained, non-beta line and still receives security fixes — four advisories landed against it in the last sixty days, three reaching `4.24.14` and one rated critical, with no open unpatched advisory against `4.24.15` — while v5 has been in beta since 2023. Pin `next-auth>=4.24.15` and fix call sites in an existing v4 app; point a genuinely new project at Better Auth instead, and reach for v5 only if a specific feature gap forces it.

---

## Server Actions Security (App Router)

Server Actions can be invoked directly by the client, requiring careful validation.

### Vulnerable Pattern

```typescript
// app/actions.ts
'use server'

// VULNERABLE - No auth, accepts any data
export async function updateProfile(data: { userId: string, name: string, role: string }) {
  await db.user.update({
    where: { id: data.userId },  // User controls which user to update!
    data: { name: data.name, role: data.role }  // Can set role to 'admin'!
  });
}
```

### Secure Pattern

```typescript
// app/actions.ts
'use server'

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { z } from "zod";
import { revalidatePath } from "next/cache";

// Define allowed fields with Zod
const updateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
  // Note: 'role' is NOT in schema - users can't modify it
});

export async function updateProfile(formData: FormData) {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  
  // 2. Validate input
  const rawData = {
    name: formData.get('name'),
    bio: formData.get('bio'),
  };
  
  const validatedData = updateProfileSchema.parse(rawData);
  
  // 3. Use session user ID, not client-provided ID
  await db.user.update({
    where: { id: session.user.id },  // From session, not request
    data: validatedData,  // Only whitelisted fields
  });
  
  revalidatePath('/profile');
}
```

**Why `authOptions` cannot be dropped from this call:** in `next-auth@4.24.15`, `getServerSession`'s overload set includes a zero-argument signature, so a bare `getServerSession()` — no `authOptions` — type-checks even though it silently does the wrong thing. At runtime that zero-argument path builds an empty config (`{ providers: [] }`) instead of reading `authOptions`, and none of the three failure modes throws: a database-strategy session returns `null` unconditionally, because with no adapter in scope the code forces the JWT strategy and then tries to decode an opaque database token; a secret configured as `authOptions.secret` rather than in the environment also yields `null`; and even where a call appears to work, the `jwt`/`session` callbacks configured in `authOptions` never run, so custom claims such as `session.user.id` or `session.user.role` come back `undefined`. An authorization check reading `session.user.role` then silently sees nothing — a silent authorization failure that passes type-checking, which is why `authOptions` is always passed explicitly above.

### Server Action Checklist

- [ ] Always authenticate in server actions
- [ ] Never trust client-provided user IDs (use session)
- [ ] Validate all inputs with Zod or similar
- [ ] Whitelist fields for mass assignment protection
- [ ] Use CSRF protection (built-in with Server Actions when using forms)

---

## getServerSideProps / getStaticProps Security

### Data Leakage via Props

```typescript
// VULNERABLE - Entire user object passed to client
export async function getServerSideProps({ req }) {
  const user = await db.user.findUnique({ 
    where: { id: session.userId },
    include: { payments: true, adminNotes: true }  // Sensitive!
  });
  
  return { props: { user } };  // All data sent to browser!
}

// SECURE - Only pass needed, safe data
export async function getServerSideProps({ req }) {
  const user = await db.user.findUnique({ 
    where: { id: session.userId },
    select: { id: true, name: true, email: true, avatar: true }
  });
  
  // Or manually pick fields
  return { 
    props: { 
      user: {
        id: user.id,
        name: user.name,
        // Explicitly exclude sensitive fields
      }
    } 
  };
}
```

---

## Security Headers

Browsers have removed support for `X-XSS-Protection`, so it's dropped here — `Content-Security-Policy` is the current replacement. `script-src`'s `'unsafe-eval'` is scoped to development only; Next.js production builds don't need it.

```typescript
// next.config.js
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains'
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''};
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: https:;
      font-src 'self';
      connect-src 'self' https://api.yourservice.com;
      frame-ancestors 'none';
    `.replace(/\n/g, '')
  }
];

module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};
```

Next.js's own recommendation is a nonce + `strict-dynamic` CSP rather than the static policy above ([Next.js docs: Content Security Policy](https://nextjs.org/docs/app/guides/content-security-policy)), and that approach carries a real cost stated directly in that doc: "When you use nonces in your CSP, all pages must be dynamically rendered." Adopting nonces disables static optimization and Incremental Static Regeneration, and is incompatible with Partial Prerendering. The static policy above avoids that cost; know the trade-off exists before picking one over the other.

---

## Image Optimization Security

### Remote Image Domains

```typescript
// next.config.js
module.exports = {
  images: {
    // VULNERABLE - allows any domain
    // remotePatterns: [{ protocol: 'https', hostname: '**' }],
    
    // SECURE - whitelist specific domains
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.yourcdn.com',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
};
```

### User-Uploaded Images

```typescript
// Never pass user URLs directly to next/image without validation
// VULNERABLE
<Image src={user.avatarUrl} alt="Avatar" />  // User controls URL!

// SECURE - validate URL or use proxy
function validateImageUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const allowedHosts = ['images.yourcdn.com', 'your-bucket.s3.amazonaws.com'];
    if (allowedHosts.includes(parsed.hostname)) {
      return url;
    }
  } catch {
    return null;
  }
  return null;
}

// Or store images on your own CDN and only reference by ID
<Image src={`/api/images/${user.avatarId}`} alt="Avatar" />
```

---

## Redirect Security

```typescript
// pages/api/redirect.ts - VULNERABLE
export default function handler(req, res) {
  const { url } = req.query;
  res.redirect(url);  // Open redirect!
}

// SECURE - Validate redirect destination
const ALLOWED_REDIRECT_HOSTS = ['yoursite.com', 'app.yoursite.com'];

export default function handler(req, res) {
  const { url } = req.query;
  
  try {
    const parsed = new URL(url, 'https://yoursite.com');
    
    // Only allow relative paths or whitelisted hosts
    if (parsed.origin === 'https://yoursite.com' || 
        ALLOWED_REDIRECT_HOSTS.includes(parsed.hostname)) {
      return res.redirect(parsed.href);
    }
  } catch {
    // Invalid URL
  }
  
  return res.redirect('/');  // Default to home
}
```

---

## Rate Limiting

Without a limit, an API route can be called as fast as the caller can send requests, which enables credential brute-forcing and denial-of-service abuse.

### Vulnerable Pattern

```typescript
// app/api/login/route.ts - VULNERABLE
export async function POST(req: Request) {
  const { email, password } = await req.json();
  // No limit on attempts - callers can brute-force credentials
  const user = await verifyCredentials(email, password);
  if (!user) {
    return Response.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  return Response.json({ user });
}
```

### Secure Pattern

```typescript
// app/api/login/route.ts - SECURE
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Sliding window: 5 attempts per 15 minutes, per IP
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '15 m'),
  prefix: 'login',
});

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return Response.json({ error: 'Too many attempts, try again later' }, { status: 429 });
  }

  const { email, password } = await req.json();
  const user = await verifyCredentials(email, password);
  if (!user) {
    return Response.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  return Response.json({ user });
}
```

An in-memory counter resets on every cold start and doesn't share state across serverless instances — `@upstash/ratelimit` backs the count with Redis so the limit holds across instances.

---

## Next.js Security Checklist

### Build & Deployment
- [ ] Source maps disabled in production
- [ ] No `NEXT_PUBLIC_` prefix on secrets
- [ ] Environment variables validated at build time
- [ ] `.env*.local` files in `.gitignore`

### API Routes
- [ ] Authentication checked on all protected routes
- [ ] Authorization (ownership) verified for resource access
- [ ] Input validation on all endpoints
- [ ] Rate limiting implemented

### Server Components & Actions
- [ ] Authentication in all server actions
- [ ] User ID from session, not client
- [ ] Zod validation on all inputs
- [ ] Mass assignment protection (whitelist fields)

### Data Handling
- [ ] Props sanitized before sending to client
- [ ] Sensitive fields excluded from serialization
- [ ] Error messages don't leak internal details

### Headers & Images
- [ ] Security headers configured
- [ ] Image domains whitelisted
- [ ] Redirects validated against allowlist
