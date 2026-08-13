# Tastes

## Communication
- User communicates in Indonesian (Bahasa Indonesia); assistant responses should be in Indonesian too. Confidence: 0.7

## Workflow
- Prefers a review-then-fix workflow: present a prioritized findings/fix plan and ask for approval before implementing; a terse approval ("oke perbaiki") means execute the full proposed plan without per-item confirmation. Confidence: 0.5
- Values clean git hygiene: remove accidentally committed artifacts (e.g. redirect-created files, tsc/build output files) and restore files that were deleted unintentionally rather than leaving the working tree messy. Confidence: 0.4
- Comfortable with the agent committing fixes and pushing directly to the main branch after approval, rather than using feature branches or pull requests. Confidence: 0.35
