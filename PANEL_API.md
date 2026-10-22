# The panel routes

Two read-only routes in `worker/index.js` that let apps outside the website read
Wrike jobs and comments without a Wrike login. Three apps depend on them:

- **XYi Toolbox** (`aburgello/XYiToolbox`), the Adobe panel: Active Jobs and the
  amend notes on each deliverable. Code: `src/js/main/lib/jobsFeed.ts`.
- **XYi Reviewer** (`aburgello/XYiCompare`), the Mac app creative directors use
  to review market renders: the "For your review" list and last round's notes.
  Code: `app/Sources/XYiCompare/WrikeFeed.swift`.
- **XYi in Motion** (`aburgello/XYiCompare`, `app/Sources/XYiHub`), the Mac
  app for the Motion team: each person's jobs for today and the team board.
  It shares the Reviewer's `WrikeFeed.swift`.

None of them writes to Wrike. **Before changing either route, read "Changing
these routes".** XYi in Motion also reads (and in two places writes) TimeHub's
database directly: see the last section.

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

| | Toolbox | Reviewer | XYi in Motion |
|---|---|---|---|
| `member` | The name the machine is tagged with, usually a first name | The name the reviewer types, ideally their full name | Each team member's name from the team folder (one call per person, for the team board) |
| `refresh=1` | After showing the cached list, at most every two minutes, and on its refresh button | Never | Never |
| `fresh=1` | On its refresh button | On its ↻ button | Doesn't read comments |
| `id`, `title`, `status`, `permalink`, `subtasks[].id`, `subtasks[].name` | ✓ | ✓ | ✓ |
| `assignee`, `updated_at`, `subtask_count`, `subtasks_done`, `subtasks[].status`, `subtasks[].customStatusName` | ✓ | | |
| `due_date` | | | ✓ (Today, Tomorrow, "2 days late" on the board) |
| `comment`, `recent` (`text`, `author`, `date`) | ✓ | ✓ | |

What each app relies on beyond the fields:

- **The Reviewer** finds a review by `status` containing "Render review"
  (spaces and case ignored). It finds the renders on the NAS by matching
  `subtasks[].name` to filenames, version removed, and finds last round's notes
  by reading `recent` for a comment that names the render. Renaming that status
  in Wrike, or giving subtasks titles that aren't deliverable names, breaks the
  Reviewer's list.
- **XYi in Motion** groups the team board by `status` as given, places each
  job on its batch the Reviewer's way (`subtasks[].name`), and reads
  `due_date` as `yyyy-MM-ddTHH:mm:ss`.
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
- **Check all three apps** against the deployed Worker before calling it done:
  the Toolbox's Active Jobs and a job's notes; the Reviewer's "For your review"
  list and the notes panel on a render; XYi in Motion's Today and Team.
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

## XYi in Motion and the database

Besides the panel routes, XYi in Motion reaches Supabase the way the website
does: TimeHub's public website key (`src/lib/supabaseClient.js`) and an
anonymous session, one per Mac (each adds an anonymous account to Supabase's
sign-in list, as a new browser does). Code: `app/Sources/XYiHub/TimeHub.swift`.
The access rules in `supabase/schema.sql` are what allow it, so changing a
policy on these tables changes what the app can do.

**It reads:**

| Table | Columns | For |
|---|---|---|
| `profiles` | `wrike_user_id`, `first_name`, `last_name`, `department`, `canvas_color`, `avatar_url`, `left_at` | Names and colours; who you are when writing |
| `canvas_notes_folders` | `id`, `name`, `parent_id`, `owner_wrike_id`, `department` (Motion's) | The Notes screen |
| `canvas_notes_pages` | `id`, `folder_id`, `title`, `kind`, `updated_at`, `content` | The Notes screen (text pages laid out; sketches open the website) |
| `campaign_eoc_notes` | `campaign_id`, `author_id`, `updated_at`, `positives`, `negatives`, `improvements` (Motion's) | End of Campaign |
| `canvas_manual_campaigns` | `id`, `title` | Campaign names |
| `wrike_tasks_cache` | `task_data->>title`, `projectName`, `extractedPathData`, `status`, MATRIX tasks only | The Canvas's campaign list, rebuilt the way `Canvas.js` builds it |
| `board_now` | `wrike_user_id`, `task_id`, `task_title`, `note`, `user_name`, `user_color`, `updated_at`, `active` (Motion's) | Who's working on what now |

**It writes two things.** First, the person's own row in `campaign_eoc_notes`, upserted
on `campaign_id,department,author_id` with `department` Motion, exactly as the
End of Campaign page saves it: each section a JSON-stringified TipTap document,
and `updated_at` set. Before saving it reads the row again and stops (asking the
person) if `updated_at` changed since it was opened, so it never overwrites an
edit made on the website. It only edits paragraphs, headings, lists, checklists,
quotes, code, dividers and bold/italic/struck/code/link text; a section holding
anything else (an image, a video, coloured text) is left exactly as it is.

Second, **notes pages** in `canvas_notes_pages`: editing a text page's `title`
and `content`, and making a new text page (`folder_id`, `title`, `content: []`,
`kind: "text"`). An edit is saved the way `RichNoteEditor` saves with
collaboration off: `content` the TipTap document, **`ydoc` set to null** so the
next collaborative open re-seeds from that JSON, and `updated_at`. It reads the
page again first and stops if `updated_at` changed since it was opened, and a
page changed in the last two minutes waits for the person's go-ahead, since
someone may have it open live. It never touches sketch pages or a page holding
what its plain-text editor can't (the same rule as above). The gap it can't
close: a browser that already had the page open live keeps its own Yjs state,
and if that person types on, their save puts their version back.

**If you change any of this, check XYi in Motion:**

- **Campaign ids.** The app makes them the way `Canvas.js` does
  (`wrike-<title, lower case, dashes>` from a MATRIX task's project name, else
  the folder above `Digital`, else a title-prefix guess, then the hand-added
  campaigns). Change that and the app's End of Campaign write-ups land under ids
  the website no longer shows.
- **The End of Campaign format.** New columns, a new section, or sections stored
  differently need the app changed too (`EOCText.swift`, `NotesView.swift`).
- **The notes formats** (TipTap pages, `kind`) and the columns above, and how a
  non-collaborative save treats `ydoc` (the app relies on null meaning "re-seed
  from `content`").
- **The access rules** on these tables.

