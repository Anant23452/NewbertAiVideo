# Current video workflow

1 November 2026. Instagram is deferred at the user's request.

1. Save a topic and language. Submit the saved brief to generate a storyboard.
2. The worker retrieves source excerpts. Gemini writes each scene's actual spoken narration, short title, visual labels and claim/evidence metadata.
3. Open storyboard review, inspect the generated result and choose Use generated storyboard. Review factual claims, select the configured voice, save and approve the exact storyboard.
4. Generate voice & video. ElevenLabs returns narration and character timing. The worker saves and validates the audio, uses measured timing for scenes/captions, and renders controlled motion graphics with FFmpeg/libass.
5. Open Saved videos & history to play the validated MP4 and download video or VTT captions.

Rendering currently happens on this local computer in the separate background worker, not at Gemini or ElevenLabs. No GPU is required by the current renderer. The same CPU rendering worker can be packaged for a cloud host later, with its fonts, PostgreSQL access and private media storage; this project has not deployed it to cloud or established free hosted rendering capacity.

The motion graphics use application-owned scene components rather than generative video clips. Captions are derived from actual speech alignment, not guessed timestamps. Social-post captions and Instagram scheduling are separate future publishing work.

Review correction: the fallback search preserves Unicode combining marks, so Hindi vowel signs stay attached to their words and complete filler words can be removed correctly. A mocked retrieval regression checks the exact Hindi fallback query without spending provider credits.

Repair: full-sentence or slightly misspelled topics could yield no Wikipedia search results and pause before Gemini. Retrieval now retries once with cleaned keyword prefixes, then still fails closed if no usable source excerpts exist. The paused dopamine-detox project successfully produced three live Gemini scenes after this fix. Applying that result and approving content remain review steps; the repair did not overwrite the draft or purchase speech.
