# React + Vite Security Reference

Security considerations specific to React applications built with Vite.

---

## Environment Variables Exposure

### Vite's Public Variable Pattern

```bash
# .env
VITE_API_URL=https://api.example.com       # EXPOSED - bundled into client
VITE_STRIPE_PK=pk_live_xxx                 # EXPOSED - but OK (publishable key)
DATABASE_URL=postgresql://...               # Server-only (NOT in Vite client)
STRIPE_SK=sk_live_xxx                       # Server-only (safe)

# DANGER: Variables prefixed with VITE_ are embedded in your bundle
# Anyone can see them in browser DevTools or by reading your JS files
```

### What to NEVER Prefix with VITE_

- API secret keys (anything with write access)
- Database credentials
- JWT signing secrets
- OAuth client secrets
- Internal service URLs
- Admin credentials

### Accessing Variables Safely

```javascript
// Client-side (exposed in bundle)
const apiUrl = import.meta.env.VITE_API_URL;
const stripePublishable = import.meta.env.VITE_STRIPE_PK;

// These will be undefined in client (server-only)
const dbUrl = import.meta.env.DATABASE_URL;  // undefined in browser
```

Type-safe env with validation (`vite-env.d.ts`):

```typescript
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_STRIPE_PK: string;
}
```

---

## Source Maps in Production

### Disable Source Maps

```javascript
// vite.config.js
export default defineConfig({
  build: {
    // SECURE - Disable source maps in production
    sourcemap: false,
    
    // Or, upload to error tracking service only
    // sourcemap: 'hidden',  // Generates but doesn't reference in bundle
  }
});
```

### Verification

```bash
# Check if .map files exist in production build
ls -la dist/assets/*.map
# Should return: No such file or directory
```

---

## Cross-Site Scripting (XSS) Prevention

### React's Built-in Protection

```jsx
// SAFE - React escapes by default
const UserProfile = ({ user }) => (
  <div>
    <h1>{user.name}</h1>  {/* Escaped automatically */}
    <p>{user.bio}</p>      {/* Escaped automatically */}
  </div>
);

// Attacker input: "<script>alert('xss')</script>"
// Rendered as: "&lt;script&gt;alert('xss')&lt;/script&gt;"
```

### Dangerous Patterns to Avoid

```jsx
// VULNERABLE - dangerouslySetInnerHTML
const Comment = ({ htmlContent }) => (
  <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
);
// If htmlContent is user-controlled, XSS!

// SECURE - Sanitize before using dangerouslySetInnerHTML
import DOMPurify from 'dompurify';

const Comment = ({ htmlContent }) => (
  <div 
    dangerouslySetInnerHTML={{ 
      __html: DOMPurify.sanitize(htmlContent, {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li'],
        ALLOWED_ATTR: []  // No attributes allowed
      }) 
    }} 
  />
);
```

### URL-based XSS

```jsx
// VULNERABLE - href with user input
<a href={user.website}>Visit</a>
// Attacker: javascript:alert(document.cookie)

// SECURE - Validate URL scheme
const safeUrl = (url) => {
  try {
    const parsed = new URL(url);
    if (['http:', 'https:'].includes(parsed.protocol)) {
      return url;
    }
  } catch {}
  return '#';  // Invalid URL
};

<a href={safeUrl(user.website)}>Visit</a>
```

### Props Spreading

```jsx
// VULNERABLE - Spreading user-controlled props
const Component = (props) => (
  <div {...props}>Content</div>
);
// Attacker could pass: { dangerouslySetInnerHTML: { __html: '<script>...' } }

// SECURE - Whitelist allowed props
const Component = (props) => {
  const { className, id, style, children, ...rest } = props;
  // Don't spread ...rest
  return <div className={className} id={id} style={style}>{children}</div>;
};
```

---

## State Management Security

### Sensitive Data in State

```jsx
// VULNERABLE - Storing secrets in React state
const [apiKey, setApiKey] = useState(import.meta.env.VITE_API_SECRET);
// State is visible in React DevTools!

// VULNERABLE - Storing sensitive user data
const [user, setUser] = useState({
  id: 1,
  email: 'user@example.com',
  ssn: '123-45-6789',  // Why is this in frontend state?
  creditCard: '4111...',  // Should never be here
});

// SECURE - Only store what's needed for UI
const [user, setUser] = useState({
  id: 1,
  email: 'user@example.com',
  displayName: 'John Doe',
});
```

### Redux DevTools in Production

```javascript
// store.js
import { configureStore } from '@reduxjs/toolkit';

const store = configureStore({
  reducer: rootReducer,
  // SECURE - Disable DevTools in production
  devTools: import.meta.env.DEV,
});
```

---

## API Communication Security

### Secure Fetch Patterns

```javascript
// VULNERABLE - Credentials sent everywhere
fetch(url, { credentials: 'include' });  // Cookies sent to any URL

// SECURE - Only send credentials to your API
const apiClient = {
  fetch: async (endpoint, options = {}) => {
    const url = `${import.meta.env.VITE_API_URL}${endpoint}`;
    
    return fetch(url, {
      ...options,
      credentials: 'include',  // Only to our API
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  }
};

// SECURE - Don't include credentials for third-party APIs
fetch('https://third-party-api.com/data', {
  credentials: 'omit',  // No cookies
});
```

### CSRF Protection

```javascript
// If your API requires CSRF tokens
const apiClient = {
  csrfToken: null,
  
  async getCsrfToken() {
    if (!this.csrfToken) {
      const res = await fetch('/api/csrf-token', { credentials: 'include' });
      const data = await res.json();
      this.csrfToken = data.token;
    }
    return this.csrfToken;
  },
  
  async post(endpoint, body) {
    const token = await this.getCsrfToken();
    
    return fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
      },
      body: JSON.stringify(body),
    });
  }
};
```

---

## Authentication Patterns

### Token Storage

```javascript
// VULNERABLE - Storing tokens in localStorage
localStorage.setItem('token', jwt);  // XSS can steal this!

// VULNERABLE - Storing in React state (lost on refresh, visible in DevTools)
const [token, setToken] = useState(jwt);

// SECURE - Let backend manage tokens in httpOnly cookies
// Frontend just makes requests, cookies sent automatically
const login = async (credentials) => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',  // Receive httpOnly cookie
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  
  if (res.ok) {
    // Don't store token - cookie is handled by browser
    // Just update UI state
    setIsAuthenticated(true);
  }
};

// Protected API calls - cookies sent automatically
const getProfile = async () => {
  const res = await fetch('/api/user/profile', {
    credentials: 'include',  // Cookie sent automatically
  });
  return res.json();
};
```

### When httpOnly Cookies Aren't Available

httpOnly cookies need your API reachable on the same registrable domain as your frontend, or a subdomain sharing one, so the browser will actually attach them. A static SPA calling a genuinely cross-origin third-party API — a different registrable domain, no shared parent, no workable `SameSite=None; Secure` relationship — often cannot use cookie-based auth at all.

If that is your real constraint, the least-bad fallback is a short-lived access token held only in memory (a module-level variable, never `localStorage`/`sessionStorage`), paired with refresh-token rotation. This is a trade-off, not a safe alternative, and it comes with obligations:

- **XSS becomes token theft.** A script injected into the page can read an in-memory token as easily as it could read `localStorage`. This does not make in-memory storage safe; it makes it the least-bad option when cookies are off the table.
- **Short expiry is mandatory**, not optional: minutes, not hours, so a stolen access token has a small blast radius.
- **Refresh-token rotation is mandatory**: each refresh issues a new refresh token and invalidates the old one, so a replayed stolen refresh token is detectable and revocable.

httpOnly cookies remain the default recommendation above. Reach for this only when the cross-origin constraint is real, never because cookies are inconvenient to configure.

### Auth State Management

```javascript
// SECURE - Auth context with httpOnly cookie backend
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const userData = await res.json();
          setUser(userData);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    
    checkAuth();
  }, []);
  
  const login = async (credentials) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    
    if (res.ok) {
      const userData = await res.json();
      setUser(userData);
      return { success: true };
    }
    
    return { success: false, error: 'Invalid credentials' };
  };
  
  const logout = async () => {
    await fetch('/api/auth/logout', { 
      method: 'POST', 
      credentials: 'include' 
    });
    setUser(null);
  };
  
  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
```

---

## Component Security

### Route Protection

```jsx
// SECURE - Protected route component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (!user) {
    // Redirect to login, preserve intended destination
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return children;
};

// Usage
<Routes>
  <Route path="/login" element={<Login />} />
  <Route 
    path="/dashboard" 
    element={
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    } 
  />
</Routes>
```

### Role-Based Access

```jsx
// SECURE - Role-based component
const RequireRole = ({ roles, children }) => {
  const { user } = useAuth();
  
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }
  
  return children;
};

// Usage
<Route 
  path="/admin" 
  element={
    <ProtectedRoute>
      <RequireRole roles={['admin', 'superadmin']}>
        <AdminPanel />
      </RequireRole>
    </ProtectedRoute>
  } 
/>

// IMPORTANT: Role checks MUST also be enforced server-side!
// Frontend role checks are for UX, not security
```

---

## Third-Party Dependencies

### Vite's Dependency Pre-bundling

```javascript
// vite.config.js
export default defineConfig({
  optimizeDeps: {
    // Exclude packages you want to inspect
    exclude: ['some-suspicious-package'],
  },
  build: {
    // Review what's bundled
    rollupOptions: {
      output: {
        manualChunks: {
          // Isolate vendor code for easier auditing
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
});
```

### Security Auditing

```bash
# Check for vulnerabilities
npm audit

# Use Snyk for deeper analysis
npx snyk test

# Review bundle contents
npx vite-bundle-visualizer
```

---

## PostMessage Security

```jsx
// VULNERABLE - No origin check
useEffect(() => {
  const handler = (event) => {
    // Processing any message!
    handleData(event.data);
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}, []);

// SECURE - Strict origin validation
useEffect(() => {
  const ALLOWED_ORIGINS = ['https://parent-app.com'];
  
  const handler = (event) => {
    if (!ALLOWED_ORIGINS.includes(event.origin)) {
      return;  // Ignore unknown origins
    }
    
    // Validate message structure
    if (typeof event.data !== 'object' || !event.data.type) {
      return;
    }
    
    // Handle known message types only
    switch (event.data.type) {
      case 'THEME_CHANGE':
        setTheme(event.data.theme);
        break;
      // ... other handlers
    }
  };
  
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}, []);
```

---

## Build Security

### Content Security Policy

```html
<!-- index.html -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.yourservice.com;
  font-src 'self';
">
```

The `<meta http-equiv="Content-Security-Policy">` tag cannot carry every directive. W3C CSP Level 3 states this plainly: "The `Content-Security-Policy-Report-Only` header is not supported inside a `meta` element. Neither are the `report-uri`, `frame-ancestors`, and `sandbox` directives" ([W3C CSP Level 3 §3.3](https://w3c.github.io/webappsec-csp/)); MDN documents a fourth ignored directive, `report-to` ([MDN: CSP `frame-ancestors`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors)). The full set silently ignored in `<meta>` delivery is `frame-ancestors`, `sandbox`, `report-uri`, `report-to`, and the entire `Content-Security-Policy-Report-Only` header. Practically: a meta-tag CSP, however complete otherwise, can deliver neither clickjacking protection (`frame-ancestors`) nor violation reporting (`report-uri`/`report-to`/report-only mode) — a project relying on meta delivery alone has neither.

`frame-ancestors` only works as a real HTTP response header, set by your server or CDN/edge config, not by Vite or any client code:

```http
Content-Security-Policy: frame-ancestors 'self'
```

If your hosting has no way to set response headers (pure static hosting with no edge config), `X-Frame-Options: DENY` is the older, more widely supported fallback for the same threat, delivered the same way: as a response header, never as a `<meta>` tag.

### Subresource Integrity

`@small-tech/vite-plugin-sri` is no longer maintained: its repository is archived and its last release shipped in 2021, before Vite 4/5 existed. SRI hashes for Vite's content-hashed bundle output still need a build-step plugin (the plugin has to run after Vite decides the final filenames and content), so pick one that is current, such as [`vite-plugin-sri3`](https://github.com/yoyo930021/vite-plugin-sri3):

```bash
npm install --save-dev vite-plugin-sri3
```

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import { sri } from 'vite-plugin-sri3';

export default defineConfig({
  plugins: [
    sri()
  ],
});
```

Vite ships no built-in SRI support: feature request [vitejs/vite#2377](https://github.com/vitejs/vite/issues/2377) has been open since 2021-03-04, and the implementation attempt, [vitejs/vite#22311](https://github.com/vitejs/vite/pull/22311), is unmerged. A plugin is the only route to SRI hashes on a Vite build.

No plugin gets full coverage, and the gap is silent rather than a build error. An `integrity` attribute on a `<script type="module">` covers only that top-level module — not the inner `import` statements it pulls in. Complete coverage needs import-map integrity, which Firefox does not support, so a Vite app with import-mapped modules cannot be fully covered by any plugin today. This under-coverage does not fail the build: `vite-plugin-sri-gen` issue #52 recorded nine chunks loading with no `integrity` attribute at all after a Vite 8 upgrade, discovered only by inspection.

`vite-plugin-sri-gen` (v1.7.4, published 2026-09-03, last commit 2026-09-08, Vite peer `>=4.0.0`, ~35,915 downloads/month) is worth naming alongside `vite-plugin-sri3`: it is more recently active, though `vite-plugin-sri3` (v2.0.0, 2026-03-14, Vite peer `^3‖^4‖^5‖^6‖^7‖^8`, ~129,344 downloads/month) has the broader declared Vite range and wider adoption. Either is reasonable; `vite-plugin-sri3` remains the primary recommendation above.

---

## React + Vite Security Checklist

### Environment & Build
- [ ] No secrets prefixed with `VITE_`
- [ ] Source maps disabled in production
- [ ] Build output reviewed for sensitive data
- [ ] Dependencies audited regularly

### XSS Prevention
- [ ] No `dangerouslySetInnerHTML` with unsanitized content
- [ ] URLs validated before use in `href`/`src`
- [ ] No spreading of user-controlled props
- [ ] User input never used in `eval()` or `new Function()`

### Authentication
- [ ] Tokens stored in httpOnly cookies (not localStorage)
- [ ] Auth checks performed server-side (frontend is UX only)
- [ ] CSRF tokens used for state-changing requests
- [ ] Session validated on sensitive operations

### State Management
- [ ] No secrets in React state
- [ ] Redux DevTools disabled in production
- [ ] Sensitive user data minimized in frontend state

### Component Security
- [ ] Protected routes implemented
- [ ] Role checks enforced server-side
- [ ] Third-party components audited
- [ ] PostMessage validated strictly
