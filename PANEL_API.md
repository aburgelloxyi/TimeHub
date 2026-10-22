# The panel routes

Two read-only routes in `worker/index.js` that let apps outside the website read
Wrike jobs and comments without a Wrike login. Two apps depend on them:

- **XYi Toolbox** (`aburgello/XYiToolbox`), the Adobe panel: Active Jobs and the
  amend notes on each deliverable. Code: `src/js/main/lib/jobsFeed.ts`.
- **XYi Reviewer** (`aburgello/XYiCompare`), the Mac app creative directors use
  to review market renders: the "For your review" list and last round's notes.
  Code: `app/Sources/XYiCompare/WrikeFeed.swift`.

Neither app writes to Wrike. **Before changing either route, read "Changing
these routes" at the end.**

## Access

Every request sends the shared key in an `X-Panel-Key` header. The Worker
compares it with its `PANEL_KEY` secret and answers `401 {"error":"unauthorized"}`
if it's missing or wrong. The key isn't a Wrike token and can't write anything.
It's acceptable only because both routes are read-only and return what any
studio member can already see in Wrike.

Both apps carry the key in their code (the Toolbox's `DEFAULT_FEED_KEY`, the
Reviewer's `WrikeFeed.key`). Changing the secret means shipping a new build of
both apps at the same time.

Behind the key, the Worker reads Wrike with the most recently refreshed
member's token (`panelWrikeToken`). The apps never see that token.

CORS allows any origin (the Toolbox panel's origin is `null`), `GET` and
`OPTIONS` only, and no credentials.

## `GET /api/panel/jobs`

A person's current jobs.

| Parameter | Meaning |
|---|---|
| `member` | The person's name. Matched against `profiles`: exact full name first, then first name, then surname. Leavers are skipped. On a tie, a Motion member wins (`PANEL_PREFERRED_DEPARTMENT`), then the most recently updated profile. Leave it out for everyone's jobs. |
| `refresh=1` | Read Wrike live for the whole team instead of the cache. Costs Wrike API budget, so apps should send it sparingly. Falls back to the cache if the live read fails. |
| `debug=1` | Counts at each filter stage instead of jobs, for diagnosing "my job is missing". |

**Which jobs:** top-level tasks (not subtasks) assigned to that person, whose
base status is Active, due by the end of tomorrow and no more than a week
overdue. This is the board's Today and Tomorrow lanes (`isBoardTask` in
`src/lib/jobFilter.js`). A job with no due date, or due later, isn't included.
Deferred jobs pass the database query but `isBoardTask` drops them.

**Where from:** `wrike_tasks_cache`, so a normal call costs no Wrike budget. It
is only as current as the cache. Subtask names the cache doesn't have are read
live.

**Reply:** a bare JSON array, newest `updated_at` first. Keep it a bare array:
the Toolbox reads it that way.

```json
[
  {
    "id": "MAAAAAEQLrrJ",
    "title": "SF - TH - DOOH - Batch 06",
    "assignee": "James Crouch",
    "status": "Render review",
    "due_date": "2026-10-23T17:00:00",
    "updated_at": "2026-10-22T09:41:12Z",
    "permalink": "https://www.wrike.com/open.htm?id=…",
    "subtasks": [
      {
        "id": "MAAAAAEQLrsA",
        "name": "SF_INTL_Trio_DOOH_1920x1080px_30s_TH",
        "status": "Active",
        "customStatusName": "Render review"
      }
    ],
    "subtask_count": 9,
    "subtasks_done": 2
  }
]
```

| Field | Meaning |
|---|---|
| `id` | Wrike task id. |
| `title` | The job's title. |
| `assignee` | The `member` the caller sent, echoed back. Not looked up. |
| `status` | The custom status the board shows ("Render review", "To amend", "In progress"), from Wrike's workflows; the base status (Active) if the name can't be found. |
| `due_date` | Wrike's due date, or `"No Due Date"`. |
| `updated_at` | When the task last changed in Wrike. |
| `permalink` | The task's Wrike link. |
| `subtasks[].id` | Wrike task id of the subtask. |
| `subtasks[].name` | The subtask's title. For DOOH jobs this is the deliverable's filename without a version. Empty if no name could be found. |
| `subtasks[].status` | Wrike's base group: Active, Completed, Deferred or Cancelled. |
| `subtasks[].customStatusName` | The subtask's custom status ("Delivering", "Backlog", …). |
| `subtask_count` | How many subtasks the job has. |
| `subtasks_done` | How many of them are Completed or Cancelled. |

Headers: `X-Panel-Live` is `1` when the answer came from a live read.
`X-Panel-Build` is a hand-bumped marker for checking that a change is deployed.

**Errors:**

| Code | Body | When |
|---|---|---|
| 401 | `{"error":"unauthorized"}` | Wrong or missing key. |
| 404 | `{"error":"unknown_member","member":"…","jobs":[]}` | The name matched nobody. Both apps tell the person to check their name. |
| 502 | `{"error":"query_failed","detail":"…"}` | The cache couldn't be read. |

## `GET /api/panel/comment`

A task's newest comments. This is where amends are written: one comment on the
job, listing deliverables, each with its notes.

| Parameter | Meaning |
|---|---|
| `task` | A Wrike task id (4 to 40 letters, digits, `_` or `-`). |
| `fresh=1` | Skip the Worker's three-minute cache for this task. |

**Reply:**

```json
{
  "task": "MAAAAAEQLrrJ",
  "count": 14,
  "comment": { "text": "…", "author": "James Crouch", "date": "2026-10-21T15:02:44Z" },
  "recent": [
    { "text": "…", "author": "James Crouch", "date": "2026-10-21T15:02:44Z" }
  ]
}
```

| Field | Meaning |
|---|---|
| `task` | The id asked for. |
| `count` | How many comments the task has in all. |
| `recent` | Up to eight of the newest comments, newest first, empty ones left out. More than one, because the amends aren't always the last comment (a hand-off can follow them). |
| `comment` | The newest, the same as `recent[0]`, or `null` when there are none. |
| `text` | The comment in plain text: line breaks kept, HTML removed. |
| `author` | The author's name from `profiles`, or empty if they aren't in TimeHub. |
| `date` | When it was written. |

One Wrike call per task, cached in the Worker for three minutes.

**Errors:**

| Code | Body | When |
|---|---|---|
| 401 | `{"error":"unauthorized"}` | Wrong or missing key. |
| 400 | `{"error":"bad_task"}` | The id isn't shaped like a Wrike id. |
| 502 | `{"error":"no_wrike_token"}` | No member has a usable Wrike connection. |
| 502 | `{"error":"wrike_<status>"}` or `{"error":"wrike_unreachable"}` | Wrike refused or couldn't be reached. |

## Which app reads what

| | Toolbox | Reviewer |
|---|---|---|
| `member` | The name the machine is tagged with, usually a first name | The name the reviewer types, ideally their full name |
| `refresh=1` | After showing the cached list, at most every two minutes, and on its refresh button | Never |
| `fresh=1` | On its refresh button | On its ↻ button |
| `id`, `title`, `status`, `permalink`, `subtasks[].id`, `subtasks[].name` | ✓ | ✓ |
| `assignee`, `updated_at`, `subtask_count`, `subtasks_done`, `subtasks[].status`, `subtasks[].customStatusName` | ✓ | |
| `due_date` | | |
| `comment`, `recent` (`text`, `author`, `date`) | ✓ | ✓ |

What each app relies on beyond the fields:

- **The Reviewer** finds a review by `status` containing "Render review"
  (spaces and case ignored). It finds the renders on the NAS by matching
  `subtasks[].name` to filenames, version removed, and finds last round's notes
  by reading `recent` for a comment that names the render. Renaming that status
  in Wrike, or giving subtasks titles that aren't deliverable names, breaks the
  Reviewer's list.
- **The Toolbox** reads amends the same way (both apps parse comments with the
  rules in the Toolbox's `amendNotes.ts`) and uses `subtasks[].customStatusName`
  to tell a batch waiting for localisation from one in flight.

## Changing these routes

- **Add, don't rename or remove.** A new field is safe. Renaming or removing
  one, or changing what it means, breaks whichever app reads it, quietly: both
  apps treat a missing field as blank rather than failing.
- **Keep the jobs reply a bare array** and keep the error shapes above.
- **A new subtask field reaches the Toolbox only if its `normalise()` in
  `jobsFeed.ts` copies it**; that function rebuilds each subtask field by field.
- **Bump `X-Panel-Build`** with any change to `/api/panel/jobs`.
- **Check both apps** against the deployed Worker before calling it done:
  the Toolbox's Active Jobs and a job's notes; the Reviewer's "For your review"
  list and the notes panel on a render.
- **Update this page** in the same commit.

## Known limits

- **Name ties go to Motion.** A creative director who shares a first name with
  a Motion designer gets the designer's jobs unless they enter their full name.
- **Only jobs due by tomorrow.** A review whose job is due later doesn't show
  in the Reviewer until the day before.
- **Cached jobs.** Without `refresh=1` the list is as current as
  `wrike_tasks_cache`. Motion's tasks are always there (Motion has a team
  board). Other departments' tasks may lag, and the Reviewer, used by creative
  directors, never asks for a live read.
