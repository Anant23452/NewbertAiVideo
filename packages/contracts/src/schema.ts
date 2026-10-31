// Generated from docs/api/openapi-v1.json; keep contract changes synchronized.
export const contractSchema = {
  "$id": "https://newbert.local/contract",
  "definitions": {
    "Problem": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "format": "uri-reference"
        },
        "title": {
          "type": "string",
          "maxLength": 1000
        },
        "status": {
          "type": "integer",
          "minimum": 400,
          "maximum": 599
        },
        "code": {
          "type": "string",
          "maxLength": 80
        },
        "detail": {
          "type": "string",
          "maxLength": 1000
        },
        "requestId": {
          "type": "string",
          "format": "uuid"
        },
        "fieldErrors": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "field": {
                "type": "string",
                "maxLength": 200
              },
              "code": {
                "type": "string",
                "maxLength": 80
              }
            },
            "required": [
              "field",
              "code"
            ]
          },
          "maxItems": 100
        }
      },
      "required": [
        "type",
        "title",
        "status",
        "code",
        "detail",
        "requestId"
      ]
    },
    "Workspace": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "revision": {
          "type": "integer",
          "minimum": 1
        },
        "timezone": {
          "type": "string",
          "maxLength": 80
        },
        "createdAt": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": [
        "id",
        "revision",
        "timezone",
        "createdAt"
      ]
    },
    "Me": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "user": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid"
            },
            "status": {
              "type": "string",
              "enum": [
                "active",
                "disabled",
                "deletion_pending"
              ]
            }
          },
          "required": [
            "id",
            "status"
          ]
        },
        "workspace": {
          "$ref": "#/definitions/Workspace"
        },
        "csrfToken": {
          "type": "string",
          "maxLength": 256
        }
      },
      "required": [
        "user",
        "workspace",
        "csrfToken"
      ]
    },
    "WorkspacePatch": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "timezone": {
          "type": "string",
          "maxLength": 80
        }
      },
      "required": [
        "timezone"
      ]
    },
    "Brief": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "topic": {
          "type": "string",
          "maxLength": 1000,
          "minLength": 5
        },
        "language": {
          "type": "string",
          "enum": [
            "Hindi",
            "Hinglish"
          ]
        },
        "audience": {
          "type": "string",
          "enum": [
            "school",
            "college",
            "curious"
          ]
        },
        "mode": {
          "type": "string",
          "enum": [
            "guided",
            "automatic"
          ]
        },
        "targetSeconds": {
          "type": "integer",
          "minimum": 5,
          "maximum": 600
        }
      },
      "required": [
        "topic",
        "language",
        "audience",
        "mode"
      ]
    },
    "VoiceSelection": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "catalogVoiceId": {
          "type": "string",
          "maxLength": 200
        },
        "providerConnectionId": {
          "anyOf": [
            {
              "type": "string",
              "format": "uuid"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "catalogVoiceId",
        "providerConnectionId"
      ]
    },
    "Voice": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "catalogVoiceId": {
          "type": "string",
          "maxLength": 200
        },
        "name": {
          "type": "string",
          "maxLength": 160
        },
        "provider": {
          "type": "string",
          "maxLength": 80
        },
        "languages": {
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 40
          },
          "maxItems": 30
        },
        "available": {
          "type": "boolean"
        },
        "commercialUse": {
          "type": "string",
          "enum": [
            "permitted",
            "not_permitted",
            "unknown"
          ]
        },
        "attributionRequired": {
          "type": "boolean"
        },
        "termsUrl": {
          "type": "string",
          "format": "uri"
        }
      },
      "required": [
        "catalogVoiceId",
        "name",
        "provider",
        "languages",
        "available",
        "commercialUse",
        "attributionRequired",
        "termsUrl"
      ]
    },
    "Capabilities": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "languages": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "Hindi",
              "Hinglish"
            ]
          },
          "maxItems": 2
        },
        "components": {
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 60
          },
          "maxItems": 20
        },
        "maxAudioSeconds": {
          "type": "integer",
          "minimum": 1
        },
        "generationEnabled": {
          "type": "boolean"
        },
        "publishingEnabled": {
          "type": "boolean"
        },
        "allowanceTimezone": {
          "const": "UTC"
        },
        "rendererSchemaVersion": {
          "type": "integer",
          "minimum": 1
        }
      },
      "required": [
        "languages",
        "components",
        "maxAudioSeconds",
        "generationEnabled",
        "publishingEnabled",
        "allowanceTimezone",
        "rendererSchemaVersion"
      ]
    },
    "Span": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "start": {
          "type": "integer",
          "minimum": 0
        },
        "end": {
          "type": "integer",
          "minimum": 1
        }
      },
      "required": [
        "start",
        "end"
      ]
    },
    "TextMapping": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "displaySpan": {
          "$ref": "#/definitions/Span"
        },
        "spokenSpan": {
          "$ref": "#/definitions/Span"
        }
      },
      "required": [
        "displaySpan",
        "spokenSpan"
      ]
    },
    "SceneObject": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "type": {
          "type": "string",
          "enum": [
            "text",
            "shape",
            "icon",
            "node",
            "edge",
            "data_series"
          ]
        },
        "label": {
          "type": "string",
          "maxLength": 300
        },
        "parameters": {
          "type": "object",
          "additionalProperties": true,
          "description": "Schema-versioned validated metadata; arbitrary executable code is prohibited."
        }
      },
      "required": [
        "id",
        "type",
        "parameters"
      ]
    },
    "SceneCue": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "objectId": {
          "type": "string",
          "format": "uuid"
        },
        "spokenSpan": {
          "$ref": "#/definitions/Span"
        },
        "event": {
          "type": "string",
          "enum": [
            "enter",
            "highlight",
            "connect",
            "exit"
          ]
        },
        "leadMs": {
          "type": "integer",
          "minimum": -1000,
          "maximum": 1000
        }
      },
      "required": [
        "id",
        "objectId",
        "spokenSpan",
        "event",
        "leadMs"
      ]
    },
    "Scene": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "purpose": {
          "type": "string",
          "maxLength": 300
        },
        "component": {
          "type": "string",
          "enum": [
            "typography",
            "diagram",
            "flow",
            "timeline",
            "comparison",
            "relationship",
            "chart",
            "steps"
          ]
        },
        "title": {
          "type": "string",
          "maxLength": 120
        },
        "displayNarration": {
          "type": "string",
          "maxLength": 2000
        },
        "spokenNarration": {
          "type": "string",
          "maxLength": 2000
        },
        "textMappings": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/TextMapping"
          },
          "maxItems": 500
        },
        "objects": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/SceneObject"
          },
          "maxItems": 40
        },
        "cues": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/SceneCue"
          },
          "maxItems": 80
        },
        "claimIds": {
          "type": "array",
          "items": {
            "type": "string",
            "format": "uuid"
          },
          "maxItems": 50
        },
        "illustrative": {
          "type": "boolean"
        }
      },
      "required": [
        "id",
        "purpose",
        "component",
        "title",
        "displayNarration",
        "spokenNarration",
        "textMappings",
        "objects",
        "cues",
        "claimIds"
      ]
    },
    "Style": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "preset": {
          "type": "string",
          "enum": [
            "standard",
            "black_glow"
          ]
        },
        "accentColor": {
          "type": "string",
          "pattern": "^#[0-9a-fA-F]{6}$"
        }
      },
      "required": [
        "preset"
      ]
    },
    "DraftContent": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "schemaVersion": {
          "const": 1
        },
        "brief": {
          "$ref": "#/definitions/Brief"
        },
        "voice": {
          "anyOf": [
            {
              "$ref": "#/definitions/VoiceSelection"
            },
            {
              "type": "null"
            }
          ]
        },
        "style": {
          "$ref": "#/definitions/Style"
        },
        "scenes": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/Scene"
          },
          "maxItems": 12
        },
        "pronunciationOverrides": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "displayText": {
                "type": "string",
                "maxLength": 200
              },
              "spokenText": {
                "type": "string",
                "maxLength": 200
              }
            },
            "required": [
              "displayText",
              "spokenText"
            ]
          },
          "maxItems": 100
        },
        "captionOverrides": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "sceneId": {
                "type": "string",
                "format": "uuid"
              },
              "spokenSpan": {
                "$ref": "#/definitions/Span"
              },
              "displayText": {
                "type": "string",
                "maxLength": 200
              }
            },
            "required": [
              "sceneId",
              "spokenSpan",
              "displayText"
            ]
          },
          "maxItems": 200
        }
      },
      "required": [
        "schemaVersion",
        "brief",
        "voice",
        "style",
        "scenes",
        "pronunciationOverrides",
        "captionOverrides"
      ]
    },
    "Draft": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "projectId": {
          "type": "string",
          "format": "uuid"
        },
        "revision": {
          "type": "integer",
          "minimum": 1
        },
        "content": {
          "$ref": "#/definitions/DraftContent"
        },
        "updatedAt": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": [
        "projectId",
        "revision",
        "content",
        "updatedAt"
      ]
    },
    "DraftPatch": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "content": {
          "$ref": "#/definitions/DraftContent"
        }
      },
      "required": [
        "content"
      ]
    },
    "ProjectCreate": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "title": {
          "type": "string",
          "maxLength": 160,
          "minLength": 1
        },
        "brief": {
          "$ref": "#/definitions/Brief"
        },
        "voice": {
          "anyOf": [
            {
              "$ref": "#/definitions/VoiceSelection"
            },
            {
              "type": "null"
            }
          ]
        },
        "style": {
          "$ref": "#/definitions/Style"
        }
      },
      "required": [
        "title",
        "brief"
      ]
    },
    "ProjectPatch": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "title": {
          "type": "string",
          "maxLength": 160,
          "minLength": 1
        },
        "status": {
          "type": "string",
          "enum": [
            "active",
            "archived"
          ]
        }
      },
      "required": [],
      "minProperties": 1
    },
    "Project": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "title": {
          "type": "string",
          "maxLength": 160
        },
        "status": {
          "type": "string",
          "enum": [
            "active",
            "archived"
          ]
        },
        "revision": {
          "type": "integer",
          "minimum": 1
        },
        "latestOutputArtifactId": {
          "anyOf": [
            {
              "type": "string",
              "format": "uuid"
            },
            {
              "type": "null"
            }
          ]
        },
        "createdAt": {
          "type": "string",
          "format": "date-time"
        },
        "updatedAt": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": [
        "id",
        "title",
        "status",
        "revision",
        "latestOutputArtifactId",
        "createdAt",
        "updatedAt"
      ]
    },
    "Version": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "projectId": {
          "type": "string",
          "format": "uuid"
        },
        "number": {
          "type": "integer",
          "minimum": 1
        },
        "sourceDraftRevision": {
          "type": "integer",
          "minimum": 1
        },
        "inputHash": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        },
        "content": {
          "$ref": "#/definitions/DraftContent"
        },
        "approvedAt": {
          "anyOf": [
            {
              "type": "string",
              "format": "date-time"
            },
            {
              "type": "null"
            }
          ]
        },
        "createdAt": {
          "type": "string",
          "format": "date-time"
        },
        "artifactIds": {
          "type": "array",
          "items": {
            "type": "string",
            "format": "uuid"
          },
          "maxItems": 200
        }
      },
      "required": [
        "id",
        "projectId",
        "number",
        "sourceDraftRevision",
        "inputHash",
        "content",
        "approvedAt",
        "createdAt",
        "artifactIds"
      ]
    },
    "Message": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "projectId": {
          "type": "string",
          "format": "uuid"
        },
        "role": {
          "type": "string",
          "enum": [
            "user",
            "assistant"
          ]
        },
        "content": {
          "type": "string",
          "maxLength": 12000
        },
        "createdAt": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": [
        "id",
        "projectId",
        "role",
        "content",
        "createdAt"
      ]
    },
    "MessageCreate": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "content": {
          "type": "string",
          "maxLength": 4000,
          "minLength": 1
        }
      },
      "required": [
        "content"
      ]
    },
    "IdeationAccepted": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "message": {
          "$ref": "#/definitions/Message"
        },
        "job": {
          "$ref": "#/definitions/Job"
        }
      },
      "required": [
        "message",
        "job"
      ]
    },
    "JobCreate": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "plan",
            "produce"
          ]
        },
        "scriptApproved": {
          "type": "boolean"
        },
        "acknowledgedUsageTerms": {
          "type": "boolean"
        },
        "acknowledgedVoiceTerms": {
          "type": "boolean",
          "description": "Explicit non-commercial free-plan voice use, attribution and allowance acknowledgement for production."
        }
      },
      "required": [
        "kind",
        "acknowledgedUsageTerms"
      ],
      "description": "Submission matched by If-Match. Plan freezes the current draft. Produce pins the exact approved storyboard; guided mode requires scriptApproved=true, while automatic mode performs the same evidence and content checks. Produce requires acknowledgedVoiceTerms=true. Bounded reservations and explicit provider-use consent are required."
    },
    "Job": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "revision": {
          "type": "integer",
          "minimum": 1
        },
        "projectId": {
          "type": "string",
          "format": "uuid"
        },
        "versionId": {
          "type": "string",
          "format": "uuid"
        },
        "kind": {
          "type": "string",
          "enum": [
            "ideation",
            "plan",
            "produce"
          ]
        },
        "state": {
          "type": "string",
          "enum": [
            "queued",
            "running",
            "paused",
            "succeeded",
            "failed",
            "cancelled"
          ]
        },
        "stage": {
          "anyOf": [
            {
              "type": "string",
              "enum": [
                "ideating",
                "researching",
                "scripting",
                "planning_scenes",
                "generating_voice",
                "aligning",
                "composing",
                "rendering",
                "checking"
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "queueStatus": {
          "type": "string",
          "enum": [
            "waiting",
            "processing",
            "attention",
            "complete"
          ]
        },
        "pauseReason": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 100
            },
            {
              "type": "null"
            }
          ]
        },
        "error": {
          "anyOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "code": {
                  "type": "string",
                  "maxLength": 80
                },
                "detail": {
                  "type": "string",
                  "maxLength": 1000
                },
                "retryable": {
                  "type": "boolean"
                }
              },
              "required": [
                "code",
                "detail",
                "retryable"
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "outputArtifactId": {
          "anyOf": [
            {
              "type": "string",
              "format": "uuid"
            },
            {
              "type": "null"
            }
          ]
        },
        "cancelRequestedAt": {
          "anyOf": [
            {
              "type": "string",
              "format": "date-time"
            },
            {
              "type": "null"
            }
          ]
        },
        "pollAfterSeconds": {
          "type": "integer",
          "minimum": 1,
          "maximum": 60
        },
        "createdAt": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": [
        "id",
        "revision",
        "projectId",
        "versionId",
        "kind",
        "state",
        "stage",
        "queueStatus",
        "pauseReason",
        "error",
        "outputArtifactId",
        "cancelRequestedAt",
        "pollAfterSeconds",
        "createdAt"
      ]
    },
    "RetryJob": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "allowNewProviderRequest": {
          "type": "boolean"
        }
      },
      "required": [
        "allowNewProviderRequest"
      ]
    },
    "ApplyResult": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "artifactId": {
          "type": "string",
          "format": "uuid"
        }
      },
      "required": [
        "artifactId"
      ]
    },
    "Artifact": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "projectId": {
          "type": "string",
          "format": "uuid"
        },
        "versionId": {
          "type": "string",
          "format": "uuid"
        },
        "jobId": {
          "type": "string",
          "format": "uuid"
        },
        "kind": {
          "type": "string",
          "enum": [
            "research",
            "storyboard",
            "audio",
            "alignment",
            "composition",
            "captions",
            "video",
            "validation",
            "visual_asset"
          ]
        },
        "sha256": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        },
        "mimeType": {
          "type": "string",
          "maxLength": 120
        },
        "bytes": {
          "type": "integer",
          "minimum": 0
        },
        "durationMs": {
          "anyOf": [
            {
              "type": "integer",
              "minimum": 1
            },
            {
              "type": "null"
            }
          ]
        },
        "validationStatus": {
          "type": "string",
          "enum": [
            "pending",
            "passed",
            "failed"
          ]
        },
        "storageStatus": {
          "type": "string",
          "enum": [
            "available",
            "deleting",
            "deleted"
          ]
        },
        "createdAt": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": [
        "id",
        "projectId",
        "versionId",
        "jobId",
        "kind",
        "sha256",
        "mimeType",
        "bytes",
        "durationMs",
        "validationStatus",
        "storageStatus",
        "createdAt"
      ]
    },
    "AccessRequest": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "purpose": {
          "type": "string",
          "enum": [
            "preview",
            "download"
          ]
        }
      },
      "required": [
        "purpose"
      ]
    },
    "MediaAccess": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "url": {
          "type": "string",
          "format": "uri"
        },
        "expiresAt": {
          "type": "string",
          "format": "date-time"
        },
        "mimeType": {
          "type": "string",
          "maxLength": 120
        }
      },
      "required": [
        "url",
        "expiresAt",
        "mimeType"
      ]
    },
    "Evidence": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "versionId": {
          "type": "string",
          "format": "uuid"
        },
        "sources": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "id": {
                "type": "string",
                "format": "uuid"
              },
              "title": {
                "type": "string",
                "maxLength": 1000
              },
              "url": {
                "type": "string",
                "format": "uri"
              },
              "retrievedAt": {
                "type": "string",
                "format": "date-time"
              },
              "excerpt": {
                "type": "string",
                "maxLength": 2500,
                "description": "Retrieved introductory source excerpt; not an automated fact-check."
              }
            },
            "required": [
              "id",
              "title",
              "url",
              "retrievedAt"
            ]
          },
          "maxItems": 100
        },
        "claims": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "id": {
                "type": "string",
                "format": "uuid"
              },
              "sceneId": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "uuid"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "text": {
                "type": "string",
                "maxLength": 2000
              },
              "classification": {
                "type": "string",
                "enum": [
                  "factual",
                  "interpretation",
                  "illustrative"
                ]
              },
              "status": {
                "type": "string",
                "enum": [
                  "supported",
                  "needs_review",
                  "unsupported"
                ]
              },
              "blocking": {
                "type": "boolean"
              },
              "sourceIds": {
                "type": "array",
                "items": {
                  "type": "string",
                  "format": "uuid"
                },
                "maxItems": 30
              }
            },
            "required": [
              "id",
              "sceneId",
              "text",
              "classification",
              "status",
              "blocking",
              "sourceIds"
            ]
          },
          "maxItems": 200
        }
      },
      "required": [
        "versionId",
        "sources",
        "claims"
      ]
    },
    "UsageResource": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "resource": {
          "type": "string",
          "enum": [
            "generation_count",
            "narration_ms",
            "render_ms",
            "storage_bytes",
            "provider_credits",
            "planning_requests"
          ]
        },
        "limit": {
          "type": "integer",
          "minimum": 0
        },
        "used": {
          "type": "integer",
          "minimum": 0
        },
        "reserved": {
          "type": "integer",
          "minimum": 0
        },
        "remaining": {
          "type": "integer",
          "minimum": 0
        },
        "periodStart": {
          "type": "string",
          "format": "date-time"
        },
        "resetsAt": {
          "anyOf": [
            {
              "type": "string",
              "format": "date-time"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "resource",
        "limit",
        "used",
        "reserved",
        "remaining",
        "periodStart",
        "resetsAt"
      ],
      "description": "Resource units: generation_count and planning_requests are requests; provider_credits are submitted speech characters; narration_ms and render_ms are milliseconds; storage_bytes are bytes. Used and reserved amounts are reported separately."
    },
    "Usage": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "allowanceTimezone": {
          "const": "UTC"
        },
        "resources": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/UsageResource"
          },
          "maxItems": 20
        },
        "platformCapacity": {
          "type": "string",
          "enum": [
            "available",
            "queued",
            "paused"
          ]
        }
      },
      "required": [
        "allowanceTimezone",
        "resources",
        "platformCapacity"
      ]
    },
    "UsageEntry": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "jobId": {
          "type": "string",
          "format": "uuid"
        },
        "resource": {
          "type": "string",
          "maxLength": 80
        },
        "unitsDelta": {
          "type": "integer"
        },
        "providerUnits": {
          "anyOf": [
            {
              "type": "integer",
              "minimum": 0
            },
            {
              "type": "null"
            }
          ]
        },
        "providerUnit": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 80
            },
            {
              "type": "null"
            }
          ]
        },
        "reasonCode": {
          "type": "string",
          "maxLength": 80
        },
        "createdAt": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": [
        "id",
        "jobId",
        "resource",
        "unitsDelta",
        "providerUnits",
        "providerUnit",
        "reasonCode",
        "createdAt"
      ]
    },
    "ProviderCreate": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "provider": {
          "const": "elevenlabs"
        },
        "apiKey": {
          "type": "string",
          "maxLength": 512,
          "minLength": 10,
          "writeOnly": true
        }
      },
      "required": [
        "provider",
        "apiKey"
      ]
    },
    "ProviderConnection": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "provider": {
          "const": "elevenlabs"
        },
        "status": {
          "type": "string",
          "enum": [
            "pending_validation",
            "active",
            "invalid",
            "revoked"
          ]
        },
        "revision": {
          "type": "integer",
          "minimum": 1
        },
        "lastCheckedAt": {
          "anyOf": [
            {
              "type": "string",
              "format": "date-time"
            },
            {
              "type": "null"
            }
          ]
        },
        "errorCode": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 80
            },
            {
              "type": "null"
            }
          ]
        },
        "createdAt": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": [
        "id",
        "provider",
        "status",
        "revision",
        "lastCheckedAt",
        "errorCode",
        "createdAt"
      ]
    },
    "InstagramConnection": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "revision": {
          "type": "integer",
          "minimum": 1
        },
        "displayName": {
          "type": "string",
          "maxLength": 160
        },
        "status": {
          "type": "string",
          "enum": [
            "active",
            "reauth_required",
            "disconnected"
          ]
        },
        "grantedScopes": {
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 120
          },
          "maxItems": 30
        },
        "expiresAt": {
          "anyOf": [
            {
              "type": "string",
              "format": "date-time"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "id",
        "revision",
        "displayName",
        "status",
        "grantedScopes",
        "expiresAt"
      ]
    },
    "InstagramConnectionResult": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "connection": {
          "anyOf": [
            {
              "$ref": "#/definitions/InstagramConnection"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "connection"
      ]
    },
    "AuthorizationRequest": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "returnPath": {
          "type": "string",
          "enum": [
            "/settings/connections"
          ]
        }
      },
      "required": [
        "returnPath"
      ]
    },
    "Authorization": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "authorizationUrl": {
          "type": "string",
          "format": "uri"
        },
        "expiresAt": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": [
        "authorizationUrl",
        "expiresAt"
      ]
    },
    "Delivery": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "mode": {
              "const": "immediate"
            }
          },
          "required": [
            "mode"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "mode": {
              "const": "when_ready"
            }
          },
          "required": [
            "mode"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "mode": {
              "const": "scheduled"
            },
            "scheduledAt": {
              "type": "string",
              "format": "date-time"
            },
            "timezone": {
              "type": "string",
              "maxLength": 80
            },
            "lateToleranceSeconds": {
              "type": "integer",
              "minimum": 0,
              "maximum": 86400
            }
          },
          "required": [
            "mode",
            "scheduledAt",
            "timezone",
            "lateToleranceSeconds"
          ]
        }
      ]
    },
    "PublishSource": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "artifactId": {
              "type": "string",
              "format": "uuid"
            }
          },
          "required": [
            "artifactId"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "productionJobId": {
              "type": "string",
              "format": "uuid"
            }
          },
          "required": [
            "productionJobId"
          ]
        }
      ]
    },
    "PublishCreate": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "connectionId": {
          "type": "string",
          "format": "uuid"
        },
        "source": {
          "$ref": "#/definitions/PublishSource"
        },
        "caption": {
          "type": "string",
          "maxLength": 2200
        },
        "delivery": {
          "$ref": "#/definitions/Delivery"
        },
        "authorizePublishing": {
          "const": true
        }
      },
      "required": [
        "connectionId",
        "source",
        "caption",
        "delivery",
        "authorizePublishing"
      ],
      "description": "Authorizes only this exact asset/job and current connection grant. Immediate needs a ready video; when_ready needs an automatic produce job. Scheduled can reference either, subject to its bounded lateness policy. Another deliberate submission can create another post; HTTP retries must reuse their idempotency key."
    },
    "SchedulePatch": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "scheduledAt": {
          "type": "string",
          "format": "date-time"
        },
        "timezone": {
          "type": "string",
          "maxLength": 80
        },
        "lateToleranceSeconds": {
          "type": "integer",
          "minimum": 0,
          "maximum": 86400
        }
      },
      "required": [
        "scheduledAt",
        "timezone",
        "lateToleranceSeconds"
      ]
    },
    "Schedule": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "scheduledAt": {
          "type": "string",
          "format": "date-time"
        },
        "timezone": {
          "type": "string",
          "maxLength": 80
        },
        "lateToleranceSeconds": {
          "type": "integer",
          "minimum": 0
        },
        "state": {
          "type": "string",
          "enum": [
            "scheduled",
            "claimed",
            "completed",
            "paused",
            "cancelled"
          ]
        }
      },
      "required": [
        "scheduledAt",
        "timezone",
        "lateToleranceSeconds",
        "state"
      ]
    },
    "PublishIntent": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "revision": {
          "type": "integer",
          "minimum": 1
        },
        "projectId": {
          "type": "string",
          "format": "uuid"
        },
        "versionId": {
          "type": "string",
          "format": "uuid"
        },
        "connectionId": {
          "type": "string",
          "format": "uuid"
        },
        "videoArtifactId": {
          "anyOf": [
            {
              "type": "string",
              "format": "uuid"
            },
            {
              "type": "null"
            }
          ]
        },
        "productionJobId": {
          "anyOf": [
            {
              "type": "string",
              "format": "uuid"
            },
            {
              "type": "null"
            }
          ]
        },
        "caption": {
          "type": "string",
          "maxLength": 2200
        },
        "state": {
          "type": "string",
          "enum": [
            "awaiting_output",
            "scheduled",
            "queued",
            "publishing",
            "paused",
            "published",
            "failed",
            "cancelled",
            "reconciliation_required"
          ]
        },
        "authorizedAt": {
          "type": "string",
          "format": "date-time"
        },
        "schedule": {
          "anyOf": [
            {
              "$ref": "#/definitions/Schedule"
            },
            {
              "type": "null"
            }
          ]
        },
        "remoteMediaId": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 200
            },
            {
              "type": "null"
            }
          ]
        },
        "permalink": {
          "anyOf": [
            {
              "type": "string",
              "format": "uri"
            },
            {
              "type": "null"
            }
          ]
        },
        "pauseReason": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 100
            },
            {
              "type": "null"
            }
          ]
        },
        "cancelRequestedAt": {
          "anyOf": [
            {
              "type": "string",
              "format": "date-time"
            },
            {
              "type": "null"
            }
          ]
        },
        "createdAt": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": [
        "id",
        "revision",
        "projectId",
        "versionId",
        "connectionId",
        "videoArtifactId",
        "productionJobId",
        "caption",
        "state",
        "authorizedAt",
        "schedule",
        "remoteMediaId",
        "permalink",
        "pauseReason",
        "cancelRequestedAt",
        "createdAt"
      ]
    },
    "PublishRetry": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "confirmSamePayload": {
          "const": true
        }
      },
      "required": [
        "confirmSamePayload"
      ]
    },
    "ProjectPage": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/Project"
          },
          "maxItems": 100
        },
        "nextCursor": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 2048
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "items",
        "nextCursor"
      ]
    },
    "VersionPage": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/Version"
          },
          "maxItems": 100
        },
        "nextCursor": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 2048
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "items",
        "nextCursor"
      ]
    },
    "MessagePage": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/Message"
          },
          "maxItems": 100
        },
        "nextCursor": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 2048
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "items",
        "nextCursor"
      ]
    },
    "JobPage": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/Job"
          },
          "maxItems": 100
        },
        "nextCursor": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 2048
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "items",
        "nextCursor"
      ]
    },
    "VoicePage": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/Voice"
          },
          "maxItems": 100
        },
        "nextCursor": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 2048
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "items",
        "nextCursor"
      ]
    },
    "UsageEntryPage": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/UsageEntry"
          },
          "maxItems": 100
        },
        "nextCursor": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 2048
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "items",
        "nextCursor"
      ]
    },
    "ProviderConnectionPage": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/ProviderConnection"
          },
          "maxItems": 100
        },
        "nextCursor": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 2048
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "items",
        "nextCursor"
      ]
    },
    "PublishIntentPage": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/PublishIntent"
          },
          "maxItems": 100
        },
        "nextCursor": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 2048
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "items",
        "nextCursor"
      ]
    },
    "StoryboardApprovalRequest": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "reviewedClaimIds": {
          "type": "array",
          "maxItems": 200,
          "items": {
            "type": "string",
            "format": "uuid"
          }
        },
        "acknowledgedVoiceTerms": {
          "type": "boolean"
        }
      },
      "required": [
        "reviewedClaimIds",
        "acknowledgedVoiceTerms"
      ]
    }
  }
} as const;
