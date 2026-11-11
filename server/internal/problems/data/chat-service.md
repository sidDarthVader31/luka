## Functional requirements
- Send a message to a person or a group.
- Load recent message history when a conversation opens.

## Scale
- 10M daily users at peak send 12,000 messages/s (writes).
- History loads and read receipts add 18,000 reads/s: 30,000 requests/s, 60% reads.
- A message is about 1 KB.

## What to think about
- Sending must feel instant: acknowledge once the message is durably queued, and deliver and store it in the background.
- 12,000 writes/s is more than one relational primary can take. Pick a store that scales writes, or shard.
- Recent history is read far more than old history.
