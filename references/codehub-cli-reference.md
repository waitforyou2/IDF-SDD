# Command Reference

> This file contains detailed command documentation for codehub-skill.
> Referenced from SKILL.md for progressive disclosure.

## Configuration

```bash
# Authentication (required)
export CODEHUB_TOKEN=your_api_token

# Optional: Override default host
export CODEHUB_HOST=https://codehub-g.huawei.com
```

### Global Options

| Option | Description |
|--------|-------------|
| `-f, --format <fmt>` | Output format: `text`, `json`, `yaml`, `quiet`, `tsv`. **Default: json** |
| `--columns <fields>` | Field filter with dot notation and aliases (e.g., `owner.name:Owner`). Works with all formats |
| `-H, --host <host>` | Override CODEHUB_HOST |
| `-t, --token <token>` | Override CODEHUB_TOKEN |
| `-p, --project <path>` | Project path (e.g., `org/group/repo`). Auto-detected from Git origin if omitted |
| `--profile <name>` | Profile name (overrides default profile) |
| `-V, --verbose` | Verbose logging to stderr (HTTP requests, pagination, project detection) |
| `-k, --insecure` | Skip TLS certificate verification |
| `--no-cache` | Skip HTTP response cache (force fresh requests) |
| `-v, --version` | Show version |
| `--help` | Show command help |

### Per-Command Output Flags

Most commands also register these local output flags (via `cmdutil.AddOutputFlags`):

| Flag | Description |
|------|-------------|
| `--json <fields>` | Output JSON with specific comma-separated fields (e.g., `--json iid,title`). **Mutually exclusive with `--columns`** |
| `--yaml` | Output in YAML format |
| `--jq <expr>` | jq-style filter; requires `--format json` or `--format yaml` (or `--json`/`--yaml`) |
| `--template <tpl>` | Go text/template; requires `--format json` or `--format yaml` (or `--json`/`--yaml`) |

**Note:** `--jq` and `--template` are per-command flags, NOT global. They must be combined with a JSON or YAML format. Use `--columns` for simple field filtering across any format.

**Field Filtering Examples:**

```bash
# JSON + field filter (global --columns)
codehub-cli project list --simple --limit 2 --format json --columns id,name,path

# Per-command --json field selection (alternative to --columns)
codehub-cli mr list --limit 5 --json iid,title,state

# YAML output
codehub-cli project list --simple --limit 2 --format yaml --columns id,name,path

# jq filter (requires --format json)
codehub-cli mr list --limit 5 --format json --jq '.data[] | {iid, title}'
```

## Commands

### User

| Command | Syntax | Description |
|---------|--------|-------------|
| `user info` | `codehub-cli user info [user-id-or-username]` | View current user info, or get user info by ID or username |

### Project

| Command | Syntax | Description |
|---------|--------|-------------|
| `project list` | `codehub-cli project list [--search <q>] [--visibility <v>] [--order-by <f>] [--sort <d>] [--mine] [--membership] [--owned] [--starred] [--archived] [--simple] [--limit <n>] [--offset <n>]` | List projects with filters and pagination |
| `project view` | `codehub-cli project view [--project <path>]` | View project details |
| `project create` | `codehub-cli project create --name <n> [--description <d>] [--visibility <v>]` | Create a new project |
| `project edit` | `codehub-cli project edit [--project <path>] [--name <n>] [--description <d>] [--visibility <v>] [--default-branch <b>]` | Edit project settings |
| `project delete` | `codehub-cli project delete [--project <path>] [--yes] [--force]` | Delete a project. `--yes` or `--force` skips confirmation |
| `project recover` | `codehub-cli project recover [--project <path>]` | Recover a deleted project |
| `project fork` | `codehub-cli project fork [--project <path>] --namespace-id <id>` | Fork a project |
| `project archive` | `codehub-cli project archive [--project <path>]` | Archive a project |
| `project unarchive` | `codehub-cli project unarchive [--project <path>]` | Unarchive a project |

### Project Label

| Command | Syntax | Description |
|---------|--------|-------------|
| `project label list` | `codehub-cli project label list [--project <path>] [--search <q>] [--view <v>] [--sort <s>]` | List project labels |
| `project label create` | `codehub-cli project label create <name> --color <c> [--description <d>] [--expires-at <date>] [--priority <p>]` | Create a project label |
| `project label update` | `codehub-cli project label update <name> [--new-name <n>] [--color <c>] [--description <d>] [--expires-at <date>] [--priority <p>]` | Update a project label |
| `project label delete` | `codehub-cli project label delete [--project <path>] <name> [--yes]` | Delete a project label. `--yes` skips confirmation |

### Project Milestone

| Command | Syntax | Description |
|---------|--------|-------------|
| `project milestone list` | `codehub-cli project milestone list [--project <path>] [--search <q>] [--state <s>]` | List project milestones |
| `project milestone create` | `codehub-cli project milestone create <title> [--description <d>] [--start-date <date>] [--due-date <date>]` | Create a milestone |
| `project milestone view` | `codehub-cli project milestone view [--project <path>] <milestone-id>` | View milestone details |
| `project milestone update` | `codehub-cli project milestone update [--project <path>] <milestone-id> [--new-title <t>] [--description <d>] [--start-date <date>] [--due-date <date>]` | Update a milestone |
| `project milestone delete` | `codehub-cli project milestone delete [--project <path>] <milestone-id> [--yes]` | Delete a milestone. `--yes` skips confirmation |
| `project milestone close` | `codehub-cli project milestone close [--project <path>] <milestone-id>` | Close a milestone |
| `project milestone reopen` | `codehub-cli project milestone reopen [--project <path>] <milestone-id>` | Reopen a milestone |

### Project Member

| Command | Syntax | Description |
|---------|--------|-------------|
| `project member list` | `codehub-cli project member list [--project <path>] [--query <q>] [--limit <n>] [--offset <n>]` | List project members |
| `project member add` | `codehub-cli project member add [--project <path>] <user-id-or-username> [--access-level <l>]` | Add a member (10-50) |
| `project member remove` | `codehub-cli project member remove [--project <path>] <user-id-or-username>` | Remove a member |

### Project Review

| Command | Syntax | Description |
|---------|--------|-------------|
| `project review list` | `codehub-cli project review list [--project <path>] [--noteable-type <t>] [--severity <s>] [--resolved-status <s>] [--start-date <d>] [--end-date <d>] [--search <q>] [--author <id-or-username>] [--viewer <id-or-username>] [--assignee <id-or-username>] [--proposer <id-or-username>] [--review-category <c>] [--review-module <m>] [--target-branch <b>] [--mr-state <s>] [--include-reply] [--order-by <o>] [--sort <s>] [--limit <n>] [--offset <n>]` | List project-level code reviews |
| `setting review-config` | `codehub-cli setting review-config [--project <path>]` | Show project review settings (categories, modules, forbidden_add_to_issue). Use this to discover valid values for --review-category and --review-module |

### Merge Request (MR)

| Command | Syntax | Description |
|---------|--------|-------------|
| `mr list` | `codehub-cli mr list [--project <path> \| --group <id> \| --personal] [--state <s>] [--view <v>] [--order-by <f>] [--sort <d>] [--source-branch <b>] [--target-branch <b>] [--author <id-or-username>] [--assignee <id-or-username>] [--search <q>] [--scope <s>] [--limit <n>] [--offset <n>]` | List merge requests. `--personal`/`--group`/`--project` mutually exclusive; auto-fallback to personal when no project specified. `--view` defaults to `basic` (reduces response size) |
| `mr view` | `codehub-cli mr view [--project <path>] <mr-iid>` | View MR details |
| `mr create` | `codehub-cli mr create [--project <path>] --source-branch <b> --target-branch <b> --title <t> [--description <d>] [--assignee <id-or-username>] [--assignees <ids-or-usernames>] [--reviewers <ids-or-usernames>] [--approval-reviewers <ids-or-usernames>] [--approval-approvers <ids-or-usernames>] [--recommend-assignee] [--e2e-issues <nums>] [--squash] [--squash-commit-message <m>] [--issue-nums <nums>] [--force-remove-source-branch] [--target-project-id <id>]` | Create a merge request. `--assignee` and `--assignees` can be used together (merged into assignee_ids). Use --recommend-assignee to auto-fill IDs from last MR |
| `mr merge` | `codehub-cli mr merge [--project <path>] <mr-iid>` | Merge a merge request |
| `mr update` | `codehub-cli mr update [--project <path>] <mr-iid> [--title <t>] [--description <d>] [--source-branch <b>] [--target-branch <b>] [--assignee <id-or-username>] [--assignees <ids-or-usernames>] [--reviewers <ids-or-usernames>] [--approval-reviewers <ids-or-usernames>] [--approval-approvers <ids-or-usernames>] [--issue-nums <nums>] [--e2e-issues <nums>] [--state-event <merge\|close\|reopen>] [--labels <l>]` | Update MR attributes (replaces former `mr edit`). --e2e-issues: E2E issue numbers to auto-close on merge |
| `mr close` | `codehub-cli mr close [--project <path>] <mr-iid>` | Close MR |
| `mr reopen` | `codehub-cli mr reopen [--project <path>] <mr-iid>` | Reopen MR |
| `mr changes` | `codehub-cli mr changes [--project <path>] <mr-iid>` | View code changes |
| `mr commits` | `codehub-cli mr commits [--project <path>] <mr-iid>` | View commits in MR |
| `mr diff` | `codehub-cli mr diff [--project <path>] <mr-iid> [--name-only] [--patch]` | View diff summary. --name-only: file paths only; --patch: patch text |

#### MR Create Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `--source-branch` | string | **Required.** Source branch name |
| `--target-branch` | string | **Required.** Target branch name |
| `--title` | string | **Required.** MR title |
| `--description` | string | MR description |
| `--assignee` | string | Single assignee ID or username (merged with `--assignees` into assignee_ids) |
| `--assignees` | string | Comma-separated assignee IDs or usernames |
| `--reviewers` | string | Comma-separated reviewer IDs or usernames |
| `--approval-reviewers` | string | Comma-separated approval reviewer IDs or usernames |
| `--approval-approvers` | string | Comma-separated approval approver IDs or usernames |
| `--recommend-assignee` | bool | Auto-fill assignee/reviewer IDs from your last MR in this project |
| `--e2e-issues` | string | Comma-separated E2E issue numbers to auto-close on merge |
| `--squash` | bool | Squash commits on merge |
| `--squash-commit-message` | string | Custom squash commit message |
| `--issue-nums` | string | Associated issue numbers |
| `--force-remove-source-branch` | bool | Remove source branch after merge |
| `--target-project-id` | int | Target project ID for cross-project MR |

### MR Review (Discussion/Notes/Resolve unified)

> `mr discussion`, `mr notes`, `mr resolve`, `mr unresolve` are consolidated under `mr review`.

| Command | Syntax | Description |
|---------|--------|-------------|
| `mr review list` | `codehub-cli mr review list [--project <path>] <mr-iid> [--assignee <id-or-username>] [--author <id-or-username>] [--proposer <id-or-username>]` | List reviews (discussions + notes) |
| `mr review create` | `codehub-cli mr review create [--project <path>] <mr-iid> --body <b> [--severity <s>] [--body-file <f>] [--file-path <p>] [--line-number <n>] [--old-line-number <n>] [--line-type <t>] [--confidence <c>] [--assignee <id-or-username>] [--review-category <c>] [--review-module <m>]` | Create review comment. For line-level DiffNote, use --file-path + --line-number |
| `mr review reply` | `codehub-cli mr review reply [--project <path>] <mr-iid> <review-iid> --body <b> [--assignee <id-or-username>]` | Reply to review |
| `mr review resolve` | `codehub-cli mr review resolve [--project <path>] <mr-iid> <review-iid>` | Mark review resolved |
| `mr review unresolve` | `codehub-cli mr review unresolve [--project <path>] <mr-iid> <discussion-id>` | Unmark resolved discussion |
| `mr review delete` | `codehub-cli mr review delete [--project <path>] <mr-iid> --note-id <n> [--discussion-id <d>] [--yes]` | Delete a review comment. --discussion-id required for reply deletion. `--yes` skips confirmation |

#### MR Review Create Flags

| Flag | Type | Description |
|------|------|-------------|
| `--body, -b` | string | Comment text (required for single mode) |
| `--body-file, -F` | string | Read body from file or stdin (`-`) |
| `--file-path` | string | File path for line-level DiffNote |
| `--line-number` | int | New line number (for added/modified lines) |
| `--old-line-number` | int | Old line number (for deleted lines) |
| `--line-type` | string | Line type: `new` (default) or `old` |
| `--severity` | string | Severity: suggestion/minor/major. **API 不支持 `critical`**（fatal 级别降级为 `major`，在正文标注 `【严重级别：critical】`）。**Only effective in DiffNote mode** (with `--file-path`); in Plain Note mode, always defaults to "suggestion" regardless of this flag |
| `--confidence` | float | Confidence score (0-1) |
| `--assignee` | string | Assignee user ID or username. Required when `categories_and_modules_enabled=true` |
| `--review-category` | string | Review category, format: `parent_key:sub_key`. Only effective in DiffNote mode. Run `setting review-config` to see valid values |
| `--review-module` | string | Review module. Required when `categories_and_modules_enabled=true` for DiffNote. If `review_modules` is empty, DiffNote with severity is impossible |

### MR Cherry-Pick/Revert

| Command | Syntax | Description |
|---------|--------|-------------|
| `mr cherry-pick` | `codehub-cli mr cherry-pick [--project <path>] <mr-iid> --branch <b> [--message] [--with-new-mr]` | Cherry-pick MR into target branch |
| `mr revert` | `codehub-cli mr revert [--project <path>] <mr-iid> --branch <b> [--message] [--with-new-mr]` | Revert MR in target branch |

### MR Rebase/Approval/Vote

| Command | Syntax | Description |
|---------|--------|-------------|
| `mr rebase` | `codehub-cli mr rebase [--project <path>] <mr-iid>` | Rebase MR source branch onto target branch |
| `mr approve` | `codehub-cli mr approve [--project <path>] <mr-iid> [--action-type <approve\|reset\|reject>]` | Manage approval state. Default: approve. `reset` withdraws your approval, `reject` rejects. (Replaces former `mr unapprove`) |
| `mr approve-review` | `codehub-cli mr approve-review [--project <path>] <mr-iid> --action-type <complete\|reset>` | Complete or reset approval review. --action-type required |
| `mr vote` | `codehub-cli mr vote [--project <path>] <mr-iid> --score <n>` | Vote on MR (score -2 to 2) |
| `mr votes` | `codehub-cli mr votes [--project <path>] <mr-iid>` | View all votes on MR |

> `mr gate` and `mr watch` are documented in the [MR Gate](#mr-gate) section below.

### MR Checkout/Pipeline

| Command | Syntax | Description |
|---------|--------|-------------|
| `mr checkout` | `codehub-cli mr checkout [--project <path>] <mr-iid>` | Checkout MR source branch locally |
| `mr pipeline` | `codehub-cli mr pipeline [--project <path>] <mr-iid>` | View MR associated pipelines |

### MR Apply & Upload

| Command | Syntax | Description |
|---------|--------|-------------|
| `mr apply` | `codehub-cli mr apply [--project <path>] <mr-iid> [--merge] [--cherry-pick <iid>] [--revert <iid>] [--method <m>] [--force] [--yes] [--upstream <url>]` | Apply MR changes. Default mode: merge (`--merge/-m` is the explicit default flag). Use `--cherry-pick <iid>` or `--revert <iid>` for other modes (optionally target a specific MR IID), or `--method` to specify explicitly |
| `mr upload` | `codehub-cli mr upload [--project <path>] [--title <t>] [--description <d>] [--reviewers <r>] [--assignees <a>] [--approvers <a>] [--topic <t>] [--dest <b>] [--br <b>] [--force] [--honor-no-changes] [--yes] [--upstream <url>] [--title-template <f>] [--tmpl <f>]` | Upload local commits as a merge request. Use `cr upload` for CR mode. Auto-detects source/target branches from Git context |

#### MR Apply Flags

| Flag | Description |
|------|-------------|
| `--merge, -m` | Merge mode (default) |
| `--cherry-pick, -c <iid>` | Cherry-pick mode, optionally specify target MR IID |
| `--revert, -r <iid>` | Revert mode, optionally specify target MR IID (must be merged) |
| `--method <m>` | Explicit method: merge/cherry-pick/revert |
| `--force` | Force operation |
| `--yes, -y` | Skip confirmation |
| `--upstream, -u <url>` | Upstream URL |

> Note: MR `apply` has a `--merge/-m` flag (merge is the default mode). CR `apply` also supports `--merge/-m`.

### MR Control Point

> Alias: none. Manage custom control points (gates) on a merge request.

| Command | Syntax | Description |
|---------|--------|-------------|
| `mr control-point list` | `codehub-cli mr control-point list [--project <path>] <mr-iid> [--name <n>] [--blocked] [--limit <n>] [--offset <n>]` | List control points for an MR |
| `mr control-point block` | `codehub-cli mr control-point block [--project <path>] <mr-iid> --name <n> [--reason <r>]` | Block a control point |
| `mr control-point pass` | `codehub-cli mr control-point pass [--project <path>] <mr-iid> --name <n>` | Pass a control point |

### MR Evaluation

| Command | Syntax | Description |
|---------|--------|-------------|
| `mr evaluation list` | `codehub-cli mr evaluation list [--project <path>] <mr-iid>` | List MR evaluations |
| `mr evaluation average` | `codehub-cli mr evaluation average [--project <path>] <mr-iid>` | Get average evaluation score |
| `mr evaluation set` | `codehub-cli mr evaluation set [--project <path>] <mr-iid> --level <n> [--content <c>]` | Set MR evaluation (level 1-5) |
| `mr evaluation delete` | `codehub-cli mr evaluation delete [--project <path>] <mr-iid> <evaluation-id> [--all] [--yes]` | Delete evaluation. Both args required. Use --all to delete all. `--yes` skips confirmation |

### MR Event

| Command | Syntax | Description |
|---------|--------|-------------|
| `mr event list` | `codehub-cli mr event list [--project <path>] <mr-iid> [--limit <n>] [--offset <n>]` | List MR system events (via /system_notes) |

### Issue

| Command | Syntax | Description |
|---------|--------|-------------|
| `issue list` | `codehub-cli issue list [--project <path> \| --group <id> \| --personal] [--state <s>] [--labels <l>] [--scope <s>] [--limit <n>] [--offset <n>]` | List issues. `--personal`/`--group`/`--project` mutually exclusive; auto-fallback to personal when no project specified |
| `issue view` | `codehub-cli issue view [--project <path>] <issue-iid>` | View issue details |
| `issue create` | `codehub-cli issue create [--project <path>] --title <t> [--description <d>] [--assignee <id-or-username>]` | Create an issue |
| `issue update` | `codehub-cli issue update [--project <path>] <issue-iid> [--title <t>] [--state-event <e>] [--assignee <id-or-username>]` | Update issue |
| `issue close` | `codehub-cli issue close [--project <path>] <issue-iid>` | Close issue |
| `issue reopen` | `codehub-cli issue reopen [--project <path>] <issue-iid>` | Reopen issue |
| `issue delete` | `codehub-cli issue delete [--project <path>] <issue-iid> [--yes]` | Delete an issue permanently. `--yes` skips confirmation |

### Issue Comment

| Command | Syntax | Description |
|---------|--------|-------------|
| `issue comment list` | `codehub-cli issue comment list [--project <path>] <issue-iid>` | List comments |
| `issue comment create` | `codehub-cli issue comment create [--project <path>] <issue-iid> --body <b>` | Add a comment |
| `issue comment delete` | `codehub-cli issue comment delete [--project <path>] <issue-iid> <note-id> [--yes]` | Delete a comment. `--yes` skips confirmation |

### Branch

| Command | Syntax | Description |
|---------|--------|-------------|
| `repo branch list` | `codehub-cli repo branch list [--project <path>]` | List branches |
| `repo branch get` | `codehub-cli repo branch get [--project <path>] <branch-name>` | Get branch details |
| `repo branch create` | `codehub-cli repo branch create [--project <path>] --name <n> --ref <r>` | Create a branch |
| `repo branch delete` | `codehub-cli repo branch delete [--project <path>] <branch-name>` | Delete a branch |

### Tag

| Command | Syntax | Description |
|---------|--------|-------------|
| `repo tag list` | `codehub-cli repo tag list [--project <path>]` | List tags |
| `repo tag get` | `codehub-cli repo tag get [--project <path>] <tag-name>` | Get tag details |
| `repo tag create` | `codehub-cli repo tag create [--project <path>] --name <n> --ref <r> [--message <m>]` | Create a tag (annotated) |
| `repo tag delete` | `codehub-cli repo tag delete [--project <path>] <tag-name>` | Delete a tag |

### File

| Command | Syntax | Description |
|---------|--------|-------------|
| `repo file get` | `codehub-cli repo file get [--project <path>] --file-path <f> [--ref <r>]` | Get file content |
| `repo file raw` | `codehub-cli repo file raw [--project <path>] --file-path <f> [--ref <r>]` | Get raw content |
| `repo file create` | `codehub-cli repo file create [--project <path>] --file-path <p> --content <c> --branch <b> --commit-message <m>` | Create file |
| `repo file update` | `codehub-cli repo file update [--project <path>] --file-path <p> --content <c> --branch <b> --commit-message <m>` | Update file |
| `repo file delete` | `codehub-cli repo file delete [--project <path>] --file-path <p> --branch <b> --commit-message <m>` | Delete file |
| `repo file rename` | `codehub-cli repo file rename [--project <path>] --old-path <o> --new-path <n> --branch <b> --commit-message <m>` | Rename file |
| `repo file exists` | `codehub-cli repo file exists [--project <path>] --file-path [--ref]` | Check existence |
| `repo file blame` | `codehub-cli repo file blame [--project <path>] --file-path [--ref]` | Git blame |

### Commit

| Command | Syntax | Description |
|---------|--------|-------------|
| `repo commit list` | `codehub-cli repo commit list [--project <path>]` | View commit history |
| `repo commit view` | `codehub-cli repo commit view [--project <path>] <commit-sha>` | View commit details |
| `repo commit diff` | `codehub-cli repo commit diff [--project <path>] <commit-sha>` | View commit diff |
| `repo commit refs` | `codehub-cli repo commit refs [--project <path>] <commit-sha> [--type]` | Get refs for commit |
| `repo commit cherry-pick` | `codehub-cli repo commit cherry-pick [--project <path>] <sha> --branch <b> [--message] [--with-new-merge-request]` | Cherry-pick commit |
| `repo commit revert` | `codehub-cli repo commit revert [--project <path>] <sha> --branch <b> [--message]` | Revert commit |

### Clone & Sync

| Command | Syntax | Description |
|---------|--------|-------------|
| `repo clone` | `codehub-cli repo clone --project <path> [--dir <d>] [--branch <b>] [--depth] [--bare] [--mirror]` | Clone a repository |
| `repo sync` | `codehub-cli repo sync [--project <path>] [--branch <b>] [--source] [--rebase] [--no-rebase]` | Sync current branch |

### Repo SSH Key

| Command | Syntax | Description |
|---------|--------|-------------|
| `repo ssh` | `codehub-cli repo ssh [--project <path>] [--type <t>] [--comment <c>] [--file <f>] [--bits <n>] [--force]` | Generate SSH key for repository access |

#### SSH Key Generation Flags

| Flag | Description |
|------|-------------|
| `--type, -T <t>` | Key type: ed25519 (default), ecdsa, rsa |
| `--comment, -C <c>` | Comment for the key |
| `--file, -F <p>` | Output file path (default: ~/.ssh/codehub_key) |
| `--bits, -b <n>` | Key bits (rsa: 4096 default) |
| `--force` | Overwrite existing key |

### Compare

| Command | Syntax | Description |
|---------|--------|-------------|
| `repo compare list` | `codehub-cli repo compare list [--project <path>] --from <ref> --to <ref> [--view <v>] [--straight]` | Compare two refs. --view: diffs/commits/commitsdiffs/count/files |

### Pipeline

| Command | Syntax | Description |
|---------|--------|-------------|
| `pipeline list` | `codehub-cli pipeline list [--project <path>] [--state <s>] [--scope <s>] [--limit <n>]` | List pipelines |
| `pipeline view` | `codehub-cli pipeline view [--project <path>] <pipeline-id>` | View pipeline details |
| `pipeline jobs` | `codehub-cli pipeline jobs [--project <path>] <pipeline-id>` | List jobs in a pipeline |
| `pipeline stop` | `codehub-cli pipeline stop [--project <path>] <pipeline-id> --mr <iid>` | Stop a running pipeline. **--mr required** |
| `pipeline rerun` | `codehub-cli pipeline rerun [--project <path>] <pipeline-id> --mr <iid>` | Rerun failed jobs in a pipeline. **--mr required** |
| `pipeline status` | `codehub-cli pipeline status [--project <path>] <pipeline-id>` | Quick pipeline status with exit code (0=success, 1=failed, 2=running) |
| `pipeline quality` | `codehub-cli pipeline quality [--project <path>] <pipeline-id> [--mr <iid>]` | Show quality check details for a pipeline |
| `pipeline failure` | `codehub-cli pipeline failure [--project <path>] <pipeline-id>` | Diagnose failed pipeline with CodeCheck issues |
| `pipeline watch` | `codehub-cli pipeline watch [--project <path>] <pipeline-id> [--interval <n>] [--exit-status]` | Watch pipeline until completion. Default interval 3s. No --timeout (unlike mr watch) |

### MR Gate

| Command | Syntax | Description |
|---------|--------|-------------|
| `mr gate` | `codehub-cli mr gate [--project <path>] <mr-iid> [--codecheck-url <url>] [--codecov-url <url>] [--codecov-threshold <n>] [--control-point]` | Check merge gate status (pipeline and quality info shown by default); CodeCheck issues auto-detected from quality failures, use --codecheck-url for manual override |
| `mr watch` | `codehub-cli mr watch [--project <path>] <mr-iid> [--interval <n>] [--timeout <n>] [--exit-status]` | Watch MR gate status until completion, printing changes (pipeline and quality shown by default) |

### Repo Blob & Blame

| Command | Syntax | Description |
|---------|--------|-------------|
| `repo blob --sha <sha>` | `codehub-cli repo blob --sha <sha>` | Get blob content by SHA |
| `repo blame` | `codehub-cli repo blame [--project <path>] --file-path <path> [--ref <ref>] [--start-line <n>] [--end-line <n>]` | View the last commit for each line in a file |

### Code Review (CR)

| Command | Syntax | Description |
|---------|--------|-------------|
| `cr list` | `codehub-cli cr list [--project <path> \| --group <id> \| --personal] [--state <s>] [--source-branch <b>] [--target-branch <b>] [--author <id-or-username>] [--assignee <id-or-username>] [--scope <s>] [--limit <n>] [--offset <n>]` | List change requests. `--personal`/`--group`/`--project` mutually exclusive; auto-fallback to personal when no project specified |
| `cr view` | `codehub-cli cr view [--project <path>] <cr-iid>` | View CR details |
| `cr create` | `codehub-cli cr create [--project <path>] --source-branch <b> --target-branch <b> --title <t> [--description <d>] [--assignees <ids-or-usernames>] [--reviewers <ids-or-usernames>]` | Create a change request |
| `cr update` | `codehub-cli cr update [--project <path>] <cr-iid> [--title <t>] [--state-event <e>] [--assignee <id-or-username>] [--assignees <ids-or-usernames>]` | Update CR |
| `cr merge` | `codehub-cli cr merge [--project <path>] <cr-iid>` | Merge a CR |
| `cr close` | `codehub-cli cr close [--project <path>] <cr-iid>` | Close a CR |
| `cr reopen` | `codehub-cli cr reopen [--project <path>] <cr-iid>` | Reopen a CR |
| `cr rebase` | `codehub-cli cr rebase [--project <path>] <cr-iid>` | Rebase CR |
| `cr revert` | `codehub-cli cr revert [--project <path>] <cr-iid> --branch <b>` | Revert CR |
| `cr cherry-pick` | `codehub-cli cr cherry-pick [--project <path>] <cr-iid> --branch <b>` | Cherry-pick CR |
| `cr apply` | `codehub-cli cr apply [--project <path>] <cr-iid> [--merge \| --cherry-pick \| --revert] [--method <m>] [--force] [--yes] [--upstream <url>]` | Apply CR changes (merge/cherry-pick/revert modes) |
| `cr upload` | `codehub-cli cr upload [--project <path>] [--title <t>] [--description <d>] [--reviewers <r>] [--assignees <a>] [--approvers <a>] [--topic <t>] [--dest <b>] [--br <b>] [--force] [--honor-no-changes] [--yes] [--upstream <url>] [--title-template <f>] [--tmpl <f>]` | Upload local commits as CR. Auto-detects source/target branches from Git context |
| `cr changes` | `codehub-cli cr changes [--project <path>] <cr-iid>` | View code changes |
| `cr commits` | `codehub-cli cr commits [--project <path>] <cr-iid>` | View commits |
| `cr diff` | `codehub-cli cr diff [--project <path>] <cr-iid>` | View diff |
| `cr pipelines list` | `codehub-cli cr pipelines list [--project <path>] <cr-iid>` | List CR pipelines |
| `cr pipelines start` | `codehub-cli cr pipelines start [--project <path>] <cr-iid> <pipeline-id>` | Start CR pipeline |
| `cr pipelines stop` | `codehub-cli cr pipelines stop [--project <path>] <cr-iid> <pipeline-id>` | Stop CR pipeline |

### CR Review

| Command | Syntax | Description |
|---------|--------|-------------|
| `cr review list` | `codehub-cli cr review list [--project <path>] <cr-iid> [--assignee <id-or-username>] [--author <id-or-username>]` | List CR reviews |
| `cr review create` | `codehub-cli cr review create [--project <path>] <cr-iid> --body <b> [--severity <s>] [--body-file <f>] [--file-path <p>] [--line-number <n>] [--old-line-number <n>] [--line-type <t>] [--confidence <c>] [--assignee <id-or-username>] [--review-category <c>] [--review-module <m>]` | Create CR review. For line-level DiffNote, use --file-path + --line-number |
| `cr review reply` | `codehub-cli cr review reply [--project <path>] <cr-iid> <review-iid> --body <b> [--assignee <id-or-username>]` | Reply to CR review |
| `cr review resolve` | `codehub-cli cr review resolve [--project <path>] <cr-iid> <review-iid>` | Resolve CR review |
| `cr review delete` | `codehub-cli cr review delete [--project <path>] <cr-iid> --note-id <n> [--discussion-id <d>] [--yes]` | Delete a CR review comment. `--yes` skips confirmation |
| `cr review unresolve` | `codehub-cli cr review unresolve [--project <path>] <cr-iid> <discussion-id>` | Unmark resolved CR discussion |

#### CR Review Create Flags

| Flag | Type | Description |
|------|------|-------------|
| `--body, -b` | string | Comment text (required) |
| `--body-file, -F` | string | Read body from file or stdin (`-`) |
| `--file-path` | string | File path for line-level DiffNote |
| `--line-number` | int | New line number (for added/modified lines) |
| `--old-line-number` | int | Old line number (for deleted lines) |
| `--line-type` | string | Line type: `new` (default) or `old` |
| `--severity` | string | Severity level: suggestion/minor/major. **API 不支持 `critical`** |
| `--confidence` | float | Confidence score (0-1) |
| `--assignee` | string | Assignee user ID or username |
| `--review-category` | string | Review category (run `setting review-config` to see valid values) |
| `--review-module` | string | Review module (run `setting review-config` to see valid values) |

### CR Evaluation

| Command | Syntax | Description |
|---------|--------|-------------|
| `cr evaluation list` | `codehub-cli cr evaluation list [--project <path>] <cr-iid>` | List CR evaluations |
| `cr evaluation average` | `codehub-cli cr evaluation average [--project <path>] <cr-iid>` | Get average evaluation score |
| `cr evaluation set` | `codehub-cli cr evaluation set [--project <path>] <cr-iid> --level <n> [--content <c>]` | Set CR evaluation (level 1-5) |
| `cr evaluation delete` | `codehub-cli cr evaluation delete [--project <path>] <cr-iid> <evaluation-id> [--all]` | Delete evaluation. Both args required. Use --all to delete all |

### CR Event

| Command | Syntax | Description |
|---------|--------|-------------|
| `cr event list` | `codehub-cli cr event list [--project <path>] <cr-iid> [--limit <n>] [--offset <n>]` | List CR system events |

### CR Management

| Command | Syntax | Description |
|---------|--------|-------------|
| `cr labels` | `codehub-cli cr labels [--project <path>] <cr-iid>` | Manage CR labels |
| `cr reviewers` | `codehub-cli cr reviewers [--project <path>] <cr-iid>` | Manage CR reviewers (`list`/`update --add/--remove`/`remove --ids`). `remove` has `--yes` to skip confirmation |
| `cr assignees` | `codehub-cli cr assignees [--project <path>] <cr-iid>` | Manage CR assignees |
| `cr approval-approvers` | `codehub-cli cr approval-approvers [--project <path>] <cr-iid>` | Manage approval approvers |
| `cr evaluation` | `codehub-cli cr evaluation [--project <path>] <cr-iid>` | Manage CR evaluation (list/average/set/delete) |
| `cr approve` | `codehub-cli cr approve [--project <path>] <cr-iid> [--action-type <approve\|reset\|reject>]` | Manage CR approval state. Default: approve. `reset`/`reject` withdraw/reject (replaces former `cr unapprove`) |

### Release

| Command | Syntax | Description |
|---------|--------|-------------|
| `release list` | `codehub-cli release list [--project <path>] [--limit <n>] [--offset <n>]` | List releases |
| `release view` | `codehub-cli release view [--project <path>] <tag-name>` | View release details |
| `release create` | `codehub-cli release create [--project <path>] --tag-name <t> --name <n> --description <d> [--ref <r>] [--assets-link <n:u>]` | Create a release. --assets-link format: `name:url` (repeatable) |
| `release update` | `codehub-cli release update [--project <path>] <tag-name> [--name <n>] [--description <d>]` | Update release. At least one of --name/--description required |
| `release delete` | `codehub-cli release delete [--project <path>] <tag-name> [--yes]` | Delete a release. `--yes` skips confirmation |

#### Release Create Flags

| Flag | Type | Description |
|------|------|-------------|
| `--tag-name` | string | **Required.** Tag name for release |
| `--name` | string | **Required.** Release name/title |
| `--description` | string | **Required.** Release description |
| `--ref` | string | Reference (commit SHA or branch) for tag creation |
| `--assets-link` | string | Asset link in format `name:url` (repeatable) |

### Search

| Command | Syntax | Description |
|---------|--------|-------------|
| `search repo` | `codehub-cli search repo <query> [--limit <n>]` | Search repositories globally. Aliases: repos, project, projects |
| `search mr` | `codehub-cli search mr <query> [--project <path>] [--state <s>]` | Search merge requests. Aliases: mrs, prs. --state: opened/merged/closed |
| `search issue` | `codehub-cli search issue <query> [--project <path>] [--state <s>]` | Search issues. Aliases: issues. --state: opened/closed |

### Sophie (AI Code Review)

> Requires W3 authentication: `codehub-cli auth login --w3`
>
> All sophie review commands auto-detect MR vs CR based on the project's `develop_mode`. Use `--develop-mode` to override: `NORMAL` for MR, `CR` for Change Request.

| Command | Syntax | Description |
|---------|--------|-------------|
| `sophie review report` | `codehub-cli sophie review report [--project <path>] <iid> [--sophie-file <f>] [--path <p>] [--line <n>] [--body <b>] [--severity <s>] [--confidence-score <n>] [--fix-suggestion <s>] [--categories <c>] [--append] [--commit <sha>] [--develop-mode <m>] [--zone <z>] [--visibility <v>] [--agent-name <n>]` | Report review comments to RepoAgent. Auto-detects MR/CR. Supports batch mode (--sophie-file) or single mode (--path + --body) |
| `sophie review start` | `codehub-cli sophie review start [--project <path>] <iid> [--develop-mode <m>] [--zone <z>] [--visibility <v>] [--agent-name <n>]` | Start batch review task. Auto-detects MR/CR |
| `sophie review list` | `codehub-cli sophie review list [--project <path>] <iid> [--develop-mode <m>] [--zone <z>] [--visibility <v>] [--agent-name <n>]` | Get review task status and comments. Auto-detects MR/CR |
| `sophie review accept` | `codehub-cli sophie review accept [--project <path>] <iid> --request-id <id> --line <n> [--task-id <id>] [--commit <sha>] [--file-path <p>] [--body <b>] [--severity <s>] [--review-category <c>] [--review-module <m>] [--confidence <n>] [--assignee <id>] [--model-id <id>] [--develop-mode <m>]` | Accept an AI review comment and create a DiffNote on the MR/CR |
| `sophie review reject` | `codehub-cli sophie review reject [--project <path>] <iid> --request-id <id> --line <n> [--model-id <id>] [--develop-mode <m>]` | Reject an AI review comment |
| `sophie review undo` | `codehub-cli sophie review undo [--project <path>] <iid> --request-id <id> --line <n> [--model-id <id>] [--develop-mode <m>]` | Undo rejection of an AI review comment |

#### Sophie Review Flags

| Flag | Description |
|------|-------------|
| `--sophie-file <f>` | Batch mode: read reviews from JSON file |
| `--path <p>` | File path for single review |
| `--line <n>` | Line number for single review |
| `--body <b>` | Comment body for single review |
| `--severity <s>` | Severity level |
| `--confidence-score <n>` | Confidence score (0-100) |
| `--fix-suggestion <s>` | Fix suggestion text |
| `--categories <c>` | Review categories |
| `--append` | Append to existing review instead of replace |
| `--commit <sha>` | Target commit SHA |
| `--develop-mode <m>` | Override auto-detection: `NORMAL` for MR, `CR` for Change Request |
| `--zone <z>` | Zone setting |
| `--visibility <v>` | Visibility setting |
| `--agent-name <n>` | Agent name for review |

#### Sophie Review Accept/Reject/Undo Flags

| Flag | Required | Description |
|------|----------|-------------|
| `--request-id <id>` | Yes | AI review request ID |
| `--line <n>` | Yes | Line number of the review comment |
| `--task-id <id>` | No | Task ID (accept only) |
| `--commit <sha>` | No | Target commit SHA (accept only) |
| `--file-path <p>` | No | File path for DiffNote (accept only) |
| `--body <b>` | No | Comment body for DiffNote (accept only) |
| `--severity <s>` | No | Severity: suggestion/minor/major (accept only). **API 不支持 `critical`** |
| `--review-category <c>` | No | Review category, format: parent_key:sub_key (accept only) |
| `--review-module <m>` | No | Review module (accept only) |
| `--confidence <n>` | No | Confidence score (accept only) |
| `--assignee <id>` | No | Assignee ID or username (accept only) |
| `--model-id <id>` | No | AI model ID |
| `--develop-mode <m>` | No | Override auto-detection: `NORMAL` for MR, `CR` for Change Request |

### Group

| Command | Syntax | Description |
|---------|--------|-------------|
| `group view` | `codehub-cli group view <group-id-or-path>` | View group details |
| `group list` | `codehub-cli group list <group-id-or-path> [--limit <n>] [--offset <n>]` | List subgroups and projects in a group |
| `group label list` | `codehub-cli group label list <group-id-or-path> [--search <q>]` | List group labels |
| `group milestone list` | `codehub-cli group milestone list <group-id-or-path> [--state <s>]` | List group milestones |
| `group review list` | `codehub-cli group review list <group-id> [--severity <s>] [--author <id-or-username>] [--viewer <id-or-username>] [--assignee <id-or-username>]` | List group reviews (group-id must be numeric) |

### Config

| Command | Syntax | Description |
|---------|--------|-------------|
| `config get` | `codehub-cli config get <key>` | Get a config value by dot-path key (e.g., `host`, `auth.type`) |
| `config set` | `codehub-cli config set <key> <value>` | Set a config value |
| `config list` | `codehub-cli config list` | List all config values |

#### Config Profile Management

| Command | Syntax | Description |
|---------|--------|-------------|
| `config profile list` | `codehub-cli config profile list` | List all configuration profiles |
| `config profile create` | `codehub-cli config profile create <name> [--host <h>] [--auth-type <t>]` | Create a new profile |
| `config profile delete` | `codehub-cli config profile delete <name> [--yes]` | Delete a profile. `--yes` skips confirmation |
| `config profile switch` | `codehub-cli config profile switch <name>` | Switch active profile |

### Setting

| Command | Syntax | Description |
|---------|--------|-------------|
| `setting management` | `codehub-cli setting management [--project <path>]` | View management settings |
| `setting general` | `codehub-cli setting general [--project <path>]` | View general settings |
| `setting review-config` | `codehub-cli setting review-config [--project <path>]` | Show project review settings (categories, modules, forbidden_add_to_issue). Use to discover valid values for --review-category and --review-module |
| `setting control-point list` | `codehub-cli setting control-point list [--project <path>]` | List project control points (alias: `cp`) |
| `setting control-point get` | `codehub-cli setting control-point get [--project <path>] --name <n>` | View a control point |
| `setting control-point create` | `codehub-cli setting control-point create [--project <path>]` | Create a control point |
| `setting control-point update` | `codehub-cli setting control-point update [--project <path>] --name <n>` | Update a control point |
| `setting control-point delete` | `codehub-cli setting control-point delete [--project <path>] <name> [--yes]` | Delete a control point. `--yes` skips confirmation |
| `setting policy protect-branch list` | `codehub-cli setting policy protect-branch list [--project <path>]` | List protected branches |
| `setting policy protect-branch get` | `codehub-cli setting policy protect-branch get [--project <path>] <name>` | View protected branch details |
| `setting policy protect-branch create` | `codehub-cli setting policy protect-branch create [--project <path>] --name <n> [--merge-access-levels <roles>] [--push-access-levels <roles>] [--merge-user <ids>] [--push-user <ids>] [--action <json>]` | Create protected branch. Roles: Developer/Committer/Maintainer/Owner. --action format: `{"action":"create","enable":true,"access_levels":"Owner,Maintainer","user_names":["s12345"]}` |
| `setting policy protect-branch delete` | `codehub-cli setting policy protect-branch delete [--project <path>] <name> [--yes]` | Delete a protected branch. `--yes` skips confirmation |
| `setting policy protect-tag list` | `codehub-cli setting policy protect-tag list [--project <path>]` | List protected tags |
| `setting policy protect-tag get` | `codehub-cli setting policy protect-tag get [--project <path>] <name>` | View protected tag details |
| `setting policy protect-tag create` | `codehub-cli setting policy protect-tag create [--project <path>] --name <n> [--create-access-level <roles>] [--create-user <ids>] [--action <json>]` | Create a protected tag. Roles: Developer/Committer/Maintainer/Owner. --action format: `{"action":"create-delete","enable":true,"access_levels":"Owner,Maintainer","user_names":["s30037060"]}` |
| `setting policy protect-tag delete` | `codehub-cli setting policy protect-tag delete [--project <path>] <name> [--yes]` | Delete a protected tag. `--yes` skips confirmation |

#### Protected Branch Create Flags

| Flag | Description |
|------|-------------|
| `--name <n>` | Branch name (required) |
| `--merge-access-levels <roles>` | Roles allowed to merge, comma-separated (e.g. "Owner,Maintainer") |
| `--push-access-levels <roles>` | Roles allowed to push, comma-separated |
| `--merge-user <ids>` | Employee numbers allowed to merge, comma-separated |
| `--push-user <ids>` | Employee numbers allowed to push, comma-separated |
| `--action <json>` | Action permission in JSON format (repeatable). Actions: create/push/merge/delete/force-push/approval/review/read |

### Upgrade

| Command | Syntax | Description |
|---------|--------|-------------|
| `upgrade` | `codehub-cli upgrade [--check] [--yes] [--target-version <v>] [--openx-token <token>]` | Upgrade codehub-cli to the latest or a specified version (`update` is an alias) |

#### Upgrade Flags

| Flag | Type | Description |
|------|------|-------------|
| `--check, -c` | bool | Only check for new version, do not update |
| `--yes, -y` | bool | Skip confirmation prompt |
| `--target-version` | string | Update to a specific version (e.g., `v1.0.0`) |
| `--openx-token` | string | OpenX static token for download (auto-created if not set) |

**Examples:**

```bash
# Update to the latest version
codehub-cli upgrade

# Check if a new version is available
codehub-cli upgrade --check

# Update without confirmation prompt
codehub-cli upgrade --yes

# Update to a specific version
codehub-cli upgrade --target-version v1.0.0
```

### Raw API

| Command | Syntax | Description |
|---------|--------|-------------|
| `api` | `codehub-cli api [METHOD] <endpoint> [flags]` | Raw API request to any CodeHub endpoint |

**Flags:**

| Flag | Description |
|------|-------------|
| `[METHOD]` | HTTP method (GET, POST, PUT, DELETE, etc.). Optional: defaults to GET or POST if fields provided |
| `<endpoint>` | API endpoint path. Supports `:id` (resolved to current project) and `:name` placeholders |
| `--field key=value` | Add a typed query/body field (can be specified multiple times) |
| `--raw-field key=value` | Add a raw string query/body field (can be specified multiple times) |
| `--input <file>` | File to use as request body, or `-` for stdin |
| `--header key:value` | Add an HTTP request header (can be specified multiple times) |
| `-l, --limit N` | Maximum number of items to return (enables auto-pagination) |
| `--offset N` | Skip first N items (requires `--limit`) |
| `--silent` | Do not print the response body |
| `-i, --include` | Include HTTP response status line and headers in output |

**Placeholder Resolution:**
- `:id` — Replaced with the current project ID/path
- `:name` — Resolved from `--field` values (e.g., `--field name=some-value`)

**Examples:**

```bash
# Basic GET with query parameter
codehub-cli api GET /api/v4/projects/:id/merge_requests --field state=opened

# POST with typed fields
codehub-cli api POST /api/v4/projects/:id/merge_requests \
  --field source_branch=dev --field target_branch=main --field title="Merge dev to main"

# Using :id placeholder with project auto-detection
codehub-cli api /projects/:id/merge_requests/:iid --field iid=42

# Pagination with limit and offset
codehub-cli api GET /projects/:id/issues --limit 50 --offset 100

# Request body from file
codehub-cli api PUT /projects/:id/repository/files/README.md \
  --input body.json --field file_path=README.md

# Request body from stdin
echo '{"title":"New issue"}' | codehub-cli api POST /projects/:id/issues --input -

# Custom headers
codehub-cli api GET /api/v4/user --header "Accept: application/json"

# Silent mode (skip response body, useful for status checks)
codehub-cli api DELETE /projects/:id/issues/123 --silent

# Include response headers in output
codehub-cli api GET /projects/:id --include
```

---

## 🔗 Project Detection

Priority: `--project/-p` flag > Git origin auto-detect > `CODEHUB_PROJECT` env var.

When the user provides a CodeHub URL, extract the project path:

**From URL to path** (`ssh://git@codehub-dg-g.huawei.com:2222/org1/org2/repo.git`):
1. Strip protocol (`ssh://`, `https://`, `git://`)
2. Strip user (`git@`)
3. Strip port (`:2222`)
4. Strip suffix (`.git`)

Result: `org1/org2/repo`

**From URL to host** — extract domain, then map using the host mapping table below.

### Host Mapping

| Git Remote Domain | API Host |
|---|---|
| `codehub-y.huawei.com`, `codehub-dg-y.huawei.com`, `szv-y.codehub.huawei.com`, `lfg-y.codehub.huawei.com`, `kwe-y.codehub.huawei.com` | `https://codehub-y.huawei.com` |
| `cr-y.codehub.huawei.com`, `szv-cr-y.codehub.huawei.com`, `balong-cr-y.codehub.huawei.com` | `https://cr-y.codehub.huawei.com` |
| `codehub-g.huawei.com`, `codehub-dg-g.huawei.com` | `https://codehub-g.huawei.com` |
| `open.codehub.huawei.com`, `szv-open.codehub.huawei.com` | `https://open.codehub.huawei.com` |
| `gamma.codehub.huawei.com`, `dgg-g.gamma.codehub.huawei.com`, `szv-g.gamma.codehub.huawei.com` | `https://gamma.codehub.huawei.com` |

---

## 📊 Variable Resolution

| Variable | How to get | Example |
|---|---|---|
| `<host>` | User URL > Git remote mapping > `auth status` | `https://codehub-g.huawei.com` |
| `<project-path>` | User URL > Git origin > `-p` flag | `org/repo` |
| `<mr-iid>` | `mr list --columns iid` | `30` |
| `<issue-iid>` | `issue list --columns iid` | `15` |
| `<pipeline-id>` | `pipeline list --columns id` | `12345` |
| `<cr-iid>` | `cr list --columns iid` | `7` |

---

## 👤 Username Support

Many commands that accept user ID parameters also support usernames (employee IDs). When a non-numeric value is provided, the CLI automatically resolves it to a user ID via the API:

- positional arg (project member add/remove)
- `--assignee` (mr/cr review create/reply, mr create/update, issue create/update, cr update)
- `--assignees`, `--reviewers` (mr create/update, cr create)
- `--author`, `--assignee` (mr list, cr list)
- `--author`, `--viewer`, `--assignee`, `--proposer` (project/group review list)

Example: `codehub-cli mr create -p org/repo --assignee s30037606 --source-branch feat --target-branch main --title "feat: ..."`

---

## ⚠️ Error Handling

### Two-Level Diagnosis

1. **HTTP response code** — initial direction (401=auth, 403=forbidden, 404=not found, 400=bad params, 500=server)
2. **API error code** (`CH.XXXXXXXX`) — precise diagnosis: `CH` = CodeHub, next 3 digits = microservice, next 2 = module, last 3 = error number

Example: `CH.00405114` = projectsvr(004) + merge_request(05) + error 114

### Recovery

| HTTP Code | Action |
|---|---|
| 401 | `codehub-cli auth login` |
| 403 | Verify project permissions |
| 404 | Use `list` to verify resource ID |
| 400 | Check `--help` for parameter requirements |

See [error-codes.md](error-codes.md) for the full error code table.
