package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/i18n"
	"englishapp/backend/internal/repository"
	"englishapp/backend/internal/rubric"
	"englishapp/backend/internal/storage"
)

// backgroundGradeTimeout bounds the background LLM step of one attempt (free models answered
// in 13–50 s, Claude Code in ~30 s; the chain may try several providers).
const backgroundGradeTimeout = 3 * time.Minute

type PronunciationService struct {
	scorer  PronunciationScorer
	grader  *SpeakingGrader
	storage storage.AudioStorage
	repo    repository.PronunciationRepository

	transcriber Transcriber    // nil = Azure recognises free speech by itself
	reviews     *ReviewService // nil = weak words are not queued for review

	bgTimeout time.Duration
	wg        sync.WaitGroup // background LLM steps
}

// SetReviews queues the weak words of every attempt for spaced-repetition review.
func (s *PronunciationService) SetReviews(r *ReviewService) { s.reviews = r }

// SetTranscriber makes free-speech tasks (IELTS parts) transcribe the audio first and score
// it with Azure against that transcript. Shadowing keeps its given sentence.
func (s *PronunciationService) SetTranscriber(t Transcriber) { s.transcriber = t }

func NewPronunciationService(scorer PronunciationScorer, grader *SpeakingGrader, storage storage.AudioStorage, repo repository.PronunciationRepository) *PronunciationService {
	return &PronunciationService{scorer: scorer, grader: grader, storage: storage, repo: repo, bgTimeout: backgroundGradeTimeout}
}

// Wait blocks until every background LLM step has finished (tests, shutdown).
func (s *PronunciationService) Wait() { s.wg.Wait() }

// Get returns one of the user's attempts; nil when it does not exist or is not theirs.
func (s *PronunciationService) Get(ctx context.Context, id, userID uuid.UUID) (*domain.PronunciationAttempt, error) {
	a, err := s.repo.Get(ctx, id, userID)
	if a != nil {
		FillWordPhonemes(a)
	}
	return a, err
}

// ScoreWord scores the learner saying one word (Azure, the word as reference); nothing is
// saved. Used to practise a word again from the pronunciation tips.
func (s *PronunciationService) ScoreWord(ctx context.Context, audioWAV []byte, word string) (*ScoreResult, error) {
	return s.scorer.Score(ctx, TrimSilenceWAV(audioWAV), word)
}

// History is one page of the learner's attempts and the number per task type.
type History struct {
	Attempts []*domain.AttemptSummary
	Counts   map[string]int
	Next     *time.Time // pass as before for the next page; nil = last page
}

const historyPageSize = 20

// History returns the learner's attempts newest first, historyPageSize per page.
func (s *PronunciationService) History(ctx context.Context, userID uuid.UUID, taskType string, before *time.Time) (*History, error) {
	list, err := s.repo.List(ctx, userID, taskType, before, historyPageSize+1)
	if err != nil {
		return nil, fmt.Errorf("list attempts: %w", err)
	}
	h := &History{Attempts: list}
	if len(list) > historyPageSize {
		h.Attempts = list[:historyPageSize]
		next := h.Attempts[historyPageSize-1].CreatedAt
		h.Next = &next
	}
	if h.Counts, err = s.repo.CountByType(ctx, userID); err != nil {
		return nil, fmt.Errorf("count attempts: %w", err)
	}
	return h, nil
}

// HasTask reports whether taskType is shadowing or an IELTS part from the rubric.
func (s *PronunciationService) HasTask(taskType string) bool {
	return s.grader.HasTask(taskType)
}

// SubmitAttempt scores the recording with the pronunciation provider, then grades it with the
// speaking rubric. referenceText is the sentence to read (shadowing); it is empty for free
// speaking tasks. A rubric failure is logged and the attempt is still saved without it.
//
// It returns as soon as Azure and the Pronunciation band are ready. For IELTS parts the LLM
// criteria (FC, LR, GRA) are graded in the background: the attempt is saved with
// GradingStatus "pending" and updated when the LLM answers (poll Get).
func (s *PronunciationService) SubmitAttempt(ctx context.Context, userID uuid.UUID, audioWAV []byte, referenceText string, task SpeakingTask) (*domain.PronunciationAttempt, error) {
	// Cut leading/trailing silence once; Azure, storage and pitch analysis all use the trimmed
	// audio, so word offsets stay consistent.
	audioWAV = TrimSilenceWAV(audioWAV)

	result, source, err := s.score(ctx, audioWAV, referenceText)
	if err != nil {
		// Keep the recording so a failed attempt can be listened to later; it is not saved
		// as an attempt.
		secs, peak, _ := AudioLevel(audioWAV)
		saved := "not saved"
		if url, serr := s.storage.Save(ctx, audioWAV); serr == nil {
			saved = url
		}
		log.Printf("pronunciation: scoring failed: task=%s audio=%.1fs peak_rms=%.0f file=%s: %v", task.Type, secs, peak, saved, err)
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
		QuestionSetID:     task.QuestionSetID,
		TranscriptSource:  &source,
	}
	if task.Prompt != "" {
		attempt.TaskPrompt = &task.Prompt
	}
	if i18n.Supported(task.FeedbackLang) {
		attempt.FeedbackLang = &task.FeedbackLang
	}

	in := GradeInput{
		Task:       task,
		Transcript: result.RecognizedText,
		AzureRaw:   result.Raw,
		AudioWAV:   audioWAV,
	}
	graded, st, err := s.grader.GradePronunciation(ctx, in)
	if err != nil {
		log.Printf("speaking rubric: %v", err)
	} else {
		applyRubric(attempt, graded, st.Segs)
	}
	pending := err == nil && s.grader.NeedsLLM(task.Type)
	attempt.GradingStatus = domain.GradingDone
	if pending {
		attempt.GradingStatus = domain.GradingPending
		// The overall band waits for the LLM criteria: a Pronunciation-only band would skew
		// the learner's progress if it were stored as the attempt's band.
		attempt.RubricScore, attempt.CEFRLevel = nil, nil
	}

	saved, err := s.repo.Create(ctx, attempt)
	if err != nil {
		return nil, fmt.Errorf("save pronunciation attempt: %w", err)
	}
	if s.reviews != nil {
		s.reviews.AddFromAttempt(ctx, userID, saved.WordScores)
	}
	if pending {
		s.gradeInBackground(saved.ID, in, st)
	}
	return saved, nil
}

// score runs Azure. Free speech (no referenceText) is transcribed first when a Transcriber is
// set; if transcription or the scripted Azure call fails, Azure recognises it by itself.
func (s *PronunciationService) score(ctx context.Context, audioWAV []byte, referenceText string) (*ScoreResult, string, error) {
	if referenceText == "" && s.transcriber != nil {
		transcript, err := s.transcriber.Transcribe(ctx, audioWAV)
		if err == nil {
			result, err := s.scorer.ScoreTranscribed(ctx, audioWAV, transcript)
			if err == nil {
				// Azure's DisplayText follows the reference; keep whisper's punctuation.
				result.RecognizedText = transcript
				return result, TranscriptWhisper, nil
			}
			if ctx.Err() != nil {
				return nil, "", err
			}
			log.Printf("pronunciation: scoring against the transcript failed, using Azure recognition: %v", err)
		} else {
			log.Printf("pronunciation: transcription failed, using Azure recognition: %v", err)
		}
	}
	result, err := s.scorer.Score(ctx, audioWAV, referenceText)
	return result, TranscriptAzure, err
}

// gradeInBackground runs the LLM step and stores the final result.
func (s *PronunciationService) gradeInBackground(id uuid.UUID, in GradeInput, st *GradeState) {
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		defer func() {
			if r := recover(); r != nil {
				log.Printf("speaking rubric: background grading of %s panicked: %v", id, r)
				_ = s.repo.SetGradingStatus(context.Background(), id, domain.GradingFailed)
			}
		}()
		ctx, cancel := context.WithTimeout(context.Background(), s.bgTimeout)
		defer cancel()
		ctx, source := WithLLMSource(ctx)
		res, _ := s.grader.GradeTranscriptCriteria(ctx, in, st)
		if err := s.repo.UpdateGrading(context.Background(), id, gradingUpdate(res, source)); err != nil {
			log.Printf("speaking rubric: save background grading of %s: %v", id, err)
		}
	}()
}

// ResumePending restarts the LLM step of attempts left pending (e.g. the API restarted while
// grading), from the stored Azure result and transcript. It returns how many were restarted.
func (s *PronunciationService) ResumePending(ctx context.Context) (int, error) {
	attempts, err := s.repo.ListPendingGrading(ctx, 50)
	if err != nil {
		return 0, err
	}
	for _, a := range attempts {
		in := GradeInput{Task: SpeakingTask{Type: a.TaskType, Prompt: deref(a.TaskPrompt), FeedbackLang: deref(a.FeedbackLang)}, Transcript: deref(a.RecognizedText), AzureRaw: a.AzureResult}
		_, st, err := s.grader.GradePronunciation(ctx, in)
		if err != nil || !s.grader.NeedsLLM(a.TaskType) {
			log.Printf("speaking rubric: cannot resume grading of %s: %v", a.ID, err)
			_ = s.repo.SetGradingStatus(ctx, a.ID, domain.GradingFailed)
			continue
		}
		s.gradeInBackground(a.ID, in, st)
	}
	return len(attempts), nil
}

func gradingUpdate(res *rubric.Result, source *LLMSource) domain.GradingUpdate {
	u := domain.GradingUpdate{Status: domain.GradingDone}
	raw, err := json.Marshal(res)
	if err != nil {
		log.Printf("speaking rubric: marshal result: %v", err)
		u.Status = domain.GradingFailed
		return u
	}
	u.Rubric = raw
	u.RubricVersion = &res.Version
	if hasOverallBand(res) {
		band := float32(res.Overall.Band)
		cefr := res.Overall.CEFR
		u.RubricScore, u.CEFRLevel = &band, &cefr
	}
	if source.Provider != "" {
		u.GraderProvider, u.GraderModel = &source.Provider, &source.Model
	}
	return u
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func applyRubric(a *domain.PronunciationAttempt, res *rubric.Result, segs []rubric.Segment) {
	raw, err := json.Marshal(res)
	if err != nil {
		log.Printf("speaking rubric: marshal result: %v", err)
		return
	}
	a.Rubric = raw
	a.RubricVersion = &res.Version
	if hasOverallBand(res) {
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

// hasOverallBand reports whether the result's overall band is stored as the attempt's band
// (used by progress). The rubric averages over the criteria it could assess and marks the
// band provisional when some are missing; for an IELTS part a band from part of the
// criteria is not an IELTS band (e.g. a too-short answer leaves only Pronunciation), so only
// a complete result counts. Shadowing is Pronunciation-only by design and keeps its band.
func hasOverallBand(res *rubric.Result) bool {
	if res.Overall.Band <= 0 {
		return false
	}
	return res.TaskType == TaskShadowing || !res.Overall.Provisional
}
