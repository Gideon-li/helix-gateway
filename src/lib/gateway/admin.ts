/** Server-only admin mailbox and mail credentials. Do not import from client modules. */
export const ADMIN_EMAIL = "524347725@qq.com";
export const ADMIN_NAME = "Haopeng Li";
export const ADMIN_PASSWORD = "Helix#524347725";
export const LEGACY_ADMIN_EMAILS = ["haopeng@helix.dev"] as const;

export const SMTP_HOST = "smtp.qq.com";
export const SMTP_PORT = 465;
export const SMTP_USER = ADMIN_EMAIL;
export const SMTP_AUTH_CODE = "pfvwsbznxxijeadg";

export const IMAP_HOST = "imap.qq.com";
export const IMAP_PORT = 993;

export const STAFF_SEED = [
  {
    email: "divination558@foxmail.com",
    password: "destiny1986",
    name: "Divination",
    role: "admin" as const,
  },
];

export const PRIVILEGED_MAILBOXES = [
  ADMIN_EMAIL.toLowerCase(),
  ...STAFF_SEED.map((row) => row.email.toLowerCase()),
];

export function isPrivilegedMailbox(email: string): boolean {
  return PRIVILEGED_MAILBOXES.includes(email.trim().toLowerCase());
}
