# Guess & Grab (formerly Object Detective)

A browser clue-guessing game. Read a clue, find the real object, show it to your camera, and Roboflow confirms it.
Static front end (`index.html`, `style.css`, `app.js`) plus one Cloudflare Pages Function
(`functions/api/detect.js`) that forwards camera frames to your Roboflow Workflow.

## Architecture
- Browser: camera, game logic, timers, scoring. Sends JPEG frames to `/api/detect`.
- `functions/api/detect.js` (unchanged): forwards the frame to the Roboflow Workflow
  `object-detective-yf9zg` (workspace `0702-khwanthip-sroisiri`) using the secret `ROBOFLOW_API_KEY`.
- The private key exists only in the server environment (`.dev.vars` locally, a Pages secret in production).
  It is never in any browser file. Do not commit `.dev.vars`.

## Screens
Home (Start Game / How to Play) -> Setup -> Game -> Results (Play Again / Back to Home).

## Game rules
- Setup: 1 or 2 players, custom names, 3 / 5 / 10 objects per player, time per object 30 s / 1 min / 1 min 30 s / 2 min (default 30 s).
  The time limit is per object, not per game.
- Two players alternate: P1 task 1, P2 task 1, P1 task 2, ... (5 objects each = 10 scheduled tasks).
  When the next task belongs to the other player, a "pass the device" screen with a Continue button appears;
  the timer starts only after Continue. This screen never adds time or points.
- Each task shows only the clue. The answer appears when 10 seconds or less remain (based on the real remaining time).
- A correct object needs 3 consecutive Roboflow results at confidence >= 0.5. It scores once, then the task ends.
- Score = `round(100 x remainingTime / totalTime)`, 0..100. Skip, timeout and forfeit = 0 points.
  (Remaining time is measured when the confirming camera frame was captured, so slow networks don't cost points.)
- **Skip**: ends the task (0 points) and immediately starts the next scheduled task with its own full timer. Nothing carries over.
- **Give Up** (asks for confirmation; the timer is paused while the dialog is open): the player withdraws. Their current and
  remaining tasks become zero-point forfeits, earned points are kept, the schedule length does not change, and the
  other player keeps all of their own tasks. The withdrawn player cannot return until a new match is started.
- Objects are random with no repeats until all 20 have been used, then the pool is reshuffled.
- Results: totals, winner / draw, found, skipped, forfeited, timed-out, assigned tasks, per-task table.
- Top Scores are stored in this browser's `localStorage` only (saved once per match, never on Play Again).

All numbers are in `CONFIG` at the top of `app.js`.

## Roboflow model compatibility (IMPORTANT)
The game has 20 objects. The current model has 25 classes (taken from `CONFIG.CLASSES`, the original project's list; verify
them against your Roboflow project). The mapping lives in `OBJECTS` in `app.js` (`modelClasses`).

Detectable now (11 objects, game object -> model class):
Water bottle -> `bottle`, Glasses -> `glasses`, Hat -> `hat`, Inhaler -> `inhaler`, Mouse -> `mouse`,
Scissors -> `scissors`, Socks -> `sock`, Tissue -> `tissue`, Phone -> `phone`, Watch -> `Watch`, Calculator -> `calculator`.
(The Water bottle mapping is only valid if `bottle` means a water bottle in your training data.)

NOT in the model (9 objects, they can only be skipped or time out):
Body powder, Fork, Instant noodles, Toothpaste, Razor, Makeup brush, Eyelash curler, Nail clippers, Mask.

For an undetectable object the game shows "This object is not supported by the
detection model yet. You can skip this task." and sends no requests. To fix this, add and train these 9 classes in Roboflow
(suggested: 100+ varied images per class), then add the exact class names to `modelClasses` in `OBJECTS` and `CLASSES`.
Until then you can set `INCLUDE_UNSUPPORTED_OBJECTS: false` in `CONFIG` to play only with the 11 detectable objects.

## Run locally (camera needs localhost or HTTPS)
```
cd object-detective-game
cp .dev.vars.example .dev.vars      # then put your real key in .dev.vars
npx wrangler pages dev .
```
Open the URL it prints (usually http://localhost:8788).
`.dev.vars` must contain: `ROBOFLOW_API_KEY=your_private_key`

## Deploy to Cloudflare Pages (only when you decide to)
1. Push the folder (without `.dev.vars` or `.wrangler/`) to GitHub, then Workers & Pages > Create > Pages > Connect to Git.
   Framework: None, no build command, output directory `/`. Or: `npx wrangler pages deploy . --project-name object-detective-game`.
2. Settings > Variables and Secrets: add the secret `ROBOFLOW_API_KEY` (Production, and Preview if used).
3. Redeploy. Pages serves HTTPS, which the camera requires.

## Manual test guide
1. Home shows exactly two buttons. How to Play opens 4 numbered steps; I Understand closes it and you stay on Home.
2. Start Game -> Setup. Switch to 1 player: the Player 2 field disappears. Check the four time options.
3. Start a 2-player, 3-object, 30 s game. Allow the camera. The clue shows, the answer does not.
4. Wait until 0:10: "Answer: ..." appears. At 0:00: "Time's up!", 0 points, then the pass-device screen.
5. Press Skip: the next clue starts with a full timer (not extended).
6. Show a detectable object (for example your phone or glasses) to the camera: "Correct object found!" and points.
   Finding it faster gives more points.
7. Give Up as Player 1 mid-game: Player 2 keeps playing, Player 1's remaining tasks are forfeited; Results shows forfeited counts.
8. Results -> Play Again starts a clean match. Deny the camera permission once to see the recovery message.
9. Stop the dev server mid-game: "Detection service unavailable. You can skip this task." and Skip still works.

## Notes
- `functions/api/detect.js` was not changed. Its 500 response for a missing key includes diagnostic fields
  (`envKeys`); consider trimming them before a public launch.
