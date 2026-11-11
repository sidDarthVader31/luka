## Functional requirements
- Every API request is checked against its client's quota before it is served.
- Counters are updated so that limits hold across all servers.

## Scale
- 100,000 API requests/s at peak, and every one needs a quota check (a read).
- Counter updates are batched, one write for every four checks: 80% reads, 20% writes.
- A counter is about 0.2 KB.

## What to think about
- The limiter sits on every request, so its latency is added to everything. Keep the check path short and lightly loaded.
- Counters change constantly. An in-memory store suits them better than a relational database.
- If the limiter is down, the API is down: no single points of failure.
