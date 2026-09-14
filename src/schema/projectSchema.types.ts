import type { ProjectDocumentSchema } from "@/schema/projectSchema.js";
import type { z } from "zod";

export type ProjectDocumentInput = z.input<typeof ProjectDocumentSchema>;
export type ValidatedProjectDocument = z.output<typeof ProjectDocumentSchema>;
