# Requirements: Reanimator Core

## Introduction
Reanimator converts openly licensed, deterministic ActionScript 1/2 educational simulations
(.swf) into editable HTML5/JS and produces a measured equivalence report between the original
(played in Ruffle) and the rebuild.

## Requirements

### Requirement 1: Upload and validation
**User story:** As a teacher, I want to upload a .swf so that Reanimator can tell me whether it can be converted.

1. WHEN a file is uploaded THEN the system SHALL verify it is a valid SWF (FWS/CWS/ZWS header) and reject anything else with a clear message.
2. WHEN the SWF uses ActionScript 3 THEN the system SHALL report it as out of scope and stop, without partial output.
3. WHEN the SWF is valid and in scope THEN the system SHALL record its SHA-256 and start the pipeline.
4. IF a conversion for the same SHA-256 is cached THEN the system SHALL reuse it and say so.

### Requirement 2: Extraction
**User story:** As a developer, I want assets and scripts extracted so the rest of the pipeline works on readable inputs.

1. WHEN extraction runs THEN the system SHALL export images, sounds, shapes/vectors, text and ActionScript into a work directory.
2. IF FFDec fails or times out THEN the system SHALL return the stage error and keep partial exports for debugging.
3. WHEN extraction succeeds THEN the system SHALL emit an `ExtractionManifest` listing every exported file and its type.

### Requirement 3: Behavior specification
**User story:** As a teacher, I want a plain-language description of what the simulation does so I can check it before trusting the rebuild.

1. WHEN extraction completes THEN the system SHALL generate a `BehaviorSpec` with inputs (mouse, keys, UI controls), state variables, rules and visible outputs.
2. WHEN the BehaviorSpec is produced THEN the system SHALL validate it against its JSON schema and retry generation up to N times on failure.
3. WHEN the BehaviorSpec is ready THEN the system SHALL show it to the user in readable form.

### Requirement 4: HTML5 rewrite
**User story:** As a teacher, I want clean editable code so I can modify the lesson myself.

1. WHEN a valid BehaviorSpec exists THEN the system SHALL generate an HTML5/JS project that runs from static files with no external network requests.
2. WHEN code is generated THEN the system SHALL keep user-visible text in a single strings file to enable localization.
3. IF generated code fails to load in a headless browser THEN the system SHALL feed the error back for repair, up to N attempts, then report failure.

### Requirement 5: Equivalence verification
**User story:** As a teacher, I want proof the rebuild behaves like the original.

1. WHEN verification runs THEN the system SHALL execute each scenario (scripted event timeline) against the original in Ruffle and against the rebuild, capturing frames at defined checkpoints.
2. WHEN frames are captured THEN the system SHALL compare them with a configurable pixel threshold and maximum differing-pixel percentage.
3. IF the original produces different frames across two identical runs THEN the system SHALL mark that scenario NON-COMPARABLE and exclude it from the verdict, stating why.
4. WHEN all comparable scenarios are within tolerance THEN the verdict SHALL be PASS; otherwise PARTIAL or FAIL with the worst checkpoints identified.
5. The verifier SHALL NOT call any LLM.

### Requirement 6: Report
**User story:** As a judge or teacher, I want to see the evidence at a glance.

1. WHEN verification ends THEN the system SHALL produce an HTML report with side-by-side original vs rebuild frames, diff overlays, per-scenario metrics and the verdict.
2. The report SHALL list scenarios excluded as NON-COMPARABLE.

### Requirement 7: Localization
**User story:** As a teacher, I want to translate the lesson into my language.

1. WHEN the user edits or imports translations THEN the system SHALL regenerate the rebuild using the new strings without altering logic.
2. WHEN an identity translation is applied THEN the output SHALL be byte-identical to the original rebuild.

### Requirement 8: SCORM export
**User story:** As a teacher, I want to upload the lesson to my learning platform.

1. WHEN the user exports THEN the system SHALL produce a SCORM 1.2 zip with a valid imsmanifest.xml referencing every packaged file.
2. WHEN the package is opened THEN it SHALL run offline.

### Requirement 9: Provenance and licensing
**User story:** As the author, I want to avoid infringing anyone's rights.

1. The repository SHALL include samples/SOURCES.md recording author, license and source URL for every sample.
2. WHEN a report is generated for a sample THEN it SHALL display that sample's attribution.

### Requirement 10: Demo and operation
1. The public demo SHALL work without user-supplied API keys for the bundled samples via the conversion cache.
2. WHEN a user supplies their own key THEN the system SHALL allow converting new SWFs.
3. A full pipeline run on a showcase sample SHOULD complete in under 5 minutes.
