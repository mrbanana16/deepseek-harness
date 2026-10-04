# Fork workflow

These standing instructions supplement every applicable `AGENTS.md` file.

- Start every task on `ForkMaster` by fetching `origin/ForkMaster` and `upstream/master`. Merge new official commits into `ForkMaster`, push only to `origin`, and stop for user direction before resolving any conflict.
- Never push to or otherwise modify the official `upstream` repository. Create all changes, commits, branches, tags, and pull requests in the fork, and sign every created commit, including merge commits, with GPG.
- The fork is public. Never commit credentials, API keys, machine-specific filesystem paths, or other sensitive data. An agent may add itself to the author list when relevant.
- Preserve existing user-authored comments. Run focused builds and checks when useful, but do not launch application runtimes or Web UIs, and leave no npm, Vue, or related background process running.
