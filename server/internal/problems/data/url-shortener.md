## Functional requirements
- Create a short link for a long URL.
- Redirect a short link to its long URL.

## Scale
- 100M new links a month (about 1,000 writes/s at peak).
- Redirects outnumber new links 19 to 1: 20,000 requests/s at peak, 95% reads.
- Each record is about 0.5 KB.

## What to think about
- Redirects are hot and repeat: where can they be answered without touching the database?
- One database primary takes every write. How much read load can you take off it?
- No single instance should be able to take redirects down.
