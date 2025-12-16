import { commentOnIssueTool } from "./comment-on-issue.js";
import { deleteFileTool } from "./delete-file.js";
import { listDirectoryTool } from "./list-directory.js";
import { moveFileTool } from "./move-file.js";
import { readFileTool } from "./read-file.js";
import { runCommandTool } from "./run-command.js";
import { searchCodeTool } from "./search-code.js";
import { semanticSearchTool } from "./semantic-search.js";
import { Tool } from "./types.js";
import { writeFileTool } from "./write-file.js";

export * from "./types.js";

export const getAllTools = (): Tool[] => [
  readFileTool,
  writeFileTool,
  listDirectoryTool,
  moveFileTool,
  deleteFileTool,
  runCommandTool,
  searchCodeTool,
  semanticSearchTool,
  commentOnIssueTool,
];

export const getToolByName = (name: string): Tool | undefined => {
  return getAllTools().find(tool => tool.name === name);
};

