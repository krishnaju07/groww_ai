import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * User account holding the paper-trading wallet.
 * Single demo user in this app (see DEFAULT_USER / DEFAULT_USER_ID).
 */
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    cashBalance: { type: Number, required: true },
    initialCapital: { type: Number, required: true },
    realizedPnl: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const User = model('User', userSchema);

export default User;
