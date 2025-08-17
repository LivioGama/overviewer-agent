import { z } from "zod";

export const AccountType = z.enum(["Organization", "User"]);

export const InstallationSchema = z.object({
  id: z.number().int().positive(),
  accountId: z.number().int().positive(),
  accountLogin: z.string().min(1),
  accountType: AccountType,
  permissions: z.record(z.any()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const InstallationCreateSchema = InstallationSchema.omit({
  createdAt: true,
  updatedAt: true,
});

export const InstallationUpdateSchema = InstallationSchema.partial().extend({
  id: z.number().int().positive(),
});

export type Installation = z.infer<typeof InstallationSchema>;
export type InstallationCreate = z.infer<typeof InstallationCreateSchema>;
export type InstallationUpdate = z.infer<typeof InstallationUpdateSchema>;
export type AccountTypeType = z.infer<typeof AccountType>;
