import * as mongoose from "mongoose";

export type WalletModel = mongoose.Document & {
  userId: number,
  label: string,
  address: string,
  balance: number,
  symbol: string,
  disabled: boolean,
};

const WalletSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  label: String,
  address: String,
  balance: Number,
  symbol: String,
  disabled: Boolean,
}, { timestamps: true });

export const Wallet = mongoose.model<WalletModel>("Wallet", WalletSchema);
