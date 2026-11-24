# Password blocklist (starter set)

The blocklist is a small starter set written for this project. It is not a download. The list lives in code as `STARTER_BLOCKLIST` in `blocklist.ts`, and there is no `blocklist.txt` file.

- Every entry is 15 or more characters and lowercase (checked by tests F1.AC17).
- It includes the app words "trip expense tracker" and "expense tracker". "trip expense" is not included because it is only 12 characters, so it can never be an accepted password under the 15-character minimum.
- The email-derived rule (a password equal to the email or the part before `@`) is in code (`isBlockedPassword` in `blocklist.ts`).

A full, larger list is a later follow-up and needs its own approval, including a licence check and a person reading the file before it is committed.
