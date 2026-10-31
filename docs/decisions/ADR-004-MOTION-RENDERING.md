# ADR 004 — controlled CPU motion rendering

Accepted for F9/F10 local pilot, 30 October 2026.

Use application-owned scene operations shared by browser SVG and FFmpeg/libass export. Measured timestamped narration supplies all scene/caption timing. Export H.264/AAC at 720×1280 and 24fps with two CPU threads.

This fits the existing 8 GB laptop target without GPU hosting, a paid generative-video API or execution of model-authored animation code. Native encoding avoids a heavyweight browser render dependency. Preview and export share geometry and timing; font rasterization can differ.

Consequences: the operator must install compatible Devanagari fonts and FFmpeg/libass. Conservative text limits can reject a scene for editing. The initial component library is deliberately finite. A later renderer may replace this adapter while preserving the versioned composition/artifact boundary. Final media must decode and meet audio/duration checks before Ready. Never replace last good output with an unvalidated render.
