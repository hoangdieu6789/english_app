package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository"
)

const recentSentenceHistoryLimit = 30

type PracticeSentenceService struct {
	generator SentenceGenerator
	repo      repository.PracticeSentenceRepository
}

func NewPracticeSentenceService(generator SentenceGenerator, repo repository.PracticeSentenceRepository) *PracticeSentenceService {
	return &PracticeSentenceService{generator: generator, repo: repo}
}

func (s *PracticeSentenceService) NextSentence(ctx context.Context, userID uuid.UUID) (*domain.PracticeSentence, error) {
	recent, err := s.repo.ListRecentTexts(ctx, userID, recentSentenceHistoryLimit)
	if err != nil {
		return nil, fmt.Errorf("list recent sentences: %w", err)
	}

	generated, err := s.generator.Generate(ctx, recent)
	if err != nil {
		return nil, fmt.Errorf("generate sentence: %w", err)
	}

	saved, err := s.repo.Create(ctx, userID, generated.Text, generated.Phonetic, generated.Gloss)
	if err != nil {
		return nil, fmt.Errorf("save generated sentence: %w", err)
	}

	return saved, nil
}
