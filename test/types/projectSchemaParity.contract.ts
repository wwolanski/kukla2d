import { createEmptyProject } from "@/core/createEmptyProject";
import type { parseProject } from "@/schema/projectSchema";
import type { ProjectDocument } from "@kukla2d/contracts";
import type {
  ProjectDocumentInput,
  ValidatedProjectDocument,
} from "@/schema/projectSchema.types";

const _factory: ProjectDocument = createEmptyProject();
// @ts-expect-error - K4: ProjectDocument.Mesh.uvs widened to number[] | Float32Array;
// ProjectDocumentInput (Zod input) only accepts number[], so bidirectional assignability is intentionally broken.
const _schemaInput: ProjectDocumentInput = null as unknown as ProjectDocument;

const _parsed: ValidatedProjectDocument = null as unknown as ReturnType<
  typeof parseProject
>;

void _factory;
void _schemaInput;
void _parsed;
