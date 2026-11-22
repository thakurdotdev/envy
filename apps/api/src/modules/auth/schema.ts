import { t } from "elysia";

export const DevicePollBody = t.Object({
  deviceCode: t.String({ minLength: 1, maxLength: 200 }),
  /** Shown in the list of signed-in devices, for example "laptop (macOS)". */
  deviceName: t.String({ minLength: 1, maxLength: 100 }),
});

export const WebCallbackQuery = t.Object({
  code: t.Optional(t.String({ maxLength: 200 })),
  state: t.Optional(t.String({ maxLength: 200 })),
  error: t.Optional(t.String({ maxLength: 200 })),
});

export const RefreshBody = t.Optional(
  t.Object({
    /** The CLI sends the token here. The web sends it as a cookie instead. */
    refreshToken: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
  }),
);

export const SessionIdParams = t.Object({
  id: t.String({ format: "uuid" }),
});
