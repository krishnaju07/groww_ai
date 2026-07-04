import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    _id: { type: String },
    name: { type: String, default: 'Trader' },
    startingCapital: { type: Number, required: true },
    availableCapital: { type: Number, required: true },
  },
  { timestamps: true },
);

export const User = mongoose.models.User || mongoose.model('User', UserSchema);
