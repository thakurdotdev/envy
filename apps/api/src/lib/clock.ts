/** Where the API gets the current time, so tests can control it. */
export type Clock = {
  now(): Date;
};

export const systemClock: Clock = {
  now: () => new Date(),
};
