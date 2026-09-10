# Supabase Security Reference

Security considerations specific to Supabase applications, with focus on Row Level Security (RLS).

---

## Row Level Security (RLS) - The Foundation

RLS is your primary security control in Supabase. Without it, your database is exposed to anyone with your anon key.

### The Critical Rule

```sql
-- EVERY table with user data MUST have RLS enabled
-- If RLS is disabled, anyone with your anon key can read/write everything!

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
-- ... every single table
```

### What Happens Without RLS

```javascript
// Client-side JavaScript (anon key is PUBLIC)
const { data } = await supabase
  .from('users')
  .select('*');

// Without RLS: Returns ALL users in your database!
// With RLS: Returns only rows matching your policies
```

---

## RLS Policy Patterns

### Basic User Data Isolation

```sql
-- Users can only see and modify their own data
CREATE POLICY "Users can view own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- No INSERT policy = users can't create new user records directly
-- No DELETE policy = users can't delete records
```

### Content Ownership Pattern

```sql
-- Posts table
CREATE POLICY "Anyone can view published posts"
  ON posts FOR SELECT
  USING (published = true);

CREATE POLICY "Authors can view own unpublished posts"
  ON posts FOR SELECT
  USING (auth.uid() = author_id);

CREATE POLICY "Authors can create posts"
  ON posts FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update own posts"
  ON posts FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can delete own posts"
  ON posts FOR DELETE
  USING (auth.uid() = author_id);
```

### Organization/Team Access

```sql
-- Users belong to organizations via org_members table
CREATE POLICY "Users can view org data"
  ON projects FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid()
    )
  );

-- Using a security definer function for complex checks
CREATE OR REPLACE FUNCTION is_org_member(org uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = org AND user_id = auth.uid()
  );
$$;

CREATE POLICY "Org members can view projects"
  ON projects FOR SELECT
  USING (is_org_member(org_id));
```

### Role-Based Access

```sql
-- Check user role from profiles/users table
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE  -- Can be cached
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

-- Admin can view all
CREATE POLICY "Admins can view all"
  ON sensitive_data FOR SELECT
  USING (get_user_role() = 'admin');

-- Moderators can update status
-- WITH CHECK re-tests the role against the proposed new row, never against
-- a diff from the old one — a policy expression has no OLD reference at
-- all, by design (see "Restricting Column Changes" below). It cannot
-- express "only column X changed," so this policy alone does not stop a
-- moderator from also editing `content`.
CREATE POLICY "Moderators can update content status"
  ON posts FOR UPDATE
  USING (get_user_role() IN ('admin', 'moderator'))
  WITH CHECK (
    get_user_role() IN ('admin', 'moderator')  -- Same role check as USING; does not limit which columns change
  );
```

### Restricting Column Changes

A `WITH CHECK` clause is evaluated only against the proposed new contents of
the row, never against the original contents — Postgres's own docs say so
explicitly, and a policy expression has no `OLD` reference available at all.
That is deliberate, not a missing feature: an `OLD` reference for policies
was proposed and rejected on the Postgres mailing list in 2015. Two real
mechanisms exist to restrict which columns change, and they are not
interchangeable:

| Mechanism | Enforces | Row-conditional? |
|---|---|---|
| `GRANT UPDATE (col)` / `REVOKE UPDATE (col)` | which columns may appear in the SET list, per role | **No** — blanket per role |
| `BEFORE UPDATE` row trigger comparing `OLD`/`NEW` | any condition | **Yes** |

**The Supabase-specific trap:** column privileges are scoped to a database
role, and in a typical Supabase project every signed-in user shares the
single `authenticated` role. So `REVOKE UPDATE (role) ON public.profiles
FROM authenticated` blocks *everyone* signed in from changing that column —
moderators and admins included, if they authenticate the same way as anyone
else. Supabase's own docs frame this as Column Level Security and say
plainly that RLS "does not control access to specific columns within those
rows" — column grants are a coarser, role-wide mechanism layered on top of
RLS, not a row-conditional substitute for it.

When the rule is conditional — "a user may edit their own name but not
their own role, but a moderator may edit status" — the trigger is the only
mechanism that can express it, because a trigger function receives both
`OLD` and `NEW` and can reject or silently rewrite the row before it is
written:

```sql
CREATE OR REPLACE FUNCTION prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND get_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins may change role';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_role_column
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_escalation();
```

A trigger can also rewrite instead of rejecting: setting `NEW.role :=
OLD.role;` before `RETURN NEW;` silently freezes the column instead of
raising an error.

---

## Common RLS Mistakes

### Mistake 1: Forgetting to Enable RLS

```sql
-- Table created but RLS not enabled
CREATE TABLE secrets (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users,
  secret_data text
);
-- VULNERABLE! Anyone can query all secrets!

-- SECURE
ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;
```

### Mistake 2: SELECT Without Restriction

```sql
-- VULNERABLE - Allows reading all rows
CREATE POLICY "Allow select"
  ON users FOR SELECT
  USING (true);  -- BAD!

-- SECURE - Restrict to own data
CREATE POLICY "Select own data"
  ON users FOR SELECT
  USING (auth.uid() = id);
```

### Mistake 3: INSERT Without Ownership Check

```sql
-- VULNERABLE - User can insert data as another user
CREATE POLICY "Allow insert"
  ON posts FOR INSERT
  WITH CHECK (true);  -- User can set author_id to anyone!

-- SECURE - Force ownership
CREATE POLICY "Insert own posts"
  ON posts FOR INSERT
  WITH CHECK (auth.uid() = author_id);
```

### Mistake 4: UPDATE Without Restriction

```sql
-- VULNERABLE - Can update with different user_id
CREATE POLICY "Update posts"
  ON posts FOR UPDATE
  USING (auth.uid() = author_id);  -- Only checks current row
  -- No WITH CHECK! Can change author_id to someone else!

-- SECURE - Validate both before AND after
CREATE POLICY "Update own posts"
  ON posts FOR UPDATE
  USING (auth.uid() = author_id)      -- Can only update own posts
  WITH CHECK (auth.uid() = author_id); -- Can't change to different author
```

### Mistake 5: Trusting JWT Claims Blindly

```sql
-- RISKY - Using custom claims without validation
CREATE POLICY "Role from JWT"
  ON admin_data FOR SELECT
  USING (auth.jwt() ->> 'role' = 'admin');
-- If JWT is compromised or custom claims are misconfigured, this fails

-- BETTER - Use database as source of truth
CREATE POLICY "Role from database"
  ON admin_data FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

---

## API Keys: Publishable/Secret vs Legacy Anon/Service Role

Supabase has moved to a publishable/secret key naming scheme. The legacy `anon` and `service_role` keys still work today — they are not removed, only superseded — so treat the two names as aliases for the same pair of keys:

| Current name | Prefix | Replaces (legacy name) |
|---|---|---|
| Publishable key | `sb_publishable_...` | `anon` key |
| Secret key | `sb_secret_...` | `service_role` key |

Supabase's docs target end of 2026 for deprecating the legacy names, but that date is marked TBC (to be confirmed) in both the docs and the announcement thread — do not treat it as fixed, and do not plan a migration around it as a hard deadline.

### Publishable / Anon Key (Public)

```javascript
// This key is PUBLIC - visible in browser JavaScript
// Accept either the legacy env var (NEXT_PUBLIC_SUPABASE_ANON_KEY) or the
// current one (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) — both hold the same
// kind of key today.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  // Public! RLS applies
);

// All queries go through RLS policies
// Safe for client-side code
```

### Secret / Service Role Key (SECRET)

```javascript
// NEVER expose this key! It bypasses ALL RLS!
// Server-side only (API routes, serverless functions)
// Accept either the legacy env var (SUPABASE_SERVICE_ROLE_KEY) or the
// current one (SUPABASE_SECRET_KEY) — both hold the same kind of key today.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY  // Bypasses RLS!
);

// Use only for:
// - Admin operations
// - Background jobs
// - Webhooks
// - Server-side API routes
```

```bash
# VULNERABLE - Exposing the secret key, under either name
# .env.local
NEXT_PUBLIC_SUPABASE_SERVICE_KEY=...  # PREFIX MAKES IT PUBLIC!!!
NEXT_PUBLIC_SUPABASE_SECRET_KEY=...   # SAME MISTAKE, CURRENT NAME!!!

# SECURE - No public prefix, either name
SUPABASE_SECRET_KEY=...          # Only available server-side
SUPABASE_SERVICE_ROLE_KEY=...    # Legacy name, same rule applies
```

---

## Storage Security

### Storage RLS Policies

```sql
-- Storage buckets also need RLS!
-- In Supabase Dashboard: Storage > Policies

-- Users can upload to their own folder
CREATE POLICY "Users can upload own files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can view their own files
CREATE POLICY "Users can view own files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Public bucket (anyone can view)
CREATE POLICY "Public read access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'public-images');
```

### File Upload Validation

```javascript
// Client-side validation is not enough!

// VULNERABLE - No server validation
const { error } = await supabase.storage
  .from('documents')
  .upload(filename, file);

// SECURE - Validate on server or use storage policies
// Storage policies can check:
// - Bucket
// - File path (folder structure)
// - User ID from auth

// For file type/size validation, use Edge Functions:
// Handle upload via Edge Function, validate, then store
```

---

## Edge Functions Security

### Auth in Edge Functions

```typescript
// supabase/functions/my-function/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export default {
  fetch: async (req: Request) => {
    // Get auth token from request
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Create client with user's JWT
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify the JWT and get user
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Now queries will be scoped to this user via RLS
    const { data } = await supabase
      .from('posts')
      .select('*');  // Only returns user's posts per RLS

    return new Response(JSON.stringify(data));
  },
};
```

This is the current Supabase quickstart shape: a default-exported object with
a `fetch` handler, not `serve(...)`. The `deno.land/std@0.168.0` import that
used to sit here is formally deprecated — `std@0.224.0` marks `serve` as
`@deprecated: This will be removed in 1.0.0. Use Deno.serve instead`, and the
older pin above simply predates that annotation, which is why it looked
harmless. `Deno.serve` itself still runs fine and is not wrong either, but it
is also not the current recommended shape — both have been superseded by the
`fetch`-export style shown above, which Supabase's own quickstart pairs with
the `@supabase/server` npm package's `withSupabase` helper for auth. Nothing
here is a breaking change: existing functions using `serve()` or `Deno.serve`
keep working exactly as before. For imports generally, Supabase's docs list
npm packages first as "recommended," with `jsr:`, `node:` and `deno.land/x`
named as supported alternatives — none of those three are called out as
discouraged. The runtime targets `deno_version = 2`.

### When to Use Service Role in Functions

```typescript
// Only use service role for operations that SHOULD bypass RLS
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // Only in server!
);

// Use for:
// - Sending emails (accessing all users)
// - Admin operations
// - Cron jobs
// - Webhook handlers (e.g., Stripe webhooks)

// Always validate the request first!
const signature = req.headers.get('stripe-signature');
if (!verifyStripeWebhook(await req.text(), signature)) {
  return new Response('Invalid signature', { status: 400 });
}
```

---

## Authentication Security

### Auth Configuration

```javascript
// Secure auth settings in supabase dashboard:
// 1. Site URL - set to your actual domain
// 2. Redirect URLs - whitelist exact URLs only
// 3. JWT expiry - keep short (e.g., 1 hour)
// 4. Enable email confirmation
// 5. Configure rate limits

// Client-side auth
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'securepassword123',
  options: {
    emailRedirectTo: 'https://yourapp.com/auth/callback',  // Must be whitelisted!
  },
});
```

### OAuth Security

```javascript
// Secure OAuth setup
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: 'https://yourapp.com/auth/callback',  // Whitelisted
    scopes: 'email profile',  // Minimal scopes
  },
});

// In your callback handler - validate the session
export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  
  if (code) {
    const supabase = createClient(...);
    
    // Exchange code for session
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (error) {
      return NextResponse.redirect('/auth/error');
    }
  }
  
  return NextResponse.redirect('/dashboard');
}
```

---

## Database Functions (RPC) Security

### SECURITY DEFINER vs SECURITY INVOKER

```sql
-- SECURITY INVOKER (default) - Runs with caller's permissions
-- RLS policies apply
CREATE FUNCTION get_my_posts()
RETURNS SETOF posts
LANGUAGE sql
SECURITY INVOKER  -- RLS applies, safe
AS $$
  SELECT * FROM posts WHERE author_id = auth.uid();
$$;

-- SECURITY DEFINER - Runs with function owner's permissions
-- BYPASSES RLS! Use carefully!
CREATE FUNCTION admin_get_all_posts()
RETURNS SETOF posts
LANGUAGE sql
SECURITY DEFINER  -- Bypasses RLS!
SET search_path = public  -- Prevent search path injection
AS $$
  -- Add your own auth checks!
  SELECT * FROM posts;
$$;

-- If using SECURITY DEFINER, always add explicit auth:
CREATE FUNCTION get_org_members(org_id uuid)
RETURNS SETOF profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Manual auth check since RLS is bypassed
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.org_id = $1
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  RETURN QUERY
  SELECT p.* FROM profiles p
  JOIN org_members om ON p.id = om.user_id
  WHERE om.org_id = $1;
END;
$$;
```

### Exposing Functions via RPC

```javascript
// Functions are callable via RPC
const { data } = await supabase.rpc('get_my_posts');

// VULNERABLE if function doesn't check auth
// SECURE if using SECURITY INVOKER with RLS, or explicit checks
```

---

## Real-time Security

### Realtime RLS

```sql
-- Realtime also respects RLS policies
-- But you need SELECT policies for subscriptions to work

CREATE POLICY "Users can subscribe to own messages"
  ON messages FOR SELECT
  USING (
    sender_id = auth.uid() OR
    recipient_id = auth.uid()
  );
```

### Broadcast Security

```javascript
// Realtime Broadcast - be careful what you broadcast
const channel = supabase.channel('public-room');

// Sending sensitive data in broadcast = visible to all subscribers!
channel.send({
  type: 'broadcast',
  event: 'message',
  payload: { 
    message: 'Hello',
    // Don't include: { userId: '...', email: '...', secret: '...' }
  },
});
```

---

## Multi-tenant Patterns

### Tenant Isolation

```sql
-- Each table has tenant_id
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text,
  created_at timestamp DEFAULT now()
);

-- RLS ensures tenant isolation
CREATE POLICY "Tenant isolation"
  ON projects FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid()
    )
  );

-- Helper function for DRY policies
CREATE OR REPLACE FUNCTION user_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
$$;

CREATE POLICY "Tenant isolation v2"
  ON projects FOR ALL
  USING (tenant_id IN (SELECT user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT user_tenant_ids()));
```

<!--
DISABLED 2026-09-09 — this section is wrong and is preserved only for future repair.

The recipe below sets a JWT claim but never assumes a role, so RLS is never enforced
when it runs as table owner or superuser in the SQL editor. It passes regardless of
whether the policy under test is correct. Do not re-enable it without adding role
assumption (SET LOCAL role authenticated) and a negative case that must fail.

--- ORIGINAL CONTENT BELOW ---

---

## Testing RLS Policies

### Policy Testing Script

```sql
-- Test as specific user
SET request.jwt.claim.sub = 'user-uuid-here';
SET request.jwt.claims = '{"sub": "user-uuid-here"}';

-- Now test queries
SELECT * FROM posts;  -- Should only return this user's posts

-- Test INSERT
INSERT INTO posts (author_id, title)
VALUES ('different-user-uuid', 'Test');  -- Should fail!

-- Reset
RESET request.jwt.claim.sub;
RESET request.jwt.claims;
```

### Automated Policy Tests

```typescript
// Use service role to set up test data
// Then use anon client to verify policies

describe('RLS Policies', () => {
  it('users can only see their own posts', async () => {
    // Create users and posts with service role
    const { data: user1 } = await adminClient.auth.admin.createUser({...});
    const { data: user2 } = await adminClient.auth.admin.createUser({...});
    
    await adminClient.from('posts').insert([
      { author_id: user1.id, title: 'User 1 Post' },
      { author_id: user2.id, title: 'User 2 Post' },
    ]);
    
    // Query as user1
    const user1Client = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${user1Token}` } }
    });
    
    const { data } = await user1Client.from('posts').select('*');
    
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('User 1 Post');
  });
});
```
-->

---

## Supabase Security Checklist

### RLS (Critical)
- [ ] RLS enabled on EVERY table with user data
- [ ] SELECT policies restrict data to authorized users
- [ ] INSERT policies validate ownership/tenant
- [ ] UPDATE policies use USING and WITH CHECK
- [ ] DELETE policies restricted appropriately
- [ ] No `USING (true)` on sensitive tables

### Keys & Auth
- [ ] Secret key (or legacy service_role key) NEVER in client/public code
- [ ] Publishable key (or legacy anon key) only for client-side
- [ ] Secret key (or legacy service_role key) only for server-side/webhooks
- [ ] JWT expiry configured appropriately
- [ ] Email confirmation enabled
- [ ] OAuth redirect URLs whitelisted

### Storage
- [ ] Storage RLS policies configured
- [ ] File paths include user ID for isolation
- [ ] Public buckets only for truly public files
- [ ] File type validation in Edge Functions

### Functions
- [ ] SECURITY INVOKER preferred (RLS applies)
- [ ] SECURITY DEFINER has explicit auth checks
- [ ] `SET search_path = public` on all functions
- [ ] RPC functions validate inputs

### Real-time
- [ ] SELECT policies cover realtime subscriptions
- [ ] Broadcast doesn't leak sensitive data
- [ ] Channel access controlled appropriately
