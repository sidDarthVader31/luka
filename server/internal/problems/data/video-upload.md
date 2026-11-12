## Functional requirements
- Creators upload videos in chunks.
- Each upload is transcoded into several formats.
- Viewers stream the finished videos.

## Scale
- 2,000 requests/s: 1,000 upload chunks (writes) and 1,000 playback requests (reads).
- A chunk is about 2 MB, so storage grows fast.
- Transcoding takes about 200 ms of work per chunk.

## What to think about
- An upload should be acknowledged once the chunk is stored, not after transcoding. Move slow work off the request path.
- Video files belong in object storage, not in a database.
- Playback reads repeat heavily. Serve them from the edge.
