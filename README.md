# Đêm Trăng Đỏ — Ma Sói Online (MVP starter)

A Vietnamese-language React/Vite starter with a dark fantasy UI, room lobby, role assignment and an early local game-flow prototype.

## Important: what works and what does not

- **Works locally as a UI prototype:** create a local room, display players already in that browser session, assign sample roles, basic night/day controls.
- **Not production-ready multiplayer:** the included Supabase Broadcast wiring is a scaffold, not a secure authoritative room system. Room creation/joining does not yet persist player records or reliably synchronize state across browsers.
- **Microphone:** the button requests browser microphone permission and can mute the local track. It does **not** send audio to other players.
- **Game rules:** the sample resolver is deliberately incomplete. Potion limits, simultaneous actions, Hunter death trigger, role privacy, ties, reconnects and anti-cheat are not production-complete.
- Do not use this build for a real online game until server-side room/game logic and WebRTC audio are implemented and tested.

## Run the UI locally

1. Install Node.js LTS.
2. Extract this folder.
3. In the folder, run:
   ```bash
   npm install
   npm run dev
   ```
4. Open the local URL printed by Vite.

## Enable Supabase credentials (scaffold only)

1. Create a project at [Supabase](https://supabase.com/).
2. In Project Connect settings, copy the project URL and publishable key.
3. Copy `.env.example` to `.env.local`.
4. Fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Restart `npm run dev`.

Never put a `service_role` or secret key in browser code. The current scaffold still needs proper database tables, server-authoritative game actions, room membership checks, and Realtime authorization before using it with real players. See [Supabase Realtime](https://supabase.com/docs/guides/realtime).

## Deploy the frontend

1. Push the project to a Git provider.
2. Import it into [Vercel](https://vercel.com/).
3. Set the build command to `npm run build` and output directory to `dist`.
4. Add the same `VITE_SUPABASE_URL` and publishable key environment variables in the hosting project.
5. Deploy.

Hosting the frontend alone does not provide multiplayer or audio. Mic access generally requires HTTPS. For voice, implement WebRTC peer connections plus signaling and STUN/TURN configuration; see [WebRTC peer connections](https://webrtc.org/getting-started/peer-connections).

## Recommended production architecture

- **Frontend:** React + Vite, hosted on Vercel.
- **Presence/low-latency events:** Supabase Realtime.
- **Authoritative game state:** server-side API / Edge Functions and Postgres transactions. Do not trust client-supplied roles, votes or night actions.
- **Private role channels:** enforce membership and role-specific authorization on the server. Never broadcast all roles to every client.
- **Voice:** WebRTC audio; a signaling service exchanges connection setup messages. A TURN relay may be required on restrictive networks.
- **Security:** room codes are not passwords; validate all actions on the server, rate-limit joins, avoid putting secrets in Vite variables, and test with 10–15 separate browser clients.

## Suggested build milestones

1. Persist room and player records; robust create/join/reconnect.
2. Server-authoritative role assignment and private role delivery.
3. Night action submissions + atomic resolution; daytime vote/tie rules.
4. WebRTC signaling, peer connections, mute controls, private werewolf audio channel.
5. Disconnect handling, moderation, mobile testing and security review.
