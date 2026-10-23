package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository"
	"englishapp/backend/internal/storage"
)

type PronunciationService struct {
	scorer  PronunciationScorer
	storage storage.AudioStorage
	repo    repository.PronunciationRepository
}

func NewPronunciationService(scorer PronunciationScorer, storage storage.AudioStorage, repo repository.PronunciationRepository) *PronunciationService {
	return &PronunciationService{scorer: scorer, storage: storage, repo: repo}
}

func (s *PronunciationService) SubmitAttempt(ctx context.Context, userID uuid.UUID, audioWAV []byte, referenceText string) (*domain.PronunciationAttempt, error) {
	result, err := s.scorer.Score(ctx, audioWAV, referenceText)
	if err != nil {
		return nil, fmt.Errorf("score pronunciation: %w", err)
	}

	audioURL, err := s.storage.Save(ctx, audioWAV)
	if err != nil {
		return nil, fmt.Errorf("store audio: %w", err)
	}

	attempt := &domain.PronunciationAttempt{
		UserID:         userID,
		AudioURL:       audioURL,
		ReferenceText:  referenceText,
		RecognizedText: &result.RecognizedText,
		OverallScore:   result.OverallScore,
		FluencyScore:   result.FluencyScore,
		WordScores:     result.WordScores,
		PhonemeScores:  result.PhonemeScores,
	}

	saved, err := s.repo.Create(ctx, attempt)
	if err != nil {
		return nil, fmt.Errorf("save pronunciation attempt: %w", err)
	}

	return saved, nil
}
