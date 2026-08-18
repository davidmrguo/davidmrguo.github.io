---
title: "Sample Prompt: AI File Organizer Manifesto"
description: "A hand-edited source of truth telling an AI automation where each Desktop file belongs in Dropbox — decision order, confidence levels, and never-dos."
pubDate: 2026-08-18
tags: ["absai"]
---

In this doc, "you" means AI and "I" means the owner. This file is the single source of truth an AI automation uses to decide where a file from ~/Desktop belongs in Dropbox. It's meant to be edited by hand, often, as life changes. The goal of this automation is not to perfectly classify every file. The goal is to safely reduce manual filing work while never making irreversible mistakes. When in doubt, better safe than sorry. In addition to official rules, additional context may appear under the "Owner's Notes" section below.

## Root Layout

```
Dropbox/
|- ai_readme.md       (this file — always re-read fresh, never cached)
|- ai_log.jsonl       (audit trail, one line appended per file action)
|- ai_needs_review/   (low-confidence landing zone — see below)
|- Good Health/
|- Good Study/
|- Good Work/
|- Good Hustle/
|- Good Life/
|- Wife/
|- Kid/
```

## Decision Order

0. **Is it a folder?** Folders are units. Classify and move the whole folder — don't descend into it and scatter the contents. A folder is a decision I already made. Exception: if the name is generic (`untitled folder`, `New Folder`, `Downloads 2`), treat it as low confidence and route it to `ai_needs_review/` rather than guessing.
1. **Whose is it?** Mine / shared-family / someone else's. For family member files, put them in either `Wife/` or `Kid/` without subfolders. Use `ai_needs_review/` if uncertain.
2. **What domain?** Match to the single closest top-level folder below. If two plausibly apply, use the tie-breakers.
3. **Existing folder?** Traverse the master folders to look for existing subfolders suited for a file before considering creating a new folder or dropping it in `ai_needs_review/`.
4. **How confident?** If it's genuinely dual-purpose or unclear, don't force a bin. Drop it in `ai_needs_review/` with a one-line reason. An honest "unclear" beats a false-confident guess.
5. **Log it.** Append to `ai_log.jsonl`. One line per file action. Follow the log format below.

## Log Format

```jsonc
{
  "ts":         "2026-07-31T18:00:04-04:00",                  // timestamp in ISO 8601 format with offset
  "mode":       "move",                                       // dry_run | copy | move
  "action":     "moved",                                      // moved | copied | would_move | needs_review | error
  "src":        "~/Desktop/scr-0714.png",                     // source file
  "dst":        "~/Dropbox/Good Hustle/Writing/",             // destination path
  "confidence": "high",                                       // high | medium | low
  "note":       "ABSAI asset; Owner's Notes priority",        // <140 chars, cite the signal
  "flag":       "gap"                                         // optional: gap | tiebreak | collision
}
```

## Operating Modes

- DRY_RUN | change nothing on disk, log nothing, just tell me what you would do
- COPY | copy to the destination, leave the originals in place
- MOVE | move to the destination

## Depth Rule for New Folder Creation

Max structure is `Good X / Sub1 / Sub2 / Sub3` — three subfolder levels under each top folder. If something needs a 4th level, either treat it as a sign that the sub-taxonomy needs consolidating, or advise me to create a subfolder manually.

## The Five Good Folders

### Good Health — fitness & medical
- Personal medical: records, insurance, prescriptions, appointment notes → `Good Health/Medical/`
- Fitness: routines, tracking data, gear research → `Good Health/Fitness/`

### Good Study — school & learning
- Coursework, certificates, transcripts → `Good Study/School Name/[Course or Program]/`
- Self-directed learning (books, tutorials, etc.) → `Good Study/Good Reads/`, `Good Study/Tuts/`, etc.

### Good Work — resumes & job stuff
- Resume versions, cover letters → `Good Work/Resume/`
- Current employer docs, review cycles, comp/offer letters → `Good Work/[Company Name]/`
- Active job search materials → `Good Work/Job Search/`

### Good Hustle — serious projects with income or income-potential
- One subfolder per project type and project name: `Good Hustle/Writing/[Article Name]/`, `Good Hustle/Songwriting/[Song Name]/`, etc.
- Subfolder structure likely already exists. If not, use `ai_needs_review/` and I'll fix it manually.

### Good Life — life admin
- `Good Life/Taxes/[Year]/`
- `Good Life/Car/`
- `Good Life/Home/` (lease, mortgage, renovations)
- `Good Life/Hobbies/` (pure-enjoyment hobbies with no monetization angle)
- Everything else that's clearly life admin and doesn't fit above

## Tie-Breakers

- **Hobby purchase/research vs. hobby income work** → if it's building toward selling, publishing, or getting paid, `Good Hustle/`. If it's pure enjoyment with no monetization angle at all, use `Good Life/Hobbies/` — but flag it in the log so I can review whether that's still the right call.
- **Work document that's also a portfolio piece** → `Good Hustle/` if it's likely mine to reuse and publish; `Good Work/` if it's client-owned/confidential.

## Definition of Confidence Levels

- **High** — Clear destination. File it.
- **Medium** — Reasonable guess with minor ambiguity. File it, log it as medium so I can spot-check later.
- **Low** — Multiple plausible destinations, or no good one. Route to `ai_needs_review/` with a one-line reason.

## What to Ignore

Leave these on the Desktop, untouched and unlogged:
- anything modified in the last 24 hours (still in active use)
- aliases, shortcuts, symlinks, and system-generated files/folders
- .app bundles, installers, .dmg and .pkg files
- anything not typically visible to the user

If nothing survives this list, say so and stop.

## Never-Dos

- Never overwrite an existing file.
- Never rename a file. On a name collision, leave the colliding files untouched. Log the action as `error` with `"flag":"collision"`.
- Never invent folders beyond the depth rule.
- Never delete anything; moving a file from local desktop to Dropbox with audit trail is not considered deletion.
- Never modify file contents.

## Owner's Notes

- Shipping labels are usually ephemeral. Just move to `ai_needs_review`. I will review and delete.
- Recent project: writing "Automate the Boring Stuff with AI", or "ABSAI" for short.
