## Functional requirements
- Users publish posts.
- Users open a feed of recent posts from the accounts they follow.

## Scale
- 50,000 requests/s at peak; 95% are feed reads, 5% are new posts.
- A post or feed page is about 2 KB.

## What to think about
- Feed reads dominate. A single relational primary will not keep up; cache the feeds.
- Building every follower's feed (fan-out on write) is heavy but need not slow down the person posting. Can it happen in the background?
- Keep feed p99 low: every hop on the read path adds latency.
