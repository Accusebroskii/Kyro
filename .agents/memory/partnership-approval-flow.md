---
name: Partnership approval flow
description: Product requirements for Calyx's partner application and posting access.
---

Applicants submit their own server details and advertisement through a partnership ticket. The ticket shows Calyx's required advertisement. Applicants post that ad in their own server and upload a screenshot. AI checks that the screenshot visibly shows the configured ad as sent in the applicant's named server; a clear match automatically grants the role configured in `/setup partnership`. Applicants then post their own ad in the configured text channel or forum. Staff may still manually grant the role with `/partnership accept`.

**Why:** The project owner specified that approval should be automated from the submitted screenshot and that posting access should be role-based and limited to a configured destination.

**How to apply:** Keep the automatic role-grant path limited to clear AI verification results. Preserve the staff override, and require the configured role to have send/post permission in the selected destination.
