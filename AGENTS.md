<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- The game (3D engine, characters, menus) lives in `src/game/` as framework-free TypeScript that drives the DOM rendered by `src/routes/index.tsx`; `initApp()` is loaded with a dynamic import after hydration because the engine needs WebGL and the browser.
- Keep React from re-rendering the game markup with changing props: `src/game/app.ts` toggles classes and injects lists directly, and a React diff would undo that.
- Game rules that affect coins, records and unlocks run in database functions bound to `auth.uid()` (`start_run`, `finish_run`, `buy_skin`, `select_skin`, `redeem_code`); clients have read-only access to their own profile so they cannot edit coins or records directly.
- Redeem codes live only in the `redeem_codes` table (no client access) so they never ship in the browser bundle.
- Accounts are nickname-only: the auth email is derived from the nickname in `src/lib/player-account.ts`, and accounts are created confirmed by the `registerPlayer` server function. Never change that derivation without migrating existing accounts.
- Admin panel actions are server functions checked against the `ADMIN_PASSWORD` secret; admin-only database functions are executable only by the service role.
- Tailwind is loaded without its base reset (preflight) because the game stylesheet relies on browser defaults; game CSS variables use a `--g-` prefix to avoid clashing with theme tokens.
