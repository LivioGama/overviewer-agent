import { Octokit } from '@octokit/rest';

export const parseCommand = (commentBody: string) => {
  const commandPattern = /^\/(\w+)(?:\s+(.+))?$/m;
  const match = commentBody.trim().match(commandPattern);

  if (!match) {
    return null;
  }

  const [, command, args] = match;
  return {
    command: command?.toLowerCase() || "",
    args: args?.trim() || "",
    raw: match[0],
  };
};

export const isBot = (username: string): boolean => {
  return username.endsWith("[bot]") || username === "github-actions[bot]";
};

export const generateBranchName = (
  prefix: string,
  taskType: string,
  timestamp?: number,
): string => {
  const ts = timestamp || Date.now();
  const shortTs = ts.toString(36);
  return `${prefix}${taskType}-${shortTs}`;
};

export const extractRepoInfo = (fullName: string) => {
  const [owner, name] = fullName.split("/");
  return { owner, name };
};

export const formatDuration = (startTime: Date, endTime?: Date): string => {
  const end = endTime || new Date();
  const duration = end.getTime() - startTime.getTime();

  if (duration < 1000) {
    return `${duration}ms`;
  }

  if (duration < 60000) {
    return `${Math.round(duration / 1000)}s`;
  }

  return `${Math.round(duration / 60000)}m`;
};

export const getIssueStatus = async (owner: string, repo: string, issueNumber: number): Promise<string> => {
  const octokit = new Octokit();
  try {
    const { data } = await octokit.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });
    return data.state; // 'open' or 'closed'
  } catch (error) {
    console.error('Error fetching issue status:', error);
    throw error;
  }
};
