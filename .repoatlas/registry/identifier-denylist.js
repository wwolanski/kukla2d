import { defineMessage } from "repoatlas/extension";

export const identifierDenylist = defineMessage({
  code: "ARCH-RS-7",
  summary: "Ambiguous legacy identifiers are not allowed in production code.",
  reason:
    "Short identifiers such as ed or anim hide the domain concept and make code search and review less reliable.",
  fix: "Replace the identifier with a descriptive name that communicates its domain meaning.",
  executors: [
    {
      provider: "eslint",
      integration: "core-rule",
      rule: "id-denylist",
      file: "eslint.config.js",
    },
  ],
});
