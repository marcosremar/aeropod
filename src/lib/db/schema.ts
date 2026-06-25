import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// Waitlist for landing page
export const waitlist = pgTable("waitlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Users
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }),
  plan: varchar("plan", { length: 50 }).default("free"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Projects (podcast episodes being edited)
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  title: varchar("title", { length: 255 }),
  status: varchar("status", { length: 50 }).default("uploading"),
  progress: integer("progress").default(0), // 0-100 percentage
  originalAudioUrl: text("original_audio_url"),
  originalDuration: integer("original_duration"), // seconds
  targetDuration: integer("target_duration"), // seconds
  editedAudioUrl: text("edited_audio_url"),
  transcription: text("transcription"),
  errorMessage: text("error_message"), // Error message if processing failed
  // Template system fields
  currentTemplateId: uuid("current_template_id"),
  contentType: varchar("content_type", { length: 100 }), // interview, monologue, debate, educational, review
  detectionStatus: varchar("detection_status", { length: 50 }), // pending, detected, user_selected
  structuralAnalysis: jsonb("structural_analysis"), // Analysis data from content detection
  // Audio enhancement fields
  audioEnhanced: boolean("audio_enhanced").default(false),
  enhancementSettings: jsonb("enhancement_settings"), // Applied enhancement configuration
  enhancedAudioUrl: text("enhanced_audio_url"), // URL to enhanced version
  // Filler words stats
  fillerWordsCount: integer("filler_words_count").default(0),
  fillerWordsRemoved: integer("filler_words_removed").default(0),
  // Audio language for transcription
  language: varchar("language", { length: 10 }).default("pt"), // pt, en, es
  // Waveform data for timeline visualization
  waveformPeaks: jsonb("waveform_peaks"), // Array of normalized amplitude values (0-1)
  // Speaker diarization data
  diarization: jsonb("diarization"), // Pyannote diarization result
  speakers: jsonb("speakers"), // Array of speaker names/labels
  speakerStats: jsonb("speaker_stats"), // Speaker statistics (time, percentage)
  // Topic segmentation data
  topics: jsonb("topics"), // Detected topics/chapters
  topicsSummary: text("topics_summary"), // Overall content summary
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Segments (chunks of audio with analysis)
export const segments = pgTable("segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  startTime: real("start_time").notNull(),
  endTime: real("end_time").notNull(),
  text: text("text").notNull(),
  // Speaker diarization
  speaker: varchar("speaker", { length: 100 }), // SPEAKER_00, SPEAKER_01, etc
  speakerLabel: varchar("speaker_label", { length: 255 }), // Human-readable: "Host", "Guest 1"
  // Topic/chapter
  topicId: integer("topic_id"), // Reference to topic index in project.topics
  interestScore: integer("interest_score"),
  clarityScore: integer("clarity_score"),
  topic: varchar("topic", { length: 255 }),
  keyInsight: text("key_insight"),
  isSelected: boolean("is_selected").default(false),
  order: integer("order"),
  analysis: jsonb("analysis"), // Full analysis JSON
  hasError: boolean("has_error").default(false),
  errorType: varchar("error_type", { length: 50 }),
  errorDetail: text("error_detail"),
  rerecordedAudioUrl: text("rerecorded_audio_url"),
  // Section matching fields
  detectedSectionType: varchar("detected_section_type", { length: 100 }), // intro, main_content, outro, cta, etc
  sectionMatchScore: real("section_match_score"), // 0-1 confidence score
  // Word-level timestamps for text-based editing
  wordTimestamps: jsonb("word_timestamps"), // Array of {word, start, end, confidence}
  // Text-based editing - stores edits made to the transcript
  editedText: text("edited_text"), // User-edited version of the text
  textCuts: jsonb("text_cuts"), // Array of {startTime, endTime} ranges to cut from audio
  createdAt: timestamp("created_at").defaultNow(),
});

// Templates (podcast structure templates)
export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }).notNull(), // interview, monologue, debate, educational, review
  isSystem: boolean("is_system").default(false), // System template vs user custom
  userId: uuid("user_id").references(() => users.id), // null for system templates
  thumbnailUrl: text("thumbnail_url"),
  estimatedDuration: integer("estimated_duration"), // seconds
  metadata: jsonb("metadata"), // Additional configuration
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Template Sections (sections that make up a template)
export const templateSections = pgTable("template_sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id")
    .references(() => templates.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(), // "Introdução", "Conclusão", etc
  description: text("description"), // What should be in this section
  order: integer("order").notNull(), // Order in template
  isRequired: boolean("is_required").default(true), // Required or optional
  minDuration: integer("min_duration"), // seconds
  maxDuration: integer("max_duration"), // seconds
  suggestedDuration: integer("suggested_duration"), // seconds
  type: varchar("type", { length: 100 }).notNull(), // intro, main_content, outro, cta, transition, custom
  aiPrompt: text("ai_prompt"), // Prompt for AI to detect this section
  editingRules: jsonb("editing_rules"), // Fade, volume, compression rules
  exampleText: text("example_text"), // Example of what to say
  icon: varchar("icon", { length: 50 }), // Icon name for UI
  color: varchar("color", { length: 50 }), // Color for UI
  createdAt: timestamp("created_at").defaultNow(),
});

// Project Templates (association between projects and templates)
export const projectTemplates = pgTable("project_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  templateId: uuid("template_id")
    .references(() => templates.id)
    .notNull(),
  selectedAt: timestamp("selected_at").defaultNow(),
  autoDetected: boolean("auto_detected").default(false), // Auto-detected vs manually selected
  detectionConfidence: real("detection_confidence"), // 0-1 confidence score
});

// Project Sections (actual sections in a project)
export const projectSections = pgTable("project_sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  templateSectionId: uuid("template_section_id").references(
    () => templateSections.id
  ),
  name: varchar("name", { length: 255 }).notNull(),
  order: integer("order").notNull(),
  status: varchar("status", { length: 50 }).default("pending"), // pending, recording, processing, review, approved, blocked
  audioUrl: text("audio_url"), // URL of audio for this section
  transcription: text("transcription"),
  duration: integer("duration"), // seconds
  uploadedAt: timestamp("uploaded_at"),
  approvedAt: timestamp("approved_at"),
  approvedBy: uuid("approved_by").references(() => users.id),
  notes: text("notes"), // User notes about this section
  metadata: jsonb("metadata"), // Additional data
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Section Segments (N:N relationship between sections and segments)
export const sectionSegments = pgTable("section_segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  sectionId: uuid("section_id")
    .references(() => projectSections.id, { onDelete: "cascade" })
    .notNull(),
  segmentId: uuid("segment_id")
    .references(() => segments.id, { onDelete: "cascade" })
    .notNull(),
  order: integer("order").notNull(), // Order within section
  startOffset: real("start_offset"), // Trim start (seconds)
  endOffset: real("end_offset"), // Trim end (seconds)
  confidence: real("confidence"), // AI mapping confidence (0-1)
  createdAt: timestamp("created_at").defaultNow(),
});

// Content Type Detections (AI detection results)
export const contentTypeDetections = pgTable("content_type_detections", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  detectedType: varchar("detected_type", { length: 100 }).notNull(), // interview, monologue, debate, etc
  confidence: real("confidence").notNull(), // 0-1 confidence score
  reasoning: text("reasoning"), // Why this type was detected
  suggestedTemplates: jsonb("suggested_templates"), // Array of template IDs
  analysisData: jsonb("analysis_data"), // Full analysis data
  createdAt: timestamp("created_at").defaultNow(),
});

// Filler Words (detected filler words per segment)
export const fillerWords = pgTable("filler_words", {
  id: uuid("id").primaryKey().defaultRandom(),
  segmentId: uuid("segment_id").references(() => segments.id, {
    onDelete: "cascade",
  }),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  word: text("word").notNull(), // "um", "ah", "tipo", "ne", etc
  startTime: real("start_time").notNull(), // Absolute time in audio
  endTime: real("end_time").notNull(),
  confidence: real("confidence"), // Detection confidence 0-1
  isRemoved: boolean("is_removed").default(false), // Marked for removal
  createdAt: timestamp("created_at").defaultNow(),
});

// Social Clips (auto-generated clips for social media)
export const socialClips = pgTable("social_clips", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  segmentIds: jsonb("segment_ids").notNull(), // Array of segment IDs
  title: varchar("title", { length: 255 }),
  description: text("description"),
  startTime: real("start_time").notNull(),
  endTime: real("end_time").notNull(),
  duration: integer("duration").notNull(), // seconds
  format: varchar("format", { length: 50 }).default("9:16"), // 9:16, 1:1, 16:9
  hookScore: integer("hook_score"), // AI-scored hook strength 1-10
  viralPotential: integer("viral_potential"), // AI-scored 1-10
  status: varchar("status", { length: 50 }).default("pending"), // pending, processing, ready, exported
  clipUrl: text("clip_url"), // URL to exported clip
  thumbnailUrl: text("thumbnail_url"),
  captionsEnabled: boolean("captions_enabled").default(true),
  captionStyle: varchar("caption_style", { length: 50 }).default("animated"), // animated, static, none
  metadata: jsonb("metadata"), // Additional AI analysis data
  createdAt: timestamp("created_at").defaultNow(),
});

// Audio Enhancements (applied audio processing)
export const audioEnhancements = pgTable("audio_enhancements", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  enhancementType: varchar("enhancement_type", { length: 50 }).notNull(), // normalize, denoise, eq, compress
  settings: jsonb("settings").notNull(), // Enhancement-specific settings
  isApplied: boolean("is_applied").default(false),
  previewUrl: text("preview_url"), // URL to preview audio
  appliedAt: timestamp("applied_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Show Notes (generated episode summaries)
export const showNotes = pgTable("show_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  summary: text("summary"), // 2-3 paragraph summary
  chapters: jsonb("chapters"), // Array of {title, timestamp, description}
  keyPoints: jsonb("key_points"), // Array of bullet points
  guestInfo: jsonb("guest_info"), // Extracted guest names, bios
  links: jsonb("links"), // Mentioned URLs/resources
  generatedAt: timestamp("generated_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Chat Messages (persistent chat history per project)
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  role: varchar("role", { length: 50 }).notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  actions: jsonb("actions"), // Array of EditAction objects from AI responses
  metadata: jsonb("metadata"), // Additional data: tokens used, response time, etc
  isDeleted: boolean("is_deleted").default(false), // Soft delete for history preservation
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Types for TypeScript
export type Waitlist = typeof waitlist.$inferSelect;
export type NewWaitlist = typeof waitlist.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Segment = typeof segments.$inferSelect;
export type NewSegment = typeof segments.$inferInsert;
export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type TemplateSection = typeof templateSections.$inferSelect;
export type NewTemplateSection = typeof templateSections.$inferInsert;
export type ProjectTemplate = typeof projectTemplates.$inferSelect;
export type NewProjectTemplate = typeof projectTemplates.$inferInsert;
export type ProjectSection = typeof projectSections.$inferSelect;
export type NewProjectSection = typeof projectSections.$inferInsert;
export type SectionSegment = typeof sectionSegments.$inferSelect;
export type NewSectionSegment = typeof sectionSegments.$inferInsert;
export type ContentTypeDetection = typeof contentTypeDetections.$inferSelect;
export type NewContentTypeDetection = typeof contentTypeDetections.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type FillerWord = typeof fillerWords.$inferSelect;
export type NewFillerWord = typeof fillerWords.$inferInsert;
export type SocialClip = typeof socialClips.$inferSelect;
export type NewSocialClip = typeof socialClips.$inferInsert;
export type AudioEnhancement = typeof audioEnhancements.$inferSelect;
export type NewAudioEnhancement = typeof audioEnhancements.$inferInsert;
export type ShowNote = typeof showNotes.$inferSelect;
export type NewShowNote = typeof showNotes.$inferInsert;

// Analysis type (stored in segments.analysis)
export interface SegmentAnalysis {
  topic: string;
  interestScore: number;
  clarityScore: number;
  isTangent: boolean;
  isRepetition: boolean;
  keyInsight: string;
  dependsOn: string[];
  standalone: boolean;
  hasFactualError: boolean;
  factualErrorDetail?: string;
  hasContradiction: boolean;
  contradictionDetail?: string;
  isConfusing: boolean;
  confusingDetail?: string;
  isIncomplete: boolean;
  incompleteDetail?: string;
  needsRerecord: boolean;
  rerecordSuggestion?: string;
}

// Template editing rules (stored in templateSections.editingRules)
export interface EditingRules {
  fadeIn?: number; // seconds
  fadeOut?: number; // seconds
  normalizeVolume?: boolean;
  targetVolume?: number; // LUFS (e.g., -16)
  compression?: {
    threshold: number; // dB
    ratio: number;
  };
  silenceTrimming?: {
    enabled: boolean;
    threshold: number; // dB
  };
  transition?: {
    type: "crossfade" | "hard_cut" | "fade_through_black";
    duration: number; // seconds
  };
  removeHesitations?: boolean;
  removeFiller?: boolean;
}

// Template metadata (stored in templates.metadata)
export interface TemplateMetadata {
  tags?: string[];
  difficulty?: "beginner" | "intermediate" | "advanced";
  recommendedFor?: string[];
  compatibleWith?: string[]; // Compatible content types
  author?: string;
  version?: string;
}

// Structural analysis (stored in projects.structuralAnalysis)
export interface StructuralAnalysis {
  speakers?: number;
  questionAnswerPatterns?: number;
  narrativeStructure?: "linear" | "episodic" | "conversational";
  hasIntro?: boolean;
  hasOutro?: boolean;
  hasCTA?: boolean;
  characteristics?: string[];
  suggestedSections?: Array<{
    type: string;
    confidence: number;
    startTime?: number;
    endTime?: number;
  }>;
}

// Suggested templates in detection (stored in contentTypeDetections.suggestedTemplates)
export interface SuggestedTemplate {
  templateId: string;
  matchScore: number; // 0-1
  reason: string;
}

// Content detection analysis data (stored in contentTypeDetections.analysisData)
export interface ContentDetectionAnalysis {
  speakers?: number;
  questionAnswerPatterns?: number;
  narrativeStructure?: string;
  characteristics: string[];
  detectedSections?: Array<{
    type: string;
    confidence: number;
    startTime?: number;
    endTime?: number;
  }>;
}

// Word timestamp (stored in segments.wordTimestamps)
export interface WordTimestamp {
  word: string;
  start: number; // seconds
  end: number; // seconds
  confidence?: number; // 0-1
  isDeleted?: boolean; // true if user deleted this word in text-based editing
}

// Text cut range (stored in segments.textCuts)
export interface TextCut {
  startTime: number; // seconds
  endTime: number; // seconds
  deletedText: string; // the text that was deleted
  wordIndices: number[]; // indices of deleted words in wordTimestamps
}

// Audio enhancement settings (stored in projects.enhancementSettings)
export interface EnhancementSettings {
  normalize?: {
    enabled: boolean;
    targetLufs: number; // e.g., -16
  };
  denoise?: {
    enabled: boolean;
    strength: "light" | "medium" | "aggressive";
  };
  eq?: {
    enabled: boolean;
    preset: "voice" | "clarity" | "warmth" | "custom";
    customBands?: number[];
  };
  compress?: {
    enabled: boolean;
    preset: "light" | "medium" | "broadcast";
  };
  removeFillers?: boolean;
}

// Show notes chapter (stored in showNotes.chapters)
export interface ShowNotesChapter {
  title: string;
  timestamp: number; // seconds
  description?: string;
}

// Show notes guest info (stored in showNotes.guestInfo)
export interface ShowNotesGuest {
  name: string;
  bio?: string;
  role?: string;
  socialLinks?: string[];
}

// Social clip metadata (stored in socialClips.metadata)
export interface SocialClipMetadata {
  generatedTitle: string;
  generatedDescription: string;
  suggestedHashtags: string[];
  hookText?: string; // First few words as hook
  emotionalTone?: string; // funny, inspiring, educational, etc
  targetPlatform?: "tiktok" | "reels" | "shorts" | "all";
}

// Filler word patterns by language
export const FILLER_PATTERNS = {
  pt: ["hum", "eh", "ah", "tipo", "ne", "entao", "assim", "quer dizer", "basicamente", "na verdade", "enfim"],
  en: ["um", "uh", "like", "you know", "basically", "actually", "so", "literally", "right", "i mean"],
} as const;
