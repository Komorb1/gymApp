import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 6;

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, "Password is too short");

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export const memberSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  middle_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  id_number: z
    .string()
    .regex(/^(?:\d{15})?$/, "ID number must contain exactly 15 digits")
    .optional()
    .nullable(),
  phone: z.string().min(1, "Phone number is required"),
  email: z
    .string()
    .email("Invalid email")
    .optional()
    .nullable()
    .or(z.literal("")),
  birth_date: z
    .string()
    .refine(
      (value) => !value || value <= new Date().toISOString().slice(0, 10),
      "Birth date cannot be in the future",
    )
    .optional()
    .nullable(),
  notes: z.string().optional().nullable(),
});

export type MemberFormData = z.infer<typeof memberSchema>;

export const planSchema = z.object({
  name: z.string().min(1, "Plan name is required"),
  duration_days: z.number().int().min(1, "Duration must be at least 1 day"),
  price_cents: z.number().min(0, "Price must be positive"),
});

export type PlanFormData = z.infer<typeof planSchema>;
