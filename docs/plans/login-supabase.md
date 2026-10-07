# Plan: login and roles with Supabase

**Status:** In progress (phases 0-2 landed; `AUTH_MODE` still `off` until backend is redeployed and migration verified live)
**Decisions made:** three roles (staff, storekeeper, admin) · open sign-up with admin approval · email + password login

Read [../architecture.md](../architecture.md) first. The key fact: the Google Sheet is only reachable through the Apps Script web app, and that URL is public. **A login screen in React alone protects nothing.** The Apps Script backend must check who is calling on every request. Most of this plan is about making that check work within Apps Script's limits.

## Handoff: what the owner must do next

All the code for phases 0-2 is written and committed to this repo. The remaining steps need a human with Supabase and Vercel dashboard access &mdash; an agent working in this repo cannot do them.

1. **Run the migration.** Supabase dashboard → **SQL Editor** → paste all of [../../supabase/migrations/0001_auth_profiles.sql](../../supabase/migrations/0001_auth_profiles.sql) → **Run**.
2. **Redeploy the backend.** Paste the current [../../backend/stock.gs](../../backend/stock.gs) into the Apps Script project bound to the Google Sheet → **Deploy → Manage deployments** → edit (pencil) the existing deployment → **New version** → **Deploy**. This keeps the `/exec` URL unchanged. Skipping this step is why `getStock` currently fails with a CORS error locally: the live script predates the `getStock`/`getUsageHistory` handlers.
3. **Set Apps Script Script Properties** (same project → ⚙️ Project Settings → Script Properties): `AUTH_MODE=off`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (same public values as `.env.local`, not secrets).
4. **Create the first admin.** Sign up once through the app (no email confirmation needed with it off), then in the Supabase SQL Editor: `update public.profiles set role = 'admin', status = 'active', approved_at = now() where email = '<you@example.com>';`
5. **Vercel env vars.** Project Settings → Environment Variables → add `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and update `VITE_API_URL` if it changed → redeploy.
6. **Supabase Auth → URL Configuration.** Set **Site URL** to the production Vercel domain, and add it (plus the Vercel preview pattern) to **Redirect URLs**. Needed for email confirmation links to land back on the right domain.

Only after all of the above is verified working locally should `AUTH_MODE` move to `log` (phase 3), and only after that is clean for a few days should it move to `enforce` (phase 4). Don't jump straight to `enforce` before a demo.

## Goals

1. Only approved users can read or change stock data.
2. What a user can do depends on their role.
3. Anyone can sign up, but a new account can do nothing until an admin approves it and picks a role.
4. Every usage and restock record says which account made it.

Out of scope: moving data from Google Sheets into Supabase. Supabase is used for **auth and user profiles only**; the Sheet stays the source of truth for stock.

## Roles and permissions

Account status: `pending` (new sign-up) → `active` (approved) or `disabled` (blocked). Only `active` accounts have a role that matters.

| Capability | pending / disabled | staff | storekeeper | admin |
| --- | --- | --- | --- | --- |
| See stock, materials, usage history | – | ✓ | ✓ | ✓ |
| Record material usage (`#usage`) | – | ✓ | ✓ | ✓ |
| Restock (`#restock`) | – | – | – | ✓ |
| Telegram sender (`#telegram`) | – | – | – | ✓ |
| Approve users, change roles, disable accounts (`#users`) | – | – | – | ✓ |

Roles are ordered, so "at least storekeeper" is a simple comparison. Postgres enums compare in declaration order, so declaring `('staff', 'storekeeper', 'admin')` makes `role >= 'storekeeper'` valid in SQL. Mirror the same order in JS (`ROLE_RANK`) and Apps Script.

## Architecture after the change

```
Browser ──(1) sign in / sign up──▶ Supabase Auth
   │         ◀── session (access token, refreshed automatically)
   │
   └──(2) POST form: action, ..., access_token ──▶ Apps Script
                                                     │ (3) POST /rest/v1/rpc/get_my_access
                                                     │     Authorization: Bearer <access_token>
                                                     │     ◀── { role, status, full_name, email } or 401
                                                     │ (4) check role for this action
                                                     └──▶ Google Sheet / Telegram
```

### Why the token travels as a form field

Apps Script web apps do not answer CORS preflight requests. Adding an `Authorization` header from the browser triggers a preflight and the request fails. So the token goes in the request **body** as `access_token`, keeping it a "simple" request.

To keep tokens out of URLs (and out of Google's request logs and browser history), **all calls become POST**, including reads. Reads send `action=getStock` etc. as form fields. `doGet` stays only as a temporary fallback during rollout.

### How Apps Script checks the token

Apps Script can't verify Supabase's asymmetric (ES256) JWT signatures itself. It asks Supabase instead, in a single request:

```
POST {SUPABASE_URL}/rest/v1/rpc/get_my_access
apikey: {SUPABASE_PUBLISHABLE_KEY}
Authorization: Bearer {access_token}
```

- PostgREST rejects an invalid or expired token with `401`, which the script treats as "not logged in".
- A valid token returns the caller's own profile row: the RPC filters on `auth.uid()`.
- The result is cached in `CacheService` for 5 minutes, keyed by a SHA-256 hash of the token (cache keys max out at 250 characters). A burst of requests then costs one lookup.
- Revoking access takes effect within the cache window, at most 5 minutes. Access tokens also expire (default 1 hour).

Alternatives considered:

- **Calling `GET /auth/v1/user`.** It validates the token but doesn't return the role, so a second call would be needed.
- **Verifying the JWT in Apps Script with the legacy HS256 secret.** It needs the project's shared JWT secret in Apps Script, and Supabase is moving projects to asymmetric keys.
- **A Supabase Edge Function proxy in front of Apps Script.** It's cleaner, but adds a service to deploy and maintain. Revisit if Apps Script latency becomes a problem.

## Supabase setup

### Dashboard configuration

1. Create the project. Copy the **Project URL** and the **publishable key** (formerly the "anon" key). Both are safe to expose. Never use the secret / `service_role` key in the frontend or in Apps Script; nothing in this plan needs it.
2. **Authentication → Providers → Email:** enabled, **Confirm email: off**. The free-tier built-in email sender is rate-limited (a few emails/hour) and meant for testing only; admin approval in `#users` is the real access gate, so email verification isn't needed. Revisit (turn it on, with Custom SMTP) before onboarding real users at volume.
3. **Authentication → URL Configuration:**
   - Site URL: the production Vercel URL.
   - Redirect URLs: `http://localhost:5173/**`, `https://<production-domain>/**`, and the Vercel preview pattern (`https://*-<team>.vercel.app/**`) if previews should work.
4. **Custom SMTP** before real users sign up. The built-in email sender is rate-limited and meant for testing only.

### Database migration

Commit it as `supabase/migrations/0001_auth_profiles.sql` and run it in the SQL editor (or with the Supabase CLI).

```sql
create type public.app_role as enum ('staff', 'storekeeper', 'admin');   -- order matters
create type public.account_status as enum ('pending', 'active', 'disabled');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        public.app_role not null default 'staff',
  status      public.account_status not null default 'pending',
  created_at  timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users (id)
);

alter table public.profiles enable row level security;

-- New sign-ups get a pending profile automatically.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper used by policies; security definer avoids RLS recursion on profiles.
create function public.is_active_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and status = 'active' and role = 'admin'
  );
$$;

-- Read: yourself, or everyone if you are an admin.
create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "admins read all profiles" on public.profiles
  for select to authenticated using (public.is_active_admin());

-- Update: users may change only their own full_name. Role/status only via admin RPC below.
revoke update on public.profiles from authenticated, anon;
grant update (full_name) on public.profiles to authenticated;
create policy "update own name" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- No insert/delete policies: clients cannot create or remove profiles.

-- What Apps Script calls to identify the caller.
create function public.get_my_access()
returns table (id uuid, email text, full_name text, role public.app_role, status public.account_status)
language sql stable security invoker set search_path = '' as $$
  select id, email, full_name, role, status from public.profiles where id = (select auth.uid());
$$;

-- Admin action: approve / change role / disable.
create function public.admin_set_access(target uuid, new_role public.app_role, new_status public.account_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_admin() then
    raise exception 'forbidden';
  end if;
  if target = (select auth.uid()) and (new_role <> 'admin' or new_status <> 'active') then
    raise exception 'admins cannot demote or disable themselves';
  end if;
  update public.profiles
     set role = new_role,
         status = new_status,
         approved_at = case when new_status = 'active' and approved_at is null then now() else approved_at end,
         approved_by = case when new_status = 'active' and approved_by is null then (select auth.uid()) else approved_by end
   where id = target;
end;
$$;

revoke execute on function public.admin_set_access(uuid, public.app_role, public.account_status) from anon;
revoke execute on function public.get_my_access() from anon;
```

**First admin (bootstrap).** Sign up normally, then run in the SQL editor:

```sql
update public.profiles set role = 'admin', status = 'active', approved_at = now() where email = '<you@example.com>';
```

## Frontend changes

New dependency: `@supabase/supabase-js`.

New env vars (both public-safe; add them to `.env.example`, `.env.local`, Vercel, and the GitHub Actions workflow):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

| File | Change |
| --- | --- |
| `src/lib/supabase.js` | `createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })` |
| `src/auth/AuthProvider.jsx` | Context holding `session` and `profile`. Subscribes to `onAuthStateChange`; loads the profile with `rpc('get_my_access')`. Exposes `signIn`, `signUp`, `signOut`, `sendPasswordReset`, `updatePassword`, `refreshProfile`. |
| `src/auth/useAuth.js` | The hook, in its own file: the `react-refresh/only-export-components` lint rule rejects a file exporting both a component and a hook. |
| `src/auth/permissions.js` | `ROLE_RANK`, `hasRole(profile, minRole)`, and each page's minimum role. Single source for menu filtering. |
| `src/pages/auth/*` | `LoginPage`, `SignUpPage` (full name, email, password), `ForgotPasswordPage`, `ResetPasswordPage`, `PendingApprovalPage` (also covers `disabled`). Malay UI text, same Tailwind styling and `theme` prop as other pages. |
| `src/pages/UsersPage.jsx` | Admin page `#users`. Pending sign-ups first, then all users. Approve with a role, change role, disable, re-enable, all through `rpc('admin_set_access', ...)`. |
| `src/App.jsx` | Gate before the page shell: loading → spinner; no session → auth pages; `pending`/`disabled` → `PendingApprovalPage`; `active` → current app with `PAGES` filtered by role. Add the user's name and role plus a **Log keluar** button to the header menu. If the hash names a page the role can't open, fall back to the first allowed page. |
| `src/api.js` | All calls become `apiPost({ action, ... })`. Before each call, read the token with `supabase.auth.getSession()` (it refreshes when needed) and append `access_token`. If the reply starts with `Error: AUTH_REQUIRED`, refresh once and retry, then sign out. |
| `src/pages/UsagePage.jsx` | Pre-fill **Nama Pemohon** from `profile.full_name`. Keep it editable, since staff sometimes request for someone else. |
| `public/sw.js` | Bump cache names. Never cache POST requests or Supabase requests. On logout, the app posts a message telling the service worker to clear `RUNTIME_CACHE`, so a shared device doesn't keep the previous user's data. |

**Why PKCE matters here:** the app routes with `#hash`. Supabase's default implicit flow returns tokens in the URL hash (`#access_token=...`), which would collide with page routing. With `flowType: 'pkce'`, email confirmation and password-reset links come back as `?code=...` instead. The catch is that a reset link must be opened in the same browser that requested it, so the Forgot password page should say so.

Auth flows:

- **Sign up:** `signUp({ email, password, options: { data: { full_name }, emailRedirectTo: <site url> } })`. With Confirm email off, `signUp` returns a session immediately and the user lands straight on the pending screen; if Confirm email is ever turned back on, the screen falls back to "Semak emel untuk pengesahan" until they confirm and log in.
- **Password reset:** `resetPasswordForEmail(email, { redirectTo })` → user opens the link → the `PASSWORD_RECOVERY` auth event shows `ResetPasswordPage` → `updateUser({ password })`.
- **Pending screen:** a "Semak semula" button calls `refreshProfile()`, so an approved user gets in without logging out.

Frontend role checks are only for UX (hiding menu items). **Enforcement lives in Apps Script (Sheet data) and RLS (profiles).**

## Apps Script changes (`backend/stock.gs`)

New Script Properties: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `AUTH_MODE` (`off` | `log` | `enforce`).

1. **One router.** `doPost` reads `action` (falling back to the legacy `type` for `restock` / `telegram`, and to "usage" when neither is set) and dispatches to handler functions. `doGet` calls the same router during the transition and is removed after enforcement.
2. **Per-action minimum role:**
   ```js
   var ACTION_ROLES = {
     getMaterials: 'staff', getSizesByMaterial: 'staff', getBalanceByMaterial: 'staff',
     getStock: 'staff', getUsageHistory: 'staff', usage: 'staff',
     restock: 'admin',
     telegram: 'admin'
   };
   var ROLE_RANK = { staff: 1, storekeeper: 2, admin: 3 };
   ```
   Storekeeper can still view stock and usage history, but they cannot use the usage form or restock. The write actions remain staff-only and admin-only respectively.
3. **`getCaller(accessToken)`:** cache lookup, then the `get_my_access` call via `UrlFetchApp` with `muteHttpExceptions: true`. Returns `null` for a 401 or an empty result.
4. **Checks.** No caller → `Error: AUTH_REQUIRED`. Caller not `active`, or rank too low → `Error: FORBIDDEN`. In `log` mode, failures are logged with `console.log` but the request still runs. In `off` mode there is no check.
5. **Audit.** Append the caller's email as a **new last column**: `MaterialUsage` G, `Restock` E. Existing column positions don't move, so current reads stay valid. Telegram usage and restock messages include the caller's name.

## Rollout (order matters: never break the live site)

| Phase | Work | Done when |
| --- | --- | --- |
| 0 | Supabase project, dashboard config, migration, first admin | Admin can sign in via Supabase dashboard / SQL shows `active` admin |
| 1 | Backend: router, POST-for-everything, `getCaller`, audit columns. Deploy with `AUTH_MODE=off` | Existing frontend still works unchanged |
| 2 | Frontend: Supabase client, auth pages, gate, role-filtered menu, token on every call, `UsersPage` | Can sign up → approve in `#users` → use pages matching role |
| 3 | Set `AUTH_MODE=log`, deploy frontend, watch Apps Script executions for a few days | No unexpected `AUTH_REQUIRED` / `FORBIDDEN` in logs from real users |
| 4 | Set `AUTH_MODE=enforce`; remove `doGet` data actions | Requests without a valid token are rejected (test with `curl`) |
| 5 | Take down / archive the old MATERIAL-USAGE and RESTOCK sites (they send no token and will stop working at phase 4) | Only SmartEV is live |

## Test checklist

- [ ] Sign up → lands directly on the pending screen (no data loads) since Confirm email is off.
- [ ] Admin approves as staff → user presses "Semak semula" → sees Usage and Stock, but not Restok, Telegram or Pengguna.
- [ ] Staff calling the backend directly with `action=restock` (using their own token) gets `Error: FORBIDDEN`.
- [ ] Storekeeper can view History Usage and Stock, but cannot use the usage form or restock; only admin can restock.
- [ ] A disabled user is locked out within 5 minutes (cache window), even with an unexpired token.
- [ ] `curl` without `access_token` gets `Error: AUTH_REQUIRED` in enforce mode.
- [ ] Password reset works end to end (same browser).
- [ ] Logout on a shared device → next user can't see the previous user's cached data.
- [ ] Admin cannot demote or disable themselves.
- [ ] New usage and restock rows have the caller's email in the new column.
- [ ] `npm run lint` and `npm run build` pass.

## Open questions

- Should staff see **everyone's** usage history, or only their own? The current plan shows everyone's (unchanged). "Own only" means filtering by the new email column in `getUsageHistory`.
- Should admins get a Telegram ping when someone signs up? It could be done with a Supabase Database Webhook on `profiles` insert that calls Apps Script with a shared secret. Not in the first version; admins see a pending count on `#users`.
