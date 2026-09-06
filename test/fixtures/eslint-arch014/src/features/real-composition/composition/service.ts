import { createService } from "../application/createService.js";
import { createBrowserRepository } from "../infrastructure/repository.js";

const repository = createBrowserRepository();

export const service = createService(repository);
