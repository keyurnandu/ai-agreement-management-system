/**
 * Canonical domain types shared across the platform. These mirror the
 * "enum-like" String columns in the Prisma schema (SQLite has no enums) and
 * the contracts exposed by the Python services.
 */

export type Role = "ADMIN" | "MANAGER" | "EDITOR" | "SIGNER" | "VIEWER";
export type PermissionLevel = "VIEW" | "COMMENT" | "EDIT" | "MANAGE";
export type ResourceType = "DOCUMENT" | "AGREEMENT";

export type DocumentStatus = "ACTIVE" | "ARCHIVED";

export type AgreementStatus =
  | "DRAFT"
  | "SENT"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "DECLINED"
  | "VOIDED"
  | "EXPIRED";

export type RoutingType = "SEQUENTIAL" | "PARALLEL";

export type RecipientRole = "SIGNER" | "APPROVER" | "CC";
export type RecipientStatus = "PENDING" | "SENT" | "VIEWED" | "SIGNED" | "DECLINED";

export type FieldType = "SIGNATURE" | "INITIAL" | "DATE" | "TEXT" | "CHECKBOX";

/** AI provider identifiers understood by the intelligence service. */
export type AIProviderKind = "mock" | "ollama" | "anthropic" | "openai";
