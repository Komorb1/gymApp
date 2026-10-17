import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 6;

export const PHONE_PREFIX = "+9715";
export const PHONE_DIGIT_COUNT = 8;

const PHONE_DIGITS_PATTERN = new RegExp(`^\\d{${PHONE_DIGIT_COUNT}}$`);
const PHONE_FULL_PATTERN = new RegExp(`^\\+9715\\d{${PHONE_DIGIT_COUNT}}$`);

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, "Password is too short");

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function phoneDigits(value: string): string {
  return digitsOnly(value).slice(0, PHONE_DIGIT_COUNT);
}

export function fullPhoneNumber(digits: string): string {
  return `${PHONE_PREFIX}${digits}`;
}

export function isUaeMobileNumber(phone: string): boolean {
  return PHONE_FULL_PATTERN.test(phone.trim());
}

export function storedPhoneDigits(phone: string): string | null {
  const match = /^\+9715(\d{8})$/.exec(phone.trim());
  return match ? match[1] : null;
}

export function memberSchema(requirePhone = true) {
  return z.object({
    first_name: z.string().min(1, "First name is required"),
    middle_name: z.string().optional().nullable(),
    last_name: z.string().optional().nullable(),
    id_number: z
      .string()
      .regex(/^(?:\d{15})?$/, "ID number must contain exactly 15 digits")
      .optional()
      .nullable(),
    phone: requirePhone
      ? z
          .string()
          .regex(
            PHONE_DIGITS_PATTERN,
            "Phone number must be 8 digits after +9715",
          )
      : z
          .string()
          .regex(
            new RegExp(`^(?:\\d{${PHONE_DIGIT_COUNT}})?$`),
            "Phone number must be 8 digits after +9715",
          ),
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
}

export type MemberFormData = z.infer<ReturnType<typeof memberSchema>>;

export const planSchema = z.object({
  name: z.string().min(1, "Plan name is required"),
  duration_days: z.number().int().min(1, "Duration must be at least 1 day"),
  price_cents: z.number().min(0, "Price must be positive"),
});

export type PlanFormData = z.infer<typeof planSchema>;
