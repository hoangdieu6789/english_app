package storage

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

// LocalDiskStorage writes audio files under a directory served statically by
// the API at /uploads — dev-only, not durable across container restarts
// unless the directory is a mounted volume.
type LocalDiskStorage struct {
	dir       string
	publicURL string
}

func NewLocalDiskStorage(dir, publicURLPrefix string) (*LocalDiskStorage, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create audio storage dir: %w", err)
	}
	return &LocalDiskStorage{dir: dir, publicURL: publicURLPrefix}, nil
}

func (s *LocalDiskStorage) Save(_ context.Context, audioWAV []byte) (string, error) {
	filename := uuid.NewString() + ".wav"
	path := filepath.Join(s.dir, filename)

	if err := os.WriteFile(path, audioWAV, 0o644); err != nil {
		return "", fmt.Errorf("write audio file: %w", err)
	}

	return s.publicURL + "/" + filename, nil
}
