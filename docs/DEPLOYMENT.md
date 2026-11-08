# Deployment

DisputeMate runs on Vercel with Supabase for the database, auth and file storage.

## Environments

| Environment | Where | Trigger |
|---|---|---|
| Local | `npm run dev` | Developer machine, `.env.local` |
| Preview | Vercel preview URL | Any push to a non-production branch or PR |
| Production | Vercel production URL | Push or merge to `main` |

## 1. Supabase

1. Create a project at supabase.com (region: Singapore, `ap-southeast-1`).
2. Apply the schema: run each file in `supabase/migrations/` in the SQL editor, in filename order. Or with the CLI:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
3. Under **Project Settings > API**, copy the project URL, the anon (publishable) key and the service role (secret) key.
4. Under **Authentication > URL Configuration**, set the Site URL to the Vercel production URL and add `https://*.vercel.app/**` and `http://localhost:3000/**` as redirect URLs.
5. Optional: under **Authentication > Providers > Email**, turn off "Confirm email" for frictionless demos.
6. Run `npm run seed` locally (with `.env.local` pointing at this project) to create the demo accounts.

Using a separate Supabase project for previews is recommended once real testers are involved. For the class demo one project is fine.

## 2. Vercel

1. Import the GitHub repo in Vercel (framework preset: Next.js, defaults are correct).
2. Add environment variables (**Settings > Environment Variables**):

   | Variable | Production | Preview | Development | Notes |
   |---|---|---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ✓ | ✓ | Public |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | ✓ | ✓ | Public, RLS protected |
   | `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ | ✓ | **Sensitive**, server only |
   | `ANTHROPIC_API_KEY` | ✓ | ✓ | optional | **Sensitive**, enables AI |
   | `NEXT_PUBLIC_SITE_URL` | ✓ | | | Production URL, for auth emails |

   Never set `DEMO_PASSWORD` in Vercel.
3. Redeploy after changing variables (Deployments > ... > Redeploy).
4. Production branch is `main` (Settings > Git). Every other branch and PR gets a preview deployment automatically.

With the Vercel CLI instead:

```bash
npm i -g vercel
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production   # repeat per variable and environment
vercel --prod
```

## 3. Verify

- `GET /api/health` returns `{ ok: true, supabaseConfigured: true, serviceRoleConfigured: true, aiConfigured: ... }`. It reports only whether values exist, never the values.
- `/` shows "Sign in" (not "Finish setup").
- Sign in as each demo role and run the four PRD scenarios from the README.
- Upload an evidence file and confirm it opens from the reviewer screen (checks Storage).

## Notes and limits

- Evidence uploads are capped at 4 MB because Vercel functions accept request bodies up to 4.5 MB.
- AI calls run inside server actions. If summaries time out on the Hobby plan, they fall back to the deterministic template automatically.
- Files never touch the Vercel filesystem; they go straight to the private Supabase `evidence` bucket.
- Errors are logged with `console.error` and visible in Vercel's runtime logs. Users see a friendly error page with a reference.
