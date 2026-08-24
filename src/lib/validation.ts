import { z } from "zod";

export const memberSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  phone: z.string().optional().nullable(),
  email: z
    .string()
    .email("Invalid email")
    .optional()
    .nullable()
    .or(z.literal("")),
  gender: z.enum(["male", "female"]).optional().nullable(),
  birth_date: z.string().optional().nullable(),
});

export type MemberFormData = z.infer<typeof memberSchema>;

export const planSchema = z.object({
  name: z.string().min(1, "Plan name is required"),
  duration_days: z.number().int().min(1, "Duration must be at least 1 day"),
  price_cents: z.number().min(0, "Price must be positive"),
});

export type PlanFormData = z.infer<typeof planSchema>;
