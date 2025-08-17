import { z } from "zod";

export const WebhookEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  payload: z.record(z.any()),
  signature: z.string(),
});

export const CommentEventSchema = z.object({
  action: z.enum(["created", "edited", "deleted"]),
  issue: z.object({
    number: z.number(),
    title: z.string(),
    body: z.string().nullable(),
    user: z.object({
      login: z.string(),
      id: z.number(),
    }),
    pull_request: z
      .object({
        url: z.string(),
      })
      .optional(),
  }),
  comment: z.object({
    id: z.number(),
    body: z.string(),
    user: z.object({
      login: z.string(),
      id: z.number(),
    }),
    created_at: z.string(),
    updated_at: z.string(),
  }),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
    owner: z.object({
      login: z.string(),
      id: z.number(),
    }),
  }),
  installation: z.object({
    id: z.number(),
  }),
});

export const PullRequestEventSchema = z.object({
  action: z.enum(["opened", "closed", "reopened", "edited", "synchronize"]),
  number: z.number(),
  pull_request: z.object({
    id: z.number(),
    number: z.number(),
    title: z.string(),
    body: z.string().nullable(),
    user: z.object({
      login: z.string(),
      id: z.number(),
    }),
    head: z.object({
      ref: z.string(),
      sha: z.string(),
    }),
    base: z.object({
      ref: z.string(),
      sha: z.string(),
    }),
  }),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
    owner: z.object({
      login: z.string(),
      id: z.number(),
    }),
  }),
  installation: z.object({
    id: z.number(),
  }),
});

export const PushEventSchema = z.object({
  ref: z.string(),
  before: z.string(),
  after: z.string(),
  commits: z.array(
    z.object({
      id: z.string(),
      message: z.string(),
      author: z.object({
        name: z.string(),
        email: z.string(),
      }),
    }),
  ),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
    owner: z.object({
      login: z.string(),
      id: z.number(),
    }),
  }),
  installation: z.object({
    id: z.number(),
  }),
});

export const IssueEventSchema = z.object({
  action: z.enum([
    "opened",
    "closed",
    "edited",
    "labeled",
    "unlabeled",
    "assigned",
    "unassigned",
  ]),
  issue: z.object({
    id: z.number(),
    number: z.number(),
    title: z.string(),
    body: z.string().nullable(),
    state: z.enum(["open", "closed"]),
    user: z.object({
      login: z.string(),
      id: z.number(),
      type: z.string(),
    }),
    labels: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        color: z.string(),
      }),
    ),
    assignees: z.array(
      z.object({
        login: z.string(),
        id: z.number(),
      }),
    ),
    created_at: z.string(),
    updated_at: z.string(),
  }),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
    owner: z.object({
      login: z.string(),
      id: z.number(),
    }),
  }),
  installation: z.object({
    id: z.number(),
  }),
});

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;
export type CommentEvent = z.infer<typeof CommentEventSchema>;
export type PullRequestEvent = z.infer<typeof PullRequestEventSchema>;
export type PushEvent = z.infer<typeof PushEventSchema>;
export type IssueEvent = z.infer<typeof IssueEventSchema>;
