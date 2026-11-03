## Output format

Return a single JSON object, no markdown fences, matching `schema/evaluation.schema.json`:

```json
{
  "task_type": "part3",
  "criteria": [
    {
      "id": "grammatical_range_accuracy",
      "band": 6,
      "rationale": "Mix of simple and complex sentences; errors frequent in complex structures but rarely impede communication. Not 7: error-free sentences are not yet frequent.",
      "strengths": ["Uses conditionals and relative clauses"],
      "issues": [
        {
          "code": "GRA-04",
          "quote": "my brother like playing games",
          "correction": "my brother likes playing games",
          "explanation": "Feedback in the configured language.",
          "impact": "local",
          "confidence": "high"
        }
      ],
      "next_step": "One concrete practice suggestion."
    }
  ],
  "not_assessed": [],
  "summary": "2–3 sentences of overall feedback in the configured language."
}
```

Rules:

- `criteria` contains one entry for each criterion you rate (fluency_coherence, lexical_resource, grammatical_range_accuracy). Never include `pronunciation`.
- `band`: integer 1–9. A criterion you cannot rate goes in `not_assessed` instead.
- `code`: a feature code from the rubric (`FC-01`…`FC-05`, `LR-01`…`LR-04`, `GRA-01`…`GRA-05`).
- `quote`: exact words from the transcript.
- `impact`: `global` (impedes communication or changes meaning) or `local` (meaning still clear).
- `confidence`: `low` when the problem may be a recognition error.
- At most {{max_issues_per_criterion}} issues per criterion; group repeated errors into one issue.
