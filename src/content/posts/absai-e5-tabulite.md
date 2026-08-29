---
title: "Tabulite MCP Codebase Walk-Through"
description: "A line-by-line walkthrough of a local MCP server that gives an AI client a SQLite runtime instead of data."
pubDate: 2026-08-29
tags: ["AI Automation", "MCP", "Python", "SQLite"]
---

Source reading of `src/tabulite_mcp` at commit `d0551c0`: **11 modules · 2,479 lines · 1 runtime dependency · 4 read-only locks.**

**Contents**

- **Orientation** — [The shape of the thing](#orientation--the-shape-of-the-thing) · [Reading order](#orientation--reading-order)
- **Modules** — [1 `__init__.py`](#module-1--__init__py-7-lines) · [2 `config.py`](#module-2--configpy-121-lines) · [3 `casting.py`](#module-3--castingpy-140-lines) · [4 `security.py`](#module-4--securitypy-324-lines) · [5 `database.py`](#module-5--databasepy-210-lines) · [6 `catalog.py`](#module-6--catalogpy-300-lines) · [7 `importer.py`](#module-7--importerpy-371-lines) · [8 `profiler.py`](#module-8--profilerpy-167-lines) · [9 `exporter.py`](#module-9--exporterpy-143-lines) · [10 `confirm.py`](#module-10--confirmpy-104-lines) · [11 `server.py`](#module-11--serverpy-592-lines)
- **Themes** — [The four locks](#theme--the-four-locks) · [One pass, no RAM](#theme--one-pass-no-ram) · [Hash as identity](#theme--hash-as-identity) · [Sharp edges](#theme--sharp-edges)
- **Closing** — [Check yourself](#closing--check-yourself)

## Orientation — The shape of the thing

Tabulite is a server that gives an AI client a SQLite runtime instead of data. The client asks questions; the server answers with metadata, aggregates, and files on disk. No rows travel through the conversation unless someone asks for a sample.

The whole program is a pipeline with five verbs — **discover, import, profile, query, export** — plus one destructive verb (**delete**) that is deliberately awkward to reach. Everything in `src/tabulite_mcp` serves one of those six.

Two rules explain most of the design decisions you'll meet:

1. **Everything is TEXT.** The importer never interprets a value. Type inference is a separate, later, non-destructive act.
2. **Anything the AI writes runs read-only.** Not by convention — by four independent mechanisms.

### Four mechanisms worth knowing before you start

Most of this codebase is ordinary Python doing obvious things. Four mechanisms are not obvious, they carry most of the design, and each gets a full treatment where it appears — but meeting them once here makes the first read much faster.

| Mechanism | What it is | Where |
| --- | --- | --- |
| **The authorizer callback** | A Python function SQLite calls *while compiling* each statement, once for every operation the statement intends to perform, which can veto that operation. Because it sees the compiled meaning rather than the text, it can't be fooled by how a query is spelled. It is what actually makes `query_sql` safe; the string scrubber in front of it is corroboration. | `security.py` |
| **Autocommit mode** | `sqlite3.connect(..., isolation_level=None)`. Python's `sqlite3` normally opens a transaction behind your back before any write and holds it until you commit. Setting `None` turns that off, so `BEGIN` and `COMMIT` mean exactly what they say and the importer controls its own boundaries. | `database.py` |
| **The progress handler** | A callback SQLite invokes every N virtual-machine instructions; returning non-zero aborts the running statement. It is the only way to put a time limit on a query in this API, and it's why queries can be cancelled at all. | `database.py` |
| **Tool docstrings are the API** | Every `@server.tool()` docstring is shipped verbatim to the language model as that tool's description. The prose is not documentation *about* the interface — it *is* the interface, and it's written to be acted on. | `server.py` |

Two smaller conventions to note in passing. There is no schema migration system: `catalog.py` holds a `SCHEMA` string of `CREATE TABLE IF NOT EXISTS` statements re-run on every connect, which works because there is exactly one schema version in existence. And SQL identifiers cannot be bound as parameters — `SELECT * FROM ?` is not a thing — so every dynamic table and column name is interpolated through `quote_identifier()` instead, which is why that four-line function is load-bearing.

## Orientation — Reading order

The numbering below isn't decorative. It's a topological sort of the import graph: each module imports only modules that come before it, so you can read straight down and never meet an undefined name.

```text
tier 1 · imports nothing from the package
  config (2)   casting (3)   security (4)   catalog (6)   confirm (10)
                      \          /
tier 2                 \        /
                     database (5)
                  /        |        \
tier 3   importer (7)  profiler (8)  exporter (9)
                  \        |        /
tier 4              server (11) · imports all of them
```

*Five modules import nothing from the package at all. That flat base is why the test suite can exercise the security rules, the casting rules and the catalog schema without ever standing up a server.*

Note what the graph *doesn't* contain: no module imports `server`, and no cycles. The MCP layer is a rind, not a spine — you could put a CLI or a Flask app on this same core and change nothing below `server.py`.

## Module 1 — `__init__.py` (7 lines)

**imports:** nothing · **exports:** `__version__`

```python
"""Local MCP server that imports CSV files into SQLite and queries them safely.

The reasoning layer lives in the desktop AI client. This package only provides
deterministic tools: discover, import, profile, query (read-only) and export.
"""

__version__ = "0.1.0"
```

Two things are happening in seven lines.

1. The docstring states the architectural boundary. "The reasoning layer lives in the desktop AI client" is the sentence that justifies every later decision not to add cleverness to the server.
2. `__version__` is the single source of truth for the package version. `pyproject.toml` declares `dynamic = ["version"]` and points hatchling at this file — so bumping the string here is the entire release-version step, and `server.py` reads the same constant to report itself over MCP.

## Module 2 — `config.py` (121 lines)

**imports:** `os`, `dataclasses`, `pathlib` · **job:** all environment reading, in one place

The docstring states the contract plainly: *"the rest of the modules stay free of environment lookups and are easy to test."* That is the whole point of the module. If you ever find an `os.environ` outside this file, something has gone wrong.

#### The env helpers

```python
def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)
```

1. An **unset** variable and a variable set to **empty or whitespace** are both treated as "not configured". This matters in Docker Compose, where `TABULITE_PORT=` in an `.env` file gives you an empty string rather than an absent key. Without the `.strip() == ""` branch you'd get `ValueError: invalid literal for int()` at import time — and because `Config.from_env()` runs at *module import*, that crash would happen before any logging is configured.
2. A genuinely malformed value (`TABULITE_PORT=eight`) *does* still raise. That's the right call: silently falling back to 8000 when the operator asked for something specific would be worse than a loud crash.

#### The dataclass

```python
@dataclass(frozen=True)
class Config:
    source_dir: Path
    workspace_dir: Path
    null_markers: tuple[str, ...] = DEFAULT_NULL_MARKERS
    insert_batch_size: int = 5_000
    read_chunk_bytes: int = 1 << 20
    max_query_rows: int = 1_000
    query_timeout_seconds: float = 30.0
    export_timeout_seconds: float = 600.0
    max_sample_rows: int = 100
    ...
```

1. `frozen=True` makes instances immutable and hashable. Nothing in the codebase needs the hashing, but the immutability means a `Config` can be passed six layers deep — into the importer, the profiler, the exporter — with no possibility that a callee mutates it out from under a caller.
2. Every collection default is a `tuple`, not a `list`. Dataclasses reject mutable defaults outright, but the deeper reason is the same as above: `null_markers` travels into a tight per-cell loop in the importer and must not be something a caller can append to.
3. `read_chunk_bytes: int = 1 << 20` is 1 MiB, written as a shift so the intent ("one megabyte") survives even though the value is a power of two. This is the buffer size for the `BufferedReader` in the import path.
4. The comment on `max_query_rows` — *"exports are deliberately unbounded"* — is the load-bearing note in this file. Interactive queries are capped to protect the model's context window, not the server. Exports go to disk, where no context window exists, so they aren't capped at all. Two different limits for two different scarce resources.
5. `query_timeout_seconds` is 30s and `export_timeout_seconds` is 600s for the same reason: an interactive call is blocking a conversation, an export is blocking a file.
6. `type_confidence_threshold: float = 0.99` — a column is called INTEGER only if 99% of its non-null values parse as integers. Not 100%, because real CSVs have a stray `"n/a"`; not 90%, because then the label would mislead.

#### Derived paths

```python
@property
def database_path(self) -> Path:
    """Single analytical database holding every imported table.

    One file keeps cross-table joins possible without ATTACH, which the
    read-only query layer forbids.
    """
    return self.databases_dir / "main.sqlite"
```

This docstring is doing real architectural work, and it's worth pausing on because it's a genuine two-way door that was decided one way.

The obvious design is one SQLite file per imported CSV. It's tidier, deletion is `rm`, and there's no name-collision problem. It was rejected because joining two tables across two SQLite files requires `ATTACH DATABASE` — and `ATTACH` is exactly the statement the read-only authorizer denies, since it's how you'd read a file the server never meant to expose. So: **one database file, so that joins work, so that `ATTACH` can stay banned.** The price is paid later, in `importer.deterministic_table_name()`, which now has to resolve name collisions.

> **Reading the trade**
>
> The usual way to make joins work across separate database files is to allow the join and restrict what can be attached. That isn't available here, because `ATTACH` takes an arbitrary filesystem path — it is *the* mechanism by which a read-only connection would reach a file the server never meant to expose, and no allowlist of paths is as trustworthy as not having the verb at all. So the constraint runs the other way: ban `ATTACH` outright, and arrange the storage so nothing needs it.

#### `from_env()`

```python
markers_raw = os.environ.get("TABULITE_NULL_MARKERS")
if markers_raw is None:
    markers = DEFAULT_NULL_MARKERS
else:
    # Comma separated; an empty item means "the empty string".
    markers = tuple(part.strip() if part.strip() else "" for part in markers_raw.split(","))
```

1. The conditional looks redundant — `part.strip() if part.strip() else ""` — but it isn't. A marker of `"  "` (spaces) becomes `""`, meaning "an empty cell is null". Without it you'd have a null-marker consisting of two literal spaces, which would only match cells containing exactly two spaces. The expression normalizes all-whitespace entries to the empty-string marker.
2. `None` and `""` diverge here, unlike in `_env_int`: setting `TABULITE_NULL_MARKERS=` gives you `("",)` — *only* empty cells are null, and the literal text `NULL` stays as text. That's a legitimate thing to want, so it's honoured.
3. `source.resolve()` and `workspace.resolve()` are called here, at construction. Every later containment check in `security.py` compares against an already-resolved base, so a symlinked mount point can't produce a false "escape".

```python
default_hosts = (
    f"localhost:{port}", f"127.0.0.1:{port}",
    f"[::1]:{port}", f"host.docker.internal:{port}",
)
default_origins = tuple(f"http://{h}" for h in default_hosts)
```

1. All four spellings of "this machine" are listed because a browser or client may send any of them in the `Host` header, and a mismatch is a hard reject.
2. `host.docker.internal` is there because the server runs *inside* a container while the AI client runs on the host; that's the hostname the container knows itself by from the outside.
3. `[::1]` keeps its brackets — that's the IPv6 literal syntax inside a `Host` header, and stripping them would silently never match.

> **Worth noticing**
>
> Five fields are **not** settable from the environment: `read_chunk_bytes`, `max_sample_rows`, `profile_sample_values`, `profile_invalid_examples`, `type_confidence_threshold`. They're dataclass defaults only. That's a deliberate narrowing of the operator-facing surface — but it means the only way to change them is `dataclasses.replace()`, which is exactly what `tests/test_importer.py:132` does. Fine for now; if a user ever asks for a lower confidence threshold, this is where the work goes.

## Module 3 — `casting.py` (140 lines)

**imports:** `re`, `sqlite3`, `datetime` · **job:** five SQL functions that refuse to guess

This module exists because of one SQLite behaviour, stated at the top of the file:

```text
CAST('12 apples' AS REAL)  -->  12.0
CAST('unknown'   AS REAL)  -->  0.0
```

The second line is the dangerous one. SQLite's `CAST` never fails; it returns `0.0` for anything it can't parse. So `AVG(CAST(price AS REAL))` over a column where 30% of rows say `"unknown"` silently reports a number that is 30% too low — and nothing anywhere signals that it happened. The AI writes plausible SQL, gets a plausible number, and reports a wrong answer confidently.

The fix is a set of functions that return **NULL** instead of zero, because SQL aggregates skip NULLs by definition. `AVG(TRY_REAL(price))` averages only the parseable rows, and `COUNT(TRY_REAL(price))` tells you how many those were.

#### The normalizer everything goes through

```python
def _text(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, bytes):
        try:
            value = value.decode("utf-8")
        except UnicodeDecodeError:
            return None
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text or None
```

1. The `bool` check must come **before** the `(int, float)` check. In Python `bool` is a subclass of `int`, so `isinstance(True, int)` is `True` — reorder these two lines and `True` becomes the string `"True"` instead of `"1"`, and `TRY_INTEGER(True)` starts returning NULL. A classic ordering bug, avoided.
2. SQLite can hand a Python function any of its five storage classes. This function collapses all of them to "a trimmed string or nothing", so the five `try_*` functions below can each be a single regex or `strptime` call and don't repeat this ladder.
3. `bytes` appear when a BLOB is stored, or when text was inserted as bytes. Undecodable bytes return `None` rather than raising — a Python exception inside a SQLite callback surfaces as an opaque error mid-query, which would be a bad experience for a caller trying to debug their SQL.
4. `return text or None` — the final trick. A whitespace-only cell strips to `""`, which is falsy, so it becomes `None`. This means `"   "` is treated as missing, not as an unparseable value.

#### The two regexes

```python
_INTEGER_RE = re.compile(r"^[+-]?\d+$")
_REAL_RE    = re.compile(r"^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$")
```

1. Both are anchored at both ends. `"12 apples"` fails, which is the entire point — an unanchored pattern would reproduce the exact `CAST` bug this module exists to avoid.
2. `_REAL_RE` accepts `1.` (via `\d+(\.\d*)?`) and `.5` (via `\.\d+`) and scientific notation, but **not** thousands separators, currency symbols, or parenthesised negatives. `"1,234.50"` and `"$99"` are NULL. That's a real limitation, and it's the honest one: the profiler will report those columns as TEXT with a low confidence, which is a truthful signal that the data needs cleaning, rather than a silently half-right number.
3. `\d` in Python 3 `re` matches Unicode digits by default — Arabic-Indic numerals would pass the regex and then `int()` would accept them too. Consistent, if unlikely to come up.

#### Dates and the tolerant fallback

```python
def try_datetime(value: object) -> str | None:
    text = _text(value)
    if text is None:
        return None
    candidate = text[:-1] if text.endswith("Z") else text
    for fmt in _DATETIME_FORMATS:
        try:
            return datetime.strptime(candidate, fmt).strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.replace(tzinfo=None)
    return parsed.strftime("%Y-%m-%d %H:%M:%S")
```

1. The trailing `Z` is stripped before parsing. Note what that means: `2024-01-15T09:00:00Z` is treated as *naive* 09:00, not converted to local time. Combined with the `replace(tzinfo=None)` two lines later, the module's policy is **discard the offset, keep the wall-clock time**. That's defensible for CSV analysis — but if your file mixes `+09:00` and `-05:00` rows, they'll sort as if they were the same zone. Worth knowing before you trust a time-series ordering.
2. `strptime` is tried first with an explicit tuple of formats, then `fromisoformat` as a fallback. The explicit list exists because `fromisoformat` rejects `2024/01/15 09:00:00` (slashes) which is common in spreadsheet exports.
3. The fallback also accepts *date-only* input — `fromisoformat("2024-01-15")` succeeds and gives midnight. So a plain date is valid as both DATE and DATETIME. That's why `profiler._INFERENCE_ORDER` checks DATE first: a date column would otherwise be labelled DATETIME and grow a spurious `00:00:00`.
4. The return type is `str`, not `datetime`. SQLite has no date type, and returning an ISO string means the result is directly comparable and sortable with SQLite's own `date()`/`datetime()` functions. Returning a Python `datetime` would make `sqlite3` adapt it into… an ISO string anyway, with a deprecation warning in 3.12+.

#### Registration

```python
def register_try_functions(conn: sqlite3.Connection) -> None:
    for name, func in TRY_FUNCTIONS.items():
        conn.create_function(name, 1, func, deterministic=True)
```

1. The `1` is the arity. SQLite dispatches on `(name, argc)`, so `TRY_REAL(a, b)` is a "no such function" error rather than a silently ignored second argument.
2. `deterministic=True` is a promise to SQLite that the same input always yields the same output. In exchange, SQLite may use the function in indexed contexts, hoist it out of loops, and cache within a statement. All five are pure, so the promise is true. Marking a non-deterministic function this way would produce wrong results, not just slow ones.
3. **Functions are per-connection.** This is the reason `register_try_functions` is called in both `connect_writable` and `connect_read_only` in `database.py` — there's no "register once globally" in `sqlite3`, and a connection that skipped it would fail every AI-written query with "no such function: TRY_REAL".

> **Dead code**
>
> `is_textual_boolean()` at line 118 is defined and never called anywhere in `src/` or `tests/`. Reading it, its intent is clear — distinguish a real `"yes"/"no"` column from a `0/1` column, which the profiler currently can't do because `0` and `1` match INTEGER first and INTEGER is checked before BOOLEAN. It looks like the start of a refinement that wasn't finished. Either wire it into `profiler._INFERENCE_ORDER` or delete it; a lone unused predicate invites the next reader to assume the feature exists.

## Module 4 — `security.py` (324 lines)

**imports:** `logging`, `re`, `sqlite3`, `pathlib` · **job:** two containment problems — filesystem and SQL

The biggest module that isn't the server, and the one where reading every line pays off most. It answers two questions: *can this path escape the project directory?* and *can this statement do anything but read?*

### Part one: paths

```python
def _resolve_inside(base: Path, candidate: Path) -> Path:
    base_resolved = base.resolve()
    resolved = candidate.resolve()
    if resolved != base_resolved and base_resolved not in resolved.parents:
        raise SecurityError(f"path escapes the allowed directory: {candidate}")
    return resolved
```

Four lines, and the ordering is the whole security property.

1. **`.resolve()` happens before the check, not after.** This is the non-negotiable part. `resolve()` normalizes `..` segments *and* follows symlinks. Checking containment on the unresolved path would let `source/innocent.csv` be a symlink to `/etc/passwd` and pass. Because resolution comes first, the comparison is between two real, canonical filesystem locations.
2. `base_resolved not in resolved.parents` — `Path.parents` is a sequence of every ancestor, so this is a true ancestry test. The naive alternative, `str(resolved).startswith(str(base))`, has a classic hole: `/project/source-evil/x.csv` starts with `/project/source` and would pass. Ancestry testing doesn't have that hole.
3. The `resolved != base_resolved` disjunct handles the base directory itself, which is not in its own `parents`. Needed by `unique_export_path`.
4. A subtle consequence: `resolve()` on a nonexistent path is fine in Python 3.6+ (it doesn't raise), so the existence checks in the caller are separate concerns and can produce their own, clearer errors.

```python
def resolve_source_path(relative_path: str, source_dir: Path) -> Path:
    if not relative_path or not relative_path.strip():
        raise SecurityError("source path is empty")
    if "\x00" in relative_path:
        raise SecurityError("source path contains a null byte")

    candidate = Path(relative_path)
    if candidate.is_absolute():
        resolved = _resolve_inside(source_dir, candidate)
    else:
        if ".." in candidate.parts:
            raise SecurityError(f"path traversal is not allowed: {relative_path}")
        resolved = _resolve_inside(source_dir, source_dir / candidate)

    if not resolved.exists():
        raise SecurityError(f"source file not found: {relative_path}")
    if not resolved.is_file():
        raise SecurityError(f"source path is not a file: {relative_path}")
    return resolved
```

1. **The null-byte check.** This is the one that looks paranoid and isn't. C string handling terminates at `\0`, so `"safe.csv\x00/../../etc/passwd"` can be validated by Python as one string and interpreted by a C library as another. Python's own `open()` raises `ValueError` on embedded nulls, so this check is mostly about producing a clear error instead of a confusing one — but it costs nothing and closes a whole class of confusion.
2. **Absolute paths are accepted, conditionally.** This looks like a weakening but it's a usability fix with the security preserved: `list_sources()` returns paths, an AI client may echo one back verbatim, and rejecting them outright would produce a baffling error. They're accepted only if they resolve *inside* `source_dir`, which `_resolve_inside` enforces regardless.
3. **The `".." in candidate.parts` check is redundant** — `_resolve_inside` would catch `source/../../etc` anyway, after resolution. It's there for the error message. "path traversal is not allowed" tells a caller what they did wrong; "path escapes the allowed directory" tells them the outcome. For a caller that is a language model trying to self-correct, the specific message is meaningfully better.
4. Note the asymmetry: the `..` check runs only on the relative branch. That's correct — an absolute path containing `..` still gets resolved and containment-checked, so nothing leaks.
5. `is_file()` after `exists()` blocks pointing the importer at a directory or a FIFO. Opening a FIFO would block the server forever.

```python
def sanitize_export_filename(file_name: str, fmt: str) -> str:
    ...
    cleaned = _FILENAME_SAFE.sub("_", file_name).strip("._")
    if not cleaned:
        raise SecurityError(...)
    suffix = f".{fmt}"
    if not cleaned.lower().endswith(suffix):
        cleaned += suffix
    return cleaned
```

1. Three explicit rejections come first — null bytes, any separator, any `..`. Only then does the regex scrub. The rejections are *hard errors* rather than silent scrubbing because a caller asking for `../../x.csv` has a mistaken model of what this tool does, and quietly writing `______x.csv` would hide that.
2. `_FILENAME_SAFE = re.compile(r"[^0-9a-zA-Z._-]+")` is an **allowlist**, expressed as a negated character class. Denylists of dangerous characters always miss something; this can't. Spaces, quotes, semicolons, emoji, RTL override characters all become `_`.
3. `.strip("._")` removes leading and trailing dots and underscores — a leading dot would make the export a hidden file, and the earlier `..` guard already ran, so this is about tidiness rather than safety.
4. The suffix is appended only if absent, so `report.csv` stays `report.csv` rather than becoming `report.csv.csv`. The `.lower()` means `REPORT.CSV` is also left alone.

```python
def unique_export_path(exports_dir: Path, file_name: str) -> Path:
    target = _resolve_inside(exports_dir, exports_dir / file_name)
    if not target.exists():
        return target
    stem, dot, suffix = file_name.partition(".")
    counter = 2
    while True:
        candidate = exports_dir / f"{stem}_{counter}{dot}{suffix}"
        if not candidate.exists():
            return _resolve_inside(exports_dir, candidate)
        counter += 1
```

1. The policy is **never overwrite**. An export is a deliverable; a second export that silently clobbers the first is a data-loss bug that nobody notices until they need the first one.
2. Counting starts at 2, so the sequence reads `report.csv`, `report_2.csv`, `report_3.csv` — the natural way a person numbers copies.
3. `_resolve_inside` is called on the generated candidate too, even though it was constructed from an already-sanitized name. Belt and braces, and cheap.

> **Small quirk**
>
> `partition(".")` splits at the **first** dot, not the last. So `sales.2024.csv` collides into `sales_2.2024.csv` rather than `sales.2024_2.csv`. Harmless — the file is still unique, still inside the directory, still ends in `.csv` — but it's the kind of thing that reads as a bug in a code review. `Path.stem`/`Path.suffix` would give the conventional result.
>
> There's also a benign TOCTOU window: `exists()` then `open()` isn't atomic. With one local user and a UUID-suffixed default filename, it isn't reachable in practice.

#### Identifiers

```python
def quote_identifier(name: str) -> str:
    if "\x00" in name:
        raise SecurityError("identifier contains a null byte")
    return '"' + name.replace('"', '""') + '"'
```

This is the function that makes every f-string-built query in the codebase safe, so it's worth being precise about why.

1. Parameter binding (`?`) works for *values* only. You cannot write `SELECT * FROM ?` — SQL identifiers are resolved at compile time, before parameters are bound. So dynamic table and column names must be interpolated, and the only safe way to interpolate is to quote them correctly.
2. SQLite's rule for double-quoted identifiers is that an embedded `"` is escaped by doubling it. `replace('"', '""')` implements exactly that, so a column literally named `we"rd` becomes `"we""rd"` and parses as one identifier. There is no escape sequence that can break out of a doubled-quote identifier — which is why this is sufficient and not merely a filter.
3. Combined with `safe_table_name()` below, the codebase actually has two independent protections: names are normalized to `[a-z0-9_]` on the way in, *and* quoted on the way into SQL. Either alone would do; both means a future code path that skips normalization still can't inject.

```python
def safe_table_name(raw: str) -> str:
    name = _IDENTIFIER_SAFE.sub("_", raw).strip("_").lower()
    if not name:
        name = "table"
    if name[0].isdigit():
        name = f"t_{name}"
    if name.startswith("sqlite_"):
        name = f"t_{name}"
    return name
```

1. Four failure modes, each handled in order: unsafe characters, empty result, leading digit, reserved prefix.
2. **`sqlite_` is reserved by SQLite itself** for internal tables like `sqlite_master` and `sqlite_sequence`. Creating your own `sqlite_stat1` would either be rejected or would corrupt the query planner's expectations. A CSV named `sqlite_export.csv` is unlikely but entirely possible, and the failure would be baffling.
3. The leading-digit guard exists because `2024_sales` is not a valid bare identifier. Note that `quote_identifier` would actually make it work anyway — but the goal here is a name the AI can type *unquoted* in generated SQL, since models don't reliably quote identifiers.
4. Lowercasing is a normalization choice, not a safety one. SQLite identifiers are case-insensitive for ASCII, so `Sales` and `sales` already collide; forcing lowercase makes that visible in the catalog rather than surprising.
5. This function is reused for *column* names by `importer.normalize_column_names()`, despite the name saying "table". Mildly misleading naming for an otherwise precise module.

### Part two: SQL

Now the interesting half. Read the module docstring's framing first — the layering claim is the thesis, and the code below has to earn it.

#### The scrubber

```python
def scrub_sql(sql: str) -> str:
    out: list[str] = []
    i = 0
    n = len(sql)
    while i < n:
        ch = sql[i]
        if ch == "-" and sql.startswith("--", i):
            i = sql.find("\n", i)
            if i == -1:
                break
            out.append(" ")
        elif ch == "/" and sql.startswith("/*", i):
            end = sql.find("*/", i + 2)
            i = n if end == -1 else end + 2
            out.append(" ")
        elif ch in "'\"`[":
            closing = {"'": "'", '"': '"', "`": "`", "[": "]"}[ch]
            j = i + 1
            while j < n:
                if sql[j] == closing:
                    if closing != "]" and j + 1 < n and sql[j + 1] == closing:
                        j += 2  # doubled quote inside the literal
                        continue
                    break
                j += 1
            out.append("_" if ch != "'" else " ")
            i = j + 1
        else:
            out.append(ch)
            i += 1
    return "".join(out)
```

A hand-written mini-lexer. It is not a SQL parser and doesn't try to be — it does exactly one job: **remove every region of the statement where a keyword could hide.**

1. Without it, keyword scanning is trivially defeated: `SELECT 'DROP TABLE users' AS note` contains the token `DROP` but is a perfectly innocent query. Conversely `SELECT 1 --\nDROP` hides a real one behind a comment. Both are neutralized by blanking those regions before scanning.
2. The four quote characters are all of SQLite's identifier and literal delimiters: `'` for strings, `"` standard identifiers, ``` MySQL-style, `[...]` SQL-Server-style. SQLite accepts all four for compatibility, so all four must be handled or one becomes a hiding place.
3. **The replacement differs by kind, and this is the cleverest line in the function.** A string literal becomes a space; an identifier becomes `_`. Why: identifiers are *tokens* that must survive so the statement's shape is preserved, whereas string content is pure noise. Concretely, this is what lets a table with a column literally named `"drop"` be queried — the identifier collapses to `_`, so the keyword scan never sees `DROP`, but the token still holds its place in `SELECT _ FROM t`.
4. `closing != "]"` guards the doubled-quote rule, because `]]` is not an escape in bracket syntax — only quote characters double. Getting this wrong would mis-parse `[a]]b]`.
5. Unterminated constructs fail closed by design: an unclosed `'` runs `j` to `n`, and everything after it is swallowed. The scrubbed output then has no valid leading keyword or becomes empty, and validation rejects it. An unterminated `--` comment hits `break` and truncates. In both cases the result is "reject", never "accept the tail".
6. The `-`/`/` branches use `sql.startswith("--", i)` rather than peeking at `sql[i+1]`, which avoids an index error at the last character. Small, but the kind of thing that bites in hand-written scanners.

#### The validator

```python
def validate_read_only_sql(sql: str) -> str:
    if not sql or not sql.strip():
        raise SecurityError("SQL statement is empty")

    stripped = sql.strip()
    scrubbed = scrub_sql(stripped)

    statements = [part for part in scrubbed.split(";") if part.strip()]
    if len(statements) > 1:
        raise SecurityError("only a single SQL statement may be executed")

    matches = list(re.finditer(r"[A-Za-z_][A-Za-z_0-9]*", scrubbed))
    if not matches:
        raise SecurityError("no SQL statement found")
    tokens = [m.group(0) for m in matches]

    leading = tokens[0].upper()
    if leading not in _ALLOWED_LEADING_KEYWORDS:
        raise SecurityError(f"only read-only statements are allowed; found '{leading}'")

    for match in matches:
        token = match.group(0)
        upper = token.upper()
        if upper in _FORBIDDEN_KEYWORDS:
            raise SecurityError(f"statement contains forbidden keyword '{upper}'")
        if upper in _CONTEXTUAL_KEYWORDS and not scrubbed[match.end():].lstrip().startswith("("):
            raise SecurityError(f"statement contains forbidden keyword '{upper}'")
        if token.lower() in _FORBIDDEN_FUNCTIONS:
            raise SecurityError(f"statement calls forbidden function '{token}'")

    return stripped
```

1. **The statement is validated scrubbed but returned *stripped*.** Read that twice — it's the crux. The scrubbed text is analysis material only; what actually executes is the caller's original SQL. Executing the scrubbed version would be nonsense (all the string literals are gone). This is why the scrubber can afford to be lossy.
2. Splitting on `;` happens *after* scrubbing, so a semicolon inside a string literal has already been blanked and can't fake a multi-statement error — and conversely, a real second statement can't hide inside a comment. Empty parts are filtered, so a single trailing `;` is accepted.
3. The single-statement rule matters even though Python's `sqlite3.execute()` already refuses multiple statements: it gives the AI a clear, actionable message instead of `Warning: You can only execute one statement at a time`.
4. Tokenizing with `[A-Za-z_][A-Za-z_0-9]*` means `DROP` inside `DROPPED` is one token and doesn't match — a plain substring search would have thrown false positives on column names like `update_time` and `deleted_at`, which appear constantly in real data.
5. Allowed openers are `SELECT`, `WITH`, `VALUES`. `WITH` is essential — CTEs are how a model writes readable multi-step analysis. And `WITH` is precisely why the *whole token stream* is scanned rather than only the first word: `WITH x AS (SELECT 1) DELETE FROM t` opens legally and ends badly.
6. **`REPLACE` is the one context-sensitive case** and gets its own set. It's both a mutating statement (`REPLACE INTO`) and an entirely ordinary string function (`replace(name, 'a', 'b')`). The discriminator — `scrubbed[match.end():].lstrip().startswith("(")` — is "is the next non-space character an open paren?" A function call always has one; `REPLACE INTO` never does. The `lstrip()` is doing real work: `replace (x, y, z)` with a space is legal SQL.
7. `_FORBIDDEN_FUNCTIONS` is matched case-*sensitively* via `token.lower()` against a lowercase set — so it catches `LOAD_EXTENSION`, `Load_Extension`, and `readfile` alike. These are the CLI-shell functions that touch the filesystem; most builds don't have them, but "most" isn't a security property.
8. **The comment above `_FORBIDDEN_KEYWORDS` — *"Belt-and-braces list; the authorizer is what actually enforces read-only"* — is the most important comment in the file.** It tells the next maintainer not to treat this list as the security boundary and not to panic if it's incomplete. Every keyword denylist is incomplete; that's why it isn't the mechanism.

#### The authorizer — the actual mechanism

```python
_ALLOWED_ACTIONS = frozenset({
    sqlite3.SQLITE_SELECT,
    sqlite3.SQLITE_READ,
    sqlite3.SQLITE_FUNCTION,
    sqlite3.SQLITE_RECURSIVE,
})

def _authorizer(action, arg1, arg2, db_name, trigger) -> int:
    if action == sqlite3.SQLITE_FUNCTION:
        if arg2 and arg2.lower() in _FORBIDDEN_FUNCTIONS:
            logger.warning("denied SQLite function call: %s", arg2)
            return sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_OK

    if action in _ALLOWED_ACTIONS:
        return sqlite3.SQLITE_OK

    logger.warning("denied SQLite operation: %s", describe_action(action))
    return sqlite3.SQLITE_DENY
```

Fifteen lines that do more security work than the previous two hundred. Here is what's actually happening:

1. SQLite invokes this callback **during statement compilation**, once for every operation the compiled program will perform — each table read, each column read, each function call, each schema change. Returning `SQLITE_DENY` makes `prepare` fail, so the statement never runs at all. Nothing partial executes.
2. Because it operates on the *compiled semantics*, not the text, it cannot be fooled by spelling. Unicode homoglyphs, nested comments, weird quoting, a syntax you didn't anticipate — none of it matters. If the statement would perform a write, SQLite tells the callback it's about to perform a write.
3. **Deny by default.** The final `return SQLITE_DENY` means an action code that didn't exist when this was written — some future SQLite version's new operation — is denied automatically. An allowlist that fails closed is the only kind worth having.
4. `SQLITE_READ` is allowed for *all* tables and columns, including `sqlite_master`. That's deliberate: the AI needs to introspect the schema, and there's nothing in this database it isn't already allowed to query.
5. `SQLITE_RECURSIVE` is a separate action code covering recursive CTE steps. Omitting it would break `WITH RECURSIVE`, which is a legitimate analytical tool. Its presence in the allowlist is a deliberate capability grant, not an oversight.
6. The `SQLITE_FUNCTION` branch is checked first and separately because it's the one action that needs to look at its argument. `arg2` holds the function name. Everything registered on the connection is pure, so the check is only against the builtin denylist.
7. The callback returns `SQLITE_DENY`, not `SQLITE_IGNORE`. The distinction matters: `IGNORE` makes the operation silently return NULL and the query *succeeds with wrong data*. `DENY` raises. For a caller that will report the result as an answer, a silent wrong number is far worse than an error.
8. `_NAMED_DENIALS` is **not** the deny list — deny-by-default already covers every one of those codes. It's a lookup table from action code to human name, used only by `describe_action()` for the log line and the error. The comment says exactly this, and it's worth trusting: deleting the whole dict would change no behaviour except message quality.
9. Every denial is logged at WARNING. On a local single-user server this is a debugging aid rather than an audit trail, but it's how you'd find out that a client is repeatedly trying something it shouldn't.

> **Advisory vs enforced**
>
> Most "read-only" arrangements in application code are *advisory*: a wrapper, a routing rule, a connection you are expected to use. They work by convention and there is always a way around them, because the restriction lives in the same layer as the code being restricted.
>
> The authorizer is enforced one layer down, inside SQLite's own statement compiler, where application code cannot reach. There is no equivalent of "use the other connection" — the denial happens after the SQL has been parsed and before it can run, and nothing above it gets a vote.

```python
def disable_extension_loading(conn: sqlite3.Connection) -> None:
    try:
        conn.enable_load_extension(False)
    except (AttributeError, sqlite3.NotSupportedError):
        pass  # not compiled in: loading is unavailable anyway

    setconfig = getattr(conn, "setconfig", None)  # Python 3.12+
    if setconfig is not None:
        try:
            setconfig(sqlite3.SQLITE_DBCONFIG_ENABLE_LOAD_EXTENSION, False)
        except (AttributeError, sqlite3.OperationalError, sqlite3.NotSupportedError):
            pass
```

1. Two switches, because they're different switches. `enable_load_extension` controls the Python-level `load_extension()` method; `SQLITE_DBCONFIG_ENABLE_LOAD_EXTENSION` controls the SQL-level `load_extension()` function at the C level. Belt and braces on the highest-consequence capability in the file — a loaded extension is arbitrary native code in-process, past every layer above.
2. Both are wrapped because both are *optional*. `enable_load_extension` is absent entirely if Python's `sqlite3` was built without extension support (common on Linux distro packages), and `setconfig` only exists on Python 3.12+ while `pyproject.toml` supports 3.11. The `getattr(..., None)` is the version guard.
3. The bare `pass` with a comment is the right call and the comment earns it: if the API is missing, the capability is missing, so failure to disable it is not a failure. Without the comment this would read as swallowed errors.

## Module 5 — `database.py` (210 lines)

**imports:** `.casting`, `.security` · **job:** connections, deadlines, and small SQL helpers

Thin by design. It assembles the pieces from `casting` and `security` into two kinds of connection, and adds the one thing neither of them can provide: a time limit.

#### The writable connection

```python
def connect_writable(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), isolation_level=None, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    disable_extension_loading(conn)
    register_try_functions(conn)
    return conn
```

1. **`isolation_level=None` is autocommit mode**, and it's the single most consequential argument here. By default, Python's `sqlite3` module implicitly opens a transaction before any DML and leaves it open until you call `commit()` — a legacy behaviour that surprises people constantly. Setting it to `None` turns that off: statements run immediately, and `BEGIN`/`COMMIT` mean what they say. The importer relies on this to wrap exactly its insert loop in one transaction and nothing else.
2. `check_same_thread=False`: the MCP SDK runs sync tool functions in an anyio worker thread, and the thread isn't guaranteed to be the one that imported the module. Since every connection here is created and closed inside a single tool call, it never actually crosses threads — this flag just stops `sqlite3`'s conservative guard from firing on a false positive.
3. `journal_mode=WAL` is a *persistent* property written into the database file, not a per-connection setting — running it on every connect is idempotent and cheap. WAL lets one writer and many readers coexist, which is what makes the read-only connection usable while an import is in flight.
4. `synchronous=NORMAL` (rather than the default `FULL`) skips an `fsync` per commit. Under WAL the durability cost is bounded: you can lose the most recent transactions on an OS crash or power loss, but the database *cannot* corrupt. For a local analysis tool whose source of truth is a CSV file sitting right there, that's an obviously correct trade — a lost import is re-runnable.
5. The last two calls apply the security and casting decorations. Order matters here only in that both must happen before any user SQL runs.

#### The read-only connection

```python
def connect_read_only(path: Path) -> sqlite3.Connection:
    if not path.exists():
        raise FileNotFoundError(f"database does not exist yet: {path}")

    uri = f"{path.resolve().as_uri()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True, isolation_level=None, check_same_thread=False)
    conn.execute("PRAGMA query_only=ON")
    disable_extension_loading(conn)
    register_try_functions(conn)
    install_read_only_authorizer(conn)
    return conn
```

**The order of these five lines is the security property.** The docstring says so and it is not being modest.

1. `path.resolve().as_uri()` produces a correctly percent-encoded `file://` URI. Hand-building `f"file:{path}?mode=ro"` breaks on spaces and on Windows drive letters — and worse, a `?` or `#` in the path would be parsed as a URI delimiter and silently change the query parameters. `as_uri()` handles all of it.
2. `mode=ro` requires `uri=True`; without that flag the whole string is treated as a literal filename and you'd get a file named `file:///...?mode=ro`. Silent and confusing.
3. **`PRAGMA query_only=ON` must run before the authorizer is installed** — because the authorizer denies `SQLITE_PRAGMA`. Install them the other way round and your own hardening pragma is rejected by your own hardening. This is a genuinely easy mistake and the comment in the source calls it out.
4. Which means the sequence is self-consistent in one direction only: OS-level lock, then engine-level lock, then extensions off, then functions registered (also a pre-authorizer operation), then the authorizer, which locks the door behind itself.
5. The `FileNotFoundError` guard exists because `mode=ro` does *not* create a missing file — it fails with an unhelpful "unable to open database file". The explicit check gives a message that says what to do.

#### The deadline

```python
PROGRESS_HANDLER_OPS = 10_000

def set_deadline(conn: sqlite3.Connection, seconds: float) -> None:
    deadline = time.monotonic() + seconds

    def handler() -> int:
        return 1 if time.monotonic() > deadline else 0

    conn.set_progress_handler(handler, PROGRESS_HANDLER_OPS)
```

1. SQLite calls `handler` every 10,000 virtual-machine instructions. Returning non-zero aborts the running statement, which surfaces in Python as `sqlite3.OperationalError("interrupted")`.
2. **`time.monotonic()`, not `time.time()`.** A monotonic clock cannot go backwards; a wall clock can, when NTP corrects it or the laptop wakes from sleep. With `time.time()`, an NTP step backwards mid-query would extend the deadline arbitrarily, and a step forwards would kill a healthy query. This is the correct primitive for measuring elapsed time and the codebase uses it consistently.
3. `deadline` is captured by closure at `set_deadline` time, so the handler is a tiny, allocation-free comparison. It runs potentially millions of times, so it needs to be cheap — this is why there's no logging or bookkeeping inside it.
4. 10,000 is a tuning choice: too low and you pay Python-callback overhead constantly; too high and the deadline overshoots. It's roughly sub-millisecond granularity on modern hardware.
5. **The granularity is VM steps, not wall time.** A statement stuck inside one long-running C operation — a huge sort, a slow filesystem read — can overshoot. This is a best-effort timeout, not a hard one, and that's inherent to the mechanism rather than a flaw in the code.
6. `clear_deadline` is always called from a `finally` block (see `execute_query` and `exporter.export_query`). A handler left installed would keep firing against a stale deadline on the next statement — which, since these connections are per-call, would be harmless, but the discipline is right.

#### Two ways to get column names

```python
def table_columns(conn, table_name) -> list[tuple[str, str]]:
    """Uses PRAGMA, so it needs a writable connection: the read-only
    connection's authorizer denies pragmas. Use column_names() there."""
    rows = conn.execute(f"PRAGMA table_info({quote(table_name)})").fetchall()
    return [(row[1], row[2] or "TEXT") for row in rows]

def column_names(conn, table_name) -> list[str]:
    """Column names via an empty SELECT, which read-only connections allow."""
    cursor = conn.execute(f"SELECT * FROM {quote(table_name)} LIMIT 0")
    return [d[0] for d in cursor.description or []]
```

This pair is my favourite thing in the module, because it's a direct, visible consequence of a decision made two files ago.

1. The authorizer denies `SQLITE_PRAGMA` without exception. So the natural way to introspect a table — `PRAGMA table_info` — simply doesn't work on the connection the AI uses. Rather than punching a hole in the authorizer for one pragma, the code finds another way.
2. `SELECT * ... LIMIT 0` compiles the statement, populates `cursor.description`, and returns zero rows. The column names come from the compiled result metadata at no I/O cost. It's the standard trick for "describe this result set".
3. The cost of the workaround is that `column_names` can only return names, not declared types — `cursor.description` in `sqlite3` has type `None` in every field but the first. That's fine here because *every column is TEXT by construction*, so there's no information to lose.
4. `row[2] or "TEXT"` in `table_columns` handles SQLite's typeless columns: `CREATE TABLE t(a)` is legal and yields an empty declared type. Defaulting to TEXT keeps the profiler's `storage_type` field honest rather than blank.
5. `cursor.description or []` guards the case where description is `None`, which happens for non-row-returning statements. Defensive, but free.

#### Deletion and disk

```python
def vacuum(conn: sqlite3.Connection) -> None:
    """Dropping a table leaves its pages on the free list; only VACUUM shrinks
    the file on disk, which is half the point of deleting a table."""
    checkpoint_wal(conn)
    conn.execute("VACUUM")
```

1. `DROP TABLE` returns pages to SQLite's internal free list. The file on disk does not shrink by one byte. A user who deletes a 4 GB table to reclaim space and sees no change would reasonably conclude the tool is broken.
2. `VACUUM` rebuilds the entire database into a new file and swaps it. That means it **temporarily needs roughly double the database size in free disk space** — worth knowing before running it on a nearly-full disk, and something the tool doesn't currently check.
3. The WAL checkpoint comes first because `VACUUM` cannot run with an outstanding write-ahead log, and because a size measured with a WAL outstanding is meaningless.

```python
def database_size_bytes(path: Path) -> int:
    total = 0
    for candidate in (path, path.with_name(path.name + "-wal")):
        if candidate.exists():
            total += candidate.stat().st_size
    return total
```

1. A WAL database is *two* files. Reporting only `main.sqlite` would understate the space used, sometimes dramatically after a large import.
2. The `-shm` shared-memory file is deliberately excluded — it's small, transient, and often on tmpfs rather than disk, so counting it would be misleading in the other direction.
3. `path.with_name(path.name + "-wal")` rather than string concatenation keeps it a `Path` and works on any platform.

#### `execute_query`

```python
started = time.monotonic()
set_deadline(conn, timeout_seconds)
try:
    cursor = conn.execute(sql)
    rows = cursor.fetchmany(max_rows + 1)
    columns = [d[0] for d in cursor.description] if cursor.description else []
except sqlite3.OperationalError as exc:
    if "interrupted" in str(exc).lower():
        raise QueryTimeout(...) from exc
    raise
finally:
    clear_deadline(conn)

truncated = len(rows) > max_rows
if truncated:
    rows = rows[:max_rows]
```

1. **`fetchmany(max_rows + 1)` — the plus one is the whole trick.** Fetch exactly the cap and you cannot distinguish "there were exactly 1,000 rows" from "there were a million and you saw 1,000". Fetching one extra answers the question definitively at the cost of one row, and lets `truncated: true` be reported honestly. That flag is what tells the AI to aggregate further instead of confidently summarizing a truncated result.
2. Detecting the timeout by **substring-matching the exception message** is fragile and the code knows it — SQLite could reword "interrupted", and a genuinely different `OperationalError` containing that word would be misclassified. Python's `sqlite3` doesn't expose a distinct exception class or an error code for interruption, so there isn't a better option available. Worth a comment; it doesn't have one.
3. The bare `raise` in the else branch re-raises the original with its traceback intact, so a real SQL error still reaches `server.query_sql` and gets reported as a SQL error rather than a timeout.
4. `clear_deadline` in `finally` runs on both paths.
5. Rows are converted with `[list(row) for row in rows]` because `sqlite3` yields tuples, and tuples serialize to JSON as arrays anyway — but the explicit conversion makes the return value plainly JSON-shaped rather than depending on the serializer's tuple handling.
6. `execution_time_seconds` is rounded to 4 decimals. It's returned to the AI so it can tell whether a slow answer means "add a filter".

## Module 6 — `catalog.py` (300 lines)

**imports:** `json`, `sqlite3`, `datetime`, `pathlib` · **job:** the server's own bookkeeping, in its own file

Four tables in a *separate* SQLite database. The docstring gives the reason in one line: *"so that server metadata never mixes with the analytical tables the AI queries."*

That separation buys three things. The AI's `list_tables()` can't accidentally surface `column_profiles` as if it were user data. The read-only authorizer covers only the analytical database, so the catalog can be written freely without weakening anything. And `VACUUM` on the analytical database — which rebuilds the entire file — doesn't touch the catalog at all.

#### The schema

```sql
CREATE TABLE IF NOT EXISTS sources (
    source_id     TEXT PRIMARY KEY,   -- SHA-256 of the file contents
    filename      TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    modified_at   TEXT,
    sha256        TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at  TEXT NOT NULL
);
```

1. **The primary key is the content hash, not a path and not an autoincrement.** This is the central modelling decision of the whole project. The same bytes are the same source however they're named or wherever they sit, so renaming a CSV or copying it to a second folder produces no duplicate work.
2. `sha256` duplicates `source_id` — `record_source` passes `source_id` into both. Redundant today; readable as documentation of what the opaque-looking key actually is. A reasonable person could argue either way about keeping it.
3. `first_seen_at` and `last_seen_at` both get `now` on insert, but the `ON CONFLICT` clause updates only `last_seen_at` — so first-seen genuinely means first. Standard upsert bookkeeping, correctly implemented.
4. Every timestamp is TEXT holding an ISO-8601 string. SQLite has no date type; ISO-8601 sorts lexicographically in the same order it sorts chronologically, which makes `ORDER BY imported_at` correct for free.

```sql
CREATE TABLE IF NOT EXISTS imports (
    table_name    TEXT PRIMARY KEY,
    source_id     TEXT NOT NULL REFERENCES sources(source_id),
    ...
);
CREATE INDEX IF NOT EXISTS imports_source_idx ON imports(source_id);
```

1. Keying on `table_name` encodes the invariant "one row per analytical table". The relationship is many-imports-to-one-source, because `force=True` can produce a second table from the same file — hence the index on `source_id` for the reverse lookup.
2. **The `REFERENCES` clause is declared but not enforced.** SQLite disables foreign keys by default, and nothing here runs `PRAGMA foreign_keys=ON`. So the constraint is documentation. In practice the code maintains it by hand — see `delete_source_if_unreferenced`, which is essentially a manual `ON DELETE RESTRICT`.
3. Turning foreign keys on would be a one-line change in `catalog.connect()` and would make the invariant real. Worth doing.

```sql
CREATE TABLE IF NOT EXISTS column_profiles (
    ...
    sample_values    TEXT NOT NULL,   -- JSON array
    invalid_examples TEXT NOT NULL,   -- JSON array
    PRIMARY KEY (table_name, column_name)
);
```

1. The composite primary key is exactly the natural key, so `replace_column_profiles` can delete-then-insert without any risk of orphans or duplicates.
2. Two columns hold JSON as TEXT with a comment saying so. The `get_*` functions `json.loads` them on the way out and `replace_column_profiles` `json.dumps` them on the way in, so the boundary is clean and symmetric. Using SQLite's JSON1 functions would be an option; storing opaque blobs is simpler and nothing queries inside them.
3. Note that `distinct_count` is the one nullable numeric column, and it's paired with `distinct_count_approximate INTEGER NOT NULL DEFAULT 0` — a boolean-as-integer flag saying "this is a floor, not an exact count". Encoding uncertainty next to the number rather than in a comment is the right instinct; the profiler section explains when it fires.

#### Connection setup

```python
def connect(catalog_path: Path) -> sqlite3.Connection:
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(catalog_path), isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn
```

1. `row_factory = sqlite3.Row` gives index-*and*-name access, which is why the rest of the module can write `row["table_name"]` and `dict(row)`. The analytical connections deliberately don't set this — there the results go straight to JSON as positional arrays.
2. `executescript(SCHEMA)` on *every* connect is the migration strategy: idempotent DDL, run constantly. It works because every statement is `IF NOT EXISTS` and there is exactly one schema version in existence.
3. Note there is no `register_try_functions` and no authorizer here. The catalog is never exposed to AI-written SQL, so it needs neither.

> **The limit of this approach**
>
> Idempotent DDL handles *adding* a table or an index. It cannot add a column to an existing table, change a type, or backfill. The first time this project ships a schema change to a user who already has a `catalog.sqlite`, that user gets a runtime error on a missing column — because `CREATE TABLE IF NOT EXISTS` looks at the name only and silently does nothing.
>
> The fix, when it's needed, is small: a `PRAGMA user_version` integer and a list of migration functions indexed by it. Not needed at 0.1.0. Worth writing down before it is.

#### `replace_column_profiles` — the one place with a transaction

```python
conn.execute("BEGIN")
try:
    conn.execute("DELETE FROM column_profiles WHERE table_name = ?", (table_name,))
    conn.executemany(f"INSERT INTO column_profiles ({...}) VALUES ({placeholders})", rows)
    conn.execute("COMMIT")
except Exception:
    conn.execute("ROLLBACK")
    raise
```

1. Delete-then-insert is atomic here, so a failure halfway cannot leave a table with *some* of its columns profiled — which would be worse than none, because `profile_table()` checks "are there any profiles?" and would treat a partial set as complete.
2. The explicit `BEGIN`/`COMMIT`/`ROLLBACK` is only possible because of `isolation_level=None` on the connection. In default mode, `sqlite3` would already have opened its own transaction and the explicit `BEGIN` would raise.
3. `except Exception: rollback; raise` — the bare `raise` preserves the original traceback. Rolling back and swallowing would hide a bug; rolling back and re-raising is correct.
4. `_PROFILE_COLUMNS` is a module-level tuple used to build both the column list and the value tuple: `tuple(record[name] for name in _PROFILE_COLUMNS)`. This guarantees the two orders can never drift — a positional-INSERT bug that's otherwise very easy to introduce and very annoying to find, because it fails as wrong data rather than an error.

#### Reference counting by hand

```python
def delete_source_if_unreferenced(conn, source_id: str) -> bool:
    if count_imports_for_source(conn, source_id):
        return False
    conn.execute("DELETE FROM sources WHERE source_id = ?", (source_id,))
    return True
```

1. Because foreign keys aren't enforced, this is the manual version. Called from `delete_table` *after* the import row is deleted, so the count reflects the post-deletion state.
2. Returning a bool rather than nothing lets `delete_table` report `catalog_source_record_removed` truthfully in its response — the tool tells the user exactly what it did, including the parts they didn't ask about.
3. Not atomic with the `delete_import` that precedes it. With one writer, unreachable; with two, you could delete a source another import still needs. See the concurrency note at the end.

## Module 7 — `importer.py` (371 lines)

**imports:** `.catalog`, `.config`, `.database`, `.security` · **job:** CSV to SQLite in one pass, bounded memory

The largest module after the server, and the one with the most going on per line. Two ideas dominate: **one pass over the file does everything**, and **identity is the content hash**.

```python
csv.field_size_limit(10 * 1024 * 1024)
```

1. A **module-level, process-global** mutation of the `csv` module's state. The default limit is 128 KiB, which real CSVs with embedded documents or base64 blobs exceed. Raising it to 10 MiB keeps those importable while still bounding a single field, so a malformed quote that swallows the rest of the file fails with a clear error instead of allocating gigabytes.
2. Because it's global, it also applies to `exporter.py`'s CSV writer and to anything else in the process using `csv`. Acceptable in a single-purpose server; the kind of thing that would need scoping in a library.

#### `HashingReader`

```python
class HashingReader(io.RawIOBase):
    def __init__(self, stream: BinaryIO) -> None:
        self._stream = stream
        self.hasher = hashlib.sha256()
        self.bytes_read = 0

    def readable(self) -> bool:
        return True

    def readinto(self, buffer: Any) -> int:
        chunk = self._stream.read(len(buffer))
        if not chunk:
            return 0
        buffer[: len(chunk)] = chunk
        self.hasher.update(chunk)
        self.bytes_read += len(chunk)
        return len(chunk)
```

Nineteen lines that save an entire pass over the file. If you take one implementation technique away from this codebase, take this one.

1. The naive design reads the file twice: once to hash, once to parse. On a 4 GB CSV that's an extra 4 GB of I/O. This class makes hashing a side effect of the read the parser is doing anyway.
2. **Subclassing `io.RawIOBase` and implementing `readinto` is the whole contract.** `RawIOBase` provides `read()`, `readall()` and the rest of the file-like API in terms of `readinto`, so implementing that one method plus `readable()` yields an object that `BufferedReader` and `TextIOWrapper` will accept without complaint.
3. `readinto` takes a caller-supplied writable buffer and fills it, rather than allocating and returning bytes. That's why it's the primitive: it lets the buffering layer above reuse one allocation for the whole file.
4. `buffer[: len(chunk)] = chunk` is a slice assignment into a `memoryview`-like object. Assigning the full `buffer[:] = chunk` would raise on a short read at EOF — the sizes wouldn't match. Slicing to the actual length is required, not stylistic.
5. Returning `0` signals EOF to the layer above. Returning `None` would mean "no data available right now" (non-blocking), which would make `BufferedReader` behave very strangely on a regular file.
6. `bytes_read` is maintained alongside the hash, which is how `ImportResult.bytes_read` gets a real figure rather than a `stat()` guess.

#### The reader stack

```python
with path.open("rb") as raw_handle:
    hashing = HashingReader(raw_handle)
    stream = io.TextIOWrapper(
        io.BufferedReader(hashing, buffer_size=config.read_chunk_bytes),
        encoding=DEFAULT_ENCODING,
        errors="replace",
        newline="",
    )
    reader = csv.reader(stream, delimiter=delimiter)
```

```text
open("rb")            raw bytes
  → HashingReader     sha256 += chunk
  → BufferedReader    1 MiB chunks
  → TextIOWrapper     utf-8-sig decode
  → csv.reader        list[str] rows

bytes are pulled through on demand — nothing holds more than one buffer
```

*Each layer pulls from the one below only when the layer above asks. Peak memory is one 1 MiB buffer plus one 5,000-row insert batch, whatever the file size.*

1. `DEFAULT_ENCODING = "utf-8-sig"` strips a UTF-8 byte-order mark if present. Excel writes one; without this the first column header would be `﻿Order Date` and every subsequent lookup by that name would fail in a way that looks like magic.
2. `errors="replace"` means a byte sequence that isn't valid UTF-8 becomes `U+FFFD` rather than raising. A single bad byte 3 GB into a file should not abort a ten-minute import. The damage is confined to one cell and remains visible as a replacement character.
3. **`newline=""` is mandatory, not optional.** The `csv` module documentation is explicit: without it, universal-newline translation converts `\r\n` to `\n` before `csv` sees it, which corrupts any field containing a quoted embedded newline. This is a real, silent data-corruption bug and it's one line to avoid.
4. The BOM is stripped by the decoder, *after* the hasher has already seen those bytes. So the hash covers the file exactly as it exists on disk, which is the correct definition of file identity.

#### The insert loop

```python
db_conn.execute(f"CREATE TABLE {quote(staging)} ({column_sql})")
placeholders = ", ".join("?" * len(columns))
insert_sql = f"INSERT INTO {quote(staging)} VALUES ({placeholders})"

db_conn.execute("BEGIN")
try:
    batch: list[tuple[str | None, ...]] = []
    for row, is_malformed in _iter_rows(reader, len(columns), config.null_markers):
        if is_malformed:
            malformed += 1
        batch.append(row)
        if len(batch) >= config.insert_batch_size:
            db_conn.executemany(insert_sql, batch)
            inserted += len(batch)
            batches += 1
            batch.clear()
    if batch:
        db_conn.executemany(insert_sql, batch)
        ...
    db_conn.execute("COMMIT")
except Exception:
    db_conn.execute("ROLLBACK")
    db_conn.execute(f"DROP TABLE IF EXISTS {quote(staging)}")
    raise
```

1. `", ".join("?" * len(columns))` — note that `"?" * 3` is the string `"???"`, and joining a string joins its characters, giving `"?, ?, ?"`. Concise and correct, if briefly startling.
2. **Every value is a bound parameter.** Only the table name and the column names are interpolated, and both went through `quote()`. Cell contents — which are entirely attacker-controlled if you consider an untrusted CSV — never touch the SQL string.
3. **The `CREATE TABLE` is outside the `BEGIN`.** That's why the rollback handler drops the staging table explicitly: the `ROLLBACK` undoes the inserts but not the create, which was committed in autocommit mode. Getting this wrong would leave an empty staging table behind on every failed import.
4. One transaction around the entire insert loop, not one per batch. Under WAL, each commit is an fsync-ish boundary; batching 5,000 rows per `executemany` and committing once at the end is roughly two orders of magnitude faster than autocommitting per row. The transaction stays open for the whole import, which is fine because there's one writer.
5. `batch.clear()` rather than `batch = []` reuses the list object, avoiding an allocation per batch. Marginal, but this is the hot loop.
6. The trailing `if batch:` flushes the final partial batch. Omitting it silently drops up to 4,999 rows — the classic batching bug, and one that produces no error at all.

```python
while stream.buffer.read(config.read_chunk_bytes):
    pass
source_id = hashing.hexdigest
```

1. The drain exists so the hash covers the whole file even if the CSV reader stopped short of EOF. In the current code the loop always runs to exhaustion, so this is normally a no-op — but it makes the hash's correctness independent of `csv.reader`'s internal read-ahead behaviour, which is not something you want to depend on.
2. `stream.buffer` reaches through the `TextIOWrapper` to the `BufferedReader` underneath. Reading through the text layer would decode bytes for nothing.
3. `hexdigest` is read only *after* the drain, and it's the moment the file finally has an identity. Everything before this point was done without knowing what the file is — which is exactly why the staging table exists.

#### Rows: padded, trimmed, counted

```python
def _iter_rows(reader, width, null_markers):
    for raw_row in reader:
        if not raw_row:
            continue  # truly blank line; csv.reader yields [] for these
        malformed = len(raw_row) != width
        cells = raw_row[:width] + [None] * max(0, width - len(raw_row))
        yield tuple(_clean_value(cell, null_markers) for cell in cells), malformed
```

1. One expression handles both directions: `raw_row[:width]` trims a too-long row, and the `[None] * max(0, ...)` pads a too-short one. Exactly one of the two ever does anything.
2. The generator yields `(row, malformed)` rather than logging or raising, pushing the policy decision up to the caller. The importer counts them and emits a warning; the sample-reading path in `inspect_csv` ignores the flag entirely. Same generator, two policies.
3. **Ragged rows are imported, not rejected.** This is a values decision, and it's the right one for the tool: a 2-million-row file with 12 bad rows should import, with the damage counted and surfaced in `warnings`. Aborting would make the tool useless on exactly the messy data it exists to handle.
4. `_clean_value` compares against `null_markers` with `in` on a tuple — a linear scan, but the tuple has 5 entries and the constant factor beats a set for that size. It runs once per cell, so this is a genuinely hot line.
5. Note what `_clean_value` does *not* do: it doesn't strip whitespace, doesn't parse numbers, doesn't normalize case. Only exact marker matches become NULL. Everything else is stored byte-for-byte as it appeared, which is what preserves the distinction between *missing* and *invalid* that the profiler later reports on.

#### Column names

```python
def normalize_column_names(header: list[str]) -> list[dict[str, str]]:
    columns, used = [], set()
    for index, raw in enumerate(header):
        original = (raw or "").strip()
        name = safe_table_name(original) if original else ""
        if not name:
            name = f"column_{index + 1}"
        candidate = name
        counter = 2
        while candidate in used:
            candidate = f"{name}_{counter}"
            counter += 1
        used.add(candidate)
        columns.append({"source_column": original or f"column_{index + 1}",
                        "column_name": candidate})
    return columns
```

1. **Both names are kept.** `source_column` is what the spreadsheet said; `column_name` is what SQLite will call it. The AI needs the first to understand the user's question ("what's total *Order Value*?") and the second to write SQL. Discarding the original would break that mapping and force the model to guess.
2. Deduplication is necessary because normalization is lossy: `Order Date`, `Order-Date` and `order date` all collapse to `order_date`. Without the `used` set, `CREATE TABLE` fails with "duplicate column name" — and duplicate headers are extremely common in real exports.
3. Empty headers become `column_3`, one-indexed for human legibility. Trailing empty header cells are a routine artifact of Excel exports.
4. This calls `safe_table_name` for columns, which is the naming wart noted earlier. The behaviour is right; the name is misleading.

#### Delimiter sniffing

```python
def sniff_delimiter(sample: str, default: str = ",") -> str:
    if not sample.strip():
        return default
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        return default
```

1. The candidate set is constrained to four characters. Unconstrained, `Sniffer` will happily conclude that a text column's most frequent character is the delimiter — it's a heuristic, and narrowing its search space is the main way to make it reliable.
2. `csv.Error` on an undecidable sample is caught and turned into the default. Sniffing must never be the reason an import fails; a wrong guess produces a one-column table that the user can see is wrong and fix with the explicit `delimiter=` parameter.
3. Semicolon is in the list because European Excel locales use it — in locales where the decimal separator is a comma, the CSV separator can't also be a comma.

#### Deterministic collision resolution

```python
TABLE_SUFFIX_LENGTHS = (6, 12, 64)

def deterministic_table_name(preferred, source_id, taken) -> str:
    if not taken(preferred):
        return preferred
    for length in TABLE_SUFFIX_LENGTHS:
        candidate = f"{preferred}_{source_id[:length]}"
        if not taken(candidate):
            return candidate
    raise SecurityError(...)
```

1. This is where the one-database decision from `config.py` gets paid for. Two folders can both hold `sales.csv`; both want the table `sales`.
2. **The suffix comes from the file's own hash, not a counter.** The difference is reproducibility: with a counter, importing A then B gives `sales` and `sales_2`, while B then A gives the reverse. With a hash suffix, each file's fallback name is a property of the file, so it's stable across machines, across re-imports, and across whatever order the user happens to work in.
3. Escalating lengths 6 → 12 → 64 handle the (essentially impossible) case of a 6-hex-character prefix collision. 6 hex chars is 24 bits; you'd need thousands of same-named files to make it likely. 64 is the full digest, at which point a collision means SHA-256 is broken.
4. `taken` is injected as a callable rather than the function reaching for a connection, which is why this is pure and directly testable with `lambda name: name in {"sales"}`.
5. Raising `SecurityError` for exhaustion is a slightly odd choice of exception type — nothing about it is a security condition. `RuntimeError` would read better. Practically invisible, since the branch is unreachable.

#### The endgame: staging, dedup, rename

```python
existing = catalog.find_import_by_source(catalog_conn, source_id)
if not force and existing and table_exists(db_conn, existing["table_name"]):
    db_conn.execute(f"DROP TABLE IF EXISTS {quote(staging)}")
    catalog.record_source(catalog_conn, source_id=source_id, **meta)
    return ImportResult(..., reused_existing=True, ...)

preferred = safe_table_name(table_name or Path(meta["filename"]).stem)
if force and existing:
    final_name = existing["table_name"]
    db_conn.execute(f"DROP TABLE IF EXISTS {quote(final_name)}")
    catalog.delete_import(catalog_conn, final_name)
else:
    final_name = deterministic_table_name(preferred, source_id,
                                          lambda name: table_exists(db_conn, name))

db_conn.execute(f"ALTER TABLE {quote(staging)} RENAME TO {quote(final_name)}")
```

1. **The staging table exists because the hash isn't known until EOF.** There is no way to check "have I already imported this content?" before reading the content. So the import happens speculatively into `_tmp_import_<uuid>`, and only at the end does the code learn whether that work was needed.
2. The dedup branch has three conditions and each earns its place: `not force` (the user didn't override), `existing` (the catalog knows this hash), and `table_exists` (the table is actually still there — the catalog could be stale if someone deleted the table out of band).
3. Even on the dedup path, `record_source` is called. That updates `last_seen_at`, `relative_path` and `filename` — so importing the same content under a new name teaches the catalog the new name without duplicating the table. Small touch, genuinely useful.
4. Reusing a table costs the user the full read of the file. That's unavoidable given hash-based identity, but it's why `inspect_csv` offers the cheap `already_imported_hint` based on path and size, so a client can warn before spending ten minutes.
5. **`force=True` reuses the *old* table name**, not the preferred one — so a re-import lands where any saved SQL expects it. `catalog.delete_import` also clears the stale column profiles, which would otherwise describe data that no longer exists.
6. `ALTER TABLE ... RENAME TO` in SQLite is a metadata-only operation. It does not copy rows. This is what makes the staging approach cheap enough to be the default rather than a fallback — a 4 GB staging table is promoted in microseconds.
7. The rename is not in a transaction with the catalog writes, and can't be: they're two different database files. See the concurrency note at the end.

> **Leak**
>
> If the process is killed between `CREATE TABLE staging` and the rename — SIGKILL, container stop, OOM — the staging table survives in `main.sqlite` with no catalog record and nothing to clean it up. `list_table_names()` filters out `_tmp_import_%`, so it's invisible to `list_tables()` and to `_require_table`; it just quietly occupies disk.
>
> A sweep at startup — `DROP` every table matching `_tmp_import_%` — would close this, and is safe precisely because no import can be in flight at startup.

#### `inspect_csv`

The cheap preview. `SNIFF_BYTES = 64 * 1024` — it reads 64 KiB and nothing more, however large the file.

```python
if len(prefix) == SNIFF_BYTES and "\n" in text:
    text = text[: text.rindex("\n") + 1]
```

1. A fixed-size read almost certainly lands mid-record. Truncating back to the last newline means `csv.reader` never sees half a row, which would otherwise show up as a spurious malformed record in the preview.
2. The `len(prefix) == SNIFF_BYTES` guard means this only happens when the read was actually truncated — a file smaller than 64 KiB was read completely and its last line must be kept.
3. The same condition feeds `sample_truncated` in the response, so the caller knows whether it saw the whole file. Note it's a proxy: a file of exactly 65,536 bytes reports truncated when it wasn't. Harmless.
4. The `already_imported_hint` matches on **path and size only**, and the code comments say so explicitly: *"SHA-256 during import is authoritative."* It's a fast advisory signal, deliberately labelled as a hint so nothing downstream mistakes it for a guarantee.

## Module 8 — `profiler.py` (167 lines)

**imports:** `.casting`, `.config`, `.database` · **job:** work out what each TEXT column appears to mean

The importer refuses to interpret anything. This module does the interpreting — and, crucially, **does not act on it**. The docstring is emphatic: *"The result is evidence handed to the AI — the stored data is never rewritten because of an inferred type."*

That separation is why a column that is 99.4% integers doesn't get silently converted, losing the 0.6% that weren't. Instead the profile says "INTEGER, confidence 0.994, invalid_count 61, here are five examples" and the AI decides what to do. The evidence is richer than the conversion would have been.

#### Classification

```python
def classify(value: str) -> frozenset[str]:
    return frozenset(name for name, check in _CHECKS.items() if check(value) is not None)
```

1. A value can be several things at once. `"1"` is a valid INTEGER, REAL and BOOLEAN; `"2024-01-15"` is a valid DATE and DATETIME. Returning a *set* instead of a single winner is what lets the tie be broken later, by policy, rather than here, by accident of evaluation order.
2. `frozenset` because these are cached as dict values and immutability makes that safe by construction.
3. Reuses the exact same `try_*` functions the AI will call in SQL. That's the important consistency property: if the profile says a value is a valid REAL, then `TRY_REAL` on that value in a query will succeed. A separate, "smarter" inference implementation would eventually disagree with the runtime one, and the disagreement would be silent.

#### The accumulator

```python
def add(self, value: Any) -> None:
    self.row_count += 1
    if value is None:
        self.null_count += 1
        return

    text = value if isinstance(value, str) else str(value)

    types = self._cache.get(text)
    if types is None:
        types = classify(text)
        if len(self._cache) < VALUE_CACHE_LIMIT:
            self._cache[text] = types

    for name in _CHECKS:
        if name in types:
            self.valid[name] += 1
        elif len(self.failures[name]) < FAIL_EXAMPLE_LIMIT and text not in self.failures[name]:
            self.failures[name].append(text)

    if not self.distinct_overflow:
        if text not in self.distinct:
            if len(self.distinct) >= DISTINCT_TRACK_LIMIT:
                self.distinct_overflow = True
            else:
                self.distinct.add(text)
                if len(self.samples) < 20:
                    self.samples.append(text)
```

This is the hot loop — it runs once per cell, so rows × columns times. Every line is shaped by that.

1. **NULL returns early.** A missing value is not evidence about type, so it's counted and skipped. This is what makes `type_confidence` a ratio over *non-null* values — a column that is 90% empty and 10% clean integers is confidently INTEGER, which is correct.
2. **The memoization is the performance story.** Five regex/strptime attempts per cell would be brutal on 10 million rows. But CSV columns are overwhelmingly low-cardinality — a `country` column has 200 distinct values across 10 million rows — so the cache hit rate approaches 100% and the classification cost collapses to a dict lookup. This one dict is the difference between a profile taking seconds and taking minutes.
3. Above `VALUE_CACHE_LIMIT` the cache stops *growing* but keeps *serving*. So a high-cardinality column (an ID) degrades to recomputation rather than to unbounded memory. Never evicting means the retained 50,000 entries are the first-seen ones, not the most-frequent — a plain LRU would be better, and much more complex. Reasonable place to stop.
4. Failure examples are captured **per type**, so a column can report separately why it isn't an integer and why it isn't a date. That's what `profile_column` surfaces when `invalid_count` is surprising.
5. `text not in self.failures[name]` is a linear scan of a list — O(n) — but n is capped at 20, so it's faster than maintaining a parallel set, and it keeps insertion order so the examples are the first ones encountered.
6. `FAIL_EXAMPLE_LIMIT = 20` collects more than the 5 that get reported (`profile_invalid_examples`), giving a small buffer for whichever type ends up winning.
7. **The distinct counter is a floor, not an estimate.** Past 50,000 it latches `distinct_overflow` and stops counting entirely — so the reported number is exactly 50,000 and the `distinct_count_approximate` flag says "at least this many". That's more honest than a HyperLogLog estimate would be, and much simpler. The flag is what stops the AI reading 50,000 as a fact.
8. `samples` is appended only when a *new distinct* value appears, so the samples show variety rather than 20 copies of the most common value. Small detail, big difference to how useful the output is.

#### The verdict

```python
_INFERENCE_ORDER = ("INTEGER", "REAL", "DATE", "DATETIME", "BOOLEAN")

if non_null:
    for candidate in _INFERENCE_ORDER:
        ratio = self.valid[candidate] / non_null
        if ratio >= threshold:
            logical_type = candidate
            confidence = ratio
            break
```

1. **First match wins, and the order is a specificity ordering.** Every integer is also a valid real, so INTEGER must be checked first or nothing is ever INTEGER. Every date is also a valid datetime, so DATE precedes DATETIME.
2. The `if non_null:` guard prevents division by zero on an all-NULL column, which then correctly falls through to `TEXT` at confidence 1.0 — "I'm certain this is text" is a fair reading of an empty column.
3. TEXT is the default rather than a candidate. It's not something you detect; it's what you're left with, and it's always true since everything is stored as TEXT.
4. `invalid_count` is defined as zero when the type is TEXT — no value can fail to be text. Making it `non_null - valid["TEXT"]` would be meaningless.
5. BOOLEAN sits last and is largely unreachable for `0`/`1` columns, which match INTEGER first. It fires for genuinely textual booleans — `yes`/`no`, `true`/`false`. This is precisely the gap that the unused `casting.is_textual_boolean()` looks designed to close.

#### The scan

```python
select_list = ", ".join(quote(name) for name, _ in columns)
cursor = conn.execute(f"SELECT {select_list} FROM {quote(table_name)}")
for batch in iter_batches(cursor, SCAN_BATCH):
    for row in batch:
        for accumulator, value in zip(accumulators, row):
            accumulator.add(value)
```

1. **One pass profiles every column.** The alternative — a query per column — would read the table N times. For a 50-column table that's 50× the I/O for identical information.
2. Columns are named explicitly rather than `SELECT *`, so the positional `zip` against `accumulators` is guaranteed to line up even if the table's column order were ever to differ from `PRAGMA table_info`'s.
3. `iter_batches` with `fetchmany(10_000)` means the result set is never materialized. `fetchall()` here would defeat the entire streaming design of the importer in a single line.
4. The three nested loops are unavoidable — rows × columns work is the irreducible cost of profiling. The memoized `add()` is what keeps the innermost operation to a dict lookup and five counter bumps.

> **Memory ceiling**
>
> Each accumulator can hold up to 50,000 cached strings plus 50,000 distinct strings, and there is one accumulator per column, all alive simultaneously. On a 100-column table of high-cardinality values that's a plausible several-hundred-megabyte peak — in a module whose sibling was carefully written never to hold more than 1 MiB.
>
> The bound is per-column, not global, which is the mismatch. A shared budget across accumulators, or dropping the cache once a column's hit rate proves poor, would restore the guarantee. Not a bug at typical CSV shapes; a real one at the extreme this project explicitly targets.

## Module 9 — `exporter.py` (143 lines)

**imports:** `.catalog`, `.config`, `.database`, `.security` · **job:** the escape hatch from the row cap

`query_sql` is capped at 1,000 rows to protect the conversation. When the answer *is* the dataset, this module runs the same validated SQL and streams the result to disk instead — same safety, no cap, no context cost.

#### Streaming writers

```python
def _write_csv(handle, cursor, columns) -> int:
    writer = csv.writer(handle)
    writer.writerow(columns)
    written = 0
    for batch in iter_batches(cursor, EXPORT_BATCH):
        writer.writerows(batch)
        written += len(batch)
    return written
```

1. Rows go cursor → writer with nothing accumulated in between. A 10-million-row export uses the same memory as a 10-row one.
2. `writerows` on a whole batch rather than `writerow` per row pushes the loop into the `csv` module's C implementation.
3. The file is opened with `newline=""` in the caller — the same requirement as on the read side, for the same reason: let the `csv` module control line endings, or get `\r\r\n` on Windows.

```python
def _write_json(handle, cursor, columns) -> int:
    handle.write("[")
    written = 0
    for batch in iter_batches(cursor, EXPORT_BATCH):
        for row in batch:
            if written:
                handle.write(",")
            handle.write("\n  ")
            handle.write(json.dumps(dict(zip(columns, row)), default=str))
            written += 1
    handle.write("\n]\n" if written else "]\n")
    return written
```

1. `json.dump(list_of_all_rows)` would require the whole result in memory. Writing the array's punctuation by hand and serializing one object at a time keeps it streaming — the standard technique for large JSON output, and the reason this looks lower-level than it "should".
2. `if written:` is the comma-placement guard: a separator before every element except the first. Getting this wrong produces a leading comma and invalid JSON.
3. The final line handles the empty case — `[]` versus `[\n  {...}\n]`. An unconditional `"\n]\n"` would emit `[\n]` for zero rows, which is valid but scruffy.
4. `default=str` is a safety net for a value `json` can't serialize. Given everything is TEXT, NULL, int or float, it shouldn't fire — but a stray `bytes` from a BLOB would otherwise raise *after* the file was partly written.
5. Two-space indentation makes the output diffable and human-readable, at a modest size cost. A reasonable default for a file a person is going to open.

#### Failure handling

```python
except sqlite3.OperationalError as exc:
    target.unlink(missing_ok=True)
    if "interrupted" in str(exc).lower():
        raise QueryTimeout(...) from exc
    raise
except Exception:
    target.unlink(missing_ok=True)
    raise
finally:
    clear_deadline(conn)
```

1. **A failed export leaves no file.** Without the `unlink`, a query that dies 8 minutes in leaves a plausible-looking half-written CSV in `exports/` with no indication it's incomplete — the worst possible artifact, because someone will open it and use it.
2. The broad `except Exception` catches disk-full, permission errors, encoding errors — anything at all — and cleans up before re-raising. Cleanup is the concern here, not classification.
3. `missing_ok=True` because the failure might have occurred before the file was created.
4. The timeout budget is `export_timeout_seconds` (600s), not the 30s interactive budget. Same mechanism, different number, for a job with a different audience.

#### Provenance

```python
def query_hash(sql: str) -> str:
    return hashlib.sha256(" ".join(sql.split()).encode("utf-8")).hexdigest()

def referenced_tables(sql: str, known_tables: list[str]) -> list[str]:
    tokens = set(re.findall(r"[a-z_][a-z_0-9]*", scrub_sql(sql).lower()))
    return sorted(name for name in known_tables if name.lower() in tokens)
```

1. `" ".join(sql.split())` collapses all whitespace runs to single spaces before hashing, so the same query reformatted gets the same hash. That's what makes "have I exported this before?" answerable.
2. `referenced_tables` is explicitly *best-effort* and says so. It intersects the query's identifier tokens with the set of known tables — no parsing. Good enough for a provenance record; nothing depends on it for correctness.
3. It reuses `scrub_sql` so a table name mentioned inside a string literal isn't counted. Nice reuse of the security helper for a non-security purpose.
4. Its blind spot follows from that reuse: `scrub_sql` collapses quoted identifiers to `_`, so a table referenced as `"sales"` won't be detected. The record just under-reports; nothing breaks.

> **Round-trip asymmetry**
>
> The CSV writer renders `None` as an empty field. So a NULL and an empty string are indistinguishable in an exported CSV — in a project that went to real trouble upstream to keep "missing" and "invalid" apart.
>
> It happens to round-trip: the default `null_markers` include `""`, so re-importing turns both back into NULL. But that's a coincidence of the default configuration, not a designed property, and it breaks the moment someone sets `TABULITE_NULL_MARKERS` to something that excludes the empty string. The JSON exporter has no such issue — it writes a real `null`.

## Module 10 — `confirm.py` (104 lines)

**imports:** `secrets`, `threading`, `time`, `dataclasses` · **job:** make destruction require two calls

The most interesting module in the codebase, because it's solving a problem most software doesn't have: **the caller is a language model, and the model can be talked into things.**

Ordinarily a destructive action is safe because of everything around it — a session, a form token, and above all a human who clicked a button that said Delete. Every one of those assumes the entity issuing the request is the person who wanted it. Here the caller is a model acting on instructions, and those instructions might have come from the user or from text it read inside a CSV. None of the usual guarantees survive that, so the protection has to be structural: something that cannot be satisfied by a single call, however the model was persuaded to make it.

What makes this module unusually good is that its docstring states its own limit before you can discover it yourself:

> **From the source**
>
> *"What this guarantees: no one call can delete anything, and the warning is always generated before a deletion is possible. What it cannot guarantee is that a human, rather than the model, typed the confirmation word — no server can see that. It makes the human step the path of least resistance and leaves an obvious trace when it is skipped."*

That's the correct security posture: state the property you actually have, not the one you'd like to claim. A model could in principle fabricate `confirm="DELETE"` on the second call. It cannot fabricate the *first* call, so the warning always gets generated, and a client that skipped showing it has produced a visible anomaly in its own transcript.

#### Issuing

```python
def issue(self, action: str, target: str) -> tuple[str, float]:
    token = secrets.token_urlsafe(12)
    expires_at = time.time() + self._ttl
    with self._lock:
        self._purge_locked()
        self._pending[token] = _Pending(action, target, expires_at)
    return token, expires_at
```

1. `secrets`, not `random`. `random` is a Mersenne Twister seeded predictably enough that observing outputs reveals future ones; `secrets` draws from the OS CSPRNG. The habit matters more than the threat model here.
2. `token_urlsafe(12)` is 12 random bytes — 96 bits — rendered as 16 URL-safe characters. Short enough to appear in a JSON response without noise, far beyond guessable.
3. Purging on every issue means expiry is enforced lazily, with no background thread. Correct for a store that only ever holds a handful of entries.
4. The token records `(action, target)`, not just "some deletion was approved" — which is what makes the check in `consume` meaningful.
5. `time.time()` here, not `time.monotonic()` — a deliberate difference from `database.set_deadline`. This timestamp is returned to the caller and rendered as a human-readable UTC time in the tool response, which requires a wall clock. The cost is that a system clock jump changes when tokens expire; for a 5-minute TTL on a local server, immaterial.

#### Consuming

```python
def consume(self, token, action, target, confirmation) -> None:
    if confirmation is None or confirmation.strip() != CONFIRMATION_WORD:
        raise ConfirmationError(
            f"this action requires the user to type {CONFIRMATION_WORD} "
            f"(exactly, in capitals); pass it as confirm=\"{CONFIRMATION_WORD}\" "
            "only after they have actually typed it")
    if not token:
        raise ConfirmationError(
            "missing confirmation_token: call this tool without a confirmation "
            "first, show the user the warning it returns, and use the token from it")

    with self._lock:
        self._purge_locked()
        pending = self._pending.get(token)
        if pending is None:
            raise ConfirmationError(
                "confirmation_token is unknown, already used or expired; "
                "start again without a confirmation to get a fresh warning")
        if pending.action != action or pending.target != target:
            raise ConfirmationError(
                f"confirmation_token was issued for '{pending.target}', not '{target}'")
        del self._pending[token]  # single use
```

1. **Both halves are required and they prove different things.** The token proves a warning was generated for this exact target. The word proves someone answered it. Either alone is insufficient: a token without the word means the warning was never answered; the word without a token means the warning was never shown.
2. `confirmation.strip() != CONFIRMATION_WORD` is **case-sensitive** — `"delete"` is rejected, `"DELETE"` is accepted. Requiring capitals makes it a deliberate act rather than something typed in the flow of conversation. `.strip()` forgives surrounding whitespace, which is a typing artifact and not a signal of intent.
3. **Target binding.** A token issued for `sales` cannot delete `customers`. This closes the confused-deputy hole where a model holds a valid token and applies it to the wrong table — genuinely plausible in a conversation discussing several tables.
4. `del self._pending[token]` makes it **single-use**. A token can't be replayed to delete a second table, or the same table twice after a re-import.
5. Every error message says what to do next, not just what went wrong. Since the reader is a model that will attempt to self-correct, "start again without a confirmation to get a fresh warning" is worth more than "invalid token" — the error text is part of the API.
6. The word is checked before the token, so a caller that fabricated `confirm` with no token gets told about the word first. Arguably backwards for debugging, but it puts the human-involvement requirement first in every failure message, which is the message that matters.

#### The registry

```python
self._lock = threading.Lock()

def _purge_locked(self) -> None:
    now = time.time()
    for token in [t for t, p in self._pending.items() if p.expires_at <= now]:
        del self._pending[token]
```

1. This is the **only shared mutable state in the entire process**, and the only place a lock appears. Everything else is per-call. Worth noting how much that simplifies reasoning about the rest of the code.
2. The lock is needed because the MCP SDK dispatches tool calls on worker threads, so two `delete_table` calls genuinely can interleave here.
3. The `_locked` suffix is a naming convention meaning "caller must hold the lock". `threading.Lock` is not reentrant, so a method that acquired the lock itself would deadlock when called from `issue` or `consume`. The name is the entire defence against that, and it's used consistently.
4. The list comprehension materializes the expired keys *before* deleting. Mutating a dict while iterating it raises `RuntimeError`; this is the standard idiom for avoiding that.
5. `expires_at <= now` — inclusive, so a token expiring exactly now is gone. The right direction to round.
6. Tokens live in memory only. A restart cancels every pending confirmation, which the class docstring calls *"the safe direction to fail"* — and it is: the worst outcome is a user being asked to confirm twice.

## Module 11 — `server.py` (592 lines)

**imports:** everything · **job:** nine tools, one health check, and the docstrings that teach the model

The rind. It contains no analysis logic at all — every tool is a few lines of validation, a context manager, a call into a lower module, and a dict. What it *does* contain, and what deserves the most attention, is prose: the tool docstrings are shipped to the model as the API description, and they're doing as much work as the code.

#### Module-level state

```python
CONFIG = Config.from_env()
SOURCE_SUFFIXES = {".csv", ".tsv"}
CONFIRMATIONS = ConfirmationRegistry()
```

1. Config is read **once, at import time**, so environment changes need a restart. The testing consequence is the one that bites: setting an environment variable inside a test does nothing, because `from_env()` already ran at import. Tests have to monkeypatch `server.CONFIG` directly, or build a fresh `Config` with `dataclasses.replace()`.
2. `CONFIRMATIONS` is process-global, which is what makes the two-step delete work across two separate tool calls. It also means a restart between the calls invalidates the token — see above.
3. `SOURCE_SUFFIXES` as a set gives O(1) membership in the `list_sources` loop, which may walk thousands of files.

#### The instructions block

```python
INSTRUCTIONS = """\
A local SQLite runtime sitting next to large CSV files.

Typical flow: list_sources -> import_source -> profile_table -> query_sql, and
export_query when the final result is too large for the conversation.

CSV fields are stored as TEXT. Use the TRY_* functions in your SQL...
They return NULL for missing or malformed values instead of the misleading
zeros ordinary CAST() produces, so AVG()/SUM() skip them. Check denominators
with COUNT(TRY_REAL(col)) against COUNT(*) when a number matters.

Aggregate inside SQLite rather than pulling raw rows: query_sql is row-capped.
..."""
```

This string is sent to the model during the MCP handshake, before any tool is called. It is, functionally, the system prompt for this server — and it's written the way good documentation is written, not the way prompts usually are.

1. It leads with the **happy path as a sequence**. A model that reads only the first two lines still knows the right order to call things in.
2. The `CAST` warning is here rather than only in `query_sql`'s docstring, because by the time a model is writing SQL it may not re-read the tool description. This is the one thing that most needs to land early.
3. *"Check denominators with COUNT(TRY_REAL(col)) against COUNT(*)"* teaches a specific, copyable technique. Compare to a vaguer "be careful with nulls" — this one changes what gets written.
4. *"Aggregate inside SQLite rather than pulling raw rows"* states the intended usage pattern up front, which is more effective than only enforcing it with a cap and an error afterwards.
5. The `"""\` opening escapes the first newline so the string starts at the first real character. Small, and correct.

#### Connection plumbing

```python
def _bootstrap() -> None:
    CONFIG.ensure_directories()
    conn = database.connect_writable(CONFIG.database_path)
    conn.close()
    catalog.connect(CONFIG.catalog_path).close()

@contextlib.contextmanager
def _writable() -> Iterator[tuple[sqlite3.Connection, sqlite3.Connection]]:
    _bootstrap()
    db = database.connect_writable(CONFIG.database_path)
    cat = catalog.connect(CONFIG.catalog_path)
    try:
        yield db, cat
    finally:
        db.close()
        cat.close()
```

1. `_bootstrap` runs on *every* tool call, not just at startup. It creates directories and opens/closes both databases. That's a handful of syscalls — negligible against any real work, and it means `connect_read_only`'s "database does not exist yet" error can never fire for a first-time user, which would otherwise be the very first thing they saw.
2. Every connection is created and destroyed per call. No pool. For a single-user local server this is the right simplicity trade, and it's *required* for the read-only connection anyway, since the authorizer and the `TRY_*` functions are per-connection state.
3. The two context managers differ in exactly one line — writable vs read-only — which makes the choice at each call site a one-word declaration of intent. Reading the tool bodies, you can see immediately which ones can mutate.
4. The `finally` closes both connections even if the body raises. Note that if `db.close()` itself raised, `cat` would leak — a nested `try` would be strictly correct. Immaterial in practice; `sqlite3.close()` essentially doesn't fail.

```python
def _fail(exc: Exception) -> ToolError:
    """ToolError messages reach the model (unlike arbitrary exceptions, which
    the SDK masks), so the AI can correct its own SQL or path."""
    return ToolError(str(exc))
```

1. This is the single most important line of error-handling policy in the file. The MCP SDK deliberately masks arbitrary exceptions — leaking a stack trace to a client is a disclosure risk. `ToolError` is the sanctioned channel for a message that *should* reach the caller.
2. Which is why the careful error strings in `security.py` and `confirm.py` matter at all: they only reach the model because every anticipated failure goes through here.
3. It *returns* rather than raises, so call sites read `raise _fail(exc) from exc`. The `from exc` preserves the chain for the server's own logs while the model sees only the message. Both audiences served.
4. The distinction being enforced is **anticipated vs unanticipated**. `SecurityError`, `ConfirmationError` and `QueryTimeout` are things a caller can act on. A `KeyError` is a bug, and the model can't fix it — masking it is right.

#### The tools

| Tool | Conn | Notes worth having |
| --- | --- | --- |
| `list_sources` | catalog only | `rglob("*")` walks recursively; hidden files (`.`-prefixed) and non-CSV/TSV suffixes are skipped. Three-state `import_status`: not imported / imported / **changed since import** — that third state comes from comparing recorded `size_bytes` to the current stat, and it's the one that stops a user reasoning about stale data. |
| `inspect_source` | catalog only | Path resolved through `resolve_source_path` first. Reads 64 KiB, never more. |
| `import_source` | writable | Import *and* profile in one call, so a table is never left unprofiled. Returns a `profile_summary` — just name, type, cast — so the model can write correct SQL immediately without a second round trip. |
| `list_tables` | read-only | Joins live schema against catalog records. A table present in SQLite but absent from the catalog still appears, just without provenance — the database is the source of truth about what exists. |
| `profile_table` | writable | Writable because a cache miss recomputes and writes profiles. `refresh=True` forces it. |
| `profile_column` | writable | The drill-down: returns the full record including `invalid_examples`. Same lazy-compute path. |
| `sample_table` | read-only | `limit` validated `>= 1`, clamped to `max_sample_rows`, then `int()`-cast before interpolation. Belt and braces on an already-validated integer. |
| `query_sql` | read-only | The main event. Validate, execute, cap, report truncation. |
| `export_query` | read-only | Same validation, no cap, streams to disk. |
| `delete_table` | writable | The only destructive tool, and the only one with `ToolAnnotations`. |

#### Two-phase profile lookup

```python
profiles = [] if refresh else catalog.get_column_profiles(cat, table_name)
if not profiles:
    record = catalog.get_import(cat, table_name)
    source_id = record["source_id"] if record else ""
    computed = profiler.profile_table(db, table_name, source_id, CONFIG)
    catalog.replace_column_profiles(cat, table_name, computed)
    profiles = catalog.get_column_profiles(cat, table_name)
```

1. Read-through cache with an explicit invalidation flag. Profiling a large table is a full scan, so caching is what makes `profile_table` callable freely in conversation.
2. `source_id = ... if record else ""` — a table can exist without a catalog record (imported by an older version, or the catalog was deleted). Profiling still works; the profile just isn't attributed to a source. Degrading rather than failing is right here.
3. Note the re-read after the write: `computed` is discarded and `get_column_profiles` is called again. That's deliberate — the round trip through the database adds `profiled_at` and normalizes the JSON columns, so both branches return an identically-shaped dict. Without it, the fresh and cached paths would differ in subtle ways.

#### `delete_table` — reading the shape

```python
with _writable() as (db, cat):
    _require_table(db, table_name)
    record = catalog.get_import(cat, table_name)
    source_id = record["source_id"] if record else None
    source = catalog.get_source(cat, source_id) if source_id else None
    rows = database.row_count(db, table_name)
    columns = [name for name, _ in database.table_columns(db, table_name)]
    profiles = catalog.get_column_profiles(cat, table_name)

    source_path = source["relative_path"] if source else None
    source_present = bool(source_path and (CONFIG.source_dir / source_path).is_file())

    if confirm is None and confirmation_token is None:
        # ... step 1: warn and issue a token
    # ... step 2: consume, then destroy
```

1. **All the facts are gathered before the branch**, so the step-1 warning describes exactly what step 2 will destroy. If the counts were gathered separately in each branch they could drift, and the warning would be a guess.
2. **`source_present` is the most thoughtful line in the file.** It checks whether the original CSV is still on disk, and the warning text changes completely depending on the answer: if present, "the table could be rebuilt with import_source() afterwards"; if not, "this table CANNOT be re-imported. Deleting it destroys the only copy of this data held by this server." Same operation, two genuinely different levels of consequence — and the tool tells the truth about which one you're in.
3. The gate is `confirm is None and confirmation_token is None`, so *either* argument routes to step 2. A caller passing only a token gets "you must type DELETE"; a caller passing only the word gets "missing confirmation_token". Both are informative, neither is a silent success.
4. The step-1 response includes `next_step` with the literal call to make, token interpolated via `{token!r}`. It's a script for the caller. Combined with `will_delete` and `will_keep`, the response is designed to be shown to a human, not just parsed.
5. `ToolAnnotations(read_only_hint=False, destructive_hint=True, idempotent_hint=False)` is MCP protocol metadata — machine-readable "this is dangerous", which a client can use to require its own confirmation UI. Belt and braces alongside the token dance.
6. The deletion order is: drop table → delete import → maybe delete source → vacuum. Facts are captured first, so the response can report row counts for a table that no longer exists.
7. `size_after` is computed **after** the `with` block exits and the connection closes, with a comment saying why: *"so it matches the file on disk"*. A size read with the connection open can reflect pages not yet released. This kind of care about a cosmetic number is a good tell for the rest of the codebase.
8. `rows`, `columns` and `profiles` are still in scope after the `with` — Python has function scope, not block scope. Used deliberately here, and it works.

#### Transport

```python
server.run(
    transport="streamable-http",
    host=CONFIG.host,
    port=CONFIG.port,
    streamable_http_path="/mcp",
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=list(CONFIG.allowed_hosts),
        allowed_origins=list(CONFIG.allowed_origins),
    ),
)
```

**DNS rebinding** is the attack this defends against, and it's worth understanding properly because it's non-obvious and it's the reason a "localhost-only" server still needs host checking.

1. An attacker serves you a page from `evil.com`, whose DNS record has a 1-second TTL. Your browser loads it. The record then re-resolves to `127.0.0.1`. The page's JavaScript now makes requests to `evil.com` — which the browser considers same-origin, so it doesn't apply CORS — and those requests land on **your local server**. The browser's origin protections have been routed around entirely.
2. The defence is to check the `Host` and `Origin` headers at the application layer, because that's the one thing the rebind can't forge: the browser still sends `Host: evil.com`, since that's the name it was asked to fetch. It isn't in `allowed_hosts`, so the request is rejected before reaching a tool. Any server bound to a local port needs this — a hostname allowlist is not about who can route to you, it's about which names you agree to answer to.
3. `host="0.0.0.0"` binds all interfaces because the server runs inside a container and must be reachable from the host. Outside Docker, that also exposes it on the LAN — the `Host`-header allowlist limits what a LAN client can do, but binding `127.0.0.1` would be the stronger default for a bare-metal run.
4. "Streamable HTTP" is the current MCP transport: a single endpoint handling POST for requests and optionally upgrading to SSE for streaming. The pinned `mcp==2.1.1` in `pyproject.toml`, with its comment about targeting the v2 API, is what keeps this signature stable.

```python
@server.custom_route("/health", methods=["GET"])
async def health(request: Request) -> JSONResponse:
    return JSONResponse({
        "status": "ok",
        "source_dir": str(CONFIG.source_dir),
        "workspace_dir": str(CONFIG.workspace_dir),
        "source_dir_present": CONFIG.source_dir.is_dir(),
    })
```

1. An escape hatch to the underlying Starlette app — MCP speaks its own protocol, but Docker's `HEALTHCHECK` speaks HTTP GET.
2. `async def` because it's a raw Starlette handler, unlike the `@server.tool()` functions which are sync and get dispatched to a worker thread by the SDK. Two different execution models in one file, and the `async` keyword is the only visible marker.
3. `source_dir_present` is the genuinely useful field: the single most common misconfiguration is a wrong volume mount, and this turns "the AI says there are no files" into a one-request diagnosis.

## Theme — The four locks

Everything in `query_sql`'s safety story, in the order it's applied and in order of how much it actually matters.

- **L1 · OS: `file:...?mode=ro`**  
  The file descriptor is opened read-only. Even a bug in SQLite that bypassed everything above cannot write bytes the kernel won't accept. Coarse and absolute — it knows nothing about SQL.
- **L2 · Engine: `PRAGMA query_only=ON`**  
  SQLite itself refuses writes on this handle. Must be set before L4, because L4 denies PRAGMA.
- **L3 · Extensions: `enable_load_extension(False)` + dbconfig**  
  Closes the one hole that would bypass everything: a loaded extension is arbitrary native code inside the process.
- **L4 · Semantics: `set_authorizer()` — the primary layer**  
  Deny-by-default over SQLite's own compiled understanding of the statement. Cannot be fooled by spelling, encoding, or a syntax nobody anticipated. This is the one that makes the design sound.
- **L0 · Text: `validate_read_only_sql()` — in front, deliberately not load-bearing**  
  Scrubs and inspects the statement string. Its real jobs are a *clear early error* the model can act on, and defense in depth. The source says so outright: *"it is not what makes the path safe."*

The numbering is intentional: the string check is L0, in front of everything, and it's the layer the design explicitly refuses to rely on. That ordering is the mark of someone who has thought about this properly — every keyword denylist is incomplete, so the correct move is to build the real defence somewhere else and then keep the denylist anyway, for error quality.

> **The generalizable lesson**
>
> When you must accept untrusted input in a language you can't fully parse, don't try to validate the text. Find the layer that has already parsed it, and constrain *that*. The scrubber can be defeated by a SQL construct nobody thought of; the authorizer cannot, because SQLite tells it what the statement means rather than what it says.

## Theme — One pass, no RAM

The claim in the README is that files may be far larger than memory. Four separate mechanisms make that true, and none of them work without the others.

| Stage | Mechanism | Bound |
| --- | --- | --- |
| Read | `HashingReader` → `BufferedReader` → `TextIOWrapper` | 1 MiB buffer |
| Parse | `csv.reader` over the stream, generator all the way | 1 row |
| Insert | `executemany` per 5,000-row batch, `batch.clear()` | 5,000 rows |
| Hash | Computed *during* the same read, not in a second pass | 32 bytes |
| Profile | `fetchmany(10_000)` via `iter_batches` | 10,000 rows + caches |
| Query | `fetchmany(max_rows + 1)` | 1,001 rows |
| Export | `fetchmany(5_000)` straight to a file handle | 5,000 rows |

The discipline is consistent: **`fetchall()` appears nowhere in the codebase on a user-sized result.** Every path that could touch a large result set uses `fetchmany` in a loop, usually through the shared `iter_batches` helper. One `fetchall()` in the profiler's scan would quietly undo all of it.

The one place the discipline slips is the profiler's per-column caches, which are bounded per column rather than globally — see the note in that section. It's the exception that shows how deliberate the rest is.

## Theme — Hash as identity

Choosing SHA-256 of the file contents as the primary key propagates through the whole design. Trace it:

1. **The identity isn't known until EOF.** You can't hash what you haven't read.
2. **So the import must be speculative.** Rows go into `_tmp_import_<uuid>` while the file streams past.
3. **So there's a promote-or-discard step at the end.** Rename into place, or drop and reuse an existing table.
4. **So table names can collide** — because the name comes from the filename, which is not the identity.
5. **So collision resolution must be deterministic**, using a suffix from the hash rather than a counter, or the same file would land on different names depending on import order.
6. **So a cheap pre-check is needed** for the common case, which is `inspect_csv`'s path-and-size `already_imported_hint` — explicitly labelled a hint, because it isn't the identity.

Every one of those six is visible in the code, and each is a consequence of step 1. What it buys:

- Renaming a CSV doesn't cause a re-import.
- The same file in two folders imports once.
- A file that *changed* but kept its name is correctly treated as new data, because the bytes differ.
- `list_sources` can report "changed since import" honestly.

The cost is that detecting a duplicate requires reading the whole file — you cannot know it's a duplicate without doing the work. That's inherent, not a flaw, and the code is upfront about it.

> **Natural vs assigned identity**
>
> The default almost everywhere is a surrogate key — an auto-incrementing integer with no relationship to what the row contains. Identity is *assigned* at insert time, which means "is this the same thing I saw before?" is a question the key cannot answer; you need a separate uniqueness constraint for every notion of sameness you care about.
>
> Here identity is *intrinsic*: the key is the content. Dedup, rename-tolerance and change-detection are then the same fact viewed three ways, rather than three mechanisms. The price, paid in full by the staging table, is that you can't compute the key without reading everything first.

## Theme — Sharp edges

Things I'd raise in review. None are severe; all are the kind of thing worth knowing before someone else finds them.

### Cross-database writes aren't atomic

An import writes to `main.sqlite` (rename the staging table) and then to `catalog.sqlite` (record source and import). Two files, two connections, no shared transaction — SQLite has no two-phase commit across databases. A crash in between leaves a real table with no catalog record.

The system degrades sensibly rather than breaking: `list_tables` shows the table without provenance, and `profile_table` handles a missing record with `source_id = ""`. So the failure mode was anticipated. Worth stating as a known property somewhere in the code, since a reader could otherwise assume the catalog is authoritative.

### One writer is assumed, never enforced

Two concurrent `import_source` calls for the same file could both read to EOF, both find no existing import, and both create a table. WAL permits concurrent readers but serializes writers, so you wouldn't get corruption — you'd get `sales` and `sales_4b11d3` holding identical data.

Similarly, `delete_source_if_unreferenced` does a count-then-delete that isn't atomic. For a local single-user server this is fine and the simplicity is worth it; the assumption just isn't written down anywhere.

### Orphaned staging tables

Covered in the importer section: a hard kill mid-import leaves `_tmp_import_*` behind, invisible to `list_tables` and never collected. A startup sweep would fix it in three lines.

### The profiler's memory bound is per-column

Up to 100k retained strings per column, times the column count, all live at once. Mismatched with the 1 MiB discipline everywhere else. See that section.

### NULL and empty string merge in CSV export

They round-trip only because the default `null_markers` happen to include `""`. A configuration change breaks that silently. JSON export is unaffected.

### Timeout detection is by substring

`"interrupted" in str(exc).lower()`, in two places. Python's `sqlite3` gives no error code or distinct exception for interruption, so there's no better option — but it deserves a comment saying that, so the next reader doesn't take it for laziness.

### Dead code

`casting.is_textual_boolean()`. Wire it into the inference order or remove it.

### The catalog has no migration path

`CREATE TABLE IF NOT EXISTS` can add tables but cannot alter them. The first schema change ships as a runtime error for existing users. `PRAGMA user_version` plus a migration list, before that happens.

### Naming

`safe_table_name()` is used for column names too. `deterministic_table_name()` raises `SecurityError` for a non-security condition. Both cosmetic.

## Closing — Check yourself

If you can answer these without looking, you've read it. Each one has a specific answer somewhere above.

1. Why must `PRAGMA query_only=ON` run *before* `install_read_only_authorizer`? What breaks if you swap them?
2. Why does `scrub_sql` replace string literals with a space but identifiers with `_`? Give a query that breaks if both became spaces.
3. Why does `execute_query` fetch `max_rows + 1` rows?
4. What does `HashingReader` save, and why does it implement `readinto` rather than `read`?
5. Why does the import write to a staging table instead of the final one?
6. Why is the collision suffix taken from the content hash rather than an incrementing counter?
7. Why is there a `column_names()` when `table_columns()` already exists?
8. Why must the `bool` check precede the `(int, float)` check in `casting._text`?
9. Why is INTEGER checked before REAL in `_INFERENCE_ORDER`, and DATE before DATETIME?
10. What does the confirmation *token* prove that the word `DELETE` doesn't, and vice versa?
11. Why does `set_deadline` use `time.monotonic()` while `ConfirmationRegistry` uses `time.time()`?
12. Why is `size_after` measured after the `with` block closes the connection?
13. Why does `newline=""` appear on both the CSV read and the CSV write?
14. Why does the authorizer return `SQLITE_DENY` rather than `SQLITE_IGNORE`?
15. Why does the project use one SQLite file for all tables instead of one per CSV?

### Two things to take with you

**Validate at the layer that has already parsed the input.** The authorizer works because SQLite tells it what a statement *means*; the scrubber can only see what it *says*. Whenever you're tempted to write a regex against a language you don't control, look for a hook below the text.

**Preserve ambiguity until someone can resolve it.** The importer stores everything as TEXT and refuses to guess. The profiler measures and reports evidence but changes nothing. The AI — with the user's question in hand — decides. Each layer does only what it can do correctly and hands the rest upward, so no layer is ever in the position of guessing on someone else's behalf.

---

*Written against `src/tabulite_mcp` at commit `d0551c0` · 2,479 lines across 11 modules · mcp 2.1.1, Python 3.11+*
