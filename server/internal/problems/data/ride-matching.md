## Functional requirements
- Drivers send their location every few seconds.
- A rider requests a ride and is matched with a nearby driver.

## Scale
- 100,000 active drivers updating every 5 s: about 19,800 location writes/s.
- About 2,200 match requests/s (reads): 22,000 requests/s, 10% reads.
- A location update is about 0.2 KB.

## What to think about
- Location updates are writes, and there are many of them. A single relational primary cannot absorb them.
- Matching needs a geo query ("drivers near here"). A search index fits that better than a table scan.
- Updates can be ingested in the background, but matches are on the rider's critical path.
