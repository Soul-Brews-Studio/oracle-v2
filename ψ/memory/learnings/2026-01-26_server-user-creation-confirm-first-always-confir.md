---
title: Server User Creation: Confirm First
tags: [server, white.local, user-creation, confirmation, safety, lesson-learned]
created: 2026-01-26
source: Session 2026-01-27 - oracle-arthur creation
---

# Server User Creation: Confirm First

Server User Creation: Confirm First

Always confirm before creating server accounts. Even when user says "yes please create", confirm specific details (username, shell, home dir) before running useradd.

WRONG: Run `useradd` immediately after request
RIGHT: Show details → Wait for explicit "yes" → Then create

Actions requiring confirmation: create user, delete user, add to sudo, change permissions, install packages, modify system config.

Learned from: Creating oracle-arthur on white.local without confirming details first.

---
*Added via Oracle Learn*
