package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository"
	"englishapp/backend/internal/rubric"
	"englishapp/backend/internal/storage"
)

type PronunciationService struct {
	scorer  PronunciationScorer
	grader  *SpeakingGrader
	storage storage.AudioStorage
	repo    repository.PronunciationRepository
}

func NewPronunciationService(scorer PronunciationScorer, grader *SpeakingGrader, storage storage.AudioStorage, repo repository.PronunciationRepository) *PronunciationService {
	return &PronunciationService{scorer: scorer, grader: grader, storage: storage, repo: repo}
}

// HasTask reports whether taskType is shadowing or an IELTS part from the rubric.
func (s *PronunciationService) HasTask(taskType string) bool {
	return s.grader.HasTask(taskType)
}

// SubmitAttempt scores the recording with the pronunciation provider, then grades it with the
// speaking rubric. referenceText is the sentence to read (shadowing); it is empty for free
// speaking tasks. A rubric failure is logged and the attempt is still saved without it.
func (s *PronunciationService) SubmitAttempt(ctx context.Context, userID uuid.UUID, audioWAV []byte, referenceText string, task SpeakingTask) (*domain.PronunciationAttempt, error) {
	result, err := s.scorer.Score(ctx, audioWAV, referenceText)
	if err != nil {
		return nil, fmt.Errorf("score pronunciation: %w", err)
	}

	audioURL, err := s.storage.Save(ctx, audioWAV)
	if err != nil {
		return nil, fmt.Errorf("store audio: %w", err)
	}

	attempt := &domain.PronunciationAttempt{
		UserID:            userID,
		AudioURL:          audioURL,
		ReferenceText:     referenceText,
		RecognizedText:    &result.RecognizedText,
		TaskType:          task.Type,
		OverallScore:      result.OverallScore,
		FluencyScore:      result.FluencyScore,
		CompletenessScore: &result.CompletenessScore,
		ProsodyScore:      result.ProsodyScore,
		PronScore:         &result.PronScore,
		WordScores:        result.WordScores,
		PhonemeScores:     result.PhonemeScores,
		AzureResult:       result.Raw,
	}

	graded, segs, err := s.grader.Grade(ctx, GradeInput{
		Task:       task,
		Transcript: result.RecognizedText,
		AzureRaw:   result.Raw,
		AudioWAV:   audioWAV,
	})
	if err != nil {
		log.Printf("speaking rubric: %v", err)
	} else {
		applyRubric(attempt, graded, segs)
	}

	saved, err := s.repo.Create(ctx, attempt)
	if err != nil {
		return nil, fmt.Errorf("save pronunciation attempt: %w", err)
	}

	return saved, nil
}

func applyRubric(a *domain.PronunciationAttempt, res *rubric.Result, segs []rubric.Segment) {
	raw, err := json.Marshal(res)
	if err != nil {
		log.Printf("speaking rubric: marshal result: %v", err)
		return
	}
	a.Rubric = raw
	a.RubricVersion = &res.Version
	if res.Overall.Band > 0 {
		band := float32(res.Overall.Band) // IELTS band 0–9 in half bands
		cefr := res.Overall.CEFR
		a.RubricScore, a.CEFRLevel = &band, &cefr
	}

	// Copy the break / monotone flags onto the word scores the UI shows. The rubric parses the
	// same Azure response, so words line up one to one with a single segment.
	if len(segs) == 1 && len(segs[0].Words) == len(a.WordScores) {
		for i, w := range segs[0].Words {
			a.WordScores[i].UnexpectedBreak = w.UnexpectedBreak
			a.WordScores[i].MissingBreak = w.MissingBreak
			a.WordScores[i].Monotone = w.Monotone
		}
	}
}
