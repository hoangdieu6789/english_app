package storage

import "context"

// AudioStorage abstracts where recorded audio blobs are persisted. The local
// disk implementation is for dev only — swapping to S3/Supabase later for
// production only means writing a new implementation of this interface.
type AudioStorage interface {
	// Save stores audioWAV and returns a URL/path the frontend can use to
	// play it back.
	Save(ctx context.Context, audioWAV []byte) (url string, err error)
}
