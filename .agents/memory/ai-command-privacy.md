---
name: AI command privacy
description: Personal settings and retention boundaries for Calyx AI slash commands.
---

AI settings belong to each Discord user. Conversation history is scoped to that user and server, with a maximum of 12 turns retained per server. `/ai clear` removes only the current server's history; `/ai reset` removes all history and personal settings. History and settings replies should remain private.

**Why:** The `/ai` commands need usable conversation history without exposing one user's messages or preferences to other users, while bounded retention limits stored content.

**How to apply:** Preserve per-user ownership, server scoping, bounded history, and private settings/history replies when extending the AI commands. Make any broader retention or cross-server context an explicit product choice.
