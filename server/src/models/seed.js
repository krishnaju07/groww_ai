import { DEFAULT_USER_ID, DEFAULT_RISK_CONFIG, DEFAULT_STARTING_CAPITAL } from '../config/constants.js';
import { User } from './User.js';
import { UserSettings } from './UserSettings.js';
import { RiskConfig } from './RiskConfig.js';

/** Idempotent: creates the single seeded user + default settings/risk config if absent. */
export async function ensureSeedData() {
  const user = await User.findByIdAndUpdate(
    DEFAULT_USER_ID,
    {
      $setOnInsert: {
        _id: DEFAULT_USER_ID,
        name: 'Trader',
        startingCapital: DEFAULT_STARTING_CAPITAL,
        availableCapital: DEFAULT_STARTING_CAPITAL,
      },
    },
    { upsert: true, new: true },
  );

  await UserSettings.findOneAndUpdate(
    { userId: DEFAULT_USER_ID },
    { $setOnInsert: { userId: DEFAULT_USER_ID } },
    { upsert: true },
  );

  await RiskConfig.findOneAndUpdate(
    { userId: DEFAULT_USER_ID },
    { $setOnInsert: { userId: DEFAULT_USER_ID, ...DEFAULT_RISK_CONFIG } },
    { upsert: true },
  );

  console.log(`[seed] ensured default user + settings + risk config (userId=${DEFAULT_USER_ID})`);
  return user;
}
