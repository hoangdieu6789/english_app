package service

import "context"

// LLMSource is the provider and model that actually answered an LLM call, for example
// claude / claude-sonnet-5-5 or gemini / gemini-3-flash-preview. With a provider chain the
// caller cannot know it in advance, so each completer reports it on success.
type LLMSource struct {
	Provider string
	Model    string
}

type llmSourceKey struct{}

// WithLLMSource returns a context that records the source of the next successful LLM call.
func WithLLMSource(ctx context.Context) (context.Context, *LLMSource) {
	src := &LLMSource{}
	return context.WithValue(ctx, llmSourceKey{}, src), src
}

func reportLLMSource(ctx context.Context, provider, model string) {
	if src, ok := ctx.Value(llmSourceKey{}).(*LLMSource); ok {
		src.Provider, src.Model = provider, model
	}
}
